// "Por que me sinto assim?" (estudo Guava 21/11 — gap #2).
// Correlações do DIÁRIO (sintomas/humor/energia) com sono, atividade e FC do
// Health Connect — a camada que a Guava NÃO tem: cruzamos o dia-a-dia com o
// contexto clínico, e a IA só TRADUZ conclusões estatísticas estruturadas
// (mesma filosofia do correlation-engine: a LLM nunca inventa números).
import { prisma } from '../prisma';
import { getChatLlm, getModel } from '../llm';
import { HEALTH_SYSTEM, diagnosticGuard } from './system';

export interface DailyInsight {
  kind: 'symptom_vs_sleep' | 'mood_vs_sleep' | 'energy_vs_activity' | 'symptom_frequency';
  title: string;          // "Dor de cabeça × sono curto"
  detail: string;         // texto educativo (pré-IA, baseado nos números)
  support: number;        // dias que sustentam a observação
  direction: 'worse' | 'better' | 'neutral';
}

/** Estatística pura: média de X em dias com vs. sem a condição. Só retorna com suporte mínimo. */
function avgDiff(withVals: number[], withoutVals: number[]): { withAvg: number; withoutAvg: number; n: number } | null {
  if (withVals.length < 3 || withoutVals.length < 3) return null; // sem massa estatística
  const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  return { withAvg: avg(withVals), withoutAvg: avg(withoutVals), n: withVals.length };
}

const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round(((a - b) / b) * 100));

/**
 * Passada estatística sobre os dados do paciente. Retorna insights estruturados
 * (sem IA) — a chamada de IA é opcional e apenas traduz o que já está provado.
 */
export async function computeDailyInsights(patientId: string): Promise<{ ready: boolean; daysLogged: number; insights: DailyInsight[] }> {
  const since = new Date(Date.now() - 30 * 86400000);
  const [logs, hc] = await Promise.all([
    prisma.dailyLog.findMany({
      where: { patientId, date: { gte: since } },
      orderBy: { date: 'asc' },
      select: { date: true, symptoms: true, mood: true, energy: true },
    }),
    prisma.measurement.findMany({
      where: { patientId, note: 'Health Connect', type: { in: ['SLEEP_MINUTES', 'STEPS'] }, measuredAt: { gte: since } },
      select: { type: true, value: true, measuredAt: true },
    }),
  ]);

  // Mapa HC por dia: sono (min) e passos
  const hcByDay = new Map<string, { sleepMin?: number; steps?: number }>();
  for (const r of hc) {
    const key = r.measuredAt.toISOString().slice(0, 10);
    const e = hcByDay.get(key) ?? {};
    if (r.type === 'SLEEP_MINUTES') e.sleepMin = r.value;
    if (r.type === 'STEPS') e.steps = r.value;
    hcByDay.set(key, e);
  }

  if (logs.length < 4) return { ready: false, daysLogged: logs.length, insights: [] };

  const insights: DailyInsight[] = [];

  // Sintoma × sono (cada sintoma do catálogo presente nos logs)
  const symptomDays = new Map<string, { sleepWith: number[]; sleepWithout: number[] }>();
  for (const log of logs) {
    const day = log.date.toISOString().slice(0, 10);
    const sleepMin = hcByDay.get(day)?.sleepMin;
    if (sleepMin == null || sleepMin < 60) continue; // sem sono confiável neste dia
    for (const [key] of SYMPTOM_LABEL_DEFAULT) {
      const bucket = symptomDays.get(key) ?? { sleepWith: [], sleepWithout: [] };
      (log.symptoms ?? []).includes(key) ? bucket.sleepWith.push(sleepMin) : bucket.sleepWithout.push(sleepMin);
      symptomDays.set(key, bucket);
    }
  }
  for (const [key, b] of symptomDays) {
    const d = avgDiff(b.sleepWith, b.sleepWithout);
    if (!d) continue;
    const diffPct = pct(d.withAvg, d.withoutAvg);
    if (diffPct <= -15) { // dormiu ≥15% menos nos dias com o sintoma
      insights.push({
        kind: 'symptom_vs_sleep',
        title: `${SYMPTOM_LABEL_DEFAULT.get(key)} × sono`,
        detail: `Nos ${d.n} dias com "${SYMPTOM_LABEL_DEFAULT.get(key)}", você dormiu em média ${Math.round(d.withAvg / 60)}h${String(Math.round(d.withAvg % 60)).padStart(2, '0')} — ${Math.abs(diffPct)}% menos que nos dias sem o sintoma (${Math.round(d.withoutAvg / 60)}h${String(Math.round(d.withoutAvg % 60)).padStart(2, '0')}).`,
        support: d.n,
        direction: 'worse',
      });
    }
  }

  // Humor × sono
  const moodWithSleep = logs
    .map((l) => ({ mood: l.mood, sleepMin: hcByDay.get(l.date.toISOString().slice(0, 10))?.sleepMin }))
    .filter((x): x is { mood: number; sleepMin: number } => x.mood != null && x.sleepMin != null && x.sleepMin >= 60);
  if (moodWithSleep.length >= 6) {
    const low = moodWithSleep.filter((x) => x.mood <= 2).map((x) => x.sleepMin);
    const good = moodWithSleep.filter((x) => x.mood >= 4).map((x) => x.sleepMin);
    const d = avgDiff(low, good);
    if (d && pct(d.withAvg, d.withoutAvg) <= -15) {
      insights.push({
        kind: 'mood_vs_sleep',
        title: 'Humor × sono',
        detail: `Em dias de humor baixo (1-2), você dormiu em média ${Math.round(d.withAvg / 60)}h — vs ${Math.round(d.withoutAvg / 60)}h nos dias de humor bom (4-5).`,
        support: low.length,
        direction: 'worse',
      });
    }
  }

  // Energia × atividade (passos)
  const energyWithSteps = logs
    .map((l) => ({ energy: l.energy, steps: hcByDay.get(l.date.toISOString().slice(0, 10))?.steps }))
    .filter((x): x is { energy: number; steps: number } => x.energy != null && x.steps != null);
  if (energyWithSteps.length >= 6) {
    const low = energyWithSteps.filter((x) => x.energy <= 2).map((x) => x.steps);
    const good = energyWithSteps.filter((x) => x.energy >= 4).map((x) => x.steps);
    const d = avgDiff(low, good);
    if (d && pct(d.withAvg, d.withoutAvg) <= -25) {
      insights.push({
        kind: 'energy_vs_activity',
        title: 'Energia × movimento',
        detail: `Nos dias de energia baixa, você andou em média ${Math.round(d.withAvg).toLocaleString('pt-BR')} passos — ${Math.abs(pct(d.withAvg, d.withoutAvg))}% menos que nos dias de energia boa (${Math.round(d.withoutAvg).toLocaleString('pt-BR')}).`,
        support: low.length,
        direction: 'neutral',
      });
    }
  }

  return { ready: true, daysLogged: logs.length, insights: insights.slice(0, 4) };
}

