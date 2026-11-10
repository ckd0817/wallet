package com.smartwallet.app.accessibility;

import android.Manifest;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;

/** 设备授权即时读取，不写入账本或云端。 */
public final class AccessibilityRecoveryAccess {
    private AccessibilityRecoveryAccess() {}

    public static String grantCommand(Context context) {
        return "adb shell pm grant " + context.getPackageName() + " android.permission.WRITE_SECURE_SETTINGS";
    }

    public static JSObject status(Context context) {
        JSObject result = new JSObject();
        result.put("secureSettingsGranted", context.checkSelfPermission(Manifest.permission.WRITE_SECURE_SETTINGS) == PackageManager.PERMISSION_GRANTED);
        result.put("accessibilityEnabled", AccessibilityCaptureService.isEnabledInSystem(context));
        result.put("accessibilityConnected", AccessibilityRecovery.isServiceBound(context));
        result.put("notificationPermissionGranted", com.smartwallet.app.screencapture.NotificationHelper.isNotificationPermissionGranted(context));
        PowerManager power = context.getSystemService(PowerManager.class);
        result.put("batteryOptimizationIgnored", power != null && power.isIgnoringBatteryOptimizations(context.getPackageName()));
        // 厂商没有统一的公开检测接口，不把打开过设置当作授权成功。
        result.put("autoStartStatus", "unknown");
        result.put("manufacturer", Build.MANUFACTURER);
        result.put("grantCommand", grantCommand(context));
        return result;
    }

    public static void copyGrantCommand(Context context) {
        ClipboardManager clipboard = context.getSystemService(ClipboardManager.class);
        if (clipboard == null) throw new IllegalStateException("剪贴板不可用");
        clipboard.setPrimaryClip(ClipData.newPlainText("自动恢复授权", grantCommand(context)));
    }

    public static String openBackgroundSettings(Context context) {
        String manufacturer = Build.MANUFACTURER.toLowerCase(java.util.Locale.ROOT);
        String[][] candidates = manufacturer.contains("xiaomi") || manufacturer.contains("redmi")
            ? new String[][] {{"com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"}}
            : manufacturer.contains("huawei") || manufacturer.contains("honor")
                ? new String[][] {{"com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"}}
                : manufacturer.contains("oppo") || manufacturer.contains("realme") || manufacturer.contains("oneplus")
                    ? new String[][] {{"com.oplus.safecenter", "com.oplus.safecenter.startupapp.StartupAppListActivity"}, {"com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"}}
                    : manufacturer.contains("vivo")
                        ? new String[][] {{"com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"}}
                        : new String[0][];
        for (String[] candidate : candidates) {
            Intent intent = new Intent().setComponent(new ComponentName(candidate[0], candidate[1]));
            if (start(context, intent)) return "autostart";
        }
        if (start(context, new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + context.getPackageName())))) {
            return "appDetails";
        }
        throw new IllegalStateException("无法打开后台设置");
    }

    public static void openDeveloperSettings(Context context) {
        if (!start(context, new Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS)) &&
            !start(context, new Intent(Settings.ACTION_DEVICE_INFO_SETTINGS))) {
            throw new IllegalStateException("无法打开开发者设置");
        }
    }

    private static boolean start(Context context, Intent intent) {
        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            return true;
        } catch (android.content.ActivityNotFoundException | SecurityException error) {
            return false;
        }
    }
}
