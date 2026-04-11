package com.smartwallet.app.screencapture;

import org.json.JSONArray;
import org.json.JSONObject;

public final class CaptureAnalysisParser {

    private CaptureAnalysisParser() {}

    public static CaptureAnalysisOutcome parseChatResponse(String responseBody) {
        try {
            JSONObject response = new JSONObject(responseBody);
            JSONArray choices = response.optJSONArray("choices");
            if (choices == null || choices.length() == 0) {
                return buildFailureOutcome(
                    responseBody,
                    "",
                    null,
                    "response_shape",
                    "模型未返回可解析结果",
                    CaptureAnalysisResult.unsupported("模型未返回可解析结果")
                );
            }

            JSONObject message = choices.optJSONObject(0).optJSONObject("message");
            String content = extractMessageContent(message == null ? null : message.opt("content"));
            if (content.trim().isEmpty()) {
                return buildFailureOutcome(
                    responseBody,
                    "",
                    null,
                    "empty_reply",
                    "模型未返回可解析结果",
                    CaptureAnalysisResult.unsupported("模型未返回可解析结果")
                );
            }

            String cleaned = content.replaceAll("```json\\s*|```", "").trim();
            JSONObject parsed;
            try {
                parsed = new JSONObject(cleaned);
            } catch (Exception ignored) {
                return buildFailureOutcome(
                    responseBody,
                    content,
                    null,
                    "json_parse",
                    "模型未返回可解析结果",
                    CaptureAnalysisResult.unsupported("模型未返回可解析结果")
                );
            }

            String transactionType = parsed.optString("transactionType", "").trim().toLowerCase();
            double amount = parsed.has("amount") ? parsed.optDouble("amount", 0d) : 0d;

            if (!"expense".equals(transactionType) && !"income".equals(transactionType)) {
                return buildFailureOutcome(
                    responseBody,
                    content,
                    parsed,
                    "validation",
                    "识别结果不是收入或支出类型",
                    CaptureAnalysisResult.unsupported("识别结果不是收入或支出类型")
                );
            }

            if (amount <= 0d) {
                return buildFailureOutcome(
                    responseBody,
                    content,
                    parsed,
                    "validation",
                    "未识别出有效金额",
                    CaptureAnalysisResult.unsupported("未识别出有效金额")
                );
            }

            return new CaptureAnalysisOutcome(
                new CaptureAnalysisResult(
                    true,
                    transactionType,
                    amount,
                    parsed.optString("merchantName", ""),
                    parsed.optString("occurredAt", ""),
                    parsed.optString("categoryId", parsed.optString("categoryName", "")),
                    parsed.optString("note", ""),
                    parsed.optString("summary", ""),
                    ""
                ),
                0,
                responseBody,
                content,
                parsed,
                "",
                ""
            );
        } catch (Exception ignored) {
            return buildFailureOutcome(
                responseBody,
                "",
                null,
                "response_parse",
                "模型未返回可解析结果",
                CaptureAnalysisResult.unsupported("模型未返回可解析结果")
            );
        }
    }

    public static String extractAssistantReply(String responseBody) {
        try {
            JSONObject response = new JSONObject(responseBody);
            JSONArray choices = response.optJSONArray("choices");
            if (choices == null || choices.length() == 0) {
                return "";
            }

            JSONObject choice = choices.optJSONObject(0);
            JSONObject message = choice == null ? null : choice.optJSONObject("message");
            return extractMessageContent(message == null ? null : message.opt("content"));
        } catch (Exception ignored) {
            return "";
        }
    }

    private static String extractMessageContent(Object rawContent) {
        if (rawContent instanceof String) {
            return (String) rawContent;
        }
        if (!(rawContent instanceof JSONArray)) {
            return "";
        }

        JSONArray parts = (JSONArray) rawContent;
        StringBuilder builder = new StringBuilder();
        for (int index = 0; index < parts.length(); index++) {
            JSONObject part = parts.optJSONObject(index);
            if (part == null || !"text".equals(part.optString("type"))) {
                continue;
            }
            if (builder.length() > 0) {
                builder.append('\n');
            }
            builder.append(part.optString("text", ""));
        }
        return builder.toString();
    }

    private static CaptureAnalysisOutcome buildFailureOutcome(
        String responseBody,
        String assistantReplyRaw,
        JSONObject assistantReplyParsed,
        String failureStage,
        String failureReason,
        CaptureAnalysisResult result
    ) {
        return new CaptureAnalysisOutcome(
            result,
            0,
            responseBody,
            assistantReplyRaw,
            assistantReplyParsed,
            failureStage,
            failureReason
        );
    }
}
