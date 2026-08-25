package app.chatapp.p2p;

import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Android counterpart to VoIPPlugin.swift — reads pending call actions stored
// by CallActivity (answer/decline from the lock-screen full-screen call UI).
@CapacitorPlugin(name = "VoIPPlugin")
public class VoIPPlugin extends Plugin {

    @PluginMethod
    public void register(PluginCall call) {
        JSObject result = new JSObject();
        SharedPreferences prefs = getContext().getSharedPreferences("chatapp_call", 0);
        String action = prefs.getString("pending_call_action", "");
        String callId = prefs.getString("pending_call_id", "");
        if (!action.isEmpty()) {
            result.put("pendingCallAction", action);
            result.put("pendingCallId", callId);
            prefs.edit().remove("pending_call_action").remove("pending_call_id").apply();
        }
        call.resolve(result);
    }

    // Hands a fresh Firebase ID token to CallForegroundService so it can
    // authenticate its own Firestore/LiveKit-token REST calls when answering
    // natively while the WebView is asleep — mirrors iOS's
    // NativeWebRTCPlugin.setAuthToken. Must be refreshed on every resume (see
    // useIncomingCalls.ts's syncAuthTokenToNative) since ID tokens expire ~1h.
    @PluginMethod
    public void setAuthToken(PluginCall call) {
        String token = call.getString("token", "");
        getContext().getSharedPreferences("chatapp_call", 0)
            .edit()
            .putString("firebase_id_token", token)
            .apply();
        call.resolve();
    }

    @PluginMethod
    public void endCall(PluginCall call) {
        // No CallKit on Android — dismiss the call notification if still showing
        android.app.NotificationManager nm =
            (android.app.NotificationManager) getContext().getSystemService(android.content.Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(9001);
        call.resolve();
    }

    @PluginMethod
    public void getStartupConversation(PluginCall call) {
        call.resolve(new JSObject().put("conversationId", ""));
    }
}