/** Tradução da IA (opcional): só reescreve em linguagem natural o que os números já disseram. */
export async function narrateDailyInsights(patientName: string, stats: { daysLogged: number; insights: DailyInsight[] }): Promise<string> {
  if (stats.insights.length === 0) {
    return `Continue registrando — com mais alguns dias de diário consigo cruzar seus sintomas com sono, movimento e exames.`;
  }
  const bullets = stats.insights.map((i) => `- ${i.title}: ${i.detail}`).join('\n');
  const prompt = `Paciente: ${patientName}. Últimos ${stats.daysLogged} dias de diário de saúde (sintomas, humor 1-5, energia 1-5) cruzados com sono e passos do celular.

Observações ESTATÍSTICAS já calculadas (use EXATAMENTE estes números, não invente outros):
${bullets}

Escreva 2-4 frases curtas em português do Brasil explicando os padrões para o paciente, em tom acolhedor e claro. NÃO diagnostique, NÃO prescreva. Termine com uma frase sugerindo levar o padrão ao médico na próxima consulta. Não use markdown.`;
  try {
    const r = await getChatLlm().complete({
      model: getModel(),
      system: HEALTH_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 500,
    });
    const text = (r.text ?? '').trim();
    if (!text) throw new Error('vazio');
    const guarded = diagnosticGuard(text);
    return guarded.text;
  } catch {
    // IA fora → devolve os bullets estruturados (nunca perde o insight por causa da IA)
    return stats.insights.map((i) => `${i.title}: ${i.detail}`).join('\n');
  }
}

// Catálogo espelhado do daily-log.routes.ts (import circular evitado: source of truth é a rota)
const SYMPTOM_LABEL_DEFAULT = new Map<string, string>([
  ['DOR_CABECA', 'Dor de cabeça'],
  ['CANSAICO', 'Cansaço'],
  ['INSONIA', 'Insônia'],
  ['DOR_CORPO', 'Dor no corpo'],
  ['NAUSEA', 'Náusea'],
  ['TONTURA', 'Tontura'],
  ['ANSIEDADE', 'Ansiedade'],
  ['FALTA_AR', 'Falta de ar'],
  ['DOR_ABDOMINAL', 'Dor abdominal'],
  ['FEBRE', 'Febre'],
]);
