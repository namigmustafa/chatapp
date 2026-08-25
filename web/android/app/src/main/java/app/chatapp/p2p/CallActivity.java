package app.chatapp.p2p;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;

public class CallActivity extends AppCompatActivity {

    private static final int CALL_NOTIFICATION_ID = 9001;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        );

        String callId = getIntent().getStringExtra("callId");
        String callerName = getIntent().getStringExtra("callerName");
        String callType = getIntent().getStringExtra("callType");
        String action = getIntent().getStringExtra("action");

        if ("answer".equals(action)) { handleAnswer(callId); return; }
        if ("decline".equals(action)) { handleDecline(callId); return; }

        setContentView(R.layout.activity_call);

        TextView callTypeView = findViewById(R.id.call_type);
        TextView callerView = findViewById(R.id.caller_name);
        callTypeView.setText("video".equals(callType) ? "Incoming Video Call" : "Incoming Voice Call");
        callerView.setText(callerName != null ? callerName.toUpperCase() : "");

        findViewById(R.id.btn_answer).setOnClickListener(v -> handleAnswer(callId));
        findViewById(R.id.btn_decline).setOnClickListener(v -> handleDecline(callId));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String action = intent.getStringExtra("action");
        String callId = intent.getStringExtra("callId");
        if ("answer".equals(action)) handleAnswer(callId);
        else if ("decline".equals(action)) handleDecline(callId);
    }

    private void handleAnswer(String callId) {
        dismissNotification();
        storeAction("answer", callId);
        // Connect the mic to LiveKit natively RIGHT NOW — don't wait for
        // MainActivity's WebView to cold-boot before audio starts (that boot
        // delay was the whole reason lock-screen answers felt slow/dropped on
        // Android, unlike iOS's native CallEngine.swift path). Must go through
        // startForegroundService() since the service needs to keep running (and
        // the mic open) even after this Activity/MainActivity are gone — the
        // service calls startForeground() immediately for this action.
        startCallService(CallForegroundService.ACTION_ANSWER, callId, true);
        openMainApp();
    }

    private void handleDecline(String callId) {
        dismissNotification();
        storeAction("decline", callId);
        // Short-lived (one Firestore write, then stops) — a plain startService()
        // is enough and avoids having to call startForeground() for a task this
        // brief. Safe to background-start here since CallActivity itself is a
        // visible foreground Activity at this point.
        startCallService(CallForegroundService.ACTION_DECLINE, callId, false);
        openMainApp();
    }

    private void startCallService(String action, String callId, boolean foreground) {
        Intent intent = new Intent(this, CallForegroundService.class);
        intent.setAction(action);
        intent.putExtra(CallForegroundService.EXTRA_CALL_ID, callId);
        if (foreground && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent);
        } else {
            startService(intent);
        }
    }

    private void storeAction(String action, String callId) {
        SharedPreferences prefs = getSharedPreferences("chatapp_call", MODE_PRIVATE);
        prefs.edit()
            .putString("pending_call_action", action)
            .putString("pending_call_id", callId != null ? callId : "")
            .apply();
    }

    private void openMainApp() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(intent);
        finish();
    }

    private void dismissNotification() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(CALL_NOTIFICATION_ID);
    }
}
