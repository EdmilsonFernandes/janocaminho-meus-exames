import { config } from '../config';

/** Tópico Firebase dos nudges de saúde (assumido — o Edmilson cria no console). */
export const PUSH_TOPIC = 'dr_exame_nudges';

/** Firebase Admin (envio de push). Só ativa com firebase-admin instalado +
 *  FIREBASE_SERVICE_ACCOUNT_PATH apontando pro serviceAccountKey.json.
 *  Sem isso, todas as funções viram no-op (não quebra o server). */
let _messaging: any = null;
let _tried = false;
async function getMessaging(): Promise<any | null> {
  if (_tried) return _messaging;
  _tried = true;
  if (!config.firebaseServiceAccountPath) return null;
  try {
    const fs = await import('fs');
    const admin = await import('firebase-admin');
    const sa = JSON.parse(fs.readFileSync(config.firebaseServiceAccountPath, 'utf8'));
    const app = admin.initializeApp({ credential: admin.credential.cert(sa) }, 'meus-exames');
    _messaging = (admin as any).messaging ? (admin as any).getMessaging(app) : null;
    console.log('[firebase] Admin inicializado.');
  } catch (e: any) {
    console.warn('[firebase] Admin NÃO inicializado (sem firebase-admin ou service account inválido):', e?.message ?? e);
  }
  return _messaging;
}

/** Inscreve tokens num tópico (best-effort). true se conseguiu. */
export async function subscribeToTopic(tokens: string[], topic: string = PUSH_TOPIC): Promise<boolean> {
  const m = await getMessaging();
  if (!m || !tokens.length) return false;
  try { await m.subscribeToTopic(tokens, topic); return true; } catch { return false; }
}

/** Envia push a um token (best-effort). true se conseguiu. */
export async function sendPush(token: string, title: string, body: string, data: Record<string, string> = {}): Promise<boolean> {
  const m = await getMessaging();
  if (!m) return false;
  try { await m.send({ token, notification: { title, body }, data, android: { priority: 'high' } }); return true; } catch { return false; }
}
