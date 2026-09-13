#!/usr/bin/env python3
"""Build the pinned Android SDK into a self-contained Maven repository for npm packing."""
import json
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent.parent
pin = json.loads((root / 'NATIVE-PINS.json').read_text())['android']
source = root / '.native/android'
source.parent.mkdir(exist_ok=True)
if not source.exists():
    subprocess.run(['git', 'clone', '--no-checkout', pin['repository'], str(source)], check=True)
else:
    status = subprocess.check_output(['git', 'status', '--porcelain'], cwd=source, text=True)
    if status.strip():
        raise SystemExit('Preserving modified native checkout: ' + str(source))
subprocess.run(['git', 'fetch', 'origin', pin['revision']], cwd=source, check=True)
subprocess.run(['git', 'checkout', '--detach', pin['revision']], cwd=source, check=True)
# Android Gradle Plugin owns variant dependencies and emits the POM from that component.
init = root / '.native/publish.gradle'
init.write_text('''allprojects { project ->
  if (project.name == 'nuxie-android') {
    project.pluginManager.withPlugin('com.android.library') {
      project.pluginManager.apply('maven-publish')
      project.android.publishing { singleVariant('release') }
      project.afterEvaluate {
        project.publishing {
          publications {
            nuxie(MavenPublication) {
              from project.components.release
              groupId = 'ai.nuxie'
              artifactId = 'nuxie-android'
              version = '0.2.0-''' + pin['revision'] + ''''
            }
          }
          repositories { maven { name = 'Npm'; url = uri(System.getenv('NUXIE_NPM_MAVEN')) } }
        }
      }
    }
  }
}
''')
env = dict(os.environ, NUXIE_NPM_MAVEN=str(root / 'android/maven'))
subprocess.run(['./gradlew', '-I', str(init), ':nuxie-android:publishNuxiePublicationToNpmRepository'], cwd=source, env=env, check=True)
import shutil
versions = root / 'android/maven/ai/nuxie/nuxie-android'
for previous in versions.iterdir():
    if previous.is_dir() and previous.name != '0.2.0-' + pin['revision']:
        shutil.rmtree(previous)
print('Pinned Android Maven artifact and transitive dependency metadata ready for packing.')
