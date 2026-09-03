package com.smartwallet.app.data;

import android.content.Context;
import android.net.Uri;
import com.smartwallet.app.screencapture.CaptureLogStore;
import java.io.File;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public class WalletRepository {

    private static final int MAX_CAPTURE_LOGS = 50;
    private static final java.util.Map<String, WalletRepository> instances = new java.util.HashMap<>();
    private final WalletDatabase database;
    private final String accountId;

    private final File appFilesDir;
    private final Object lock = new Object();
    private final SimpleDateFormat isoFormatter;

    private WalletRepository(Context context, String accountId) {
        this.database = WalletDatabase.get(context);
        this.accountId = accountId;
        this.appFilesDir = context.getFilesDir();
        this.isoFormatter = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        this.isoFormatter.setTimeZone(TimeZone.getTimeZone("UTC"));
    }

    public static synchronized WalletRepository getInstance(Context context) {
        String account = WalletDatabase.get(context).activeAccount();
        return forAccount(context, account);
    }

    public static synchronized WalletRepository forAccount(Context context, String account) {
        if (!instances.containsKey(account)) instances.put(account, new WalletRepository(context.getApplicationContext(), account));
        return instances.get(account);
    }

    public boolean isActive() { return accountId.equals(database.activeAccount()); }

    public JSONObject saveSnapshot(JSONObject snapshot, String mode) {
        synchronized (lock) { return database.save(accountId, snapshot, mode); }
    }

    public JSONObject loadSnapshot() {
        synchronized (lock) {
            return cloneObject(readStoreLocked());
        }
    }

    public JSONObject saveSnapshot(JSONObject snapshot) {
        synchronized (lock) {
            return database.save(accountId, snapshot, "mutate");
        }
    }

    public JSONObject upsertTransaction(JSONObject transaction) {
        synchronized (lock) {
            JSONObject store = readStoreLocked();
            JSONArray transactions = store.optJSONArray("transactions");
            safePut(store, "transactions", upsertById(transactions, normalizeTransaction(transaction), true));
            writeStoreLocked(store);
            return cloneObject(store);
        }
    }

    public JSONObject deleteTransaction(String id) {
        synchronized (lock) {
            JSONObject store = readStoreLocked();
            safePut(store, "transactions", removeById(store.optJSONArray("transactions"), id));
            writeStoreLocked(store, true);
            return cloneObject(store);
        }
    }

    public JSONObject replaceTransactions(JSONArray transactions) {
        synchronized (lock) {
            JSONObject store = readStoreLocked();
            safePut(store, "transactions", cloneArray(transactions));
            writeStoreLocked(store, true);
            return cloneObject(store);
        }
    }

    public JSONObject upsertCategory(JSONObject category) {
        synchronized (lock) {
            JSONObject store = readStoreLocked();
            safePut(store, "categories", upsertById(store.optJSONArray("categories"), category, false));
            writeStoreLocked(store);
            return cloneObject(store);
        }
    }

    public JSONObject upsertRecurringProfile(JSONObject profile) {
        synchronized (lock) {
            JSONObject store = readStoreLocked();
            safePut(store, "recurringProfiles", upsertById(store.optJSONArray("recurringProfiles"), profile, false));
            writeStoreLocked(store);
            return cloneObject(store);
        }
    }

    public JSONObject deleteRecurringProfile(String id) {
        synchronized (lock) {
            JSONObject store = readStoreLocked();
            safePut(store, "recurringProfiles", removeById(store.optJSONArray("recurringProfiles"), id));
            writeStoreLocked(store, true);
            return cloneObject(store);
        }
    }

    public JSONObject saveLlmConfig(JSONObject llmConfig) {
        synchronized (lock) {
            JSONObject store = readStoreLocked();
            JSONObject container = new JSONObject();
            safePut(container, "llmConfig", llmConfig);
            safePut(store, "llmConfig", WalletDefaults.ensureDefaults(container).optJSONObject("llmConfig"));
            writeStoreLocked(store);
            return cloneObject(store);
        }
    }

    public JSONObject upsertAssetHolding(JSONObject assetHolding) {
        synchronized (lock) {
            JSONObject store = readStoreLocked();
            safePut(store, "assetHoldings", upsertById(store.optJSONArray("assetHoldings"), normalizeAssetHolding(assetHolding), true));
            writeStoreLocked(store);
            return cloneObject(store);
        }
    }

    public JSONObject deleteAssetHolding(String id) {
        synchronized (lock) {
            JSONObject store = readStoreLocked();
            JSONObject deleted = findById(store.optJSONArray("assetHoldings"), id);
            safePut(store, "assetHoldings", removeById(store.optJSONArray("assetHoldings"), id));
            if (deleted != null) {
                safePut(
                    store,
                    "assetQuoteCache",
                    removeAssetQuote(store.optJSONArray("assetQuoteCache"), deleted.optString("assetType", ""), deleted.optString("code", ""))
                );
                safePut(store, "assetRecurringPlans", removeAssetRecurringPlansByHoldingId(store.optJSONArray("assetRecurringPlans"), id));
            }
            writeStoreLocked(store, true);
            return cloneObject(store);
        }
    }

    public JSONObject replaceAssetQuoteCache(JSONArray assetQuotes) {
        synchronized (lock) {
            JSONObject store = readStoreLocked();
            safePut(store, "assetQuoteCache", cloneArray(assetQuotes));
            writeStoreLocked(store);
            return cloneObject(store);
        }
    }

    public JSONObject upsertAssetRecurringPlan(JSONObject assetRecurringPlan) {
        synchronized (lock) {
            JSONObject store = readStoreLocked();
            safePut(store, "assetRecurringPlans", upsertById(store.optJSONArray("assetRecurringPlans"), normalizeAssetRecurringPlan(assetRecurringPlan), true));
            writeStoreLocked(store);
            return cloneObject(store);
        }
    }

    public JSONObject deleteAssetRecurringPlan(String id) {
        synchronized (lock) {
            JSONObject store = readStoreLocked();
            safePut(store, "assetRecurringPlans", removeById(store.optJSONArray("assetRecurringPlans"), id));
            writeStoreLocked(store, true);
            return cloneObject(store);
        }
    }

    public JSONObject upsertCaptureLog(JSONObject captureLog) {
        synchronized (lock) {
            JSONObject store = readStoreLocked();
            safePut(store, "captureLogs", upsertById(store.optJSONArray("captureLogs"), normalizeCaptureLog(captureLog), true));
            applyCaptureLogRetention(store);
            writeStoreLocked(store);
            return cloneObject(store);
        }
    }

    public JSONObject saveAutoBookkeepingSettings(JSONObject updates) {
        synchronized (lock) {
            JSONObject store = readStoreLocked();
            JSONObject current = store.optJSONObject("autoBookkeepingSettings");
            JSONObject merged = cloneObject(current == null ? WalletDefaults.defaultAutoBookkeepingSettings() : current);
            JSONArray names = updates.names();
            if (names != null) {
                for (int index = 0; index < names.length(); index++) {
                    String key = names.optString(index, null);
                    if (key == null) {
                        continue;
                    }
                    safePut(merged, key, updates.opt(key));
                }
            }
            merged.remove("sessionActive");
            safePut(store, "autoBookkeepingSettings", merged);
            writeStoreLocked(store);
            return cloneObject(store);
        }
    }

    public JSONObject getLlmConfig() {
        synchronized (lock) {
            return cloneObject(readStoreLocked().optJSONObject("llmConfig"));
        }
    }

    public JSONArray getCategories() {
        synchronized (lock) {
            return cloneArray(readStoreLocked().optJSONArray("categories"));
        }
    }

    public JSONObject getAutoBookkeepingSettings() {
        synchronized (lock) {
            return cloneObject(readStoreLocked().optJSONObject("autoBookkeepingSettings"));
        }
    }

    public JSONArray getCaptureLogs() {
        synchronized (lock) {
            return cloneArray(readStoreLocked().optJSONArray("captureLogs"));
        }
    }

    public JSONArray getAssetHoldings() {
        synchronized (lock) {
            return cloneArray(readStoreLocked().optJSONArray("assetHoldings"));
        }
    }

    public JSONArray getAssetRecurringPlans() {
        synchronized (lock) {
            return cloneArray(readStoreLocked().optJSONArray("assetRecurringPlans"));
        }
    }

    public JSONObject getCaptureLogById(String id) {
        synchronized (lock) {
            JSONArray captureLogs = readStoreLocked().optJSONArray("captureLogs");
            if (captureLogs == null) {
                return new JSONObject();
            }

            for (int index = 0; index < captureLogs.length(); index++) {
                JSONObject captureLog = captureLogs.optJSONObject(index);
                if (captureLog != null && id.equals(captureLog.optString("id", ""))) {
                    return cloneObject(captureLog);
                }
            }

            return new JSONObject();
        }
    }

    private JSONObject normalizeTransaction(JSONObject transaction) {
        JSONObject normalized = cloneObject(transaction);
        String now = nowIsoString();
        try {
            if (!normalized.has("id") || normalized.optString("id").isEmpty()) {
                normalized.put("id", UUID.randomUUID().toString());
            }
            if (!normalized.has("createdAt")) {
                normalized.put("createdAt", now);
            }
            normalized.put("updatedAt", now);
        } catch (JSONException ignored) {}
        return normalized;
    }

    private JSONObject normalizeCaptureLog(JSONObject captureLog) {
        JSONObject normalized = cloneObject(captureLog);
        String now = nowIsoString();
        try {
            if (!normalized.has("id") || normalized.optString("id").isEmpty()) {
                normalized.put("id", UUID.randomUUID().toString());
            }
            if (!normalized.has("capturedAt") || normalized.optString("capturedAt").isEmpty()) {
                normalized.put("capturedAt", now);
            }
            if (!normalized.has("imagePath")) {
                normalized.put("imagePath", "");
            }
        } catch (JSONException ignored) {}
        return normalized;
    }

    private JSONObject normalizeAssetHolding(JSONObject assetHolding) {
        JSONObject normalized = cloneObject(assetHolding);
        String now = nowIsoString();
        try {
            if (!normalized.has("id") || normalized.optString("id").isEmpty()) {
                normalized.put("id", UUID.randomUUID().toString());
            }
            if (!normalized.has("createdAt")) {
                normalized.put("createdAt", now);
            }
            normalized.put("updatedAt", now);
        } catch (JSONException ignored) {}
        return normalized;
    }

    private JSONObject normalizeAssetRecurringPlan(JSONObject assetRecurringPlan) {
        JSONObject normalized = cloneObject(assetRecurringPlan);
        String now = nowIsoString();
        try {
            if (!normalized.has("id") || normalized.optString("id").isEmpty()) {
                normalized.put("id", UUID.randomUUID().toString());
            }
            if (!normalized.has("createdAt")) {
                normalized.put("createdAt", now);
            }
            normalized.put("updatedAt", now);
            if (!normalized.has("enabled")) {
                normalized.put("enabled", true);
            }
        } catch (JSONException ignored) {}
        return normalized;
    }

    private JSONArray upsertById(JSONArray existing, JSONObject object, boolean insertAtStart) {
        JSONArray source = cloneArray(existing);
        JSONArray updated = new JSONArray();
        String id = object.optString("id");
        boolean replaced = false;

        if (insertAtStart) {
            updated.put(object);
        }

        for (int index = 0; index < source.length(); index++) {
            JSONObject current = source.optJSONObject(index);
            if (current == null) {
                continue;
            }
            if (id.equals(current.optString("id"))) {
                if (!insertAtStart) {
                    updated.put(object);
                }
                replaced = true;
                continue;
            }
            updated.put(current);
        }

        if (!replaced && !insertAtStart) {
            updated.put(object);
        }

        return updated;
    }

    private JSONArray removeById(JSONArray existing, String id) {
        JSONArray source = cloneArray(existing);
        JSONArray updated = new JSONArray();
        for (int index = 0; index < source.length(); index++) {
            JSONObject current = source.optJSONObject(index);
            if (current == null || id.equals(current.optString("id"))) {
                continue;
            }
            updated.put(current);
        }
        return updated;
    }

    private JSONObject findById(JSONArray existing, String id) {
        JSONArray source = cloneArray(existing);
        for (int index = 0; index < source.length(); index++) {
            JSONObject current = source.optJSONObject(index);
            if (current != null && id.equals(current.optString("id"))) {
                return current;
            }
        }
        return null;
    }

    private JSONArray removeAssetQuote(JSONArray existing, String assetType, String code) {
        JSONArray source = cloneArray(existing);
        JSONArray updated = new JSONArray();
        for (int index = 0; index < source.length(); index++) {
            JSONObject current = source.optJSONObject(index);
            if (current == null) {
                continue;
            }
            if (assetType.equals(current.optString("assetType", "")) && code.equals(current.optString("code", ""))) {
                continue;
            }
            updated.put(current);
        }
        return updated;
    }

    private JSONArray removeAssetRecurringPlansByHoldingId(JSONArray existing, String holdingId) {
        JSONArray source = cloneArray(existing);
        JSONArray updated = new JSONArray();
        for (int index = 0; index < source.length(); index++) {
            JSONObject current = source.optJSONObject(index);
            if (current == null || holdingId.equals(current.optString("holdingId", ""))) {
                continue;
            }
            updated.put(current);
        }
        return updated;
    }

    private JSONObject readStoreLocked() {
        return database.load(accountId);
    }

    private void writeStoreLocked(JSONObject store) {
        writeStoreLocked(store, false);
    }

    private void writeStoreLocked(JSONObject store, boolean allowDeletes) {
        JSONObject saved = database.save(accountId, store, "mutate", allowDeletes);
        java.util.List<String> keys = new java.util.ArrayList<>();
        store.keys().forEachRemaining(keys::add);
        for (String key : keys) store.remove(key);
        saved.keys().forEachRemaining(key -> safePut(store, key, saved.opt(key)));
    }

    private JSONObject cloneObject(JSONObject object) {
        if (object == null) {
            return new JSONObject();
        }
        try {
            return new JSONObject(object.toString());
        } catch (JSONException ignored) {
            return new JSONObject();
        }
    }

    private JSONArray cloneArray(JSONArray array) {
        if (array == null) {
            return new JSONArray();
        }
        try {
            return new JSONArray(array.toString());
        } catch (JSONException ignored) {
            return new JSONArray();
        }
    }

    private String nowIsoString() {
        synchronized (isoFormatter) {
            return isoFormatter.format(new Date());
        }
    }

    private void applyCaptureLogRetention(JSONObject store) {
        CaptureLogStore.PruneResult pruneResult = CaptureLogStore.prune(store.optJSONArray("captureLogs"), MAX_CAPTURE_LOGS);
        safePut(store, "captureLogs", pruneResult.getKeptLogs());
        deleteCaptureLogAssets(pruneResult.getRemovedLogs());
    }

    private void deleteCaptureLogAssets(JSONArray removedLogs) {
        JSONArray logs = cloneArray(removedLogs);
        for (int index = 0; index < logs.length(); index++) {
            JSONObject log = logs.optJSONObject(index);
            if (log == null) {
                continue;
            }
            deleteCaptureLogImage(log.optString("imagePath", ""));
        }
    }

    private void deleteCaptureLogImage(String imagePath) {
        if (imagePath == null || imagePath.trim().isEmpty()) {
            return;
        }

        String resolvedPath = imagePath;
        if (imagePath.startsWith("file://")) {
            Uri uri = Uri.parse(imagePath);
            if (uri != null && uri.getPath() != null) {
                resolvedPath = uri.getPath();
            }
        }

        File imageFile = new File(resolvedPath);
        if (!imageFile.isAbsolute()) {
            imageFile = new File(appFilesDir, resolvedPath);
        }

        if (imageFile.exists()) {
            imageFile.delete();
        }
    }

    private void safePut(JSONObject object, String key, Object value) {
        try {
            object.put(key, value);
        } catch (JSONException ignored) {}
    }
}
