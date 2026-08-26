package app.chatapp.calltest

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat

// Minimal, isolated LiveKit test harness — no Firestore, no Capacitor, no
// signaling of any kind. "Start call" connects directly. "Simulate incoming
// call" fires the exact same full-screen-notification + foreground-service
// path a real push would (see AppFirebaseMessagingService.java /
// CallForegroundService.kt in the main app), just triggered locally instead
// of by a server push, so the CallKit-equivalent Android flow can be tested
// without needing any of our own backend involved.
class MainActivity : AppCompatActivity() {

    companion object {
        const val DEFAULT_URL = "wss://20-16-170-193.sslip.io"
        // This device is always the Android side (tester2) of the fixed
        // "calltest" room — hardcoded so there's nothing to paste in by hand.
        const val DEFAULT_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJ2aWRlbyI6eyJyb29tSm9pbiI6dHJ1ZSwicm9vbSI6ImNhbGx0ZXN0IiwiY2FuUHVibGlzaCI6dHJ1ZSwiY2FuU3Vic2NyaWJlIjp0cnVlfSwiaXNzIjoiQVBJa2V5LWJyYXZlLWZyb2ciLCJleHAiOjE3OTAzNzM0MDgsIm5iZiI6MTc4Nzc4MTQwOCwic3ViIjoidGVzdGVyMiJ9.y7pHlkTxQBDb58j0l92gMu4464rlVGC0gHwKftb8ekw"
    }

    private lateinit var statusText: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ensureCallChannel()
        requestPermissions()

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 96, 48, 48)
        }

        val title = TextView(this).apply {
            text = "LiveKit Call Test"
            textSize = 22f
            gravity = Gravity.CENTER
        }

        val urlInput = EditText(this).apply {
            hint = "LiveKit URL"
            setText(DEFAULT_URL)
        }

        val tokenInput = EditText(this).apply {
            hint = "Token"
            setText(DEFAULT_TOKEN)
        }

        statusText = TextView(this).apply {
            text = "Idle"
            setPadding(0, 24, 0, 24)
        }

        val startCallButton = Button(this).apply {
            text = "Start call"
            setOnClickListener {
                val url = urlInput.text.toString()
                val token = tokenInput.text.toString()
                if (url.isBlank() || token.isBlank()) {
                    statusText.text = "Enter URL and token first"
                    return@setOnClickListener
                }
                statusText.text = "Starting call as caller..."
                val intent = Intent(this@MainActivity, CallTestService::class.java).apply {
                    action = CallTestService.ACTION_CONNECT
                    putExtra(CallTestService.EXTRA_URL, url)
                    putExtra(CallTestService.EXTRA_TOKEN, token)
                }
                startForegroundService(intent)
            }
        }

        val simulateButton = Button(this).apply {
            text = "Simulate incoming call"
            setOnClickListener {
                val url = urlInput.text.toString()
                val token = tokenInput.text.toString()
                if (url.isBlank() || token.isBlank()) {
                    statusText.text = "Enter URL and token first"
                    return@setOnClickListener
                }
                statusText.text = "Showing incoming call notification..."
                IncomingCallNotifier.show(this@MainActivity, url, token)
            }
        }

        val hangupButton = Button(this).apply {
            text = "Hang up"
            setOnClickListener {
                statusText.text = "Idle"
                startForegroundService(
                    Intent(this@MainActivity, CallTestService::class.java).apply {
                        action = CallTestService.ACTION_HANGUP
                    }
                )
            }
        }

        listOf(title, urlInput, tokenInput, statusText, startCallButton, simulateButton, hangupButton)
            .forEach { root.addView(it) }

        setContentView(root)
    }

    private fun ensureCallChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(IncomingCallNotifier.CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            IncomingCallNotifier.CHANNEL_ID, "Incoming calls", NotificationManager.IMPORTANCE_HIGH
        )
        nm.createNotificationChannel(channel)
    }

    private fun requestPermissions() {
        val perms = mutableListOf(Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            perms.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        val missing = perms.filter {
            ActivityCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, missing.toTypedArray(), 1)
        }
    }
}
