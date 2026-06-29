package app.chatapp.p2p;

import android.app.ActivityManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.List;
import java.util.Map;

public class AppFirebaseMessagingService extends FirebaseMessagingService {

    private static final int CALL_NOTIFICATION_ID = 9001;

    @Override
    public void onMessageReceived(RemoteMessage message) {
        Map<String, String> data = message.getData();
        if ("incoming_call".equals(data.get("type")) && !isAppInForeground()) {
            showFullScreenCallNotification(data);
        }
        // Other messages: FCM SDK auto-displays background notifications (notification key)
        // Foreground messages: Capacitor Firebase plugin handles them
    }

    private void showFullScreenCallNotification(Map<String, String> data) {
        String callId = data.containsKey("callId") ? data.get("callId") : "";
        String callType = data.containsKey("callType") ? data.get("callType") : "audio";
        String callerName = data.containsKey("callerName") ? data.get("callerName") : "Unknown";

        String title = "video".equals(callType) ? "Incoming Video Call" : "Incoming Voice Call";

        // Full-screen intent → CallActivity (shown on lock screen)
        Intent fsIntent = new Intent(this, CallActivity.class);
        fsIntent.putExtra("callId", callId);
        fsIntent.putExtra("callType", callType);
        fsIntent.putExtra("callerName", callerName);
        fsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent fsPendingIntent = PendingIntent.getActivity(
            this, 0, fsIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Answer action
        Intent answerIntent = new Intent(this, CallActivity.class);
        answerIntent.putExtra("callId", callId).putExtra("action", "answer");
        answerIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent answerPending = PendingIntent.getActivity(
            this, 1, answerIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Decline action
        Intent declineIntent = new Intent(this, CallActivity.class);
        declineIntent.putExtra("callId", callId).putExtra("action", "decline");
        declineIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent declinePending = PendingIntent.getActivity(
            this, 2, declineIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, "calls")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(callerName != null ? callerName.toUpperCase() : "")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
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
