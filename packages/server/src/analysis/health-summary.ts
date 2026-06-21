import { getAnthropic, MODEL } from '../claude/client';
import { withRateLimitRetry } from '../utils/retry';
import { HealthSummarySchema, type HealthSummary } from '../extraction/schemas';
import { prisma } from '../prisma';
import { HEALTH_SYSTEM, diagnosticGuard } from './system';
import { JSON_SUFFIX, extractJsonObject } from '../utils/json';
import { patientSlug, memoryDigest, appendPatientMemory, saveFullReport } from './agent-memory';

/** Resumo CONSOLIDADO: junta os últimos exames (sangue/imagem/laudo) num documento único — "segunda opinião documental". */
export async function generateConsolidatedSummary(patientId: string): Promise<{ summary: HealthSummary; contentMd: string; modelUsed: string; usage: any }> {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) {
    const err = new Error('Paciente não encontrado');
    (err as any).status = 404;
    throw err;
  }
  const exams = await prisma.exam.findMany({
    where: { patientId, status: 'EXTRACTED' },
    orderBy: { performedAt: 'desc' },
    take: 5,
    include: { items: { where: { isAbnormal: true }, orderBy: { name: 'asc' }, take: 12 } },
  });
  if (!exams.length) {
    const err = new Error('Nenhum exame extraído para consolidar');
    (err as any).status = 400;
    throw err;
  }

  const perfil = patient.clinicalProfile?.trim();
  const perfilText = perfil ? `\nPERFIL CLÍNICO DO PACIENTE (use para contextualizar, nunca para diagnosticar):\n${perfil}\n` : '';
  const slug = patientSlug(patient.fullName, patientId);
  const digest = memoryDigest(slug);
  const memoryText = digest ? `\nHISTÓRICO DE ANÁLISES ANTERIORES (use como contexto; não repita):\n${digest}\n` : '';
  const examContext = exams.map((e) => ({
    titulo: e.title,
    tipo: e.kind,
    data: e.performedAt ? new Date(e.performedAt as Date).toLocaleDateString('pt-BR') : 's/d',
    laboratorio: e.sourceLab ?? null,
    alteracoes: e.items.map((i) => ({
      name: i.name,
      value: i.valueText,
      ref: i.refText ?? [i.refLow, i.refHigh].filter((x) => x != null).join('-'),
      flag: i.flag,
    })),
  }));

  const messages = [
    {
      role: 'user',
      content:
        `Atue como um consultor de SAUDE de alto nivel. Analise TODOS os exames do paciente seguindo esta estrutura (Chain-of-Thought):\n\n` +
        `PASSO 1 - TRIAGEM: Agrupe os itens por categorias medicas (Hormonios, Hemograma, Lipidios, Hepatico, Renal, Glicidico, Outros).\n` +
        `PASSO 2 - TENDENCIA: Para cada categoria, identifique o que esta alterado + a DIRECAO (melhorando, piorando, estavel, primeiro exame).\n` +
        `PASSO 3 - SINTER EXECUTIVA: Gere o relatorio final com tom humano, acolhedor e direto.\n\n` +
        `PACIENTE: ${patient.fullName}\n` +
        `Exames incluidos: ${exams.length}.\n` +
        perfilText + '\n' + memoryText +
        `EXAMES (apenas alteracoes relevantes, do mais recente ao mais antigo):\n${JSON.stringify(examContext, null, 2)}\n\n` +
        `ESTILO: portugues simples, SEM jargao, SEM diagnostico, SEM receitar. Sempre cite o NOME do paciente + valores reais (ex: "Edmilson, sua glicose caiu de 110 pra 98").\n\n` +
        `Monte o JSON com:\n` +
        `- resumoGeral: visao integrada em 2-3 frases (o que esta bem + o que precisa atencao)\n` +
        `- comparativo (array de {name, anterior, atual, leitura, entenda}): itens alterados. "leitura" = Melhorou/Piorou/Estavel/Atencao/Primeiro exame. "entenda" = UMA frase SIMPLES sobre o que e o exame.\n` +
        `- pontosAtencao (array de {titulo, detalhe}): o que requer acao AGORA\n` +
        `- coisasBoas (array de strings): o que melhorou (reforco positivo)\n` +
        `- leituraFinal: 1 paragrafo direto, amigavel, com TOM HUMANO (ex: "${patient.fullName?.split(' ')[0] || 'Paciente'}, seu colesterol caiu 15% — continue assim!")\n` +
        `- perguntasParaOMedico (array de 3-5 strings): perguntas OBJETIVAS com valores reais (ex: "Meu TSH subiu de 1.2 pra 3.8. Preciso ajustar a levotiroxina?")\n` +
        `- metasSaude (array de {analito, meta, prazo}): metas praticas (ex: "Colesterol total abaixo de 200 em 3 meses")\n` +
        `- interacoesMedicamentos, sugestoesNutricao, comparacaoFamiliar, disclaimer.\n` +
        JSON_SUFFIX,
    },
  ];
  let response: any;
  try {
    response = await withRateLimitRetry(async () => {
      const client = getAnthropic();
      const stream = client.messages.stream({ model: MODEL, max_tokens: 6000, system: HEALTH_SYSTEM, messages } as any);
      return await stream.finalMessage();
    });
  } catch (e: any) {
    console.error('[IA] erro ao gerar consolidado (status/msg):', e?.status, e?.message);
    throw new Error('Não foi possível gerar agora (serviço de IA indisponível). Tente novamente em instantes.');
  }

  const text = (response.content as any[]).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const json = extractJsonObject(text);
  const z = HealthSummarySchema.safeParse(json);
  const summary = (z.success ? z.data : json) as HealthSummary;
  let contentMd = renderSummaryMd(summary);
  contentMd = diagnosticGuard(contentMd).text;
  appendPatientMemory(slug, `Relatório consolidado (${exams.length} exames)`,
    `${summary.resumoGeral ?? ''}\nPontos de atenção: ${(summary.pontosAtencao ?? []).map((p) => p.titulo).join('; ')}\nPerguntas p/ médico: ${(summary.perguntasParaOMedico ?? []).join('; ')}`);
  // Persiste o relatório COMPLETO em .md (não se perde; pode ser relido sem regenerar)
  saveFullReport(slug, `Relatório consolidado (${exams.length} exames)`, contentMd);
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

  const client = getAnthropic();
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 6000,
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
  } as any);
  let response: any;
  try {
    response = await stream.finalMessage();
  } catch (e: any) {
    console.error('[IA] erro ao gerar (status/msg):', e?.status, e?.message);
    throw new Error('Não foi possível gerar agora (serviço de IA indisponível). Tente novamente em instantes.');
  }

  const text = (response.content as any[]).filter((b) => b.type === 'text').map((b) => b.text).join('');
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
