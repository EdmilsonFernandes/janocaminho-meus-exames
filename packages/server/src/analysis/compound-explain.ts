/**
 * compound-explain.ts — explicação LEIGA de cada composto do Radar Hormonal (botão "?").
 *
 * Mesmo conceito do explain.ts dos exames: cache em banco (compound_knowledge) + geração
 * por IA só quando falta. A 1ª pessoa que toca no "?" paga a geração (do servidor, não em
 * créditos); todas as seguintes leem do banco. Bump em COMPOUND_PROMPT_VERSION regenera.
 *
 * Por que é mais travado que o dos exames:
 *  - só aceita ids do CATÁLOGO abaixo (ninguém gera texto para um nome livre);
 *  - o prompt recebe os FATOS de cada composto (classe, via, uso médico) — a IA explica,
 *    não inventa;
 *  - a saída é REJEITADA (e não vai para o cache) se trouxer dose, esquema de uso, TPC,
 *    onde comprar ou adjetivo de segurança ("leve", "seguro", "para iniciantes");
 *  - a seção "quando procurar atendimento" NÃO é gerada: é texto fixo no app.
 *
 * Redução de danos: quem já usa precisa entender o que usa. Não incentiva, não ensina a
 * usar, não julga. O conteúdo é o mesmo para todos (nenhum dado do paciente entra aqui).
 */
import { getLlm, getModel } from '../llm';
import { JSON_SUFFIX, extractJsonObject } from '../utils/json';
import { prisma } from '../prisma';
import { HEALTH_SYSTEM, diagnosticGuard } from './system';

/** Bump = invalida o cache (as linhas antigas viram "miss" e são regeneradas). */
export const COMPOUND_PROMPT_VERSION = 'v1';
const LOCALE = 'pt-BR';

export const COMPOUND_SECTION_KEYS = ['oQueE', 'noCorpo', 'porQueUsam', 'nosExames', 'riscos', 'levarAoMedico'] as const;
export type CompoundSectionKey = (typeof COMPOUND_SECTION_KEYS)[number];
export type CompoundSections = Record<CompoundSectionKey, string>;

interface CompoundFact {
  name: string;
  /** Fatos que a IA deve usar como base (classe, via, duração relativa, uso médico no Brasil). */
  facts: string;
}

const TESTO = 'É um éster de TESTOSTERONA, o principal hormônio masculino. Vira estradiol em parte (aromatiza). Tem uso médico reconhecido: reposição em homens com hipogonadismo diagnosticado.';

/** Mesmos ids de packages/web/src/utils/hormoneRadar.ts (RADAR_COMPOUNDS). */
export const COMPOUND_CATALOG: Record<string, CompoundFact> = {
  sustanon: { name: 'Durateston / Sustanon', facts: `${TESTO} É uma MISTURA de quatro ésteres de testosterona num mesmo frasco: parte age rápido, parte dura semanas. Injetável.` },
  test_cyp: { name: 'Testosterona Cipionato (Deposteron)', facts: `${TESTO} Injetável de ação longa (dias a semanas).` },
  test_enan: { name: 'Testosterona Enantato', facts: `${TESTO} Injetável de ação longa (dias a semanas).` },
  test_prop: { name: 'Testosterona Propionato', facts: `${TESTO} Injetável de ação CURTA: sobe e cai em poucos dias, por isso exige aplicações frequentes.` },
  test_und: { name: 'Testosterona Undecanoato (Nebido)', facts: `${TESTO} Injetável de ação MUITO longa: uma aplicação dura muitas semanas e leva meses para estabilizar.` },
  nand_dec: { name: 'Nandrolona Decanoato (Deca)', facts: 'É um derivado da testosterona (nandrolona), injetável de ação longa. Quase não vira estradiol. Suprime fortemente a produção natural de testosterona, e essa supressão pode durar muito depois de parar. Uso médico hoje é restrito a situações específicas.' },
  nand_npp: { name: 'Nandrolona Fenilpropionato (NPP)', facts: 'É nandrolona (derivado da testosterona) com éster de ação mais curta que o decanoato. Injetável. Quase não vira estradiol. Suprime a produção natural de testosterona. Uso médico hoje é restrito a situações específicas.' },
  mast_prop: { name: 'Drostanolona Propionato (Masteron)', facts: 'É um derivado do DHT (drostanolona), injetável de ação curta. Não vira estradiol. Não tem uso médico corrente. Costuma pesar no colesterol (HDL) e, como todo andrógeno, suprime a produção natural de testosterona.' },
  mast_enan: { name: 'Drostanolona Enantato (Masteron)', facts: 'É um derivado do DHT (drostanolona), injetável de ação longa. Não vira estradiol. Não tem uso médico corrente. Costuma pesar no colesterol (HDL) e suprime a produção natural de testosterona.' },
  bold_und: { name: 'Boldenona Undecilenato', facts: 'É um derivado da testosterona de ação MUITO longa, injetável. Produto de uso VETERINÁRIO: não é aprovado para uso em humanos. Vira estradiol em pequena parte. Costuma elevar bastante os glóbulos vermelhos (hematócrito).' },
  tren_ace: { name: 'Trembolona Acetato', facts: 'É um andrógeno muito potente, injetável de ação curta. Produto de uso VETERINÁRIO: não é aprovado para uso em humanos. Não vira estradiol. É associado a efeitos marcantes em sono, humor, pressão e colesterol.' },
  tren_enan: { name: 'Trembolona Enantato', facts: 'É um andrógeno muito potente, injetável de ação longa. Produto de uso VETERINÁRIO: não é aprovado para uso em humanos. Não vira estradiol. É associado a efeitos marcantes em sono, humor, pressão e colesterol.' },
  oxand: { name: 'Oxandrolona', facts: 'É um derivado do DHT tomado por via ORAL (comprimido), de ação curta. Por ser oral, passa pelo fígado e pode elevar as enzimas hepáticas; costuma derrubar o colesterol HDL mais que os injetáveis. Não vira estradiol. Tem uso médico restrito a situações específicas.' },
};

