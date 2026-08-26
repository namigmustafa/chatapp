package app.chatapp.calltest

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

// Shown over the lock screen (android:showWhenLocked + turnScreenOn in the
// manifest) via the notification's full-screen intent — this is the closest
// Android equivalent to iOS's CallKit lock-screen UI for this isolated test.
class IncomingCallActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_URL = "url"
        const val EXTRA_TOKEN = "token"
        const val EXTRA_AUTO_ANSWER = "auto_answer"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }

        val url = intent.getStringExtra(EXTRA_URL) ?: ""
        val token = intent.getStringExtra(EXTRA_TOKEN) ?: ""

        if (intent.getBooleanExtra(EXTRA_AUTO_ANSWER, false)) {
            answer(url, token)
            return
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(64, 64, 64, 64)
        }
        root.addView(TextView(this).apply {
            text = "Incoming test call"
            textSize = 24f
            gravity = Gravity.CENTER
        })
        root.addView(Button(this).apply {
            text = "Answer"
            setOnClickListener { answer(url, token) }
        })
        root.addView(Button(this).apply {
            text = "Decline"
            setOnClickListener {
                IncomingCallNotifier.cancel(this@IncomingCallActivity)
                finish()
            }
        })
        setContentView(root)
    }

    private fun answer(url: String, token: String) {
        IncomingCallNotifier.cancel(this)
        val serviceIntent = Intent(this, CallTestService::class.java).apply {
            action = CallTestService.ACTION_CONNECT
            putExtra(CallTestService.EXTRA_URL, url)
            putExtra(CallTestService.EXTRA_TOKEN, token)
        }
        startForegroundService(serviceIntent)
        finish()
    }
}
