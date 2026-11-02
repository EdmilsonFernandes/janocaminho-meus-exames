import { Capacitor } from '@capacitor/core';
import { API_URL } from '../config';
import { APP_VERSION } from './version';

/** OPINIÕES (02/11/26) — cliente HTTP da pesquisa curta. `mode` = sessão de paciente
 *  (token, /api/feedback) ou de médico (doctorToken, /api/doctor/feedback). */
export type FeedbackMode = 'patient' | 'doctor';
export type Outcome = 'done' | 'partial' | 'not' | 'exploring';

export interface SurveyOption { id: string; label: string }
export interface SurveyDefinition {
  key: string;
  version: number;
  audience: 'patient' | 'doctor';
  estimatedSeconds: number;
  title: string;
  subtitle: string;
  q1: { id: 'outcome'; text: string; options: { id: Outcome; label: string }[] };
  q2: { id: 'detail'; multi: true; max: number; textByOutcome: Record<Outcome, string>; options: SurveyOption[] };
  q3: { id: 'improvement'; text: string; options: SurveyOption[] };
  comment: { label: string; hint: string; max: number };
  privacyNote: string;
  thanks: { title: string; text: string };
}

export interface SurveyAnswers { outcome: Outcome | null; detail: string[]; improvement: string | null }

export interface Eligibility { eligible: boolean; reason?: string; surveyKey?: string; surveyVersion?: number; hasExams?: boolean }

const tokenFor = (mode: FeedbackMode) => {
  try { return localStorage.getItem(mode === 'doctor' ? 'doctorToken' : 'token'); } catch { return null; }
};
const baseFor = (mode: FeedbackMode) => (mode === 'doctor' ? `${API_URL}/doctor/feedback` : `${API_URL}/feedback`);
const headers = (mode: FeedbackMode, json = false) => {
  const h: Record<string, string> = { Authorization: `Bearer ${tokenFor(mode) ?? ''}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
};

export async function fetchSurvey(mode: FeedbackMode): Promise<SurveyDefinition | null> {
  try {
    const r = await fetch(`${baseFor(mode)}/survey`, { headers: headers(mode) });
    if (!r.ok) return null;
    return (await r.json())?.survey ?? null;
  } catch { return null; }
}

export async function fetchEligibility(mode: FeedbackMode): Promise<Eligibility> {
  if (!tokenFor(mode)) return { eligible: false, reason: 'no_token' };
  try {
    const r = await fetch(`${baseFor(mode)}/eligibility`, { headers: headers(mode) });
    if (!r.ok) return { eligible: false, reason: 'http' };
    return (await r.json()) as Eligibility;
  } catch { return { eligible: false, reason: 'network' }; }
}

export function markInvited(mode: FeedbackMode): void {
  fetch(`${baseFor(mode)}/invited`, { method: 'POST', headers: headers(mode, true), body: '{}' }).catch(() => {});
}
export function markDismissed(mode: FeedbackMode): void {
  fetch(`${baseFor(mode)}/dismiss`, { method: 'POST', headers: headers(mode, true), body: '{}' }).catch(() => {});
}

export interface SubmitPayload {
  surveyKey: string;
  surveyVersion: number;
  answers: SurveyAnswers;
  comment: string;
  clientKey: string;
  trigger: string;
  hasExams?: boolean;
}

export type SubmitResult = { ok: true; thanks: { title: string; text: string } } | { ok: false; outdated?: boolean; error: string };

export async function submitFeedback(mode: FeedbackMode, p: SubmitPayload): Promise<SubmitResult> {
  const screen = (window.location.hash || '').replace(/^#/, '').split('?')[0].slice(0, 80) || '/';
  const body = {
    surveyKey: p.surveyKey, surveyVersion: p.surveyVersion, answers: p.answers, comment: p.comment, clientKey: p.clientKey,
    context: { trigger: p.trigger, screen, platform: Capacitor.getPlatform(), appVersion: APP_VERSION, ...(p.hasExams == null ? {} : { hasExams: p.hasExams }) },
  };
  try {
    const r = await fetch(baseFor(mode), { method: 'POST', headers: headers(mode, true), body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) return { ok: true, thanks: d?.thanks ?? { title: 'Obrigado por ajudar!', text: 'Sua opinião foi registrada.' } };
    if (r.status === 409 && d?.code === 'survey_outdated') return { ok: false, outdated: true, error: d.error };
    return { ok: false, error: d?.error || 'Não foi possível enviar agora.' };
  } catch {
    return { ok: false, error: 'Sem conexão. Sua resposta ficou guardada — tente de novo.' };
  }
}

export function newClientKey(): string {
  try { if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `ck-${crypto.randomUUID()}`; } catch { /* fallback */ }
  return `ck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Rascunho local (sobrevive a falha de rede/fechar o app) — por pesquisa e modo. */
export interface FeedbackDraft { clientKey: string; answers: SurveyAnswers; comment: string; trigger: string; savedAt: number }
const draftKey = (mode: FeedbackMode, surveyKey: string) => `dx.fb.draft.${mode}.${surveyKey}`;
export function loadDraft(mode: FeedbackMode, surveyKey: string): FeedbackDraft | null {
  try { const raw = localStorage.getItem(draftKey(mode, surveyKey)); return raw ? (JSON.parse(raw) as FeedbackDraft) : null; } catch { return null; }
}
export function saveDraft(mode: FeedbackMode, surveyKey: string, d: FeedbackDraft): void {
  try { localStorage.setItem(draftKey(mode, surveyKey), JSON.stringify(d)); } catch { /* storage off */ }
}
export function clearDraft(mode: FeedbackMode, surveyKey: string): void {
  try { localStorage.removeItem(draftKey(mode, surveyKey)); } catch { /* storage off */ }
}
