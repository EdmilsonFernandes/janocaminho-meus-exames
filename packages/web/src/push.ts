import { Capacitor } from '@capacitor/core';
import { API_URL, token } from './config';

const FCM_KEY = 'fcmToken';

/** Envia o token FCM guardado ao backend (chamado após login). No web é no-op. */
export async function syncPushToken(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const fcm = localStorage.getItem(FCM_KEY);
  const t = token();
  if (!fcm || !t) return;
  await fetch(`${API_URL}/devices/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    body: JSON.stringify({ token: fcm, platform: 'android' }),
  }).catch(() => {});
}

/** Registra o app para receber push (Android). No web é no-op. */
export async function initPush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  // Push exige google-services.json + Firebase configurados. Sem isso, PushNotifications.register()
  // causa um CRASH NATIVO (FirebaseApp não inicializado) que derruba o app — foi o que fez o APK
  // abrir o login e fechar. Só ativar quando o FCM estiver pronto (VITE_PUSH_ENABLED=true no build).
  if (import.meta.env.VITE_PUSH_ENABLED !== 'true') return;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt') perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return;
    await PushNotifications.addListener('registration', (data) => {
      localStorage.setItem(FCM_KEY, data.value);
      void syncPushToken();
    });
    await PushNotifications.addListener('registrationError', (e) => {
      console.warn('[push] registration error', e);
    });
    await PushNotifications.register();
  } catch (e) {
    console.warn('[push] init falhou:', e);
  }
}
