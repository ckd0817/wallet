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
import android.os.SystemClock;
import android.provider.Settings;
import android.text.TextUtils;
import android.util.Log;
import android.view.Display;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import com.google.android.accessibility.selecttospeak.SelectToSpeakService;
import com.smartwallet.app.R;
import com.smartwallet.app.ScreenCaptureBookkeepingPlugin;
import com.smartwallet.app.data.WalletRepository;
import com.smartwallet.app.screencapture.CaptureProcessingEngine;
import com.smartwallet.app.screencapture.NotificationHelper;
import java.io.ByteArrayOutputStream;
import java.lang.ref.WeakReference;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * 截图记账无障碍服务的实现。系统中注册的组件为
 * {@link com.google.android.accessibility.selecttospeak.SelectToSpeakService}。
 */
public abstract class AccessibilityCaptureService extends AccessibilityService {

    public static final String ACTION_CAPTURE_NOW = "com.smartwallet.app.action.ACCESSIBILITY_CAPTURE_NOW";
    public static final String SETTING_PAYMENT_AUTO_CAPTURE = "paymentAutoCapture";
    private static final long SCREENSHOT_DELAY_MS = 350L;
    // 页面内容停止变化后再判定，持续变化时最多等待 MAX 时长
    private static final long PAGE_SETTLE_MS = 600L;
    private static final long PAGE_MAX_SETTLE_MS = 1500L;
    // WebView 页面层级较深，节点上限需覆盖 H5 支付结果页
    private static final int MAX_NODE_DEPTH = 60;
    private static final int MAX_NODE_COUNT = 800;
    private static final int STRUCTURE_MAX_DEPTH = 5;
    private static final int STRUCTURE_MAX_CHILDREN = 10;
    private static final String TAG = "SmartWalletCapture";
    private static final AtomicReference<WeakReference<AccessibilityCaptureService>> ACTIVE_INSTANCE = new AtomicReference<>();
    private static volatile boolean paymentAutoCaptureEnabled = true;

    private final AtomicBoolean captureInProgress = new AtomicBoolean(false);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final AutoCaptureGate autoCaptureGate = new AutoCaptureGate();
    private volatile String pendingScreenshotReason = "delayed-after-notification";
    private volatile boolean pendingCaptureManual = true;
    private final Runnable delayedScreenshotRunnable = () -> takeScreenshotNow(pendingScreenshotReason);
    private final Runnable pageCheckRunnable = this::checkCurrentPage;
    private long pageCheckPendingSince = 0L;
    private String topPackage = "";
    private String topActivity = "";
    private ForegroundAppFilter appFilter;
    private RememberPagePrompt rememberPagePrompt;
    private ExecutorService captureExecutor;
    private CaptureProcessingEngine processingEngine;

    /** 手动截图时的页面特征，识别成功后用于询问是否记住此页面。 */
    private static final class PageSnapshot {
        final String packageName;
        final String activityName;
        final String structureFingerprint;
        final String appLabel;

        PageSnapshot(String packageName, String activityName, String structureFingerprint, String appLabel) {
            this.packageName = packageName;
            this.activityName = activityName;
            this.structureFingerprint = structureFingerprint;
            this.appLabel = appLabel;
        }
    }

    public static void setPaymentAutoCaptureEnabled(boolean enabled) {
        paymentAutoCaptureEnabled = enabled;
    }

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

