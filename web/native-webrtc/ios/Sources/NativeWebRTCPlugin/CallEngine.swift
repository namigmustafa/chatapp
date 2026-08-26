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
        dbg("audioSessionDidActivate")
        try? AudioManager.shared.setEngineAvailability(.default)
    }

    public func audioSessionDidDeactivate(_ audioSession: AVAudioSession) {
        dbg("audioSessionDidDeactivate")
        try? AudioManager.shared.setEngineAvailability(.none)
    }

    // Accumulated (not overwritten) so the FULL sequence for a call survives
    // in one field — a single-field overwrite hid earlier stages (including
    // whether audioSessionDidActivate ever fired) behind whatever ran last.
    // Also a separate field from the JS-side calleeDebug — CallOverlay's own
    // writes run every time the app foregrounds and would otherwise stomp
    // whatever native wrote.
    private var debugLog: [String] = []
    private func dbg(_ stage: String) {
        guard let callId else { return }
        debugLog.append(stage)
        let joined = debugLog.joined(separator: " | ")
        Task { try? await FirestoreClient.updateDocument(path: "calls/\(callId)", fields: ["calleeDebugNative": joined]) }
    }

    /// Entry point from CXAnswerCallAction. Joins the call's LiveKit room and
    /// publishes the mic — all native, no WebView involvement.
    ///
    /// IMPORTANT (confirmed via livekit/client-sdk-swift#181 and the official
    /// livekit-examples/swift-example-collection CallKit example): this must
    /// run to completion, and `action.fulfill()` must be called only AFTER it
    /// returns — not immediately. Fulfilling early lets CallKit activate the
    /// audio session (didActivate → AVAudioEngine goes live) concurrently
    /// with/independently of room.connect()+setMicrophone(), with no ordering
    /// guarantee between them. When the SFU-level publish/subscribe completes
    /// before the local audio engine is actually live, the LiveKit/WebRTC
    /// signaling layer reports success (trackSubscribed fires on both ends —
    /// exactly what we saw in production debug logs) while no real audio ever
    /// gets captured from the not-yet-running engine. The official example
    /// avoids this entirely by doing room connect + mic publish INSIDE the
    /// CXAnswerCallAction handler's async Task and only calling
    /// action.fulfill()/action.fail() once that finishes.
    public func answerCall(callId: String) async throws {
        self.callId = callId
        self.debugLog = []
        dbg("platform:ios")
        dbg("button:answer")
        dbg("start")

        do {
            guard let call = try await FirestoreClient.getDocument(path: "calls/\(callId)") else {
                dbg("error:callDocMissing")
                throw ClientGenericError.unknown
            }
            guard let status = call["status"] as? String, status == "ringing" else {
                dbg("error:notAnswerable(status=\(call["status"] ?? "nil"))")
                throw ClientGenericError.unknown
            }
            dbg("gotCallDoc")

            let token = try await Self.fetchLiveKitToken(callId: callId)
            dbg("gotToken")

            // REVERTED: previously flipped engine availability to .default and
            // called setRecordingAlwaysPreparedMode(true) here, before connect(),
            // based on an extrapolation from livekit/client-sdk-swift#1069 (whose
            // reporter wasn't even using CallKit — later research walked this
            // back to "unconfirmed for CallKit"). Real production logs then
            // showed a concrete, consistent failure: "Audio Engine Error(...
            // code: -3010)" right after subscribedTrack, on every single call —
            // starting the engine before CallKit's didActivate has actually
            // activated the AVAudioSession is invalid and iOS rejects it outright.
            // Engine availability is set to .default in audioSessionDidActivate()
            // below, ONLY after CallKit confirms the session is really active —
            // that ordering is what #181's fix and the official example rely on.
            let room = Room()
            room.add(delegate: self)
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
            throw error
        }
    }

    /// Called from CXEndCallAction when the user declines from the CallKit UI
    /// (locked/backgrounded) before ever answering. Writes 'rejected' directly —
    /// same reasoning as answerCall(): waiting for the WebView/JS to wake up and
    /// call rejectCall() itself is not reliable while locked, so the caller would
    /// otherwise just ring until the 30s timeout marks it 'missed' instead.
    public func declineCall(callId: String) {
        self.callId = callId
        self.debugLog = []
        dbg("button:decline")
        Task { try? await FirestoreClient.updateDocument(path: "calls/\(callId)", fields: ["status": "rejected"]) }
    }

    /// Same reasoning, for hanging up a call that WAS answered natively — the
    /// caller must not be left thinking the call is still active.
    public func hangUpAnsweredCall(callId: String) {
        dbg("button:hangUp")
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
        //
        // Deliberately NOT re-calling setEngineAvailability(.default) here anymore
        // (an earlier "belt and suspenders" addition, now confirmed unnecessary
        // since the fulfill-order race it guarded against was fixed separately) —
        // debug logs showed audioSessionDidActivate reliably firing well before
        // this point in every recent test, and re-toggling engine availability
        // at the exact moment a track is being subscribed/attached is a plausible
        // way to disrupt that track's just-established playback path, which would
        // explain one-way-audio reports where the SFU-level subscription
        // (confirmed via this very breadcrumb) succeeded but no sound came out.
        dbg("subscribedTrack")

        // REMOVED the WebRTC-stats audio-level sampling that used to run here
        // (track.set(reportStatistics: true) + polling track.statistics). Real
        // production evidence showed calls consistently stalling forever right
        // after this exact breadcrumb — micPublished/answerWritten never ran —
        // whenever that sampling Task was present. It very likely contends
        // with LiveKit's internal Room/Track actor at exactly the moment the
        // SFU is negotiating the subscription, deadlocking the whole call.
        // Diagnostics must never be able to break the actual call, so this is
        // gone until it can be reimplemented in a way proven not to block.
    }

    public func room(_ room: Room, didUpdateConnectionState connectionState: ConnectionState, from oldValue: ConnectionState) {
        dbg("connectionState:\(connectionState)")
    }

    public func room(_ room: Room, participantDidDisconnect participant: RemoteParticipant) {
        dbg("participantDisconnected")
        // The caller left the room (hung up) — mirror that into Firestore so
        // this device's CallKit session also tears down, same as a local hangup.
        guard let callId = self.callId else { return }
        Task { try? await FirestoreClient.updateDocument(path: "calls/\(callId)", fields: ["status": "ended"]) }
    }

    public func room(_ room: Room, participantDidConnect participant: RemoteParticipant) {
        dbg("participantConnected")
    }

    public func room(_ room: Room, participant: RemoteParticipant, didUnsubscribeTrack publication: RemoteTrackPublication) {
        dbg("unsubscribedTrack")
    }

    public func room(_ room: Room, participant: Participant, trackPublication publication: TrackPublication, didUpdateIsMuted isMuted: Bool) {
        dbg(isMuted ? "trackMuted" : "trackUnmuted")
    }
}
