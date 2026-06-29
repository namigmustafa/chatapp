package app.chatapp.p2p;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VoIPPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // When CallActivity opens the app while it's already running, trigger a JS event
        // so useIncomingCalls picks up the answer/decline without waiting for next register() call.
        notifyCallAction();
    }

    @Override
    public void onResume() {
        super.onResume();
        notifyCallAction();
    }

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
