package com.smartwallet.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WalletDataPlugin.class);
        registerPlugin(ScreenCaptureBookkeepingPlugin.class);
        super.onCreate(savedInstanceState);
        ScreenCaptureBookkeepingPlugin.handleIncomingIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        ScreenCaptureBookkeepingPlugin.handleIncomingIntent(intent);
    }
}
