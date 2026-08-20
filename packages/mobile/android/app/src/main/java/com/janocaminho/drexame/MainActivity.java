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
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;

import org.json.JSONObject;

// Google Sign-in nativo (Capgo social-login)
import android.content.Intent;
import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;

public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {

    private static final String SECURE_PREFS = "dx_secure_bio";
    private static final String BIO_EVENT = "dx:biometric-result";
    private static final String ACTION_OPEN_EMERGENCY = "com.janocaminho.drexame.OPEN_EMERGENCY";
    private boolean biometricBridgeInjected = false;
    // Health Connect (Activity Widget): bridge Kotlin window.DxHealth (mesmo padrão do DxBiometrics).
    private HealthBridge healthBridge;
    // Atalho "Cartão de emergência" (long-press no ícone): pending até o WebView estar pronto.
    private boolean pendingEmergencyOpen = false;
    private final android.os.Handler uiHandler = new android.os.Handler(android.os.Looper.getMainLooper());

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannel();
        paintWebViewBrandBg();
        // Health Connect: cria o bridge e REGISTRA o launcher de permissões ainda no onCreate
        // (registerForActivityResult exige registro antes do primeiro onStart).
        healthBridge = new HealthBridge(this);
        healthBridge.ensureLauncher();
        injectHealthBridge();
        injectBiometricBridge();
        if (ACTION_OPEN_EMERGENCY.equals(getIntent() != null ? getIntent().getAction() : null)) {
            pendingEmergencyOpen = true;
            maybeOpenEmergency();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // singleTask: se o app já está aberto, o atalho chega aqui (não no onCreate).
        if (intent != null && ACTION_OPEN_EMERGENCY.equals(intent.getAction())) {
            pendingEmergencyOpen = true;
            maybeOpenEmergency();
        }
    }

    /** Navega pro cartão de emergência assim que o bridge/WebView estiver pronto (retry leve). */
    private void maybeOpenEmergency() {
        if (!pendingEmergencyOpen) return;
        if (bridge == null || bridge.getWebView() == null) {
            uiHandler.postDelayed(this::maybeOpenEmergency, 400);
            return;
        }
        pendingEmergencyOpen = false;
        final WebView wv = bridge.getWebView();
        // 1,2s: dá tempo do React montar o router antes do hash change.
        uiHandler.postDelayed(() -> wv.evaluateJavascript(
            "if(location.hash.indexOf('#/emergencia')<0) location.hash='#/emergencia';", null), 1200);
    }

    /** Fundo do WebView na cor do splash nativo (#20B2AA): elimina o flash branco entre o
     *  SplashScreen do sistema e o primeiro paint do React (login/boot). */
    private void paintWebViewBrandBg() {
        if (bridge == null || bridge.getWebView() == null) return;
        try { bridge.getWebView().setBackgroundColor(android.graphics.Color.parseColor("#20B2AA")); }
        catch (Exception e) { Log.w("DX_UI", "WebView bg falhou", e); }
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
        injectHealthBridge(); // re-injeta se o WebView foi recriado
        injectBiometricBridge(); // idem
    }

    /** Injeta o bridge de Health Connect (window.DxHealth) — passos/calorias/distância do widget. */
    private void injectHealthBridge() {
        if (healthBridge == null || bridge == null || bridge.getWebView() == null) return;
        bridge.getWebView().addJavascriptInterface(healthBridge, "DxHealth");
    }

    /** Avalia JS no WebView (o HealthBridge despacha CustomEvents por aqui). */
    public void evalJs(String script) {
        if (bridge == null || bridge.getWebView() == null) return;
        bridge.getWebView().evaluateJavascript(script, null);
    }

    // --- Google Sign-in nativo (Capgo social-login): repassa o resultado do seletor de conta ao plugin. ---
    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN
            && requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
            if (bridge == null) return;
            PluginHandle handle = bridge.getPlugin("SocialLogin");
            if (handle == null) { Log.w("DX_SOCIAL", "SocialLogin plugin handle null"); return; }
            Plugin plugin = handle.getInstance();
            if (plugin instanceof SocialLoginPlugin) {
                ((SocialLoginPlugin) plugin).handleGoogleLoginIntent(requestCode, data);
            }
        }
    }

    // Exigido pela interface ModifiedMainActivityForSocialLoginPlugin (no-op — nunca chamado).
    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() { }

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
