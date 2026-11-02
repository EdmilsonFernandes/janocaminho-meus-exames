/**
 * PATROCINADORES — regras PURAS de elegibilidade e seleção (02/11/26).
 *
 * Sem Prisma aqui: a rota carrega candidatas + histórico do sujeito e esta função decide.
 * Testável com datas fixas. Regras (spec do dono):
 *  - só campanha PUBLICADA, ativa e dentro do período (status efetivo = 'active');
 *  - público por PERFIL DE ACESSO (patient | doctor | all) — nunca por dado clínico;
 *  - intervalo GLOBAL entre popups de qualquer campanha ao mesmo sujeito;
 *  - por campanha: intervalo mínimo entre exibições + teto de impressões por sujeito;
 *  - várias elegíveis → UMA só: prioridade desc, depois menos vista, depois a que
 *    termina antes, depois a mais antiga. Nunca sequência de anúncios.
 */

export type CampaignStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'ended';
export type Audience = 'patient' | 'doctor' | 'all';
export type SubjectKind = 'patient' | 'doctor';

export interface CampaignLike {
  id: string;
  status: string;
  audience: string;
  startsAt: Date | null;
  endsAt: Date | null;
  priority: number;
  frequencyHours: number;
  maxImpressionsPerUser: number;
  createdAt: Date;
}

export interface SubjectHistory {
  /** impressões por campanha (contagem + última) */
  byCampaign: Map<string, { count: number; last: Date | null }>;
  /** última impressão de QUALQUER campanha (intervalo global) */
  lastImpressionAny: Date | null;
}

export const CAMPAIGN_STATUSES: CampaignStatus[] = ['draft', 'scheduled', 'active', 'paused', 'ended'];
export const AUDIENCES: Audience[] = ['patient', 'doctor', 'all'];

const HOUR = 3600_000;

/** Status EFETIVO = status gravado + calendário. 'active' gravada com startsAt no futuro
 *  mostra 'scheduled'; com endsAt no passado mostra 'ended' (sem depender de job). */
export function effectiveStatus(c: Pick<CampaignLike, 'status' | 'startsAt' | 'endsAt'>, now: Date = new Date()): CampaignStatus {
  if (c.status === 'ended') return 'ended';
  if (c.status === 'draft') return 'draft';
  if (c.endsAt && c.endsAt.getTime() <= now.getTime()) return 'ended';
  if (c.status === 'paused') return 'paused';
  if (c.startsAt && c.startsAt.getTime() > now.getTime()) return 'scheduled';
  return 'active';
}

export function audienceMatches(audience: string, subject: SubjectKind): boolean {
  return audience === 'all' || audience === subject;
}

export interface PickOptions {
  subject: SubjectKind;
  globalIntervalHours: number;
  now?: Date;
}

export interface PickResult<T extends CampaignLike> {
  campaign: T | null;
  /** motivo quando nada foi escolhido (telemetria/teste) */
  reason: 'ok' | 'none_active' | 'global_interval' | 'all_capped' ;
}

export function pickEligibleCampaign<T extends CampaignLike>(candidates: T[], history: SubjectHistory, opts: PickOptions): PickResult<T> {
  const now = opts.now ?? new Date();
  const active = candidates.filter((c) => effectiveStatus(c, now) === 'active' && audienceMatches(c.audience, opts.subject));
  if (active.length === 0) return { campaign: null, reason: 'none_active' };

  if (history.lastImpressionAny && opts.globalIntervalHours > 0) {
    if (now.getTime() - history.lastImpressionAny.getTime() < opts.globalIntervalHours * HOUR) {
      return { campaign: null, reason: 'global_interval' };
    }
  }

  const eligible = active.filter((c) => {
    const h = history.byCampaign.get(c.id) ?? { count: 0, last: null };
    if (c.maxImpressionsPerUser > 0 && h.count >= c.maxImpressionsPerUser) return false;
    if (h.last && c.frequencyHours > 0 && now.getTime() - h.last.getTime() < c.frequencyHours * HOUR) return false;
    return true;
  });
  if (eligible.length === 0) return { campaign: null, reason: 'all_capped' };

  eligible.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const ca = history.byCampaign.get(a.id)?.count ?? 0;
    const cb = history.byCampaign.get(b.id)?.count ?? 0;
    if (ca !== cb) return ca - cb;
    const ea = a.endsAt ? a.endsAt.getTime() : Number.POSITIVE_INFINITY;
    const eb = b.endsAt ? b.endsAt.getTime() : Number.POSITIVE_INFINITY;
    if (ea !== eb) return ea - eb;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return { campaign: eligible[0], reason: 'ok' };
}

// ───────────────────────── destino do botão ─────────────────────────

export type CtaType = 'none' | 'internal' | 'external';
export const CTA_TYPES: CtaType[] = ['none', 'internal', 'external'];

/** Rota interna: começa com '/', sem protocolo/host (nunca '//'), só caracteres de rota. */
const INTERNAL_ROUTE = /^\/(?!\/)[A-Za-z0-9\-_./?=&%]*$/;

/** Valida o destino conforme o tipo. Devolve o valor normalizado ou um erro legível.
 *  Externa: só https com host (bloqueia javascript:, data:, http: e URLs quebradas). */
export function validateCtaTarget(ctaType: string, target: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  const t = typeof target === 'string' ? target.trim() : '';
  if (ctaType === 'none') return { ok: true, value: null };
  if (ctaType === 'internal') {
    if (!t) return { ok: false, error: 'Informe a rota interna (ex.: /planos).' };
    if (t.length > 200 || !INTERNAL_ROUTE.test(t)) return { ok: false, error: 'Rota interna inválida: use o formato /rota (sem domínio).' };
    return { ok: true, value: t };
  }
  if (ctaType === 'external') {
    if (!t) return { ok: false, error: 'Informe a URL externa (https://…).' };
    if (t.length > 500) return { ok: false, error: 'URL longa demais (máx. 500 caracteres).' };
    let u: URL;
    try { u = new URL(t); } catch { return { ok: false, error: 'URL externa inválida.' }; }
    if (u.protocol !== 'https:') return { ok: false, error: 'A URL externa precisa ser https://.' };
    if (!u.hostname || !u.hostname.includes('.')) return { ok: false, error: 'URL externa sem domínio válido.' };
    if (u.username || u.password) return { ok: false, error: 'URL com credenciais não é permitida.' };
    return { ok: true, value: u.toString() };
  }
  return { ok: false, error: 'Tipo de destino inválido.' };
}
