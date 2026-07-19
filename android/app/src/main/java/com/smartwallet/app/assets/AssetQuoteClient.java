package com.smartwallet.app.assets;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

public class AssetQuoteClient {

    private static final Pattern FUND_PATTERN = Pattern.compile("jsonpgz\\((.*)\\);?");
    private static final Pattern STOCK_PATTERN = Pattern.compile("v_(sh|sz)(\\d{6})=\"([^\"]*)\";");

    public JSONArray sync(JSONArray holdings) {
        JSONArray quotes = new JSONArray();
        if (holdings == null || holdings.length() == 0) {
            return quotes;
        }

        StringBuilder stockQuery = new StringBuilder();
        for (int index = 0; index < holdings.length(); index++) {
            JSONObject holding = holdings.optJSONObject(index);
            if (holding == null) {
                continue;
            }
            String assetType = holding.optString("assetType", "");
            String code = normalizeCode(holding.optString("code", ""));
            if (code.isEmpty()) {
                continue;
            }

            if ("fund".equals(assetType)) {
                JSONObject quote = fetchFundQuote(code);
                if (quote != null) {
                    quotes.put(quote);
                }
            } else {
                if (stockQuery.length() > 0) {
                    stockQuery.append(",");
                }
                String market = holding.optString("market", inferStockMarket(code));
                stockQuery.append(("sh".equals(market) ? "sh" : "sz")).append(code);
            }
        }

        if (stockQuery.length() > 0) {
            stockQuery.append(",");
        }
        stockQuery.append("sh000001");

        if (stockQuery.length() > 0) {
            JSONArray stockQuotes = fetchStockQuotes(stockQuery.toString());
            for (int index = 0; index < stockQuotes.length(); index++) {
                quotes.put(stockQuotes.optJSONObject(index));
            }
        }

        return quotes;
    }

    public JSONObject parseFundQuote(String content, String syncedAt) {
        try {
            Matcher matcher = FUND_PATTERN.matcher(content == null ? "" : content.trim());
            if (!matcher.find()) {
                return null;
            }

            JSONObject payload = new JSONObject(matcher.group(1));
            String code = normalizeCode(payload.optString("fundcode", ""));
            double estimatedPrice = parseDouble(payload.optString("gsz", ""));
            double confirmedPrice = parseDouble(payload.optString("dwjz", ""));
            double price = estimatedPrice > 0 ? estimatedPrice : confirmedPrice;
            if (code.isEmpty() || price <= 0) {
                return null;
            }

            JSONObject quote = new JSONObject();
            safePut(quote, "assetType", "fund");
            safePut(quote, "code", code);
            safePut(quote, "name", payload.optString("name", ""));
            safePut(quote, "price", price);
            safePut(quote, "changePercent", parseDouble(payload.optString("gszzl", "0")));
            safePut(quote, "quoteTime", firstNonEmpty(payload.optString("gztime", ""), payload.optString("jzrq", "")));
            safePut(quote, "source", "eastmoney-fund");
            safePut(quote, "syncedAt", syncedAt);
            safePut(quote, "priceSource", estimatedPrice > 0 ? "estimated" : "confirmed");
            if (estimatedPrice > 0) {
                safePut(quote, "estimatedPrice", estimatedPrice);
            }
            if (confirmedPrice > 0) {
                safePut(quote, "confirmedPrice", confirmedPrice);
            }
            String confirmedDate = normalizeDate(payload.optString("jzrq", ""));
            if (!confirmedDate.isEmpty()) {
                safePut(quote, "confirmedDate", confirmedDate);
            }
            return quote;
        } catch (Exception ignored) {
            return null;
        }
    }

