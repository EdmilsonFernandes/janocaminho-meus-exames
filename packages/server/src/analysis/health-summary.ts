import { getAnthropic, MODEL } from '../claude/client';
import { HealthSummarySchema, type HealthSummary } from '../extraction/schemas';
import { prisma } from '../prisma';
import { HEALTH_SYSTEM, diagnosticGuard } from './system';
import { JSON_SUFFIX, extractJsonObject } from '../utils/json';

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
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 6000,
    system: HEALTH_SYSTEM,
    messages: [
      {
        role: 'user',
        content:
          `Analise o exame abaixo em português, no estilo "comparativo do atual vs. anterior".\n` +
          `Exame: ${exam.title} (tipo: ${exam.kind})` +
          (exam.performedAt ? ` — data: ${exam.performedAt.toISOString().slice(0, 10)}` : '') + '.\n' +
          (prior ? `Exame anterior de comparação: ${prior.title} (${prior.performedAt?.toISOString().slice(0, 10) ?? 's/d'}).\n` : 'Não há exame anterior para comparar; use apenas o atual.\n') +
          profileText + '\n' +
          `ITENS (atual x anterior x referência):\n${JSON.stringify(comparativoInput, null, 2)}\n\n` +
          `VALORES FORA DA FAIXA NO ATUAL:\n${JSON.stringify(foraDaFaixa, null, 2)}\n\n` +
          `Monte o JSON com estas chaves:\n` +
          `- resumoGeral (string, 1-2 parágrafos)\n` +
          `- comparativo (array de {name, anterior, atual, leitura, entenda}) — "anterior" = valor do exame anterior (ou null); "leitura" = Melhorou/Piorou/Estável/Atenção; "entenda" = UMA frase curta e SIMPLES sobre o que é o exame e o que o valor significa (ex.: "Hemoglobina leva oxigênio no sangue; 13,8 está normal")\n` +
          `- pontosAtencao (array de {titulo, detalhe}) — contextualize pelo perfil clínico, sem diagnosticar\n` +
          `- coisasBoas (array de strings)\n` +
          `- leituraFinal (string, 1 parágrafo direto)\n` +
          `- perguntasParaOMedico (array de strings, 3 a 5)\n` +
          `- disclaimer (string curta)` +
          JSON_SUFFIX,
      },
    ],
  } as any);

  const text = (response.content as any[]).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const json = extractJsonObject(text);
  const z = HealthSummarySchema.safeParse(json);
  const summary = (z.success ? z.data : json) as HealthSummary;

  let contentMd = renderSummaryMd(summary);
  contentMd = diagnosticGuard(contentMd).text;

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
