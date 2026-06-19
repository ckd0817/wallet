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
    }

    @Test
    public void parsesTencentStockQuoteText() {
        AssetQuoteClient client = new AssetQuoteClient();
        JSONArray quotes = client.parseStockQuotes(
            "v_sh600000=\"1~浦发银行~600000~9.09~9.24~9.20~836564~399211~437353~9.08~4661~9.07~5576~9.06~6301~9.05~10340~9.04~1074~9.09~7087~9.10~1052~9.11~2108~9.12~1537~9.13~3112~~20260618161420~-0.15~-1.62~\";",
            "2026-06-18T08:00:00.000Z"
        );

        JSONObject quote = quotes.optJSONObject(0);
        assertEquals("stock", quote.optString("assetType"));
        assertEquals("600000", quote.optString("code"));
        assertEquals("浦发银行", quote.optString("name"));
        assertEquals(9.09d, quote.optDouble("price"), 0.0001d);
        assertEquals(-1.62d, quote.optDouble("changePercent"), 0.0001d);
    }

    @Test
    public void ignoresInvalidFundQuote() {
        AssetQuoteClient client = new AssetQuoteClient();
        assertTrue(client.parseFundQuote("bad response", "2026-06-18T08:00:00.000Z") == null);
    }
}
