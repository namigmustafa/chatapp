package app.chatapp.p2p

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import io.livekit.android.LiveKit
import io.livekit.android.events.RoomEvent
import io.livekit.android.room.Room
import io.livekit.android.room.track.Track
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.net.HttpURLConnection
import java.net.URL

/**
 * Drives the ENTIRE callee-side call (LiveKit room connect, mic publish) natively,
 * independent of the WebView/Capacitor JS layer — mirrors iOS's CallEngine.swift.
 * Started directly from CallActivity.handleAnswer() so answering from the lock
 * screen doesn't have to wait for a cold WebView boot before audio connects.
 *
 * Call *state* (ringing/active/ended) goes over the same Firestore `calls/{id}`
 * document the JS side uses (see web/src/services/webrtc.ts) via FirestoreClient,
 * authenticated with the ID token the JS layer pushes into SharedPreferences
 * (see VoIPPlugin.setAuthToken / useIncomingCalls.ts's syncAuthTokenToNative).
 */
class CallForegroundService : Service() {

    companion object {
        const val ACTION_ANSWER = "app.chatapp.p2p.ACTION_ANSWER"
        const val ACTION_DECLINE = "app.chatapp.p2p.ACTION_DECLINE"
        const val ACTION_HANGUP = "app.chatapp.p2p.ACTION_HANGUP"
        const val EXTRA_CALL_ID = "callId"

        private const val CHANNEL_ID = "calls"
        private const val NOTIFICATION_ID = 9002

        // Must match VITE_LIVEKIT_URL / the Terraform output `livekit_ws_url`
        // (infra/livekit-azure) — update once Azure is provisioned.
        private const val LIVEKIT_URL = "wss://20-16-170-193.sslip.io"
        private const val TOKEN_ENDPOINT = "https://us-central1-chatapp-48786.cloudfunctions.net/getLiveKitToken"
    }

    private val job = SupervisorJob()
    private val scope = CoroutineScope(Dispatchers.IO + job)
    private var room: Room? = null
    private var callId: String? = null
    private var pollJob: Job? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        val id = intent?.getStringExtra(EXTRA_CALL_ID)

        if (action == ACTION_HANGUP) {
            dbg("button:hangUp")
            endCall("ended")
            return START_NOT_STICKY
        }

        if (action == ACTION_DECLINE && id != null) {
            callId = id
            debugLog.clear()
            dbg("button:decline")
            val token = idToken()
            if (token != null) {
                scope.launch {
                    try { FirestoreClient.updateDocument("calls/$id", mapOf("status" to "rejected"), token) } catch (_: Exception) {}
                    stopSelfSafely()
                }
            } else {
                stopSelf()
            }
            return START_NOT_STICKY
        }

