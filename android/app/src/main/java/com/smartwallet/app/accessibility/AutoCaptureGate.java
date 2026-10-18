package com.smartwallet.app.accessibility;

import java.util.ArrayDeque;

/**
 * 自动截图的去重闸门。
 * 同一页面停留期间只触发一次；离开后再次出现最近识别过的内容也不重复触发。
 */
public final class AutoCaptureGate {

    static final int RECENT_FINGERPRINT_LIMIT = 100;
    static final long MIN_INTERVAL_MS = 15 * 1000L;

    private final ArrayDeque<String> recentFingerprints = new ArrayDeque<>();
    private boolean armed = true;
    private long lastTriggeredAt = 0L;

    public synchronized boolean tryAcquire(String fingerprint, long now) {
        if (!armed) {
            return false;
        }
        if (lastTriggeredAt > 0L && now - lastTriggeredAt < MIN_INTERVAL_MS) {
            // 视为同一页面的内容刷新，需离开页面后才能再次触发
            armed = false;
            return false;
        }
        String value = fingerprint == null ? "" : fingerprint;
        if (recentFingerprints.contains(value)) {
            armed = false;
            return false;
        }
        armed = false;
        lastTriggeredAt = now;
        recentFingerprints.addLast(value);
        while (recentFingerprints.size() > RECENT_FINGERPRINT_LIMIT) {
            recentFingerprints.removeFirst();
        }
        return true;
    }

    /** 当前页面已不满足自动识别条件时调用，允许下一笔触发。 */
    public synchronized void rearm() {
        armed = true;
    }
}
