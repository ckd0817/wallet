package com.smartwallet.app.accessibility;

import android.content.Context;
import com.smartwallet.app.ScreenCaptureBookkeepingPlugin;
import com.smartwallet.app.data.WalletRepository;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * 已记住页面：包名 + Activity + 视图结构指纹。命中后在该页面自动截图记账。
 * 数据保存在 autoBookkeepingSettings.rememberedPages，只在本机保存。
 */
public final class RememberedPageStore {

    public static final String SETTING_KEY = "rememberedPages";

    private static volatile JSONArray cachedPages = new JSONArray();

    private RememberedPageStore() {}

    public static String buildKey(String packageName, String activityName, String structureFingerprint) {
        return safe(packageName) + ":" + safe(activityName) + ":" + safe(structureFingerprint);
    }

    public static JSONObject createPage(
        String packageName,
        String activityName,
        String structureFingerprint,
        String appLabel,
        long addedAt
    ) {
        JSONObject page = new JSONObject();
        safePut(page, "key", buildKey(packageName, activityName, structureFingerprint));
        safePut(page, "packageName", safe(packageName));
        safePut(page, "activityName", safe(activityName));
        safePut(page, "structureFingerprint", safe(structureFingerprint));
        safePut(page, "appLabel", safe(appLabel).isEmpty() ? safe(packageName) : safe(appLabel));
        safePut(page, "addedAt", addedAt);
        return page;
    }

    public static boolean matches(JSONArray pages, String packageName, String activityName, String structureFingerprint) {
        if (pages == null) {
            return false;
        }
        String key = buildKey(packageName, activityName, structureFingerprint);
        for (int index = 0; index < pages.length(); index++) {
            JSONObject page = pages.optJSONObject(index);
            if (page != null && key.equals(page.optString("key", ""))) {
                return true;
            }
        }
        return false;
    }

    public static boolean hasPackage(JSONArray pages, String packageName) {
        if (pages == null || packageName == null) {
            return false;
        }
        for (int index = 0; index < pages.length(); index++) {
            JSONObject page = pages.optJSONObject(index);
            if (page != null && packageName.equals(page.optString("packageName", ""))) {
                return true;
            }
        }
        return false;
    }

    /** 返回去掉同 key 旧记录后追加新页面的列表。 */
    public static JSONArray withPage(JSONArray pages, JSONObject page) {
        JSONArray next = without(pages, page.optString("key", ""));
        next.put(page);
        return next;
    }

    public static JSONArray without(JSONArray pages, String key) {
        JSONArray next = new JSONArray();
        if (pages == null) {
            return next;
        }
        for (int index = 0; index < pages.length(); index++) {
            JSONObject page = pages.optJSONObject(index);
            if (page != null && !page.optString("key", "").equals(key)) {
                next.put(page);
            }
        }
        return next;
    }

    public static JSONArray cached() {
        return cachedPages;
    }

    public static void load(Context context) {
        JSONArray pages = WalletRepository.getInstance(context).getAutoBookkeepingSettings().optJSONArray(SETTING_KEY);
        cachedPages = pages == null ? new JSONArray() : pages;
    }

    public static void add(Context context, JSONObject page) {
        save(context, withPage(currentPages(context), page));
    }

    public static void remove(Context context, String key) {
        save(context, without(currentPages(context), key));
    }

    private static JSONArray currentPages(Context context) {
        JSONArray pages = WalletRepository.getInstance(context).getAutoBookkeepingSettings().optJSONArray(SETTING_KEY);
        return pages == null ? new JSONArray() : pages;
    }

    private static void save(Context context, JSONArray pages) {
        WalletRepository repository = WalletRepository.getInstance(context);
        JSONObject updates = new JSONObject();
        safePut(updates, SETTING_KEY, pages);
        repository.saveAutoBookkeepingSettings(updates);
        cachedPages = pages;
        ScreenCaptureBookkeepingPlugin.emitStatusChanged(repository.getAutoBookkeepingSettings());
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }

    private static void safePut(JSONObject object, String key, Object value) {
        try {
            object.put(key, value);
        } catch (JSONException ignored) {}
    }
}
