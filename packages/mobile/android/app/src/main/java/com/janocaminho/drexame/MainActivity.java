package com.janocaminho.drexame;

import android.os.Build;
import android.os.Bundle;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKeys;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    private static final String SECURE_PREFS = "dx_secure_bio";
    private static final String BIO_EVENT = "dx:biometric-result";
    private boolean biometricBridgeInjected = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannel();
        injectBiometricBridge();
    }

    private void injectBiometricBridge() {
        if (biometricBridgeInjected || bridge == null || bridge.getWebView() == null) return;
        WebView webView = bridge.getWebView();
        webView.addJavascriptInterface(new BiometricBridge(), "DxBiometrics");
        biometricBridgeInjected = true;
    }

    @Override
    public void onStart() {
        super.onStart();
        injectBiometricBridge(); // re-injeta se o WebView foi recriado
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel("meus-exames", "Meus Exames", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Notificacoes de saude");
            channel.enableVibration(true);
            channel.enableLights(true);
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            manager.createNotificationChannel(channel);
        }
    }

    // --- Storage seguro (Keystore-backed) ---
    private SharedPreferences getSecurePrefs() {
        try {
            String masterKey = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC);
            return EncryptedSharedPreferences.create(
                SECURE_PREFS, masterKey, this,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            );
        } catch (Exception e) {
            Log.w("DX_BIO", "Storage seguro falhou, usando fallback", e);
            return getSharedPreferences(SECURE_PREFS, MODE_PRIVATE);
        }
    }

    private boolean isBioAvailable() {
        try {
            int r = BiometricManager.from(this).canAuthenticate(
                BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL
            );
            return r == BiometricManager.BIOMETRIC_SUCCESS;
        } catch (Exception e) { return false; }
    }

    private void dispatchBioResult(String requestId, boolean success, String message) {
        if (bridge == null || bridge.getWebView() == null) return;
        try {
            JSONObject detail = new JSONObject();
            detail.put("requestId", requestId == null ? "" : requestId);
            detail.put("success", success);
            detail.put("message", message == null ? "" : message);
            String script = "window.dispatchEvent(new CustomEvent('" + BIO_EVENT + "',{detail:" + detail.toString() + "}));";
            bridge.getWebView().post(() -> bridge.getWebView().evaluateJavascript(script, null));
        } catch (Exception e) { Log.w("DX_BIO", "Falha no dispatch", e); }
    }

    // --- Bridge injetado como window.DxBiometrics ---
    private class BiometricBridge {

        @JavascriptInterface
        public boolean isBiometricAvailable() { return isBioAvailable(); }

        // ID estável do aparelho (ANDROID_ID). Sobrevive a reinstalação do app (só muda em
        // factory reset). Usado no "1 bônus de boas-vindas por dispositivo" (anti-farm de créditos).
        @JavascriptInterface
        public String getDeviceId() {
            try { return android.provider.Settings.Secure.getString(getContentResolver(), android.provider.Settings.Secure.ANDROID_ID); }
            catch (Exception e) { return ""; }
        }

        @JavascriptInterface
        public boolean saveToken(String role, String token) {
            if (role == null || token == null || token.isEmpty()) return false;
            try { getSecurePrefs().edit().putString("bio_" + role, token).apply(); return true; }
            catch (Exception e) { Log.w("DX_BIO", "saveToken falhou", e); return false; }
        }

        @JavascriptInterface
        public String getToken(String role) {
            return getSecurePrefs().getString("bio_" + (role == null ? "patient" : role), "");
        }

        @JavascriptInterface
        public boolean hasToken(String role) {
            String t = getToken(role);
            return t != null && !t.isEmpty();
        }

        @JavascriptInterface
        public boolean clearToken(String role) {
            try { getSecurePrefs().edit().remove("bio_" + (role == null ? "patient" : role)).apply(); return true; }
            catch (Exception e) { return false; }
        }

        @JavascriptInterface
        public void authenticate(String requestId, String title, String subtitle) {
            runOnUiThread(() -> {
                if (!isBioAvailable()) {
                    dispatchBioResult(requestId, false, "Biometria nao disponivel neste aparelho.");
                    return;
                }
                BiometricPrompt prompt = new BiometricPrompt(
                    MainActivity.this,
                    ContextCompat.getMainExecutor(MainActivity.this),
                    new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                            super.onAuthenticationSucceeded(result);
                            dispatchBioResult(requestId, true, "");
                        }
                        @Override
                        public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                            super.onAuthenticationError(errorCode, errString);
                            dispatchBioResult(requestId, false, errString == null ? "" : errString.toString());
                        }
                    }
                );
                BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title == null || title.isEmpty() ? "Meus Exames" : title)
                    .setSubtitle(subtitle == null || subtitle.isEmpty() ? "Confirme sua identidade" : subtitle)
                    .setAllowedAuthenticators(
                        BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL
                    )
                    .build();
                prompt.authenticate(info);
            });
        }
    }
}
