package com.smartwallet.app.data;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class WalletDefaultsTest {

    @Test
    public void defaultStoreIncludesScreenshotBookkeepingState() {
        JSONObject store = WalletDefaults.defaultStore();
        JSONObject bookkeepingSettings = store.optJSONObject("autoBookkeepingSettings");
        JSONObject llmConfig = store.optJSONObject("llmConfig");

        assertTrue(store.has("transactions"));
        assertTrue(store.has("llmConfig"));
        assertTrue(bookkeepingSettings != null);
        assertTrue(llmConfig != null);
        assertFalse(llmConfig.has("enabled"));
        assertFalse(bookkeepingSettings.has("sessionActive"));
        assertFalse(bookkeepingSettings.optBoolean("accessibilityEnabled", true));
        assertFalse(bookkeepingSettings.optBoolean("notificationPermissionGranted", true));
    }

    @Test
    public void ensureDefaultsAppendsNewBuiltInCategoriesToExistingStore() throws Exception {
        JSONObject candidate = new JSONObject();
        JSONArray categories = new JSONArray();
        categories.put(category("food", "餐饮"));
        categories.put(category("shopping", "购物"));
        candidate.put("categories", categories);

        JSONObject merged = WalletDefaults.ensureDefaults(candidate);
        JSONArray mergedCategories = merged.optJSONArray("categories");

        assertTrue(containsCategory(mergedCategories, "daily_use"));
        assertTrue(containsCategory(mergedCategories, "sports"));
        assertEquals(14, mergedCategories.length());
    }

    @Test
    public void ensureDefaultsStripsLegacyEnabledFlagFromLlmConfig() throws Exception {
        JSONObject candidate = new JSONObject();
        JSONObject llmConfig = new JSONObject();
        llmConfig.put("apiKey", "test-key");
        llmConfig.put("baseUrl", "https://example.com/v1");
        llmConfig.put("modelName", "demo-model");
        llmConfig.put("enabled", true);
        candidate.put("llmConfig", llmConfig);

        JSONObject merged = WalletDefaults.ensureDefaults(candidate);
        JSONObject mergedLlmConfig = merged.optJSONObject("llmConfig");

        assertTrue(mergedLlmConfig != null);
        assertFalse(mergedLlmConfig.has("enabled"));
        assertEquals("test-key", mergedLlmConfig.optString("apiKey"));
    }

    private static JSONObject category(String id, String name) throws Exception {
        JSONObject category = new JSONObject();
        category.put("id", id);
        category.put("name", name);
        category.put("icon", "MoreHorizontal");
        category.put("color", "#71717a");
        category.put("type", "expense");
        return category;
    }

    private static boolean containsCategory(JSONArray categories, String id) {
        if (categories == null) {
            return false;
        }

        for (int index = 0; index < categories.length(); index++) {
            JSONObject category = categories.optJSONObject(index);
            if (category != null && id.equals(category.optString("id", ""))) {
                return true;
            }
        }

        return false;
    }
}
