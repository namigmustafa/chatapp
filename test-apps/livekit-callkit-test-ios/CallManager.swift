/*
 * Copyright 2026 LiveKit
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import LiveKit

import AVFAudio
import AVFoundation
import Combine
import Logging

import CallKit
import PushKit

import LiveKitWebRTC
import SwiftUI

enum CallState {
    case idle
    case errored(Error)
    case activeIncoming
    case activeOutgoing
    case connected
}

class CallManager: NSObject, ObservableObject {
    let logger = Logger(label: "CallManager")

    // Shared global instance
    static let shared = CallManager()

    // State
    @Published var callState: CallState = .idle
    @Published var voipToken: String?
    @Published var activeCallUUID: UUID?

    // Reports have been "nothing visibly happens" with no way to tell which
    // step that actually means — CallKit callbacks fire on a background
    // queue, `logger` output needs a console we don't have on-device. This
    // is a plain on-screen trail of every step, in order, so we can see
    // exactly where execution actually stops.
    @Published var debugLog: [String] = []
    func trace(_ msg: String) {
        Task { @MainActor in
            self.debugLog.append(msg)
        }
        logger.debug("\(msg)")
    }

    @AppStorage("url") var url: String = ""
    @AppStorage("token") var token: String = ""

    // CallKit
    private let callController = CXCallController()

    private let provider: CXProvider

    // PushKit
    private let pushRegistry = PKPushRegistry(queue: nil)

    let room = Room()

    var hasActiveCall: Bool {
        switch callState {
        case .activeIncoming, .activeOutgoing, .connected:
            true
        default:
            false
        }
    }

    override private init() {
        // Setup CallKit
        let configuration = CXProviderConfiguration()
        configuration.supportedHandleTypes = [.generic]
        configuration.maximumCallsPerCallGroup = 1
        configuration.maximumCallGroups = 1
        configuration.supportsVideo = false
        provider = CXProvider(configuration: configuration)

        // Setup PushKit
        pushRegistry.desiredPushTypes = [.voIP]
        super.init()
        provider.setDelegate(self, queue: .global(qos: .default))
        pushRegistry.delegate = self

        // Set audio session auto-config off
        AudioManager.shared.audioSession.isAutomaticConfigurationEnabled = false

        // Set audio engine off
        do {
            try AudioManager.shared.setEngineAvailability(.none)
        } catch {
            logger.critical("Failed to set audio engine availablility")
        }
    }

    func startCall(handle: String) async {
        let callUUID = UUID()

        let handle = CXHandle(type: .generic, value: handle)
        let startCallAction = CXStartCallAction(call: callUUID, handle: handle)
        let transaction = CXTransaction(action: startCallAction)

        do {
            try await callController.request(transaction)
            logger.debug("Started call")

            Task { @MainActor in
                activeCallUUID = callUUID
            }
        } catch {
            // The original example only logged this — invisible without a
            // console attached, which is exactly why "Start call" appeared to
            // do "nothing at all" on a real test device. Surface it in the UI.
            logger.critical("Failed to start call: \(error)")
            Task { @MainActor in
                callState = .errored(error)
            }
        }
    }

    // Our real app's caller side never goes through CallKit at all — it
    // connects to the LiveKit room directly. `CXStartCallAction` (above)
    // requires an Apple entitlement we don't have and don't actually need
    // for this. This mirrors the real caller path instead.
    enum DirectCallError: Error { case microphonePermissionDenied }

    func startCallDirect() async {
        Task { @MainActor in
            callState = .activeOutgoing
        }
        do {
            // Request mic permission BEFORE touching engine availability.
            // Calling setEngineAvailability(.default) while permission is
            // still .notDetermined blocks the calling thread until the
            // system permission dialog is dismissed (confirmed via
            // livekit/client-sdk-swift#815) — on the main actor that reads
            // as an unresponsive app and iOS's watchdog kills it, which is
            // exactly the "connected, then closed fast" crash we saw.
            let granted = await AVAudioApplication.requestRecordPermission()
            guard granted else { throw DirectCallError.microphonePermissionDenied }

            // `provider(_:didActivate:)` below both configures the session
            // category AND enables the engine — CallKit itself activates the
            // session before that callback fires. Skipping CallKit entirely
            // means neither happens, so do both ourselves here: activating
            // the engine on a session still stuck on its default (non-
            // recording-capable) category is exactly the kind of native-level
            // audio failure that a Swift do/catch can't catch, which is why
            // this crashed outright instead of surfacing a normal error.
            try AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .voiceChat, options: [.mixWithOthers])
            // Without this, the SwiftUI Button tap's default system haptic
            // (which needs its own tiny audio engine) races our .playAndRecord
            // session and crashes with a TCC/privacy abort whose message
            // misleadingly cites NSMicrophoneUsageDescription — confirmed as
            // a known CoreHaptics/AVAudioSession conflict, with this call as
            // Apple's documented fix (setAllowHapticsAndSystemSoundsDuringRecording).
            try AVAudioSession.sharedInstance().setAllowHapticsAndSystemSoundsDuringRecording(true)
            try AVAudioSession.sharedInstance().setActive(true)

            // The `init()` above leaves LiveKit's audio engine disabled
            // (`.none`) and only re-enables it inside `provider(_:didActivate:)`,
            // which is a CXProviderDelegate callback — it never fires for a
            // call that skips CallKit entirely, like this one. Without this,
            // the room reports "connected" but mic capture and playback are
            // both silently no-ops.
            try AudioManager.shared.setEngineAvailability(.default)
            try await connectToRoom()
            Task { @MainActor in
                callState = .connected
            }
        } catch {
            logger.critical("Failed to connect directly: \(error)")
            Task { @MainActor in
                callState = .errored(error)
            }
        }
    }

    func endCall() async {
        Task { @MainActor in
            // Read `activeCallUUID` on main thread
            guard let callUUID = activeCallUUID else { return }

            Task {
                let endCallAction = CXEndCallAction(call: callUUID)
                let transaction = CXTransaction(action: endCallAction)

                do {
                    try await callController.request(transaction)
                    logger.debug("Ended call")
                } catch {
                    logger.critical("Failed to end call: \(error)")
                }
            }
        }
    }

    // `startCallDirect()` never registers a CallKit call, so there's no
    // `activeCallUUID`/`CXEndCallAction` to route through — just tear the
    // room down directly.
    func endCallDirect() async {
        await room.disconnect()
        try? AudioManager.shared.setEngineAvailability(.none)
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
        Task { @MainActor in
            callState = .idle
        }
    }

    func reportIncomingCallAsync(from callerId: String, callerName: String) async throws {
        // There is already an async ver from Apple but we just wrap `reportIncomingCallSync` here for now
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            reportIncomingCallSync(from: callerId, callerName: callerName) { error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }
    }

    // NOTE: Using sync version for background mode compatibility
    func reportIncomingCallSync(from callerId: String, callerName: String, completion: @escaping @Sendable ((any Error)?) -> Void) {
        trace("reportIncomingCallSync: start")

        let callUUID = UUID()
        let callUpdate = CXCallUpdate()
        callUpdate.remoteHandle = CXHandle(type: .generic, value: callerId)
        callUpdate.hasVideo = false
        callUpdate.localizedCallerName = callerName

        trace("reportIncomingCallSync: calling provider.reportNewIncomingCall")
        provider.reportNewIncomingCall(with: callUUID, update: callUpdate) { error in
            if let error {
                self.trace("reportNewIncomingCall completion: FAILED \(error)")
            } else {
                self.trace("reportNewIncomingCall completion: OK")
            }
            completion(error)
        }

        Task { @MainActor in
            self.callState = .activeIncoming
            self.activeCallUUID = callUUID
            self.trace("reportIncomingCallSync: callState set to activeIncoming")
        }
    }
}

// MARK: - Room control

extension CallManager {
    func connectToRoom() async throws {
        trace("connectToRoom: connecting to \(url)")
        try await room.connect(url: url, token: token)
        trace("connectToRoom: room.connect OK, publishing mic")
        try await room.localParticipant.setMicrophone(enabled: true)
        trace("connectToRoom: mic published")
    }

    func disconnectFromRoom() async {
        await room.disconnect()
    }
}

// MARK: - CXProviderDelegate

extension CallManager: CXProviderDelegate {
    func providerDidReset(_: CXProvider) {
        trace("providerDidReset")

        Task { @MainActor in
            self.activeCallUUID = nil
            self.callState = .idle
        }
    }

    func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        logger.debug("Call starting...")

        Task { @MainActor in
            self.callState = .activeOutgoing
        }

        Task {
            do {
                provider.reportOutgoingCall(with: action.callUUID, connectedAt: Date())
                try await connectToRoom()

                Task { @MainActor in
                    self.callState = .connected
                }

                logger.debug("Connected to room")
                action.fulfill()
            } catch {
                logger.critical("Failed to connect to room with error: \(error)")
                action.fail()

                Task { @MainActor in
                    self.callState = .errored(error)
                    self.activeCallUUID = nil
                }
            }
        }
    }

    func provider(_: CXProvider, perform action: CXAnswerCallAction) {
        trace("CXAnswerCallAction: perform called")

        Task {
            do {
                try await connectToRoom()
                trace("CXAnswerCallAction: connectToRoom OK, fulfilling")

                Task { @MainActor in
                    self.callState = .connected
                }

                action.fulfill()
            } catch {
                trace("CXAnswerCallAction: FAILED \(error)")

                Task { @MainActor in
                    self.callState = .errored(error)
                }

                action.fail()
            }
        }
    }

    func provider(_: CXProvider, perform action: CXEndCallAction) {
        logger.debug("End call")

        Task {
            await disconnectFromRoom()
            action.fulfill()

            Task { @MainActor in
                self.activeCallUUID = nil

                if case .errored = self.callState {
                    // Keep the errored state, for failed incoming cases.
                } else {
                    self.callState = .idle
                }
            }
        }
    }

    func provider(_: CXProvider, perform action: CXSetMutedCallAction) {
        Task {
            do {
                try await room.localParticipant.setMicrophone(enabled: !action.isMuted)
                logger.debug("Muted call: \(action.isMuted)")
                action.fulfill()
            } catch {
                logger.critical("Failed to set microphone enabled: \(!action.isMuted) with error: \(error.localizedDescription)")
                action.fail()
            }
        }
    }

    func provider(_: CXProvider, didActivate session: AVAudioSession) {
        trace("didActivate: session activated by CallKit")

        do {
            try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.mixWithOthers])
            try AudioManager.shared.setEngineAvailability(.default)
            trace("didActivate: category set, engine enabled")
        } catch {
            trace("didActivate: FAILED \(error.localizedDescription)")
        }
    }

    func provider(_: CXProvider, didDeactivate _: AVAudioSession) {
        // Audio session will need to be deactivated.
        logger.debug("Did deactivate session")

        do {
            try AudioManager.shared.setEngineAvailability(.none)
        } catch {
            logger.critical("Failed to set engine availability: \(error.localizedDescription)")
        }
    }
}

// MARK: - PKPushRegistryDelegate

extension CallManager: PKPushRegistryDelegate {
    func pushRegistry(_: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
        guard type == .voIP else { return }
        let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()

        logger.info("Push token updated: \(token)")

        Task { @MainActor in
            self.voipToken = token
        }
    }

    func pushRegistry(_: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        guard type == .voIP else { return }
        logger.info("Push Token invalidated")

        Task { @MainActor in
            voipToken = nil
        }
    }

    func pushRegistry(_: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
        guard type == .voIP else {
            completion()
            return
        }

        logger.info("Received push with payload: \(payload.dictionaryPayload)")

        /// NOTE: I've observed that the mic cannot initialized if we don't set .playAndRecord here,
        /// which appears like a bug in my opinion, since ``CallManager/provider(_:didActivate:)``
        /// should be invoked at the right time instead of having to set the session category here.
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.mixWithOthers])
        } catch {
            logger.critical("Failed to configure AVAudioSession: \(error.localizedDescription)")
        }

        // Extract caller information from payload
        let callerId = payload.dictionaryPayload["callerId"] as? String ?? UUID().uuidString
        let callerName = payload.dictionaryPayload["callerName"] as? String ?? "Unknown Caller"

        reportIncomingCallSync(from: callerId, callerName: callerName) { error in
            if let error {
                self.logger.critical("Failed to report incoming call: \(error)")
            } else {
                self.logger.info("Reported incoming call")
            }
            completion()
        }
    }
}
