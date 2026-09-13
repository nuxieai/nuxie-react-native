require 'json'
package = JSON.parse(File.read(File.join(__dir__, 'package.json')))
pins = JSON.parse(File.read(File.join(__dir__, 'NATIVE-PINS.json')))
Pod::Spec.new do |s|
  s.name = 'NuxieReactNative'
  s.version = package['version']
  s.summary = package['description']
  s.homepage = 'https://nuxie.io'
  s.license = 'MIT'
  s.author = 'Nuxie'
  s.platforms = { :ios => min_ios_version_supported }
  s.source = { :git => 'https://github.com/nuxieai/nuxie-react-native.git', :tag => s.version.to_s }
  s.source_files = 'ios/**/*.{h,m,mm,swift}'
  s.swift_version = '5.9'
  install_modules_dependencies(s)
  spm_dependency(s, url: pins['ios']['repository'],
    requirement: { kind: 'revision', revision: pins['ios']['revision'] }, products: ['Nuxie'])
end
