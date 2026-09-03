package com.smartwallet.app.data;

import android.content.*;
import android.database.Cursor;
import android.database.sqlite.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.UUID;
import org.json.*;
import static com.smartwallet.app.data.SyncDocument.*;

public final class WalletDatabase extends SQLiteOpenHelper {
    public static final String LOCAL_ACCOUNT="local";
    private static WalletDatabase instance;
    private final Context context;
    public final SecureStore secure;
    public static synchronized WalletDatabase get(Context context) {
        if(instance==null)instance=new WalletDatabase(context.getApplicationContext());
        return instance;
    }
    private WalletDatabase(Context context) {
        super(context,"wallet-v2.db",null,1,db -> {
            throw new SQLiteException("本机数据库损坏，原文件已保留");
        });
        this.context=context;this.secure=new SecureStore(context);
        setWriteAheadLoggingEnabled(true);
    }
    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE accounts(account TEXT PRIMARY KEY, username TEXT NOT NULL DEFAULT '', document TEXT NOT NULL, cloud_base TEXT NOT NULL DEFAULT '{}', local_revision INTEGER NOT NULL DEFAULT 1, epoch INTEGER NOT NULL DEFAULT 1, cursor INTEGER NOT NULL DEFAULT 0, last_sync INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '', suspended INTEGER NOT NULL DEFAULT 0)");
        db.execSQL("CREATE TABLE outbox(seq INTEGER PRIMARY KEY AUTOINCREMENT, account TEXT NOT NULL, id TEXT NOT NULL UNIQUE, payload TEXT NOT NULL)");
        db.execSQL("CREATE INDEX outbox_account ON outbox(account,seq)");
        db.execSQL("CREATE TABLE snapshots(account TEXT NOT NULL, revision INTEGER NOT NULL, document TEXT NOT NULL, PRIMARY KEY(account,revision))");
        db.execSQL("CREATE TABLE recovery(id INTEGER PRIMARY KEY AUTOINCREMENT, account TEXT NOT NULL, reason TEXT NOT NULL, encrypted_data TEXT NOT NULL, created_at INTEGER NOT NULL)");
        db.execSQL("CREATE TABLE requests(account TEXT PRIMARY KEY, payload TEXT NOT NULL)");
    }
    @Override public void onUpgrade(SQLiteDatabase db,int oldVersion,int newVersion) { throw new IllegalStateException("数据库版本不受支持"); }
    private SharedPreferences preferences() {return context.getSharedPreferences("cloud-state",Context.MODE_PRIVATE);}
    public String activeAccount() {return preferences().getString("activeAccount",LOCAL_ACCOUNT);}
    public String deviceId() {
        String id=preferences().getString("deviceId",null);
        if(id==null){id=UUID.randomUUID().toString();preferences().edit().putString("deviceId",id).commit();}
        return id;
    }
    public synchronized void activate(String account) {
        ensure(account);
        if(!preferences().edit().putString("activeAccount",account).commit())throw new IllegalStateException("账户切换失败");
    }
    private boolean exists(String account) {
        try(Cursor c=getReadableDatabase().rawQuery("SELECT 1 FROM accounts WHERE account=?",new String[]{account})) {return c.moveToFirst();}
    }
    public synchronized void ensure(String account) {
        if(exists(account))return;
        JSONObject snapshot=WalletDefaults.defaultStore();
        File old=new File(context.getFilesDir(),"wallet-store.json");
        if(account.equals(LOCAL_ACCOUNT)&&old.exists()&&!preferences().getBoolean("legacyMigrated",false)) {
            try {
                String text=new String(Files.readAllBytes(old.toPath()),StandardCharsets.UTF_8);
                snapshot=new JSONObject(text);
                for(String kind:KINDS) records(snapshot,kind);
                File backup=new File(context.getNoBackupFilesDir(),"wallet-before-v2.enc");
                if(!backup.exists())try(FileOutputStream out=new FileOutputStream(backup)) {
                    out.write(secure.encrypt(text).getBytes(StandardCharsets.UTF_8));out.getFD().sync();
                }
            }catch(Exception e){throw new IllegalStateException("原数据迁移失败，原文件已保留",e);}
        }
        put(snapshot,"storeVersion",2);put(snapshot,"migratedFromWebStorage",true);
        SQLiteDatabase db=getWritableDatabase();db.beginTransaction();
        try {
            ContentValues values=new ContentValues();values.put("account",account);values.put("document",secure.encode(snapshot));
            db.insertOrThrow("accounts",null,values);
            snapshotRecord(db,account,1,snapshot);
            JSONObject saved=readDocument(db,account);
            if(!equal(snapshot,saved))throw new IllegalStateException("迁移数据校验失败");
            db.setTransactionSuccessful();
        }finally{db.endTransaction();}
        if(account.equals(LOCAL_ACCOUNT))preferences().edit().putBoolean("legacyMigrated",true).commit();
    }
    private JSONObject readDocument(SQLiteDatabase db,String account) {
        try(Cursor c=db.rawQuery("SELECT document FROM accounts WHERE account=?",new String[]{account})) {
            if(!c.moveToFirst())throw new IllegalStateException("本地账户不存在");
            return secure.decode(c.getString(0));
        }
    }
    public synchronized JSONObject load(String account) {
        ensure(account);JSONObject value=readDocument(getReadableDatabase(),account);
        put(value,"localRevision",number(account,"local_revision"));put(value,"cloudAccountId",account);
        return value;
    }
    public synchronized long number(String account,String field) {
        if(!java.util.Arrays.asList("epoch","cursor","local_revision","last_sync","suspended").contains(field))throw new IllegalArgumentException();
        try(Cursor c=getReadableDatabase().rawQuery("SELECT "+field+" FROM accounts WHERE account=?",new String[]{account})) {
            if(!c.moveToFirst())return 0;return c.getLong(0);
        }
    }
    private void snapshotRecord(SQLiteDatabase db,String account,long revision,JSONObject document) {
        ContentValues v=new ContentValues();v.put("account",account);v.put("revision",revision);v.put("document",secure.encode(document));
        db.insertOrThrow("snapshots",null,v);
        db.delete("snapshots","account=? AND revision<?",new String[]{account,String.valueOf(revision-100)});
    }
    private void write(SQLiteDatabase db,String account,JSONObject document) {
        JSONObject clean=copy(document);clean.remove("localRevision");clean.remove("cloudAccountId");
        put(clean,"storeVersion",2);put(clean,"migratedFromWebStorage",true);
        long revision=number(account,"local_revision")+1;
        ContentValues v=new ContentValues();v.put("document",secure.encode(clean));v.put("local_revision",revision);
        db.update("accounts",v,"account=?",new String[]{account});snapshotRecord(db,account,revision,clean);
    }
    private JSONObject revisionDocument(String account,long revision) {
        try(Cursor c=getReadableDatabase().rawQuery("SELECT document FROM snapshots WHERE account=? AND revision=?",new String[]{account,String.valueOf(revision)})) {
            if(!c.moveToFirst())throw new IllegalStateException("数据已更新，请重新打开页面");
            return secure.decode(c.getString(0));
        }
    }
    private void enqueue(SQLiteDatabase db,String account,JSONArray changes,String mode) {
        if(account.equals(LOCAL_ACCOUNT)||changes.length()==0)return;
        JSONObject operation=new JSONObject();put(operation,"id",UUID.randomUUID().toString());put(operation,"mode",mode);put(operation,"changes",changes);
        ContentValues v=new ContentValues();v.put("account",account);v.put("id",operation.optString("id"));v.put("payload",secure.encode(operation));
        db.insertOrThrow("outbox",null,v);
    }
    public synchronized JSONObject save(String account,JSONObject candidate,String mode) {
        return save(account,candidate,mode,false);
    }
    public synchronized JSONObject save(String account,JSONObject candidate,String mode,boolean allowDeletes) {
        ensure(account);
        if(pendingRestore(account)!=null)throw new IllegalStateException("恢复尚未完成，请先同步");
        if(candidate.has("cloudAccountId")&&!candidate.optString("cloudAccountId").equals(account))throw new IllegalStateException("账户已切换");
        SQLiteDatabase db=getWritableDatabase();db.beginTransaction();
        try {
            JSONObject current=readDocument(db,account);
            JSONObject base=candidate.has("localRevision")?revisionDocument(account,candidate.optLong("localRevision")):current;
            JSONArray changed=diff(base,candidate);
            // 页面级快照可能在账户切换或异步行情返回时过期。云端删除只能走明确的记录删除入口。
            if(!allowDeletes&&!account.equals(LOCAL_ACCOUNT))changed=withoutDeletions(changed);
            JSONObject merged=apply(current,changed,true);
            for(String key:LOCAL)if(candidate.has(key)&&!equal(base.opt(key),candidate.opt(key)))put(merged,key,candidate.opt(key));
            enqueue(db,account,diff(current,merged),mode);
            write(db,account,merged);db.setTransactionSuccessful();
        }finally{db.endTransaction();}
        CloudSync.schedule(context,account);
        com.smartwallet.app.CloudSyncPlugin.changed(false);
        return load(account);
    }
    public synchronized JSONArray pending(String account) {
        JSONArray result=new JSONArray();
        try(Cursor c=getReadableDatabase().rawQuery("SELECT payload FROM outbox WHERE account=? ORDER BY seq LIMIT 100",new String[]{account})) {
            while(c.moveToNext())result.put(secure.decode(c.getString(0)));
        }
        return result;
    }
    public synchronized int pendingCount(String account) {
        try(Cursor c=getReadableDatabase().rawQuery("SELECT count(*) FROM outbox WHERE account=?",new String[]{account})) {c.moveToFirst();return c.getInt(0);}
    }
    public synchronized JSONObject cloudBase(String account) {
        try(Cursor c=getReadableDatabase().rawQuery("SELECT cloud_base FROM accounts WHERE account=?",new String[]{account})) {
            if(!c.moveToFirst())throw new IllegalStateException("账户不存在");return secure.decode(c.getString(0));
        }
    }
    public synchronized void acknowledge(String account,JSONArray ids) {
        SQLiteDatabase db=getWritableDatabase();db.beginTransaction();
        try {for(int i=0;i<ids.length();i++)db.delete("outbox","account=? AND id=?",new String[]{account,ids.optString(i)});db.setTransactionSuccessful();}
        finally{db.endTransaction();}
    }
    public synchronized void receive(String account,JSONObject cloud,long epoch,long cursor) {
        SQLiteDatabase db=getWritableDatabase();db.beginTransaction();
        try {
            JSONObject local=readDocument(db,account),view=copy(cloud);
            try(Cursor c=db.rawQuery("SELECT payload FROM outbox WHERE account=? ORDER BY seq",new String[]{account})) {
                while(c.moveToNext())view=overlay(view,secure.decode(c.getString(0)));
            }
            view=WalletDefaults.ensureDefaults(view);
            for(String key:LOCAL)if(local.has(key))put(view,key,local.opt(key));
            ContentValues v=new ContentValues();v.put("cloud_base",secure.encode(cloud));v.put("epoch",epoch);v.put("cursor",cursor);
            v.put("last_sync",System.currentTimeMillis());v.put("error","");
            db.update("accounts",v,"account=?",new String[]{account});
            write(db,account,view);db.setTransactionSuccessful();
        }finally{db.endTransaction();}
    }
    public synchronized void setError(String account,String error) {
        ContentValues v=new ContentValues();v.put("error",error);
        getWritableDatabase().update("accounts",v,"account=?",new String[]{account});
    }
    public synchronized long backup(String account,String reason) {
        SQLiteDatabase db=getWritableDatabase();
        JSONObject data=load(account);
        JSONArray operations=new JSONArray();
        try(Cursor c=db.rawQuery("SELECT payload FROM outbox WHERE account=? ORDER BY seq",new String[]{account})) {
            while(c.moveToNext())operations.put(secure.decode(c.getString(0)));
        }
        put(data,"pendingOperations",operations);
        ContentValues v=new ContentValues();v.put("account",account);v.put("reason",reason);v.put("encrypted_data",secure.encrypt(data.toString()));v.put("created_at",System.currentTimeMillis());
        return db.insertOrThrow("recovery",null,v);
    }
    public synchronized void staleEpoch(String account) {
        SQLiteDatabase db=getWritableDatabase();db.beginTransaction();
        try {
            backup(account,"云端恢复前未同步数据");
            ContentValues v=new ContentValues();v.put("suspended",1);v.put("error","云端账本已恢复");
            db.update("accounts",v,"account=?",new String[]{account});
            db.setTransactionSuccessful();
        }finally{db.endTransaction();}
    }
    public synchronized JSONObject recovery(String account) {
        try(Cursor c=getReadableDatabase().rawQuery("SELECT encrypted_data FROM recovery WHERE account=? ORDER BY id DESC LIMIT 1",new String[]{account})) {
            if(!c.moveToFirst())throw new IllegalStateException("没有恢复副本");
            try{return new JSONObject(secure.decrypt(c.getString(0)));}catch(JSONException e){throw new IllegalStateException(e);}
        }
    }
    public synchronized void resume(String account) {
        SQLiteDatabase db=getWritableDatabase();db.beginTransaction();
        try {
            backup(account,"恢复同步前本机数据");
            db.delete("outbox","account=?",new String[]{account});
            db.delete("requests","account=?",new String[]{account});
            ContentValues v=new ContentValues();v.put("suspended",0);v.put("cursor",0);v.put("cloud_base","{}");v.put("epoch",1);v.put("error","");
            db.update("accounts",v,"account=?",new String[]{account});db.setTransactionSuccessful();
        }finally{db.endTransaction();}
    }
    public synchronized JSONObject status() {
        String account=activeAccount();ensure(account);JSONObject result=new JSONObject();put(result,"accountId",account);
        put(result,"pendingCount",pendingCount(account));put(result,"lastSyncAt",number(account,"last_sync"));
        put(result,"recoveryRequired",number(account,"suspended")==1);
        try(Cursor c=getReadableDatabase().rawQuery("SELECT 1 FROM recovery WHERE account=? LIMIT 1",new String[]{account})) {
            put(result,"hasRecovery",c.moveToFirst());
        }
        try(Cursor c=getReadableDatabase().rawQuery("SELECT username,error FROM accounts WHERE account=?",new String[]{account})) {
            c.moveToFirst();put(result,"username",c.getString(0));put(result,"error",c.getString(1));
        }
        put(result,"loggedIn",!account.equals(LOCAL_ACCOUNT)&&secure.session(account)!=null);
        put(result,"hasLocalData",hasLocalData());
        return result;
    }
    public synchronized boolean hasLocalData() {
        ensure(LOCAL_ACCOUNT);JSONObject local=load(LOCAL_ACCOUNT);
        for(String kind:new String[]{"transactions","assetHoldings","recurringProfiles","assetTradeRecords"})
            if(local.optJSONArray(kind)!=null&&local.optJSONArray(kind).length()>0)return true;
        return !preferences().getBoolean("localClaimed",false) &&
            (!equal(local.optJSONArray("categories"),WalletDefaults.defaultStore().optJSONArray("categories")) ||
             (local.optJSONObject("llmConfig")!=null&&!local.optJSONObject("llmConfig").optString("apiKey").isEmpty()));
    }
    public synchronized void bind(JSONObject session,JSONObject cloud,long epoch,long cursor,boolean migrateLocal) {
        String account=session.optJSONObject("user").optString("id");
        ensure(account);ensure(LOCAL_ACCOUNT);
        SQLiteDatabase db=getWritableDatabase();db.beginTransaction();
        try {
            JSONObject old=load(LOCAL_ACCOUNT);
            ContentValues v=new ContentValues();v.put("username",session.optJSONObject("user").optString("username"));
            db.update("accounts",v,"account=?",new String[]{account});
            if(migrateLocal&&!preferences().getBoolean("localClaimed",false)) {
                backup(LOCAL_ACCOUNT,"关联账户前");
                JSONObject merged=copy(old);
                // 已有云端记录优先；整批 seed 将当前持仓视作基线。
                JSONArray missing=new JSONArray();JSONArray all=diff(new JSONObject(),cloudOnly(old));
                for(int i=0;i<all.length();i++) {
                    JSONObject c=all.optJSONObject(i);
                    if(!records(cloud,c.optString("kind")).containsKey(c.optString("id")))missing.put(c);
                }
                enqueue(db,account,missing,"seed");
                for(String key:LOCAL)if(old.has(key))put(merged,key,old.opt(key));
                write(db,account,merged);
                write(db,LOCAL_ACCOUNT,WalletDefaults.defaultStore());
            }
            receive(account,cloud,epoch,cursor);db.setTransactionSuccessful();
        }finally{db.endTransaction();}
        secure.session(account,session);
        if(migrateLocal)preferences().edit().putBoolean("localClaimed",true).commit();
        activate(account);
    }
    public synchronized void pendingRestore(String account,JSONObject request) {
        if(request==null){getWritableDatabase().delete("requests","account=?",new String[]{account});return;}
        ContentValues v=new ContentValues();v.put("account",account);v.put("payload",secure.encode(request));
        getWritableDatabase().insertWithOnConflict("requests",null,v,SQLiteDatabase.CONFLICT_REPLACE);
    }
    public synchronized JSONObject pendingRestore(String account) {
        try(Cursor c=getReadableDatabase().rawQuery("SELECT payload FROM requests WHERE account=?",new String[]{account})) {
            return c.moveToFirst()?secure.decode(c.getString(0)):null;
        }
    }
}