        if (action == ACTION_ANSWER && id != null) {
            callId = id
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, buildNotification(id), ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
            } else {
                startForeground(NOTIFICATION_ID, buildNotification(id))
            }
            answer(id)
        } else {
            stopSelf()
        }
        return START_NOT_STICKY
    }

    private fun idToken(): String? {
        val prefs = getSharedPreferences("chatapp_call", MODE_PRIVATE)
        val token = prefs.getString("firebase_id_token", null)
        return if (token.isNullOrEmpty()) null else token
    }

    // Accumulated (not overwritten) — a plain overwrite hid earlier stages
    // behind whatever ran last. Also a separate field from the JS-side
    // calleeDebug — CallOverlay's own writes run every time the app
    // foregrounds and would otherwise stomp whatever native wrote.
    private val debugLog = mutableListOf<String>()
    private fun dbg(stage: String) {
        val id = callId ?: return
        val token = idToken() ?: return
        debugLog.add(stage)
        val joined = debugLog.joinToString(" | ")
        scope.launch {
            try { FirestoreClient.updateDocument("calls/$id", mapOf("calleeDebugNative" to joined), token) } catch (_: Exception) {}
        }
    }

    // Samples real WebRTC stats for a few seconds after a remote audio track
    // is subscribed and writes a one-time verdict. Scans every stats entry's
    // members for anything named like "audioLevel"/"totalAudioEnergy" rather
    // than hardcoding one stats-object type, since the exact WebRTC stats
    // schema (inbound-rtp vs track-level) has shifted across spec revisions
    // and libwebrtc versions — resilience here matters more than precision.
    private suspend fun sampleRemoteAudioLevel(track: Track) {
        delay(1500) // let the track stabilize before sampling
        var peak = 0.0
        var samples = 0
        val start = System.currentTimeMillis()
        while (System.currentTimeMillis() - start < 3000) {
            try {
                val report = track.getRTCStats()
                report?.statsMap?.values?.forEach { stat ->
                    stat.members.forEach { (key, value) ->
                        if (key.contains("audioLevel", ignoreCase = true) || key.contains("totalAudioEnergy", ignoreCase = true)) {
                            (value as? Number)?.toDouble()?.let { v ->
                                if (v > peak) peak = v
                                samples++
                            }
                        }
                    }
                }
            } catch (_: Exception) {}
            delay(300)
        }
        val heard = peak > 0.001 // audioLevel is normalized 0..1 — near-zero means silence
        dbg("remoteAudioLevel:${if (heard) "detected" else "SILENCE"}(peak=$peak,samples=$samples)")
    }

    private fun fetchLiveKitToken(id: String, idToken: String): String {
        val url = URL("$TOKEN_ENDPOINT?callId=$id")
        val conn = url.openConnection() as HttpURLConnection
        conn.setRequestProperty("Authorization", "Bearer $idToken")
        conn.connectTimeout = 10_000
        conn.readTimeout = 10_000
        val code = conn.responseCode
        val text = (if (code in 200..299) conn.inputStream else conn.errorStream)
            ?.bufferedReader()?.use { it.readText() } ?: ""
        if (code !in 200..299) throw Exception("getLiveKitToken failed: $code")
        return org.json.JSONObject(text).getString("token")
    }

    private fun answer(id: String) {
        debugLog.clear()
        dbg("button:answer")
        scope.launch {
            val idToken = idToken()
            if (idToken == null) {
                dbg("error:noAuthToken")
                stopSelfSafely()
                return@launch
            }
            try {
                val call = FirestoreClient.getDocument("calls/$id", idToken)
                if (call == null || call.optString("status") != "ringing") {
                    dbg("error:notAnswerable(status=${call?.optString("status")})")
                    stopSelfSafely()
                    return@launch
                }
                dbg("gotCallDoc")

                val lkToken = fetchLiveKitToken(id, idToken)
                dbg("gotToken")

                val newRoom = LiveKit.create(applicationContext)
                room = newRoom

                // Diagnostic only — iOS's equivalent RoomDelegate.didSubscribeTrack
                // breadcrumb was what proved the CallKit fulfill-order race was real
                // in production. Android had no matching listener anywhere in this
                // file, so there was zero visibility into whether the caller's track
                // actually gets subscribed on this side. Wired before connect() so
                // an event firing right as the connection completes isn't missed.
                // Covers the full connection lifecycle, not just the happy path —
                // reconnects and subscription failures were previously invisible too.
                scope.launch {
                    newRoom.events.events.collect { event ->
                        when (event) {
                            is RoomEvent.Connected -> dbg("roomEvent:connected")
                            is RoomEvent.Reconnecting -> dbg("roomEvent:reconnecting")
                            is RoomEvent.Reconnected -> dbg("roomEvent:reconnected")
                            is RoomEvent.Disconnected -> dbg("roomEvent:disconnected:${event.reason}")
                            is RoomEvent.ParticipantConnected -> dbg("participantConnected:${event.participant.identity}")
                            is RoomEvent.ParticipantDisconnected -> dbg("participantDisconnected:${event.participant.identity}")
                            is RoomEvent.TrackPublished -> dbg("trackPublished:${event.publication.kind}:from:${event.participant.identity}")
                            is RoomEvent.TrackSubscribed -> {
                                dbg("subscribedTrack:${event.track.kind}:from:${event.participant.identity}")
                                if (event.track.kind == Track.Kind.AUDIO) {
                                    // Subscribing is only a SIGNALING-level success — it does
                                    // NOT mean audio is actually flowing (this exact gap was
                                    // the root cause of the iOS CallKit one-way-audio bug:
                                    // trackSubscribed fired while the local engine was still
                                    // silent). Sample real WebRTC stats to get a MEDIA-level
                                    // verdict instead of trusting the signaling event alone.
                                    scope.launch { sampleRemoteAudioLevel(event.track) }
                                }
                            }
                            is RoomEvent.TrackUnsubscribed -> dbg("unsubscribedTrack:${event.track.kind}:from:${event.participant.identity}")
                            is RoomEvent.TrackSubscriptionFailed -> dbg("subscribeFailed:${event.sid}:${event.exception.message?.take(80)}")
                            is RoomEvent.TrackMuted -> dbg("trackMuted:${event.publication.kind}:from:${event.participant.identity}")
                            is RoomEvent.TrackUnmuted -> dbg("trackUnmuted:${event.publication.kind}:from:${event.participant.identity}")
                            else -> {}
                        }
                    }
                }

                // LiveKit Android's default device priority is BluetoothHeadset,
                // WiredHeadset, Speakerphone, Earpiece — Speakerphone ranks ABOVE
                // Earpiece, so a plain voice call with no headset connected comes
                // out the loud external speaker by default instead of the earpiece
                // like a normal phone call. Put Earpiece ahead of Speakerphone.
                (newRoom.audioHandler as? io.livekit.android.audio.AudioSwitchHandler)?.preferredDeviceList = listOf(
                    com.twilio.audioswitch.AudioDevice.BluetoothHeadset::class.java,
                    com.twilio.audioswitch.AudioDevice.WiredHeadset::class.java,
                    com.twilio.audioswitch.AudioDevice.Earpiece::class.java,
                    com.twilio.audioswitch.AudioDevice.Speakerphone::class.java
                )
                newRoom.connect(LIVEKIT_URL, lkToken)
                dbg("roomConnected")

                newRoom.localParticipant.setMicrophoneEnabled(true)
                dbg("micPublished")

                FirestoreClient.updateDocument("calls/$id", mapOf("status" to "active"), idToken)
                dbg("answerWritten")

                startPollingCallStatus(id, idToken)
            } catch (e: Exception) {
                dbg("error:${e.message?.take(120)}")
                try { FirestoreClient.updateDocument("calls/$id", mapOf("status" to "callee_error"), idToken) } catch (_: Exception) {}
                stopSelfSafely()
            }
        }
    }

    /** No realtime Firestore listener over REST — polling is cheap and simple,
     * and only needs to catch the other side hanging up while we're not in JS. */
    private fun startPollingCallStatus(id: String, idToken: String) {
        pollJob?.cancel()
        pollJob = scope.launch {
            while (true) {
                delay(2_000)
                val call = try { FirestoreClient.getDocument("calls/$id", idToken) } catch (_: Exception) { null }
                val status = call?.optString("status")
                if (call == null || status != "active") {
                    dbg("polledStatus:${status ?: "docMissing"}")
                    endCall(null) // Firestore already reflects the terminal state; don't overwrite it.
                    break
                }
            }
        }
    }

    private fun endCall(writeStatus: String?) {
        val id = callId
        val token = idToken()
        if (writeStatus != null && id != null && token != null) {
            scope.launch {
                try { FirestoreClient.updateDocument("calls/$id", mapOf("status" to writeStatus), token) } catch (_: Exception) {}
            }
        }
        stopSelfSafely()
    }

    private fun stopSelfSafely() {
        pollJob?.cancel()
        room?.disconnect()
        room = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        job.cancel()
        room?.disconnect()
        super.onDestroy()
    }

    private fun buildNotification(id: String): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "Calls", NotificationManager.IMPORTANCE_HIGH)
            nm.createNotificationChannel(channel)
        }

        val hangupIntent = Intent(this, CallForegroundService::class.java).apply {
            action = ACTION_HANGUP
        }
        val hangupPendingIntent = PendingIntent.getService(
            this, 0, hangupIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("Call in progress")
            .setSmallIcon(android.R.drawable.stat_sys_phone_call)
            .setOngoing(true)
            .addAction(0, "Hang up", hangupPendingIntent)
            .build()
    }
}
