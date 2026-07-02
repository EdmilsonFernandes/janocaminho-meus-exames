import { getLlm, MODEL } from '../llm';
import { withRateLimitRetry } from '../utils/retry';
import { HealthSummarySchema, type HealthSummary } from '../extraction/schemas';
import { prisma } from '../prisma';
import { HEALTH_SYSTEM, diagnosticGuard } from './system';
import { JSON_SUFFIX, extractJsonObject } from '../utils/json';
import { patientSlug, memoryDigest, appendPatientMemory, saveFullReport } from './agent-memory';
import { buildCurrentHealthSummary, formatSnapshotContext, type MarkerState } from './health-state';
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
  const snapshot = await buildCurrentHealthSummary(patientId);
  if (snapshot.markers === 0) {
    const err = new Error('Nenhum exame extraído para consolidar');
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
      const s = await getLlm().stream({ model: MODEL, maxTokens: 6000, system: HEALTH_SYSTEM, messages: messages as any });
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
    model: MODEL,
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
    out.push('', '### 🩺 Perguntas para levar ao médico');
    s.perguntasParaOMedico.forEach((q, i) => out.push(`${i + 1}. ${q}`));
  }
  out.push('', '---', `*${s.disclaimer || 'Análise educativa. Leve ao seu médico para interpretação clínica.'}*`);
  return out.join('\n');
}
