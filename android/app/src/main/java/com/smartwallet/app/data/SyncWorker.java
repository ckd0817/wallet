package com.smartwallet.app.data;
import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.*;
public final class SyncWorker extends Worker {
    public SyncWorker(@NonNull Context context,@NonNull WorkerParameters parameters){super(context,parameters);}
    @NonNull @Override public Result doWork() {
        String account=getInputData().getString("account");
        if(account==null)return Result.failure();
        try{new CloudSync(getApplicationContext()).sync(account);return Result.success();}
        catch(Exception e){
            if(WalletDatabase.get(getApplicationContext()).number(account,"suspended")==1)return Result.failure();
            if(e instanceof CloudSync.ApiException&&((CloudSync.ApiException)e).status==401)return Result.failure();
            return Result.retry();
        }
    }
}
