require "json"

package = JSON.parse(File.read(File.join(__dir__, "..", "package.json")))

Pod::Spec.new do |s|
  s.name         = "NuxieExpo"
  s.version      = package["version"]
  s.summary      = "React Native bridge for the Nuxie iOS SDK"
  s.description  = "Expo-first native bridge for Nuxie iOS SDK."
  s.license      = package["license"]
  s.author       = "Nuxie"
  s.homepage     = "https://github.com/nuxieai/nuxie-react-native"
  s.platforms    = { :ios => "15.0" }
  s.source       = { :git => "https://github.com/nuxieai/nuxie-react-native.git", :tag => s.version.to_s }
  s.static_framework = true

  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.dependency "ExpoModulesCore"
  s.dependency "Nuxie"

  s.swift_version = "5.9"
end