const SECTION_GUIDE: Record<CompoundSectionKey, string> = {
  oQueE: 'O que é: 2 frases. Que tipo de substância é, se é injetável ou comprimido, se age por pouco ou muito tempo (em palavras, sem números).',
  noCorpo: 'O que faz no corpo: 2 a 3 frases. Efeitos buscados E indesejados juntos, incluindo que o corpo reduz ou desliga a própria produção de testosterona.',
  porQueUsam: 'Por que alguém usa: 2 a 3 frases. O uso médico reconhecido (ou que não há) conforme os FATOS; e, sem julgar, que há quem use sem receita por estética ou desempenho.',
  nosExames: 'O que costuma mudar nos exames: 2 a 3 frases, falando dos exames que o médico acompanha (glóbulos vermelhos/hematócrito, colesterol, hormônios, e fígado quando for oral). Deixe claro que exame normal não descarta dano.',
  riscos: 'Riscos que as pessoas mais subestimam: 3 a 4 frases. Fertilidade e testículos, coração e pressão, sangue mais espesso, humor e sono, efeitos em mulheres que podem não reverter, e produto falsificado.',
  levarAoMedico: 'O que levar ao médico: 3 perguntas curtas, prontas para o paciente fazer, separadas por " | ". Lembre que contar tudo o que usa ajuda a interpretar os exames e é protegido por sigilo.',
};

function buildPrompt(fact: CompoundFact): string {
  return `Escreva um cartão EDUCATIVO, em português do Brasil, para um PACIENTE LEIGO que pode ter começado a usar "${fact.name}" sem entender o que é.

FATOS (use como base; não contradiga nem acrescente detalhes técnicos além deles):
${fact.facts}
Contexto legal, cite em UMA frase dentro de "porQueUsam": é medicamento controlado no Brasil e os médicos são proibidos pelo conselho de medicina de prescrever anabolizantes para fins estéticos ou de desempenho.

REGRAS OBRIGATÓRIAS:
- NUNCA cite dose, miligramas, mililitros, frequência de aplicação, duração de uso, ciclo, combinação com outras substâncias, "TPC", "protetores", onde comprar ou como reconhecer produto original.
- NUNCA diga que é "seguro", "leve", "tranquilo", "fraco" ou "bom para iniciantes", nem compare a segurança com outros compostos.
- NUNCA mande parar, reduzir ou continuar. Diga que qualquer mudança, inclusive parar, deve ser conversada com o médico.
- Sem sermão, sem ameaça, sem julgamento. Tom de adulto para adulto, em segunda pessoa ("você"), frases curtas, palavras do dia a dia. Explique qualquer termo técnico na hora.
- Use "costuma", "pode", "em parte das pessoas". Não invente números nem porcentagens.
- Não diagnostique.

Devolva APENAS JSON com exatamente estas chaves (texto corrido em cada uma):
${COMPOUND_SECTION_KEYS.map((k) => `"${k}": ${SECTION_GUIDE[k]}`).join('\n')}${JSON_SUFFIX}`;
}

