package com.smartwallet.app.screencapture;

import static org.junit.Assert.assertEquals;

import org.json.JSONObject;
import org.junit.Test;

public class NotificationTextFormatterTest {

    @Test
    public void buildAlertCopyMatchesProductSemantics() {
        assertEquals("截图已完成", NotificationTextFormatter.buildProcessingTitle());
        assertEquals("正在识别", NotificationTextFormatter.buildProcessingText());
        assertEquals("识别完成", NotificationTextFormatter.buildSuccessTitle());
        assertEquals("识别失败", NotificationTextFormatter.buildFailureTitle());
    }

    @Test
    public void buildCaptureResultLineFallsBackToNoteWhenMerchantNameMissing() throws Exception {
        JSONObject transaction = new JSONObject()
            .put("note", "午饭")
            .put("amount", 18.6d);

        assertEquals("午饭 · ¥18.60", NotificationTextFormatter.buildCaptureResultLine(transaction));
    }

    @Test
    public void buildCaptureResultSummaryPrefersCaptureSummary() throws Exception {
        JSONObject transaction = new JSONObject()
            .put("merchantName", "麦当劳")
            .put("amount", 32d)
            .put("captureSummary", "麦当劳午餐，已识别为餐饮");

        assertEquals("麦当劳午餐，已识别为餐饮", NotificationTextFormatter.buildCaptureResultSummary(transaction));
    }

    @Test
    public void buildFailureTextFallsBackToDefaultMessage() {
        assertEquals("截图分析失败", NotificationTextFormatter.buildFailureText("   "));
    }

    @Test
    public void buildCaptureResultLineFallsBackToDefaultLabel() throws Exception {
        JSONObject transaction = new JSONObject()
            .put("amount", 0d);

        assertEquals("自动记录 · ¥0.00", NotificationTextFormatter.buildCaptureResultLine(transaction));
    }
}
