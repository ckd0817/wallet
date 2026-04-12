package com.smartwallet.app.screencapture;

import android.content.Context;
import android.util.Log;
import com.smartwallet.app.ScreenCaptureBookkeepingPlugin;
import com.smartwallet.app.data.WalletRepository;
import java.io.File;
import java.io.FileOutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;
import org.json.JSONException;
import org.json.JSONObject;

public final class CaptureProcessingEngine {

    private static final String CAPTURE_LOG_DIR_NAME = "capture-logs";
    private static final String TAG = "SmartWalletCapture";

    private final Context appContext;
    private final CaptureAnalysisClient analysisClient = new CaptureAnalysisClient();
    private final SimpleDateFormat dateFormatter = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
    private final SimpleDateFormat timestampFormatter = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);

    public CaptureProcessingEngine(Context context) {
        this.appContext = context.getApplicationContext();
        timestampFormatter.setTimeZone(TimeZone.getTimeZone("UTC"));
    }

    public void processCapture(byte[] pngBytes) {
        JSONObject captureLog = null;
        try {
            captureLog = createPendingCaptureLog(saveCaptureImage(pngBytes));
            repository().upsertCaptureLog(captureLog);
            emitStatus();

            CaptureAnalysisOutcome outcome = analysisClient.analyze(pngBytes, repository().getLlmConfig(), repository().getCategories());
            if (!outcome.isSupported()) {
                repository().upsertCaptureLog(buildFinalCaptureLog(captureLog, outcome, null));
                updateError(outcome.getFailureReason().isEmpty() ? "截图分析失败" : outcome.getFailureReason());
                return;
            }

            CaptureAnalysisResult result = outcome.getResult();
            JSONObject transaction = buildTransaction(result);
            repository().upsertTransaction(transaction);
            repository().upsertCaptureLog(buildFinalCaptureLog(captureLog, outcome, transaction));
            repository().saveAutoBookkeepingSettings(statusUpdate("", System.currentTimeMillis()));
            NotificationHelper.showCaptureResult(appContext, transaction);
            ScreenCaptureBookkeepingPlugin.emitCaptureRecorded(transaction);
            emitStatus();
        } catch (Exception exception) {
            Log.e(TAG, "Capture analysis failed", exception);
            if (captureLog != null) {
                repository().upsertCaptureLog(buildUnexpectedFailureLog(captureLog, exception));
            }
            updateError(resolveExceptionMessage(exception));
        }
    }

    public void recordFailure(String failureStage, String failureReason) {
        JSONObject failureLog = new JSONObject();
        safePut(failureLog, "id", UUID.randomUUID().toString());
        safePut(failureLog, "capturedAt", formatTimestamp(System.currentTimeMillis()));
        safePut(failureLog, "status", "failed");
        safePut(failureLog, "failureStage", failureStage == null || failureStage.isEmpty() ? "pre_capture" : failureStage);
        safePut(failureLog, "failureReason", failureReason == null || failureReason.isEmpty() ? "截图失败" : failureReason);
        safePut(failureLog, "summary", failureReason == null || failureReason.isEmpty() ? "截图失败" : failureReason);
        safePut(failureLog, "imagePath", "");
        safePut(failureLog, "responseBodyRaw", "");
        safePut(failureLog, "assistantReplyRaw", "");
        repository().upsertCaptureLog(failureLog);
        updateError(failureReason == null || failureReason.isEmpty() ? "截图失败" : failureReason);
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

    private JSONObject buildFinalCaptureLog(JSONObject pendingLog, CaptureAnalysisOutcome outcome, JSONObject transaction) {
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
        File captureDir = new File(appContext.getFilesDir(), CAPTURE_LOG_DIR_NAME);
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
