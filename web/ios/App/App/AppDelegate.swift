import UIKit
import Capacitor
import Firebase
import PushKit
import CallKit
import AVFoundation

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

        setupCallKit()
        setupVoIPPushRegistry()
        return true
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
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetoothHFP, .allowBluetoothA2DP])
        try? session.setActive(true)
        activeCallAnswered = true
        // Persist the answered flag + call id so JS can complete the answer (write the
        // WebRTC answer to Firestore) even if it wasn't holding the call in memory.
        UserDefaults.standard.set(true, forKey: "voip_call_answered")
        if let callId = activeCallId, !callId.isEmpty {
            UserDefaults.standard.set(callId, forKey: "voip_answered_call_id")
        }
        NotificationCenter.default.post(
            name: Notification.Name("VoIPCallAnswered"),
            object: nil,
            userInfo: ["callUUID": action.callUUID.uuidString, "callId": activeCallId ?? ""]
        )
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        // Persist the declined call id so JS can mark it 'rejected' in Firestore even
        // if the app wasn't running when the user declined from CallKit. Only do this
        // when the call was NOT answered — otherwise this is a normal hang-up, not a
        // rejection, and we'd wrongly overwrite an answered/ended call as 'rejected'.
        if !activeCallAnswered, let callId = activeCallId, !callId.isEmpty {
            UserDefaults.standard.set(callId, forKey: "voip_declined_call_id")
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
        activeCallUUID = nil
        activeCallId = nil
        activeCallAnswered = false
        action.fulfill()
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {}
    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {}

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
