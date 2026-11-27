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
    body: JSON.stringify({ token: fcm, platform: Capacitor.getPlatform() }),
  }).catch(() => {});
}

/** Registra o app para receber push (Android). No web é no-op.
 *
 * iOS fica FORA por enquanto: o plugin Capacitor devolve o token APNs (não FCM) — o
 * servidor (firebase-admin) não saberia entregar. Fase 2 do iOS: Firebase iOS SDK no
 * Xcode (FCM token) OU envio direto APNs no server. Ativar aqui quando isso existir. */
const pushReady = (): boolean =>
  Capacitor.isNativePlatform()
  && Capacitor.getPlatform() === 'android'
  // Push exige google-services.json + Firebase configurados. Sem isso, PushNotifications.register()
  // causa um CRASH NATIVO (FirebaseApp não inicializado) que derruba o app — foi o que fez o APK
  // abrir o login e fechar. Só ativar quando o FCM estiver pronto (VITE_PUSH_ENABLED=true no build).
  && import.meta.env.VITE_PUSH_ENABLED === 'true';

/**
 * Abertura do app: registra o push SÓ se a pessoa já deu a permissão. Não pergunta nada.
 *
 * PEDIDO NA HORA CERTA (27/11/26, visto no Android): o app pedia "permitir notificações?" na
 * primeira abertura, antes do login, sem a pessoa saber para quê. O Android recomenda pedir quando
 * o motivo está claro — e quem nega ali raramente volta atrás. Agora o pedido vem de
 * `askPushPermission()`, chamado logo depois de enviar um exame ("avisamos quando ficar pronto") e
 * de salvar um lembrete.
 */
export async function initPush(): Promise<void> {
  if (!pushReady()) return;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'granted') await registerPush();
  } catch (e) {
    console.warn('[push] init falhou:', e);
  }
}

/** Pede a permissão (se ainda não foi respondida) e registra. Devolve true se ficou permitido. */
export async function askPushPermission(): Promise<boolean> {
  if (!pushReady()) return false;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return false;
    await registerPush();
    return true;
  } catch (e) {
    console.warn('[push] pedido falhou:', e);
    return false;
  }
}

let registered = false;
async function registerPush(): Promise<void> {
  if (registered) return;
  registered = true;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.addListener('registration', (data) => {
      localStorage.setItem(FCM_KEY, data.value);
      void syncPushToken();
    });
    await PushNotifications.addListener('registrationError', (e) => {
      console.warn('[push] registration error', e);
    });
    // Push recebido com app aberto (foreground) -> dispara evento pro app mostrar popup
    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      window.dispatchEvent(new CustomEvent('pushReceived', { detail: { title: (notification as any).title || 'Notificacao', body: (notification as any).body || '', data: (notification as any).data || {} } }));
    });
    // Usuario tocou na notificacao (tray) -> repassa o data pra rotear com inteligencia (perguntas/exames/...)
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = (action as any)?.notification?.data ?? {};
      window.dispatchEvent(new CustomEvent('pushTapped', { detail: { data } }));
    });
    await PushNotifications.register();
  } catch (e) {
    registered = false;
    console.warn('[push] registro falhou:', e);
  }
}
