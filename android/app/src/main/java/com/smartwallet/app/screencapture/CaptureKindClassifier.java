package com.smartwallet.app.screencapture;

import android.util.Base64;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 轻量截图分类：判断截图是记账（支付/收款/退款）还是资产持仓页。
 * 任何异常或歧义都回退到记账，保证主流程零回归。
 */
public class CaptureKindClassifier {

    public static final String KIND_BOOKKEEPING = "bookkeeping";
    public static final String KIND_ASSET = "asset";

    private static final int DEFAULT_REQUEST_TIMEOUT_MS = 20000;
    private static final int MAX_REQUEST_TIMEOUT_MS = 120000;
    private static final String SYSTEM_PROMPT =
        "你是截图分类助手。只返回原始 JSON，不要输出 Markdown、解释或额外文本。";
    private static final String USER_PROMPT =
        "判断这张截图属于哪一类：\n" +
        "bookkeeping：付款、收款、退款、消费等单笔交易结果截图。\n" +
        "asset：投资账户的持仓、基金、股票、市值或收益截图。\n" +
        "只返回 JSON，格式固定为 {\"kind\":\"bookkeeping|asset\"}。无法确定时返回 bookkeeping。";

    /** 返回 KIND_BOOKKEEPING 或 KIND_ASSET，出错时回退到记账。 */
    public String classify(byte[] pngBytes, JSONObject llmConfig) {
        if (
            pngBytes == null ||
            pngBytes.length == 0 ||
            llmConfig == null ||
            llmConfig.optString("apiKey", "").trim().isEmpty() ||
            llmConfig.optString("baseUrl", "").trim().isEmpty() ||
            llmConfig.optString("modelName", "").trim().isEmpty()
        ) {
            return KIND_BOOKKEEPING;
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
            body.put("temperature", 0d);
            body.put(
                "messages",
                new JSONArray()
                    .put(new JSONObject().put("role", "system").put("content", SYSTEM_PROMPT))
                    .put(
                        new JSONObject()
                            .put("role", "user")
                            .put(
                                "content",
                                new JSONArray()
                                    .put(new JSONObject().put("type", "text").put("text", USER_PROMPT))
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
            if (httpStatus < 200 || httpStatus >= 300) {
                return KIND_BOOKKEEPING;
            }
            String responseBody = readResponseBody(connection.getInputStream());
            String assistantReply = CaptureAnalysisParser.extractAssistantReply(responseBody);
            return parseKind(assistantReply);
        } catch (Exception exception) {
            return KIND_BOOKKEEPING;
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    static String parseKind(String assistantReply) {
        if (assistantReply == null) {
            return KIND_BOOKKEEPING;
        }
        String text = assistantReply.trim();
        if (text.isEmpty()) {
            return KIND_BOOKKEEPING;
        }
        String stripped = text
            .replaceAll("(?s)```json", "")
            .replaceAll("(?s)```", "")
            .trim();
        try {
            int start = stripped.indexOf('{');
            int end = stripped.lastIndexOf('}');
            if (start >= 0 && end > start) {
                JSONObject parsed = new JSONObject(stripped.substring(start, end + 1));
                String kind = parsed.optString("kind", "").trim().toLowerCase();
                if (KIND_ASSET.equals(kind)) {
                    return KIND_ASSET;
                }
                return KIND_BOOKKEEPING;
            }
        } catch (Exception ignored) {
            // fall through to text heuristic
        }
        return stripped.toLowerCase().contains(KIND_ASSET) ? KIND_ASSET : KIND_BOOKKEEPING;
    }

    private String normalizeEndpoint(String baseUrl) {
        String normalized = baseUrl.replaceAll("/+$", "");
        if (normalized.endsWith("/chat/completions")) {
            return normalized;
        }
        return normalized + "/chat/completions";
    }

    private int resolveRequestTimeoutMs(JSONObject llmConfig) {
        int configuredTimeout = llmConfig == null ? DEFAULT_REQUEST_TIMEOUT_MS : llmConfig.optInt("timeoutMs", DEFAULT_REQUEST_TIMEOUT_MS);
        if (configuredTimeout < 1000) {
            return DEFAULT_REQUEST_TIMEOUT_MS;
        }
        return Math.min(configuredTimeout, MAX_REQUEST_TIMEOUT_MS);
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
}
