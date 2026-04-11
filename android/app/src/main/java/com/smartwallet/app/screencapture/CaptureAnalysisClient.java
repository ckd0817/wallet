package com.smartwallet.app.screencapture;

import android.util.Base64;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.text.SimpleDateFormat;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

public class CaptureAnalysisClient {

    private static final int DEFAULT_REQUEST_TIMEOUT_MS = 20000;
    private static final int MAX_REQUEST_TIMEOUT_MS = 120000;
    private static final String DEFAULT_CAPTURE_PROMPT =
        "你正在分析一张付款、收款或退款结果截图。\n" +
        "今天的本地日期是 {{today_date}}。在推断 occurredAt 时优先使用这个日期；只有截图里明确出现其他日期时，才使用截图中的日期。\n" +
        "你只能识别两种交易类型：expense 或 income。\n" +
        "付款成功、消费支出、扣款成功等记为 expense。\n" +
        "收款到账、退款到账、报销到账等记为 income。\n" +
        "如果截图不足以确认是一笔有效入账记录，或者无法确认金额，就仍然只返回 JSON，并将 amount 设为 0，categoryId 设为空字符串，summary 写明原因。\n" +
        "如果 transactionType=expense，categoryId 必须且只能从这些支出分类中选择：{{expense_categories}}。\n" +
        "如果 transactionType=income，categoryId 必须且只能从这些收入分类中选择：{{income_categories}}。\n" +
        "只返回 JSON，不要输出 Markdown、解释或额外文本。返回格式固定为 {\"transactionType\":\"expense|income\",\"amount\":number,\"merchantName\":\"...\",\"occurredAt\":\"YYYY-MM-DD\",\"categoryId\":\"...\",\"note\":\"...\",\"summary\":\"...\"}。";
    private static final String PROBE_IMAGE_BASE64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO0+j9kAAAAASUVORK5CYII=";

