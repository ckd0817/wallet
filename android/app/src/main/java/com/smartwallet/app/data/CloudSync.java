package com.smartwallet.app.data;

import android.content.Context;
import androidx.work.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.json.*;
import com.smartwallet.app.CloudSyncPlugin;
import static com.smartwallet.app.data.SyncDocument.*;

public final class CloudSync {
    public static final String API="https://152.32.147.55:8443/api/v1";
    public static final Object NETWORK_LOCK=new Object();
    private static volatile boolean syncing=false;
    private final Context context;
    private final WalletDatabase data;
    public CloudSync(Context context){this.context=context.getApplicationContext();this.data=WalletDatabase.get(context);}
    public static final class ApiException extends IOException {
        public final int status;public final String code;
        ApiException(int status,JSONObject response){super(response.optString("message","连接失败"));this.status=status;
            JSONObject details=response.optJSONObject("details");code=details==null?"":details.optString("code");}
    }
    public static void schedule(Context context,String account) {
        if(account.equals(WalletDatabase.LOCAL_ACCOUNT))return;
        Constraints constraints=new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        Data input=new Data.Builder().putString("account",account).build();
        WorkManager manager=WorkManager.getInstance(context);
        manager.enqueueUniqueWork("wallet-sync-"+account,ExistingWorkPolicy.KEEP,
            new OneTimeWorkRequest.Builder(SyncWorker.class).setInputData(input).setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,TimeUnit.SECONDS).build());
        manager.enqueueUniquePeriodicWork("wallet-periodic-"+account,ExistingPeriodicWorkPolicy.KEEP,
            new PeriodicWorkRequest.Builder(SyncWorker.class,15,TimeUnit.MINUTES).setInputData(input).setConstraints(constraints).build());
    }
    private JSONObject http(String method,String path,JSONObject body,String access) throws Exception {
        HttpURLConnection connection=(HttpURLConnection)new URL(API+path).openConnection();
        connection.setRequestMethod(method);connection.setConnectTimeout(15000);connection.setReadTimeout(30000);
        connection.setRequestProperty("Accept","application/json");
        if(access!=null)connection.setRequestProperty("Authorization","Bearer "+access);
        try {
            if(body!=null) {
                connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json; charset=utf-8");
                byte[] bytes=body.toString().getBytes(StandardCharsets.UTF_8);connection.setFixedLengthStreamingMode(bytes.length);
                try(OutputStream out=connection.getOutputStream()){out.write(bytes);}
            }
            int status=connection.getResponseCode();
            InputStream stream=status>=400?connection.getErrorStream():connection.getInputStream();
            if(stream==null)throw new IOException("服务器响应无效");
            String raw;
            try(InputStream in=stream;ByteArrayOutputStream out=new ByteArrayOutputStream()) {
                byte[] buffer=new byte[8192];int n;
                while((n=in.read(buffer))!=-1){if(out.size()>25*1024*1024)throw new IOException("响应过大");out.write(buffer,0,n);}
                raw=out.toString("UTF-8");
            }
            JSONObject result;
            try{result=new JSONObject(raw);}catch(JSONException e){throw new IOException("服务器响应无效");}
            if(status>=400)throw new ApiException(status,result);
            return result;
        }finally{connection.disconnect();}
    }
    public JSONObject ping() throws Exception {
        HttpURLConnection connection=(HttpURLConnection)new URL("https://152.32.147.55:8443/health").openConnection();
        connection.setConnectTimeout(15000);connection.setReadTimeout(15000);
        try {
            if(connection.getResponseCode()!=200)throw new IOException("服务器连接失败");
            try(InputStream in=connection.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()) {
                byte[] buffer=new byte[1024];int n;
                while((n=in.read(buffer))!=-1)out.write(buffer,0,n);
                JSONObject result=new JSONObject(out.toString("UTF-8"));
                if(!result.optBoolean("ok"))throw new IOException("服务器连接失败");
                return result;
            }
        } finally {connection.disconnect();}
    }
    private JSONObject request(String account,String method,String path,JSONObject body) throws Exception {
        JSONObject session=data.secure.session(account);
        if(session==null)throw new IOException("请重新登录");
        try{return http(method,path,body,session.optString("accessToken"));}
        catch(ApiException error) {
            if(error.status!=401)throw error;
            JSONObject refresh=new JSONObject();put(refresh,"refreshToken",session.optString("refreshToken"));
            JSONObject tokens=http("POST","/auth/refresh",refresh,null);
            put(session,"accessToken",tokens.optString("accessToken"));put(session,"refreshToken",tokens.optString("refreshToken"));
            data.secure.session(account,session);
            return http(method,path,body,session.optString("accessToken"));
        }
    }
    private JSONObject pull(String account,JSONObject base,long cursor,long epoch) throws Exception {
        JSONObject snapshot=copy(base);JSONObject page;
        do {
            page=request(account,"GET","/sync/pull?cursor="+cursor+(epoch==0?"":"&epoch="+epoch),null);
            epoch=page.optLong("epoch");cursor=page.optLong("nextCursor");
            snapshot=apply(snapshot,page.optJSONArray("changes"),false);
        }while(page.optBoolean("hasMore"));
        JSONObject result=new JSONObject();put(result,"snapshot",snapshot);put(result,"epoch",epoch);put(result,"cursor",cursor);
        return result;
    }
    public JSONObject status() {JSONObject status=data.status();put(status,"syncing",syncing);return status;}
    public JSONObject authenticate(String action,String username,String password,boolean migrate) throws Exception {
        synchronized(NETWORK_LOCK) {
            JSONObject credentials=new JSONObject();put(credentials,"username",username);put(credentials,"password",password);
            JSONObject session=http("POST","/auth/"+action,credentials,null);
            String account=session.optJSONObject("user").optString("id");
            data.secure.session(account,session);
            JSONObject cloud=pull(account,new JSONObject(),0,0);
            data.bind(session,cloud.optJSONObject("snapshot"),cloud.optLong("epoch"),cloud.optLong("cursor"),migrate);
            schedule(context,account);CloudSyncPlugin.changed();
            return status();
        }
    }
    public void logout() {
        synchronized(NETWORK_LOCK) {
            String account=data.activeAccount();
            try{request(account,"POST","/auth/logout",new JSONObject());}catch(Exception ignored){}
            data.secure.removeSession(account);
            WorkManager.getInstance(context).cancelUniqueWork("wallet-sync-"+account);
            WorkManager.getInstance(context).cancelUniqueWork("wallet-periodic-"+account);
            data.activate(WalletDatabase.LOCAL_ACCOUNT);CloudSyncPlugin.changed();
        }
    }
    public void password(String current,String next) throws Exception {
        synchronized(NETWORK_LOCK) {
            String account=data.activeAccount();JSONObject body=new JSONObject();
            put(body,"currentPassword",current);put(body,"newPassword",next);
            data.secure.session(account,request(account,"POST","/auth/password",body));
        }
    }
    public void sync(String account) throws Exception {
        synchronized(NETWORK_LOCK) {
            if(account.equals(WalletDatabase.LOCAL_ACCOUNT)||!account.equals(data.activeAccount())||data.secure.session(account)==null)return;
            if(data.number(account,"suspended")==1)throw new IOException("请先处理恢复副本");
            syncing=true;CloudSyncPlugin.changed(false);
            try {
                JSONObject unfinished=data.pendingRestore(account);
                if(unfinished!=null){
                    try { finishRestore(account,unfinished); }
                    catch(ApiException error) { if(error.status<500)data.pendingRestore(account,null);throw error; }
                    return;
                }
                while(data.pendingCount(account)>0) {
                    JSONArray operations=data.pending(account);JSONObject body=new JSONObject();
                    put(body,"deviceId",data.deviceId());put(body,"epoch",data.number(account,"epoch"));put(body,"operations",operations);
                    JSONObject response=request(account,"POST","/sync/push",body);
                    data.acknowledge(account,response.optJSONArray("acknowledged"));
                }
                long cursor=data.number(account,"cursor");
                JSONObject cloud=pull(account,data.cloudBase(account),cursor,cursor==0?0:data.number(account,"epoch"));
                data.receive(account,cloud.optJSONObject("snapshot"),cloud.optLong("epoch"),cloud.optLong("cursor"));
            } catch(Exception error) {
                if(error instanceof ApiException&&((ApiException)error).code.equals("EPOCH_CHANGED"))data.staleEpoch(account);
                else data.setError(account,error.getMessage()==null?"同步失败":error.getMessage());
                throw error;
            } finally {syncing=false;CloudSyncPlugin.changed();}
        }
    }
    public JSONObject prepareRestore() throws Exception {
        synchronized(NETWORK_LOCK) {
            String account=data.activeAccount();
            if(account.equals(WalletDatabase.LOCAL_ACCOUNT))throw new IOException("请先登录");
            sync(account);
            synchronized(data) {
                if(data.pendingCount(account)!=0)throw new IOException("请等待同步完成");
                data.backup(account,"覆盖导入前");
                JSONObject ticket=new JSONObject();put(ticket,"id",UUID.randomUUID().toString());
                put(ticket,"epoch",data.number(account,"epoch"));put(ticket,"revision",data.number(account,"cursor"));
                put(ticket,"localRevision",data.number(account,"local_revision"));put(ticket,"accountId",account);
                return ticket;
            }
        }
    }
    public void restore(JSONObject ticket,JSONObject backup) throws Exception {
        synchronized(NETWORK_LOCK) {
            String account=data.activeAccount();
            synchronized(data) {
                if(!ticket.optString("accountId").equals(account)||ticket.optLong("localRevision")!=data.number(account,"local_revision")||data.pendingCount(account)!=0)
                    throw new IOException("账本已更新，请重新确认");
                JSONObject request=copy(ticket);request.remove("localRevision");request.remove("accountId");put(request,"data",backup);
                data.pendingRestore(account,request);
            }
            try{finishRestore(account,data.pendingRestore(account));}
            catch(ApiException error) {
                if(error.status<500)data.pendingRestore(account,null);
                throw error;
            } finally{CloudSyncPlugin.changed();}
        }
    }
    private void finishRestore(String account,JSONObject request) throws Exception {
        request(account,"POST","/backup/restore",request);
        JSONObject cloud=pull(account,new JSONObject(),0,0);
        synchronized(data) {
            data.receive(account,cloud.optJSONObject("snapshot"),cloud.optLong("epoch"),cloud.optLong("cursor"));
            data.pendingRestore(account,null);
        }
    }
    public void resume() throws Exception {
        synchronized(NETWORK_LOCK) {
            String account=data.activeAccount();
            // 先验证网络并取得云端，再归档本地队列；断网时保留原状。
            JSONObject cloud=pull(account,new JSONObject(),0,0);
            synchronized(data) {
                data.resume(account);
                data.receive(account,cloud.optJSONObject("snapshot"),cloud.optLong("epoch"),cloud.optLong("cursor"));
            }
            CloudSyncPlugin.changed();schedule(context,account);
        }
    }
}
