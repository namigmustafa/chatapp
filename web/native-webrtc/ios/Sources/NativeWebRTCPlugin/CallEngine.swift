import Foundation
import AVFoundation
import LiveKit

// Drives the ENTIRE callee-side call (room connect, mic publish, audio)
// natively, independent of the WKWebView/JS layer. This is the fix for the
// confirmed architectural conflict between WKWebView's built-in WebRTC and
// CallKit's audio session (https://developer.apple.com/forums/thread/767949)
// — by never routing through the WebView for the CallKit-answer path,
// there's nothing for CallKit's audio session activation to conflict with.
//
// Media now goes through a self-hosted LiveKit SFU (see infra/livekit-azure)
// instead of raw peer-to-peer WebRTC — LiveKit's Swift SDK owns ICE/SDP
// negotiation entirely; this class only has to: fetch a room-scoped token,
// connect, and publish the mic. Call *state* (ringing/active/ended) still
// goes over the same Firestore `calls/{id}` document the JS side uses (see
// web/src/services/webrtc.ts) via FirestoreClient (a plain REST client —
// see that file for why this doesn't use the Firebase SDK).
public final class CallEngine: NSObject {
    public static let shared = CallEngine()

    // Must match VITE_LIVEKIT_URL in web/.env.local and the Terraform output
    // `livekit_ws_url` (infra/livekit-azure) — set this once your Azure
    // deployment has a real domain. Reads an Info.plist override first so
    // this doesn't require a recompile if the domain changes.
    private static var livekitURL: String {
        (Bundle.main.object(forInfoDictionaryKey: "LiveKitServerURL") as? String)
            ?? "wss://livekit.example.com"
    }

    private static let tokenEndpoint = URL(string: "https://us-central1-chatapp-48786.cloudfunctions.net/getLiveKitToken")!

    // Mirrors web/src/services/webrtc.ts's fetchLiveKitToken() — same Cloud
    // Function, which verifies the requester is an actual participant of
    // `callId` before minting a room-scoped token.
    private static func fetchLiveKitToken(callId: String) async throws -> String {
        guard let idToken = UserDefaults.standard.string(forKey: "firebase_id_token"), !idToken.isEmpty else {
            throw ClientGenericError.noAuthToken
        }
        var url = URLComponents(url: tokenEndpoint, resolvingAgainstBaseURL: false)!
        url.queryItems = [URLQueryItem(name: "callId", value: callId)]
        var req = URLRequest(url: url.url!)
        req.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw ClientGenericError.tokenRequestFailed
        }
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let token = json["token"] as? String, !token.isEmpty else {
            throw ClientGenericError.tokenRequestFailed
        }
        return token
    }

    enum ClientGenericError: Error { case unknown, noAuthToken, tokenRequestFailed }

    private var room: Room?
    private var callId: String?

    private override init() { super.init() }

    /// One-time setup — call at app launch, before any call can arrive.
    /// Disables LiveKit's automatic audio session configuration so ONLY
    /// CallKit's didActivate/didDeactivate (relayed via
    /// audioSessionDidActivate/Deactivate below) ever turns audio I/O on.
    public static func configureAudioSession() {
        AudioManager.shared.audioSession.isAutomaticConfigurationEnabled = false
        try? AudioManager.shared.setEngineAvailability(.none)
    }

    public func audioSessionDidActivate(_ audioSession: AVAudioSession) {
        try? AudioManager.shared.setEngineAvailability(.default)
    }

    public func audioSessionDidDeactivate(_ audioSession: AVAudioSession) {
        try? AudioManager.shared.setEngineAvailability(.none)
    }

    private func dbg(_ stage: String) {
        guard let callId else { return }
        Task { try? await FirestoreClient.updateDocument(path: "calls/\(callId)", fields: ["calleeDebug": "native:\(stage)"]) }
    }

    /// Entry point from CXAnswerCallAction. Joins the call's LiveKit room and
    /// publishes the mic — all native, no WebView involvement.
    public func answerCall(callId: String) {
        self.callId = callId
        dbg("start")

        Task {
            do {
                guard let call = try await FirestoreClient.getDocument(path: "calls/\(callId)") else {
                    dbg("error:callDocMissing")
                    return
                }
                guard let status = call["status"] as? String, status == "ringing" else {
                    dbg("error:notAnswerable(status=\(call["status"] ?? "nil"))")
                    return
                }
                dbg("gotCallDoc")

                let token = try await Self.fetchLiveKitToken(callId: callId)
                dbg("gotToken")

                let room = Room()
                room.delegate = self
                self.room = room

                try await room.connect(url: Self.livekitURL, token: token)
                dbg("roomConnected")

                try await room.localParticipant.setMicrophone(enabled: true)
                dbg("micPublished")

                try await FirestoreClient.updateDocument(path: "calls/\(callId)", fields: ["status": "active"])
                dbg("answerWritten")
            } catch {
                dbg("error:\(String(describing: error).prefix(120))")
                await FirestoreClient.tryUpdateCalleeError(callId: callId)
                endCall()
            }
        }
    }

    /// Called from CXEndCallAction when the user declines from the CallKit UI
    /// (locked/backgrounded) before ever answering. Writes 'rejected' directly —
    /// same reasoning as answerCall(): waiting for the WebView/JS to wake up and
    /// call rejectCall() itself is not reliable while locked, so the caller would
    /// otherwise just ring until the 30s timeout marks it 'missed' instead.
    public func declineCall(callId: String) {
        Task { try? await FirestoreClient.updateDocument(path: "calls/\(callId)", fields: ["status": "rejected"]) }
    }

    /// Same reasoning, for hanging up a call that WAS answered natively — the
    /// caller must not be left thinking the call is still active.
    public func hangUpAnsweredCall(callId: String) {
        Task { try? await FirestoreClient.updateDocument(path: "calls/\(callId)", fields: ["status": "ended"]) }
    }

    public func endCall() {
        let roomToClose = room
        Task { await roomToClose?.disconnect() }
        room = nil
        callId = nil
    }
}

extension FirestoreClient {
    static func tryUpdateCalleeError(callId: String) async {
        try? await updateDocument(path: "calls/\(callId)", fields: ["status": "callee_error"])
    }
}

// MARK: - RoomDelegate

extension CallEngine: RoomDelegate {
    public func room(_ room: Room, participant: RemoteParticipant, didSubscribeTrack publication: RemoteTrackPublication) {
        // No manual audio wiring needed — LiveKit's AudioManager plays subscribed
        // audio tracks through the engine we enabled in audioSessionDidActivate.
        dbg("subscribedTrack:\(publication.kind)")
    }

    public func room(_ room: Room, didUpdateConnectionState connectionState: ConnectionState, from oldValue: ConnectionState) {
        dbg("connectionState:\(connectionState)")
    }

    public func room(_ room: Room, participant: RemoteParticipant, didDisconnect reason: DisconnectReason?) {
        // The caller left the room (hung up) — mirror that into Firestore so
        // this device's CallKit session also tears down, same as a local hangup.
        guard let callId = self.callId else { return }
        Task { try? await FirestoreClient.updateDocument(path: "calls/\(callId)", fields: ["status": "ended"]) }
    }
}
