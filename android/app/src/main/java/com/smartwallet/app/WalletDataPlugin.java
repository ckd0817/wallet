package com.smartwallet.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.smartwallet.app.data.WalletRepository;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(name = "WalletData")
public class WalletDataPlugin extends Plugin {

    @PluginMethod
    public void loadSnapshot(PluginCall call) {
        call.resolve(toJsObject(repository().loadSnapshot()));
    }

    @PluginMethod
    public void saveSnapshot(PluginCall call) {
        JSObject snapshot = call.getObject("snapshot");
        if (snapshot == null) {
            call.reject("snapshot is required");
            return;
        }
        call.resolve(toJsObject(repository().saveSnapshot(snapshot)));
    }

    @PluginMethod
    public void upsertTransaction(PluginCall call) {
        JSObject transaction = call.getObject("transaction");
        if (transaction == null) {
            call.reject("transaction is required");
            return;
        }
        call.resolve(toJsObject(repository().upsertTransaction(transaction)));
    }

    @PluginMethod
    public void deleteTransaction(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.isEmpty()) {
            call.reject("id is required");
            return;
        }
        call.resolve(toJsObject(repository().deleteTransaction(id)));
    }

    @PluginMethod
    public void replaceTransactions(PluginCall call) {
        JSArray transactions = call.getArray("transactions");
        call.resolve(toJsObject(repository().replaceTransactions(transactions == null ? new JSArray() : transactions)));
    }

    @PluginMethod
    public void upsertCategory(PluginCall call) {
        JSObject category = call.getObject("category");
        if (category == null) {
            call.reject("category is required");
            return;
        }
        call.resolve(toJsObject(repository().upsertCategory(category)));
    }

    @PluginMethod
    public void upsertRecurringProfile(PluginCall call) {
        JSObject recurringProfile = call.getObject("recurringProfile");
        if (recurringProfile == null) {
            call.reject("recurringProfile is required");
            return;
        }
        call.resolve(toJsObject(repository().upsertRecurringProfile(recurringProfile)));
    }

    @PluginMethod
    public void deleteRecurringProfile(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.isEmpty()) {
            call.reject("id is required");
            return;
        }
        call.resolve(toJsObject(repository().deleteRecurringProfile(id)));
    }

    @PluginMethod
    public void saveLlmConfig(PluginCall call) {
        JSObject llmConfig = call.getObject("llmConfig");
        if (llmConfig == null) {
            call.reject("llmConfig is required");
            return;
        }
        call.resolve(toJsObject(repository().saveLlmConfig(llmConfig)));
    }

    private WalletRepository repository() {
        return WalletRepository.getInstance(getContext());
    }

    private JSObject toJsObject(JSONObject object) {
        try {
            return JSObject.fromJSONObject(object);
        } catch (JSONException exception) {
            return new JSObject();
        }
    }
}
