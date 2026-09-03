package com.smartwallet.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.smartwallet.app.data.WalletRepository;
import com.smartwallet.app.assets.AssetQuoteClient;
import com.smartwallet.app.assets.AssetScreenshotAnalysisClient;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(name = "WalletData")
public class WalletDataPlugin extends Plugin {

    @PluginMethod
    public void loadSnapshot(PluginCall call) {
        try {
        call.resolve(toJsObject(repository(call).loadSnapshot()));
        } catch (Exception exception) {
            call.reject(exception.getMessage() == null ? "数据保存失败" : exception.getMessage());
        }
    }

    @PluginMethod
    public void saveSnapshot(PluginCall call) {
        try {
        JSObject snapshot = call.getObject("snapshot");
        if (snapshot == null) {
            call.reject("snapshot is required");
            return;
        }
        String mode = call.getString("mode", "mutate");
        if (!mode.equals("mutate") && !mode.equals("append")) { call.reject("操作无效"); return; }
        call.resolve(toJsObject(repository(call).saveSnapshot(snapshot, mode)));
        } catch (Exception exception) {
            call.reject(exception.getMessage() == null ? "数据保存失败" : exception.getMessage());
        }
    }

    @PluginMethod
    public void upsertTransaction(PluginCall call) {
        try {
        JSObject transaction = call.getObject("transaction");
        if (transaction == null) {
            call.reject("transaction is required");
            return;
        }
        call.resolve(toJsObject(repository(call).upsertTransaction(transaction)));
        } catch (Exception exception) {
            call.reject(exception.getMessage() == null ? "数据保存失败" : exception.getMessage());
        }
    }

    @PluginMethod
    public void deleteTransaction(PluginCall call) {
        try {
        String id = call.getString("id");
        if (id == null || id.isEmpty()) {
            call.reject("id is required");
            return;
        }
        call.resolve(toJsObject(repository(call).deleteTransaction(id)));
        } catch (Exception exception) {
            call.reject(exception.getMessage() == null ? "数据保存失败" : exception.getMessage());
        }
    }

    @PluginMethod
    public void replaceTransactions(PluginCall call) {
        try {
        JSArray transactions = call.getArray("transactions");
        call.resolve(toJsObject(repository(call).replaceTransactions(transactions == null ? new JSArray() : transactions)));
        } catch (Exception exception) {
            call.reject(exception.getMessage() == null ? "数据保存失败" : exception.getMessage());
        }
    }

    @PluginMethod
    public void upsertCategory(PluginCall call) {
        try {
        JSObject category = call.getObject("category");
        if (category == null) {
            call.reject("category is required");
            return;
        }
        call.resolve(toJsObject(repository(call).upsertCategory(category)));
        } catch (Exception exception) {
            call.reject(exception.getMessage() == null ? "数据保存失败" : exception.getMessage());
        }
    }

    @PluginMethod
    public void upsertRecurringProfile(PluginCall call) {
        try {
        JSObject recurringProfile = call.getObject("recurringProfile");
        if (recurringProfile == null) {
            call.reject("recurringProfile is required");
            return;
        }
        call.resolve(toJsObject(repository(call).upsertRecurringProfile(recurringProfile)));
        } catch (Exception exception) {
            call.reject(exception.getMessage() == null ? "数据保存失败" : exception.getMessage());
        }
    }

    @PluginMethod
    public void deleteRecurringProfile(PluginCall call) {
        try {
        String id = call.getString("id");
        if (id == null || id.isEmpty()) {
            call.reject("id is required");
            return;
        }
        call.resolve(toJsObject(repository(call).deleteRecurringProfile(id)));
        } catch (Exception exception) {
            call.reject(exception.getMessage() == null ? "数据保存失败" : exception.getMessage());
        }
    }

    @PluginMethod
    public void saveLlmConfig(PluginCall call) {
        try {
        JSObject llmConfig = call.getObject("llmConfig");
        if (llmConfig == null) {
            call.reject("llmConfig is required");
            return;
        }
        call.resolve(toJsObject(repository(call).saveLlmConfig(llmConfig)));
        } catch (Exception exception) {
            call.reject(exception.getMessage() == null ? "数据保存失败" : exception.getMessage());
        }
    }

