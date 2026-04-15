package com.smartwallet.app.screencapture;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;

public class CaptureLogFactoryTest {

    @Test
    public void createPendingLogKeepsRetryImagePathAndAssignsFreshMetadata() {
        CaptureLogFactory factory = new CaptureLogFactory(() -> 0L, () -> "retry-log-id");

        JSONObject pendingLog = factory.createPendingLog("file:///captures/retry.png");

        assertEquals("retry-log-id", pendingLog.optString("id"));
        assertEquals("1970-01-01T00:00:00.000Z", pendingLog.optString("capturedAt"));
        assertEquals("processing", pendingLog.optString("status"));
        assertEquals("file:///captures/retry.png", pendingLog.optString("imagePath"));
    }

    @Test
    public void createCompletedLogKeepsImagePathAndAddsSuccessPayload() throws Exception {
        CaptureLogFactory factory = new CaptureLogFactory(() -> 0L, () -> "unused-id");
        JSONObject pendingLog = new JSONObject()
            .put("id", "retry-log-id")
            .put("capturedAt", "1970-01-01T00:00:00.000Z")
            .put("status", "processing")
            .put("imagePath", "file:///captures/retry.png");
        CaptureAnalysisOutcome outcome = new CaptureAnalysisOutcome(
            new CaptureAnalysisResult(true, "expense", 88.5d, "测试商户", "2026-04-15", "food", "午饭", "识别完成", ""),
            200,
            "{\"id\":\"response\"}",
            "{\"amount\":88.5}",
            new JSONObject().put("amount", 88.5d),
            "",
            ""
        );
        JSONObject transaction = new JSONObject().put("id", "txn-1");

        JSONObject completedLog = factory.createCompletedLog(pendingLog, outcome, transaction);

        assertEquals("success", completedLog.optString("status"));
        assertEquals("file:///captures/retry.png", completedLog.optString("imagePath"));
        assertEquals("txn-1", completedLog.optString("transactionId"));
        assertEquals("测试商户", completedLog.optString("merchantName"));
        assertEquals("识别完成", completedLog.optString("summary"));
        assertTrue(completedLog.optDouble("amount", 0d) > 0d);
    }

    @Test
    public void createFailureLogBuildsRetryPrepareFailureEntry() {
        CaptureLogFactory factory = new CaptureLogFactory(() -> 0L, () -> "retry-failure-id");

        JSONObject failureLog = factory.createFailureLog("retry_prepare", "原图不可用", "file:///captures/retry.png");

        assertEquals("retry-failure-id", failureLog.optString("id"));
        assertEquals("failed", failureLog.optString("status"));
        assertEquals("retry_prepare", failureLog.optString("failureStage"));
        assertEquals("原图不可用", failureLog.optString("failureReason"));
        assertEquals("原图不可用", failureLog.optString("summary"));
        assertEquals("file:///captures/retry.png", failureLog.optString("imagePath"));
    }
}
