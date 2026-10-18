package com.smartwallet.app.accessibility;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class RememberedPageStoreTest {

    private static final String PACKAGE = "com.sankuai.meituan";
    private static final String ACTIVITY = "com.sankuai.meituan.OrderDetailActivity";

    @Test
    public void matchesOnlyExactSignature() {
        JSONArray pages = RememberedPageStore.withPage(new JSONArray(), page("abc"));

        assertTrue(RememberedPageStore.matches(pages, PACKAGE, ACTIVITY, "abc"));
        assertFalse(RememberedPageStore.matches(pages, PACKAGE, ACTIVITY, "def"));
        assertFalse(RememberedPageStore.matches(pages, PACKAGE, "", "abc"));
        assertTrue(RememberedPageStore.hasPackage(pages, PACKAGE));
        assertFalse(RememberedPageStore.hasPackage(pages, "com.tencent.mm"));
    }

    @Test
    public void replacesSameKeyAndRemovesByKey() {
        JSONArray pages = RememberedPageStore.withPage(new JSONArray(), page("abc"));
        pages = RememberedPageStore.withPage(pages, page("abc"));
        pages = RememberedPageStore.withPage(pages, page("def"));
        assertEquals(2, pages.length());

        JSONArray remaining = RememberedPageStore.without(pages, RememberedPageStore.buildKey(PACKAGE, ACTIVITY, "abc"));
        assertEquals(1, remaining.length());
        assertTrue(RememberedPageStore.matches(remaining, PACKAGE, ACTIVITY, "def"));
    }

    @Test
    public void fallsBackToPackageNameWhenLabelMissing() {
        JSONObject page = RememberedPageStore.createPage(PACKAGE, ACTIVITY, "abc", "", 1L);
        assertEquals(PACKAGE, page.optString("appLabel"));
    }

    private static JSONObject page(String structureFingerprint) {
        return RememberedPageStore.createPage(PACKAGE, ACTIVITY, structureFingerprint, "美团", 1L);
    }
}
