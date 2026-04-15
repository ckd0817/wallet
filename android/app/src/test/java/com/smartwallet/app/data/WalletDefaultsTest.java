package com.smartwallet.app.data;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class WalletDefaultsTest {

    private static final String PREVIOUS_DEFAULT_CAPTURE_PROMPT =
        "你正在分析一张付款、收款或退款结果截图。\n" +
        "今天的本地日期是 {{today_date}}。在推断 occurredAt 时优先使用这个日期；只有截图里明确出现其他日期时，才使用截图中的日期。\n" +
        "你只能识别两种交易类型：expense 或 income。\n" +
        "付款成功、消费支出、扣款成功等记为 expense。\n" +
        "收款到账、退款到账、报销到账等记为 income。\n" +
        "如果截图不足以确认是一笔有效入账记录，或者无法确认金额，就仍然只返回 JSON，并将 amount 设为 0，categoryId 设为空字符串，summary 写明原因。\n" +
        "如果 transactionType=expense，categoryId 必须且只能从这些支出分类中选择：{{expense_categories}}。\n" +
        "如果 transactionType=income，categoryId 必须且只能从这些收入分类中选择：{{income_categories}}。\n" +
        "只返回 JSON，不要输出 Markdown、解释或额外文本。返回格式固定为 {\"transactionType\":\"expense|income\",\"amount\":number,\"merchantName\":\"...\",\"occurredAt\":\"YYYY-MM-DD\",\"categoryId\":\"...\",\"note\":\"...\",\"summary\":\"...\"}。";

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

    @Test
    public void ensureDefaultsUpgradesPreviousDefaultCapturePrompt() throws Exception {
        JSONObject candidate = new JSONObject();
        JSONObject llmConfig = new JSONObject();
        llmConfig.put("capturePrompt", PREVIOUS_DEFAULT_CAPTURE_PROMPT);
        candidate.put("llmConfig", llmConfig);

        JSONObject merged = WalletDefaults.ensureDefaults(candidate);
        JSONObject mergedLlmConfig = merged.optJSONObject("llmConfig");
        String currentDefaultPrompt = WalletDefaults.defaultLlmConfig().optString("capturePrompt");

        assertTrue(mergedLlmConfig != null);
        assertEquals(currentDefaultPrompt, mergedLlmConfig.optString("capturePrompt"));
        assertTrue(currentDefaultPrompt.contains("如果截图里同时出现多笔支出记录，优先记录最新的一条，不要同时输出两条或多条记录。"));
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
