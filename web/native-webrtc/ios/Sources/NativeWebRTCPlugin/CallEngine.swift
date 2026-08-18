import Foundation
import AVFoundation
import WebRTC

// Drives the ENTIRE callee-side call (peer connection, SDP, ICE, audio) natively,
// independent of the WKWebView/JS layer. This is the fix for the confirmed
// architectural conflict between WKWebView's built-in WebRTC and CallKit's audio
// session (https://developer.apple.com/forums/thread/767949) — by never routing
// through the WebView for the CallKit-answer path, there's nothing for CallKit's
// audio session activation to conflict with.
//
// Signaling goes over the same Firestore `calls/{id}` document/subcollections the
// JS side already uses (see web/src/services/webrtc.ts) via FirestoreClient (a
// plain REST client — see that file for why this doesn't use the Firebase SDK).
public final class CallEngine: NSObject {
    public static let shared = CallEngine()

    private static let iceServers: [RTCIceServer] = [
        RTCIceServer(urlStrings: ["stun:stun.l.google.com:19302"]),
        RTCIceServer(urlStrings: ["stun:stun1.l.google.com:19302"]),
        RTCIceServer(urlStrings: ["turn:openrelay.metered.ca:80"], username: "openrelayproject", credential: "openrelayproject"),
        RTCIceServer(urlStrings: ["turn:openrelay.metered.ca:443"], username: "openrelayproject", credential: "openrelayproject"),
        RTCIceServer(urlStrings: ["turn:openrelay.metered.ca:443?transport=tcp"], username: "openrelayproject", credential: "openrelayproject"),
    ]

    private let factory: RTCPeerConnectionFactory = {
        RTCInitializeSSL()
        let encoderFactory = RTCDefaultVideoEncoderFactory()
        let decoderFactory = RTCDefaultVideoDecoderFactory()
        return RTCPeerConnectionFactory(encoderFactory: encoderFactory, decoderFactory: decoderFactory)
    }()

    private var pc: RTCPeerConnection?
    private var callId: String?
    private var candidatePollTimer: Timer?
    private var seenCallerCandidateNames = Set<String>()
    private var remoteDescriptionSet = false
    private var pendingRemoteCandidates: [RTCIceCandidate] = []

    private override init() { super.init() }

    /// One-time setup — call at app launch, before any call can arrive. Puts
    /// WebRTC's audio session handling into "manual" mode so it NEVER activates
    /// its own session; only CallKit's didActivate/didDeactivate (relayed via
    /// audioSessionDidActivate/Deactivate below) controls when audio actually runs.
    public static func configureAudioSession() {
        let session = RTCAudioSession.sharedInstance()
        session.useManualAudio = true
        session.isAudioEnabled = false

        // Without this, WebRTC's audio unit never actually gets the category/mode
        // it needs — manual mode only stops WebRTC from activating a session, it
        // doesn't configure one for you. This was missing, which is almost
        // certainly why signaling connected but no audio played.
        session.lockForConfiguration()
        let config = RTCAudioSessionConfiguration.webRTC()
        config.category = AVAudioSession.Category.playAndRecord.rawValue
        config.mode = AVAudioSession.Mode.voiceChat.rawValue
        config.categoryOptions = [.allowBluetoothHFP, .allowBluetoothA2DP, .defaultToSpeaker]
        try? session.setConfiguration(config)
        session.unlockForConfiguration()
    }

    public func audioSessionDidActivate(_ audioSession: AVAudioSession) {
        let session = RTCAudioSession.sharedInstance()
        session.audioSessionDidActivate(audioSession)
        session.isAudioEnabled = true
    }

    public func audioSessionDidDeactivate(_ audioSession: AVAudioSession) {
        let session = RTCAudioSession.sharedInstance()
        session.isAudioEnabled = false
        session.audioSessionDidDeactivate(audioSession)
    }

    private func dbg(_ stage: String) {
        guard let callId else { return }
        Task { try? await FirestoreClient.updateDocument(path: "calls/\(callId)", fields: ["calleeDebug": "native:\(stage)"]) }
    }

