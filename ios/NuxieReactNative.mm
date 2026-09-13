#import "NuxieReactNative.h"
#import "NuxieReactNative-Swift.h"

@implementation NuxieReactNative {
  NuxieBridge *_nuxieBridge;
}
RCT_EXPORT_MODULE(Nuxie)
+ (BOOL)requiresMainQueueSetup { return NO; }
- (instancetype)init {
  if ((self = [super init])) {
    _nuxieBridge = [NuxieBridge new];
    __weak NuxieReactNative *weakSelf = self;
    _nuxieBridge.emit = ^(NSString *payload) { [weakSelf emitOnEvent:payload]; };
  }
  return self;
}
- (void)invalidate { [_nuxieBridge invalidate]; _nuxieBridge = nil; }
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeNuxieSpecJSI>(params);
}
- (void)configure:(NSString *)configuration resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [_nuxieBridge invoke:@"configure" arguments:@{@"configuration": configuration ?: [NSNull null]} resolve:resolve reject:reject];
}
- (void)shutdown:(NSString *)session resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [_nuxieBridge invoke:@"shutdown" arguments:@{@"session": session ?: [NSNull null]} resolve:resolve reject:reject];
}
- (void)identify:(NSString *)session customerId:(NSString *)customerId properties:(NSString *)properties resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [_nuxieBridge invoke:@"identify" arguments:@{@"session": session ?: [NSNull null], @"customerId": customerId ?: [NSNull null], @"properties": properties ?: [NSNull null]} resolve:resolve reject:reject];
}
- (void)reset:(NSString *)session keepAnonymousId:(BOOL)keepAnonymousId resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [_nuxieBridge invoke:@"reset" arguments:@{@"session": session ?: [NSNull null], @"keepAnonymousId": @(keepAnonymousId)} resolve:resolve reject:reject];
}
- (void)getIdentity:(NSString *)session resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [_nuxieBridge invoke:@"getIdentity" arguments:@{@"session": session ?: [NSNull null]} resolve:resolve reject:reject];
}
- (void)setLocaleIdentifier:(NSString *)session locale:(NSString *)locale resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [_nuxieBridge invoke:@"setLocaleIdentifier" arguments:@{@"session": session ?: [NSNull null], @"locale": locale ?: [NSNull null]} resolve:resolve reject:reject];
}
- (void)trigger:(NSString *)session event:(NSString *)event properties:(NSString *)properties resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [_nuxieBridge invoke:@"trigger" arguments:@{@"session": session ?: [NSNull null], @"event": event ?: [NSNull null], @"properties": properties ?: [NSNull null]} resolve:resolve reject:reject];
}
- (void)dismiss:(NSString *)session resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [_nuxieBridge invoke:@"dismiss" arguments:@{@"session": session ?: [NSNull null]} resolve:resolve reject:reject];
}
- (void)hasFeature:(NSString *)session featureId:(NSString *)featureId options:(NSString *)options resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [_nuxieBridge invoke:@"hasFeature" arguments:@{@"session": session ?: [NSNull null], @"featureId": featureId ?: [NSNull null], @"options": options ?: [NSNull null]} resolve:resolve reject:reject];
}
- (void)consumeFeature:(NSString *)session featureId:(NSString *)featureId options:(NSString *)options resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [_nuxieBridge invoke:@"consumeFeature" arguments:@{@"session": session ?: [NSNull null], @"featureId": featureId ?: [NSNull null], @"options": options ?: [NSNull null]} resolve:resolve reject:reject];
}
- (void)restorePurchases:(NSString *)session resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [_nuxieBridge invoke:@"restorePurchases" arguments:@{@"session": session ?: [NSNull null]} resolve:resolve reject:reject];
}
- (void)completePurchase:(NSString *)session requestId:(NSString *)requestId result:(NSString *)result resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [_nuxieBridge invoke:@"completePurchase" arguments:@{@"session": session ?: [NSNull null], @"requestId": requestId ?: [NSNull null], @"result": result ?: [NSNull null]} resolve:resolve reject:reject];
}
- (void)completeRestore:(NSString *)session requestId:(NSString *)requestId result:(NSString *)result resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [_nuxieBridge invoke:@"completeRestore" arguments:@{@"session": session ?: [NSNull null], @"requestId": requestId ?: [NSNull null], @"result": result ?: [NSNull null]} resolve:resolve reject:reject];
}
@end
