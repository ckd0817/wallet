package com.smartwallet.app.data;
import org.junit.Test;
import static org.junit.Assert.*;
import org.json.*;
import static com.smartwallet.app.data.SyncDocument.*;

public class SyncDocumentTest {
    private JSONObject tx(String id,int amount) throws Exception {
        return new JSONObject().put("id",id).put("amount",amount);
    }
    @Test public void stalePageDoesNotEraseBackgroundRecord() throws Exception {
        JSONObject base=new JSONObject().put("transactions",new JSONArray().put(tx("old",1)));
        JSONObject next=copy(base);next.getJSONArray("transactions").put(tx("manual",2));
        JSONObject live=copy(base);live.getJSONArray("transactions").put(tx("capture",3));
        JSONObject result=apply(live,diff(base,next),true);
        assertEquals(3,result.getJSONArray("transactions").length());
        assertTrue(records(result,"transactions").containsKey("capture"));
    }
    @Test public void deletedRecordIsRemovedAndKeysCompareWithoutOrder() throws Exception {
        assertTrue(equal(new JSONObject("{\"a\":1,\"b\":2}"),new JSONObject("{\"b\":2,\"a\":1.0}")));
        JSONObject base=new JSONObject().put("transactions",new JSONArray().put(tx("old",1)));
        JSONObject next=new JSONObject().put("transactions",new JSONArray());
        assertEquals(0,apply(base,diff(base,next),false).getJSONArray("transactions").length());
        assertEquals(0,withoutDeletions(diff(base,next)).length());
    }
    @Test public void duplicateIdsFailBeforePersistence() throws Exception {
        JSONObject bad=new JSONObject().put("transactions",new JSONArray().put(tx("same",1)).put(tx("same",2)));
        try{diff(new JSONObject(),bad);fail("应拒绝重复编号");}catch(IllegalArgumentException expected){}
    }
    @Test public void pendingPurchaseAddsToNewServerPosition() throws Exception {
        JSONObject before=new JSONObject("{\"assetHoldings\":[{\"id\":\"h\",\"shares\":10,\"costAmount\":100}],\"assetTradeRecords\":[]}");
        JSONObject after=new JSONObject("{\"assetHoldings\":[{\"id\":\"h\",\"shares\":12,\"costAmount\":120}],\"assetTradeRecords\":[{\"id\":\"t\",\"holdingId\":\"h\",\"shares\":2,\"amount\":20,\"tradeType\":\"buy\",\"status\":\"completed\"}]}");
        JSONObject cloud=new JSONObject("{\"assetHoldings\":[{\"id\":\"h\",\"shares\":20,\"costAmount\":200}],\"assetTradeRecords\":[]}");
        JSONObject op=new JSONObject().put("mode","mutate").put("changes",diff(before,after));
        JSONObject result=overlay(cloud,op);
        assertEquals(22,result.getJSONArray("assetHoldings").getJSONObject(0).getDouble("shares"),0.0001);
        assertEquals(220,result.getJSONArray("assetHoldings").getJSONObject(0).getDouble("costAmount"),0.0001);
        assertEquals(22,overlay(result,op).getJSONArray("assetHoldings").getJSONObject(0).getDouble("shares"),0.0001);
    }
}
