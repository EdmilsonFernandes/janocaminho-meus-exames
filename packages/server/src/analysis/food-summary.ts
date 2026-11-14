/**
 * Resumo personalizado de alimentação (IA), para a tela "Alimentação e seus exames".
 *
 * A IA NÃO é a fonte: ela só costura, em linguagem simples, os FATOS do dicionário curado
 * (analysis/food-guide.ts) com os exames alterados da pessoa. Tudo o que ela devolve passa pelas
 * mesmas travas do dicionário (sem quantidade, porção, suplemento com dose ou promessa) e pelo
 * diagnosticGuard. Texto reprovado não é salvo nem cobrado.
 */
import { getLlm, getModel } from '../llm';
import { JSON_SUFFIX, extractJsonObject } from '../utils/json';
import { HEALTH_SYSTEM, diagnosticGuard } from './system';
import type { FoodMatch } from './food-guide';

export interface FoodSummaryContent {
  /** 1 parágrafo: o que os exames alterados têm em comum e o que a alimentação pode fazer. */
  resumo: string;
  /** Até 3 mudanças, da mais útil para a menos, tiradas dos fatos. */
  comecarPor: string[];
  /** O que não se resolve com alimentação e precisa ir ao médico. */
  levarAoMedico: string;
}

export class UnsafeFoodSummaryError extends Error {}

/** Muda quando muda o conjunto de exames alterados (ou o valor de algum): aí o cache vence. */
export function foodSignature(matches: FoodMatch[]): string {
  return matches.map((m) => `${m.guide.key}:${m.direction}:${m.value}`).sort().join('|');
}

const BANNED: Array<[RegExp, string]> = [
  [/\b\d+([.,]\d+)?\s?(mg|mcg|µg|g|kg|ml|l|kcal|calorias|ui)\b/i, 'cita quantidade'],
  [/\b(gramas?|porç(ão|ões) de|xícaras?|colher(es)? de|cápsulas?|comprimidos?|doses?)\b/i, 'cita porção ou dose'],
  [/\b(cardápio|plano alimentar|dieta de \d|jejum)\b/i, 'monta dieta'],
  [/\b(cura|curar|garant\w+|elimina\w*|normaliza em|resolve em|sem precisar de remédio)\b/i, 'promete resultado'],
  [/\b(suplement\w+ de|tome|tomar) (ômega|omega|vitamina|ferro|magnésio|zinco|creatina|whey)\b/i, 'indica suplemento'],
  [/\b(pare|suspenda|reduza|aumente) (o|a|os|as|seu|sua) (remédio|medicamento|dose)\b/i, 'orienta medicação'],
];

export function foodSummaryProblems(c: Partial<FoodSummaryContent> | null): string[] {
  if (!c) return ['sem conteúdo'];
  const out: string[] = [];
  const resumo = String(c.resumo ?? '').trim();
  const medico = String(c.levarAoMedico ?? '').trim();
  const steps = Array.isArray(c.comecarPor) ? c.comecarPor.map((s) => String(s ?? '').trim()).filter(Boolean) : [];
  if (resumo.length < 60 || resumo.length > 900) out.push('resumo fora do tamanho');
  if (medico.length < 20 || medico.length > 500) out.push('orientação médica fora do tamanho');
  if (steps.length < 1 || steps.length > 3 || steps.some((s) => s.length > 200)) out.push('lista "começar por" inválida');
  const all = [resumo, medico, ...steps].join(' \n ');
  for (const [re, why] of BANNED) if (re.test(all)) out.push(why);
  return out;
}

function buildPrompt(matches: FoodMatch[]): string {
  const lines = matches.map((m) => {
    const g = m.guide;
    const evid = g.strength === 'nao-resolve' ? 'ALIMENTAÇÃO NÃO RESOLVE' : `evidência ${g.strength}`;
    return [
      `- ${g.label}: ${m.value}${m.unit ? ` ${m.unit}` : ''}, ${m.direction === 'alto' ? 'acima' : 'abaixo'} da faixa do laudo (${evid}).`,
      `  Fato: ${g.summary}`,
      g.helps.length ? `  Costuma ajudar: ${g.helps.join('; ')}.` : '',
      g.avoid.length ? `  Costuma atrapalhar: ${g.avoid.join('; ')}.` : '',
      `  Só a alimentação resolve? ${g.dietAlone}`,
    ].filter(Boolean).join('\n');
  });
  return [
    'Você vai escrever um resumo educativo de ALIMENTAÇÃO para um paciente leigo, em português do Brasil, a partir dos exames dele que estão fora da faixa.',
    '',
    'EXAMES E FATOS (use SOMENTE estes fatos; não acrescente alimento, nutriente ou conselho que não esteja aqui):',
    ...lines,
    '',
    'REGRAS:',
    '- Linguagem simples, direta, sem alarmismo e sem julgamento. Trate por "você".',
    '- NÃO cite quantidade, porção, medida, caloria, número de refeições, cardápio nem suplemento.',
    '- NÃO prometa resultado nem prazo. NÃO diga para mudar remédio.',
    '- Quando um exame for "ALIMENTAÇÃO NÃO RESOLVE", diga isso claramente e mande ao médico; não sugira alimento para ele.',
    '- Se dois exames respondem às mesmas mudanças, mostre essa ligação: é o que torna o resumo útil.',
    '',
    'Responda em JSON com exatamente estas chaves:',
    '{"resumo": "um parágrafo de 3 a 5 frases", "comecarPor": ["até 3 mudanças concretas, da mais útil para a menos, cada uma em 1 frase curta"], "levarAoMedico": "1 a 2 frases: o que desses exames precisa de avaliação médica"}',
    JSON_SUFFIX,
  ].join('\n');
}

/** Gera o resumo; até 2 tentativas. Lança UnsafeFoodSummaryError se as duas forem reprovadas. */
export async function generateFoodSummary(matches: FoodMatch[]): Promise<FoodSummaryContent> {
  let problems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const s = await getLlm().stream({ model: getModel(), maxTokens: 16000, system: HEALTH_SYSTEM, messages: [{ role: 'user', content: buildPrompt(matches) }] });
    const resp = await s.final();
    let raw: Partial<FoodSummaryContent> | null = null;
    try { raw = extractJsonObject(resp.text) as Partial<FoodSummaryContent>; } catch { raw = null; }
    if (!raw) { problems = ['sem JSON']; continue; }
    const content: FoodSummaryContent = {
      resumo: diagnosticGuard(String(raw.resumo ?? '').trim()).text,
      comecarPor: (Array.isArray(raw.comecarPor) ? raw.comecarPor : []).map((x) => diagnosticGuard(String(x ?? '').trim()).text).filter(Boolean).slice(0, 3),
      levarAoMedico: diagnosticGuard(String(raw.levarAoMedico ?? '').trim()).text,
    };
    problems = foodSummaryProblems(content);
    if (!problems.length) return content;
  }
  console.warn(`[food-summary] reprovado pelas travas: ${problems.join('; ')}`);
  throw new UnsafeFoodSummaryError(problems.join('; '));
}
