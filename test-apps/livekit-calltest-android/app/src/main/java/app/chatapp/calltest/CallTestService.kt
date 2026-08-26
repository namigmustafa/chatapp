package app.chatapp.calltest

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import io.livekit.android.LiveKit
import io.livekit.android.events.RoomEvent
import io.livekit.android.room.Room
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

// Mirrors app.chatapp.p2p's CallForegroundService.kt exactly on the LiveKit
// connect/publish sequence, minus all Firestore/auth-token plumbing — this is
// the isolated variable we're testing: does LiveKit itself, run from a plain
// foreground service, deliver two-way audio reliably.
class CallTestService : Service() {

    companion object {
        const val ACTION_CONNECT = "app.chatapp.calltest.CONNECT"
        const val ACTION_HANGUP = "app.chatapp.calltest.HANGUP"
        const val EXTRA_URL = "url"
        const val EXTRA_TOKEN = "token"
        private const val CHANNEL_ID = "calltest_active_call"
        private const val NOTIFICATION_ID = 4243
        private const val TAG = "CallTestService"
    }

    private val job = SupervisorJob()
    private val scope = CoroutineScope(Dispatchers.IO + job)
    private var room: Room? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_HANGUP -> {
                stopSelfSafely()
                return START_NOT_STICKY
            }
            ACTION_CONNECT -> {
                val url = intent.getStringExtra(EXTRA_URL) ?: return START_NOT_STICKY
                val token = intent.getStringExtra(EXTRA_TOKEN) ?: return START_NOT_STICKY
                ensureChannel()
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(NOTIFICATION_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
                } else {
                    startForeground(NOTIFICATION_ID, buildNotification())
                }
                connect(url, token)
            }
        }
        return START_NOT_STICKY
    }

    private fun connect(url: String, token: String) {
        CallStatus.update("Connecting...")
        scope.launch {
            try {
                val newRoom = LiveKit.create(applicationContext)
                room = newRoom

                scope.launch {
                    newRoom.events.events.collect { event ->
                        when (event) {
                            is RoomEvent.Connected -> {
                                Log.i(TAG, "connected")
                                CallStatus.update("Connected to room")
                            }
                            is RoomEvent.Disconnected -> {
                                Log.i(TAG, "disconnected: ${event.reason}")
                                CallStatus.update("Disconnected: ${event.reason}")
                            }
                            is RoomEvent.ParticipantConnected -> {
                                Log.i(TAG, "participantConnected: ${event.participant.identity}")
                                CallStatus.update("Participant connected: ${event.participant.identity}")
                            }
                            is RoomEvent.ParticipantDisconnected -> {
                                Log.i(TAG, "participantDisconnected: ${event.participant.identity}")
                                CallStatus.update("Participant disconnected: ${event.participant.identity}")
                            }
                            is RoomEvent.TrackSubscribed -> {
                                Log.i(TAG, "subscribedTrack: ${event.track.kind} from ${event.participant.identity}")
                                CallStatus.update("Subscribed to ${event.track.kind} from ${event.participant.identity}")
                            }
                            else -> {}
                        }
                    }
                }

                newRoom.connect(url, token)
                Log.i(TAG, "roomConnected")
                CallStatus.update("Room connected, publishing mic...")

                newRoom.localParticipant.setMicrophoneEnabled(true)
                Log.i(TAG, "micPublished")
                CallStatus.update("Mic published — call live")
            } catch (e: Exception) {
                Log.e(TAG, "connect failed: ${e.message}", e)
                CallStatus.update("Connect failed: ${e.message}")
                stopSelfSafely()
            }
        }
    }

    private fun stopSelfSafely() {
        room?.disconnect()
        room = null
        CallStatus.update("Idle")
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        job.cancel()
        room?.disconnect()
        super.onDestroy()
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Active test call", NotificationManager.IMPORTANCE_LOW)
        )
    }

    private fun buildNotification(): Notification =
        Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("LiveKit test call in progress")
            .setSmallIcon(android.R.drawable.stat_sys_phone_call)
            .setOngoing(true)
            .build()
}
