import Capacitor
import Foundation

// JS-facing surface for the native call engine. Deliberately tiny — the call
// itself (offer/answer/ICE/audio) runs entirely in CallEngine, driven by
// AppDelegate's CXProviderDelegate callbacks, with no JS involvement at all.
// The only thing JS needs to hand over is a fresh Firebase ID token, since
// FirestoreClient talks to Firestore's REST API directly (see that file for
// why) instead of going through the native Firebase SDK.
@objc(NativeWebRTCPlugin)
public class NativeWebRTCPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeWebRTCPlugin"
    public let jsName = "NativeWebRTCPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setAuthToken", returnType: CAPPluginReturnPromise)
    ]

    @objc func setAuthToken(_ call: CAPPluginCall) {
        guard let token = call.getString("token") else {
            call.reject("token is required")
            return
        }
        UserDefaults.standard.set(token, forKey: "firebase_id_token")
        call.resolve()
    }
}
