package com.smartwallet.app.screencapture;

import static org.junit.Assert.assertEquals;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class CaptureLogStoreTest {

    @Test
    public void pruneKeepsLatestLogsAndReturnsOverflow() throws Exception {
        JSONArray logs = new JSONArray();
        for (int index = 0; index < 52; index++) {
            logs.put(
                new JSONObject()
                    .put("id", "log-" + index)
                    .put("capturedAt", "2026-04-11T15:00:" + String.format("%02d", index) + ".000Z")
                    .put("imagePath", "file:///tmp/log-" + index + ".png")
            );
        }

        CaptureLogStore.PruneResult pruneResult = CaptureLogStore.prune(logs, 50);

        assertEquals(50, pruneResult.getKeptLogs().length());
        assertEquals(2, pruneResult.getRemovedLogs().length());
        assertEquals("log-0", pruneResult.getKeptLogs().optJSONObject(0).optString("id"));
        assertEquals("log-50", pruneResult.getRemovedLogs().optJSONObject(0).optString("id"));
    }
}
