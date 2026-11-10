package com.smartwallet.app.assets;

import android.util.Log;
import com.smartwallet.app.data.CloudSync;
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

    private static final String TAG = "SmartWalletQuotes";
    public static final String SOURCE_EASTMONEY = "eastmoney";
    public static final String SOURCE_SINA = "sina";
    public static final String SOURCE_TENCENT = "tencent";
    public static final String SOURCE_LEGACY = "legacy";
    private static final Pattern FUND_PATTERN = Pattern.compile("jsonpgz\\((.*)\\);?");
    private static final Pattern TENCENT_FUND_PATTERN = Pattern.compile("v_jj(\\d{6})=\"([^\"]*)\";");
    private static final Pattern STOCK_PATTERN = Pattern.compile("v_(sh|sz)(\\d{6})=\"([^\"]*)\";");
    private static final Pattern US_STOCK_PATTERN = Pattern.compile("v_us([A-Z0-9.]+)=\"([^\"]*)\";", Pattern.CASE_INSENSITIVE);

    public JSONArray sync(JSONArray holdings) {
        return sync(holdings, SOURCE_EASTMONEY);
    }

    public JSONArray sync(JSONArray holdings, String fundQuoteSource) {
        JSONArray quotes = new JSONArray();
        if (holdings == null || holdings.length() == 0) {
            return quotes;
        }

        StringBuilder stockQuery = new StringBuilder();
        boolean hasUsdHolding = false;
        for (int index = 0; index < holdings.length(); index++) {
            JSONObject holding = holdings.optJSONObject(index);
            if (holding == null) {
                continue;
            }
            String assetType = holding.optString("assetType", "");
            String rawCode = holding.optString("code", "");
            String market = holding.optString("market", "");
            boolean isUs = "us".equals(market) || rawCode.matches(".*[A-Za-z].*");
            hasUsdHolding = hasUsdHolding || isUs;
            String code = isUs ? normalizeUsCode(rawCode) : normalizeCode(rawCode);
            if (code.isEmpty()) {
                continue;
            }

            if ("fund".equals(assetType)) {
                JSONObject quote = fetchFundQuote(code, holding.optString("name", ""), normalizeFundQuoteSource(fundQuoteSource));
                if (quote != null) {
                    quotes.put(quote);
                }
            } else {
                if (stockQuery.length() > 0) {
                    stockQuery.append(",");
                }
                if (isUs) {
                    stockQuery.append("us").append(code);
                } else {
                    market = market.isEmpty() ? inferStockMarket(code) : market;
                    stockQuery.append(("sh".equals(market) ? "sh" : "sz")).append(code);
                }
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

        if (hasUsdHolding) {
            JSONObject exchangeRate = fetchUsdCnyRate();
            if (exchangeRate != null) {
                quotes.put(exchangeRate);
            }
        }

        return quotes;
    }

    public JSONArray syncWeekly(JSONArray holdings, String fundQuoteSource, String weekEnd) {
        JSONArray quotes = new JSONArray();
        if (weekEnd == null || !weekEnd.matches("\\d{4}-\\d{2}-\\d{2}")) {
            return quotes;
        }
        String startDate = shiftDate(weekEnd, -40);
        String previousWeekEnd = shiftDate(weekEnd, -7);
        if (startDate.isEmpty() || previousWeekEnd.isEmpty()) {
            return quotes;
        }

        boolean hasUsdHolding = false;
        if (holdings != null) {
            for (int index = 0; index < holdings.length(); index++) {
                JSONObject holding = holdings.optJSONObject(index);
                if (holding == null) {
                    continue;
                }
                String assetType = holding.optString("assetType", "");
                String rawCode = holding.optString("code", "");
                String market = holding.optString("market", "");
                boolean isUs = "us".equals(market) || rawCode.matches(".*[A-Za-z].*");
                hasUsdHolding = hasUsdHolding || isUs;
                String code = isUs ? normalizeUsCode(rawCode) : normalizeCode(rawCode);
                if (code.isEmpty()) {
                    continue;
                }

                JSONObject quote;
                if ("fund".equals(assetType)) {
                    quote = fetchFundWeeklyQuote(code, holding.optString("name", ""), normalizeFundQuoteSource(fundQuoteSource), startDate, weekEnd, previousWeekEnd);
                } else if (isUs) {
                    quote = fetchKlineWeeklyQuote("us" + code, "us", code, startDate, weekEnd, previousWeekEnd);
                } else {
                    String stockMarket = market.isEmpty() ? inferStockMarket(code) : market;
                    stockMarket = "sh".equals(stockMarket) ? "sh" : "sz";
                    quote = fetchKlineWeeklyQuote(stockMarket + code, stockMarket, code, startDate, weekEnd, previousWeekEnd);
                }
                if (quote != null) {
                    safePut(quote, "periodEnd", weekEnd);
                    quotes.put(quote);
                }
            }
        }

        JSONObject benchmark = fetchKlineWeeklyQuote("sh000001", "sh", "000001", startDate, weekEnd, previousWeekEnd);
        if (benchmark != null) {
            safePut(benchmark, "periodEnd", weekEnd);
            quotes.put(benchmark);
        }

        if (hasUsdHolding) {
            JSONObject exchangeRate = fetchUsdCnyRateOn(weekEnd);
            if (exchangeRate == null) {
                exchangeRate = fetchUsdCnyRate();
            }
            if (exchangeRate != null) {
                safePut(exchangeRate, "periodEnd", weekEnd);
                quotes.put(exchangeRate);
            }
        }

        return quotes;
    }

    public String parseTencentKlineFullSymbol(String content, String symbol) {
        try {
            JSONObject data = new JSONObject(content == null ? "" : content.trim()).optJSONObject("data");
            JSONObject item = data == null ? null : data.optJSONObject(symbol);
            JSONObject qt = item == null ? null : item.optJSONObject("qt");
            JSONArray fields = qt == null ? null : qt.optJSONArray(symbol);
            String fullCode = fields == null ? "" : fields.optString(2, "");
            return fullCode.isEmpty() ? "" : "us" + fullCode;
        } catch (Exception ignored) {
            return "";
        }
    }

    public JSONObject parseTencentKlineWeeklyQuote(
        String content,
        String symbol,
        String market,
        String code,
        String weekEnd,
        String previousWeekEnd,
        String syncedAt
    ) {
        try {
            JSONObject data = new JSONObject(content == null ? "" : content.trim()).optJSONObject("data");
            JSONObject item = data == null ? null : data.optJSONObject(symbol);
            if (item == null) {
                return null;
            }
            JSONArray rows = item.optJSONArray("day");
            if (rows == null || rows.length() == 0) {
                rows = item.optJSONArray("qfqday");
            }
            if (rows == null || rows.length() == 0) {
                return null;
            }
            String latestDate = "";
            double latestClose = 0d;
            double previousClose = 0d;
            for (int index = 0; index < rows.length(); index++) {
                JSONArray row = rows.optJSONArray(index);
                if (row == null || row.length() < 3) {
                    continue;
                }
                String date = row.optString(0, "");
                double close = parseDouble(row.optString(2, ""));
                if (close <= 0 || date.compareTo(weekEnd) > 0) {
                    continue;
                }
                if (date.compareTo(latestDate) >= 0) {
                    latestDate = date;
                    latestClose = close;
                }
                if (date.compareTo(previousWeekEnd) <= 0) {
                    previousClose = close;
                }
            }
            if (latestClose <= 0) {
                return null;
            }
            JSONObject qt = item.optJSONObject("qt");
            JSONArray fields = qt == null ? null : qt.optJSONArray(symbol);
            String name = fields == null ? "" : fields.optString(1, "");
            boolean isIndex = ("sh".equals(market) && "000001".equals(code)) ||
                ("us".equals(market) && ("INX".equals(code) || "IXIC".equals(code) || "DJI".equals(code)));
            JSONObject quote = new JSONObject();
            safePut(quote, "assetType", isIndex ? "index" : "stock");
            safePut(quote, "code", code);
            safePut(quote, "name", name);
            safePut(quote, "price", latestClose);
            safePut(quote, "changePercent", previousClose > 0 ? (latestClose - previousClose) / previousClose * 100d : 0d);
            safePut(quote, "quoteTime", latestDate);
            safePut(quote, "source", isIndex ? "tencent-index-" + market : "tencent-" + market);
            safePut(quote, "syncedAt", syncedAt);
            safePut(quote, "currency", "us".equals(market) ? "USD" : "CNY");
            return quote;
        } catch (Exception ignored) {
            return null;
        }
    }

    public JSONObject parseEastmoneyFundWeeklyQuote(
        String content,
        String code,
        String name,
        String weekEnd,
        String previousWeekEnd,
        String syncedAt
    ) {
        try {
            JSONObject payload = new JSONObject(content == null ? "" : content.trim());
            if (payload.optInt("ErrCode", -1) != 0) {
                return null;
            }
            JSONObject data = payload.optJSONObject("Data");
            JSONArray rows = data == null ? null : data.optJSONArray("LSJZList");
            return weeklyFundQuote(rows, "FSRQ", "DWJZ", code, name, weekEnd, previousWeekEnd, "eastmoney-f10", syncedAt);
        } catch (Exception ignored) {
            return null;
        }
    }

    public JSONObject parseSinaFundWeeklyQuote(
        String content,
        String code,
        String name,
        String weekEnd,
        String previousWeekEnd,
        String syncedAt
    ) {
        try {
            JSONObject payload = new JSONObject(content == null ? "" : content.trim());
            JSONObject result = payload.optJSONObject("result");
            JSONObject status = result == null ? null : result.optJSONObject("status");
            JSONObject data = result == null ? null : result.optJSONObject("data");
            JSONArray rows = data == null ? null : data.optJSONArray("data");
            if (status == null || status.optInt("code", -1) != 0) {
                return null;
            }
            return weeklyFundQuote(rows, "fbrq", "jjjz", code, name, weekEnd, previousWeekEnd, "sina-fund", syncedAt);
        } catch (Exception ignored) {
            return null;
        }
    }

    private JSONObject weeklyFundQuote(
        JSONArray rows,
        String dateKey,
        String priceKey,
        String code,
        String name,
        String weekEnd,
        String previousWeekEnd,
        String source,
        String syncedAt
    ) {
        if (rows == null) {
            return null;
        }
        String latestDate = "";
        double latestPrice = 0d;
        String previousDate = "";
        double previousPrice = 0d;
        for (int index = 0; index < rows.length(); index++) {
            JSONObject row = rows.optJSONObject(index);
            if (row == null) {
                continue;
            }
            String date = normalizeDate(row.optString(dateKey, "").split(" ")[0]);
            double price = parseDouble(row.optString(priceKey, ""));
            if (price <= 0 || date.isEmpty() || date.compareTo(weekEnd) > 0) {
                continue;
            }
            if (date.compareTo(latestDate) > 0) {
                latestDate = date;
                latestPrice = price;
            }
            if (date.compareTo(previousWeekEnd) <= 0 && date.compareTo(previousDate) > 0) {
                previousDate = date;
                previousPrice = price;
            }
        }
        double changePercent = previousPrice > 0 ? (latestPrice - previousPrice) / previousPrice * 100d : 0d;
        return confirmedFundQuote(code, name, latestPrice, changePercent, latestDate, source, syncedAt);
    }

    private JSONObject fetchKlineWeeklyQuote(
        String symbol,
        String market,
        String code,
        String startDate,
        String weekEnd,
        String previousWeekEnd
    ) {
        try {
            String content = requestKline(symbol, startDate, weekEnd);
            JSONObject quote = parseTencentKlineWeeklyQuote(content, symbol, market, code, weekEnd, previousWeekEnd, nowIsoString());
            if (quote == null && "us".equals(market)) {
                String fullSymbol = parseTencentKlineFullSymbol(content, symbol);
                if (!fullSymbol.isEmpty() && !fullSymbol.equals(symbol)) {
                    content = requestKline(fullSymbol, startDate, weekEnd);
                    quote = parseTencentKlineWeeklyQuote(content, fullSymbol, market, code, weekEnd, previousWeekEnd, nowIsoString());
                }
            }
            if (quote == null) {
                Log.w(TAG, "Invalid weekly quote response: symbol=" + symbol);
            }
            return quote;
        } catch (Exception exception) {
            Log.w(TAG, "Weekly quote request failed: symbol=" + symbol, exception);
            return null;
        }
    }

    private String requestKline(String symbol, String startDate, String endDate) throws Exception {
        return request(
            "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=" + symbol + ",day," + startDate + "," + endDate + ",40,",
            StandardCharsets.UTF_8,
            "https://gu.qq.com/"
        );
    }

    private JSONObject fetchFundWeeklyQuote(
        String code,
        String name,
        String source,
        String startDate,
        String weekEnd,
        String previousWeekEnd
    ) {
        try {
            String syncedAt = nowIsoString();
            JSONObject quote;
            if (SOURCE_SINA.equals(source)) {
                String content = request(
                    "https://stock.finance.sina.com.cn/fundInfo/api/openapi.php/CaihuiFundInfoService.getNav?symbol=" + code +
                        "&datefrom=" + startDate + "&dateto=" + weekEnd + "&page=1&num=40",
                    StandardCharsets.UTF_8,
                    "https://finance.sina.com.cn/"
                );
                quote = parseSinaFundWeeklyQuote(content, code, name, weekEnd, previousWeekEnd, syncedAt);
            } else {
                String content = request(
                    "https://api.fund.eastmoney.com/f10/lsjz?fundCode=" + code + "&pageIndex=1&pageSize=40&startDate=" + startDate + "&endDate=" + weekEnd,
                    StandardCharsets.UTF_8,
                    "https://fund.eastmoney.com/"
                );
                quote = parseEastmoneyFundWeeklyQuote(content, code, name, weekEnd, previousWeekEnd, syncedAt);
            }
            if (quote == null) {
                Log.w(TAG, "Invalid weekly fund response: source=" + source + ", code=" + code);
            }
            return quote;
        } catch (Exception exception) {
            Log.w(TAG, "Weekly fund request failed: source=" + source + ", code=" + code, exception);
            return null;
        }
    }

    private JSONObject fetchUsdCnyRateOn(String date) {
        try {
            String content = request(
                "https://api.frankfurter.dev/v2/rate/USD/CNY?date=" + date,
                StandardCharsets.UTF_8,
                null
            );
            JSONObject quote = parseUsdCnyRate(content, nowIsoString());
            if (quote != null) {
                safePut(quote, "source", "frankfurter");
            }
            return quote;
        } catch (Exception exception) {
            Log.w(TAG, "Weekly exchange rate request failed", exception);
            return null;
        }
    }

    private String shiftDate(String date, int days) {
        try {
            SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            formatter.setTimeZone(TimeZone.getTimeZone("UTC"));
            formatter.setLenient(false);
            Date parsed = formatter.parse(date);
            if (parsed == null) {
                return "";
            }
            return formatter.format(new Date(parsed.getTime() + days * 86400000L));
        } catch (Exception ignored) {
            return "";
        }
    }

    public JSONObject parseUsdCnyRate(String content, String syncedAt) {
        try {
            JSONObject payload = new JSONObject(content == null ? "" : content.trim());
            double rate = payload.optDouble("rate", 0d);
            String date = payload.optString("date", "");
            if (!"USD".equals(payload.optString("base")) || !"CNY".equals(payload.optString("quote")) || rate <= 0 || !date.matches("\\d{4}-\\d{2}-\\d{2}")) {
                return null;
            }
            JSONObject quote = new JSONObject();
            safePut(quote, "assetType", "index");
            safePut(quote, "code", "USDCNY");
            safePut(quote, "name", "美元兑人民币");
            safePut(quote, "price", rate);
            safePut(quote, "changePercent", 0d);
            safePut(quote, "quoteTime", date);
            safePut(quote, "source", firstNonEmpty(payload.optString("source"), "wallet-server"));
            safePut(quote, "syncedAt", firstNonEmpty(payload.optString("fetchedAt"), syncedAt));
            safePut(quote, "currency", "CNY");
            return quote;
        } catch (Exception ignored) {
            return null;
        }
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

    public JSONObject parseEastmoneyFundQuote(String content, String code, String name, String syncedAt) {
        try {
            JSONObject payload = new JSONObject(content == null ? "" : content.trim());
            if (payload.optInt("ErrCode", -1) != 0) {
                return null;
            }
            JSONObject data = payload.optJSONObject("Data");
            JSONArray rows = data == null ? null : data.optJSONArray("LSJZList");
            JSONObject latest = rows == null ? null : rows.optJSONObject(0);
            if (latest == null) {
                return null;
            }
            return confirmedFundQuote(
                code,
                name,
                parseDouble(latest.optString("DWJZ", "")),
                parseDouble(latest.optString("JZZZL", "0")),
                normalizeDate(latest.optString("FSRQ", "")),
                "eastmoney-f10",
                syncedAt
            );
        } catch (Exception ignored) {
            return null;
        }
    }

    public JSONObject parseSinaFundQuote(String content, String code, String name, String syncedAt) {
        try {
            JSONObject payload = new JSONObject(content == null ? "" : content.trim());
            JSONObject result = payload.optJSONObject("result");
            JSONObject status = result == null ? null : result.optJSONObject("status");
            JSONObject data = result == null ? null : result.optJSONObject("data");
            JSONArray rows = data == null ? null : data.optJSONArray("data");
            JSONObject latest = rows == null ? null : rows.optJSONObject(0);
            if (status == null || status.optInt("code", -1) != 0 || latest == null) {
                return null;
            }
            double price = parseDouble(latest.optString("jjjz", ""));
            JSONObject previous = rows.length() > 1 ? rows.optJSONObject(1) : null;
            double previousPrice = previous == null ? 0d : parseDouble(previous.optString("jjjz", ""));
            double changePercent = previousPrice > 0 ? (price - previousPrice) / previousPrice * 100d : 0d;
            String date = latest.optString("fbrq", "").split(" ")[0];
            return confirmedFundQuote(code, name, price, changePercent, normalizeDate(date), "sina-fund", syncedAt);
        } catch (Exception ignored) {
            return null;
        }
    }

    public JSONObject parseTencentFundQuote(String content, String expectedCode, String fallbackName, String syncedAt) {
        try {
            Matcher matcher = TENCENT_FUND_PATTERN.matcher(content == null ? "" : content.trim());
            if (!matcher.find()) {
                return null;
            }
            String[] fields = matcher.group(2).split("~", -1);
            if (fields.length < 9) {
                return null;
            }
            return confirmedFundQuote(
                firstNonEmpty(matcher.group(1), expectedCode),
                firstNonEmpty(fields[1], fallbackName),
                parseDouble(fields[5]),
                parseDouble(fields[7]),
                normalizeDate(fields[8]),
                "tencent-fund",
                syncedAt
            );
        } catch (Exception ignored) {
            return null;
        }
    }

    public JSONObject testFundQuoteSource(String source, String code, String name) {
        String normalizedSource = normalizeFundQuoteSource(source);
        JSONObject quote = fetchFundQuote(normalizeCode(code), name, normalizedSource);
        JSONObject result = new JSONObject();
        safePut(result, "source", normalizedSource);
        safePut(result, "ok", quote != null);
        safePut(result, "message", quote == null ? "不可用" : "可用");
        if (quote != null) {
            safePut(result, "quoteTime", quote.optString("quoteTime", ""));
        }
        return result;
    }

    public JSONArray parseStockQuotes(String content, String syncedAt) {
        JSONArray quotes = new JSONArray();
        Matcher matcher = STOCK_PATTERN.matcher(content == null ? "" : content);
        while (matcher.find()) {
            appendStockQuote(quotes, matcher.group(1), matcher.group(2), matcher.group(3), syncedAt);
        }
        Matcher usMatcher = US_STOCK_PATTERN.matcher(content == null ? "" : content);
        while (usMatcher.find()) {
            appendStockQuote(quotes, "us", normalizeUsCode(usMatcher.group(1)), usMatcher.group(2), syncedAt);
        }
        return quotes;
    }

    private void appendStockQuote(JSONArray quotes, String market, String code, String rawFields, String syncedAt) {
        String[] fields = rawFields.split("~", -1);
        if (fields.length < 33) {
            return;
        }
        double price = parseDouble(fields[3]);
        if (price <= 0) {
            return;
        }
        JSONObject quote = new JSONObject();
        boolean isIndex = ("sh".equals(market) && "000001".equals(code)) ||
            ("us".equals(market) && ("INX".equals(code) || "IXIC".equals(code) || "DJI".equals(code)));
        safePut(quote, "assetType", isIndex ? "index" : "stock");
        safePut(quote, "code", code);
        safePut(quote, "name", fields[1]);
        safePut(quote, "price", price);
        safePut(quote, "changePercent", parseDouble(fields[32]));
        safePut(quote, "quoteTime", formatTencentTime(fields[30]));
        safePut(quote, "source", isIndex ? "tencent-index-" + market : "tencent-" + market);
        safePut(quote, "syncedAt", syncedAt);
        safePut(quote, "currency", "us".equals(market) ? "USD" : "CNY");
        quotes.put(quote);
    }

    private JSONObject fetchFundQuote(String code, String name, String source) {
        try {
            String syncedAt = nowIsoString();
            JSONObject quote;
            if (SOURCE_SINA.equals(source)) {
                String content = request(
                    "https://stock.finance.sina.com.cn/fundInfo/api/openapi.php/CaihuiFundInfoService.getNav?symbol=" + code + "&page=1&num=2",
                    StandardCharsets.UTF_8,
                    "https://finance.sina.com.cn/"
                );
                quote = parseSinaFundQuote(content, code, name, syncedAt);
            } else if (SOURCE_TENCENT.equals(source)) {
                String content = request(
                    "https://qt.gtimg.cn/q=jj" + code,
                    Charset.forName("GBK"),
                    "https://finance.qq.com/"
                );
                quote = parseTencentFundQuote(content, code, name, syncedAt);
            } else if (SOURCE_LEGACY.equals(source)) {
                String content = request(
                    "https://fundgz.1234567.com.cn/js/" + code + ".js?rt=" + System.currentTimeMillis(),
                    StandardCharsets.UTF_8,
                    "https://fund.eastmoney.com/"
                );
                quote = parseFundQuote(content, syncedAt);
            } else {
                String content = request(
                    "https://api.fund.eastmoney.com/f10/lsjz?fundCode=" + code + "&pageIndex=1&pageSize=2",
                    StandardCharsets.UTF_8,
                    "https://fund.eastmoney.com/"
                );
                quote = parseEastmoneyFundQuote(content, code, name, syncedAt);
            }
            if (quote == null) {
                Log.w(TAG, "Invalid fund quote response: source=" + source + ", code=" + code);
            }
            return quote;
        } catch (Exception exception) {
            Log.w(TAG, "Fund quote request failed: source=" + source + ", code=" + code, exception);
            return null;
        }
    }

    private JSONArray fetchStockQuotes(String query) {
        try {
            String content = request("https://qt.gtimg.cn/q=" + query, Charset.forName("GBK"), "https://finance.qq.com/");
            return parseStockQuotes(content, nowIsoString());
        } catch (Exception ignored) {
            return new JSONArray();
        }
    }

    private JSONObject fetchUsdCnyRate() {
        try {
            String content = request(
                CloudSync.API + "/market/exchange-rate?base=USD&quote=CNY",
                StandardCharsets.UTF_8,
                null
            );
            return parseUsdCnyRate(content, nowIsoString());
        } catch (Exception exception) {
            Log.w(TAG, "Exchange rate request failed", exception);
            return null;
        }
    }

    private String request(String endpoint, Charset charset, String referer) throws Exception {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(endpoint).openConnection();
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(10000);
            connection.setRequestProperty("User-Agent", "SmartWallet/1.0");
            if (referer != null && !referer.isEmpty()) {
                connection.setRequestProperty("Referer", referer);
            }
            int statusCode = connection.getResponseCode();
            if (statusCode < 200 || statusCode >= 300) {
                throw new IllegalStateException("HTTP " + statusCode);
            }
            return read(connection.getInputStream(), charset);
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private JSONObject confirmedFundQuote(
        String code,
        String name,
        double price,
        double changePercent,
        String confirmedDate,
        String source,
        String syncedAt
    ) {
        String normalizedCode = normalizeCode(code);
        if (normalizedCode.isEmpty() || price <= 0 || confirmedDate.isEmpty()) {
            return null;
        }
        JSONObject quote = new JSONObject();
        safePut(quote, "assetType", "fund");
        safePut(quote, "code", normalizedCode);
        safePut(quote, "name", name == null ? "" : name);
        safePut(quote, "price", price);
        safePut(quote, "changePercent", changePercent);
        safePut(quote, "quoteTime", confirmedDate);
        safePut(quote, "source", source);
        safePut(quote, "syncedAt", syncedAt);
        safePut(quote, "priceSource", "confirmed");
        safePut(quote, "confirmedPrice", price);
        safePut(quote, "confirmedDate", confirmedDate);
        return quote;
    }

    private String normalizeFundQuoteSource(String source) {
        if (SOURCE_SINA.equals(source) || SOURCE_TENCENT.equals(source) || SOURCE_LEGACY.equals(source)) {
            return source;
        }
        return SOURCE_EASTMONEY;
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

    private String normalizeUsCode(String code) {
        String normalized = code == null ? "" : code.trim().toUpperCase(Locale.US);
        normalized = normalized.replaceFirst("^(NASDAQ|NYSE|AMEX|US)\\s*:", "");
        normalized = normalized.replace('-', '.').replace('/', '.').replaceAll("[^A-Z0-9.]", "");
        normalized = normalized.replaceAll("\\.{2,}", ".").replaceAll("^\\.+|\\.+$", "");
        return normalized.length() > 12 ? normalized.substring(0, 12) : normalized;
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
