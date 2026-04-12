package com.smartwallet.app.accessibility;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class AccessibilityCaptureActionReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) {
            return;
        }

        if (AccessibilityCaptureService.ACTION_CAPTURE_NOW.equals(intent.getAction())) {
            AccessibilityCaptureService.requestCapture(context);
        }
    }
}
