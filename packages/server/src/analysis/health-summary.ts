import { getLlm, getModel } from '../llm';
import { withRateLimitRetry } from '../utils/retry';
import { HealthSummarySchema, type HealthSummary } from '../extraction/schemas';
import { prisma } from '../prisma';
import { HEALTH_SYSTEM, diagnosticGuard } from './system';
import { JSON_SUFFIX, extractJsonObject } from '../utils/json';
import { patientSlug, memoryDigest, appendPatientMemory, saveFullReport } from './agent-memory';
import { buildCurrentHealthSummary, formatSnapshotContext, type MarkerState, type CurrentHealthSummary } from './health-state';
import { normalizeKey } from '../utils/normalize';

/**
 * PÓS-COERÇÃO (anti-alucinação): substitui os valores que a IA escreveu no comparativo pelos
 * REAIS do banco (MarkerState do snapshot). A IA só interpreta; os números vêm do DB. Previne
 * "TSH 3" quando o real é "2,75". Casa comparativo.name com marker por name/nameCanonical
 * (includes bidirecional após normalizeKey). Função PURA — testável isoladamente.
 */
export function coerceComparativo(summary: HealthSummary, markers: MarkerState[]): HealthSummary {
  if (!Array.isArray(summary.comparativo) || !summary.comparativo.length || !markers.length) return summary;
  return {
    ...summary,
    comparativo: summary.comparativo.map((c) => {
      const cn = normalizeKey(c.name ?? '');
      if (!cn) return c;
      const m = markers.find((mm) => {
        const a = normalizeKey(mm.name), b = normalizeKey(mm.nameCanonical);
        return cn === a || cn === b || (a && (a.includes(cn) || cn.includes(a))) || (b && (b.includes(cn) || cn.includes(b)));
      });
      if (m) return { ...c, atual: m.latest.valueText ?? c.atual ?? null, anterior: m.prior?.valueText ?? c.anterior ?? null };
      return c;
    }),
  };
}

/**
 * Pós-coerÇÃO ANTI-ALUCINAÇÃO DE PRAZO. A IA às vezes afirma "exame não medido há X meses"
 * olhando o histórico antigo e ignorando a medição RECENTE — mesmo quando o paciente TEM
 * outros marcadores realmente desatualizados (>12m), ela estende o prazo pra marcadores
 * recentes (ex: TGO/TGP de 12/06 viram "não medidos há 14 meses"). Por isso SEMPRE removemos
 * afirmações de PRAZO inventado ("há N meses/anos") do texto livre. A info de desatualização
 * REAL fica no comparativo estruturado (datas do DB) e na tag [DESATUALIZADO] do contexto —
 * a IA pode dizer "desatualizado" (sem prazo) mas NÃO inventar "há X meses".
 */
const STALENESS_RE = /(?:n[ãa]o\s+)?(?:foi\s+|foi\s+)?(?:medid[oa]|atualizad[oa]|desatualizad[oa]|coletad[oa]|feito|realizado|est[áa]|estava|est[áa]o)\s+h[áa]\s+(?:mais\s+de\s+)?\d+\s*(?:meses|anos|m[êe]s|ano)|h[áa]\s+(?:mais\s+de\s+)?\d+\s*(?:meses|anos|m[êe]s|ano)\s+(?:sem|que\s+n[ãa]o)/i;

export function coerceStaleness(summary: HealthSummary, _staleMarkers?: MarkerState[]): HealthSummary {
  const strip = (t: string | null | undefined): string => {
    if (!t) return '';
    return t
      .split(/(?<=[.!\n])\s+/)
      .filter((s) => !STALENESS_RE.test(s))
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  };
  return {
    ...summary,
    resumoGeral: strip(summary.resumoGeral),
    leituraFinal: strip(summary.leituraFinal),
    pontosAtencao: (summary.pontosAtencao ?? [])
      .map((p) => ({ ...p, detalhe: strip(p.detalhe) }))
      .filter((p) => p.titulo?.trim() && p.detalhe?.trim()),
    perguntasParaOMedico: (summary.perguntasParaOMedico ?? [])
      .map((q) => strip(typeof q === 'string' ? q : ''))
      .filter((q) => q.trim()),
  };
}

