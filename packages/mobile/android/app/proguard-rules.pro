# Regras R8 do Dr. Exame (habilitado no build 417 p/ score "Otimização do app" do Play).
#
# REGRA DE OURO Capacitor: a chamada JS→nativo é REFLEXIVA — o Bridge resolve
# plugin por NOME de classe (ex.: bridge.getPlugin("SocialLogin")) e o método por
# NOME vindo do JS. O R8 renomeia tudo por padrão → sem estas regras os plugins
# somem/quebram EM RUNTIME (build passa, app abre, nada responde).

# ── Capacitor core (Bridge/PluginHandle/WebViewLocalServer) ─────────────────
-keep class com.getcapacitor.** { *; }

# ── Plugins Capacitor de QUALQUER pacote (anotados @CapacitorPlugin) ─────────
#    cobre: PushNotifications, SocialLogin (ee.forgr.*), AppUpdate, FilePicker,
#    Share, Preferences, Health Connect bridges externos etc.
-keep @com.getcapacitor.CapacitorPlugin public class * { *; }
-keep @com.getcapacitor.Plugin public class * { *; }
-keepclasseswithmembernames class * { @com.getcapacitor.PluginMethod <methods>; }

# ── Código nativo PRÓPRIO (MainActivity + HealthBridge + BiometricBridge) ────
#    window.DxHealth / window.DxBiometrics: métodos expostos ao JS via
#    @JavascriptInterface (default rule cobre os métodos; aqui garante classe
#    inteira — custo ~nulo, app nativo é pequeno).
-keep class com.janocaminho.drexame.** { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ── Crash traces legíveis no Play Console ────────────────────────────────────
#    Line numbers mantidos + nome de arquivo mascarado; o mapping.txt vai no AAB
#    e o Play desofusca os stack traces sozinho.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# ── Ruído de dependências opcionais (o R8 estranha classes ausentes) ─────────
-dontwarn org.slf4j.**
-dontwarn org.bouncycastle.**
-dontwarn javax.naming.**
