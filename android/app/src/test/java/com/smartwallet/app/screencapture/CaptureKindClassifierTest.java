package com.smartwallet.app.screencapture;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class CaptureKindClassifierTest {

    @Test
    public void parsesAssetKind() {
        assertEquals(CaptureKindClassifier.KIND_ASSET, CaptureKindClassifier.parseKind("{\"kind\":\"asset\"}"));
    }

    @Test
    public void parsesBookkeepingKind() {
        assertEquals(CaptureKindClassifier.KIND_BOOKKEEPING, CaptureKindClassifier.parseKind("{\"kind\":\"bookkeeping\"}"));
    }

    @Test
    public void stripsMarkdownFence() {
        assertEquals(
            CaptureKindClassifier.KIND_ASSET,
            CaptureKindClassifier.parseKind("```json\n{\"kind\":\"asset\"}\n```")
        );
    }

    @Test
    public void defaultsToBookkeepingOnEmpty() {
        assertEquals(CaptureKindClassifier.KIND_BOOKKEEPING, CaptureKindClassifier.parseKind(""));
        assertEquals(CaptureKindClassifier.KIND_BOOKKEEPING, CaptureKindClassifier.parseKind(null));
    }

    @Test
    public void defaultsToBookkeepingOnUnknownKind() {
        assertEquals(CaptureKindClassifier.KIND_BOOKKEEPING, CaptureKindClassifier.parseKind("{\"kind\":\"receipt\"}"));
    }

    @Test
    public void fallsBackToTextHeuristic() {
        assertEquals(CaptureKindClassifier.KIND_ASSET, CaptureKindClassifier.parseKind("这是 asset 类型"));
    }
}
