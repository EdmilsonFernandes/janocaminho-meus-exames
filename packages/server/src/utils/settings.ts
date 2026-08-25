import { prisma } from '../prisma';
import { CREDIT_COSTS, UPLOAD_RULES } from './credits';
import { BADGES as DEFAULT_BADGES } from './achievements';

// Defaults da config de monetização (categoria → objeto). Usados quando o banco está vazio.
// creditCosts/uploadRules ESPELHAM os objetos vivos de credits.ts — loadSettings/saveSettings
// os sincronizam, então quem já lê `CREDIT_COSTS.chat` continua funcionando (sem mudar imports).
export const DEFAULT_SETTINGS = {
  creditCosts: { extraction: 0, summary: 10, consolidated: 20, chat: 2 },
  uploadRules: { freeCost: 1, premiumFreeQuota: 6, premiumCost: 5 },
  grants: { freeSignup: 60, monthly: 250, freeExamLimit: 2 },
  // ===== Estratégia de pricing (2026-08-23) — tudo editável no Admin, sem deploy =====
  // Preço do plano mensal (era hardcode em 7 lugares). Os créditos do mensal continuam em
  // grants.monthly (fonte única). periodDays/label aqui só p/ a API expor.
  plans: { monthly: { price: 19.9, periodDays: 30, label: 'Mensal' } },
  // Pacotes de créditos avulsos (mesma moeda/saldo — mudar NÃO invalida créditos já comprados).
  creditPacks: [
    { id: 'p50', credits: 50, price: 9.9, label: 'Início', popular: false },
    { id: 'p140', credits: 140, price: 24.9, label: 'Popular', popular: true },
    { id: 'p320', credits: 320, price: 49.9, label: 'Bônus', popular: false },
  ],
  // Perks premium (além dos créditos mensais): relatório consolidado sem débito e limite
  // familiar maior. Upload grátis usa o knob já existente uploadRules.premiumFreeQuota
  // (subir p/ 999 no admin = "ilimitado"). Leitura por uso — desligar volta a cobrar, sem
  // estado órfão.
  premium: { consolidatedFree: 1, familyLimit: 10 },
  // Promo "Plano Fundador": preço alternativo p/ os primeiros N assinantes. Default DESLIGADO
  // (validação 2026-08-23: zero assinantes mensais reais — nada a preservar). `used` é
  // incrementado pelo webhook a cada aprovação no preço fundador (condicional ao limite).
  founder: { enabled: 0, price: 19.9, limit: 100, used: 0 },
  // "Primeiro grátis" (1 = ligado, 0 = desligado; admin edita live como os demais knobs).
  // Pesquisa ago/2026: a 1ª interpretação virou commodity (35% dos BR colam no ChatGPT) —
  // o freemium ganha se a primeira leitura ser sempre grátis.
  firstFree: { summary: 1 },
  // Faixas pediátricas por banda etária (Lote 2 família): 1 = ligado. Régua do laudo continua
  // vencendo quando o lab imprime faixa própria não-adulta; a banda só entra sem faixa ou
  // contra default adulto óbvio. Kill-switch instantâneo via admin.
  pediatricRanges: { enabled: 1 },
  // API pública (Fase 2): acesso mediante solicitação aprovada no admin; aprovação concede
  // o pacote TESTE grátis (freeMonthly calls). Pacotes pré-pagos via PIX/cartão/débito (MP).
  // reviewRequired=0 = auto-aprova (self-serve). Preço/cobertura 100% editável no admin.
  apiAccess: {
    freeMonthly: 25,
    reviewRequired: 1,
    packs: [
      { id: 'api1k', calls: 1000, price: 19.9, label: 'Starter', popular: false },
      { id: 'api10k', calls: 10000, price: 99, label: 'Pro', popular: true },
      { id: 'api50k', calls: 50000, price: 399, label: 'Scale', popular: false },
    ],
  },
  shares: { exams: 5, evolution: 5, alerts: 3, summary: 5 }, // custo por escopo ao compartilhar c/ médico
  // Faixas temporais (meses) da análise de exames — classificação atual/recente/histórico/antigo
  // e marcação de "desatualizado" (>staleMonths). Defaults = spec clínica. Admin edita live.
  temporalThresholds: { freshMonths: 6, recentMonths: 12, staleMonths: 12, oldMonths: 36 },
  badges: DEFAULT_BADGES.map((b) => ({ id: b.id, emoji: b.emoji, title: b.title, desc: b.desc, metric: b.metric, threshold: b.threshold, reward: b.reward })),
};

