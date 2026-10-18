package com.smartwallet.app.accessibility;

import android.accessibilityservice.AccessibilityService;
import android.graphics.PixelFormat;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.WindowManager;
import android.widget.TextView;
import com.smartwallet.app.R;

/**
 * 识别成功后在屏幕底部显示"记住此页面"。
 * 使用无障碍悬浮层，不需要额外的悬浮窗权限。
 */
final class RememberPagePrompt {

    private static final String TAG = "SmartWalletCapture";
    private static final long AUTO_DISMISS_MS = 10_000L;

    private final AccessibilityService service;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Runnable dismissRunnable = this::dismiss;
    private View currentView;

    RememberPagePrompt(AccessibilityService service) {
        this.service = service;
    }

    void show(String appLabel, Runnable onConfirm) {
        dismiss();

        View view = LayoutInflater.from(service).inflate(R.layout.overlay_remember_page, null);
        ((TextView) view.findViewById(R.id.remember_page_app)).setText(appLabel);
        view.findViewById(R.id.remember_page_cancel).setOnClickListener(clicked -> dismiss());
        view.findViewById(R.id.remember_page_confirm).setOnClickListener(clicked -> {
            dismiss();
            onConfirm.run();
        });

        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.BOTTOM;

        try {
            windowManager().addView(view, params);
            currentView = view;
            mainHandler.postDelayed(dismissRunnable, AUTO_DISMISS_MS);
        } catch (RuntimeException exception) {
            Log.w(TAG, "Failed to show remember page prompt", exception);
        }
    }

    void dismiss() {
        mainHandler.removeCallbacks(dismissRunnable);
        if (currentView == null) {
            return;
        }
        try {
            windowManager().removeView(currentView);
        } catch (RuntimeException exception) {
            Log.w(TAG, "Failed to dismiss remember page prompt", exception);
        }
        currentView = null;
    }

    private WindowManager windowManager() {
        return (WindowManager) service.getSystemService(AccessibilityService.WINDOW_SERVICE);
    }
}