    public JSONArray parseStockQuotes(String content, String syncedAt) {
        JSONArray quotes = new JSONArray();
        Matcher matcher = STOCK_PATTERN.matcher(content == null ? "" : content);
        while (matcher.find()) {
            String market = matcher.group(1);
            String code = matcher.group(2);
            String[] fields = matcher.group(3).split("~", -1);
            if (fields.length < 33) {
                continue;
            }
            double price = parseDouble(fields[3]);
            if (price <= 0) {
                continue;
            }

            JSONObject quote = new JSONObject();
            boolean isIndex = "sh".equals(market) && "000001".equals(code);
            safePut(quote, "assetType", isIndex ? "index" : "stock");
            safePut(quote, "code", code);
            safePut(quote, "name", fields[1]);
            safePut(quote, "price", price);
            safePut(quote, "changePercent", parseDouble(fields[32]));
            safePut(quote, "quoteTime", formatTencentTime(fields[30]));
            safePut(quote, "source", isIndex ? "tencent-index-sh" : "tencent-" + market);
            safePut(quote, "syncedAt", syncedAt);
            quotes.put(quote);
        }
        return quotes;
    }

    private JSONObject fetchFundQuote(String code) {
        try {
            String content = request("https://fundgz.1234567.com.cn/js/" + code + ".js?rt=" + System.currentTimeMillis(), StandardCharsets.UTF_8);
            return parseFundQuote(content, nowIsoString());
        } catch (Exception ignored) {
            return errorQuote("fund", code, "行情同步失败");
        }
    }

    private JSONArray fetchStockQuotes(String query) {
        try {
            String content = request("https://qt.gtimg.cn/q=" + query, Charset.forName("GBK"));
            return parseStockQuotes(content, nowIsoString());
        } catch (Exception ignored) {
            return new JSONArray();
        }
    }

    private String request(String endpoint, Charset charset) throws Exception {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(endpoint).openConnection();
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(10000);
            connection.setRequestProperty("User-Agent", "SmartWallet/1.0");
            return read(connection.getInputStream(), charset);
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private String read(InputStream inputStream, Charset charset) throws Exception {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream, charset))) {
            StringBuilder builder = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line).append("\n");
            }
            return builder.toString();
        }
    }

    private JSONObject errorQuote(String assetType, String code, String error) {
        JSONObject quote = new JSONObject();
        safePut(quote, "assetType", assetType);
        safePut(quote, "code", code);
        safePut(quote, "name", "");
        safePut(quote, "price", 0);
        safePut(quote, "changePercent", 0);
        safePut(quote, "quoteTime", "");
        safePut(quote, "source", "error");
        safePut(quote, "syncedAt", nowIsoString());
        safePut(quote, "error", error);
        return quote;
    }

    private String normalizeCode(String code) {
        String normalized = code == null ? "" : code.replaceAll("\\D", "");
        return normalized.length() > 6 ? normalized.substring(0, 6) : normalized;
    }

    private String inferStockMarket(String code) {
        return code.startsWith("6") || code.startsWith("5") ? "sh" : "sz";
    }

    private String firstNonEmpty(String first, String second) {
        return first != null && !first.isEmpty() ? first : second;
    }

    private String normalizeDate(String value) {
        if (value == null || value.isEmpty()) {
            return "";
        }
        String[] parts = value.split("-");
        if (parts.length != 3) {
            return value;
        }
        return parts[0] + "-" + pad2(parts[1]) + "-" + pad2(parts[2]);
    }

    private String pad2(String value) {
        return value.length() == 1 ? "0" + value : value;
    }

    private double parseDouble(String value) {
        try {
            return Double.parseDouble(value);
        } catch (Exception ignored) {
            return 0d;
        }
    }

    private String formatTencentTime(String rawTime) {
        if (rawTime == null || !rawTime.matches("\\d{14}")) {
            return rawTime == null ? "" : rawTime;
        }
        return rawTime.substring(0, 4) + "-" + rawTime.substring(4, 6) + "-" + rawTime.substring(6, 8) + " " + rawTime.substring(8, 10) + ":" + rawTime.substring(10, 12);
    }

    private String nowIsoString() {
        SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        formatter.setTimeZone(TimeZone.getTimeZone("UTC"));
        return formatter.format(new Date());
    }

    private void safePut(JSONObject object, String key, Object value) {
        try {
            object.put(key, value);
        } catch (Exception ignored) {}
    }
}