/**
 * GUARD PÓS-IA: impede que a IA apresente um marcador HISTÓRICO/DESATUALIZADO como atenção ATUAL.
 * Mesmo com o contexto rotulado ([HISTÓRICO]/[DESATUALIZADO]) e as regras de prompt, a IA às vezes
 * puxa do CONTEXTO HISTÓRICO e lista em `pontosAtencao` um marcador cuja única medição é antiga —
 * gerando o bug "TGP muito elevada" quando o único alterado é de 2018 (e há resultado normal em 2026).
 *
 * Validação ESTRUTURAL (não textual): cada `pontosAtencao.titulo` que casa (normalizeKey) com um
 * marcador do snapshot que é stale/outdated/histórico E sem versão fresca é REMOVIDO das atenções
 * atuais e reescrito como orientação de "sem medição recente" (anexado em `leituraFinal`).
 *
 * Conservador: casa só pelo `titulo`; se não casa com marcador conhecido, NÃO mexe (evita remover
 * atenções legítimas descritas com palavras próprias da IA). Função PURA — testável isoladamente.
 */
export function guardHistoricalAsCurrent(summary: HealthSummary, snapshot: CurrentHealthSummary): HealthSummary {
  const all = [...snapshot.topAttention, ...snapshot.improving, ...snapshot.worsening, ...snapshot.stale];
  if (!all.length || !Array.isArray(summary.pontosAtencao) || !summary.pontosAtencao.length) return summary;

  const keyOf = (m: MarkerState) => normalizeKey(m.nameCanonical) || normalizeKey(m.name);
  const isStale = (m: MarkerState) =>
    m.latest.stale || m.outdated || m.temporalClass === 'historico' || m.temporalClass === 'antigo' || m.temporalClass === 'desatualizado';

  const staleNames = new Set(all.filter(isStale).map(keyOf).filter(Boolean) as string[]);
  const freshNames = new Set(all.filter((m) => !isStale(m)).map(keyOf).filter(Boolean) as string[]);
  if (!staleNames.size) return summary; // nada stale → nada a corrigir

  const matches = (cn: string, set: Set<string>) =>
    !!cn && [...set].some((s) => s === cn || s.includes(cn) || cn.includes(s));

  const kept: HealthSummary['pontosAtencao'] = [];
  const cited: MarkerState[] = [];
  for (const p of summary.pontosAtencao) {
    const cn = normalizeKey(p.titulo ?? '');
    if (cn && matches(cn, staleNames) && !matches(cn, freshNames)) {
      const m = all.find((mm) => isStale(mm) && (keyOf(mm) === cn || (keyOf(mm) && (keyOf(mm).includes(cn) || cn.includes(keyOf(mm))))));
      if (m) cited.push(m);
      else kept.push(p); // não casou estruturalmente — mantém (conservador)
    } else {
      kept.push(p);
    }
  }
  if (!cited.length) return summary;

  // Reescreve os marcadores stale citados como atenção ATUAL → orientação "sem medição recente".
  const notas = cited.map((m) => {
    const ha = m.latest.ageMonths != null && m.latest.ageMonths >= 1 ? ` há cerca de ${Math.round(m.latest.ageMonths)} meses` : '';
    const val = m.latest.valueText ?? (m.latest.valueNumeric != null ? String(m.latest.valueNumeric).replace('.', ',') : '—');
    return `${m.name} (${val}${m.unit ? ' ' + m.unit : ''}, última medição${ha}) não tem medição recente, então não é possível afirmar o estado atual. Pode ser útil conversar com seu médico sobre refazer esse exame.`;
  });
  const append = `\n\nℹ️ Aviso de histórico: ${notas.join(' ')}`;
  return {
    ...summary,
    pontosAtencao: kept,
    leituraFinal: (summary.leituraFinal ?? '') + append,
  };
}

/**
 * Preenche a seção estruturada `desatualizados[]` a partir do snapshot (fonte: DB). Cada marcador
 * stale (medido há >staleMonths) vira {marcador, ultimoResultado, data, haMeses, situacao}. Mais
 * confiável que pedir à IA (que não tem as datas reais) e atende ao pedido de seção nomeada
 * "Acompanhamentos desatualizados". Função PURA — testável isoladamente.
 */
