package com.smartwallet.app.data;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public final class WalletDefaults {

    private static final String LEGACY_CAPTURE_PROMPT =
        "你正在分析一张支付结果页截图。\n" +
        "今天的本地日期是 {{today_date}}。在推断 occurredAt 时优先使用这个日期；只有截图里明确出现其他日期时，才使用截图中的日期。\n" +
        "只支持“支出类支付成功页”。如果截图不是支付成功结果页，或者是收入、退款、转账等非支出场景，请返回 supported=false。\n" +
        "必须且只能从这些支出分类中选择一个 categoryId：{{expense_categories}}。\n" +
        "只返回 JSON，不要输出 Markdown、解释或额外文本。返回格式固定为 {\"supported\":true|false,\"transactionType\":\"expense|income|refund|unknown\",\"amount\":number,\"merchantName\":\"...\",\"occurredAt\":\"YYYY-MM-DD\",\"categoryId\":\"...\",\"note\":\"...\",\"confidence\":0-1,\"summary\":\"...\"}。";
    private static final String DEFAULT_CAPTURE_PROMPT =
        "你正在分析一张付款、收款或退款结果截图。\n" +
        "今天的本地日期是 {{today_date}}。在推断 occurredAt 时优先使用这个日期；只有截图里明确出现其他日期时，才使用截图中的日期。\n" +
        "你只能识别两种交易类型：expense 或 income。\n" +
        "付款成功、消费支出、扣款成功等记为 expense。\n" +
        "收款到账、退款到账、报销到账等记为 income。\n" +
        "如果截图不足以确认是一笔有效入账记录，或者无法确认金额，就仍然只返回 JSON，并将 amount 设为 0，categoryId 设为空字符串，summary 写明原因。\n" +
        "如果 transactionType=expense，categoryId 必须且只能从这些支出分类中选择：{{expense_categories}}。\n" +
        "如果 transactionType=income，categoryId 必须且只能从这些收入分类中选择：{{income_categories}}。\n" +
        "只返回 JSON，不要输出 Markdown、解释或额外文本。返回格式固定为 {\"transactionType\":\"expense|income\",\"amount\":number,\"merchantName\":\"...\",\"occurredAt\":\"YYYY-MM-DD\",\"categoryId\":\"...\",\"note\":\"...\",\"summary\":\"...\"}。";

    private WalletDefaults() {}

    public static JSONObject defaultStore() {
        JSONObject object = new JSONObject();
        safePut(object, "storeVersion", 1);
        safePut(object, "migratedFromWebStorage", false);
        safePut(object, "transactions", new JSONArray());
        safePut(object, "captureLogs", new JSONArray());
        safePut(object, "categories", defaultCategories());
        safePut(object, "recurringProfiles", new JSONArray());
        safePut(object, "llmConfig", defaultLlmConfig());
        safePut(object, "autoBookkeepingSettings", defaultAutoBookkeepingSettings());
        return object;
    }

    public static JSONObject defaultLlmConfig() {
        JSONObject object = new JSONObject();
        safePut(object, "apiKey", "");
        safePut(object, "baseUrl", "");
        safePut(object, "modelName", "");
        safePut(object, "timeoutMs", 20000);
        safePut(object, "capturePrompt", DEFAULT_CAPTURE_PROMPT);
        return object;
    }

    public static JSONObject defaultAutoBookkeepingSettings() {
        JSONObject object = new JSONObject();
        safePut(object, "accessibilityEnabled", false);
        safePut(object, "notificationPermissionGranted", false);
        safePut(object, "lastCaptureAt", 0);
        safePut(object, "lastError", "");
        return object;
    }

    public static JSONObject ensureDefaults(JSONObject candidate) {
        JSONObject merged = cloneObject(defaultStore());
        if (candidate == null) {
            return merged;
        }

        safePut(merged, "storeVersion", candidate.optInt("storeVersion", 1));
        safePut(merged, "migratedFromWebStorage", candidate.optBoolean("migratedFromWebStorage", false));
        safePut(merged, "transactions", cloneArray(candidate.optJSONArray("transactions")));
        safePut(merged, "captureLogs", cloneArray(candidate.optJSONArray("captureLogs")));
        safePut(merged, "recurringProfiles", cloneArray(candidate.optJSONArray("recurringProfiles")));

        JSONArray categories = candidate.optJSONArray("categories");
        safePut(merged, "categories", mergeCategories(categories));

        JSONObject llmConfig = cloneObject(defaultLlmConfig());
        mergeInto(llmConfig, candidate.optJSONObject("llmConfig"));
        llmConfig.remove("enabled");
        safePut(llmConfig, "capturePrompt", normalizeCapturePrompt(llmConfig.optString("capturePrompt", "")));
        safePut(merged, "llmConfig", llmConfig);

        JSONObject bookkeepingSettings = cloneObject(defaultAutoBookkeepingSettings());
        mergeInto(bookkeepingSettings, candidate.optJSONObject("autoBookkeepingSettings"));
        bookkeepingSettings.remove("sessionActive");
        safePut(merged, "autoBookkeepingSettings", bookkeepingSettings);

        return merged;
    }

    private static JSONArray defaultCategories() {
        JSONArray categories = new JSONArray();
        categories.put(category("food", "餐饮", "Utensils", "#171717", "expense"));
        categories.put(category("transport", "交通", "Bus", "#52525b", "expense"));
        categories.put(category("shopping", "购物", "ShoppingBag", "#ea580c", "expense"));
        categories.put(category("housing", "居住", "Home", "#059669", "expense"));
        categories.put(category("entertainment", "娱乐", "Clapperboard", "#0891b2", "expense"));
        categories.put(category("health", "医疗", "HeartPulse", "#be123c", "expense"));
        categories.put(category("education", "教育", "GraduationCap", "#7c3aed", "expense"));
        categories.put(category("daily_use", "日用", "Coffee", "#d97706", "expense"));
        categories.put(category("sports", "运动", "Star", "#2563eb", "expense"));
        categories.put(category("other_exp", "其他支出", "MoreHorizontal", "#71717a", "expense"));
        categories.put(category("salary", "工资", "Briefcase", "#000000", "income"));
        categories.put(category("bonus", "奖金", "DollarSign", "#b45309", "income"));
        categories.put(category("investment", "理财", "PiggyBank", "#4338ca", "income"));
        categories.put(category("other_inc", "其他收入", "MoreHorizontal", "#52525b", "income"));
        return categories;
    }

    private static JSONArray mergeCategories(JSONArray categories) {
        JSONArray defaults = defaultCategories();
        if (categories == null || categories.length() == 0) {
            return defaults;
        }

        JSONArray merged = cloneArray(categories);
        for (int index = 0; index < defaults.length(); index++) {
            JSONObject defaultCategory = defaults.optJSONObject(index);
            if (defaultCategory == null) {
                continue;
            }

            String defaultId = defaultCategory.optString("id", "");
            if (defaultId.isEmpty() || hasCategory(merged, defaultId)) {
                continue;
            }

            merged.put(defaultCategory);
        }

        return merged;
    }

    private static boolean hasCategory(JSONArray categories, String id) {
        for (int index = 0; index < categories.length(); index++) {
            JSONObject category = categories.optJSONObject(index);
            if (category != null && id.equals(category.optString("id", ""))) {
                return true;
            }
        }
        return false;
    }

    private static JSONObject category(String id, String name, String icon, String color, String type) {
        JSONObject object = new JSONObject();
        safePut(object, "id", id);
        safePut(object, "name", name);
        safePut(object, "icon", icon);
        safePut(object, "color", color);
        safePut(object, "type", type);
        return object;
    }

    private static String normalizeCapturePrompt(String capturePrompt) {
        String normalized = capturePrompt == null ? "" : capturePrompt.trim();
        if (normalized.isEmpty() || LEGACY_CAPTURE_PROMPT.equals(normalized)) {
            return DEFAULT_CAPTURE_PROMPT;
        }
        return capturePrompt;
    }

    private static void mergeInto(JSONObject target, JSONObject source) {
        if (source == null) {
            return;
        }
        JSONArray names = source.names();
        if (names == null) {
            return;
        }
        for (int index = 0; index < names.length(); index++) {
            String key = names.optString(index, null);
            if (key == null) {
                continue;
            }
            safePut(target, key, source.opt(key));
        }
    }

    private static JSONObject cloneObject(JSONObject source) {
        if (source == null) {
            return new JSONObject();
        }
        try {
            return new JSONObject(source.toString());
        } catch (JSONException ignored) {
            return new JSONObject();
        }
    }

    private static JSONArray cloneArray(JSONArray source) {
        if (source == null) {
            return new JSONArray();
        }
        try {
            return new JSONArray(source.toString());
        } catch (JSONException ignored) {
            return new JSONArray();
        }
    }

    private static void safePut(JSONObject object, String key, Object value) {
        try {
            object.put(key, value);
        } catch (JSONException ignored) {}
    }
}