    @PluginMethod
    public void upsertAssetHolding(PluginCall call) {
        try {
        JSObject assetHolding = call.getObject("assetHolding");
        if (assetHolding == null) {
            call.reject("assetHolding is required");
            return;
        }
        call.resolve(toJsObject(repository(call).upsertAssetHolding(assetHolding)));
        } catch (Exception exception) {
            call.reject(exception.getMessage() == null ? "数据保存失败" : exception.getMessage());
        }
    }

    @PluginMethod
    public void deleteAssetHolding(PluginCall call) {
        try {
        String id = call.getString("id");
        if (id == null || id.isEmpty()) {
            call.reject("id is required");
            return;
        }
        call.resolve(toJsObject(repository(call).deleteAssetHolding(id)));
        } catch (Exception exception) {
            call.reject(exception.getMessage() == null ? "数据保存失败" : exception.getMessage());
        }
    }

    @PluginMethod
    public void syncAssetQuotes(PluginCall call) {
        try {
        JSArray assetHoldings = call.getArray("assetHoldings");
        String fundQuoteSource = call.getString("fundQuoteSource", AssetQuoteClient.SOURCE_EASTMONEY);
        JSONArray quotes = new AssetQuoteClient().sync(
            assetHoldings == null ? new JSArray() : assetHoldings,
            fundQuoteSource
        );
        repository(call).replaceAssetQuoteCache(quotes);
        JSObject result = new JSObject();
        result.put("quotes", quotes);
        call.resolve(result);
        } catch (Exception exception) {
            call.reject(exception.getMessage() == null ? "数据保存失败" : exception.getMessage());
        }
    }

    @PluginMethod
    public void testFundQuoteSource(PluginCall call) {
        try {
        String source = call.getString("source", AssetQuoteClient.SOURCE_EASTMONEY);
        String code = call.getString("code", "004388");
        String name = call.getString("name", "");
        call.resolve(toJsObject(new AssetQuoteClient().testFundQuoteSource(source, code, name)));
        } catch (Exception exception) {
            call.reject(exception.getMessage() == null ? "数据保存失败" : exception.getMessage());
        }
    }

    @PluginMethod
    public void analyzeAssetScreenshot(PluginCall call) {
        try {
        String imageBase64 = call.getString("imageBase64");
        if (imageBase64 == null || imageBase64.isEmpty()) {
            call.reject("imageBase64 is required");
            return;
        }
        JSONObject result = new AssetScreenshotAnalysisClient().analyze(
            imageBase64,
            repository(call).getLlmConfig()
        );
        call.resolve(toJsObject(result));
        } catch (Exception exception) {
            call.reject(exception.getMessage() == null ? "数据保存失败" : exception.getMessage());
        }
    }

    @PluginMethod
    public void upsertAssetRecurringPlan(PluginCall call) {
        try {
        JSObject assetRecurringPlan = call.getObject("assetRecurringPlan");
        if (assetRecurringPlan == null) {
            call.reject("assetRecurringPlan is required");
            return;
        }
        call.resolve(toJsObject(repository(call).upsertAssetRecurringPlan(assetRecurringPlan)));
        } catch (Exception exception) {
            call.reject(exception.getMessage() == null ? "数据保存失败" : exception.getMessage());
        }
    }

    @PluginMethod
    public void deleteAssetRecurringPlan(PluginCall call) {
        try {
        String id = call.getString("id");
        if (id == null || id.isEmpty()) {
            call.reject("id is required");
            return;
        }
        call.resolve(toJsObject(repository(call).deleteAssetRecurringPlan(id)));
        } catch (Exception exception) {
            call.reject(exception.getMessage() == null ? "数据保存失败" : exception.getMessage());
        }
    }

    private WalletRepository repository(PluginCall call) {
        String active = com.smartwallet.app.data.WalletDatabase.get(getContext()).activeAccount();
        String expected = call.getString("accountId", active);
        if (!expected.equals(active)) throw new IllegalStateException("账户已切换");
        return WalletRepository.forAccount(getContext(), expected);
    }

    private JSObject toJsObject(JSONObject object) {
        try {
            return JSObject.fromJSONObject(object);
        } catch (JSONException exception) {
            return new JSObject();
        }
    }
}
