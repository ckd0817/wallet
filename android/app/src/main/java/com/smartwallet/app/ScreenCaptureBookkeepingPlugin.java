package com.smartwallet.app;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import android.util.Log;
import androidx.annotation.Nullable;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.smartwallet.app.accessibility.AccessibilityCaptureService;
import com.smartwallet.app.data.WalletRepository;
import com.smartwallet.app.screencapture.CaptureAnalysisClient;
import com.smartwallet.app.screencapture.NotificationHelper;
import java.lang.ref.WeakReference;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "ScreenCaptureBookkeeping",
    permissions = { @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications") }
)
public class ScreenCaptureBookkeepingPlugin extends Plugin {

    private static final String TAG = "SmartWalletCapture";
    private static final AtomicReference<WeakReference<ScreenCaptureBookkeepingPlugin>> ACTIVE_INSTANCE = new AtomicReference<>();
    private static volatile String pendingDeepLink;
    private final CaptureAnalysisClient analysisClient = new CaptureAnalysisClient();

    @Override
    public void load() {
        super.load();
        NotificationHelper.ensureChannels(getContext());
        AccessibilityCaptureService.syncReadyNotification(getContext());
        ACTIVE_INSTANCE.set(new WeakReference<>(this));
        if (pendingDeepLink != null) {
            emitDeepLink(pendingDeepLink);
        }
    }

    @Override
    protected void handleOnDestroy() {
        WeakReference<ScreenCaptureBookkeepingPlugin> current = ACTIVE_INSTANCE.get();
        if (current != null && current.get() == this) {
            ACTIVE_INSTANCE.set(null);
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(buildStatus());
    }

    @PluginMethod
    public void openAccessibilitySettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve(buildStatus());
    }

    @PluginMethod
    public void captureNow(PluginCall call) {
        AccessibilityCaptureService.requestCapture(getContext());
        call.resolve(buildStatus());
    }

    @PluginMethod
    public void testModelConfig(PluginCall call) {
        call.resolve(toJsObject(analysisClient.testConfig(repository().getLlmConfig(), repository().getCategories())));
    }

    @PluginMethod
    public void consumePendingDeepLink(PluginCall call) {
        String current = pendingDeepLink;
        pendingDeepLink = null;
        JSObject response = new JSObject();
        response.put("url", current);
        call.resolve(response);
    }

    public static void handleIncomingIntent(@Nullable Intent intent) {
        if (intent == null || intent.getData() == null) {
            return;
        }

        Uri data = intent.getData();
        if (!"smartwallet".equalsIgnoreCase(data.getScheme())) {
            return;
        }

        pendingDeepLink = data.toString();
        emitDeepLink(pendingDeepLink);
    }

    public static void emitCaptureRecorded(JSONObject transaction) {
        ScreenCaptureBookkeepingPlugin plugin = getActivePlugin();
        if (plugin == null || plugin.getActivity() == null) {
            return;
        }

        plugin.getActivity().runOnUiThread(() -> plugin.notifyListeners("captureRecorded", plugin.toJsObject(transaction), true));
    }

    public static void emitStatusChanged(JSONObject status) {
        ScreenCaptureBookkeepingPlugin plugin = getActivePlugin();
        if (plugin == null || plugin.getActivity() == null) {
            return;
        }

        JSObject payload = new JSObject();
        try {
            payload.put("status", JSObject.fromJSONObject(status));
        } catch (JSONException ignored) {}
        plugin.getActivity().runOnUiThread(() -> plugin.notifyListeners("statusChanged", payload, true));
    }

    private JSObject buildStatus() {
        boolean notificationsGranted = NotificationHelper.isNotificationPermissionGranted(getContext());
        boolean accessibilityEnabled = AccessibilityCaptureService.isEnabledInSystem(getContext());
        JSONObject settings = repository().getAutoBookkeepingSettings();
        JSONObject updates = new JSONObject();
        boolean shouldPersist = false;

        if (settings.optBoolean("notificationPermissionGranted", false) != notificationsGranted) {
            safePut(updates, "notificationPermissionGranted", notificationsGranted);
            shouldPersist = true;
        }
        if (settings.optBoolean("accessibilityEnabled", false) != accessibilityEnabled) {
            safePut(updates, "accessibilityEnabled", accessibilityEnabled);
            shouldPersist = true;
        }

        AccessibilityCaptureService.syncReadyNotification(getContext());

        Log.i(
            TAG,
            "buildStatus accessibilityEnabled=" +
            accessibilityEnabled +
            ", notificationPermissionGranted=" +
            notificationsGranted +
            ", readyNotificationPresent=" +
            NotificationHelper.hasActiveReadyNotification(getContext())
        );

        if (shouldPersist) {
            settings = repository().saveAutoBookkeepingSettings(updates);
        }

        return toJsObject(settings);
    }

    private WalletRepository repository() {
        return WalletRepository.getInstance(getContext());
    }

    private void safePut(JSONObject object, String key, Object value) {
        try {
            object.put(key, value);
        } catch (JSONException ignored) {}
    }

    private JSObject toJsObject(JSONObject object) {
        try {
            return JSObject.fromJSONObject(object);
        } catch (JSONException exception) {
            return new JSObject();
        }
    }

    private static void emitDeepLink(String deepLink) {
        ScreenCaptureBookkeepingPlugin plugin = getActivePlugin();
        if (plugin == null || plugin.getActivity() == null) {
            return;
        }

        JSObject payload = new JSObject();
        payload.put("url", deepLink);
        plugin.getActivity().runOnUiThread(() -> plugin.notifyListeners("deepLinkReceived", payload, true));
    }

    private static ScreenCaptureBookkeepingPlugin getActivePlugin() {
        WeakReference<ScreenCaptureBookkeepingPlugin> reference = ACTIVE_INSTANCE.get();
        return reference == null ? null : reference.get();
    }
}