/** Motivos para NÃO publicar um texto gerado (ele é exibido a todos os pacientes). */
export function compoundTextProblems(sections: Partial<CompoundSections>): string[] {
  const problems: string[] = [];
  const all = COMPOUND_SECTION_KEYS.map((k) => String(sections[k] ?? '')).join('\n');
  for (const k of COMPOUND_SECTION_KEYS) {
    const text = String(sections[k] ?? '').trim();
    if (text.length < 40) problems.push(`seção curta ou ausente: ${k}`);
    if (text.length > 900) problems.push(`seção longa demais: ${k}`);
  }
  if (/\d+([.,]\d+)?\s?(mg|ml|mcg|µg|ui|g)\b/i.test(all)) problems.push('cita dose');
  if (/\b\d+\s?(x|vezes)\s?(por|na|a cada)\s?(semana|dia)|a cada\s+\d+\s+dias|por\s+\d+\s+semanas/i.test(all)) problems.push('cita esquema de uso');
  if (/\bTPC\b|terapia p[oó]s[- ]ciclo|\bciclos? de\b|\bstack\b|empilh/i.test(all)) problems.push('fala de ciclo/TPC');
  // O \b do JavaScript não enxerga letra acentuada ("É seguro." passava): limite feito à mão, com a flag u.
  if (/(^|[^\p{L}])(é|e)\s+(bem\s+|muito\s+)?(seguro|segura|leve|tranquilo|tranquila|fraco|fraca)(?!\p{L})|para iniciantes|mais segur[oa] que|menos perigos[oa] que/iu.test(all)) problems.push('adjetivo de segurança');
  if (/onde comprar|como comprar|produto original|farm[aá]cia de manipula/i.test(all)) problems.push('fala de aquisição');
  if (/\b(pare|interrompa|suspenda|reduza|continue)\s+(de\s+)?(usar|o uso|a dose|tomando|aplicando)/i.test(all)) problems.push('orienta conduta');
  return problems;
}

async function readCached(key: string): Promise<CompoundSections | null> {
  const row = await prisma.compoundKnowledge.findFirst({
    where: { compoundKey: key, locale: LOCALE, promptVersion: COMPOUND_PROMPT_VERSION },
    select: { sections: true },
  });
  return row ? (row.sections as unknown as CompoundSections) : null;
}

export class UnknownCompoundError extends Error {}
export class UnsafeCompoundTextError extends Error {}

/** Cache-ou-gera. Lança UnknownCompoundError (id fora do catálogo) ou UnsafeCompoundTextError. */
export async function getOrCreateCompoundExplanation(compoundId: string): Promise<{ name: string; sections: CompoundSections; cached: boolean }> {
  const fact = Object.prototype.hasOwnProperty.call(COMPOUND_CATALOG, compoundId) ? COMPOUND_CATALOG[compoundId] : null;
  if (!fact) throw new UnknownCompoundError(compoundId);
  const cached = await readCached(compoundId);
  if (cached) return { name: fact.name, sections: cached, cached: true };

  // Até 2 tentativas: um texto reprovado pelas travas não é publicado nem cacheado.
  let lastProblems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const s = await getLlm().stream({ model: getModel(), maxTokens: 16000, system: HEALTH_SYSTEM, messages: [{ role: 'user', content: buildPrompt(fact) }] });
    const resp = await s.final();
    let raw: Partial<CompoundSections> | null = null;
    try { raw = extractJsonObject(resp.text) as Partial<CompoundSections>; } catch { raw = null; }
    if (!raw) { lastProblems = ['sem JSON']; continue; }
    const sections = Object.fromEntries(COMPOUND_SECTION_KEYS.map((k) => [k, diagnosticGuard(String(raw![k] ?? '').trim()).text])) as CompoundSections;
    lastProblems = compoundTextProblems(sections);
    if (lastProblems.length) continue;
    const data = { compoundKey: compoundId, locale: LOCALE, promptVersion: COMPOUND_PROMPT_VERSION, source: 'ai', sections };
    await prisma.compoundKnowledge.upsert({ where: { compoundKey_locale: { compoundKey: compoundId, locale: LOCALE } }, create: data, update: data });
    return { name: fact.name, sections, cached: false };
  }
  console.warn(`[compound-explain] ${compoundId} reprovado pelas travas: ${lastProblems.join('; ')}`);
  throw new UnsafeCompoundTextError(lastProblems.join('; '));
}

/**
 * Aquecimento no boot: gera, UMA de cada vez e sem pressa, as explicações que ainda não
 * estão no banco para a versão atual do prompt — assim ninguém espera 1–2 min no 1º toque.
 * São no máximo 13 chamadas por versão; depois disso não chama mais a IA. Falha é silenciosa
 * (a rota continua gerando sob demanda). Desligado em teste.
 */
export function startCompoundKnowledgeWarmup(delayMs = 90_000): void {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return;
  setTimeout(() => {
    void (async () => {
      let made = 0;
      for (const id of Object.keys(COMPOUND_CATALOG)) {
        try {
          const out = await getOrCreateCompoundExplanation(id);
          if (!out.cached) made++;
        } catch { /* reprovado ou IA fora: fica para o próximo boot ou para o clique */ }
      }
      if (made) console.log(`[compound-explain] aquecimento: ${made} explicação(ões) gerada(s)`);
    })();
  }, delayMs).unref?.();
}
