import { prisma } from '../prisma';
import { CREDIT_COSTS, UPLOAD_RULES } from './credits';

// Defaults da config de monetização (categoria → objeto). Usados quando o banco está vazio.
// creditCosts/uploadRules ESPELHAM os objetos vivos de credits.ts — loadSettings/saveSettings
// os sincronizam, então quem já lê `CREDIT_COSTS.chat` continua funcionando (sem mudar imports).
export const DEFAULT_SETTINGS = {
  creditCosts: { extraction: 0, summary: 10, consolidated: 20, chat: 2 },
  uploadRules: { freeCost: 1, premiumFreeQuota: 6, premiumCost: 5 },
  grants: { freeSignup: 60, monthly: 250, freeExamLimit: 2 },
  shares: { exams: 5, evolution: 5, alerts: 3, summary: 5 }, // custo por escopo ao compartilhar c/ médico
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
      if (r.key in next) Object.assign((next as any)[r.key], r.value as object);
    }
    cache = next;
    applyToLive(cache);
  } catch (e) {
    console.warn('[settings] loadSettings falhou (usando defaults):', (e as Error).message);
  }
}

/** Grava uma categoria no banco (upsert) + atualiza cache + objetos vivos. */
export async function saveSettings(category: SettingCategory, patch: Record<string, number>): Promise<AnySettings> {
  const merged = { ...(cache as any)[category], ...patch };
  (cache as any)[category] = merged;
  await prisma.appSetting.upsert({
    where: { key: category },
    update: { value: merged as any },
    create: { key: category, value: merged as any },
  });
  applyToLive(cache);
  return cache;
}
