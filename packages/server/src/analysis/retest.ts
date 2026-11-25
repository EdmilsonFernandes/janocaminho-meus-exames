// "Hora de repetir o exame" (25/11/26). O estudo de uso mostrou que quase ninguém volta depois do
// 1º exame — e o app não tinha um chamado no PRAZO: alerta só nos 30 dias seguintes e dica genérica
// só depois de 1 ano. Aqui calculamos UMA data por paciente, a partir do exame mais recente.
//
// Limite de segurança (IA de saúde não diagnostica nem prescreve): o texto NUNCA manda repetir.
// Ele lembra que o prazo comum chegou e devolve a decisão ao médico.
import { prisma } from '../prisma';

/** Prazo em meses: exame com algum valor fora da faixa → 3; tudo dentro → 12. */
export const RETEST_MONTHS_ABNORMAL = 3;
export const RETEST_MONTHS_ROUTINE = 12;
/** A partir de quantos dias antes do prazo o cartão da Home passa a aparecer como "chegando". */
export const RETEST_SOON_DAYS = 30;

export interface RetestPlan {
  examId: string;
  lastExamAt: string; // ISO
  dueAt: string; // ISO
  months: number;
  reason: 'alterado' | 'rotina';
  /** Até 3 nomes de exames que estavam fora da faixa (vazio quando reason = 'rotina'). */
  markers: string[];
  daysUntil: number; // negativo = já passou
  status: 'longe' | 'chegando' | 'chegou';
}

/** Laudos trazem o nome em MAIÚSCULAS ("COLESTEROL HDL"). No aviso vira "Colesterol HDL": siglas de
 *  até 4 letras (HDL, TSH, TGO, CK) ficam como estão; o resto fica em minúsculas com a 1ª letra maiúscula. */
const SMALL_WORDS = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'EM', 'NO', 'NA', 'POR', 'COM']);
export function prettyMarker(name: string): string {
  const t = name.trim().replace(/\s+/g, ' ');
  if (!t || t !== t.toUpperCase()) return t; // já veio com caixa própria
  const out = t.split(' ').map((w) => (w.length <= 4 && /^[A-Z0-9-]+$/.test(w) && !SMALL_WORDS.has(w) ? w : w.toLowerCase())).join(' ');
  return out.charAt(0).toUpperCase() + out.slice(1);
}

function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getTime());
  const day = out.getUTCDate();
  out.setUTCMonth(out.getUTCMonth() + months);
  if (out.getUTCDate() !== day) out.setUTCDate(0); // 31/11 não existe → último dia do mês
  return out;
}

/** Função pura (testada): dado o exame mais recente e o que estava alterado, devolve o plano. */
export function planRetest(
  exam: { id: string; date: Date; abnormal: string[] },
  now: Date = new Date(),
): RetestPlan {
  const seen = new Set<string>();
  const markers: string[] = [];
  for (const n of exam.abnormal) {
    const pretty = prettyMarker(n);
    const key = pretty.toLowerCase();
    if (!pretty || seen.has(key)) continue; // "COLESTEROL HDL" e "colesterol hdl" são o mesmo exame
    seen.add(key);
    markers.push(pretty);
    if (markers.length === 3) break;
  }
  const reason: RetestPlan['reason'] = markers.length ? 'alterado' : 'rotina';
  const months = reason === 'alterado' ? RETEST_MONTHS_ABNORMAL : RETEST_MONTHS_ROUTINE;
  const due = addMonths(exam.date, months);
  const daysUntil = Math.ceil((due.getTime() - now.getTime()) / 86400000);
  return {
    examId: exam.id,
    lastExamAt: exam.date.toISOString(),
    dueAt: due.toISOString(),
    months,
    reason,
    markers,
    daysUntil,
    status: daysUntil <= 0 ? 'chegou' : daysUntil <= RETEST_SOON_DAYS ? 'chegando' : 'longe',
  };
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

/** Texto do aviso (push, central e e-mail). Nunca manda repetir: lembra o prazo e aponta o médico. */
export function retestMessage(firstName: string, plan: RetestPlan): { title: string; body: string } {
  const who = firstName ? `${firstName}, ` : '';
  if (plan.reason === 'alterado') {
    const what = joinNames(plan.markers);
    const verb = plan.markers.length > 1 ? 'saíram' : 'saiu';
    return {
      title: `${who}faz ${plan.months} meses do seu exame`,
      body: `${what} ${verb} da faixa naquele exame. É comum repetir por volta desse prazo para ver como ficou — vale combinar com seu médico. Quando fizer, envie aqui para comparar.`,
    };
  }
  return {
    title: `${who}faz 1 ano do seu último exame`,
    body: 'Muita gente refaz os exames de rotina uma vez por ano. Se o seu médico pedir novos, envie aqui para comparar com os anteriores.',
  };
}

/** Exame EXTRAÍDO mais recente do paciente + o que estava fora da faixa nele. null = sem exame. */
export async function getRetestPlan(patientId: string, now: Date = new Date()): Promise<RetestPlan | null> {
  const exams = await prisma.exam.findMany({
    where: { patientId, status: 'EXTRACTED' },
    select: { id: true, performedAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 60,
  });
  if (!exams.length) return null;
  // "mais recente" pela data em que o exame foi FEITO (um PDF antigo enviado hoje não reinicia o prazo)
  const latest = exams
    .map((e) => ({ id: e.id, date: e.performedAt ?? e.createdAt }))
    .sort((a, b) => b.date.getTime() - a.date.getTime())[0];
  const items = await prisma.examItem.findMany({
    where: { examId: latest.id, isAbnormal: true },
    select: { name: true },
    take: 20,
  });
  return planRetest({ id: latest.id, date: latest.date, abnormal: items.map((i) => i.name) }, now);
}
