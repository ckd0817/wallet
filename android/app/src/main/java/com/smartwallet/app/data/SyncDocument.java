package com.smartwallet.app.data;

import java.util.*;
import org.json.*;

/** 协议与展示快照的转换，旧格式仅在数据库首次迁移时读取。 */
public final class SyncDocument {
    public static final String[] KINDS = {"transactions","categories","recurringProfiles","assetHoldings",
        "assetRecurringPlans","assetPerformanceHistory","assetTradeRecords","appSettings","llmConfig"};
    public static final String[] LOCAL = {"captureLogs","assetQuoteCache","autoBookkeepingSettings"};
    public static JSONObject copy(JSONObject value) {
        try { return new JSONObject(value.toString()); } catch(Exception e) { throw new IllegalArgumentException(e); }
    }
    public static void put(JSONObject value, String key, Object child) {
        try { value.put(key, child == null ? JSONObject.NULL : child); } catch(JSONException e) { throw new IllegalArgumentException(e); }
    }
    public static String id(String kind, JSONObject value) {
        return kind.equals("assetPerformanceHistory") ? value.optString("date") : value.optString("id");
    }
    public static boolean singleton(String kind) { return kind.equals("appSettings") || kind.equals("llmConfig"); }
    public static Map<String,JSONObject> records(JSONObject snapshot,String kind) {
        Map<String,JSONObject> result=new LinkedHashMap<>();
        if(singleton(kind)) {
            if(snapshot.optJSONObject(kind)!=null) result.put("singleton",snapshot.optJSONObject(kind));
        } else {
            JSONArray values=snapshot.optJSONArray(kind);
            if(values!=null) for(int i=0;i<values.length();i++) {
                JSONObject value=values.optJSONObject(i);
                if(value==null || id(kind,value).isEmpty()) throw new IllegalArgumentException("记录编号缺失");
                if(result.put(id(kind,value),value)!=null) throw new IllegalArgumentException("记录编号重复");
            }
        }
        return result;
    }
    public static boolean equal(Object a,Object b) {
        if(a==b) return true;
        if(a==null || b==null) return false;
        if(a instanceof JSONObject && b instanceof JSONObject) {
            JSONObject x=(JSONObject)a,y=(JSONObject)b;
            if(x.length()!=y.length()) return false;
            Iterator<String> keys=x.keys();
            while(keys.hasNext()) { String k=keys.next(); if(!y.has(k)||!equal(x.opt(k),y.opt(k)))return false; }
            return true;
        }
        if(a instanceof JSONArray && b instanceof JSONArray) {
            JSONArray x=(JSONArray)a,y=(JSONArray)b;
            if(x.length()!=y.length())return false;
            for(int i=0;i<x.length();i++)if(!equal(x.opt(i),y.opt(i)))return false;
            return true;
        }
        if(a instanceof Number && b instanceof Number) return Double.compare(((Number)a).doubleValue(),((Number)b).doubleValue())==0;
        return a.equals(b);
    }
    public static JSONArray diff(JSONObject base,JSONObject next) {
        JSONArray changes=new JSONArray();
        for(String kind:KINDS) {
            Map<String,JSONObject> before=records(base,kind),after=records(next,kind);
            Set<String> ids=new LinkedHashSet<>(before.keySet());ids.addAll(after.keySet());
            for(String id:ids) {
                JSONObject old=before.get(id),value=after.get(id);
                if(equal(old,value))continue;
                JSONObject change=new JSONObject();
                put(change,"kind",kind);put(change,"id",id);put(change,"value",value);
                JSONArray fields=new JSONArray();
                Set<String> keys=new LinkedHashSet<>();
                if(old!=null)old.keys().forEachRemaining(keys::add);
                if(value!=null)value.keys().forEachRemaining(keys::add);
                for(String k:keys)if(!equal(old==null?null:old.opt(k),value==null?null:value.opt(k)))fields.put(k);
                put(change,"fields",fields);changes.put(change);
            }
        }
        return changes;
    }
    public static JSONArray withoutDeletions(JSONArray changes) {
        JSONArray result=new JSONArray();
        for(int i=0;i<changes.length();i++) {
            JSONObject change=changes.optJSONObject(i);
            if(change!=null&&change.optJSONObject("value")!=null)result.put(change);
        }
        return result;
    }
    public static JSONObject apply(JSONObject source,JSONArray changes,boolean fieldMerge) {
        JSONObject result=copy(source);
        for(int i=0;i<changes.length();i++) {
            JSONObject c=changes.optJSONObject(i);String kind=c.optString("kind"),id=c.optString("id");
            JSONObject value=c.optJSONObject("value");
            Map<String,JSONObject> values=records(result,kind);
            if(value!=null && fieldMerge && values.containsKey(id) && c.optJSONArray("fields")!=null) {
                JSONObject merged=copy(values.get(id));JSONArray fields=c.optJSONArray("fields");
                for(int f=0;f<fields.length();f++) {
                    String key=fields.optString(f);
                    if(value.has(key))put(merged,key,value.opt(key));else merged.remove(key);
                }
                value=merged;
            }
            if(value==null)values.remove(id);else values.put(id,copy(value));
            if(singleton(kind)) put(result,kind,value==null?new JSONObject():value);
            else {
                JSONArray array=new JSONArray();
                for(JSONObject item:values.values())array.put(item);
                put(result,kind,array);
            }
        }
        return result;
    }
    public static JSONObject cloudOnly(JSONObject snapshot) {
        JSONObject out=new JSONObject();
        for(String kind:KINDS)if(snapshot.has(kind))put(out,kind,snapshot.opt(kind));
        return out;
    }
    public static JSONObject overlay(JSONObject source, JSONObject operation) {
        JSONArray changes=operation.optJSONArray("changes");
        if(changes==null)return source;
        if(!operation.optString("mode","mutate").equals("mutate")) {
            JSONArray missing=new JSONArray();
            for(int i=0;i<changes.length();i++) {
                JSONObject c=changes.optJSONObject(i);
                if(!records(source,c.optString("kind")).containsKey(c.optString("id")))missing.put(c);
            }
            return apply(source,missing,false);
        }
        JSONObject result=copy(source);
        Set<String> traded=new HashSet<>();
        for(int i=0;i<changes.length();i++) {
            JSONObject c=changes.optJSONObject(i),value=c.optJSONObject("value");
            if(c.optString("kind").equals("assetTradeRecords")&&value!=null)traded.add(value.optString("holdingId"));
        }
        JSONArray baseChanges=new JSONArray(),tradeChanges=new JSONArray();
        for(int i=0;i<changes.length();i++) {
            JSONObject c=copy(changes.optJSONObject(i)),value=c.optJSONObject("value");
            if(c.optString("kind").equals("assetTradeRecords")) {tradeChanges.put(c);continue;}
            if(c.optString("kind").equals("assetHoldings")&&traded.contains(c.optString("id"))&&value!=null) {
                JSONObject old=records(source,"assetHoldings").get(c.optString("id"));
                if(old!=null){put(value,"shares",old.optDouble("shares"));put(value,"costAmount",old.optDouble("costAmount"));}
            }
            baseChanges.put(c);
        }
        result=apply(result,baseChanges,true);
        for(int i=0;i<tradeChanges.length();i++) {
            JSONObject c=tradeChanges.optJSONObject(i),t=c.optJSONObject("value");
            JSONObject old=records(result,"assetTradeRecords").get(c.optString("id"));
            if(old!=null&&!old.optString("status","completed").equals("pending"))continue;
            if(t!=null&&!t.optString("status","completed").equals("pending")) {
                JSONObject h=records(result,"assetHoldings").get(t.optString("holdingId"));
                if(h!=null) {
                    h=copy(h);double shares=h.optDouble("shares"),cost=h.optDouble("costAmount"),quantity=t.optDouble("shares");
                    if(t.optString("tradeType").equals("sell")) {
                        put(h,"shares",Math.max(0,shares-quantity));
                        put(h,"costAmount",Math.max(0,cost-(shares>0?quantity*cost/shares:0)));
                    }else{put(h,"shares",shares+quantity);put(h,"costAmount",cost+t.optDouble("amount"));}
                    JSONObject hc=new JSONObject();put(hc,"kind","assetHoldings");put(hc,"id",h.optString("id"));put(hc,"value",h);
                    result=apply(result,new JSONArray().put(hc),false);
                }
            }
            result=apply(result,new JSONArray().put(c),false);
        }
        return result;
    }
}
