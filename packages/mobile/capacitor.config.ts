import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.janocaminho.drexame',
  appName: 'Meus Exames',
  webDir: 'www',
  android: {
    // Android 15+ (targetSdk>=35) força edge-to-edge: sem isso o WebView desenha POR TRÁS da
    // status bar e da gesture bar (env(safe-area-inset-*) volta 0 no Android WebView → nada
    // compensa). 'auto' = Capacitor aplica margins no WebView só no 15+ (padrão do Capacitor
    // 7.x é 'disable', que só funcionava porque o template antigo optava-out via tema).
    // Padrão observado em apps nativos maduros (ex.: análise do APK Soufix/NativeScript,
    // que trata insets explicitamente no bottom nav). Android ≤14: sem mudança.
    adjustMarginsForEdgeToEdge: 'auto',
  },
  server: {
    androidScheme: 'https',
    // Em DEV, para apontar o app p/ o servidor de desenvolvimento (live reload no celular):
    //   descomente e ajuste para o IP da sua máquina na rede local (NÃO use em produção)
    // url: 'http://192.168.x.x:5173',
    // cleartext: true,
  },
  plugins: {
    Camera: {},
    // G5 — splash premium: overlay do Capacitor com fade-out (o theme estático do Android
    // continua no boot frio; o plugin pinta a transição suave pra primeira tela do webview).
    SplashScreen: {
      launchShowDuration: 900,
      launchAutoHide: true,
      fadeOutDuration: 350,
      showSpinner: false,
      backgroundColor: '#031412',
      androidSplashResourceName: 'splash',
    },
  },
};

export default config;
