import Capacitor
import Foundation
import WebRTC
import FirebaseFirestore

// Native WebRTC + CallKit audio session coordination for iOS.
//
// WKWebView's built-in getUserMedia/RTCPeerConnection is architecturally
// incompatible with CallKit's audio session (confirmed by Apple DTS —
// https://developer.apple.com/forums/thread/767949): the WebView's media
// renderer runs out-of-process with its own audio session, which CallKit's
// session activation doesn't coordinate with. Answering a call while the
// device is locked/backgrounded silently hangs as a result.
//
// This plugin replaces the JS-side WebRTC call path with a native
// RTCPeerConnection (stasel/WebRTC) driven directly from AppDelegate's
// CXProviderDelegate callbacks, using RTCAudioSession's manual-audio mode so
// audio activation is explicitly synchronized with CallKit instead of left
// to WebKit's own (incompatible) session handling.
@objc(NativeWebRTCPlugin)
public class NativeWebRTCPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeWebRTCPlugin"
    public let jsName = "NativeWebRTCPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "ping", returnType: CAPPluginReturnPromise)
    ]

    // Scaffold-only for now — validates the SPM dependency chain (WebRTC +
    // FirebaseFirestore) resolves and links before the real call logic is added.
    @objc func ping(_ call: CAPPluginCall) {
        let factory = RTCPeerConnectionFactory()
        _ = factory
        call.resolve(["ok": true])
    }
}