export function attachDesatualizados(summary: HealthSummary, snapshot: CurrentHealthSummary): HealthSummary {
  if (!snapshot.stale?.length) return summary;
  const fmtDate = (d: Date | null) => (d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null);
  const desatualizados = snapshot.stale.map((m) => ({
    marcador: m.name,
    ultimoResultado: m.latest.valueText ?? (m.latest.valueNumeric != null ? String(m.latest.valueNumeric).replace('.', ',') : null),
    data: fmtDate(m.latest.performedAt),
    haMeses: m.latest.ageMonths != null ? Math.round(m.latest.ageMonths) : null,
    situacao: m.flag && m.flag !== 'NORMAL' ? `alterado (${m.flag.toLowerCase()}) na última medição` : 'sem classificação de alteração no laudo',
  }));
  return { ...summary, desatualizados };
}

/**
 * Preenche `evolucao[]` a partir do snapshot.whatChanged (DB — deltas já calculados server-side).
 * Cada marcador com histórico vira {name, direcao (melhorou/piorou/estável/...), detalhe (Δ%)}.
 * Mais confiável que pedir à IA (que poderia inventar a direção/o número). Função PURA.
 */
export function attachEvolucao(summary: HealthSummary, snapshot: CurrentHealthSummary): HealthSummary {
  if (!snapshot.whatChanged?.length) return summary;
  const evolucao = snapshot.whatChanged.map((w) => ({
    name: w.name,
    direcao: w.trend,
    detalhe: w.deltaPct != null ? `${w.deltaPct > 0 ? '+' : ''}${Math.round(w.deltaPct)}%` : null,
  }));
  return { ...summary, evolucao };
}

