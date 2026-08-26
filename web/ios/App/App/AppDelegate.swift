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

        // Confirmed via livekit/client-sdk-swift#181 (maintainer hiroshihorie) and
        // LiveKit's own official CallKit example — they hit the exact same "no
        // mic" issue and found the session category must be set here, before
        // reportNewIncomingCall, even though category/engine setup conceptually
        // belongs in didActivate. Their example only sets the CATEGORY here, not
        // AudioManager engine availability — the engine itself is brought up later,
        // gated on the room/mic actually being ready (see answerCall's doc comment).
        try? AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetoothHFP, .allowBluetoothA2DP])

        callProvider?.reportNewIncomingCall(with: callUUID, update: update) { error in
            if let error = error {
                print("[VoIP] reportNewIncomingCall error: \(error.localizedDescription)")
            }
            completion()

            // When app is foreground, dismiss CallKit immediately — our in-app UI handles it.
            // Must be on main thread; done after completion() so Apple's requirement is satisfied.
            DispatchQueue.main.async {
                self.dismissCallKitIfForeground(callUUID: callUUID)
            }
        }

        // The one-shot check above can miss a real foreground app: if the push
        // arrives during the brief .inactive transition (app resuming, or the
        // app just launching to handle the VoIP push), applicationState isn't
        // .active yet even though the user is about to be looking straight at
        // our own in-app incoming-call screen — leaving CallKit's banner up
        // alongside it (confirmed in production via screenshot: both showing
        // at once). Re-check once the app actually finishes becoming active.
        let becameActiveObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
        ) { [weak self] _ in
            self?.dismissCallKitIfForeground(callUUID: callUUID)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
            NotificationCenter.default.removeObserver(becameActiveObserver)
        }

        // Notify VoIPPlugin (JS bridge) — works when app is already running
        NotificationCenter.default.post(
            name: Notification.Name("VoIPCallReceived"),
            object: nil,
            userInfo: callInfo
        )
    }

    // Ends the CallKit-reported call as .answeredElsewhere if the app is
    // (now) foreground and the call hasn't already been answered/ended —
    // our own in-app incoming-call screen is the UI in that case, and
    // leaving CallKit's own banner up alongside it is confusing/redundant.
    private func dismissCallKitIfForeground(callUUID: UUID) {
        guard UIApplication.shared.applicationState == .active,
              activeCallUUID == callUUID, !activeCallAnswered else { return }
        callProvider?.reportCall(with: callUUID, endedAt: Date(), reason: .answeredElsewhere)
        activeCallUUID = nil
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

        // Confirmed via livekit/client-sdk-swift#181 (the exact "CallKit answer
        // → no audio" bug) and LiveKit's own official CallKit example: connect to
        // the room and publish the mic FIRST, and only call action.fulfill() once
        // that finishes — not before. Fulfilling early lets CallKit activate the
        // audio session (didActivate) independently of/concurrently with the room
        // connect, with no ordering guarantee; the SFU-level publish can complete
        // and report success (trackSubscribed fires on both ends) before the local
        // AVAudioEngine is actually live, so the signaling layer looks entirely
        // healthy while no real audio is ever captured. See CallEngine.answerCall's
        // doc comment for the full citation trail.
        guard let callId = activeCallId, !callId.isEmpty else {
            action.fail()
            return
        }
        Task {
            do {
                try await CallEngine.shared.answerCall(callId: callId)
                action.fulfill()
                DispatchQueue.main.async { self.wakeWebView() }
            } catch {
                action.fail()
            }
        }
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
