package com.smartwallet.app.screencapture;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;
import org.json.JSONException;
import org.json.JSONObject;

public class CaptureLogFactory {

    interface TimeProvider {
        long now();
    }

    interface IdProvider {
        String next();
    }

    private final TimeProvider timeProvider;
    private final IdProvider idProvider;
    private final SimpleDateFormat timestampFormatter = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);

    public CaptureLogFactory() {
        this(System::currentTimeMillis, () -> UUID.randomUUID().toString());
    }

    CaptureLogFactory(TimeProvider timeProvider, IdProvider idProvider) {
        this.timeProvider = timeProvider;
        this.idProvider = idProvider;
        timestampFormatter.setTimeZone(TimeZone.getTimeZone("UTC"));
    }

    public JSONObject createPendingLog(String imagePath) {
        JSONObject log = new JSONObject();
        safePut(log, "id", idProvider.next());
        safePut(log, "capturedAt", formatTimestamp(timeProvider.now()));
        safePut(log, "status", "processing");
        safePut(log, "imagePath", imagePath == null ? "" : imagePath);
        return log;
    }

    public JSONObject createCompletedLog(JSONObject pendingLog, CaptureAnalysisOutcome outcome, JSONObject transaction) {
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

    public JSONObject createFailureLog(String failureStage, String failureReason, String imagePath) {
        JSONObject failureLog = new JSONObject();
        safePut(failureLog, "id", idProvider.next());
        safePut(failureLog, "capturedAt", formatTimestamp(timeProvider.now()));
        safePut(failureLog, "status", "failed");
        safePut(failureLog, "failureStage", failureStage == null || failureStage.isEmpty() ? "pre_capture" : failureStage);
        safePut(failureLog, "failureReason", failureReason == null || failureReason.isEmpty() ? "截图失败" : failureReason);
        safePut(failureLog, "summary", failureReason == null || failureReason.isEmpty() ? "截图失败" : failureReason);
        safePut(failureLog, "imagePath", imagePath == null ? "" : imagePath);
        safePut(failureLog, "responseBodyRaw", "");
        safePut(failureLog, "assistantReplyRaw", "");
        return failureLog;
    }

    public JSONObject createUnexpectedFailureLog(JSONObject pendingLog, String failureReason) {
        JSONObject log = cloneObject(pendingLog);
        safePut(log, "status", "failed");
        safePut(log, "failureStage", "service_exception");
        safePut(log, "failureReason", failureReason == null || failureReason.isEmpty() ? "截图分析失败" : failureReason);
        safePut(log, "responseBodyRaw", "");
        safePut(log, "assistantReplyRaw", "");
        return log;
    }

    private String formatTimestamp(long timestamp) {
        synchronized (timestampFormatter) {
            return timestampFormatter.format(new Date(timestamp));
        }
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