        ComponentName targetService = new ComponentName(context, SelectToSpeakService.class);
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
        paymentAutoCaptureEnabled = WalletRepository.getInstance(this)
            .getAutoBookkeepingSettings()
            .optBoolean(SETTING_PAYMENT_AUTO_CAPTURE, true);
        RememberedPageStore.load(this);
        appFilter = new ForegroundAppFilter(this);
        rememberPagePrompt = new RememberPagePrompt(this);
        Log.i(TAG, "Accessibility capture service connected as foreground");
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || appFilter == null || !appFilter.isCandidate(event.getPackageName())) {
            return;
        }

        String packageName = event.getPackageName().toString();
        if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            String className = toText(event.getClassName());
            if (appFilter.isActivity(packageName, className)) {
                topActivity = className;
            } else if (!packageName.equals(topPackage)) {
                topActivity = "";
            }
            topPackage = packageName;
        }

        if (!paymentAutoCaptureEnabled) {
            return;
        }
        long now = SystemClock.uptimeMillis();
        if (pageCheckPendingSince == 0L) {
            pageCheckPendingSince = now;
        } else if (now - pageCheckPendingSince >= PAGE_MAX_SETTLE_MS) {
            return;
        }
        mainHandler.removeCallbacks(pageCheckRunnable);
        mainHandler.postDelayed(pageCheckRunnable, PAGE_SETTLE_MS);
    }

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
        mainHandler.removeCallbacks(pageCheckRunnable);
        if (rememberPagePrompt != null) {
            rememberPagePrompt.dismiss();
        }
        persistCapabilityStatus(null);
        super.onDestroy();
    }

    private void checkCurrentPage() {
        pageCheckPendingSince = 0L;
        if (!paymentAutoCaptureEnabled || captureInProgress.get()) {
            return;
        }

        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) {
            return;
        }
        CharSequence packageName = root.getPackageName();
        if (!appFilter.isCandidate(packageName)) {
            autoCaptureGate.rearm();
            return;
        }

        String packageValue = packageName.toString();
        List<String> texts = collectNodeTexts(root);
        String matchedBy = "";
        if (PaymentPageDetector.isPaymentSuccessPage(texts)) {
            matchedBy = "payment-page";
        } else if (
            RememberedPageStore.hasPackage(RememberedPageStore.cached(), packageValue) &&
            PaymentPageDetector.hasAmount(texts) &&
            RememberedPageStore.matches(
                RememberedPageStore.cached(),
                packageValue,
                activityFor(packageValue),
                buildStructureFingerprint(root)
            )
        ) {
            matchedBy = "remembered-page";
        }
        if (matchedBy.isEmpty()) {
            autoCaptureGate.rearm();
            return;
        }

        String fingerprint = PaymentPageDetector.fingerprint(packageValue, texts);
        if (!autoCaptureGate.tryAcquire(fingerprint, System.currentTimeMillis())) {
            return;
        }

        Log.i(TAG, "Auto capture triggered by " + matchedBy + ", package=" + packageValue);
        pendingScreenshotReason = matchedBy;
        startCapture(false);
    }

    private String activityFor(String packageName) {
        return packageName.equals(topPackage) ? topActivity : "";
    }

    /** 视图结构指纹：类名 + 资源 id 骨架，不含文字，同一页面布局保持一致。 */
    private String buildStructureFingerprint(AccessibilityNodeInfo root) {
        StringBuilder builder = new StringBuilder();
        appendStructure(builder, root, 0);
        return Integer.toHexString(builder.toString().hashCode());
    }

    private void appendStructure(StringBuilder builder, AccessibilityNodeInfo node, int depth) {
        String className = toText(node.getClassName());
        builder.append(className.substring(className.lastIndexOf('.') + 1));
        String viewId = node.getViewIdResourceName();
        if (viewId != null && !viewId.isEmpty()) {
            builder.append('#').append(viewId.substring(viewId.lastIndexOf('/') + 1));
        }
        if (depth >= STRUCTURE_MAX_DEPTH) {
            return;
        }
        int childCount = Math.min(node.getChildCount(), STRUCTURE_MAX_CHILDREN);
        if (childCount == 0) {
            return;
        }
        builder.append('[');
        for (int index = 0; index < childCount; index++) {
            AccessibilityNodeInfo child = node.getChild(index);
            if (child != null) {
                appendStructure(builder, child, depth + 1);
                builder.append(',');
            }
        }
        builder.append(']');
    }

    /** 手动截图前记录页面特征；已能自动识别的页面不再询问。 */
    private PageSnapshot capturePageSnapshot() {
        if (!paymentAutoCaptureEnabled || appFilter == null) {
            return null;
        }
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || !appFilter.isCandidate(root.getPackageName())) {
            return null;
        }
        String packageName = root.getPackageName().toString();
        String activityName = activityFor(packageName);
        String structureFingerprint = buildStructureFingerprint(root);
        if (
            RememberedPageStore.matches(RememberedPageStore.cached(), packageName, activityName, structureFingerprint) ||
            PaymentPageDetector.isPaymentSuccessPage(collectNodeTexts(root))
        ) {
            return null;
        }
        return new PageSnapshot(packageName, activityName, structureFingerprint, appFilter.resolveAppLabel(packageName));
    }

    private void promptRememberPage(PageSnapshot snapshot) {
        if (rememberPagePrompt == null) {
            return;
        }
        rememberPagePrompt.show(snapshot.appLabel, () -> {
            JSONObject page = RememberedPageStore.createPage(
                snapshot.packageName,
                snapshot.activityName,
                snapshot.structureFingerprint,
                snapshot.appLabel,
                System.currentTimeMillis()
            );
            ExecutorService executor = captureExecutor;
            if (executor != null) {
                executor.execute(() -> RememberedPageStore.add(getApplicationContext(), page));
            }
        });
    }

    private List<String> collectNodeTexts(AccessibilityNodeInfo root) {
        List<String> texts = new ArrayList<>();
        ArrayDeque<AccessibilityNodeInfo> nodes = new ArrayDeque<>();
        ArrayDeque<Integer> depths = new ArrayDeque<>();
        nodes.push(root);
        depths.push(0);
        int visited = 0;
        while (!nodes.isEmpty() && visited < MAX_NODE_COUNT) {
            AccessibilityNodeInfo node = nodes.pop();
            int depth = depths.pop();
            visited++;
            addText(texts, node.getText());
            addText(texts, node.getContentDescription());
            if (depth >= MAX_NODE_DEPTH) {
                continue;
            }
            for (int index = node.getChildCount() - 1; index >= 0; index--) {
                AccessibilityNodeInfo child = node.getChild(index);
                if (child != null) {
                    nodes.push(child);
                    depths.push(depth + 1);
                }
            }
        }
        return texts;
    }

    private static void addText(List<String> texts, CharSequence value) {
        String text = toText(value).trim();
        if (!text.isEmpty()) {
            texts.add(text);
        }
    }

    private static String toText(CharSequence value) {
        return value == null ? "" : value.toString();
    }

    private void requestCaptureInternal() {
        if (!isEnabledInSystem(this)) {
            updateFailure(this, "请先开启无障碍服务");
            return;
        }

        startCapture(true);
    }

    private void startCapture(boolean manual) {
        if (!captureInProgress.compareAndSet(false, true)) {
            return;
        }

        NotificationHelper.updateForegroundNotification(this, true);
        pendingCaptureManual = manual;

        if (!manual) {
            // 自动触发时通知栏未展开，直接截图
            mainHandler.removeCallbacks(delayedScreenshotRunnable);
            mainHandler.post(delayedScreenshotRunnable);
            return;
        }

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
        PageSnapshot snapshot = pendingCaptureManual ? capturePageSnapshot() : null;
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
                    executor.execute(() -> handleScreenshotSuccess(screenshotResult, snapshot));
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

    private void handleScreenshotSuccess(ScreenshotResult screenshotResult, PageSnapshot snapshot) {
        try {
            byte[] pngBytes = screenshotToPng(screenshotResult);
            JSONObject transaction = processingEngine.processCapture(pngBytes);
            if (transaction != null && snapshot != null) {
                mainHandler.post(() -> promptRememberPage(snapshot));
            }
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
