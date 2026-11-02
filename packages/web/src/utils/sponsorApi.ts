import { Capacitor } from '@capacitor/core';
import { API_URL } from '../config';
import { APP_VERSION } from './version';

/** PATROCINADORES (02/11/26) — cliente HTTP do popup. `mode` escolhe sessão de paciente
 *  (token) ou de médico (doctorToken) e o prefixo da API. Toda falha vira "sem campanha":
 *  o app nunca trava por causa de anúncio. */
export type SponsorMode = 'patient' | 'doctor';

export interface SponsorCampaign {
  id: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaType: 'none' | 'internal' | 'external';
  ctaTarget: string | null;
  imageUrl: string | null; // caminho relativo à API (/campaigns/:id/image?v=)
  sponsor: { id: string; name: string; logoUrl: string | null };
}

const tokenFor = (mode: SponsorMode) => {
  try { return localStorage.getItem(mode === 'doctor' ? 'doctorToken' : 'token'); } catch { return null; }
};
const baseFor = (mode: SponsorMode) => (mode === 'doctor' ? `${API_URL}/doctor/campaigns` : `${API_URL}/campaigns`);

/** URL absoluta de um asset relativo devolvido pela API (logo/imagem). */
export const sponsorAssetUrl = (rel: string | null): string | null => (rel ? `${API_URL}${rel}` : null);

export async function fetchEligibleCampaign(mode: SponsorMode): Promise<SponsorCampaign | null> {
  const t = tokenFor(mode);
  if (!t) return null;
  try {
    const r = await fetch(`${baseFor(mode)}/eligible`, { headers: { Authorization: `Bearer ${t}` } });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.campaign && typeof d.campaign.id === 'string' ? (d.campaign as SponsorCampaign) : null;
  } catch { return null; }
}

/** Gera o id da impressão (chave idempotente de impressão/clique/dispensa). */
export function newImpressionId(): string {
  try { if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID(); } catch { /* fallback */ }
  return `imp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function postCampaignEvent(mode: SponsorMode, campaignId: string, type: 'impression' | 'click' | 'dismiss', impressionId: string): void {
  const t = tokenFor(mode);
  if (!t) return;
  const body = JSON.stringify({ type, impressionId, platform: Capacitor.getPlatform(), appVersion: APP_VERSION });
  // keepalive: o clique costuma sair junto da navegação/abertura do navegador externo.
  fetch(`${baseFor(mode)}/${campaignId}/events`, { method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body, keepalive: true })
    .catch(() => { /* telemetria best-effort */ });
}
