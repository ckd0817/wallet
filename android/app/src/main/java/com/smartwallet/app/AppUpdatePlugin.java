package com.smartwallet.app;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.smartwallet.app.data.CloudSync;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "AppUpdate")
public final class AppUpdatePlugin extends Plugin {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private JSONObject release;
    private File readyApk;
    private boolean awaitingPermission;
    private static final long MAX_APK_SIZE = 200L * 1024 * 1024;

    private PackageInfo installed() throws Exception {
        return getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
    }

    private HttpURLConnection connect(String path) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(CloudSync.API + "/app-updates/android" + path).openConnection();
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(30_000);
        connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("Accept-Encoding", "identity");
        return connection;
    }

    @PluginMethod public void checkUpdate(PluginCall call) {
        executor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                PackageInfo current = installed();
                connection = connect("");
                if (connection.getResponseCode() != 200) throw new IOException("检查更新失败");
                byte[] content;
                try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                    byte[] buffer = new byte[4096]; int count;
                    while ((count = input.read(buffer)) != -1) {
                        if (output.size() + count > 16_384) throw new IOException("版本信息无效");
                        output.write(buffer, 0, count);
                    }
                    content = output.toByteArray();
                }
                JSONObject candidate = new JSONObject(new String(content, java.nio.charset.StandardCharsets.UTF_8)).optJSONObject("release");
                if (candidate != null) {
                    long version = candidate.getLong("versionCode");
                    long size = candidate.getLong("size");
                    if (version <= 0 || version > 2_100_000_000L || size <= 0 || size > MAX_APK_SIZE
                        || !candidate.getString("sha256").matches("[a-f0-9]{64}")
                        || candidate.getString("versionName").isEmpty()) throw new IOException("版本信息无效");
                }
                release = candidate != null && candidate.getLong("versionCode") > current.getLongVersionCode() ? candidate : null;
                readyApk = null;
                JSObject result = new JSObject();
                result.put("currentVersion", current.versionName);
                result.put("available", release != null);
                result.put("release", release == null ? JSONObject.NULL : release);
                call.resolve(result);
            } catch (Exception error) { call.reject("检查更新失败，请稍后重试"); }
            finally { if (connection != null) connection.disconnect(); }
        });
    }

    private File updateFile(JSONObject target) throws Exception {
        File directory = new File(getContext().getCacheDir(), "updates");
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("无法保存安装包");
        return new File(directory, target.getLong("versionCode") + ".apk");
    }

    @PluginMethod public void downloadUpdate(PluginCall call) {
        executor.execute(() -> {
            HttpURLConnection connection = null;
            File partial = null;
            try {
                if (release == null) throw new IOException("请先检查更新");
                JSONObject target = release;
                File apk = updateFile(target);
                readyApk = null;
                if (apk.isFile()) {
                    try { verify(apk, target); readyApk = apk; call.resolve(); return; }
                    catch (Exception ignored) { if (!apk.delete()) throw new IOException("无法清理安装包"); }
                }
                File[] previous = apk.getParentFile().listFiles();
                if (previous != null) for (File file : previous) if (!file.equals(apk)) file.delete();
                partial = new File(apk.getPath() + ".part");
                connection = connect("/" + target.getLong("versionCode") + ".apk");
                if (connection.getResponseCode() != 200) throw new IOException("下载失败");
                long expectedSize = target.getLong("size");
                long received = 0;
                int lastPercent = -1;
                try (InputStream input = connection.getInputStream(); OutputStream output = new FileOutputStream(partial)) {
                    byte[] buffer = new byte[64 * 1024];
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        received += count;
                        if (received > expectedSize) throw new IOException("安装包大小不符");
                        output.write(buffer, 0, count);
                        int percent = (int) (received * 100 / expectedSize);
                        if (percent != lastPercent) {
                            JSObject progress = new JSObject(); progress.put("percent", percent);
                            notifyListeners("downloadProgress", progress); lastPercent = percent;
                        }
                    }
                }
                verify(partial, target);
                if (!partial.renameTo(apk)) throw new IOException("无法保存安装包");
                readyApk = apk;
                call.resolve();
            } catch (Exception error) { call.reject(error.getMessage() == null ? "下载失败，请重试" : error.getMessage()); }
            finally { if (connection != null) connection.disconnect(); if (partial != null) partial.delete(); }
        });
    }

    private static Set<String> signers(PackageInfo info) throws Exception {
        if (info.signingInfo == null) throw new IOException("安装包签名无效");
        Set<String> result = new HashSet<>();
        for (Signature signature : info.signingInfo.getApkContentsSigners()) result.add(signature.toCharsString());
        if (result.isEmpty()) throw new IOException("安装包签名无效");
        return result;
    }

    private void verify(File apk, JSONObject target) throws Exception {
        if (apk.length() != target.getLong("size")) throw new IOException("安装包不完整，请重新下载");
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(apk)) {
            byte[] buffer = new byte[64 * 1024]; int count;
            while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
        }
        StringBuilder hex = new StringBuilder();
        for (byte value : digest.digest()) hex.append(String.format("%02x", value & 255));
        if (!hex.toString().equals(target.getString("sha256"))) throw new IOException("安装包校验失败，请重新下载");
        PackageInfo archive = getContext().getPackageManager().getPackageArchiveInfo(apk.getPath(), PackageManager.GET_SIGNING_CERTIFICATES);
        PackageInfo current = installed();
        if (archive == null || !getContext().getPackageName().equals(archive.packageName)
            || archive.applicationInfo == null || (archive.applicationInfo.flags & ApplicationInfo.FLAG_DEBUGGABLE) == 0
            || archive.getLongVersionCode() != target.getLong("versionCode")
            || archive.getLongVersionCode() <= current.getLongVersionCode()
            || !target.getString("versionName").equals(archive.versionName)
            || !signers(archive).equals(signers(current))) throw new IOException("安装包与当前应用不兼容");
    }

    @PluginMethod public void installUpdate(PluginCall call) {
        executor.execute(() -> {
            try {
                if (readyApk == null || release == null) throw new IOException("请先下载安装包");
                verify(readyApk, release);
                getActivity().runOnUiThread(() -> {
                    try {
                        boolean permitted = getContext().getPackageManager().canRequestPackageInstalls();
                        if (!permitted) {
                            awaitingPermission = true;
                            getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.parse("package:" + getContext().getPackageName())));
                        } else { openInstaller(); }
                        JSObject result = new JSObject(); result.put("permissionRequired", !permitted); call.resolve(result);
                    } catch (Exception error) { awaitingPermission = false; call.reject("无法打开安装程序"); }
                });
            } catch (Exception error) { call.reject(error.getMessage()); }
        });
    }

    private void openInstaller() {
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", readyApk);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        getActivity().startActivity(intent);
    }

    @Override protected void handleOnResume() {
        if (!awaitingPermission) return;
        awaitingPermission = false;
        JSObject result = new JSObject();
        try {
            if (getContext().getPackageManager().canRequestPackageInstalls()) { openInstaller(); result.put("status", "opened"); }
            else { result.put("status", "permissionDenied"); }
        } catch (Exception error) { result.put("status", "failed"); }
        notifyListeners("installStatus", result);
    }
}
