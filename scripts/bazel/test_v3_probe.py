import copy
import importlib.util
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.request import Request, urlopen

SPEC = importlib.util.spec_from_file_location('v3_probe', Path(__file__).resolve().parents[1] / 'v3-probe.py')
PROBE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROBE)
FIXTURES = Path(__file__).resolve().parent / 'fixtures'
WIRE_BYTES = (FIXTURES / 'native-batch-item-encoding.json').read_bytes()
WIRE_ORACLE = json.loads(WIRE_BYTES)['vectors'][0]['expect']

EXPECTED = {'experience_id': 'experience-oracle', 'experience_version': 'version-oracle',
            'leg_id': 'a' * 64, 'leg_generation': 0, 'outcome': 'continue'}
VALUES = {'probeNumber': 42, 'probeText': 'native-v3-wrapper', 'probeBoolean': True}
OUTPUTS = {'event': VALUES, 'responses': {}}
MANIFEST = {'cases': [
    {'name': 'accepted', 'sha256': 'accepted-digest', 'verdict': 'accepted', 'reason': None},
    {'name': 'rejected', 'sha256': 'rejected-digest', 'verdict': 'rejected',
     'reason': 'journey_release.signature.bad_signature'}],
    'trigger': 'wrapper_v3_probe', 'triggerProperties': VALUES,
    'expectedActivities': ['journey_started', 'journey_completed'],
    'expectedProperties': EXPECTED, 'expectedOutputs': OUTPUTS}
IOS_REJECTION = ('[Nuxie] [DEBUG] [UserTransitionCoordinator.swift:127] Identity profile refresh failed: '
                 '<redacted:error=JourneyReleaseAuthenticationError hmac-sha256:0123456789abcdef>')
ANDROID_REJECTION = ('Journey plane profile rejected '
                     'error=ai.nuxie.sdk.experiences.JourneyReleaseAuthenticationException '
                     '<redacted hmac-sha256:0123456789abcdef>')


def ledger(accepted):
    selected = MANIFEST['cases'][0 if accepted else 1]
    journey_id = '10101010-1111-2222-3333-444444444444'
    started = {key: value for key, value in EXPECTED.items() if key != 'outcome'}
    started['journey_id'] = journey_id
    native_started = {key: value for key, value in started.items() if key != 'experience_version'}
    native_started['experience_version_id'] = EXPECTED['experience_version']
    events = [{'event': 'wrapper_v3_transport_probe', 'distinct_id': 'customer',
               'properties': {'probeIndex': index}} for index in range(45)]
    events.append({'event': 'wrapper_v3_probe', 'distinct_id': 'customer',
                   'properties': dict(VALUES, **{'$anon_distinct_id': 'anonymous'})})
    if accepted:
        events.extend([
            {'event': '$journey_leg_started', 'distinct_id': 'customer', 'properties': native_started},
            {'event': '$journey_leg_completed', 'distinct_id': 'customer',
             'properties': dict(native_started, outcome='continue', outputs=copy.deepcopy(OUTPUTS))}])
    return {'caseName': selected['name'], 'consumer': 'test-consumer', 'platform': 'ios',
            'customerId': 'customer', 'requests': [
                {'path': '/profile', 'status': 200, 'body': {'distinct_id': user},
                 'responseSha256': selected['sha256']} for user in ['anonymous', 'customer']],
            'events': events, 'observations': [
                {'caseName': selected['name'], 'consumer': 'test-consumer', 'platform': 'ios',
                 'customerId': 'customer', 'failure': None, 'nativeVersion': 'native-version',
                 'checkpoints': ['native-event-transport-completed', 'native-shutdown-completed'],
                 'finalFeatureState': 'ready' if accepted else 'unknown',
                 'activities': [{'name': 'journey_started', 'properties': started},
                                {'name': 'journey_completed', 'properties': dict(started, outcome='continue')}]
                               if accepted else []}]}


