package com.smartwallet.app.accessibility;

import android.Manifest;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.SystemClock;
import android.os.UserManager;
import android.provider.Settings;
import android.util.Log;
import android.view.accessibility.AccessibilityManager;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import com.google.android.accessibility.selecttospeak.SelectToSpeakService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/** 已授权服务断连时重连；不重新开启用户主动关闭的服务。 */
public final class AccessibilityRecovery {
    private static final String TAG = "WalletA11yRecovery";
    private static final String PENDING = "pendingReconnect";
    private static final long RETRY_INTERVAL_MS = 60_000;
    private static ScheduledExecutorService monitor;
    private static long lastAttempt;

    private AccessibilityRecovery() {}

    public static synchronized void initialize(Context context) {
        if (monitor != null) return;
        Context app = context.getApplicationContext();
        WorkManager.getInstance(app).enqueueUniquePeriodicWork(
            "wallet-accessibility-recovery", ExistingPeriodicWorkPolicy.KEEP,
            new PeriodicWorkRequest.Builder(AccessibilityRecoveryWorker.class, 15, TimeUnit.MINUTES).build()
        );
        monitor = Executors.newSingleThreadScheduledExecutor();
        monitor.scheduleWithFixedDelay(() -> recover(app), 15, 20, TimeUnit.SECONDS);
    }

    // 后台线程调用。工作管理器用于进程退出后的兜底，存活期间用短周期检测。
    public static synchronized boolean recover(Context context) {
        try {
            UserManager users = context.getSystemService(UserManager.class);
            if (users == null || !users.isUserUnlocked()) return true;
            if (context.checkSelfPermission(Manifest.permission.WRITE_SECURE_SETTINGS) != PackageManager.PERMISSION_GRANTED) {
                return true;
            }
            SharedPreferences state = context.getSharedPreferences("accessibility-recovery", Context.MODE_PRIVATE);
            String target = new ComponentName(context, SelectToSpeakService.class).flattenToString();
            // 若进程恰好在短暂移除组件时退出，先补回这次未完成的操作。
            if (state.getBoolean(PENDING, false)) {
                if (!writeServices(context, AccessibilityServiceList.with(readServices(context), target))) return false;
                state.edit().remove(PENDING).commit();
                Log.i(TAG, "Completed interrupted reconnect");
                SystemClock.sleep(3_000);
            }
            if (!AccessibilityCaptureService.isEnabledInSystem(context) || isBound(context, target)) return true;
            long now = SystemClock.elapsedRealtime();
            if (lastAttempt != 0 && now - lastAttempt < RETRY_INTERVAL_MS) return false;

            // 给系统正常绑定留出时间，避免进程启动和更新期间反复切换。
            SystemClock.sleep(3_000);
            if (!AccessibilityCaptureService.isEnabledInSystem(context) || isBound(context, target)) return true;
            String services = readServices(context);
            if (!AccessibilityServiceList.contains(services, target)) return true;
            lastAttempt = SystemClock.elapsedRealtime();
            if (!state.edit().putBoolean(PENDING, true).commit()) return false;
            Log.i(TAG, "Reconnecting enabled but disconnected service");
            try {
                if (!writeServices(context, AccessibilityServiceList.without(services, target))) return false;
                SystemClock.sleep(500);
            } finally {
                // 重新读取，避免覆盖重连期间其他服务的设置变化。
                if (writeServices(context, AccessibilityServiceList.with(readServices(context), target))) {
                    state.edit().remove(PENDING).commit();
                }
            }
            SystemClock.sleep(3_000);
            boolean connected = isBound(context, target);
            Log.i(TAG, connected ? "Service reconnected" : "Reconnect pending; will retry");
            return connected;
        } catch (RuntimeException error) {
            Log.e(TAG, "Reconnect failed", error);
            return false;
        }
    }

    public static boolean isServiceBound(Context context) {
        return isBound(context, new ComponentName(context, SelectToSpeakService.class).flattenToString());
    }

    private static boolean isBound(Context context, String target) {
        AccessibilityManager manager = context.getSystemService(AccessibilityManager.class);
        if (manager == null) return false;
        for (AccessibilityServiceInfo info : manager.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)) {
            if (target.equals(info.getId())) return true;
        }
        return false;
    }

    private static String readServices(Context context) {
        return Settings.Secure.getString(context.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
    }

    private static boolean writeServices(Context context, String services) {
        return Settings.Secure.putString(context.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES, services);
    }
}
