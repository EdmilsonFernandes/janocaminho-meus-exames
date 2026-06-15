import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.edmilson.exames',
  appName: 'Meus Exames',
  webDir: 'www',
  server: {
    androidScheme: 'https',
    // Em DEV, para apontar o app p/ o servidor de desenvolvimento (live reload no celular):
    //   descomente e ajuste para o IP da sua máquina na rede local (NÃO use em produção)
    // url: 'http://192.168.x.x:5173',
    // cleartext: true,
  },
  plugins: {
    Camera: {},
  },
};

export default config;
