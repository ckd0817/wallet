package com.smartwallet.app.accessibility;

import static org.junit.Assert.*;
import org.junit.Test;

public class AccessibilityServiceListTest {
    private static final String WALLET = "com.smartwallet.app/com.google.android.accessibility.selecttospeak.SelectToSpeakService";
    private static final String OTHER = "hello.litiaotiao.app/hello.litiaotiao.app.LttService";

    @Test
    public void reconnectPreservesOtherServices() {
        String initial = OTHER + ":" + WALLET + ":other/service";
        String removed = AccessibilityServiceList.without(initial, WALLET);
        assertEquals(OTHER + ":other/service", removed);
        assertEquals(removed + ":" + WALLET, AccessibilityServiceList.with(removed, WALLET));
    }

    @Test
    public void restoreUsesLatestSettingsWithoutDuplicatingWallet() {
        String changed = OTHER + ":new/service:" + WALLET;
        assertEquals(changed, AccessibilityServiceList.with(changed, WALLET));
        assertEquals("new/service:" + WALLET, AccessibilityServiceList.with("new/service", WALLET));
    }

    @Test
    public void missingOrSimilarlyNamedComponentsAreNotEnabled() {
        assertFalse(AccessibilityServiceList.contains(null, WALLET));
        assertFalse(AccessibilityServiceList.contains("", WALLET));
        assertFalse(AccessibilityServiceList.contains(WALLET + "Other", WALLET));
        assertEquals(WALLET, AccessibilityServiceList.with(null, WALLET));
        assertEquals("", AccessibilityServiceList.without(WALLET, WALLET));
    }
}
