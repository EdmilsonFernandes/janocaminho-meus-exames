/**
 * Google Meet (REST API v2) — criação automática de salas p/ teleconsulta.
 *
 * O médico conecta a conta Google UMA vez (OAuth offline, escopo único
 * `meetings.space.created` — nada de calendário/e-mail); guardamos só o refresh
 * token (criptografado) e criamos a sala na hora de agendar.
 *
 * Degradação da casa (padrão hasAnthropicKey): sem GOOGLE_CLIENT_ID/SECRET no env,
 * `hasMeetConfig()` = false → o portal nem oferece o toggle e vale o link colado.
 * Docs: developers.google.com/workspace/meet/api/guides/overview
 */

export const MEET_SCOPE = 'https://www.googleapis.com/auth/meetings.space.created';

export const hasMeetConfig = (): boolean =>
  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

/** redirect_uri do fluxo OAuth (precisa estar registrado no Google Console). */
export const meetRedirectUri = (): string =>
  process.env.GOOGLE_MEET_REDIRECT || `${(process.env.WEB_ORIGIN || 'http://localhost:5173').replace(/\/$/, '')}/api/doctor/google/callback`;

/** URL de consentimento (access_type=offline + prompt=consent garantem refresh token). */
export function meetAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: meetRedirectUri(),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: MEET_SCOPE,
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

/** Troca code→tokens. Refresh só vem no 1º consentimento (por isso prompt=consent). */
export async function exchangeMeetCode(code: string): Promise<{ refresh: string | null; access: string }> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: meetRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  if (!r.ok) throw new Error(`google oauth: ${r.status} ${(await r.text()).slice(0, 140)}`);
  const j: any = await r.json();
  return { refresh: j.refresh_token ?? null, access: j.access_token };
}

/** Cria a sala Meet e devolve { uri, code } — o uri vira o linkUrl da teleconsulta. */
export async function createMeetSpace(refreshToken: string): Promise<{ uri: string; code: string }> {
  const t = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  });
  if (!t.ok) throw new Error(`google refresh: ${t.status}`);
  const { access_token }: any = await t.json();

  const r = await fetch('https://meet.googleapis.com/v2/spaces', {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}), // space com config padrão
  });
  if (!r.ok) throw new Error(`meet create: ${r.status} ${(await r.text()).slice(0, 140)}`);
  const j: any = await r.json();
  if (!j.meetingUri) throw new Error('meet create: sem meetingUri');
  return { uri: j.meetingUri as string, code: String(j.meetingCode ?? '') };
}
