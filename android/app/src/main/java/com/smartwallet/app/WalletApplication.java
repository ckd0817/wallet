package com.smartwallet.app;

import android.app.Application;
import com.smartwallet.app.accessibility.AccessibilityRecovery;

public final class WalletApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        AccessibilityRecovery.initialize(this);
    }
}
