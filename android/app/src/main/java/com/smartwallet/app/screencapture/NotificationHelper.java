package com.smartwallet.app.screencapture;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.smartwallet.app.MainActivity;
import com.smartwallet.app.R;
import com.smartwallet.app.accessibility.AccessibilityCaptureActionReceiver;
import com.smartwallet.app.accessibility.AccessibilityCaptureService;
import org.json.JSONObject;

public final class NotificationHelper {

    public static final String CHANNEL_ID = "screen_capture_bookkeeping";
    public static final int READY_NOTIFICATION_ID = 31001;

    private NotificationHelper() {}

    public static void ensureChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager notificationManager = context.getSystemService(NotificationManager.class);
        if (notificationManager == null) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.screen_capture_channel_name),
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription(context.getString(R.string.screen_capture_channel_description));
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        notificationManager.createNotificationChannel(channel);
    }

    public static boolean isNotificationPermissionGranted(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        }
        return NotificationManagerCompat.from(context).areNotificationsEnabled();
    }

    public static boolean hasActiveReadyNotification(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return false;
        }

        NotificationManager notificationManager = context.getSystemService(NotificationManager.class);
        if (notificationManager == null) {
            return false;
        }

        StatusBarNotification[] activeNotifications = notificationManager.getActiveNotifications();
        if (activeNotifications == null) {
            return false;
        }

        for (StatusBarNotification notification : activeNotifications) {
            if (notification == null) {
                continue;
            }
            if (READY_NOTIFICATION_ID == notification.getId() && context.getPackageName().equals(notification.getPackageName())) {
                return true;
            }
        }

        return false;
    }

    public static void showReadyNotification(Context context, boolean captureInProgress) {
        if (!isNotificationPermissionGranted(context)) {
            return;
        }

        NotificationManagerCompat.from(context).notify(READY_NOTIFICATION_ID, buildReadyNotification(context, captureInProgress));
    }

    public static void cancelReadyNotification(Context context) {
        NotificationManagerCompat.from(context).cancel(READY_NOTIFICATION_ID);
    }

    public static Notification buildReadyNotification(Context context, boolean captureInProgress) {
        PendingIntent captureIntent = PendingIntent.getBroadcast(
            context,
            1,
            new Intent(context, AccessibilityCaptureActionReceiver.class).setAction(AccessibilityCaptureService.ACTION_CAPTURE_NOW),
            pendingIntentFlags()
        );
        String notificationText = captureInProgress
            ? context.getString(R.string.screen_capture_notification_progress_text)
            : context.getString(R.string.screen_capture_notification_text);

        return new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setContentTitle(context.getString(R.string.screen_capture_notification_title))
            .setContentText(notificationText)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(notificationText))
            .setContentIntent(captureIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .addAction(android.R.drawable.ic_menu_camera, context.getString(R.string.screen_capture_capture_action), captureIntent)
            .build();
    }

    public static void showCaptureResult(Context context, JSONObject transaction) {
        if (!isNotificationPermissionGranted(context)) {
            return;
        }

        String transactionId = transaction.optString("id");
        PendingIntent editIntent = PendingIntent.getActivity(
            context,
            transactionId.hashCode(),
            buildDeepLinkIntent(context, transactionId),
            pendingIntentFlags()
        );
        String resultLine = NotificationTextFormatter.buildCaptureResultLine(transaction);
        String resultSummary = NotificationTextFormatter.buildCaptureResultSummary(transaction);

        Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_save)
            .setContentTitle(context.getString(R.string.screen_capture_success_title))
            .setContentText(resultLine)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(resultSummary))
            .setAutoCancel(true)
            .setContentIntent(editIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setPublicVersion(buildPublicCaptureResultNotification(context, resultLine, resultSummary))
            .build();

        NotificationManagerCompat.from(context).notify((int) (System.currentTimeMillis() % Integer.MAX_VALUE), notification);
    }

    public static void showCaptureFailure(Context context, String message) {
        if (!isNotificationPermissionGranted(context)) {
            return;
        }
        String failureText = NotificationTextFormatter.buildFailureText(message);

        Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_error)
            .setContentTitle(context.getString(R.string.screen_capture_failure_title))
            .setContentText(failureText)
            .setAutoCancel(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_ERROR)
            .setPublicVersion(
                new NotificationCompat.Builder(context, CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.stat_notify_error)
                    .setContentTitle(context.getString(R.string.screen_capture_failure_title))
                    .setContentText(failureText)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                    .build()
            )
            .build();

        NotificationManagerCompat.from(context).notify((int) (System.currentTimeMillis() % Integer.MAX_VALUE), notification);
    }

    private static Notification buildPublicCaptureResultNotification(Context context, String resultLine, String resultSummary) {
        return new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_save)
            .setContentTitle(context.getString(R.string.screen_capture_success_title))
            .setContentText(resultLine)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(resultSummary))
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build();
    }

    private static Intent buildDeepLinkIntent(Context context, String transactionId) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("smartwallet://transaction/" + Uri.encode(transactionId) + "/edit"));
        intent.setClass(context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        return intent;
    }

    private static int pendingIntentFlags() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            : PendingIntent.FLAG_UPDATE_CURRENT;
    }
}