    /// Entry point from CXAnswerCallAction. Fetches the offer, answers it, and
    /// keeps the connection alive — all native, no WebView involvement.
    public func answerCall(callId: String) {
        self.callId = callId
        dbg("start")

        Task {
            do {
                guard let call = try await FirestoreClient.getDocument(path: "calls/\(callId)") else {
                    dbg("error:callDocMissing")
                    return
                }
                guard let status = call["status"] as? String, status == "ringing",
                      let offerMap = call["offer"] as? [String: Any],
                      let sdp = offerMap["sdp"] as? String else {
                    dbg("error:notAnswerable(status=\(call["status"] ?? "nil"))")
                    return
                }
                dbg("gotOffer")

                let config = RTCConfiguration()
                config.iceServers = Self.iceServers
                config.sdpSemantics = .unifiedPlan
                let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
                guard let pc = factory.peerConnection(with: config, constraints: constraints, delegate: self) else {
                    dbg("error:pcCreateFailed")
                    return
                }
                self.pc = pc

                let audioSource = factory.audioSource(with: RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil))
                let audioTrack = factory.audioTrack(with: audioSource, trackId: "callee-audio0")
                pc.add(audioTrack, streamIds: ["callee-stream0"])

                let remoteDesc = RTCSessionDescription(type: .offer, sdp: sdp)
                try await setRemoteDescription(pc, remoteDesc)
                dbg("remoteDescSet")
                flushPendingRemoteCandidates(pc)

                let answer = try await createAnswer(pc, constraints: constraints)
                dbg("answerCreated")
                try await setLocalDescription(pc, answer)
                dbg("localDescSet")

                try await FirestoreClient.updateDocument(path: "calls/\(callId)", fields: [
                    "answer": ["type": "answer", "sdp": answer.sdp],
                    "status": "active",
                ])
                dbg("answerWritten")

                startPollingCallerCandidates(callId: callId)
            } catch {
                dbg("error:\(String(describing: error).prefix(120))")
                await FirestoreClient.tryUpdateCalleeError(callId: callId)
                endCall()
            }
        }
    }

    public func endCall() {
        candidatePollTimer?.invalidate()
        candidatePollTimer = nil
        pc?.close()
        pc = nil
        seenCallerCandidateNames.removeAll()
        pendingRemoteCandidates.removeAll()
        remoteDescriptionSet = false
        callId = nil
    }

    // MARK: - Async wrappers around RTCPeerConnection's completion-handler APIs

    private func setRemoteDescription(_ pc: RTCPeerConnection, _ desc: RTCSessionDescription) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            pc.setRemoteDescription(desc) { error in
                if let error { cont.resume(throwing: error) } else { cont.resume() }
            }
        }
    }

    private func setLocalDescription(_ pc: RTCPeerConnection, _ desc: RTCSessionDescription) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            pc.setLocalDescription(desc) { error in
                if let error { cont.resume(throwing: error) } else { cont.resume() }
            }
        }
    }

    private func createAnswer(_ pc: RTCPeerConnection, constraints: RTCMediaConstraints) async throws -> RTCSessionDescription {
        try await withCheckedThrowingContinuation { cont in
            pc.answer(for: constraints) { sdp, error in
                if let sdp { cont.resume(returning: sdp) } else { cont.resume(throwing: error ?? ClientGenericError.unknown) }
            }
        }
    }

    enum ClientGenericError: Error { case unknown }

    // MARK: - ICE candidate exchange (poll-based — Firestore REST has no cheap
    // realtime listen without a raw gRPC stream, and a call's ICE gathering
    // finishes within a few seconds, so 1s polling is more than fast enough).

    private func startPollingCallerCandidates(callId: String) {
        candidatePollTimer?.invalidate()
        let timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.pollCallerCandidatesOnce(callId: callId)
        }
        RunLoop.main.add(timer, forMode: .common)
        candidatePollTimer = timer
    }

    private func pollCallerCandidatesOnce(callId: String) {
        Task {
            guard let docs = try? await FirestoreClient.listDocuments(collectionPath: "calls/\(callId)/callerCandidates") else { return }
            for doc in docs {
                guard let name = doc["__name"] as? String, !seenCallerCandidateNames.contains(name) else { continue }
                seenCallerCandidateNames.insert(name)
                guard let candidateStr = doc["candidate"] as? String, let sdpMid = doc["sdpMid"] as? String else { continue }
                let sdpMLineIndex = Int32(doc["sdpMLineIndex"] as? Int ?? 0)
                let ice = RTCIceCandidate(sdp: candidateStr, sdpMLineIndex: sdpMLineIndex, sdpMid: sdpMid)
                if remoteDescriptionSet, let pc {
                    Task { try? await pc.add(ice) }
                } else {
                    pendingRemoteCandidates.append(ice)
                }
            }
        }
    }

    private func flushPendingRemoteCandidates(_ pc: RTCPeerConnection) {
        remoteDescriptionSet = true
        for ice in pendingRemoteCandidates {
            Task { try? await pc.add(ice) }
        }
        pendingRemoteCandidates.removeAll()
    }
}

extension FirestoreClient {
    static func tryUpdateCalleeError(callId: String) async {
        try? await updateDocument(path: "calls/\(callId)", fields: ["status": "callee_error"])
    }
}

// MARK: - RTCPeerConnectionDelegate

extension CallEngine: RTCPeerConnectionDelegate {
    public func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}

    public func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}

    public func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}

    public func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}

    public func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        dbg("iceState:\(newState.debugName)")
    }

    public func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}

    public func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        guard let callId else { return }
        Task {
            try? await FirestoreClient.addDocument(collectionPath: "calls/\(callId)/calleeCandidates", fields: [
                "candidate": candidate.sdp,
                "sdpMid": candidate.sdpMid ?? "",
                "sdpMLineIndex": Int(candidate.sdpMLineIndex),
            ])
        }
    }

    public func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}

    public func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}
}

private extension RTCIceConnectionState {
    var debugName: String {
        switch self {
        case .new: return "new"
        case .checking: return "checking"
        case .connected: return "connected"
        case .completed: return "completed"
        case .failed: return "failed"
        case .disconnected: return "disconnected"
        case .closed: return "closed"
        case .count: return "count"
        @unknown default: return "unknown"
        }
    }
}
