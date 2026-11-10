package com.smartwallet.app.accessibility;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

public final class AccessibilityRecoveryWorker extends Worker {
    public AccessibilityRecoveryWorker(@NonNull Context context, @NonNull WorkerParameters parameters) {
        super(context, parameters);
    }

    @NonNull
    @Override
    public Result doWork() {
        return AccessibilityRecovery.recover(getApplicationContext()) ? Result.success() : Result.retry();
    }
}
