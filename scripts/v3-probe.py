#!/usr/bin/env python3
"""Serve external signed fixtures and independently check real consumer observations."""
import argparse
import gzip
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
from pathlib import Path
import re
import threading
import time
from urllib.parse import urlsplit
import uuid


def digest(value):
    return hashlib.sha256(value).hexdigest()


def load_fixture(directory, case_name, pins):
    directory = Path(directory).resolve()
    manifest_bytes = (directory / 'manifest.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    for platform, key in [('ios', 'nativeIOSRevision'), ('android', 'nativeAndroidRevision')]:
        if manifest[key] != pins[platform]['revision']:
            raise ValueError('Signed fixture native source differs from NATIVE-PINS.json')
    selected = next(row for row in manifest['cases'] if row['name'] == case_name)
    data = (directory / selected['file']).read_bytes()
    if digest(data) != selected['sha256']:
        raise ValueError('Signed fixture bytes differ from the independent manifest')
    return manifest, selected, data, digest(manifest_bytes)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def typed_equal(actual, expected):
    if type(expected) is bool:
        return type(actual) is bool and actual == expected
    if type(expected) in (int, float):
        return is_json_number(actual) and actual == expected
    if isinstance(expected, dict):
        return (isinstance(actual, dict) and actual.keys() == expected.keys()
                and all(typed_equal(actual[key], value) for key, value in expected.items()))
    if isinstance(expected, list):
        return (isinstance(actual, list) and len(actual) == len(expected)
                and all(typed_equal(left, right) for left, right in zip(actual, expected)))
    return type(actual) is type(expected) and actual == expected


def is_json_number(value):
    return type(value) is int or (type(value) is float and math.isfinite(value))


def terminal_authentication_failure(native_log, platform):
    """Match actual native terminal log sites without exposing their redacted error descriptions."""
    if platform == 'ios':
        # The native logger preserves the concrete error category at these profile failure sites.
        pattern = (r'\[Nuxie\] (?:\[WARNING\] \[NuxieSDK\.swift:\d+\] Profile fetch failed|'
                   r'\[DEBUG\] \[UserTransitionCoordinator\.swift:\d+\] Identity profile refresh failed|'
                   r'\[DEBUG\] \[ProfileService\.swift:\d+\] Profile refresh failed): '
                   r'<redacted:error=JourneyReleaseAuthenticationError hmac-sha256:[0-9a-f]{16}>')
        category = 'JourneyReleaseAuthenticationError'
    elif platform == 'android':
        # ProfileService rejection + concrete authenticated-release exception survives default stack redaction.
        pattern = (r'Journey plane profile rejected '
                   r'error=ai\.nuxie\.sdk\.experiences\.JourneyReleaseAuthenticationException '
                   r'<redacted hmac-sha256:[0-9a-f]{16}>')
        category = 'ai.nuxie.sdk.experiences.JourneyReleaseAuthenticationException'
    else:
        raise ValueError('Unsupported native log platform')
    match = re.search(pattern, native_log)
    require(match is not None, 'Missing actual terminal native authentication failure category')
    return {'category': category, 'scope': 'terminal-authentication-error-category-only',
            'matchedLogSha256': digest(match.group(0).encode())}


def verify(ledger, native_log, manifest):
    """A native error is mandatory for rejection; successful HTTP delivery alone is insufficient."""
    case = next(row for row in manifest['cases'] if row['name'] == ledger['caseName'])
    observations = ledger['observations']
    require(len(observations) == 1, 'Expected exactly one real consumer observation')
    observed = observations[0]
    require(observed['failure'] is None, 'Consumer probe failed: ' + str(observed['failure']))
    for field in ['caseName', 'consumer', 'platform', 'customerId']:
        require(observed[field] == ledger[field], 'Consumer identity mismatch: ' + field)
    require(isinstance(observed['nativeVersion'], str) and bool(observed['nativeVersion']),
            'Native version was not received through the wrapper')
    require('native-event-transport-completed' in observed['checkpoints'],
            'Consumer did not observe the native transport barrier')
    require('native-shutdown-completed' in observed['checkpoints'],
            'Consumer native teardown did not complete')
    delivered = [row for row in ledger['requests'] if row['path'] == '/profile' and row['status'] == 200]
    require(len(delivered) >= 2, 'Configure and identify profiles were not both delivered')
    require(any(row['body'].get('distinct_id') == ledger['customerId'] for row in delivered),
            'Identified customer never consumed a signed profile')
    require(all(row['responseSha256'] == case['sha256'] for row in delivered),
            'Native consumer received different profile bytes')
    events = [row for row in ledger['events'] if row.get('distinct_id') == ledger['customerId']]
    controls = [row for row in events if row.get('event') == 'wrapper_v3_transport_probe']
    indexes = [row.get('properties', {}).get('probeIndex') for row in controls]
    require(len(indexes) == 45
            and all(is_json_number(index) and index == int(index) for index in indexes)
            and set(indexes) == set(range(45)),
            'Independent native ingest did not receive all 45 distinct transport controls')
    require(any(row.get('event') == manifest['trigger']
                and all(typed_equal(row.get('properties', {}).get(key), value)
                        for key, value in manifest['triggerProperties'].items()) for row in events),
            'Actual native ingest did not receive exact typed trigger properties')
    journeys = [row for row in observed['activities'] if row['name'] in manifest['expectedActivities']]
    native_journeys = [row for row in events if row.get('event', '').startswith('$journey_leg_')]
    rejection = None
    if case['verdict'] == 'accepted':
        require(observed['finalFeatureState'] == 'ready', 'Accepted profile did not publish native ready state')
        require([row['name'] for row in journeys] == manifest['expectedActivities'],
                'Actual wrapper Journey activities have wrong ordering/count')
        expected = manifest['expectedProperties']
        for row in journeys:
            for field in ['experience_id', 'experience_version', 'leg_id', 'leg_generation']:
                require(row['properties'].get(field) == expected[field], 'Wrong activity property: ' + field)
            require(is_json_number(row['properties']['leg_generation'])
                    and row['properties']['leg_generation'] == int(row['properties']['leg_generation']),
                    'Generation must remain an integer-valued JSON number')
        journey_id = journeys[0]['properties'].get('journey_id')
        uuid.UUID(journey_id)
        require(journeys[1]['properties'].get('journey_id') == journey_id, 'Journey UUID changed between activities')
        require(journeys[1]['properties'].get('outcome') == expected['outcome'], 'Wrong Journey outcome')
        require([row['event'] for row in native_journeys] == ['$journey_leg_started', '$journey_leg_completed'],
                'Actual native Journey ingest has wrong ordering/count')
        for row in native_journeys:
            for field in ['experience_id', 'experience_version', 'leg_id', 'leg_generation']:
                # Both native reporters use the version ID wire key; curated activities use the public alias.
                native_field = 'experience_version_id' if field == 'experience_version' else field
                require(typed_equal(row['properties'].get(native_field), expected[field]),
                        'Wrong native ingest property: ' + native_field)
            require(row['properties'].get('journey_id') == journey_id, 'Native ingest Journey identity differs')
        completed = [row for row in native_journeys if row['event'] == '$journey_leg_completed']
        require(len(completed) == 1, 'Expected one real native completion ingest')
        require(typed_equal(completed[0]['properties'].get('outputs'), manifest['expectedOutputs']),
                'Native completion outputs differ from independently authored typed event projection')
        require(completed[0]['properties'].get('journey_id') == journey_id, 'Ingest/curated Journey identity differs')
        require(completed[0]['properties'].get('outcome') == expected['outcome'], 'Wrong native completion outcome')
    else:
        rejection = terminal_authentication_failure(native_log, ledger['platform'])
        require(observed['finalFeatureState'] == 'unknown', 'Rejected profile incorrectly published ready state')
        require(not journeys and not native_journeys, 'Rejected profile admitted a Journey')
    return {'caseName': ledger['caseName'], 'consumer': ledger['consumer'], 'platform': ledger['platform'],
            'customerId': ledger['customerId'], 'status': 'PASS', 'profileSha256': case['sha256'],
            'nativeVersion': observed['nativeVersion'], 'nativeControlEvents': len(controls),
            'actualWrapperJourneyActivities': len(journeys), 'actualNativeJourneyEvents': len(native_journeys),
            'expectedFixtureContractCode': case['reason'], 'observedNativeRejection': rejection,
            'screenOrFormEditingQualified': False}


def serve(args):
    pins = json.loads((Path(__file__).resolve().parent.parent / 'NATIVE-PINS.json').read_text())
    manifest, case, profile, manifest_sha = load_fixture(args.fixtures, args.case, pins)
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    nonce = uuid.uuid4().hex
    api_key = 'pk_test_wrapper_v3_' + nonce
    customer = 'wrapper-v3-' + args.consumer + '-' + args.platform + '-' + args.case + '-' + nonce
    ledger = {'caseName': args.case, 'consumer': args.consumer, 'platform': args.platform,
              'customerId': customer, 'fixtureManifestSha256': manifest_sha,
              'nativePins': pins, 'requests': [], 'events': [], 'observations': []}
    lock = threading.Lock()

    def save():
        temporary = output / 'server-ledger.tmp'
        temporary.write_text(json.dumps(ledger, indent=2) + '\n')
        temporary.replace(output / 'server-ledger.json')

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *unused):
            pass

        def answer(self, status, data, headers=None):
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            for key, value in (headers or {}).items():
                self.send_header(key, value)
            self.end_headers()
            self.wfile.write(data)

        def json_answer(self, status, data):
            self.answer(status, json.dumps(data).encode())

        def do_GET(self):
            path = urlsplit(self.path).path
            with lock:
                if path == '/probe':
                    self.json_answer(200, {'caseName': args.case, 'consumer': args.consumer,
                        'platform': args.platform, 'customerId': customer,
                        'apiKeys': {'ios': api_key, 'android': api_key}, 'event': manifest['trigger'],
                        'triggerProperties': manifest['triggerProperties'], 'accepted': case['verdict'] == 'accepted'})
                elif path == '/status':
                    profiles = [row for row in ledger['requests'] if row['path'] == '/profile' and row['status'] == 200]
                    indexes = sorted({row.get('properties', {}).get('probeIndex') for row in ledger['events']
                        if row.get('distinct_id') == customer and row.get('event') == 'wrapper_v3_transport_probe'})
                    self.json_answer(200, {'profileCount': len(profiles),
                        'identifiedProfileCount': sum(row['body'].get('distinct_id') == customer for row in profiles),
                        'controlIndexes': indexes})
                else:
                    self.json_answer(404, {'error': 'unknown probe route'})

        def do_POST(self):
            path = urlsplit(self.path).path
            raw = self.rfile.read(int(self.headers.get('Content-Length', '0')))
            if self.headers.get('Content-Encoding') == 'gzip':
                raw = gzip.decompress(raw)
            body = json.loads(raw)
            with lock:
                row = {'path': path, 'body': body, 'requestSha256': digest(raw), 'receivedAtNs': time.time_ns()}
                if path == '/profile' and body.get('apiKey') == api_key:
                    headers = dict(manifest['authorityHeaders'], ETag='"' + digest(profile) + '"')
                    self.answer(200, profile, headers)
                    row.update(status=200, responseSha256=digest(profile), responseHeaders=headers)
                elif path in ['/event', '/batch'] and body.get('apiKey') == api_key:
                    events = body.get('batch', []) if path == '/batch' else [body]
                    ledger['events'].extend(events)
                    self.json_answer(200, {'status': 'ok', 'processed': len(events), 'failed': 0, 'total': len(events)})
                    row.update(status=200)
                elif path == '/observations':
                    ledger['observations'].append(body)
                    self.json_answer(200, {'status': 'retained'})
                    row.update(status=200)
                else:
                    self.json_answer(401, {'error': 'unknown route or probe API key'})
                    row.update(status=401)
                row['responseCompletedAtNs'] = time.time_ns()
                ledger['requests'].append(row)
                save()

    class Server(ThreadingHTTPServer):
        allow_reuse_address = True

    server = Server((args.host, args.port), Handler)
    with lock:
        ledger['endpoint'] = 'http://' + args.host + ':' + str(server.server_port)
        save()
        (output / 'endpoint.txt').write_text(ledger['endpoint'] + '\n')
    print(ledger['endpoint'], flush=True)
    server.serve_forever()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    server = sub.add_parser('serve')
    server.add_argument('--fixtures', required=True)
    server.add_argument('--case', choices=['accepted', 'retired-v1', 'retired-v2', 'wrong-domain'], required=True)
    server.add_argument('--consumer', required=True)
    server.add_argument('--platform', choices=['ios', 'android'], required=True)
    server.add_argument('--output', required=True)
    server.add_argument('--host', default='127.0.0.1')
    server.add_argument('--port', type=int, default=0)
    check = sub.add_parser('verify')
    check.add_argument('--fixtures', required=True)
    check.add_argument('--ledger', required=True)
    check.add_argument('--native-log', required=True)
    check.add_argument('--output', required=True)
    args = parser.parse_args()
    if args.command == 'serve':
        serve(args)
    else:
        ledger_bytes = Path(args.ledger).read_bytes()
        log_bytes = Path(args.native_log).read_bytes()
        ledger = json.loads(ledger_bytes)
        manifest, _, _, manifest_sha = load_fixture(args.fixtures, ledger['caseName'], ledger['nativePins'])
        require(manifest_sha == ledger['fixtureManifestSha256'], 'Fixture manifest changed since native delivery')
        verdict = verify(ledger, log_bytes.decode(errors='replace'), manifest)
        verdict.update(ledgerSha256=digest(ledger_bytes), nativeLogSha256=digest(log_bytes))
        Path(args.output).write_text(json.dumps(verdict, indent=2) + '\n')
        print(json.dumps(verdict))


if __name__ == '__main__':
    main()