/** Resumo CONSOLIDADO: junta os últimos exames (sangue/imagem/laudo) num documento único — "segunda opinião documental". */
export async function generateConsolidatedSummary(patientId: string, audience: 'patient' | 'doctor' = 'patient'): Promise<{ summary: HealthSummary; contentMd: string; modelUsed: string; usage: any }> {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) {
    const err = new Error('Paciente não encontrado');
    (err as any).status = 404;
    throw err;
  }
  // M1/M2: snapshot ESTRUTURAL do estado de saúde. Priorização temporal = dado rotulado
  // (ESTADO ATUAL / TENDÊNCIAS / CONTEXTO HISTÓRICO), não instrução de prompt.
  // Antes: take 3 exames + "priorize o 1º". Agora: buildCurrentHealthSummary (Layer 2).
  // includeStale: se o paciente só tem exames antigos (>12m), gera mesmo assim (com caveat de
  // desatualização) em vez de travar. markers===0 agora só acontece se NÃO há NENHUM exame extraído.
  const snapshot = await buildCurrentHealthSummary(patientId, { includeStale: true });
  if (snapshot.markers === 0) {
    const err = new Error('Você ainda não tem exames lidos pelo Dr. Exame. Envie um exame (PDF ou foto) para gerar o relatório.');
    (err as any).status = 400;
    throw err;
  }

  const perfil = patient.clinicalProfile?.trim();
  const perfilText = perfil ? `\nPERFIL CLÍNICO DO PACIENTE (use para contextualizar, nunca para diagnosticar):\n${perfil}\n` : '';
  const slug = patientSlug(patient.fullName, patientId);
  const digest = memoryDigest(slug);
  const memoryText = digest ? `\nHISTÓRICO DE ANÁLISES ANTERIORES (use como contexto; não repita):\n${digest}\n` : '';

  const messages = [
    {
      role: 'user',
      content:
        (audience === 'doctor'
          ? `Atue como um assistente clínico. Produza um resumo OBJETIVO para o MÉDICO (pré-consulta) — tom clínico, direto, SEM acolhimento/parabéns. Foque em alterações relevantes e pontos a investigar na consulta.\n`
          : `Atue como um consultor de SAÚDE de alto nível. `) +
        `O contexto abaixo JÁ está organizado por RECÊNCIA — use cada seção conforme seu papel:\n` +
        `- ESTADO ATUAL = valores MAIS RECENTES de cada marcador (verdade presente; BASEIE o resumo aqui).\n` +
        `- TENDÊNCIAS = direção (melhorou/piorou/estável/1º exame) + variação % JÁ calculada (não reinvente o número).\n` +
        `- CONTEXTO HISTÓRICO = marcadores medidos há >1 ano — NÃO é estado atual; cite só se relevante.\n\n` +
        `REGRAS TEMPORAIS OBRIGATÓRIAS (NÃO VIOLAR):\n` +
        `- ESTADO ATUAL = SOMENTE marcadores classificados como [ATUAL] (≤6 meses) ou [RECENTE] (≤12 meses).\n` +
        `- Marcadores [HISTÓRICO] (>1 ano) ou [ANTIGO] (>3 anos): NUNCA apresentar como condição atual. Só em "Evolução" ou "Histórico relevante".\n` +
        `- Marcadores [DESATUALIZADO]: estava alterado no passado + sem medição recente. Diga "pode estar desatualizado, converse com seu médico sobre refazer" — NUNCA afirme que está alterado hoje.\n` +
        `- Se um marcador estava alterado em 2018 mas normal em 2026: o resultado ATUAL é NORMAL. Diga "houve melhora" (não "está alterado").\n` +
        `- COMECE o resumo com: "Esta análise considera principalmente os exames de [mês/ano mais recente]. Exames anteriores foram usados apenas para avaliar a evolução."\n\n` +
        `REGRAS DE PESO TEMPORAL (obrigatórias):\n` +
        `- Baseie o quadro atual no ESTADO ATUAL; use TENDÊNCIAS só pra indicar direção/mudança.\n` +
        `- NUNCA conclua tendência de marcador marcado [confiança baixa] ou [DESATUALIZADO] sem ≥2 exames recentes.\n` +
        `- Sem exame recente de um marcador? sugira refazer com o médico — não invente conclusão.\n` +
        `- PRAZOS (OBRIGATÓRIO): NUNCA escreva "não medido há X meses/anos" inventando prazo. Só diga "desatualizado" (SEM número) de um marcador se ele estiver EXPLICITAMENTE rotulado [DESATUALIZADO] no ESTADO ATUAL; pra qualquer outro, ele foi medido recentemente — não comente prazo.\n` +
        `- VALORES NUMÉRICOS (OBRIGATÓRIO): cite APENAS os números do ESTADO ATUAL/TENDÊNCIAS abaixo. NUNCA arredonde (2,75 NÃO vira "3" nem "2,8"), NUNCA estime, NUNCA invente. Se não há valor, escreva "sem dado".\n` +
        `- SEM REFERÊNCIA (OBRIGATÓRIO): marcadores rotulados [SEM REFERÊNCIA] no ESTADO ATUAL não têm faixa no laudo. NUNCA afirme "normal/alterado/melhorou/piorou" — sem faixa não há classificação. Use "depende do contexto clínico" (LDL, colesterol não-HDL — metas variam por risco cardiovascular) ou "referência não informada pelo laboratório" (demais). Tendência (se ≥2 exames comparáveis) só numérica ("aumentou/reduziu X%"), nunca juízo clínico. Sempre oriente a confirmar com o médico.\n\n` +
        `PACIENTE: ${patient.fullName}\n` +
        `Score atual: ${snapshot.score ?? '—'}/100 em ${snapshot.markers} marcador(es). Distribuição: ${JSON.stringify(snapshot.byPriority)}.\n` +
        perfilText + '\n' + memoryText +
        `${formatSnapshotContext(snapshot)}\n\n` +
        (audience === 'doctor'
          ? `ESTILO (médico): tom clínico e objetivo; cite valores e variações reais; liste pontos a investigar na consulta; coisasBoas pode ser vazio. Sem diagnóstico definitivo.\n\n`
          : `ESTILO: português simples, SEM jargão, SEM diagnóstico, SEM receitar. Cite o NOME do paciente + valores reais (ex: "Edmilson, sua glicose caiu 10%").\n\n`) +
        `Monte o JSON com:\n` +
        `- resumoGeral: visão integrada em 2-3 frases (o que está bem + o que pede atenção)\n` +
        `- comparativo (array de {name, anterior, atual, leitura, entenda}): itens alterados. "leitura" = Melhorou/Piorou/Estável/Atenção/Primeiro exame. "entenda" = UMA frase SIMPLES sobre o que é o exame.\n` +
        `- pontosAtencao (array de {titulo, detalhe}): o que requer ação AGORA\n` +
        `- coisasBoas (array de strings): o que melhorou (reforço positivo)\n` +
        `- leituraFinal: 1 parágrafo direto, amigável, com TOM HUMANO\n` +
        `- perguntasParaOMedico (array de 3-5 strings): perguntas OBJETIVAS com valores reais\n` +
        `- metasSaude (array de {analito, meta, prazo}): metas práticas\n` +
        `- interacoesMedicamentos, sugestoesNutricao, comparacaoFamiliar, disclaimer.\n` +
        JSON_SUFFIX,
    },
  ];
  let response: any;
  try {
    response = await withRateLimitRetry(async () => {
      const s = await getLlm().stream({ model: getModel(), maxTokens: 6000, system: HEALTH_SYSTEM, messages: messages as any });
      return s.final();
    });
  } catch (e: any) {
    console.error('[IA] erro ao gerar consolidado (status/msg):', e?.status, e?.message);
    throw new Error('Não foi possível gerar agora (serviço de IA indisponível). Tente novamente em instantes.');
  }

  const text = response.text;
  const json = extractJsonObject(text);
  const z = HealthSummarySchema.safeParse(json);
  let summary = (z.success ? z.data : json) as HealthSummary;
  // PÓS-COERÇÃO (anti-alucinação): substitui os valores da IA pelos REAIS do banco (snapshot).
  // Função pura coerceComparativo — testada em health-summary.test.ts.
  summary = coerceComparativo(summary, [...snapshot.topAttention, ...snapshot.improving, ...snapshot.worsening, ...snapshot.stale]);
  summary = coerceStaleness(summary, snapshot.stale); // remove prazos inventados se nada está desatualizado
  summary = guardHistoricalAsCurrent(summary, snapshot); // IA não pode listar marcador só histórico como atenção ATUAL
  summary = attachDesatualizados(summary, snapshot); // seção estruturada de desatualizados (fonte: DB, confiável)
  summary = attachEvolucao(summary, snapshot); // seção de evolução (direção + Δ% do DB)
  let contentMd = renderSummaryMd(summary);
  contentMd = diagnosticGuard(contentMd).text;
  appendPatientMemory(slug, `Relatório consolidado (${snapshot.markers} marcadores)`,
    `${summary.resumoGeral ?? ''}\nPontos de atenção: ${(summary.pontosAtencao ?? []).map((p) => p.titulo).join('; ')}\nPerguntas p/ médico: ${(summary.perguntasParaOMedico ?? []).join('; ')}`);
  // Persiste o relatório COMPLETO em .md (não se perde; pode ser relido sem regenerar)
  saveFullReport(slug, `Relatório consolidado (${snapshot.markers} marcadores)`, contentMd);
  return { summary, contentMd, modelUsed: response.model, usage: response.usage };
}

