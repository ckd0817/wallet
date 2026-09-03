package com.smartwallet.app.assets;

import android.util.Base64;
import com.smartwallet.app.screencapture.CaptureAnalysisParser;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;

public class AssetScreenshotAnalysisClient {

    private static final String PROMPT =
        "你正在分析一张股票或基金持仓截图。\n" +
        "识别 A 股、美股、场内 ETF 和场外公募基金。\n" +
        "请提取每个持仓的代码、名称、类型、份额、总成本、单位成本、市值、持仓收益和收益率。\n" +
        "股票 assetType=stock，基金 assetType=fund。美股代码保留大写字母和点，market=us，currency=USD；A 股 market=sh 或 sz，基金 market=fund，currency=CNY。\n" +
        "持仓金额、基金资产、总金额是市值 marketValue。\n" +
        "平均成本、单位成本是 unitCost。小数形态的“持仓成本”通常也是 unitCost，禁止直接当总成本。\n" +
        "金额形态且明确表示投入本金/持仓总成本的“持仓成本”才是 totalCost。\n" +
        "持仓收益、累计收益是 holdingProfit；持仓收益率是 profitRate。\n" +
        "如果缺少某个字段，将对应数值设为 0。\n" +
        "只返回 JSON，不要输出 Markdown、解释或额外文本。返回格式固定为 {\"holdings\":[{\"assetType\":\"stock|fund\",\"code\":\"000001|AAPL\",\"market\":\"sh|sz|fund|us\",\"currency\":\"CNY|USD\",\"name\":\"...\",\"shares\":number,\"totalCost\":number,\"unitCost\":number,\"marketValue\":number,\"holdingProfit\":number,\"profitRate\":number}]}。";

