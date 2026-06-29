package app.chatapp.p2p;

import android.app.ActivityManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.RemoteMessage;
import io.capawesome.capacitorjs.plugins.firebase.messaging.MessagingService;
import java.util.List;
import java.util.Map;

// Extends the Capacitor Firebase MessagingService so token refresh + foreground
// message events keep flowing to the JS plugin. We only intercept incoming_call
// data messages while the app is in the background to show a full-screen call UI.
public class AppFirebaseMessagingService extends MessagingService {

    private static final int CALL_NOTIFICATION_ID = 9001;
    // A fresh channel id (NOT the JS-created "calls") — channel importance cannot be
    // upgraded after creation, so we own a guaranteed-MAX channel here.
    private static final String CALL_CHANNEL_ID = "incoming_calls_v2";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> data = message.getData();
        if ("incoming_call".equals(data.get("type")) && !isAppInForeground()) {
            showFullScreenCallNotification(data);
            return; // handled — don't forward call pushes to the plugin
        }
        // Everything else (tokens, foreground, normal messages) → Capacitor plugin
        super.onMessageReceived(message);
    }

    private void ensureCallChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CALL_CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(
            CALL_CHANNEL_ID, "Incoming Calls", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Incoming voice and video calls");
        channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[]{0, 1000, 800, 1000, 800});
        AudioAttributes audioAttrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        channel.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE), audioAttrs);
        nm.createNotificationChannel(channel);
    }

    private void showFullScreenCallNotification(Map<String, String> data) {
        ensureCallChannel();

        String callId = data.containsKey("callId") ? data.get("callId") : "";
        String callType = data.containsKey("callType") ? data.get("callType") : "audio";
        String callerName = data.containsKey("callerName") ? data.get("callerName") : "Unknown";
        String title = "video".equals(callType) ? "Incoming Video Call" : "Incoming Voice Call";

        Intent fsIntent = new Intent(this, CallActivity.class);
        fsIntent.putExtra("callId", callId);
        fsIntent.putExtra("callType", callType);
        fsIntent.putExtra("callerName", callerName);
        fsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent fsPendingIntent = PendingIntent.getActivity(
            this, 0, fsIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent answerIntent = new Intent(this, CallActivity.class);
        answerIntent.putExtra("callId", callId);
        answerIntent.putExtra("action", "answer");
        answerIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent answerPending = PendingIntent.getActivity(
            this, 1, answerIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent declineIntent = new Intent(this, CallActivity.class);
        declineIntent.putExtra("callId", callId);
        declineIntent.putExtra("action", "decline");
        declineIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent declinePending = PendingIntent.getActivity(
            this, 2, declineIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CALL_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(callerName != null ? callerName.toUpperCase() : "")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setFullScreenIntent(fsPendingIntent, true)
            .setAutoCancel(false)
            .setOngoing(true)
            .addAction(0, "Decline", declinePending)
            .addAction(0, "Answer", answerPending)
            .setContentIntent(fsPendingIntent);

        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(CALL_NOTIFICATION_ID, builder.build());
    }

    private boolean isAppInForeground() {
        ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        if (am == null) return false;
        List<ActivityManager.RunningAppProcessInfo> processes = am.getRunningAppProcesses();
        if (processes == null) return false;
        for (ActivityManager.RunningAppProcessInfo p : processes) {
            if (p.processName.equals(getPackageName()) &&
                p.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND) {
                return true;
            }
        }
        return false;
    }
}