/** Carrega o exame + itens + paciente (para o perfil clínico). */
export async function loadExamContext(examId: string) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { items: { orderBy: { name: 'asc' } }, patient: true },
  });
  if (!exam) {
    const err = new Error('Exame não encontrado');
    (err as any).status = 404;
    throw err;
  }
  return exam;
}

/** Busca o exame anterior (mesmo paciente, já extraído) para servir de comparação. */
async function loadPriorExam(patientId: string, currentId: string) {
  return prisma.exam.findFirst({
    where: { patientId, status: 'EXTRACTED', id: { not: currentId } },
    orderBy: { performedAt: 'desc' },
    include: { items: true },
  });
}

/** Gera o resumo de saúde (não-diagnóstico) estilo "comparativo anterior x atual". */
export async function generateHealthSummary(examId: string): Promise<{ summary: HealthSummary; contentMd: string; modelUsed: string; usage: any }> {
  const exam = await loadExamContext(examId);
  const prior = await loadPriorExam(exam.patientId, exam.id);

  // Memória do agente: lê o histórico de análises anteriores do paciente (continuidade + economia de token)
  const slug = patientSlug(exam.patient.fullName, exam.patient.id);
  const digest = memoryDigest(slug);
  const memoryText = digest
    ? `\nHISTÓRICO DE ANÁLISES ANTERIORES DESTE PACIENTE (use como contexto p/ manter coerência; não repita):\n${digest}\n`
    : '';

  const priorMap = new Map<string, string>();
  for (const it of prior?.items ?? []) {
    if (it.valueText) priorMap.set(it.nameCanonical, it.valueText);
  }

  // itens atuais enriquecidos com o valor anterior (quando há), prontos p/ o comparativo
  const comparativoInput = exam.items.map((i) => ({
    name: i.name,
    atual: i.valueText ?? null,
    anterior: priorMap.get(i.nameCanonical) ?? null,
    ref: i.refText ?? [i.refLow, i.refHigh].filter((x) => x != null).join(' a '),
    flag: i.flag,
  }));
  const foraDaFaixa = exam.items.filter((i) => i.isAbnormal).map((i) => ({ name: i.name, atual: i.valueText, ref: i.refText, flag: i.flag }));

  const profile = exam.patient.clinicalProfile?.trim();
  const profileText = profile
    ? `\nPERFIL CLÍNICO DO PACIENTE (use para contextualizar, nunca para diagnosticar):\n${profile}\n`
    : '';

  const s = await getLlm().stream({
    model: getModel(),
    maxTokens: 6000,
    system: HEALTH_SYSTEM,
    messages: [
      {
        role: 'user',
        content:
          `Analise o exame abaixo em português, no estilo "comparativo do atual vs. anterior".\n` +
          `PACIENTE: ${exam.patient?.fullName ?? 'Não identificado'}\n` +
          `EXAME: ${exam.title} (tipo: ${exam.kind})` +
          (exam.performedAt ? ` — data: ${exam.performedAt.toLocaleDateString('pt-BR')}` : '') + '\n' +
          `LABORATÓRIO: ${exam.sourceLab ?? (exam.rawExtraction as any)?.sourceLab ?? 'Não identificado'}\n` +
          `MÉDICO SOLICITANTE: ${(exam.rawExtraction as any)?.requestingDoctor ?? 'Não identificado'}\n` +
          (prior ? `Exame anterior de comparação: ${prior.title} (${prior.performedAt?.toLocaleDateString('pt-BR') ?? 's/d'}).\n` : 'Não há exame anterior para comparar; use apenas o atual.\n') +
          profileText + '\n' + memoryText +
          `ITENS (atual x anterior x referência):\n${JSON.stringify(comparativoInput, null, 2)}\n\n` +
          `VALORES FORA DA FAIXA NO ATUAL:\n${JSON.stringify(foraDaFaixa, null, 2)}\n\n` +
          `Monte o JSON com estas chaves:\n` +
          `- resumoGeral (string, 1-2 parágrafos)\n` +
          `- comparativo (array de {name, anterior, atual, leitura, entenda}) — "anterior" = valor do exame anterior (ou null); "leitura" = Melhorou/Piorou/Estável/Atenção; "entenda" = UMA frase curta e SIMPLES sobre o que é o exame e o que o valor significa (ex.: "Hemoglobina leva oxigênio no sangue; 13,8 está normal")\n` +
          `- pontosAtencao (array de {titulo, detalhe}) — contextualize pelo perfil clínico, sem diagnosticar\n` +
          `- coisasBoas (array de strings)\n` +
          `- leituraFinal (string, 1 parágrafo direto)\n` +
          `- perguntasParaOMedico (array de strings, 3 a 5)\n` +
          `- interacoesMedicamentos (array de {medicamento, analito, observacao}) — CRUZE cada medicação do perfil clínico com os valores alterados. Ex.: {medicamento:"testosterona", analito:"Hemoglobina", observacao:"A testosterona pode elevar hemoglobina/hematócrito"}. Se não houver medicação relevante, array vazio.\n` +
          `- sugestoesNutricao (array de strings) — sugestões alimentares EDUCATIVAS baseadas nos valores alterados. Ex.: "LDL alto: reduza carnes vermelhas e frituras; aumente aveia e azeite". 3-5 sugestões práticas.\n` +
          `- comparacaoFamiliar (string ou null) — se o perfil sugere predisposição familiar (ex.: vários com colesterol alto), comente. Se não houver dados familiares, null.\n` +
          `- metasSaude (array de {analito, meta, prazo}) — metas concretas para os próximos 3-6 meses baseadas nos valores atuais. Ex.: {analito:"LDL", meta:"Reduzir para abaixo de 100", prazo:"3 meses com dieta"}.\n` +
          `- disclaimer (string curta)` +
          JSON_SUFFIX,
      },
    ],
  });
  let response: any;
  try {
    response = await s.final();
  } catch (e: any) {
    console.error('[IA] erro ao gerar (status/msg):', e?.status, e?.message);
    throw new Error('Não foi possível gerar agora (serviço de IA indisponível). Tente novamente em instantes.');
  }

  const text = response.text;
  const json = extractJsonObject(text);
  const z = HealthSummarySchema.safeParse(json);
  const summary = (z.success ? z.data : json) as HealthSummary;

  let contentMd = renderSummaryMd(summary);
  contentMd = diagnosticGuard(contentMd).text;

  appendPatientMemory(slug, `${exam.title} (${exam.performedAt ? new Date(exam.performedAt as Date).toLocaleDateString('pt-BR') : 's/d'})`,
    `${summary.resumoGeral ?? ''}\nPontos de atenção: ${(summary.pontosAtencao ?? []).map((p) => p.titulo).join('; ')}\nPerguntas p/ médico: ${(summary.perguntasParaOMedico ?? []).join('; ')}`);

  return { summary, contentMd, modelUsed: response.model, usage: response.usage };
}

