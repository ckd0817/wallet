package com.smartwallet.app.screencapture;

import java.util.Locale;
import org.json.JSONObject;

final class NotificationTextFormatter {

    private NotificationTextFormatter() {}

    static String buildProcessingTitle() {
        return "截图已完成";
    }

    static String buildProcessingText() {
        return "正在识别";
    }

    static String buildSuccessTitle() {
        return "识别完成";
    }

    static String buildFailureTitle() {
        return "识别失败";
    }

    static String buildCaptureResultLine(JSONObject transaction) {
        String merchantLabel = transaction.optString("merchantName", "").trim();
        if (merchantLabel.isEmpty()) {
            merchantLabel = transaction.optString("note", "").trim();
        }
        if (merchantLabel.isEmpty()) {
            merchantLabel = "自动记录";
        }
        return merchantLabel + " · " + formatAmount(transaction.optDouble("amount", 0d));
    }

    static String buildCaptureResultSummary(JSONObject transaction) {
        String summary = transaction.optString("captureSummary", "").trim();
        return summary.isEmpty() ? buildCaptureResultLine(transaction) : summary;
    }

    static String buildFailureText(String message) {
        if (message == null) {
            return "截图分析失败";
        }
        String trimmed = message.trim();
        return trimmed.isEmpty() ? "截图分析失败" : trimmed;
    }

    private static String formatAmount(double amount) {
        return String.format(Locale.US, "¥%.2f", amount);
    }
}
