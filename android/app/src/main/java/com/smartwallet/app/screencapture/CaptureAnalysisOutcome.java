package com.smartwallet.app.screencapture;

import org.json.JSONException;
import org.json.JSONObject;

public class CaptureAnalysisOutcome {

    private final CaptureAnalysisResult result;
    private final int httpStatus;
    private final String responseBodyRaw;
    private final String assistantReplyRaw;
    private final JSONObject assistantReplyParsed;
    private final String failureStage;
    private final String failureReason;

    public CaptureAnalysisOutcome(
        CaptureAnalysisResult result,
        int httpStatus,
        String responseBodyRaw,
        String assistantReplyRaw,
        JSONObject assistantReplyParsed,
        String failureStage,
        String failureReason
    ) {
        this.result = result == null ? CaptureAnalysisResult.unsupported("截图分析失败") : result;
        this.httpStatus = httpStatus;
        this.responseBodyRaw = responseBodyRaw == null ? "" : responseBodyRaw;
        this.assistantReplyRaw = assistantReplyRaw == null ? "" : assistantReplyRaw;
        this.assistantReplyParsed = cloneObject(assistantReplyParsed);
        this.failureStage = failureStage == null ? "" : failureStage;
        this.failureReason = failureReason == null ? "" : failureReason;
    }

    public CaptureAnalysisOutcome withHttpStatus(int nextHttpStatus) {
        return new CaptureAnalysisOutcome(
            result,
            nextHttpStatus,
            responseBodyRaw,
            assistantReplyRaw,
            assistantReplyParsed,
            failureStage,
            failureReason
        );
    }

    public CaptureAnalysisOutcome withResponseBodyRaw(String nextResponseBodyRaw) {
        return new CaptureAnalysisOutcome(
            result,
            httpStatus,
            nextResponseBodyRaw,
            assistantReplyRaw,
            assistantReplyParsed,
            failureStage,
            failureReason
        );
    }

    public CaptureAnalysisOutcome withResolvedCategory(String nextCategoryId) {
        return new CaptureAnalysisOutcome(
            result.withCategoryId(nextCategoryId),
            httpStatus,
            responseBodyRaw,
            assistantReplyRaw,
            assistantReplyParsed,
            failureStage,
            failureReason
        );
    }

    public boolean isSupported() {
        return result.isSupported();
    }

    public CaptureAnalysisResult getResult() {
        return result;
    }

    public int getHttpStatus() {
        return httpStatus;
    }

    public String getResponseBodyRaw() {
        return responseBodyRaw;
    }

    public String getAssistantReplyRaw() {
        return assistantReplyRaw;
    }

    public JSONObject getAssistantReplyParsed() {
        return cloneObject(assistantReplyParsed);
    }

    public String getFailureStage() {
        return failureStage;
    }

    public String getFailureReason() {
        return failureReason;
    }

    private static JSONObject cloneObject(JSONObject source) {
        if (source == null) {
            return null;
        }

        try {
            return new JSONObject(source.toString());
        } catch (JSONException ignored) {
            return null;
        }
    }
}
