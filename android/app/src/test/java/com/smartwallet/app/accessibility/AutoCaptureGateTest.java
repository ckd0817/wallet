package com.smartwallet.app.accessibility;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class AutoCaptureGateTest {

    private static final long LATER = AutoCaptureGate.MIN_INTERVAL_MS + 1;

    @Test
    public void triggersOncePerPageVisit() {
        AutoCaptureGate gate = new AutoCaptureGate();
        assertTrue(gate.tryAcquire("a", 1_000L));
        assertFalse(gate.tryAcquire("b", 1_000L + LATER));
    }

    @Test
    public void blocksRecentlyCapturedContent() {
        AutoCaptureGate gate = new AutoCaptureGate();
        assertTrue(gate.tryAcquire("a", 1_000L));
        gate.rearm();
        assertFalse(gate.tryAcquire("a", 1_000L + LATER * 100));
        gate.rearm();
        assertTrue(gate.tryAcquire("b", 1_000L + LATER * 101));
    }

    @Test
    public void forgetsOldestContentBeyondLimit() {
        AutoCaptureGate gate = new AutoCaptureGate();
        long now = 1_000L;
        for (int index = 0; index <= AutoCaptureGate.RECENT_FINGERPRINT_LIMIT; index++) {
            gate.rearm();
            assertTrue(gate.tryAcquire("page-" + index, now));
            now += LATER;
        }
        gate.rearm();
        assertTrue(gate.tryAcquire("page-0", now));
    }

    @Test
    public void refreshWithinMinIntervalKeepsPageLocked() {
        AutoCaptureGate gate = new AutoCaptureGate();
        assertTrue(gate.tryAcquire("a", 1_000L));
        gate.rearm();
        assertFalse(gate.tryAcquire("b", 5_000L));
        assertFalse(gate.tryAcquire("c", 1_000L + LATER));
        gate.rearm();
        assertTrue(gate.tryAcquire("d", 1_000L + LATER));
    }
}
