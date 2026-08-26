import UIKit
import Capacitor
import Firebase
import PushKit
import CallKit
import AVFoundation
import NativeWebRTCPlugin

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, PKPushRegistryDelegate, CXProviderDelegate {

    var window: UIWindow?

    private var callProvider: CXProvider?
    private let callController = CXCallController()
    private var voipRegistry: PKPushRegistry?
    private var activeCallUUID: UUID?
    private var activeCallId: String?
    private var activeCallAnswered = false

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // NOTE: Do NOT set UNUserNotificationCenter.current().delegate here.
        // Capacitor core owns that delegate (via its notificationRouter) and the
        // @capacitor-firebase/messaging plugin hooks into it to emit the JS
        // `notificationActionPerformed` event. Overriding it kills notification-tap
        // routing — message taps would never reach the WebView.
        FirebaseApp.configure()

        // Must happen before any call can arrive — puts WebRTC's audio session
        // handling into manual mode so only CallKit's didActivate/didDeactivate
        // (relayed below) ever turn its audio I/O on, never WebKit's own session.
        CallEngine.configureAudioSession()

        setupCallKit()
        setupVoIPPushRegistry()
        return true
    }

    // MARK: - WebView wake

    // WKWebView's JS engine can stay suspended for a beat after CallKit answers a
    // locked-screen call — evaluating trivial JS forces WebKit to resume it instead
    // of waiting for a full app-foreground transition that may not come quickly.
    private func wakeWebView() {
        guard let bridgeVC = window?.rootViewController as? CAPBridgeViewController else { return }
        bridgeVC.bridge?.webView?.evaluateJavaScript("true", completionHandler: nil)
    }

    // MARK: - CallKit setup

    private func setupCallKit() {
        let config = CXProviderConfiguration(localizedName: "ChatApp")
        config.supportsVideo = true
        config.maximumCallsPerCallGroup = 1
        config.maximumCallGroups = 1
        config.supportedHandleTypes = [.generic]
        callProvider = CXProvider(configuration: config)
        callProvider?.setDelegate(self, queue: nil)
    }

    // MARK: - PushKit setup

    private func setupVoIPPushRegistry() {
        voipRegistry = PKPushRegistry(queue: DispatchQueue.main)
        voipRegistry?.delegate = self
        voipRegistry?.desiredPushTypes = [.voIP]
    }

    // MARK: - PKPushRegistryDelegate

    func pushRegistry(_ registry: PKPushRegistry, didUpdate credentials: PKPushCredentials, for type: PKPushType) {
        guard type == .voIP else { return }
        let token = credentials.token.map { String(format: "%02.2hhx", $0) }.joined()
        UserDefaults.standard.set(token, forKey: "voip_push_token")
        NotificationCenter.default.post(
            name: Notification.Name("VoIPTokenReceived"),
            object: nil,
            userInfo: ["token": token]
        )
    }

    func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        UserDefaults.standard.removeObject(forKey: "voip_push_token")
    }

    // CRITICAL: Must call reportNewIncomingCall synchronously inside this callback.
    // If you don't, Apple will stop delivering VoIP pushes to this app.
    func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
        guard type == .voIP else { completion(); return }

        let data       = payload.dictionaryPayload
        let callId     = data["callId"]       as? String ?? UUID().uuidString
        let callType   = data["callType"]     as? String ?? "audio"
        let callerName = data["callerName"]   as? String ?? "Unknown"
        let callerUserId = data["callerUserId"] as? String ?? ""

        let callUUID = UUID()
        activeCallUUID = callUUID
        activeCallId = callId
        activeCallAnswered = false

        let callInfo: [String: String] = [
            "callUUID":      callUUID.uuidString,
            "callId":        callId,
            "callType":      callType,
            "callerName":    callerName,
            "callerUserId":  callerUserId,
        ]

        // Persist so JS can retrieve call info after waking from killed state
        UserDefaults.standard.set(callInfo, forKey: "voip_pending_call")

        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: callerName)
        update.localizedCallerName = callerName
        update.hasVideo = callType == "video"
        update.supportsDTMF = false
        update.supportsHolding = false
        update.supportsGrouping = false
        update.supportsUngrouping = false

        // Known CallKit gap (confirmed on Apple's developer forums): when the app
        // answers from a locked/killed state, `provider(_:didActivate:)` can simply
        // never fire — leaving the audio session/engine stuck in the `.none`
        // (disabled) state we set at launch, with zero audio despite a fully
        // successful WebRTC/LiveKit connection. Apple's own workaround is to
        // "pre-heat" the audio session category/mode right here, before even
        // reporting the call, instead of waiting for didActivate to do it. If
        // didActivate DOES fire later, its own (redundant) configuration is harmless.
        try? AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetoothHFP, .allowBluetoothA2DP])
        CallEngine.shared.audioSessionDidActivate(AVAudioSession.sharedInstance())

        callProvider?.reportNewIncomingCall(with: callUUID, update: update) { error in
            if let error = error {
                print("[VoIP] reportNewIncomingCall error: \(error.localizedDescription)")
            }
            completion()

            // When app is foreground, dismiss CallKit immediately — our in-app UI handles it.
            // Must be on main thread; done after completion() so Apple's requirement is satisfied.
            DispatchQueue.main.async {
                if UIApplication.shared.applicationState == .active {
                    self.callProvider?.reportCall(with: callUUID, endedAt: Date(), reason: .answeredElsewhere)
                    self.activeCallUUID = nil
                }
            }
        }

        // Notify VoIPPlugin (JS bridge) — works when app is already running
        NotificationCenter.default.post(
            name: Notification.Name("VoIPCallReceived"),
            object: nil,
            userInfo: callInfo
        )
    }

    // MARK: - CXProviderDelegate

    func providerDidReset(_ provider: CXProvider) {
        activeCallUUID = nil
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        activeCallAnswered = true
        UserDefaults.standard.set(true, forKey: "voip_call_answered")
        if let callId = activeCallId, !callId.isEmpty {
            UserDefaults.standard.set(callId, forKey: "voip_answered_call_id")
        }
        // Diagnostic: timestamp + app state at the moment CallKit reports the answer,
        // so JS can tell native-side timing apart from its own getUserMedia/WebRTC hang.
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: "voip_answer_action_at")
        UserDefaults.standard.set(UIApplication.shared.applicationState.rawValue, forKey: "voip_answer_action_app_state")
        // Belt-and-suspenders alongside the pre-heat in didReceiveIncomingPushWith:
        // some reports of this same didActivate-never-fires bug specifically call
        // out re-asserting the category here, in the answer action itself, as
        // part of the fix — cheap and idempotent if it's already set.
        try? AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetoothHFP, .allowBluetoothA2DP])
        CallEngine.shared.audioSessionDidActivate(AVAudioSession.sharedInstance())
        // Full setup (setActive(true), etc.) still happens in didActivate below
        // when/if CallKit does call it — this is just insurance for when it doesn't.
        //
        // Kick off the ENTIRE call natively (offer fetch, answer, ICE, audio) —
        // no dependency on the WebView/JS layer at all. This runs in parallel with
        // CallKit's own audio session activation below; the peer connection and
        // signaling don't need an active audio session to start negotiating.
        //
        // IMPORTANT: this must happen BEFORE action.fulfill() — fulfilling the
        // action is what triggers CallKit to activate the audio session, and
        // didActivate can fire fast enough to race CallEngine.answerCall()'s own
        // `self.callId = callId` assignment if it runs after. When that race was
        // lost, CallEngine silently dropped the didActivate signal (callId still
        // nil), which looked identical to CallKit never activating audio at all.
        if let callId = activeCallId, !callId.isEmpty {
            CallEngine.shared.answerCall(callId: callId)
        }

        action.fulfill()
        DispatchQueue.main.async { self.wakeWebView() }
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        // Write the outcome to Firestore directly — waiting for the WebView/JS to
        // wake up and call rejectCall()/endCall() itself isn't reliable while
        // locked/backgrounded (same reasoning as answerCall()), which left the
        // caller ringing until the 30s timeout instead of seeing the decline/hangup.
        if let callId = activeCallId, !callId.isEmpty {
            if !activeCallAnswered {
                UserDefaults.standard.set(callId, forKey: "voip_declined_call_id")
                CallEngine.shared.declineCall(callId: callId)
            } else {
                CallEngine.shared.hangUpAnsweredCall(callId: callId)
            }
        }
        NotificationCenter.default.post(
            name: Notification.Name("VoIPCallEnded"),
            object: nil,
            userInfo: [
                "callUUID": action.callUUID.uuidString,
                "callId": activeCallId ?? "",
                // If the call was answered, this end is the CallKit→in-app handoff, not
                // a decline — JS must NOT reject it.
                "answered": activeCallAnswered,
            ]
        )
        CallEngine.shared.endCall()
        activeCallUUID = nil
        activeCallId = nil
        activeCallAnswered = false
        action.fulfill()
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        // Diagnostic: how long after the answer action did CallKit hand us the audio
        // session, and what app state were we in — to correlate with the JS-side hang.
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: "voip_audio_activated_at")
        UserDefaults.standard.set(UIApplication.shared.applicationState.rawValue, forKey: "voip_audio_activated_app_state")
        // CallKit has activated the audio session — safe to configure it.
        try? audioSession.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetoothHFP, .allowBluetoothA2DP])
        try? audioSession.setActive(true)
        // Tell WebRTC's (manual-mode) audio session it's now live — this is what
        // actually lets the native call engine's audio track start playing/recording.
        CallEngine.shared.audioSessionDidActivate(audioSession)
        DispatchQueue.main.async { self.wakeWebView() }
        NotificationCenter.default.post(
            name: Notification.Name("VoIPCallAnswered"),
            object: nil,
            userInfo: ["callId": activeCallId ?? ""]
        )
    }
    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        CallEngine.shared.audioSessionDidDeactivate(audioSession)
    }

    // Called from VoIPPlugin when the JS side ends or declines a call
    func endCallKitCall() {
        guard let uuid = activeCallUUID else { return }
        let action = CXEndCallAction(call: uuid)
        callController.request(CXTransaction(action: action)) { _ in }
        activeCallUUID = nil
    }

    // MARK: - Standard Capacitor delegates

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationDidBecomeActive(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
