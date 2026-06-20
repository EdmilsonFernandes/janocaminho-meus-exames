import { config } from '../config';
import { prisma } from '../prisma';

/** Tópico Firebase dos nudges de saúde (criar no console Firebase com este nome). */
export const PUSH_TOPIC = 'dr_exame_nudges';

let messaging: any = null;
let initTried = false;

/** Inicializa firebase-admin de forma preguiçosa (só se houver service account configurado). */
async function getMessaging(): Promise<any | null> {
  if (messaging) return messaging;
  if (initTried) return null;
  initTried = true;
  const path = config.firebaseServiceAccountPath;
  if (!path) {
    console.warn('[push] FIREBASE_SERVICE_ACCOUNT_PATH não configurado — push desativado');
    return null;
  }
  try {
    const fs = await import('fs');
    if (!fs.existsSync(path)) {
      console.warn(`[push] service account não encontrado em: ${path}`);
      return null;
    }
    const appMod = await import('firebase-admin/app');
    const msgMod = await import('firebase-admin/messaging');
    const serviceAccount = JSON.parse(fs.readFileSync(path, 'utf8'));
    appMod.initializeApp({ credential: appMod.cert(serviceAccount) });
    messaging = msgMod.getMessaging();
    console.log('[push] Firebase Messaging inicializado');
    return messaging;
  } catch (e: any) {
    console.error('[push] falha ao inicializar Firebase:', e?.message);
    return null;
  }
}

/** Envia push via FCM para uma lista de tokens. Remove tokens inválidos automaticamente. */
export async function sendPush(tokens: string[], title: string, body: string, data?: Record<string, string>): Promise<void> {
  if (!tokens.length) return;
  const m = await getMessaging();
  if (!m) return;
  await Promise.all(tokens.map(async (token) => {
    try {
      await m.send({ token, notification: { title, body }, data: data ?? {}, android: { priority: 'high' } });
    } catch (e: any) {
      if (e?.code === 'messaging/registration-token-not-registered') {
        await prisma.deviceToken.delete({ where: { token } }).catch(() => {});
      } else {
        console.error('[push] erro ao enviar para token:', e?.message);
      }
    }
  }));
}

/** Dispara push para todos os dispositivos de um usuário. */
export async function sendPushToUser(userId: string, title: string, body: string, data?: Record<string, string>): Promise<void> {
  const tokens = await prisma.deviceToken.findMany({ where: { userId }, select: { token: true } });
  await sendPush(tokens.map((t) => t.token), title, body, data);
}

/** Inscreve tokens num tópico (best-effort — só ativa com Firebase Admin configurado). */
export async function subscribeToTopic(tokens: string[], topic: string = PUSH_TOPIC): Promise<void> {
  if (!tokens.length) return;
  const m = await getMessaging();
  if (!m) return;
  try { await m.subscribeToTopic(tokens, topic); } catch (e: any) { console.warn('[push] subscribeToTopic falhou:', e?.message); }
}
