package com.smartwallet.app.screencapture;

import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.util.DisplayMetrics;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;
import com.smartwallet.app.ScreenCaptureBookkeepingPlugin;
import com.smartwallet.app.data.WalletRepository;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;
import org.json.JSONException;
import org.json.JSONObject;

public class ScreenCaptureBookkeepingService extends Service {

    public static final String ACTION_START_SESSION = "com.smartwallet.app.action.START_SCREEN_CAPTURE_SESSION";
    public static final String ACTION_STOP_SESSION = "com.smartwallet.app.action.STOP_SCREEN_CAPTURE_SESSION";
    public static final String ACTION_CAPTURE = "com.smartwallet.app.action.CAPTURE_SCREEN_NOW";
    public static final String EXTRA_RESULT_CODE = "resultCode";
    public static final String EXTRA_RESULT_DATA = "resultData";
    private static final String CAPTURE_LOG_DIR_NAME = "capture-logs";
    private static final String TAG = "SmartWalletCapture";

    private static volatile boolean running;

    private final CaptureAnalysisClient analysisClient = new CaptureAnalysisClient();
    private final SimpleDateFormat dateFormatter = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
    private final SimpleDateFormat timestampFormatter = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);

    private HandlerThread workerThread;
    private Handler workerHandler;
    private MediaProjection mediaProjection;
    private MediaProjection.Callback projectionCallback;
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;
    private int displayWidth;
    private int displayHeight;
    private int densityDpi;
    private boolean captureRequested;
    private boolean captureInProgress;

    public ScreenCaptureBookkeepingService() {
        timestampFormatter.setTimeZone(TimeZone.getTimeZone("UTC"));
    }

    public static Intent createProjectionConsentIntent(Context context) {
        MediaProjectionManager manager = (MediaProjectionManager) context.getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        return manager == null ? null : manager.createScreenCaptureIntent();
    }

    public static void startSession(Context context, int resultCode, Intent data) {
        Intent intent = new Intent(context, ScreenCaptureBookkeepingService.class)
            .setAction(ACTION_START_SESSION)
            .putExtra(EXTRA_RESULT_CODE, resultCode)
            .putExtra(EXTRA_RESULT_DATA, data);
        ContextCompat.startForegroundService(context, intent);
    }

    public static void stopSession(Context context) {
        context.startService(new Intent(context, ScreenCaptureBookkeepingService.class).setAction(ACTION_STOP_SESSION));
    }

    public static void captureNow(Context context) {
        context.startService(new Intent(context, ScreenCaptureBookkeepingService.class).setAction(ACTION_CAPTURE));
    }

    public static boolean isRunning() {
        return running;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationHelper.ensureChannels(this);
        workerThread = new HandlerThread("screen-capture-bookkeeping");
        workerThread.start();
        workerHandler = new Handler(workerThread.getLooper());
        running = true;
        Log.i(TAG, "Foreground screenshot service created");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_START_SESSION.equals(action)) {
            refreshSessionNotification(false, "start-session-request");
            workerHandler.post(() -> handleStartSession(intent));
        } else if (ACTION_CAPTURE.equals(action)) {
            Log.i(TAG, "Capture requested from notification");
            workerHandler.post(this::handleCaptureNow);
        } else if (ACTION_STOP_SESSION.equals(action)) {
            Log.i(TAG, "Stop session requested from notification");
            workerHandler.post(() -> handleStopSession("截图会话已停止"));
        } else if (action == null) {
            Log.w(TAG, "Service restarted with null intent; keeping current session state");
            if (running) {
                refreshSessionNotification(captureInProgress, "null-intent-restart");
            }
        } else {
            Log.w(TAG, "Ignoring unknown action: " + action);
        }
        return START_NOT_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        Log.i(TAG, "Foreground screenshot service destroyed");
        releaseProjection("截图会话已结束");
        if (workerThread != null) {
            workerThread.quitSafely();
        }
        running = false;
        super.onDestroy();
    }

    private void handleStartSession(Intent intent) {
        int resultCode = intent == null ? 0 : intent.getIntExtra(EXTRA_RESULT_CODE, 0);
        Intent data = getProjectionData(intent);
        if (resultCode != android.app.Activity.RESULT_OK || data == null) {
            Log.w(TAG, "Projection consent denied or missing");
            updateError("未授予截图权限");
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return;
        }

        releaseProjection(null);

        MediaProjectionManager manager = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        if (manager == null) {
            Log.e(TAG, "MediaProjectionManager unavailable");
            updateError("系统不支持截图会话");
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return;
        }

        mediaProjection = manager.getMediaProjection(resultCode, data);
        if (mediaProjection == null) {
            Log.e(TAG, "Unable to create MediaProjection instance");
            updateError("无法创建截图会话");
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return;
        }

        projectionCallback =
            new MediaProjection.Callback() {
                @Override
                public void onStop() {
                    Log.w(TAG, "MediaProjection stopped by system");
                    workerHandler.post(() -> handleStopSession("截图会话已被系统结束"));
                }
            };
        mediaProjection.registerCallback(projectionCallback, workerHandler);
        createCapturePipeline();
        repository().saveAutoBookkeepingSettings(sessionUpdate(true, "", 0));
        Log.i(TAG, "Projection session started");
        refreshSessionNotification(false, "session-started");
        ScreenCaptureBookkeepingPlugin.emitStatusChanged(repository().getAutoBookkeepingSettings());
    }

    private void handleCaptureNow() {
        if (mediaProjection == null || imageReader == null) {
            updateError("请先开启截图会话");
            return;
        }
        if (captureInProgress) {
            return;
        }

        captureRequested = true;
        captureInProgress = true;
        refreshSessionNotification(true, "capture-pending");

        Image image = imageReader.acquireLatestImage();
        if (image != null) {
            captureRequested = false;
            processImage(image);
            return;
        }

        workerHandler.postDelayed(
            () -> {
                if (!captureRequested) {
                    return;
                }
                captureRequested = false;
                captureInProgress = false;
                refreshSessionNotification(false, "capture-timeout");
                updateError("未能获取当前屏幕画面");
            },
            1500L
        );
    }

    private void createCapturePipeline() {
        DisplayMetrics metrics = getResources().getDisplayMetrics();
        displayWidth = metrics.widthPixels;
        displayHeight = metrics.heightPixels;
        densityDpi = metrics.densityDpi;

        imageReader = ImageReader.newInstance(displayWidth, displayHeight, PixelFormat.RGBA_8888, 2);
        imageReader.setOnImageAvailableListener(this::onImageAvailable, workerHandler);
        virtualDisplay =
            mediaProjection.createVirtualDisplay(
                "screen-capture-bookkeeping",
                displayWidth,
                displayHeight,
                densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader.getSurface(),
                null,
                workerHandler
            );
    }

    private void onImageAvailable(ImageReader reader) {
        if (!captureRequested) {
            Image idleImage = reader.acquireLatestImage();
            if (idleImage != null) {
                idleImage.close();
            }
            return;
        }

        Image image = reader.acquireLatestImage();
        if (image == null) {
            return;
        }

        captureRequested = false;
        processImage(image);
    }

    private void processImage(Image image) {
        JSONObject captureLog = null;
        try {
            Log.i(TAG, "Processing captured screen image");
            byte[] pngBytes = imageToPng(image, displayWidth, displayHeight);
            captureLog = createPendingCaptureLog(saveCaptureImage(pngBytes));
            repository().upsertCaptureLog(captureLog);
            ScreenCaptureBookkeepingPlugin.emitStatusChanged(repository().getAutoBookkeepingSettings());

            CaptureAnalysisOutcome outcome = analysisClient.analyze(pngBytes, repository().getLlmConfig(), repository().getCategories());
            if (!outcome.isSupported()) {
                Log.w(TAG, "Captured screen could not be booked automatically: " + outcome.getFailureReason());
                repository().upsertCaptureLog(buildFinalCaptureLog(captureLog, outcome, null));
                updateError(outcome.getFailureReason().isEmpty() ? "截图分析失败" : outcome.getFailureReason());
                return;
            }

            CaptureAnalysisResult result = outcome.getResult();
            JSONObject transaction = buildTransaction(result);
            repository().upsertTransaction(transaction);
            repository().upsertCaptureLog(buildFinalCaptureLog(captureLog, outcome, transaction));
            repository().saveAutoBookkeepingSettings(sessionUpdate(true, "", System.currentTimeMillis()));
            Log.i(TAG, "Capture analyzed successfully and persisted: " + transaction.optString("id"));
            NotificationHelper.showCaptureResult(this, transaction);
            ScreenCaptureBookkeepingPlugin.emitCaptureRecorded(transaction);
            ScreenCaptureBookkeepingPlugin.emitStatusChanged(repository().getAutoBookkeepingSettings());
        } catch (Exception exception) {
            Log.e(TAG, "Capture analysis failed", exception);
            if (captureLog != null) {
                repository().upsertCaptureLog(buildUnexpectedFailureLog(captureLog, exception));
            }
            updateError(resolveExceptionMessage(exception));
        } finally {
            image.close();
            captureInProgress = false;
            refreshSessionNotification(false, "capture-complete");
        }
    }

    private JSONObject buildTransaction(CaptureAnalysisResult result) {
        long now = System.currentTimeMillis();
        String transactionType = "income".equals(result.getTransactionType()) ? "income" : "expense";
        JSONObject transaction = new JSONObject();
        safePut(transaction, "id", UUID.randomUUID().toString());
        safePut(transaction, "amount", result.getAmount());
        safePut(transaction, "type", transactionType);
        safePut(
            transaction,
            "categoryId",
            result.getCategoryId().isEmpty() ? ("income".equals(transactionType) ? "other_inc" : "other_exp") : result.getCategoryId()
        );
        safePut(transaction, "date", resolveOccurredAt(result.getOccurredAt(), now));
        safePut(transaction, "note", result.getNote().isEmpty() ? result.getMerchantName() : result.getNote());
        safePut(transaction, "createdBy", "screenshot_capture");
        safePut(transaction, "merchantName", result.getMerchantName());
        safePut(transaction, "sourcePackage", "screen_capture");
        safePut(transaction, "needsReview", true);
        safePut(transaction, "captureSummary", result.getSummary());
        safePut(transaction, "createdAt", formatTimestamp(now));
        safePut(transaction, "updatedAt", formatTimestamp(now));
        return transaction;
    }

    private JSONObject createPendingCaptureLog(String imagePath) {
        JSONObject log = new JSONObject();
        safePut(log, "id", UUID.randomUUID().toString());
        safePut(log, "capturedAt", formatTimestamp(System.currentTimeMillis()));
        safePut(log, "status", "processing");
        safePut(log, "imagePath", imagePath);
        return log;
    }

    private JSONObject buildFinalCaptureLog(JSONObject pendingLog, CaptureAnalysisOutcome outcome, @Nullable JSONObject transaction) {
        JSONObject log = cloneObject(pendingLog);
        safePut(log, "status", outcome.isSupported() ? "success" : "failed");
        safePut(log, "failureStage", outcome.getFailureStage());
        safePut(log, "failureReason", outcome.getFailureReason());
        if (outcome.getHttpStatus() > 0) {
            safePut(log, "httpStatus", outcome.getHttpStatus());
        }
        safePut(log, "responseBodyRaw", outcome.getResponseBodyRaw());
        safePut(log, "assistantReplyRaw", outcome.getAssistantReplyRaw());

        JSONObject assistantReplyParsed = outcome.getAssistantReplyParsed();
        if (assistantReplyParsed != null) {
            safePut(log, "assistantReplyParsed", assistantReplyParsed);
        }

        CaptureAnalysisResult result = outcome.getResult();
        safePut(log, "summary", result.getSummary().isEmpty() ? outcome.getFailureReason() : result.getSummary());
        safePut(log, "merchantName", result.getMerchantName());
        if (result.getAmount() > 0d) {
            safePut(log, "amount", result.getAmount());
        }

        if (transaction != null) {
            safePut(log, "transactionId", transaction.optString("id", ""));
        }

        return log;
    }

    private JSONObject buildUnexpectedFailureLog(JSONObject pendingLog, Exception exception) {
        JSONObject log = cloneObject(pendingLog);
        safePut(log, "status", "failed");
        safePut(log, "failureStage", "service_exception");
        safePut(log, "failureReason", resolveExceptionMessage(exception));
        safePut(log, "responseBodyRaw", "");
        safePut(log, "assistantReplyRaw", "");
        return log;
    }

    private void handleStopSession(String message) {
        Log.i(TAG, "Stopping screenshot session: " + message);
        releaseProjection(message);
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void releaseProjection(@Nullable String message) {
        boolean hadResources = virtualDisplay != null || imageReader != null || mediaProjection != null || running;
        if (!hadResources) {
            return;
        }
        if (virtualDisplay != null) {
            virtualDisplay.release();
            virtualDisplay = null;
        }
        if (imageReader != null) {
            imageReader.close();
            imageReader = null;
        }
        if (mediaProjection != null) {
            if (projectionCallback != null) {
                mediaProjection.unregisterCallback(projectionCallback);
            }
            mediaProjection.stop();
            mediaProjection = null;
            projectionCallback = null;
        }
        captureRequested = false;
        captureInProgress = false;
        running = false;
        repository().saveAutoBookkeepingSettings(sessionUpdate(false, message == null ? "" : message, 0));
        Log.i(TAG, "Projection resources released" + (message == null || message.isEmpty() ? "" : ": " + message));
        ScreenCaptureBookkeepingPlugin.emitStatusChanged(repository().getAutoBookkeepingSettings());
    }

    private void updateError(String message) {
        captureInProgress = false;
        Log.w(TAG, "Capture flow error: " + message);
        refreshSessionNotification(false, "capture-error");
        repository().saveAutoBookkeepingSettings(sessionUpdate(mediaProjection != null, message, 0));
        NotificationHelper.showCaptureFailure(this, message);
        ScreenCaptureBookkeepingPlugin.emitStatusChanged(repository().getAutoBookkeepingSettings());
    }

    private void refreshSessionNotification(boolean captureInProgress, String reason) {
        Log.i(TAG, "Refreshing foreground notification, captureInProgress=" + captureInProgress + ", reason=" + reason);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceCompat.startForeground(
                this,
                NotificationHelper.SESSION_NOTIFICATION_ID,
                NotificationHelper.buildSessionNotification(this, captureInProgress),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            );
            return;
        }

        ServiceCompat.startForeground(
            this,
            NotificationHelper.SESSION_NOTIFICATION_ID,
            NotificationHelper.buildSessionNotification(this, captureInProgress),
            0
        );
    }

    private JSONObject sessionUpdate(boolean sessionActive, String lastError, long lastCaptureAt) {
        JSONObject object = new JSONObject();
        safePut(object, "sessionActive", sessionActive);
        safePut(object, "notificationPermissionGranted", NotificationHelper.isNotificationPermissionGranted(this));
        safePut(object, "lastError", lastError.isEmpty() ? "" : lastError);
        if (lastCaptureAt > 0) {
            safePut(object, "lastCaptureAt", lastCaptureAt);
        }
        return object;
    }

    private WalletRepository repository() {
        return WalletRepository.getInstance(this);
    }

    private String saveCaptureImage(byte[] pngBytes) {
        File captureDir = new File(getFilesDir(), CAPTURE_LOG_DIR_NAME);
        if (!captureDir.exists()) {
            captureDir.mkdirs();
        }

        File imageFile = new File(captureDir, "capture_" + System.currentTimeMillis() + "_" + UUID.randomUUID() + ".png");
        try (FileOutputStream outputStream = new FileOutputStream(imageFile, false)) {
            outputStream.write(pngBytes);
            outputStream.flush();
            return "file://" + imageFile.getAbsolutePath();
        } catch (Exception exception) {
            Log.w(TAG, "Failed to persist capture image", exception);
            return "";
        }
    }

    private byte[] imageToPng(Image image, int width, int height) {
        Image.Plane plane = image.getPlanes()[0];
        ByteBuffer buffer = plane.getBuffer();
        int pixelStride = plane.getPixelStride();
        int rowStride = plane.getRowStride();
        int rowPadding = rowStride - pixelStride * width;

        Bitmap bitmap = Bitmap.createBitmap(width + rowPadding / pixelStride, height, Bitmap.Config.ARGB_8888);
        bitmap.copyPixelsFromBuffer(buffer);
        Bitmap cropped = Bitmap.createBitmap(bitmap, 0, 0, width, height);
        bitmap.recycle();

        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        cropped.compress(Bitmap.CompressFormat.PNG, 100, outputStream);
        cropped.recycle();
        return outputStream.toByteArray();
    }

    private String resolveOccurredAt(String occurredAt, long fallbackTimestamp) {
        if (occurredAt != null && occurredAt.matches("\\d{4}-\\d{2}-\\d{2}")) {
            return occurredAt;
        }
        synchronized (dateFormatter) {
            dateFormatter.setTimeZone(TimeZone.getDefault());
            return dateFormatter.format(new Date(fallbackTimestamp));
        }
    }

    private String formatTimestamp(long timestamp) {
        synchronized (timestampFormatter) {
            return timestampFormatter.format(new Date(timestamp));
        }
    }

    private String resolveExceptionMessage(Exception exception) {
        if (exception == null || exception.getMessage() == null || exception.getMessage().trim().isEmpty()) {
            return "截图分析失败";
        }
        return "截图分析失败: " + exception.getMessage().trim();
    }

    @Nullable
    private Intent getProjectionData(Intent intent) {
        if (intent == null) {
            return null;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent.class);
        }
        return (Intent) intent.getParcelableExtra(EXTRA_RESULT_DATA);
    }

    private JSONObject cloneObject(JSONObject source) {
        if (source == null) {
            return new JSONObject();
        }

        try {
            return new JSONObject(source.toString());
        } catch (JSONException ignored) {
            return new JSONObject();
        }
    }

    private void safePut(JSONObject object, String key, Object value) {
        try {
            object.put(key, value);
        } catch (JSONException ignored) {}
    }
}
