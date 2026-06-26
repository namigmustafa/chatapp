import Capacitor
import Foundation
import UIKit

@objc(VoIPPlugin)
public class VoIPPlugin: CAPPlugin, CAPBridgedPlugin {

    // Capacitor 7+ discovers plugins and their methods through CAPBridgedPlugin.
    // Without these declarations the JS bridge reports
    // "VoIPPlugin plugin is not implemented on iOS" even though VoIPPlugin.m's
    // CAP_PLUGIN macro registers the class — so register()/listeners never reach
    // native, the VoIP token is never stored, and CallKit never shows.
    public let identifier = "VoIPPlugin"
    public let jsName = "VoIPPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "register", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getStartupConversation", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endCall", returnType: CAPPluginReturnPromise),
    ]

    public override func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(onVoIPToken(_:)),
            name: Notification.Name("VoIPTokenReceived"),
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(onCallReceived(_:)),
            name: Notification.Name("VoIPCallReceived"),
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(onCallAnswered(_:)),
            name: Notification.Name("VoIPCallAnswered"),
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(onCallEnded(_:)),
            name: Notification.Name("VoIPCallEnded"),
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    // Returns current VoIP token, plus any pending call that arrived before JS was ready
    @objc func register(_ call: CAPPluginCall) {
        var result: [String: Any] = [:]

        if let token = UserDefaults.standard.string(forKey: "voip_push_token") {
            result["token"] = token
        }

        // Return and clear any call that arrived while JS was not yet running
        if let pending = UserDefaults.standard.dictionary(forKey: "voip_pending_call") {
            result["pendingCall"] = pending
            UserDefaults.standard.removeObject(forKey: "voip_pending_call")
        }

        // Return and clear the answered flag (user answered from CallKit before JS was ready)
        if UserDefaults.standard.bool(forKey: "voip_call_answered") {
            result["pendingAnswer"] = true
            UserDefaults.standard.removeObject(forKey: "voip_call_answered")
        }

        call.resolve(result)
    }

    // Returns and clears any conversationId stored at cold-start notification tap.
    @objc func getStartupConversation(_ call: CAPPluginCall) {
        let convId = UserDefaults.standard.string(forKey: "pending_conv_id") ?? ""
        UserDefaults.standard.removeObject(forKey: "pending_conv_id")
        call.resolve(["conversationId": convId])
    }

    @objc func endCall(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            (UIApplication.shared.delegate as? AppDelegate)?.endCallKitCall()
        }
        call.resolve()
    }

    // MARK: - NSNotification → JS events

    @objc private func onVoIPToken(_ notification: Notification) {
        guard let token = notification.userInfo?["token"] as? String else { return }
        notifyListeners("registration", data: ["token": token])
    }

    @objc private func onCallReceived(_ notification: Notification) {
        notifyListeners("callReceived", data: stringDict(notification.userInfo))
    }

    @objc private func onCallAnswered(_ notification: Notification) {
        notifyListeners("callAnswered", data: stringDict(notification.userInfo))
    }

    @objc private func onCallEnded(_ notification: Notification) {
        notifyListeners("callEnded", data: stringDict(notification.userInfo))
    }

    private func stringDict(_ userInfo: [AnyHashable: Any]?) -> [String: Any] {
        guard let info = userInfo else { return [:] }
        var result: [String: Any] = [:]
        for (key, value) in info {
            if let k = key as? String { result[k] = value }
        }
        return result
    }
}
