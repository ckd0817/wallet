package com.smartwallet.app.assets;

import static org.junit.Assert.assertEquals;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

public class AssetScreenshotChangePlannerTest {

    private AssetScreenshotChangePlanner.Candidate candidate(String code, double shares, double cost) {
        return new AssetScreenshotChangePlanner.Candidate("fund", code, "fund", "测试基金", "CNY", shares, cost);
    }

    private AssetScreenshotChangePlanner.Holding holding(String id, String code, double shares, double cost) {
        return new AssetScreenshotChangePlanner.Holding(id, "fund", code, "fund", "测试基金", "CNY", shares, cost);
    }

    @Test
    public void createsWhenNoMatch() {
        List<AssetScreenshotChangePlanner.Change> changes = AssetScreenshotChangePlanner.plan(
            new ArrayList<>(),
            Collections.singletonList(candidate("018043", 100d, 200d))
        );
        assertEquals(1, changes.size());
        AssetScreenshotChangePlanner.Change change = changes.get(0);
        assertEquals(AssetScreenshotChangePlanner.TYPE_CREATE, change.type);
        assertEquals(100d, change.nextShares, 0.0001d);
        assertEquals(200d, change.nextCost, 0.0001d);
        assertEquals(2d, change.price, 0.0001d);
    }

    @Test
    public void buysByCostDifference() {
        // 原 100 份、成本 200；新 150 份、成本 320 → 加仓 50 份，成本差 120，价 2.4
        List<AssetScreenshotChangePlanner.Change> changes = AssetScreenshotChangePlanner.plan(
            Collections.singletonList(holding("h1", "018043", 100d, 200d)),
            Collections.singletonList(candidate("018043", 150d, 320d))
        );
        AssetScreenshotChangePlanner.Change change = changes.get(0);
        assertEquals(AssetScreenshotChangePlanner.TYPE_BUY, change.type);
        assertEquals(50d, change.deltaShares, 0.0001d);
        assertEquals(2.4d, change.price, 0.0001d);
        assertEquals(120d, change.tradeAmount, 0.0001d);
        assertEquals(150d, change.nextShares, 0.0001d);
        assertEquals(320d, change.nextCost, 0.0001d);
    }

    @Test
    public void sellsByCostDifference() {
        // 原 100 份、成本 200；新 60 份、成本 120 → 减仓 40 份，成本差 80，价 2.0
        List<AssetScreenshotChangePlanner.Change> changes = AssetScreenshotChangePlanner.plan(
            Collections.singletonList(holding("h1", "018043", 100d, 200d)),
            Collections.singletonList(candidate("018043", 60d, 120d))
        );
        AssetScreenshotChangePlanner.Change change = changes.get(0);
        assertEquals(AssetScreenshotChangePlanner.TYPE_SELL, change.type);
        assertEquals(-40d, change.deltaShares, 0.0001d);
        assertEquals(2.0d, change.price, 0.0001d);
        assertEquals(80d, change.tradeAmount, 0.0001d);
        assertEquals(60d, change.nextShares, 0.0001d);
        assertEquals(120d, change.nextCost, 0.0001d);
    }

    @Test
    public void adjustsCostWhenSharesUnchanged() {
        List<AssetScreenshotChangePlanner.Change> changes = AssetScreenshotChangePlanner.plan(
            Collections.singletonList(holding("h1", "018043", 100d, 200d)),
            Collections.singletonList(candidate("018043", 100d, 260d))
        );
        AssetScreenshotChangePlanner.Change change = changes.get(0);
        assertEquals(AssetScreenshotChangePlanner.TYPE_COST, change.type);
        assertEquals(260d, change.nextCost, 0.0001d);
    }

    @Test
    public void unchangedWhenNothingMoves() {
        List<AssetScreenshotChangePlanner.Change> changes = AssetScreenshotChangePlanner.plan(
            Collections.singletonList(holding("h1", "018043", 100d, 200d)),
            Collections.singletonList(candidate("018043", 100d, 200d))
        );
        assertEquals(AssetScreenshotChangePlanner.TYPE_UNCHANGED, changes.get(0).type);
    }

    @Test
    public void fallsBackToAverageCostWhenCostMissing() {
        // 新成本为 0（截图未给成本），加仓应回退用平均成本 2.0
        List<AssetScreenshotChangePlanner.Change> changes = AssetScreenshotChangePlanner.plan(
            Collections.singletonList(holding("h1", "018043", 100d, 200d)),
            Collections.singletonList(candidate("018043", 150d, 0d))
        );
        AssetScreenshotChangePlanner.Change change = changes.get(0);
        assertEquals(AssetScreenshotChangePlanner.TYPE_BUY, change.type);
        assertEquals(2.0d, change.price, 0.0001d);
    }

    @Test
    public void summarizesCountsWithFullWidthSpace() {
        List<AssetScreenshotChangePlanner.Change> changes = Arrays.asList(
            AssetScreenshotChangePlanner.plan(new ArrayList<>(), Collections.singletonList(candidate("A", 10d, 10d))).get(0),
            AssetScreenshotChangePlanner.plan(
                Collections.singletonList(holding("h", "B", 10d, 10d)),
                Collections.singletonList(candidate("B", 20d, 30d))
            ).get(0)
        );
        assertEquals("新建 1 项\u3000加仓 1 项", AssetScreenshotChangePlanner.summarize(changes));
    }
}
