package com.smartwallet.app.screencapture;

import org.json.JSONArray;
import org.json.JSONException;

public final class CaptureLogStore {

    private CaptureLogStore() {}

    public static PruneResult prune(JSONArray source, int maxEntries) {
        JSONArray kept = new JSONArray();
        JSONArray removed = new JSONArray();
        JSONArray logs = cloneArray(source);

        for (int index = 0; index < logs.length(); index++) {
            if (kept.length() < maxEntries) {
                kept.put(logs.opt(index));
            } else {
                removed.put(logs.opt(index));
            }
        }

        return new PruneResult(kept, removed);
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

    public static final class PruneResult {

        private final JSONArray keptLogs;
        private final JSONArray removedLogs;

        PruneResult(JSONArray keptLogs, JSONArray removedLogs) {
            this.keptLogs = keptLogs;
            this.removedLogs = removedLogs;
        }

        public JSONArray getKeptLogs() {
            return keptLogs;
        }

        public JSONArray getRemovedLogs() {
            return removedLogs;
        }
    }
}
