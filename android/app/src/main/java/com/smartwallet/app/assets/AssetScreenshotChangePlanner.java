package com.smartwallet.app.assets;

import java.util.ArrayList;
import java.util.List;

/**
 * 纯逻辑：对比现有持仓与截图识别出的持仓，判定建仓/加仓/减仓/改成本。
 * 与 services/assetEngine.ts 的 planAssetScreenshotChanges 保持一致，可脱离 Android 单元测试。
 */
public final class AssetScreenshotChangePlanner {

    public static final String TYPE_CREATE = "create";
    public static final String TYPE_BUY = "buy";
    public static final String TYPE_SELL = "sell";
    public static final String TYPE_COST = "cost";
    public static final String TYPE_UNCHANGED = "unchanged";

    private static final double SHARE_EPSILON = 1e-4;

    private AssetScreenshotChangePlanner() {}

    public static final class Holding {
        public final String id;
        public final String assetType;
        public final String code;
        public final String market;
        public final String name;
        public final String currency;
        public final double shares;
        public final double costAmount;

        public Holding(String id, String assetType, String code, String market, String name, String currency, double shares, double costAmount) {
            this.id = id;
            this.assetType = assetType;
            this.code = code;
            this.market = market;
            this.name = name;
            this.currency = currency;
            this.shares = shares;
            this.costAmount = costAmount;
        }
    }

    public static final class Candidate {
        public final String assetType;
        public final String code;
        public final String market;
        public final String name;
        public final String currency;
        public final double shares;
        public final double costAmount;

        public Candidate(String assetType, String code, String market, String name, String currency, double shares, double costAmount) {
            this.assetType = assetType;
            this.code = code;
            this.market = market;
            this.name = name;
            this.currency = currency;
            this.shares = shares;
            this.costAmount = costAmount;
        }
    }

    public static final class Change {
        public final String type;
        public final Candidate candidate;
        public final String holdingId;
        public final String name;
        public final double deltaShares;
        public final double tradeAmount;
        public final double price;
        public final double nextShares;
        public final double nextCost;

        Change(String type, Candidate candidate, String holdingId, String name, double deltaShares, double tradeAmount, double price, double nextShares, double nextCost) {
            this.type = type;
            this.candidate = candidate;
            this.holdingId = holdingId;
            this.name = name;
            this.deltaShares = deltaShares;
            this.tradeAmount = tradeAmount;
            this.price = price;
            this.nextShares = nextShares;
            this.nextCost = nextCost;
        }
    }

    public static List<Change> plan(List<Holding> holdings, List<Candidate> candidates) {
        List<Change> changes = new ArrayList<>();
        if (candidates == null) {
            return changes;
        }
        for (Candidate candidate : candidates) {
            if (candidate == null) {
                continue;
            }
            Holding holding = findMatch(holdings, candidate);
            double newShares = normalizeAmount(candidate.shares);
            double newCost = normalizeAmount(candidate.costAmount);
            if (holding == null) {
                if (newShares > 0d) {
                    changes.add(new Change(
                        TYPE_CREATE,
                        candidate,
                        null,
                        candidate.name,
                        newShares,
                        newCost,
                        newCost / newShares,
                        newShares,
                        newCost
                    ));
                }
                continue;
            }
            double delta = newShares - holding.shares;
            String name = candidate.name == null || candidate.name.isEmpty() ? holding.name : candidate.name;
            double avgCost = holding.shares > 0d ? holding.costAmount / holding.shares : 0d;
            if (Math.abs(delta) <= SHARE_EPSILON) {
                if (newCost > 0d && Math.abs(newCost - holding.costAmount) > 0.01d) {
                    changes.add(new Change(TYPE_COST, candidate, holding.id, name, 0d, 0d, 0d, holding.shares, newCost));
                } else {
                    changes.add(new Change(TYPE_UNCHANGED, candidate, holding.id, name, 0d, 0d, 0d, holding.shares, holding.costAmount));
                }
                continue;
            }
            if (delta > 0d) {
                double addedShares = delta;
                double costChange = newCost - holding.costAmount;
                double price = costChange > 0d ? costChange / addedShares : avgCost;
                double tradeAmount = price * addedShares;
                changes.add(new Change(TYPE_BUY, candidate, holding.id, name, addedShares, tradeAmount, price, newShares, newCost));
            } else {
                double soldShares = -delta;
                double costChange = holding.costAmount - newCost;
                double price = costChange > 0d ? costChange / soldShares : avgCost;
                double tradeAmount = price * soldShares;
                changes.add(new Change(TYPE_SELL, candidate, holding.id, name, -soldShares, tradeAmount, price, newShares, Math.max(0d, newCost)));
            }
        }
        return changes;
    }

    /** 生成产品化的应用结果文案（简短、状态化）。 */
    public static String summarize(List<Change> changes) {
        int created = 0;
        int bought = 0;
        int sold = 0;
        int adjusted = 0;
        if (changes != null) {
            for (Change change : changes) {
                if (change == null) {
                    continue;
                }
                switch (change.type) {
                    case TYPE_CREATE:
                        created++;
                        break;
                    case TYPE_BUY:
                        bought++;
                        break;
                    case TYPE_SELL:
                        sold++;
                        break;
                    case TYPE_COST:
                        adjusted++;
                        break;
                    default:
                        break;
                }
            }
        }
        List<String> parts = new ArrayList<>();
        if (created > 0) {
            parts.add("新建 " + created + " 项");
        }
        if (bought > 0) {
            parts.add("加仓 " + bought + " 项");
        }
        if (sold > 0) {
            parts.add("减仓 " + sold + " 项");
        }
        if (adjusted > 0) {
            parts.add("更新成本 " + adjusted + " 项");
        }
        StringBuilder builder = new StringBuilder();
        for (int index = 0; index < parts.size(); index++) {
            if (index > 0) {
                builder.append('\u3000');
            }
            builder.append(parts.get(index));
        }
        return builder.toString();
    }

    public static double normalizeAmount(double value) {
        if (Double.isNaN(value) || Double.isInfinite(value) || value < 0d) {
            return 0d;
        }
        return value;
    }

    private static Holding findMatch(List<Holding> holdings, Candidate candidate) {
        if (holdings == null) {
            return null;
        }
        for (Holding holding : holdings) {
            if (holding == null) {
                continue;
            }
            if (
                equalsSafe(holding.assetType, candidate.assetType) &&
                equalsSafe(holding.code, candidate.code) &&
                equalsSafe(holding.market, candidate.market)
            ) {
                return holding;
            }
        }
        return null;
    }

    private static boolean equalsSafe(String left, String right) {
        return (left == null ? "" : left).equals(right == null ? "" : right);
    }
}
