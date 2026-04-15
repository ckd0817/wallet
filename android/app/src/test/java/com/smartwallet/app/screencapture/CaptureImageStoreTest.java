package com.smartwallet.app.screencapture;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

import java.io.File;
import java.nio.file.Files;
import org.junit.Test;

public class CaptureImageStoreTest {

    @Test
    public void resolveOwnedImageFileReturnsFileInsideCaptureDirectory() throws Exception {
        File appFilesDir = Files.createTempDirectory("wallet-files").toFile();
        File captureDir = new File(appFilesDir, CaptureImageStore.CAPTURE_LOG_DIR_NAME);
        captureDir.mkdirs();
        File imageFile = new File(captureDir, "saved.png");
        imageFile.createNewFile();
        CaptureImageStore imageStore = new CaptureImageStore(appFilesDir);

        File resolvedFile = imageStore.resolveOwnedImageFile(imageFile.getAbsolutePath());

        assertNotNull(resolvedFile);
        assertEquals(imageFile.getCanonicalPath(), resolvedFile.getCanonicalPath());
    }

    @Test
    public void resolveOwnedImageFileRejectsMissingAndExternalFiles() throws Exception {
        File appFilesDir = Files.createTempDirectory("wallet-files").toFile();
        File externalDir = Files.createTempDirectory("wallet-external").toFile();
        File externalFile = new File(externalDir, "outside.png");
        externalFile.createNewFile();
        CaptureImageStore imageStore = new CaptureImageStore(appFilesDir);

        assertNull(imageStore.resolveOwnedImageFile(externalFile.getAbsolutePath()));
        assertNull(imageStore.resolveOwnedImageFile(new File(appFilesDir, "capture-logs/missing.png").getAbsolutePath()));
        assertNull(imageStore.resolveOwnedImageFile(""));
    }
}