    public CaptureAnalysisOutcome analyze(byte[] pngBytes, JSONObject llmConfig, JSONArray categories) {
        if (
            llmConfig == null ||
            llmConfig.optString("apiKey", "").trim().isEmpty() ||
            llmConfig.optString("baseUrl", "").trim().isEmpty() ||
            llmConfig.optString("modelName", "").trim().isEmpty()
        ) {
            return new CaptureAnalysisOutcome(
                CaptureAnalysisResult.unsupported("未配置支持图片输入的截图模型"),
                0,
                "",
                "",
                null,
                "config",
                "未配置支持图片输入的截图模型"
            );
        }

        HttpURLConnection connection = null;
        try {
            String endpoint = normalizeEndpoint(llmConfig.optString("baseUrl", ""));
            connection = (HttpURLConnection) new URL(endpoint).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(resolveRequestTimeoutMs(llmConfig));
            connection.setReadTimeout(resolveRequestTimeoutMs(llmConfig));
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + llmConfig.optString("apiKey"));
            connection.setDoOutput(true);

            String encodedImage = Base64.encodeToString(pngBytes, Base64.NO_WRAP);
            JSONObject body = new JSONObject();
            body.put("model", llmConfig.optString("modelName"));
            body.put("temperature", 0.1d);
            body.put(
                "messages",
                new JSONArray()
                    .put(new JSONObject().put("role", "system").put("content", "你是截图自动记账助手。只返回原始 JSON，不要输出 Markdown、解释或额外文本。"))
                    .put(
                        new JSONObject()
                            .put("role", "user")
                            .put(
                                "content",
                                new JSONArray()
                                    .put(new JSONObject().put("type", "text").put("text", buildPrompt(categories, llmConfig)))
                                    .put(
                                        new JSONObject()
                                            .put("type", "image_url")
                                            .put("image_url", new JSONObject().put("url", "data:image/png;base64," + encodedImage))
                                    )
                            )
                    )
            );

            try (OutputStream outputStream = connection.getOutputStream()) {
                outputStream.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }

            int httpStatus = connection.getResponseCode();
            String responseBody = readResponseBody(
                httpStatus >= 200 && httpStatus < 300 ? connection.getInputStream() : connection.getErrorStream()
            );

            if (httpStatus < 200 || httpStatus >= 300) {
                return new CaptureAnalysisOutcome(
                    CaptureAnalysisResult.unsupported("截图模型请求失败"),
                    httpStatus,
                    responseBody,
                    "",
                    null,
                    "http",
                    "截图模型请求失败"
                );
            }

            CaptureAnalysisOutcome outcome = CaptureAnalysisParser.parseChatResponse(responseBody)
                .withHttpStatus(httpStatus)
                .withResponseBodyRaw(responseBody);

            if (!outcome.isSupported()) {
                return outcome;
            }

            String resolvedCategoryId = resolveCategoryId(
                outcome.getResult().getCategoryId(),
                outcome.getResult().getTransactionType(),
                categories
            );
            if (resolvedCategoryId.isEmpty()) {
                return new CaptureAnalysisOutcome(
                    CaptureAnalysisResult.unsupported("分类无法映射到当前账本"),
                    outcome.getHttpStatus(),
                    outcome.getResponseBodyRaw(),
                    outcome.getAssistantReplyRaw(),
                    outcome.getAssistantReplyParsed(),
                    "validation",
                    "分类无法映射到当前账本"
                );
            }

            return outcome.withResolvedCategory(resolvedCategoryId);
        } catch (Exception exception) {
            String failureReason = exception.getMessage() == null || exception.getMessage().trim().isEmpty()
                ? "截图分析失败"
                : "截图分析失败: " + exception.getMessage().trim();
            return new CaptureAnalysisOutcome(
                CaptureAnalysisResult.unsupported(failureReason),
                0,
                "",
                "",
                null,
                "network",
                failureReason
            );
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    public JSONObject testConfig(JSONObject llmConfig, JSONArray categories) {
        long startedAt = System.currentTimeMillis();
        JSONObject result = new JSONObject();
        safePut(result, "ok", false);
        safePut(result, "message", "模型测试失败");
        safePut(result, "elapsedMs", 0);
        safePut(result, "httpStatus", 0);
        safePut(result, "endpoint", normalizeEndpoint(llmConfig == null ? "" : llmConfig.optString("baseUrl", "")));
        safePut(result, "modelName", llmConfig == null ? "" : llmConfig.optString("modelName", ""));
        safePut(result, "assistantReplyRaw", "");
        safePut(result, "responseBodyRaw", "");
        safePut(result, "failureStage", "");

        if (
            llmConfig == null ||
            llmConfig.optString("apiKey", "").trim().isEmpty() ||
            llmConfig.optString("baseUrl", "").trim().isEmpty() ||
            llmConfig.optString("modelName", "").trim().isEmpty()
        ) {
            safePut(result, "message", "请先填写完整的模型配置");
            safePut(result, "failureStage", "config");
            safePut(result, "elapsedMs", System.currentTimeMillis() - startedAt);
            return result;
        }

        HttpURLConnection connection = null;
        try {
            String endpoint = normalizeEndpoint(llmConfig.optString("baseUrl", ""));
            connection = (HttpURLConnection) new URL(endpoint).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(resolveRequestTimeoutMs(llmConfig));
            connection.setReadTimeout(resolveRequestTimeoutMs(llmConfig));
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + llmConfig.optString("apiKey"));
            connection.setDoOutput(true);

            JSONObject body = new JSONObject();
            body.put("model", llmConfig.optString("modelName"));
            body.put("temperature", 0d);
            body.put(
                "messages",
                new JSONArray()
                    .put(new JSONObject().put("role", "system").put("content", "你是模型连通性测试助手。只返回原始 JSON，不要输出 Markdown、解释或额外文本。"))
                    .put(
                        new JSONObject()
                            .put("role", "user")
                            .put(
                                "content",
                                new JSONArray()
                                    .put(
                                        new JSONObject()
                                            .put("type", "text")
                                            .put("text", buildPrompt(categories, llmConfig))
                                    )
                                    .put(
                                        new JSONObject()
                                            .put("type", "image_url")
                                            .put(
                                                "image_url",
                                                new JSONObject().put("url", "data:image/png;base64," + PROBE_IMAGE_BASE64)
                                            )
                                    )
                            )
                    )
            );

            try (OutputStream outputStream = connection.getOutputStream()) {
                outputStream.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }

            int httpStatus = connection.getResponseCode();
            String responseBody = readResponseBody(
                httpStatus >= 200 && httpStatus < 300 ? connection.getInputStream() : connection.getErrorStream()
            );
            String assistantReply = CaptureAnalysisParser.extractAssistantReply(responseBody);

            safePut(result, "httpStatus", httpStatus);
            safePut(result, "responseBodyRaw", responseBody);
            safePut(result, "assistantReplyRaw", assistantReply);

            if (httpStatus < 200 || httpStatus >= 300) {
                safePut(result, "message", "模型接口返回 HTTP " + httpStatus);
                safePut(result, "failureStage", "http");
                return result;
            }

            String cleanedReply = assistantReply.replaceAll("```json\\s*|```", "").trim();
            boolean ok = false;
            String message = "模型已响应，但返回内容不符合预期";
            try {
                JSONObject parsedReply = new JSONObject(cleanedReply);
                ok = parsedReply.optBoolean("ok", false);
                message = parsedReply.optString("message", message);
            } catch (Exception ignored) {
                if (!assistantReply.trim().isEmpty()) {
                    ok = true;
                    message = "模型已返回内容，接口连通正常";
                }
            }

            safePut(result, "ok", ok);
            safePut(result, "message", ok ? "模型测试成功: " + message : message);
            safePut(result, "failureStage", ok ? "" : "response_shape");
            return result;
        } catch (Exception exception) {
            String failureMessage = exception.getMessage() == null || exception.getMessage().trim().isEmpty()
                ? "模型测试失败"
                : "模型测试失败: " + exception.getMessage().trim();
            safePut(result, "message", failureMessage);
            safePut(result, "failureStage", "network");
            return result;
        } finally {
            safePut(result, "elapsedMs", System.currentTimeMillis() - startedAt);
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private String normalizeEndpoint(String baseUrl) {
        String normalized = baseUrl.replaceAll("/+$", "");
        if (normalized.endsWith("/chat/completions")) {
            return normalized;
        }
        return normalized + "/chat/completions";
    }

    private String buildPrompt(JSONArray categories, JSONObject llmConfig) {
        List<String> expenseOptions = new ArrayList<>();
        List<String> incomeOptions = new ArrayList<>();
        for (int index = 0; index < categories.length(); index++) {
            JSONObject category = categories.optJSONObject(index);
            if (category == null) {
                continue;
            }
            String option = category.optString("id") + ":" + category.optString("name");
            if ("expense".equals(category.optString("type"))) {
                expenseOptions.add(option);
            } else if ("income".equals(category.optString("type"))) {
                incomeOptions.add(option);
            }
        }

        String joinedExpenseOptions = joinOptions(expenseOptions);
        String joinedIncomeOptions = joinOptions(incomeOptions);
        String configuredPrompt = llmConfig == null ? "" : llmConfig.optString("capturePrompt", "");
        String prompt = configuredPrompt == null || configuredPrompt.trim().isEmpty()
            ? DEFAULT_CAPTURE_PROMPT
            : configuredPrompt.trim();
        String todayDate = currentLocalDate();

        if (prompt.contains("{{expense_categories}}")) {
            prompt = prompt.replace("{{expense_categories}}", joinedExpenseOptions);
        }

        if (prompt.contains("{{income_categories}}")) {
            prompt = prompt.replace("{{income_categories}}", joinedIncomeOptions);
        }

        if (prompt.contains("{{today_date}}")) {
            prompt = prompt.replace("{{today_date}}", todayDate);
        }

        if (!joinedExpenseOptions.isEmpty() && !prompt.contains(joinedExpenseOptions)) {
            prompt = prompt + "\n可选支出分类：" + joinedExpenseOptions;
        }

        if (!joinedIncomeOptions.isEmpty() && !prompt.contains(joinedIncomeOptions)) {
            prompt = prompt + "\n可选收入分类：" + joinedIncomeOptions;
        }

        if (!prompt.contains(todayDate)) {
            prompt = prompt + "\n今天的本地日期是 " + todayDate + "。";
        }

        return prompt;
    }

    private String joinOptions(List<String> options) {
        StringBuilder builder = new StringBuilder();
        for (int index = 0; index < options.size(); index++) {
            if (index > 0) {
                builder.append(", ");
            }
            builder.append(options.get(index));
        }
        return builder.toString();
    }

    private String resolveCategoryId(String candidate, String transactionType, JSONArray categories) {
        String normalizedCandidate = normalize(candidate);
        if (normalizedCandidate.isEmpty()) {
            return "";
        }

        for (int index = 0; index < categories.length(); index++) {
            JSONObject category = categories.optJSONObject(index);
            if (category == null || !transactionType.equals(category.optString("type"))) {
                continue;
            }

            String categoryId = category.optString("id");
            String categoryName = category.optString("name");
            if (
                normalizedCandidate.equals(normalize(categoryId)) ||
                normalizedCandidate.equals(normalize(categoryName))
            ) {
                return categoryId;
            }
        }

        return "";
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private int resolveRequestTimeoutMs(JSONObject llmConfig) {
        int configuredTimeout = llmConfig == null ? DEFAULT_REQUEST_TIMEOUT_MS : llmConfig.optInt("timeoutMs", DEFAULT_REQUEST_TIMEOUT_MS);
        if (configuredTimeout < 1000) {
            return DEFAULT_REQUEST_TIMEOUT_MS;
        }
        return Math.min(configuredTimeout, MAX_REQUEST_TIMEOUT_MS);
    }

    private String currentLocalDate() {
        SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT);
        formatter.setTimeZone(TimeZone.getDefault());
        return formatter.format(new Date());
    }

    private String readResponseBody(InputStream stream) {
        if (stream == null) {
            return "";
        }

        StringBuilder responseBuilder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                responseBuilder.append(line);
            }
        } catch (Exception ignored) {
            return "";
        }

        return responseBuilder.toString();
    }

    private void safePut(JSONObject object, String key, Object value) {
        try {
            object.put(key, value);
        } catch (Exception ignored) {}
    }
}
