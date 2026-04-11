package com.smartwallet.app.screencapture;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class CaptureAnalysisParserTest {

    @Test
    public void parsesStructuredExpenseResponse() {
        String response =
            "{\"choices\":[{\"message\":{\"content\":\"```json\\n" +
            "{\\\"transactionType\\\":\\\"expense\\\",\\\"amount\\\":23.45," +
            "\\\"merchantName\\\":\\\"测试咖啡\\\",\\\"occurredAt\\\":\\\"2026-04-05\\\"," +
            "\\\"categoryId\\\":\\\"food\\\",\\\"note\\\":\\\"拿铁\\\"," +
            "\\\"summary\\\":\\\"微信支付成功，金额23.45元\\\"}\\n```\"}}]}";

        CaptureAnalysisOutcome outcome = CaptureAnalysisParser.parseChatResponse(response);
        CaptureAnalysisResult result = outcome.getResult();

        assertTrue(result.isSupported());
        assertEquals("", outcome.getFailureReason());
        assertEquals("微信支付成功，金额23.45元", outcome.getAssistantReplyParsed().optString("summary"));
        assertEquals("expense", result.getTransactionType());
        assertEquals(23.45d, result.getAmount(), 0.001d);
        assertEquals("food", result.getCategoryId());
    }

    @Test
    public void parsesStructuredIncomeResponse() {
        String response =
            "{\"choices\":[{\"message\":{\"content\":\"{\\\"transactionType\\\":\\\"income\\\",\\\"amount\\\":88.8,\\\"merchantName\\\":\\\"退款到账\\\",\\\"occurredAt\\\":\\\"2026-04-05\\\",\\\"categoryId\\\":\\\"other_inc\\\",\\\"note\\\":\\\"原路退款\\\",\\\"summary\\\":\\\"退款到账 88.8 元\\\"}\"}}]}";

        CaptureAnalysisOutcome outcome = CaptureAnalysisParser.parseChatResponse(response);
        CaptureAnalysisResult result = outcome.getResult();

        assertTrue(result.isSupported());
        assertEquals("income", result.getTransactionType());
        assertEquals(88.8d, result.getAmount(), 0.001d);
        assertEquals("other_inc", result.getCategoryId());
    }

    @Test
    public void rejectsUnsupportedOrIncompleteResponses() {
        String response =
            "{\"choices\":[{\"message\":{\"content\":\"{\\\"transactionType\\\":\\\"refund\\\",\\\"amount\\\":0}\"}}]}";

        CaptureAnalysisOutcome outcome = CaptureAnalysisParser.parseChatResponse(response);
        CaptureAnalysisResult result = outcome.getResult();

        assertFalse(result.isSupported());
        assertEquals("validation", outcome.getFailureStage());
    }
}
