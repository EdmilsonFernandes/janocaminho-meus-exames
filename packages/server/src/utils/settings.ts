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
  shares: { exams: 5, evolution: 5, alerts: 3, summary: 5 }, // custo por escopo ao compartilhar c/ médico
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
      if (r.key === 'badges') (next as any)[r.key] = r.value; // array: substitui inteiro
      else if (r.key in next) Object.assign((next as any)[r.key], r.value as object);
    }
    cache = next;
    applyToLive(cache);
  } catch (e) {
    console.warn('[settings] loadSettings falhou (usando defaults):', (e as Error).message);
  }
}

/** Grava uma categoria no banco (upsert) + atualiza cache + objetos vivos.
 *  badges = array (substitui inteiro). Demais = merge. */
export async function saveSettings(category: SettingCategory, patch: Record<string, number> | any[]): Promise<AnySettings> {
  if (category === 'badges' && Array.isArray(patch)) {
    (cache as any)[category] = patch;
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
