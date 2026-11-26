// Utilidades do Diário de Saúde — catálogo de sintomas, dia no fuso do usuário e streak.
// Lógica PURA (sem DB). Antes vivia dentro de daily-log.routes.ts; agora é compartilhada
// com o panorama da saúde (GET /patients/:id/panorama), que lê o MESMO streak e os MESMOS
// rótulos de sintoma que a tela do diário — sem segunda conta.
export const SYMPTOM_CATALOG: { key: string; label: string }[] = [
  { key: 'DOR_CABECA', label: 'Dor de cabeça' },
  { key: 'CANSAICO', label: 'Cansaço' },
  { key: 'INSONIA', label: 'Insônia' },
  { key: 'DOR_CORPO', label: 'Dor no corpo' },
  { key: 'NAUSEA', label: 'Náusea' },
  { key: 'TONTURA', label: 'Tontura' },
  { key: 'ANSIEDADE', label: 'Ansiedade' },
  { key: 'FALTA_AR', label: 'Falta de ar' },
  { key: 'DOR_ABDOMINAL', label: 'Dor abdominal' },
  { key: 'FEBRE', label: 'Febre' },
];
export const SYMPTOM_KEYS = new Set(SYMPTOM_CATALOG.map((s) => s.key));
const SYMPTOM_LABEL = new Map(SYMPTOM_CATALOG.map((s) => [s.key, s.label]));

/** Rótulo legível de uma key de sintoma (key desconhecida → a própria key, nunca some). */
export function symptomLabel(key: string): string {
  return SYMPTOM_LABEL.get(key) ?? key;
}

const DAY_MS = 86_400_000;
const BR_TZ = 'America/Sao_Paulo';

/** 'YYYY-MM-DD' de uma data no fuso de São Paulo (o dia do usuário, não o do servidor UTC). */
export function brDayKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BR_TZ }).format(d);
}

/** 'YYYY-MM-DD' de hoje no fuso de São Paulo. */
export function brToday(now: Date = new Date()): string {
  return brDayKey(now);
}

/**
 * Streak: dias consecutivos com registro, terminando hoje ou ontem (fuso BR).
 * Ontem conta: quem registra de manhã cedo não deve ver a streak zerada.
 * `dates` = os dias com registro (DailyLog.date é gravado ao meio-dia UTC — o dia civil está
 * nos 10 primeiros caracteres do ISO, imune a fuso).
 */
export function computeDailyStreak(dates: Date[], now: Date = new Date()): number {
  const logged = new Set(dates.map((d) => d.toISOString().slice(0, 10)));
  let cursor: string | null = logged.has(brDayKey(now)) ? brDayKey(now) : brDayKey(new Date(now.getTime() - DAY_MS));
  let streak = 0;
  while (cursor && logged.has(cursor)) {
    streak++;
    cursor = brDayKey(new Date(new Date(`${cursor}T12:00:00Z`).getTime() - DAY_MS));
  }
  return streak;
}

/** As `n` chaves de dia (YYYY-MM-DD, fuso BR) terminando hoje, da mais antiga para a mais recente. */
export function lastBrDays(n: number, now: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(brDayKey(new Date(now.getTime() - i * DAY_MS)));
  return out;
}
