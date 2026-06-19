// Pré-roteador de chat: responde perguntas FATUAIS direto do banco (token zero, grátis),
// sem chamar a IA. Só escala pra GLM quando a pergunta é interpretativa.
// Conservador de propósito: under-answer (escalona pra IA) é melhor que mis-answer.
import type { Response } from 'express';
import { prisma } from '../prisma';
import { normalizeKey, findMarkerInText, computeFlag } from '../utils/normalize';

// Perguntas INTERPRETATIVAS → sempre delega pra IA (nunca responde local).
const INTERPRETIVE = /O QUE (SIGNIFICA|SIGNIFICAÇÃO|PODE|E|SAO|É)|POR QUE|PORQUE|É GRAVE|E PERIGOSO|POSSO|TRATAMENTO|CAUSA|DOENÇ|ANOMAL|PRECISO|PROCURAR|MÉDICO|ALERTA/;
// Contagem / lista de exames (sem marcador específico).
const COUNT_EXAMS = /QUANTOS EXAMES|QUANTIDADE DE EXAMES|NUMERO DE EXAMES|N EXAMES/;
const LIST_EXAMS = /\b(QUE|QUAIS|QUANTOS|TODOS|MEUS|LISTA|MOSTR|VER)\b.{0,12}\bEXAMES\b/;

export interface LocalAnswer {
  answered: boolean;
  text?: string;
}

/** Tenta responder localmente. answered=true → o texto já é a resposta final. */
export async function tryLocalAnswer(opts: {
  message: string;
  userId: string;
  patientId: string;
}): Promise<LocalAnswer> {
  const { message, patientId } = opts;
  const norm = normalizeKey(message);
  if (!norm) return { answered: false };

  // 1) "quantos exames tenho?"
  if (COUNT_EXAMS.test(norm)) {
    const count = await prisma.exam.count({ where: { patientId, status: 'EXTRACTED' } });
    return { answered: true, text: `Você tem **${count}** exame${count !== 1 ? 's' : ''} extraído${count !== 1 ? 's' : ''} no total.` };
  }

  // 2) "quais / meus exames?"
  if (LIST_EXAMS.test(norm)) {
    const exams = await prisma.exam.findMany({
      where: { patientId, status: 'EXTRACTED' },
      orderBy: { performedAt: 'desc' },
      take: 10,
      select: { title: true, performedAt: true },
    });
    if (!exams.length) return { answered: true, text: 'Ainda não há exames extraídos no seu perfil.' };
    const lines = exams.map((e) =>
      `- ${e.title}${e.performedAt ? ` _(${new Date(e.performedAt).toLocaleDateString('pt-BR')})_` : ''}`,
    );
    return { answered: true, text: `Seus exames mais recentes:\n${lines.join('\n')}` };
  }

  // 3) marcador: "qual foi meu último TSH" / "meu hemograma... valor da hemoglobina"
  const marker = findMarkerInText(message);
  if (marker) {
    if (INTERPRETIVE.test(norm)) return { answered: false }; // pergunta de significado → IA
    const item = await prisma.examItem.findFirst({
      where: { nameCanonical: marker, exam: { patientId, status: 'EXTRACTED' } },
      include: { exam: { select: { performedAt: true } } },
      orderBy: { exam: { performedAt: 'desc' } },
    });
    if (!item) {
      return { answered: true, text: `Não encontrei nenhum resultado de **${prettyMarker(marker)}** nos seus exames.` };
    }
    const date = item.exam.performedAt
      ? new Date(item.exam.performedAt).toLocaleDateString('pt-BR')
      : 'data indisponível';
    const val = item.valueText ?? (item.valueNumeric != null ? String(item.valueNumeric).replace('.', ',') : '—');
    const ref =
      item.refText ??
      (item.refLow != null && item.refHigh != null
        ? `${String(item.refLow).replace('.', ',')}–${String(item.refHigh).replace('.', ',')}`
        : null);
    const flag = computeFlag(item.valueNumeric, item.refLow, item.refHigh);
    const status =
      flag.flag === 'NORMAL' ? '✅ na faixa de referência'
      : flag.flag === 'HIGH' ? '⚠️ acima da referência'
      : flag.flag === 'LOW' ? '⚠️ abaixo da referência'
      : '';
    const refTxt = ref ? ` (referência: ${ref}${item.unit ? ' ' + item.unit : ''})` : '';
    return {
      answered: true,
      text:
        `Seu último **${prettyMarker(marker)}** foi **${val}${item.unit ? ' ' + item.unit : ''}** em ${date}${refTxt}` +
        (status ? ` — ${status}` : '') + '.',
    };
  }

  return { answered: false };
}

/** Streama a resposta local no MESMO formato SSE que o front já lê (data: {type:'delta'|'done'}). */
export function streamLocalAnswer(res: Response, text: string): void {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify({ type: 'delta', delta: text })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: 'done', usage: null, model: 'local-router' })}\n\n`);
  res.end();
}

/** Humaniza uma chave canônica p/ exibição ("HEMOGLOBINA_GLICADA" → "Hemoglobina glicada"; acrônimos "TSH"/"LDL" ficam maiúsculos). */
function prettyMarker(canonical: string): string {
  if (/^[A-Z0-9]{1,4}$/.test(canonical)) return canonical; // acrônimo curto (TSH, LDL, T3)
  return canonical.toLowerCase().replace(/_/g, ' ').replace(/\b(\w)/g, (m) => m.toUpperCase());
}
