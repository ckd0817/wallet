package com.smartwallet.app.screencapture;

import android.content.Context;
import android.util.Log;
import com.smartwallet.app.ScreenCaptureBookkeepingPlugin;
import com.smartwallet.app.data.WalletRepository;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;
import org.json.JSONException;
import org.json.JSONObject;

public final class CaptureProcessingEngine {

    private static final String TAG = "SmartWalletCapture";

    private final Context appContext;
    private final CaptureAnalysisClient analysisClient = new CaptureAnalysisClient();
    private final CaptureImageStore captureImageStore;
    private final CaptureLogFactory captureLogFactory = new CaptureLogFactory();
    private final SimpleDateFormat dateFormatter = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
    private final SimpleDateFormat timestampFormatter = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);

    public CaptureProcessingEngine(Context context) {
        this.appContext = context.getApplicationContext();
        this.captureImageStore = new CaptureImageStore(appContext.getFilesDir());
        timestampFormatter.setTimeZone(TimeZone.getTimeZone("UTC"));
    }

    public void processCapture(byte[] pngBytes) {
        processCaptureBytes(pngBytes, saveCaptureImage(pngBytes));
    }

    public void retrySavedCapture(String imagePath, File imageFile) {
        try {
            processCaptureBytes(readImageBytes(imageFile), imagePath);
        } catch (Exception exception) {
            Log.e(TAG, "Retry capture analysis failed before request", exception);
            recordFailure("retry_prepare", "原图不可用", imagePath);
        }
    }

    public File resolveCaptureImageFile(String imagePath) {
        return captureImageStore.resolveOwnedImageFile(imagePath);
    }

    public void recordFailure(String failureStage, String failureReason) {
        recordFailure(failureStage, failureReason, "");
    }

    public void recordFailure(String failureStage, String failureReason, String imagePath) {
        repository().upsertCaptureLog(captureLogFactory.createFailureLog(failureStage, failureReason, imagePath));
        updateError(failureReason == null || failureReason.isEmpty() ? "截图失败" : failureReason);
    }

    private void processCaptureBytes(byte[] pngBytes, String imagePath) {
        JSONObject captureLog = null;
        try {
            captureLog = captureLogFactory.createPendingLog(imagePath);
            repository().upsertCaptureLog(captureLog);
            emitStatus();
            NotificationHelper.showCaptureProcessing(appContext);

            CaptureAnalysisOutcome outcome = analysisClient.analyze(pngBytes, repository().getLlmConfig(), repository().getCategories());
            if (!outcome.isSupported()) {
                repository().upsertCaptureLog(captureLogFactory.createCompletedLog(captureLog, outcome, null));
                updateError(outcome.getFailureReason().isEmpty() ? "截图分析失败" : outcome.getFailureReason());
                return;
            }

            CaptureAnalysisResult result = outcome.getResult();
            JSONObject transaction = buildTransaction(result);
            repository().upsertTransaction(transaction);
            repository().upsertCaptureLog(captureLogFactory.createCompletedLog(captureLog, outcome, transaction));
            repository().saveAutoBookkeepingSettings(statusUpdate("", System.currentTimeMillis()));
            NotificationHelper.showCaptureResult(appContext, transaction);
            ScreenCaptureBookkeepingPlugin.emitCaptureRecorded(transaction);
            emitStatus();
        } catch (Exception exception) {
            Log.e(TAG, "Capture analysis failed", exception);
            if (captureLog != null) {
                repository().upsertCaptureLog(captureLogFactory.createUnexpectedFailureLog(captureLog, resolveExceptionMessage(exception)));
            }
            updateError(resolveExceptionMessage(exception));
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


    private void updateError(String message) {
        repository().saveAutoBookkeepingSettings(statusUpdate(message, 0));
        NotificationHelper.showCaptureFailure(appContext, message);
        emitStatus();
    }

    private JSONObject statusUpdate(String lastError, long lastCaptureAt) {
        JSONObject object = new JSONObject();
        safePut(object, "notificationPermissionGranted", NotificationHelper.isNotificationPermissionGranted(appContext));
        safePut(object, "lastError", lastError == null || lastError.isEmpty() ? "" : lastError);
        if (lastCaptureAt > 0) {
            safePut(object, "lastCaptureAt", lastCaptureAt);
        }
        return object;
    }

    private void emitStatus() {
        ScreenCaptureBookkeepingPlugin.emitStatusChanged(repository().getAutoBookkeepingSettings());
    }

    private WalletRepository repository() {
        return WalletRepository.getInstance(appContext);
    }

    private String saveCaptureImage(byte[] pngBytes) {
        File imageFile = captureImageStore.createImageFile();
        try (FileOutputStream outputStream = new FileOutputStream(imageFile, false)) {
            outputStream.write(pngBytes);
            outputStream.flush();
            return captureImageStore.toStoredImagePath(imageFile);
        } catch (Exception exception) {
            Log.w(TAG, "Failed to persist capture image", exception);
            return "";
        }
    }

    private byte[] readImageBytes(File imageFile) throws Exception {
        try (FileInputStream inputStream = new FileInputStream(imageFile); ByteArrayOutputStream outputStream = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int readLength;
            while ((readLength = inputStream.read(buffer)) != -1) {
                outputStream.write(buffer, 0, readLength);
            }
            return outputStream.toByteArray();
        }
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

    private String resolveExceptionMessage(Exception exception) {
        if (exception == null || exception.getMessage() == null || exception.getMessage().trim().isEmpty()) {
            return "截图分析失败";
        }
        return "截图分析失败: " + exception.getMessage().trim();
    }

    private String formatTimestamp(long timestamp) {
        synchronized (timestampFormatter) {
            return timestampFormatter.format(new Date(timestamp));
        }
    }

    private void safePut(JSONObject object, String key, Object value) {
        try {
            object.put(key, value);
        } catch (JSONException ignored) {}
    }
}
