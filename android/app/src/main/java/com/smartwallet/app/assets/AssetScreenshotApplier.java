package com.smartwallet.app.assets;

import com.smartwallet.app.data.WalletRepository;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * 把截图识别出的持仓对比现有账本并自动落库：建仓/加仓/减仓/改成本，
 * 一次性写入持仓更新与交易记录。返回产品化结果文案与应用条数。
 */
public class AssetScreenshotApplier {

    public static final class Result {
        public final String summary;
        public final int appliedCount;

        Result(String summary, int appliedCount) {
            this.summary = summary;
            this.appliedCount = appliedCount;
        }
    }

    private final WalletRepository repository;

    public AssetScreenshotApplier(WalletRepository repository) {
        this.repository = repository;
    }

    public Result apply(JSONArray normalizedHoldings) {
        List<AssetScreenshotChangePlanner.Holding> holdings = readHoldings(repository.getAssetHoldings());
        List<AssetScreenshotChangePlanner.Candidate> candidates = readCandidates(normalizedHoldings);
        List<AssetScreenshotChangePlanner.Change> changes = AssetScreenshotChangePlanner.plan(holdings, candidates);

        JSONArray holdingUpserts = new JSONArray();
        JSONArray tradeRecordInserts = new JSONArray();
        List<AssetScreenshotChangePlanner.Change> appliedChanges = new ArrayList<>();

        for (AssetScreenshotChangePlanner.Change change : changes) {
            if (change == null || AssetScreenshotChangePlanner.TYPE_UNCHANGED.equals(change.type)) {
                continue;
            }
            if (AssetScreenshotChangePlanner.TYPE_CREATE.equals(change.type)) {
                String holdingId = java.util.UUID.randomUUID().toString();
                holdingUpserts.put(buildHolding(holdingId, change));
                tradeRecordInserts.put(buildTradeRecord(holdingId, change, AssetScreenshotChangePlanner.TYPE_BUY));
                appliedChanges.add(change);
            } else if (AssetScreenshotChangePlanner.TYPE_BUY.equals(change.type) || AssetScreenshotChangePlanner.TYPE_SELL.equals(change.type)) {
                holdingUpserts.put(buildHolding(change.holdingId, change));
                tradeRecordInserts.put(buildTradeRecord(change.holdingId, change, change.type));
                appliedChanges.add(change);
            } else if (AssetScreenshotChangePlanner.TYPE_COST.equals(change.type)) {
                holdingUpserts.put(buildHolding(change.holdingId, change));
                appliedChanges.add(change);
            }
        }

        if (appliedChanges.isEmpty()) {
            return new Result("", 0);
        }

        repository.applyAssetChanges(holdingUpserts, tradeRecordInserts);
        return new Result(AssetScreenshotChangePlanner.summarize(appliedChanges), appliedChanges.size());
    }

    private JSONObject buildHolding(String id, AssetScreenshotChangePlanner.Change change) {
        AssetScreenshotChangePlanner.Candidate candidate = change.candidate;
        JSONObject holding = new JSONObject();
        safePut(holding, "id", id == null ? "" : id);
        safePut(holding, "assetType", candidate.assetType);
        safePut(holding, "code", candidate.code);
        safePut(holding, "market", candidate.market);
        safePut(holding, "currency", candidate.currency);
        safePut(holding, "name", change.name);
        safePut(holding, "shares", change.nextShares);
        safePut(holding, "costAmount", change.nextCost);
        return holding;
    }

    private JSONObject buildTradeRecord(String holdingId, AssetScreenshotChangePlanner.Change change, String tradeType) {
        AssetScreenshotChangePlanner.Candidate candidate = change.candidate;
        JSONObject record = new JSONObject();
        safePut(record, "holdingId", holdingId == null ? "" : holdingId);
        safePut(record, "assetType", candidate.assetType);
        safePut(record, "code", candidate.code);
        safePut(record, "name", change.name);
        safePut(record, "currency", candidate.currency);
        safePut(record, "tradeType", tradeType);
        safePut(record, "source", "manual");
        safePut(record, "status", "completed");
        safePut(record, "inputMode", "shares");
        safePut(record, "shares", Math.abs(change.deltaShares));
        safePut(record, "amount", change.tradeAmount);
        safePut(record, "price", change.price);
        safePut(record, "priceSource", "estimated");
        return record;
    }

    private List<AssetScreenshotChangePlanner.Holding> readHoldings(JSONArray array) {
        List<AssetScreenshotChangePlanner.Holding> holdings = new ArrayList<>();
        if (array == null) {
            return holdings;
        }
        for (int index = 0; index < array.length(); index++) {
            JSONObject raw = array.optJSONObject(index);
            if (raw == null) {
                continue;
            }
            holdings.add(new AssetScreenshotChangePlanner.Holding(
                raw.optString("id", ""),
                raw.optString("assetType", ""),
                raw.optString("code", ""),
                raw.optString("market", ""),
                raw.optString("name", ""),
                raw.optString("currency", ""),
                raw.optDouble("shares", 0d),
                raw.optDouble("costAmount", 0d)
            ));
        }
        return holdings;
    }

    private List<AssetScreenshotChangePlanner.Candidate> readCandidates(JSONArray array) {
        List<AssetScreenshotChangePlanner.Candidate> candidates = new ArrayList<>();
        if (array == null) {
            return candidates;
        }
        for (int index = 0; index < array.length(); index++) {
            JSONObject raw = array.optJSONObject(index);
            if (raw == null) {
                continue;
            }
            candidates.add(new AssetScreenshotChangePlanner.Candidate(
                raw.optString("assetType", ""),
                raw.optString("code", ""),
                raw.optString("market", ""),
                raw.optString("name", ""),
                raw.optString("currency", ""),
                raw.optDouble("shares", 0d),
                raw.optDouble("costAmount", 0d)
            ));
        }
        return candidates;
    }

    private void safePut(JSONObject object, String key, Object value) {
        try {
            object.put(key, value);
        } catch (JSONException ignored) {}
    }
}
