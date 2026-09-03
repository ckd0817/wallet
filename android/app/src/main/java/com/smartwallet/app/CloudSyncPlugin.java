package com.smartwallet.app;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.smartwallet.app.data.*;
import org.json.JSONObject;
import java.lang.ref.WeakReference;
import java.util.concurrent.*;

@CapacitorPlugin(name="CloudSync")
public final class CloudSyncPlugin extends Plugin {
    private static WeakReference<CloudSyncPlugin> current=new WeakReference<>(null);
    private final ExecutorService executor=Executors.newSingleThreadExecutor();
    @Override public void load(){current=new WeakReference<>(this);}
    public static void changed() {
        changed(true);
    }
    public static void changed(boolean dataChanged) {
        CloudSyncPlugin plugin=current.get();
        if(plugin!=null) {
            JSObject payload=new JSObject();payload.put("dataChanged",dataChanged);
            plugin.notifyListeners("cloudChanged",payload);
        }
    }
    private CloudSync cloud(){return new CloudSync(getContext());}
    private interface Task {JSONObject run() throws Exception;}
    private void run(PluginCall call,Task task) {
        executor.execute(()->{
            try{call.resolve(JSObject.fromJSONObject(task.run()));}
            catch(Exception e){call.reject(e.getMessage()==null?"操作失败":e.getMessage());}
        });
    }
    @PluginMethod public void getStatus(PluginCall call){run(call,()->cloud().status());}
    @PluginMethod public void testConnection(PluginCall call){run(call,()->cloud().ping());}
    @PluginMethod public void authenticate(PluginCall call){run(call,()->{
        String action=call.getString("action","login");
        if(!action.equals("login")&&!action.equals("register"))throw new IllegalArgumentException("操作无效");
        return cloud().authenticate(action,call.getString("username",""),call.getString("password",""),call.getBoolean("migrateLocal",false));
    });}
    @PluginMethod public void syncNow(PluginCall call){run(call,()->{cloud().sync(WalletDatabase.get(getContext()).activeAccount());return cloud().status();});}
    @PluginMethod public void logout(PluginCall call){run(call,()->{cloud().logout();return cloud().status();});}
    @PluginMethod public void changePassword(PluginCall call){run(call,()->{
        cloud().password(call.getString("currentPassword",""),call.getString("newPassword",""));return cloud().status();
    });}
    @PluginMethod public void prepareRestore(PluginCall call){run(call,()->cloud().prepareRestore());}
    @PluginMethod public void restore(PluginCall call){run(call,()->{
        cloud().restore(call.getObject("ticket"),call.getObject("data"));return cloud().status();
    });}
    @PluginMethod public void getRecovery(PluginCall call){run(call,()->{
        WalletDatabase db=WalletDatabase.get(getContext());String account=db.activeAccount();
        if(db.number(account,"suspended")==1)db.backup(account,"导出恢复副本");
        return db.recovery(account);
    });}
    @PluginMethod public void resume(PluginCall call){run(call,()->{cloud().resume();return cloud().status();});}
}
