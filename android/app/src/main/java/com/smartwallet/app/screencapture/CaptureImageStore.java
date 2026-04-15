package com.smartwallet.app.screencapture;

import android.net.Uri;
import java.io.File;
import java.util.UUID;

public class CaptureImageStore {

    static final String CAPTURE_LOG_DIR_NAME = "capture-logs";

    private final File appFilesDir;

    public CaptureImageStore(File appFilesDir) {
        this.appFilesDir = appFilesDir;
    }

    public File createImageFile() {
        File captureDir = getCaptureLogDir();
        if (!captureDir.exists()) {
            captureDir.mkdirs();
        }

        return new File(captureDir, "capture_" + System.currentTimeMillis() + "_" + UUID.randomUUID() + ".png");
    }

    public String toStoredImagePath(File imageFile) {
        return imageFile == null ? "" : "file://" + imageFile.getAbsolutePath();
    }

    public File resolveOwnedImageFile(String imagePath) {
        if (imagePath == null || imagePath.trim().isEmpty()) {
            return null;
        }

        try {
            String resolvedPath = imagePath;
            if (imagePath.startsWith("file://")) {
                Uri uri = Uri.parse(imagePath);
                if (uri != null && uri.getPath() != null) {
                    resolvedPath = uri.getPath();
                }
            }

            File candidate = new File(resolvedPath);
            if (!candidate.isAbsolute()) {
                candidate = new File(appFilesDir, resolvedPath);
            }

            File captureDir = getCaptureLogDir().getCanonicalFile();
            File resolvedFile = candidate.getCanonicalFile();
            String captureDirPath = captureDir.getPath();
            String resolvedPathValue = resolvedFile.getPath();
            if (
                !resolvedPathValue.equals(captureDirPath) &&
                !resolvedPathValue.startsWith(captureDirPath + File.separator)
            ) {
                return null;
            }

            if (!resolvedFile.exists() || !resolvedFile.isFile()) {
                return null;
            }

            return resolvedFile;
        } catch (Exception ignored) {
            return null;
        }
    }

    private File getCaptureLogDir() {
        return new File(appFilesDir, CAPTURE_LOG_DIR_NAME);
    }
}