    public JSONObject analyze(String imageBase64, JSONObject llmConfig) {
        JSONObject result = defaultResult();
        if (
            llmConfig == null ||
            llmConfig.optString("apiKey", "").trim().isEmpty() ||
            llmConfig.optString("baseUrl", "").trim().isEmpty() ||
            llmConfig.optString("modelName", "").trim().isEmpty()
        ) {
            safePut(result, "message", "请先填写完整的模型配置");
            safePut(result, "failureStage", "config");
            return result;
        }

        HttpURLConnection connection = null;
        try {
            String endpoint = normalizeEndpoint(llmConfig.optString("baseUrl", ""));
            connection = (HttpURLConnection) new URL(endpoint).openConnection();
            connection.setRequestMethod("POST");
            int timeout = resolveTimeout(llmConfig);
            connection.setConnectTimeout(timeout);
            connection.setReadTimeout(timeout);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + llmConfig.optString("apiKey"));
            connection.setDoOutput(true);

            JSONObject body = new JSONObject();
            body.put("model", llmConfig.optString("modelName"));
            body.put("temperature", 0.1d);
            body.put(
                "messages",
                new JSONArray()
                    .put(new JSONObject().put("role", "system").put("content", "你是资产持仓识别助手。只返回原始 JSON。"))
                    .put(
                        new JSONObject()
                            .put("role", "user")
                            .put(
                                "content",
                                new JSONArray()
                                    .put(new JSONObject().put("type", "text").put("text", PROMPT))
                                    .put(
                                        new JSONObject()
                                            .put("type", "image_url")
                                            .put("image_url", new JSONObject().put("url", "data:image/png;base64," + stripDataUrl(imageBase64)))
                                    )
                            )
                    )
            );

            try (OutputStream outputStream = connection.getOutputStream()) {
                outputStream.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }

            int httpStatus = connection.getResponseCode();
            String responseBody = readResponseBody(httpStatus >= 200 && httpStatus < 300 ? connection.getInputStream() : connection.getErrorStream());
            safePut(result, "responseBodyRaw", responseBody);

            if (httpStatus < 200 || httpStatus >= 300) {
                safePut(result, "message", "模型接口返回 HTTP " + httpStatus);
                safePut(result, "failureStage", "http");
                return result;
            }

            String assistantReply = CaptureAnalysisParser.extractAssistantReply(responseBody);
            safePut(result, "assistantReplyRaw", assistantReply);
            JSONObject parsed = parseAssistantJson(assistantReply);
            JSONArray holdings = normalizeHoldings(parsed.optJSONArray("holdings"));
            if (holdings.length() == 0) {
                safePut(result, "message", "未识别到持仓");
                safePut(result, "failureStage", "validation");
                return result;
            }

            safePut(result, "ok", true);
            safePut(result, "message", "识别完成");
            safePut(result, "holdings", holdings);
            safePut(result, "failureStage", "");
            return result;
        } catch (Exception exception) {
            safePut(result, "message", exception.getMessage() == null || exception.getMessage().trim().isEmpty() ? "识别失败" : "识别失败: " + exception.getMessage().trim());
            safePut(result, "failureStage", "network");
            return result;
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private JSONObject defaultResult() {
        JSONObject object = new JSONObject();
        safePut(object, "ok", false);
        safePut(object, "message", "识别失败");
        safePut(object, "holdings", new JSONArray());
        safePut(object, "assistantReplyRaw", "");
        safePut(object, "responseBodyRaw", "");
        safePut(object, "failureStage", "");
        return object;
    }

    public JSONArray normalizeHoldings(JSONArray rawHoldings) {
        JSONArray holdings = new JSONArray();
        if (rawHoldings == null) {
            return holdings;
        }

        for (int index = 0; index < rawHoldings.length(); index++) {
            JSONObject raw = rawHoldings.optJSONObject(index);
            if (raw == null) {
                continue;
            }
            String assetType = "fund".equals(raw.optString("assetType", "")) ? "fund" : "stock";
            String rawCode = raw.optString("code", "");
            String market = normalizeMarket(assetType, rawCode, raw.optString("market", ""));
            String code = normalizeCode(rawCode, market);
            if (code.isEmpty()) {
                continue;
            }
            JSONObject holding = new JSONObject();
            safePut(holding, "assetType", assetType);
            safePut(holding, "code", code);
            safePut(holding, "market", market);
            safePut(holding, "currency", "us".equals(market) ? "USD" : "CNY");
            safePut(holding, "name", raw.optString("name", ""));
            double shares = normalizeAmount(raw.optDouble("shares", 0d));
            double totalCost = normalizeAmount(raw.optDouble("totalCost", 0d));
            double unitCost = normalizeAmount(raw.optDouble("unitCost", 0d));
            double marketValue = normalizeAmount(raw.optDouble("marketValue", 0d));
            double holdingProfit = raw.optDouble("holdingProfit", 0d);
            double profitRate = raw.optDouble("profitRate", 0d);
            CostResult costResult = resolveTotalCost(
                normalizeAmount(raw.optDouble("costAmount", 0d)),
                totalCost,
                unitCost,
                shares,
                marketValue,
                holdingProfit,
                profitRate
            );
            safePut(holding, "shares", shares);
            safePut(holding, "costAmount", costResult.costAmount);
            safePut(holding, "totalCost", totalCost);
            safePut(holding, "unitCost", unitCost);
            safePut(holding, "marketValue", marketValue);
            safePut(holding, "holdingProfit", holdingProfit);
            safePut(holding, "profitRate", profitRate);
            safePut(holding, "costSource", costResult.costSource);
            holdings.put(holding);
        }
        return holdings;
    }

    private CostResult resolveTotalCost(
        double costAmount,
        double totalCost,
        double unitCost,
        double shares,
        double marketValue,
        double holdingProfit,
        double profitRate
    ) {
        if (totalCost > 0d) {
            return new CostResult(totalCost, "total_cost");
        }
        if (unitCost > 0d && shares > 0d) {
            return new CostResult(unitCost * shares, "unit_cost");
        }
        if (marketValue > 0d && holdingProfit != 0d) {
            return new CostResult(Math.max(0d, marketValue - holdingProfit), "market_minus_profit");
        }
        if (marketValue > 0d && profitRate != 0d && profitRate > -100d) {
            return new CostResult(marketValue / (1d + profitRate / 100d), "market_by_rate");
        }
        if (costAmount > 0d) {
            return new CostResult(costAmount, "total_cost");
        }
        return new CostResult(0d, "missing");
    }

    private double normalizeAmount(double value) {
        if (Double.isNaN(value) || Double.isInfinite(value) || value < 0d) {
            return 0d;
        }
        return value;
    }

    private static final class CostResult {
        private final double costAmount;
        private final String costSource;

        private CostResult(double costAmount, String costSource) {
            this.costAmount = costAmount;
            this.costSource = costSource;
        }
    }

    private JSONObject parseAssistantJson(String assistantReply) throws Exception {
        String cleaned = assistantReply == null ? "" : assistantReply.replaceAll("```json\\s*|```", "").trim();
        return new JSONObject(cleaned);
    }

    private String normalizeEndpoint(String baseUrl) {
        String normalized = baseUrl.replaceAll("/+$", "");
        return normalized.endsWith("/chat/completions") ? normalized : normalized + "/chat/completions";
    }

    private int resolveTimeout(JSONObject llmConfig) {
        int timeout = llmConfig.optInt("timeoutMs", 20000);
        return Math.max(1000, Math.min(timeout, 120000));
    }

    private String stripDataUrl(String imageBase64) {
        int commaIndex = imageBase64.indexOf(',');
        String raw = commaIndex >= 0 ? imageBase64.substring(commaIndex + 1) : imageBase64;
        Base64.decode(raw, Base64.DEFAULT);
        return raw;
    }

    private String normalizeCode(String code, String market) {
        if ("us".equals(market)) {
            String normalized = code == null ? "" : code.trim().toUpperCase(java.util.Locale.US);
            normalized = normalized.replaceFirst("^(NASDAQ|NYSE|AMEX|US)\\s*:", "");
            normalized = normalized.replace('-', '.').replace('/', '.').replaceAll("[^A-Z0-9.]", "");
            normalized = normalized.replaceAll("\\.{2,}", ".").replaceAll("^\\.+|\\.+$", "");
            return normalized.length() > 12 ? normalized.substring(0, 12) : normalized;
        }
        String normalized = code == null ? "" : code.replaceAll("\\D", "");
        return normalized.length() > 6 ? normalized.substring(0, 6) : normalized;
    }

    private String normalizeMarket(String assetType, String code, String market) {
        if ("fund".equals(assetType)) {
            return "fund";
        }
        if ("us".equals(market) || (code != null && code.matches(".*[A-Za-z].*"))) {
            return "us";
        }
        if ("sh".equals(market) || "sz".equals(market)) {
            return market;
        }
        return code.startsWith("6") || code.startsWith("5") ? "sh" : "sz";
    }

    private String readResponseBody(InputStream inputStream) throws Exception {
        if (inputStream == null) {
            return "";
        }
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream, StandardCharsets.UTF_8))) {
            StringBuilder builder = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line);
            }
            return builder.toString();
        }
    }

    private void safePut(JSONObject object, String key, Object value) {
        try {
            object.put(key, value);
        } catch (Exception ignored) {}
    }
}