/** Renderiza o resumo estruturado em Markdown legível (estilo do paciente). */
export function renderSummaryMd(s: HealthSummary): string {
  const out: string[] = ['### Resumo geral', s.resumoGeral];

  if (s.comparativo?.length) {
    out.push('', '### Comparativo (anterior × atual)');
    for (const c of s.comparativo) {
      out.push(`- **${c.name}** — anterior: ${c.anterior ?? '—'} | atual: ${c.atual ?? '—'} → ${c.leitura ?? ''}`);
    }
  }
  if (s.pontosAtencao?.length) {
    out.push('', '### 🚩 Pontos que merecem atenção');
    s.pontosAtencao.forEach((p, i) => out.push(`${i + 1}. **${p.titulo}** — ${p.detalhe}`));
  }
  if (s.coisasBoas?.length) {
    out.push('', '### ✅ Coisas boas no exame');
    for (const b of s.coisasBoas) out.push(`- ${b}`);
  }
  out.push('', '### Leitura final', s.leituraFinal);

  if (s.perguntasParaOMedico?.length) {
    // Label neutro: no app do paciente funciona como "pontos pra levar à consulta"; no portal do
    // médico não faz sentido "levar ao médico" (ele É o médico) — "pontos para a consulta" serve aos dois.
    out.push('', '### 🩺 Pontos de atenção para a consulta');
    s.perguntasParaOMedico.forEach((q, i) => out.push(`${i + 1}. ${q}`));
  }
  if (s.evolucao?.length) {
    out.push('', '### 📈 Evolução desde os exames anteriores');
    for (const e of s.evolucao) {
      out.push(`- **${e.name}** — ${e.direcao}${e.detalhe ? ` (${e.detalhe})` : ''}`);
    }
  }
  if (s.desatualizados?.length) {
    out.push('', '### 📅 Acompanhamentos que podem estar desatualizados',
      '*Marcadores sem medição recente — converse com seu médico sobre a necessidade de refazer.*');
    for (const d of s.desatualizados) {
      const ha = d.haMeses != null ? ` há ~${d.haMeses} meses` : '';
      out.push(`- **${d.marcador}** — último: ${d.ultimoResultado ?? '—'}${d.data ? ` (${d.data}${ha})` : ''}. ${d.situacao ?? ''}`);
    }
  }
  out.push('', '---', `*${s.disclaimer || 'Análise educativa. Leve ao seu médico para interpretação clínica.'}*`);
  return out.join('\n');
}
