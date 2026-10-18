package com.smartwallet.app.accessibility;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.view.inputmethod.InputMethodInfo;
import android.view.inputmethod.InputMethodManager;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 过滤系统界面、桌面、输入法和本应用，只保留可能出现账单页面的前台应用。
 */
final class ForegroundAppFilter {

    private final Context appContext;
    private final Set<String> excludedPackages = new HashSet<>();
    private final Map<String, Boolean> activityCache = new ConcurrentHashMap<>();

    ForegroundAppFilter(Context context) {
        appContext = context.getApplicationContext();
        excludedPackages.add(appContext.getPackageName());
        excludedPackages.add("android");
        PackageManager packageManager = appContext.getPackageManager();
        Intent homeIntent = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        for (ResolveInfo info : packageManager.queryIntentActivities(homeIntent, 0)) {
            if (info.activityInfo != null) {
                excludedPackages.add(info.activityInfo.packageName);
            }
        }
        InputMethodManager inputMethodManager = appContext.getSystemService(InputMethodManager.class);
        if (inputMethodManager != null) {
            for (InputMethodInfo info : inputMethodManager.getEnabledInputMethodList()) {
                excludedPackages.add(info.getPackageName());
            }
        }
    }

    boolean isCandidate(CharSequence packageName) {
        if (packageName == null || packageName.length() == 0) {
            return false;
        }
        String value = packageName.toString();
        String lower = value.toLowerCase();
        return !excludedPackages.contains(value) && !lower.startsWith("com.android.") && !lower.contains("systemui");
    }

    /** 窗口事件的 className 可能是弹窗或控件，只有确认为 Activity 才用于页面匹配。 */
    boolean isActivity(String packageName, String className) {
        if (packageName == null || className == null || className.isEmpty()) {
            return false;
        }
        String cacheKey = packageName + "/" + className;
        Boolean cached = activityCache.get(cacheKey);
        if (cached != null) {
            return cached;
        }
        boolean resolved;
        try {
            appContext.getPackageManager().getActivityInfo(new ComponentName(packageName, className), 0);
            resolved = true;
        } catch (PackageManager.NameNotFoundException exception) {
            resolved = false;
        }
        activityCache.put(cacheKey, resolved);
        return resolved;
    }

    String resolveAppLabel(String packageName) {
        try {
            PackageManager packageManager = appContext.getPackageManager();
            ApplicationInfo info = packageManager.getApplicationInfo(packageName, 0);
            CharSequence label = packageManager.getApplicationLabel(info);
            return label == null ? packageName : label.toString();
        } catch (PackageManager.NameNotFoundException exception) {
            return packageName;
        }
    }
}
