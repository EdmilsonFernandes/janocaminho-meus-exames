// Pré-roteador de chat: responde perguntas FATUAIS direto do banco (token zero, grátis),
// sem chamar a IA. Só escala pra GLM quando a pergunta é interpretativa.
// Conservador de propósito: under-answer (escalona pra IA) é melhor que mis-answer.
import type { Response } from 'express';
import { prisma } from '../prisma';
import { normalizeKey, findMarkerInText, computeFlag, reconcileScaleFlag } from '../utils/normalize';

// Perguntas ANALÍTICAS/INTERPRETATIVAS → sempre IA (nunca responde local).
// normalizeKey stripa acentos → os patterns são SEM acento. Inclui verbos analíticos (resumo,
// faixa, comparar, evolução, tendência, atenção, repetir, alimentação, explicar…) que ANTES
// batiam em LIST_EXAMS e voltavam só com a lista de títulos (sem análise nenhuma).
const INTERPRETIVE = /O QUE (SIGNIFICA|SIGNIFICACAO|PODE|E|SAO)|POR QUE|PORQUE|E GRAVE|E PERIGOSO|PREOCUPA|ANORMAL|POSSO|TRATAMENTO|CAUSA|DOENC|ANOMAL|PRECISO|PROCURAR|MEDIC|ALERTA|RESUMO|FAIXA|REFEREN|FORA DA|COMPAR|EVOLU|TENDEN|MELHOR|PIOR|REPET|ATENCAO|URGEN|ALTERAD|ALIMENT|DIETA|EXPLICA|MEDID|ONDE ESTOU|DESTAQU|CRUZ|FALT|METAS|META\b|SINAIS|SINAL|RISCO|CARDIAC|VASCU|IMAGEM|VACIN|LEMBRET|COMPROMISS|RECOMEND|SUGIR|SUGEST|ROTINA|EXERCIC|NUTRIENT/;
// Contagem / lista de exames (sem marcador específico).
const COUNT_EXAMS = /QUANTOS EXAMES|QUANTIDADE DE EXAMES|NUMERO DE EXAMES|N EXAMES/;
// Só casa pedido EXPLÍCITO de listar/mostrar os exames ("liste meus exames", "mostre meus exames")
// ou interrogativa DIRETA ("quais são meus exames?"). Antes incluía MEUS|MINHOS|TODOS — casava
// "meus exames" usado como CONTEXTO em perguntas interpretativas ("com base nos meus exames,
// sugira metas") e o router respondia só com a lista de títulos, sem análise. Verbos explícitos +
// QUAIS + guarda de tamanho (abaixo) resolvem: INTERPRETIVE e >55 chars rodam ANTES desta regex,
// então "quais valores estão fora nos meus exames" (FORA DA/FAIXA) segue indo pra IA.
const LIST_EXAMS = /\b(LISTE|LISTAR|LISTA|MOSTRE|MOSTRAR|MOSTR|EXIBA|EXIB|VEJA|VER|QUAIS)\b.{0,25}\bEXAMES\b/;

export interface LocalAnswer {
  answered: boolean;
  text?: string;
}

/**
 * P0 (bateria design 2026-09-05): números CITADOS na pergunta ("glicose deu 108").
 * A resposta local deve ancorar no valor que o usuário perguntou — nunca responder
 * com o "último" quando ele citou outro. Anos (1900-2100) são ignorados (datas, não valores).
 */
export function citedNumbers(message: string): number[] {
  const out: number[] = [];
  for (const m of normalizeKey(message).matchAll(/(\d{1,4}(?:[.,]\d{1,3})?)/g)) {
    const v = parseFloat(m[1].replace(',', '.'));
    if (!Number.isFinite(v)) continue;
    if (Number.isInteger(v) && v >= 1900 && v <= 2100) continue;
    out.push(v);
  }
  return out;
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

  // 0) Analítica/interpretativa → sempre IA. Antes estas perguntas (resumo, valores fora da faixa,
  //    comparar, evolução, atenção…) batiam em LIST_EXAMS e o router respondia só com a lista de
  //    títulos — sem usar os valores. Agora vão pra IA, que tem os valores no contexto (RAG).
  if (INTERPRETIVE.test(norm)) return { answered: false };

  // Mensagens longas são quase sempre interpretativas (ex.: "com base nos meus exames, sugira
  // metas..."). O roteador local só atende pedidos CURTOS e diretos; longos vão à IA (que tem os
  // valores no contexto RAG). Antes, "meus exames" como CONTEXTO batia em LIST_EXAMS e voltava só
  // com a lista de títulos — sem análise nenhuma.
  if (norm.length > 55) return { answered: false };

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

    // 3a) Valor CITADO na pergunta ("minha glicose deu 108") → ancorar NELE, não no último.
    // Antes: "glicose deu 108, é preocupante?" era respondido com o último (95, "na faixa") —
    // tranquilizava com um número que NÃO foi o perguntado (P0 bateria 2026-09-05).
    const cited = citedNumbers(message);
    if (cited.length) {
      const candidates = await prisma.examItem.findMany({
        where: { nameCanonical: marker, valueNumeric: { not: null }, exam: { patientId, status: 'EXTRACTED' } },
        orderBy: { exam: { performedAt: 'desc' } },
        take: 40,
        include: { exam: { select: { performedAt: true } } },
      });
      const tol = (v: number) => Math.max(0.05, Math.abs(v) * 0.01);
      const citedItem = candidates.find((it) =>
        it.valueNumeric != null && cited.some((c) => Math.abs(it.valueNumeric! - c) <= tol(c)));
      if (!citedItem) return { answered: false }; // valor citado não casa → IA interpreta (unidade? digitação?)
      const fmtNum = (v: number) => String(v).replace('.', ',');
      const fmtDate = (d: Date | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : 'data indisponível');
      const fmtItemLine = (it: (typeof candidates)[number]) => {
        const ref = it.refText ?? (it.refLow != null && it.refHigh != null ? `${fmtNum(it.refLow)}–${fmtNum(it.refHigh)}` : null);
        const flag = reconcileScaleFlag(it.valueNumeric, it.refLow, it.refHigh, it.unit ?? undefined);
        const st = flag.flag === 'NORMAL' ? '✅ na faixa de referência'
          : flag.flag === 'HIGH' ? '⚠️ acima da referência'
          : flag.flag === 'LOW' ? '⚠️ abaixo da referência' : '';
        const refTxt = ref ? ` (referência: ${ref}${it.unit ? ' ' + it.unit : ''})` : '';
        return `**${fmtNum(it.valueNumeric!)}${it.unit ? ' ' + it.unit : ''}** em ${fmtDate(it.exam.performedAt)}${refTxt}` + (st ? ` — ${st}` : '');
      };
      let text = `O valor ${fmtItemLine(citedItem)} que você citou.`;
      const latest = candidates[0];
      if (latest && latest.id !== citedItem.id) {
        text += `\nObs.: seu resultado MAIS RECENTE deste analito é ${fmtItemLine(latest)}.`;
      }
      return { answered: true, text };
    }

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
    // Reconcile (não computeFlag cru): escala conflitante vira 'sem classificação' no texto do
    // chat — igual à UI, sem contradizer o app (auditoria 2026-08-17).
    const flag = reconcileScaleFlag(item.valueNumeric, item.refLow, item.refHigh, item.unit ?? undefined);
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