class ConsumerVerdictTests(unittest.TestCase):
    def test_real_observation_shape_accepts_ordered_identity_and_exact_outputs(self):
        result = PROBE.verify(ledger(True), '', MANIFEST)
        self.assertEqual(result['actualWrapperJourneyActivities'], 2)
        self.assertEqual(result['nativeControlEvents'], 45)
        self.assertFalse(result['screenOrFormEditingQualified'])

    def test_json_number_semantics_accept_integral_floating_representations(self):
        value = ledger(True)
        for event in value['events'][:45]:
            event['properties']['probeIndex'] = float(event['properties']['probeIndex'])
        value['events'][45]['properties']['probeNumber'] = 42.0
        value['events'][-1]['properties']['outputs']['event']['probeNumber'] = 42.0
        result = PROBE.verify(value, '', MANIFEST)
        self.assertEqual(result['nativeControlEvents'], 45)

    def test_rejection_requires_authentication_failure_after_successful_transport(self):
        value = ledger(False)
        with self.assertRaisesRegex(ValueError, 'Missing actual terminal native'):
            PROBE.verify(value, 'Profile HTTP 200; no events', MANIFEST)
        result = PROBE.verify(value, IOS_REJECTION, MANIFEST)
        self.assertEqual(result['actualWrapperJourneyActivities'], 0)
        self.assertEqual(result['expectedFixtureContractCode'], 'journey_release.signature.bad_signature')
        self.assertEqual(result['observedNativeRejection']['category'], 'JourneyReleaseAuthenticationError')

    def test_rejection_requires_platform_terminal_site_and_exact_authentication_category(self):
        value = ledger(False)
        for log in ['journey_release.signature.bad_signature', 'JourneyReleaseAuthenticationError',
                    IOS_REJECTION.replace('JourneyReleaseAuthenticationError', 'NuxieNetworkError'),
                    IOS_REJECTION.replace('Identity profile refresh failed', 'Unrelated cache cleanup failed'),
                    ANDROID_REJECTION]:
            with self.subTest(log=log), self.assertRaises(ValueError):
                PROBE.verify(value, log, MANIFEST)
        value['platform'] = value['observations'][0]['platform'] = 'android'
        result = PROBE.verify(value, ANDROID_REJECTION, MANIFEST)
        self.assertEqual(result['observedNativeRejection']['category'],
                         'ai.nuxie.sdk.experiences.JourneyReleaseAuthenticationException')
        with self.assertRaises(ValueError):
            PROBE.verify(value, ANDROID_REJECTION.replace('JourneyReleaseAuthenticationException', 'IOException'), MANIFEST)

    def test_independent_negative_controls_cannot_be_reported_as_pass(self):
        mutations = [
            lambda value: value['observations'].clear(),
            lambda value: value['observations'][0].update(failure='native call failed'),
            lambda value: value['observations'][0].update(customerId='other-customer'),
            lambda value: value['observations'][0].update(nativeVersion=None),
            lambda value: value['observations'][0]['checkpoints'].clear(),
            lambda value: value['observations'][0]['checkpoints'].remove('native-shutdown-completed'),
            lambda value: value['requests'][1]['body'].update(distinct_id='other-customer'),
            lambda value: value['requests'][0].update(responseSha256='wrong-product'),
            lambda value: value['events'].pop(0),
            lambda value: value['events'][0]['properties'].update(probeIndex=True),
            lambda value: value['events'][0]['properties'].update(probeIndex=.25),
            lambda value: value['events'][45]['properties'].update(probeNumber=43),
            lambda value: value['events'][45]['properties'].update(probeNumber=True),
            lambda value: value['observations'][0].update(finalFeatureState='unknown'),
            lambda value: value['observations'][0]['activities'].reverse(),
            lambda value: value['observations'][0]['activities'][0]['properties'].update(leg_id='wrong-leg'),
            lambda value: value['observations'][0]['activities'][1]['properties'].update(journey_id='other-run'),
            lambda value: value['observations'][0]['activities'][1]['properties'].update(outcome='dismissed'),
            lambda value: value['events'][-1]['properties'].update(outputs={'event': {}, 'responses': {}}),
            lambda value: value['events'][-1]['properties']['outputs']['event'].update(probeBoolean=1),
            lambda value: value['events'][-1]['properties'].update(outcome='dismissed'),
            lambda value: value['events'][-1]['properties'].update(leg_generation=True),
            lambda value: value['events'][-1]['properties'].pop('experience_version_id'),
            lambda value: value['events'].append(copy.deepcopy(value['events'][-1])),
        ]
        for index, mutate in enumerate(mutations):
            with self.subTest(control=index):
                value = copy.deepcopy(ledger(True))
                mutate(value)
                with self.assertRaises((ValueError, AttributeError)):
                    PROBE.verify(value, '', MANIFEST)

    def test_curated_version_alias_cannot_satisfy_native_ingest_contract(self):
        value = ledger(True)
        for event in value['events'][-2:]:
            properties = event['properties']
            properties['experience_version'] = properties.pop('experience_version_id')
        with self.assertRaisesRegex(ValueError, 'Wrong native ingest property: experience_version_id'):
            PROBE.verify(value, '', MANIFEST)

    def test_native_wire_golden_reaches_real_server_and_identity_barrier(self):
        provenance = json.loads((FIXTURES / 'native-batch-item-provenance.json').read_text())
        self.assertEqual(hashlib.sha256(WIRE_BYTES).hexdigest(), provenance['sha256'])
        pins = json.loads((Path(__file__).resolve().parents[2] / 'NATIVE-PINS.json').read_text())
        self.assertEqual(pins['ios']['revision'], provenance['revision'])
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            fixtures = folder / 'fixtures'
            fixtures.mkdir()
            profile = b'{"schemaVersion":"nuxie.journey-plane-profile.v2"}'
            (fixtures / 'accepted.json').write_bytes(profile)
            manifest = dict(MANIFEST, nativeIOSRevision=pins['ios']['revision'],
                            nativeAndroidRevision=pins['android']['revision'],
                            authorityHeaders={'Nuxie-App-Id': 'oracle-app', 'Nuxie-App-Environment': 'test'},
                            cases=[dict(MANIFEST['cases'][0], file='accepted.json', sha256=PROBE.digest(profile))])
            (fixtures / 'manifest.json').write_text(json.dumps(manifest))
            evidence = folder / 'evidence'
            with (folder / 'server.log').open('wb') as log:
                process = subprocess.Popen([sys.executable, str(Path(__file__).resolve().parents[1] / 'v3-probe.py'),
                                            'serve', '--fixtures', str(fixtures), '--case', 'accepted',
                                            '--consumer', 'wire-oracle', '--platform', 'ios', '--output', str(evidence)],
                                           stdout=log, stderr=subprocess.STDOUT)
                try:
                    deadline = time.monotonic() + 5
                    while not (evidence / 'endpoint.txt').exists():
                        self.assertIsNone(process.poll(), (folder / 'server.log').read_text())
                        self.assertLess(time.monotonic(), deadline)
                        time.sleep(.01)
                    endpoint = (evidence / 'endpoint.txt').read_text().strip()
                    with urlopen(endpoint + '/probe') as response:
                        config = json.load(response)
                    def post(path, body):
                        return urlopen(Request(endpoint + path, json.dumps(body).encode(),
                                               headers={'Content-Type': 'application/json'}))
                    before_profile_ns = time.time_ns()
                    with post('/profile', {'apiKey': config['apiKeys']['ios'],
                                           'distinct_id': config['customerId'], 'version': 1}) as response:
                        self.assertEqual(response.read(), profile)
                        self.assertEqual(response.headers['ETag'], '"' + PROBE.digest(profile) + '"')
                        self.assertEqual(response.headers['Nuxie-App-Id'], 'oracle-app')
                    # The native fixture owns the wire identity/idempotency field names, not this server's implementation.
                    item = dict(WIRE_ORACLE, event='wrapper_v3_transport_probe',
                                distinct_id=config['customerId'], properties={'probeIndex': 0})
                    with post('/batch', {'apiKey': config['apiKeys']['ios'], 'batch': [item]}) as response:
                        self.assertEqual(json.load(response)['processed'], 1)
                    with urlopen(endpoint + '/status') as response:
                        status = json.load(response)
                    after_status_ns = time.time_ns()
                    self.assertEqual(status['identifiedProfileCount'], 1)
                    self.assertEqual(status['controlIndexes'], [0])
                    delivery = json.loads((evidence / 'server-ledger.json').read_text())
                    profile_response = next(row for row in delivery['requests'] if row['path'] == '/profile')
                    self.assertLessEqual(before_profile_ns, profile_response['receivedAtNs'])
                    self.assertLessEqual(profile_response['receivedAtNs'], profile_response['responseCompletedAtNs'])
                    self.assertLessEqual(profile_response['responseCompletedAtNs'], after_status_ns)
                    retained = delivery['events'][0]
                    self.assertEqual(retained['idempotency_key'], WIRE_ORACLE['idempotency_key'])
                    self.assertNotIn('distinctId', retained)
                finally:
                    process.terminate()
                    process.wait(timeout=5)

    def test_negative_profile_must_not_publish_ready_or_admit_a_journey(self):
        for mutate in [
            lambda value: value['observations'][0].update(finalFeatureState='ready'),
            lambda value: value['events'].append({'event': '$journey_leg_started', 'distinct_id': 'customer'}),
            lambda value: value['observations'][0]['activities'].append({'name': 'journey_started'}),
        ]:
            value = ledger(False)
            mutate(value)
            with self.assertRaises(ValueError):
                PROBE.verify(value, IOS_REJECTION, MANIFEST)


if __name__ == '__main__':
    unittest.main()