export type SettingCategory = keyof typeof DEFAULT_SETTINGS;
type AnySettings = typeof DEFAULT_SETTINGS;

const clone = (o: AnySettings): AnySettings => JSON.parse(JSON.stringify(o));

// Cache em memória (DB sobre defaults). getSettings() é síncrono.
let cache: AnySettings = clone(DEFAULT_SETTINGS);

/** Settings atuais (sync). Antes do loadSettings() no boot, devolve os defaults. */
export function getSettings(): AnySettings {
  return cache;
}

/** Sincroniza os objetos vivos CREDIT_COSTS/UPLOAD_RULES (lidos pelos routes antigos). */
function applyToLive(s: AnySettings) {
  Object.assign(CREDIT_COSTS, s.creditCosts);
  Object.assign(UPLOAD_RULES, s.uploadRules);
}

/** Lê app_settings, merge sobre DEFAULT_SETTINGS, cacheia + sincroniza objetos vivos. Chamar no boot. */
export async function loadSettings(): Promise<void> {
  try {
    const rows = await prisma.appSetting.findMany();
    const next = clone(DEFAULT_SETTINGS);
    for (const r of rows) {
      // arrays (badges, creditPacks): substitui INTEIRO (merge de array criaria Frankenstein)
      if (r.key === 'badges' || r.key === 'creditPacks') (next as any)[r.key] = r.value;
      else if (r.key in next) Object.assign((next as any)[r.key], r.value as object);
    }
    cache = next;
    applyToLive(cache);
  } catch (e) {
    console.warn('[settings] loadSettings falhou (usando defaults):', (e as Error).message);
  }
}

/** Grava uma categoria no banco (upsert) + atualiza cache + objetos vivos.
 *  badges/creditPacks = array (substitui inteiro). Demais = merge raso.
 *  `replaceObject: true` substitui a categoria inteira (usado p/ plans/premium/founder no admin,
 *  que manda o objeto pronto em vez de patch — evita chaves fantasmas de edições antigas). */
export async function saveSettings(category: SettingCategory, patch: Record<string, number> | any[], replaceObject = false): Promise<AnySettings> {
  if (Array.isArray(patch)) {
    (cache as any)[category] = patch;
  } else if (replaceObject) {
    (cache as any)[category] = { ...patch };
  } else {
    (cache as any)[category] = { ...(cache as any)[category], ...patch };
  }
  const value = (cache as any)[category];
  await prisma.appSetting.upsert({
    where: { key: category },
    update: { value },
    create: { key: category, value },
  });
  applyToLive(cache);
  return cache;
}

// ───────────────── helpers da estratégia de pricing (fallbacks defensivos) ─────────────────

/** Preço/ciclo do plano mensal (settings; nunca mais hardcode nas rotas). */
export function getMonthlyPlan(): { price: number; periodDays: number; label: string } {
  const m = (getSettings() as any).plans?.monthly;
  const price = Number(m?.price);
  return {
    price: Number.isFinite(price) && price > 0 ? price : 19.9,
    periodDays: Number(m?.periodDays) > 0 ? Number(m?.periodDays) : 30,
    label: String(m?.label || 'Mensal'),
  };
}

/** Preço EFETIVO no checkout: fundador ligado e com vagas → preço fundador; senão, cheio. */
export function getEffectivePlanPrice(): { price: number; founder: boolean } {
  const full = getMonthlyPlan().price;
  const f = (getSettings() as any).founder;
  if (Number(f?.enabled) === 1 && Number(f?.used) < Number(f?.limit) && Number(f?.price) > 0 && Number(f?.price) < full) {
    return { price: Number(f.price), founder: true };
  }
  return { price: full, founder: false };
}

/** Pacotes avulsos (fallback pros defaults se o banco tiver algo inválido). */
export function getCreditPacks(): { id: string; credits: number; price: number; label: string; popular: boolean }[] {
  const packs = (getSettings() as any).creditPacks;
  if (Array.isArray(packs) && packs.length && packs.every((p: any) => p && p.id && Number(p.credits) > 0 && Number(p.price) > 0)) return packs;
  return DEFAULT_SETTINGS.creditPacks;
}

/** Perks premium (1 = ligado). */
export function getPremiumPerks(): { consolidatedFree: boolean; familyLimit: number } {
  const p = (getSettings() as any).premium ?? {};
  return {
    consolidatedFree: Number(p.consolidatedFree) === 1,
    familyLimit: Number(p.familyLimit) > 0 ? Number(p.familyLimit) : 10,
  };
}
