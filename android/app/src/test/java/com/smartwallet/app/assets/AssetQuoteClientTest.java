package com.smartwallet.app.assets;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class AssetQuoteClientTest {

    @Test
    public void parsesFundQuoteJsonp() {
        AssetQuoteClient client = new AssetQuoteClient();
        JSONObject quote = client.parseFundQuote(
            "jsonpgz({\"fundcode\":\"000001\",\"name\":\"华夏成长混合\",\"jzrq\":\"2026-06-17\",\"dwjz\":\"1.4070\",\"gsz\":\"1.4461\",\"gszzl\":\"2.78\",\"gztime\":\"2026-06-18 15:00\"});",
            "2026-06-18T08:00:00.000Z"
        );

        assertEquals("fund", quote.optString("assetType"));
        assertEquals("000001", quote.optString("code"));
        assertEquals("华夏成长混合", quote.optString("name"));
        assertEquals(1.4461d, quote.optDouble("price"), 0.0001d);
        assertEquals(2.78d, quote.optDouble("changePercent"), 0.0001d);
        assertEquals("estimated", quote.optString("priceSource"));
        assertEquals(1.4461d, quote.optDouble("estimatedPrice"), 0.0001d);
        assertEquals(1.4070d, quote.optDouble("confirmedPrice"), 0.0001d);
        assertEquals("2026-06-17", quote.optString("confirmedDate"));
    }

    @Test
    public void parsesTencentStockQuoteText() {
        AssetQuoteClient client = new AssetQuoteClient();
        JSONArray quotes = client.parseStockQuotes(
            "v_sh600000=\"1~浦发银行~600000~9.09~9.24~9.20~836564~399211~437353~9.08~4661~9.07~5576~9.06~6301~9.05~10340~9.04~1074~9.09~7087~9.10~1052~9.11~2108~9.12~1537~9.13~3112~~20260618161420~-0.15~-1.62~\";" +
            "v_sh000001=\"1~上证指数~000001~3000.00~2990.00~2995.00~836564~399211~437353~2999.00~4661~2998.00~5576~2997.00~6301~2996.00~10340~2995.00~1074~3000.00~7087~3001.00~1052~3002.00~2108~3003.00~1537~3004.00~3112~~20260618161420~10.00~0.33~\";",
            "2026-06-18T08:00:00.000Z"
        );

        JSONObject quote = quotes.optJSONObject(0);
        assertEquals("stock", quote.optString("assetType"));
        assertEquals("600000", quote.optString("code"));
        assertEquals("浦发银行", quote.optString("name"));
        assertEquals(9.09d, quote.optDouble("price"), 0.0001d);
        assertEquals(-1.62d, quote.optDouble("changePercent"), 0.0001d);

        JSONObject indexQuote = quotes.optJSONObject(1);
        assertEquals("index", indexQuote.optString("assetType"));
        assertEquals("000001", indexQuote.optString("code"));
        assertEquals("上证指数", indexQuote.optString("name"));
        assertEquals(0.33d, indexQuote.optDouble("changePercent"), 0.0001d);
    }

    @Test
    public void parsesEastmoneyConfirmedFundQuote() {
        AssetQuoteClient client = new AssetQuoteClient();
        JSONObject quote = client.parseEastmoneyFundQuote(
            "{\"Data\":{\"LSJZList\":[{\"FSRQ\":\"2026-07-31\",\"DWJZ\":\"1.3115\",\"JZZZL\":\"0.05\"}]},\"ErrCode\":0}",
            "004388",
            "鹏华丰享债券",
            "2026-08-01T08:00:00.000Z"
        );

        assertEquals(1.3115d, quote.optDouble("price"), 0.0001d);
        assertEquals("2026-07-31", quote.optString("confirmedDate"));
        assertEquals("confirmed", quote.optString("priceSource"));
        assertEquals("eastmoney-f10", quote.optString("source"));
    }

    @Test
    public void parsesSinaConfirmedFundQuote() {
        AssetQuoteClient client = new AssetQuoteClient();
        JSONObject quote = client.parseSinaFundQuote(
            "{\"result\":{\"status\":{\"code\":0},\"data\":{\"data\":[{\"fbrq\":\"2026-07-31 00:00:00\",\"jjjz\":\"1.3115\"},{\"fbrq\":\"2026-07-30 00:00:00\",\"jjjz\":\"1.3109\"}]}}}",
            "004388",
            "鹏华丰享债券",
            "2026-08-01T08:00:00.000Z"
        );

        assertEquals(1.3115d, quote.optDouble("price"), 0.0001d);
        assertEquals("2026-07-31", quote.optString("confirmedDate"));
        assertEquals("sina-fund", quote.optString("source"));
    }

    @Test
    public void parsesTencentConfirmedFundQuote() {
        AssetQuoteClient client = new AssetQuoteClient();
        JSONObject quote = client.parseTencentFundQuote(
            "v_jj004388=\"004388~鹏华丰享债券~0.0000~0.0000~~1.3115~1.4725~0.0458~2026-07-31~\";",
            "004388",
            "",
            "2026-08-01T08:00:00.000Z"
        );

        assertEquals("鹏华丰享债券", quote.optString("name"));
        assertEquals(1.3115d, quote.optDouble("price"), 0.0001d);
        assertEquals(0.0458d, quote.optDouble("changePercent"), 0.0001d);
        assertEquals("tencent-fund", quote.optString("source"));
    }

    @Test
    public void ignoresInvalidFundQuote() {
        AssetQuoteClient client = new AssetQuoteClient();
        assertTrue(client.parseFundQuote("bad response", "2026-06-18T08:00:00.000Z") == null);
    }
}
