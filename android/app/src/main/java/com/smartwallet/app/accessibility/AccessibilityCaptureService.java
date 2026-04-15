package com.smartwallet.app.accessibility;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityService.ScreenshotResult;
import android.content.ComponentName;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.ColorSpace;
import android.hardware.HardwareBuffer;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.TextUtils;
import android.util.Log;
import android.view.Display;
import android.view.accessibility.AccessibilityEvent;
import com.smartwallet.app.R;
import com.smartwallet.app.ScreenCaptureBookkeepingPlugin;
import com.smartwallet.app.data.WalletRepository;
import com.smartwallet.app.screencapture.CaptureProcessingEngine;
import com.smartwallet.app.screencapture.NotificationHelper;
import java.io.ByteArrayOutputStream;
import java.lang.ref.WeakReference;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONException;
import org.json.JSONObject;

public class AccessibilityCaptureService extends AccessibilityService {

    public static final String ACTION_CAPTURE_NOW = "com.smartwallet.app.action.ACCESSIBILITY_CAPTURE_NOW";
    private static final long SCREENSHOT_DELAY_MS = 350L;
    private static final String TAG = "SmartWalletCapture";
    private static final AtomicReference<WeakReference<AccessibilityCaptureService>> ACTIVE_INSTANCE = new AtomicReference<>();

    private final AtomicBoolean captureInProgress = new AtomicBoolean(false);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private volatile String pendingScreenshotReason = "delayed-after-notification";
    private final Runnable delayedScreenshotRunnable = () -> takeScreenshotNow(pendingScreenshotReason);
    private ExecutorService captureExecutor;
    private CaptureProcessingEngine processingEngine;

    public static boolean isConnected() {
        WeakReference<AccessibilityCaptureService> reference = ACTIVE_INSTANCE.get();
        return reference != null && reference.get() != null;
    }

    public static boolean isEnabledInSystem(Context context) {
        if (context == null) {
            return false;
        }

        int enabled = Settings.Secure.getInt(context.getContentResolver(), Settings.Secure.ACCESSIBILITY_ENABLED, 0);
        if (enabled != 1) {
            return false;
        }

        String enabledServices = Settings.Secure.getString(
            context.getContentResolver(),
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        );
        if (enabledServices == null || enabledServices.isEmpty()) {
            return false;
        }

        ComponentName targetService = new ComponentName(context, AccessibilityCaptureService.class);
        TextUtils.SimpleStringSplitter splitter = new TextUtils.SimpleStringSplitter(':');
        splitter.setString(enabledServices);
        while (splitter.hasNext()) {
            ComponentName enabledService = ComponentName.unflattenFromString(splitter.next());
            if (targetService.equals(enabledService)) {
                return true;
            }
        }

        return false;
    }

    public static void requestCapture(Context context) {
        AccessibilityCaptureService service = getActiveService();
        if (service == null) {
            updateFailure(context, isEnabledInSystem(context) ? "无障碍服务尚未就绪，请稍后重试" : "请先开启无障碍服务");
            return;
        }

        service.requestCaptureInternal();
    }

