package app.chatapp.p2p;

import android.app.NotificationManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VoIPPlugin.class);
        super.onCreate(savedInstanceState);
        ensureFullScreenIntentPermission();
    }

    // On Android 14+ (API 34+), USE_FULL_SCREEN_INTENT is NOT auto-granted to
    // non-dialer apps. Without it, the incoming-call full-screen intent silently
    // degrades to a heads-up notification — so the lock-screen call UI never shows.
    // Send the user to the system settings page to grant it (once).
    private void ensureFullScreenIntentPermission() {
        if (Build.VERSION.SDK_INT < 34) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null && !nm.canUseFullScreenIntent()) {
            try {
                Intent intent = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                intent.setData(Uri.parse("package:" + getPackageName()));
                startActivity(intent);
            } catch (Exception ignored) {}
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        notifyCallAction();
    }

    @Override
    public void onResume() {
        super.onResume();
        notifyCallAction();
    }

    // When CallActivity opens the app (already running or freshly launched), forward
    // the stored answer/decline action to JS so useIncomingCalls can act on it.
    private void notifyCallAction() {
        android.content.SharedPreferences prefs =
            getSharedPreferences("chatapp_call", MODE_PRIVATE);
        String action = prefs.getString("pending_call_action", "");
        String callId = prefs.getString("pending_call_id", "");
        if (action.isEmpty() || getBridge() == null) return;

        prefs.edit().remove("pending_call_action").remove("pending_call_id").apply();

        final String a = action, c = callId;
        getBridge().getWebView().post(() ->
            getBridge().getWebView().evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('nativeCallAction'," +
                "{detail:{action:'" + a + "',callId:'" + c + "'}}));",
                null
            )
        );
    }
}
