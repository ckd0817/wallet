package com.smartwallet.app.assets;

import static org.junit.Assert.assertEquals;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class AssetScreenshotAnalysisClientTest {

    @Test
    public void normalizesUnitCostToTotalCost() throws Exception {
        JSONArray normalized = new AssetScreenshotAnalysisClient().normalizeHoldings(
            new JSONArray()
                .put(
                    new JSONObject()
                        .put("assetType", "fund")
                        .put("code", "018043")
                        .put("market", "fund")
                        .put("name", "天弘纳斯达克100指数(QDII)A")
                        .put("shares", 4947.35d)
                        .put("unitCost", 1.8301d)
                )
        );

        JSONObject holding = normalized.optJSONObject(0);
        assertEquals(9054.145235d, holding.optDouble("costAmount"), 0.0001d);
        assertEquals("unit_cost", holding.optString("costSource"));
    }

    @Test
    public void prefersExplicitTotalCost() throws Exception {
        JSONArray normalized = new AssetScreenshotAnalysisClient().normalizeHoldings(
            new JSONArray()
                .put(
                    new JSONObject()
                        .put("assetType", "fund")
                        .put("code", "016452")
                        .put("market", "fund")
                        .put("name", "南方纳斯达克100指数发起（QDII）A")
                        .put("shares", 1118.73d)
                        .put("unitCost", 2.1085d)
                        .put("totalCost", 2500d)
                )
        );

        JSONObject holding = normalized.optJSONObject(0);
        assertEquals(2500d, holding.optDouble("costAmount"), 0.0001d);
        assertEquals("total_cost", holding.optString("costSource"));
    }

    @Test
    public void derivesCostFromMarketValueAndProfit() throws Exception {
        JSONArray normalized = new AssetScreenshotAnalysisClient().normalizeHoldings(
            new JSONArray()
                .put(
                    new JSONObject()
                        .put("assetType", "fund")
                        .put("code", "018043")
                        .put("shares", 4947.35d)
                        .put("marketValue", 10168.78d)
                        .put("holdingProfit", 1114.68d)
                )
        );

        JSONObject holding = normalized.optJSONObject(0);
        assertEquals(9054.10d, holding.optDouble("costAmount"), 0.0001d);
        assertEquals("market_minus_profit", holding.optString("costSource"));
    }

    @Test
    public void derivesCostFromMarketValueAndProfitRate() throws Exception {
        JSONArray normalized = new AssetScreenshotAnalysisClient().normalizeHoldings(
            new JSONArray()
                .put(
                    new JSONObject()
                        .put("assetType", "fund")
                        .put("code", "016452")
                        .put("shares", 1118.73d)
                        .put("marketValue", 2739.19d)
                        .put("profitRate", 9.76d)
                )
        );

        JSONObject holding = normalized.optJSONObject(0);
        assertEquals(2495.62d, holding.optDouble("costAmount"), 0.01d);
        assertEquals("market_by_rate", holding.optString("costSource"));
    }

    @Test
    public void marksMissingCost() throws Exception {
        JSONArray normalized = new AssetScreenshotAnalysisClient().normalizeHoldings(
            new JSONArray()
                .put(
                    new JSONObject()
                        .put("assetType", "fund")
                        .put("code", "016452")
                        .put("shares", 1118.73d)
                )
        );

        JSONObject holding = normalized.optJSONObject(0);
        assertEquals(0d, holding.optDouble("costAmount"), 0.0001d);
        assertEquals("missing", holding.optString("costSource"));
    }

    @Test
    public void normalizesUsTickerAndCurrency() throws Exception {
        JSONArray normalized = new AssetScreenshotAnalysisClient().normalizeHoldings(
            new JSONArray()
                .put(
                    new JSONObject()
                        .put("assetType", "stock")
                        .put("code", "brk-b")
                        .put("market", "us")
                        .put("name", "伯克希尔")
                        .put("shares", 2d)
                        .put("totalCost", 900d)
                )
        );

        JSONObject holding = normalized.optJSONObject(0);
        assertEquals("BRK.B", holding.optString("code"));
        assertEquals("us", holding.optString("market"));
        assertEquals("USD", holding.optString("currency"));
        assertEquals(900d, holding.optDouble("costAmount"), 0.0001d);
    }
}