    public static void syncReadyNotification(Context context) {
        if (context == null) {
            return;
        }

        Context appContext = context.getApplicationContext();
        AccessibilityCaptureService service = getActiveService();
        if (service != null && isConnected() && isEnabledInSystem(appContext)) {
            NotificationHelper.updateForegroundNotification(service, false);
        } else if (isConnected() && isEnabledInSystem(appContext) && NotificationHelper.isNotificationPermissionGranted(appContext)) {
            NotificationHelper.showReadyNotification(appContext, false);
        } else {
            NotificationHelper.cancelReadyNotification(appContext);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        captureExecutor = Executors.newSingleThreadExecutor();
        processingEngine = new CaptureProcessingEngine(getApplicationContext());
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        ACTIVE_INSTANCE.set(new WeakReference<>(this));
        NotificationHelper.ensureChannels(this);
        NotificationHelper.startForegroundNotification(this, false);
        persistCapabilityStatus(null);
        Log.i(TAG, "Accessibility capture service connected as foreground");
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {}

    @Override
    public void onInterrupt() {}

    @Override
    public boolean onUnbind(android.content.Intent intent) {
        clearActiveService();
        NotificationHelper.cancelReadyNotification(this);
        persistCapabilityStatus(null);
        return super.onUnbind(intent);
    }

    @Override
    public void onDestroy() {
        clearActiveService();
        stopForeground(STOP_FOREGROUND_REMOVE);
        NotificationHelper.cancelReadyNotification(this);
        if (captureExecutor != null) {
            captureExecutor.shutdownNow();
            captureExecutor = null;
        }
        mainHandler.removeCallbacks(delayedScreenshotRunnable);
        persistCapabilityStatus(null);
        super.onDestroy();
    }

    private void requestCaptureInternal() {
        if (!isEnabledInSystem(this)) {
            updateFailure(this, "请先开启无障碍服务");
            return;
        }

        if (!captureInProgress.compareAndSet(false, true)) {
            return;
        }

        NotificationHelper.updateForegroundNotification(this, true);

        Log.i(TAG, "Accessibility screenshot requested; dismissing notification shade first");
        boolean dismissed = performGlobalAction(GLOBAL_ACTION_DISMISS_NOTIFICATION_SHADE);
        if (!dismissed) {
            Log.w(TAG, "Failed to dismiss notification shade before capture");
        }

        pendingScreenshotReason = dismissed ? "dismiss-notification-delayed" : "dismiss-notification-failed-delayed";
        mainHandler.removeCallbacks(delayedScreenshotRunnable);
        mainHandler.postDelayed(delayedScreenshotRunnable, SCREENSHOT_DELAY_MS);
    }

    private void takeScreenshotNow(String reason) {
        if (!captureInProgress.get()) {
            return;
        }

        Log.i(TAG, "Taking screenshot immediately, reason=" + reason);
        takeScreenshot(
            Display.DEFAULT_DISPLAY,
            getMainExecutor(),
            new TakeScreenshotCallback() {
                @Override
                public void onSuccess(ScreenshotResult screenshotResult) {
                    ExecutorService executor = captureExecutor;
                    if (executor == null) {
                        finishCapture();
                        updateFailure(AccessibilityCaptureService.this, "截图服务不可用，请稍后重试");
                        return;
                    }
                    executor.execute(() -> handleScreenshotSuccess(screenshotResult));
                }

                @Override
                public void onFailure(int errorCode) {
                    ExecutorService executor = captureExecutor;
                    if (executor == null) {
                        finishCapture();
                        updateFailure(AccessibilityCaptureService.this, resolveScreenshotError(errorCode));
                        return;
                    }
                    executor.execute(() -> handleScreenshotFailure(errorCode));
                }
            }
        );
    }

    private void handleScreenshotSuccess(ScreenshotResult screenshotResult) {
        try {
            byte[] pngBytes = screenshotToPng(screenshotResult);
            processingEngine.processCapture(pngBytes);
        } catch (Exception exception) {
            Log.e(TAG, "Accessibility screenshot processing failed", exception);
            processingEngine.recordFailure("pre_capture", resolveExceptionMessage(exception));
        } finally {
            finishCapture();
        }
    }

    private void handleScreenshotFailure(int errorCode) {
        processingEngine.recordFailure("pre_capture", resolveScreenshotError(errorCode));
        finishCapture();
    }

    private void finishCapture() {
        captureInProgress.set(false);
        mainHandler.removeCallbacks(delayedScreenshotRunnable);
        syncReadyNotification(this);
    }

    private void persistCapabilityStatus(String lastError) {
        JSONObject updates = new JSONObject();
        safePut(updates, "accessibilityEnabled", isEnabledInSystem(this));
        safePut(updates, "notificationPermissionGranted", NotificationHelper.isNotificationPermissionGranted(this));
        if (lastError != null) {
            safePut(updates, "lastError", lastError.isEmpty() ? "" : lastError);
        }
        WalletRepository repository = WalletRepository.getInstance(this);
        JSONObject settings = repository.saveAutoBookkeepingSettings(updates);
        ScreenCaptureBookkeepingPlugin.emitStatusChanged(settings);
    }

    private static AccessibilityCaptureService getActiveService() {
        WeakReference<AccessibilityCaptureService> reference = ACTIVE_INSTANCE.get();
        return reference == null ? null : reference.get();
    }

    private static void updateFailure(Context context, String message) {
        Context appContext = context.getApplicationContext();
        WalletRepository repository = WalletRepository.getInstance(appContext);
        JSONObject updates = new JSONObject();
        try {
            updates.put("lastError", message);
            updates.put("notificationPermissionGranted", NotificationHelper.isNotificationPermissionGranted(appContext));
            updates.put("accessibilityEnabled", isEnabledInSystem(appContext));
        } catch (JSONException ignored) {}
        JSONObject settings = repository.saveAutoBookkeepingSettings(updates);
        NotificationHelper.showCaptureFailure(appContext, message);
        ScreenCaptureBookkeepingPlugin.emitStatusChanged(settings);
    }

    private void clearActiveService() {
        WeakReference<AccessibilityCaptureService> current = ACTIVE_INSTANCE.get();
        if (current != null && current.get() == this) {
            ACTIVE_INSTANCE.set(null);
        }
    }

    private byte[] screenshotToPng(ScreenshotResult screenshotResult) throws Exception {
        HardwareBuffer hardwareBuffer = screenshotResult.getHardwareBuffer();
        if (hardwareBuffer == null) {
            throw new IllegalStateException("未拿到屏幕缓冲区");
        }

        Bitmap wrappedBitmap = null;
        Bitmap bitmap = null;
        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        try {
            ColorSpace colorSpace = screenshotResult.getColorSpace();
            wrappedBitmap = Bitmap.wrapHardwareBuffer(hardwareBuffer, colorSpace);
            if (wrappedBitmap == null) {
                throw new IllegalStateException("无法解析截图缓冲区");
            }

            bitmap = wrappedBitmap.copy(Bitmap.Config.ARGB_8888, false);
            if (bitmap == null) {
                throw new IllegalStateException("无法复制截图内容");
            }

            bitmap.compress(Bitmap.CompressFormat.PNG, 100, outputStream);
            return outputStream.toByteArray();
        } finally {
            if (bitmap != null) {
                bitmap.recycle();
            }
            if (wrappedBitmap != null) {
                wrappedBitmap.recycle();
            }
            hardwareBuffer.close();
            outputStream.close();
        }
    }

    private String resolveScreenshotError(int errorCode) {
        if (errorCode == ERROR_TAKE_SCREENSHOT_SECURE_WINDOW) {
            return getString(R.string.screen_capture_error_locked_or_secure);
        }
        if (errorCode == ERROR_TAKE_SCREENSHOT_INVALID_DISPLAY) {
            return getString(R.string.screen_capture_error_invalid_display);
        }
        if (errorCode == ERROR_TAKE_SCREENSHOT_NO_ACCESSIBILITY_ACCESS) {
            return getString(R.string.screen_capture_error_accessibility_unavailable);
        }
        if (errorCode == ERROR_TAKE_SCREENSHOT_INTERVAL_TIME_SHORT) {
            return getString(R.string.screen_capture_error_too_frequent);
        }
        if (errorCode == ERROR_TAKE_SCREENSHOT_INVALID_WINDOW) {
            return getString(R.string.screen_capture_error_invalid_window);
        }
        return getString(R.string.screen_capture_error_generic);
    }

    private String resolveExceptionMessage(Exception exception) {
        if (exception == null || exception.getMessage() == null || exception.getMessage().trim().isEmpty()) {
            return getString(R.string.screen_capture_error_generic);
        }
        return getString(R.string.screen_capture_error_prefix, exception.getMessage().trim());
    }

    private void safePut(JSONObject object, String key, Object value) {
        try {
            object.put(key, value);
        } catch (JSONException ignored) {}
    }
}
