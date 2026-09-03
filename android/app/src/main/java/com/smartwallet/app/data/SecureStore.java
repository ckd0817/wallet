package com.smartwallet.app.data;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Iterator;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONArray;
import org.json.JSONObject;

public final class SecureStore {
    private static final String ALIAS = "smartwallet-cloud-v1";
    private final Context context;
    public SecureStore(Context context) { this.context = context.getApplicationContext(); }
    private synchronized SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(ALIAS, null);
    }
    public String encrypt(String plain) {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            byte[] encrypted = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            return "enc1:" + Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(encrypted, Base64.NO_WRAP);
        } catch (Exception e) { throw new IllegalStateException("加密失败", e); }
    }
    public String decrypt(String encrypted) {
        try {
            String[] parts = encrypted.split(":", 3);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[1], Base64.NO_WRAP)));
            return new String(cipher.doFinal(Base64.decode(parts[2], Base64.NO_WRAP)), StandardCharsets.UTF_8);
        } catch (Exception e) { throw new IllegalStateException("解密失败", e); }
    }
    public void session(String account, JSONObject value) {
        boolean ok = context.getSharedPreferences("cloud-secrets", Context.MODE_PRIVATE).edit()
            .putString(account, encrypt(value.toString())).commit();
        if (!ok) throw new IllegalStateException("登录状态保存失败");
    }
    public JSONObject session(String account) {
        String raw = context.getSharedPreferences("cloud-secrets", Context.MODE_PRIVATE).getString(account, null);
        try { return raw == null ? null : new JSONObject(decrypt(raw)); }
        catch (Exception e) { throw new IllegalStateException("登录状态读取失败", e); }
    }
    public void removeSession(String account) {
        context.getSharedPreferences("cloud-secrets", Context.MODE_PRIVATE).edit().remove(account).commit();
    }
    // 账本主体保留可读 JSON 供 Debug 排查，仅模型密钥加密；恢复副本整体加密。
    public String encode(JSONObject value) { return transform(value, true).toString(); }
    public JSONObject decode(String value) {
        try { return (JSONObject) transform(new JSONObject(value), false); }
        catch (Exception e) { throw new IllegalStateException("数据读取失败", e); }
    }
    private Object transform(Object value, boolean encrypt) {
        try {
            if (value instanceof JSONObject) {
                JSONObject out = new JSONObject();
                Iterator<String> keys = ((JSONObject)value).keys();
                while (keys.hasNext()) {
                    String name = keys.next(); Object child = ((JSONObject)value).get(name);
                    if (name.equals("apiKey") && child instanceof String && !((String)child).isEmpty()) {
                        child = encrypt ? encrypt((String)child) : decrypt((String)child);
                    } else child = transform(child, encrypt);
                    out.put(name, child);
                }
                return out;
            }
            if (value instanceof JSONArray) {
                JSONArray out = new JSONArray();
                for (int i=0;i<((JSONArray)value).length();i++) out.put(transform(((JSONArray)value).get(i),encrypt));
                return out;
            }
            return value;
        } catch (Exception e) { throw new IllegalStateException("数据加密处理失败", e); }
    }
}
