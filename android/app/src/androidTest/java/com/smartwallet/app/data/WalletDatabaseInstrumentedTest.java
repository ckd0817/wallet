package com.smartwallet.app.data;
import android.content.Context;
import android.database.Cursor;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.*;
import org.junit.runner.RunWith;
import org.json.*;
import java.nio.file.Files;
import java.io.File;
import java.util.UUID;
import static org.junit.Assert.*;
import static com.smartwallet.app.data.SyncDocument.*;

@RunWith(AndroidJUnit4.class)
public class WalletDatabaseInstrumentedTest {
    private WalletDatabase data;private String account;private String previous;
    @Before public void setup(){
        data=WalletDatabase.get(ApplicationProvider.getApplicationContext());previous=data.activeAccount();
        account="instrument-"+UUID.randomUUID();data.ensure(account);
    }
    @After public void cleanup(){
        data.activate(previous);
        androidx.work.WorkManager.getInstance(ApplicationProvider.getApplicationContext()).cancelUniqueWork("wallet-sync-"+account);
        androidx.work.WorkManager.getInstance(ApplicationProvider.getApplicationContext()).cancelUniqueWork("wallet-periodic-"+account);
        for(String table:new String[]{"accounts","outbox","snapshots","recovery","requests"})data.getWritableDatabase().delete(table,"account=?",new String[]{account});
    }
    private JSONObject tx(String id) throws Exception{
        return new JSONObject().put("id",id).put("amount",8).put("type","expense").put("categoryId","food").put("date","2026-09-04").put("note","");
    }
    @Test public void writeAndOutboxAreAtomicAndSurviveRead() throws Exception{
        JSONObject base=data.load(account),next=copy(base);
        next.getJSONArray("transactions").put(tx("a"));
        data.save(account,next,"mutate");
        assertEquals(1,data.pendingCount(account));assertEquals(1,data.load(account).getJSONArray("transactions").length());
        JSONObject bad=data.load(account);bad.getJSONArray("transactions").put(tx("a"));
        try{data.save(account,bad,"mutate");fail();}catch(IllegalArgumentException expected){}
        assertEquals(1,data.pendingCount(account));assertEquals(1,data.load(account).getJSONArray("transactions").length());
        JSONObject older=copy(base);older.getJSONArray("transactions").put(tx("b"));
        data.save(account,older,"mutate");
        assertEquals(2,data.pendingCount(account));assertEquals(2,data.load(account).getJSONArray("transactions").length());
    }
    @Test public void incomingDataRetainsPendingAndEncryptsModelKey() throws Exception{
        JSONObject local=data.load(account);local.getJSONArray("transactions").put(tx("offline"));
        local.getJSONObject("llmConfig").put("apiKey","instrument-secret");
        data.save(account,local,"mutate");
        JSONObject cloud=cloudOnly(WalletDefaults.defaultStore());cloud.getJSONArray("transactions").put(tx("remote"));
        data.receive(account,cloud,1,15);
        assertEquals(2,data.load(account).getJSONArray("transactions").length());
        assertEquals("instrument-secret",data.load(account).getJSONObject("llmConfig").getString("apiKey"));
        try(Cursor c=data.getReadableDatabase().rawQuery("SELECT document FROM accounts WHERE account=?",new String[]{account})){
            c.moveToFirst();assertFalse(c.getString(0).contains("instrument-secret"));
        }
        data.staleEpoch(account);assertEquals(1,data.number(account,"suspended"));
        assertEquals(2,data.recovery(account).getJSONArray("transactions").length());
    }
    @Test public void existingJsonCollectionsArePreserved() throws Exception{
        Context context=ApplicationProvider.getApplicationContext();
        File old=new File(context.getFilesDir(),"wallet-store.json");
        if(!old.exists())return;
        JSONObject source=new JSONObject(new String(Files.readAllBytes(old.toPath()),java.nio.charset.StandardCharsets.UTF_8));
        JSONObject migrated=data.load(WalletDatabase.LOCAL_ACCOUNT);
        if(!equal(source.opt("transactions"),migrated.opt("transactions"))) {
            try{migrated=data.recovery(WalletDatabase.LOCAL_ACCOUNT);}catch(IllegalStateException ignored){}
        }
        for(String kind:KINDS)assertTrue("迁移字段 "+kind,equal(source.opt(kind),migrated.opt(kind)));
        for(String kind:new String[]{"captureLogs","assetQuoteCache"})
            assertTrue("迁移字段 "+kind,equal(source.opt(kind),migrated.opt(kind)));
    }
    @Test public void pageSnapshotCannotDeleteCloudRecordWithoutExplicitDelete() throws Exception{
        JSONObject withRecord=data.load(account);withRecord.getJSONArray("transactions").put(tx("kept"));
        data.save(account,withRecord,"mutate");
        JSONObject stale=data.load(account);stale.put("transactions",new JSONArray());
        data.save(account,stale,"mutate");
        assertTrue(records(data.load(account),"transactions").containsKey("kept"));
        data.save(account,stale,"mutate",true);
        assertFalse(records(data.load(account),"transactions").containsKey("kept"));
    }
    @Test public void capturedRepositoryRemainsBoundAcrossAccountSwitch() throws Exception{
        Context context=ApplicationProvider.getApplicationContext();
        data.activate(account);WalletRepository captured=WalletRepository.getInstance(context);
        data.activate(previous);captured.upsertTransaction(tx("capture-bound"));
        assertTrue(records(data.load(account),"transactions").containsKey("capture-bound"));
        assertFalse(records(data.load(previous),"transactions").containsKey("capture-bound"));
    }
}
