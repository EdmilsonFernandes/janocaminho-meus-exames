// Resposta do chat SEM IA — usada quando TODOS os provedores falham antes do 1º token
// (cota estourada, relay fora). Em vez de "A IA não respondeu", a pessoa recebe o que os
// exames dela mostram: fatos do banco, sem interpretação. Determinístico e token zero.
//
// Limite de segurança: aqui NÃO há leitura clínica — só valor, faixa do laudo e data.
// Nada de "está tudo bem"/"é grave": quem interpreta é a IA (quando voltar) ou o médico.
import { findMarkerInText, reconcileScaleFlag } from '../utils/normalize';

export interface OfflineItem {
  name: string;
  nameCanonical?: string | null;
  valueText?: string | null;
  valueNumeric?: number | null;
  unit?: string | null;
  refText?: string | null;
  refLow?: number | null;
  refHigh?: number | null;
}
export interface OfflineExam {
  title: string;
  performedAt: Date | string | null;
  items: OfflineItem[];
}

const num = (v: number) => String(v).replace('.', ',');
const fmtDate = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : 'sem data');
const fmtVal = (it: OfflineItem) => it.valueText ?? (it.valueNumeric != null ? num(it.valueNumeric) : '—');
const fmtRef = (it: OfflineItem) =>
  it.refText ?? (it.refLow != null && it.refHigh != null ? `${num(it.refLow)}–${num(it.refHigh)}` : null);
const line = (it: OfflineItem) =>
  `**${fmtVal(it)}${it.unit ? ' ' + it.unit : ''}**${fmtRef(it) ? ` (referência do laudo: ${fmtRef(it)})` : ''}`;

/** Fora da faixa pela MESMA regra da tela (reconcile: escala conflitante não vira alerta). */
function outOfRange(it: OfflineItem): 'acima' | 'abaixo' | null {
  const f = reconcileScaleFlag(it.valueNumeric ?? null, it.refLow ?? null, it.refHigh ?? null, it.unit ?? undefined).flag;
  return f === 'HIGH' ? 'acima' : f === 'LOW' ? 'abaixo' : null;
}

const FOOTER =
  '\n\n_A explicação com a IA está indisponível agora — o crédito desta pergunta foi devolvido. ' +
  'Pergunte de novo em alguns minutos. Isto são só os dados dos seus exames, não uma avaliação médica._';

/**
 * Monta a resposta sem IA. `exams` deve vir do MAIS RECENTE para o mais antigo (mesma ordem do chat).
 *  - a pergunta cita um analito → os últimos resultados dele, com data e faixa;
 *  - senão → o que está fora da faixa no resultado mais recente de cada analito.
 */
export function buildOfflineAnswer(message: string, exams: OfflineExam[]): string {
  if (!exams.length) {
    return 'Ainda não há exames lidos no seu perfil para eu consultar.' + FOOTER;
  }

  const marker = findMarkerInText(message);
  if (marker) {
    const pts: string[] = [];
    const seenDay = new Set<string>();
    let label = '';
    for (const e of exams) {
      const it = e.items.find((i) => i.nameCanonical === marker);
      if (!it) continue;
      const day = fmtDate(e.performedAt);
      if (seenDay.has(day)) continue; // reenvio/painel sobreposto no mesmo dia
      seenDay.add(day);
      label ||= it.name;
      const oor = outOfRange(it);
      pts.push(`- ${day}: ${line(it)}${oor ? ` — ${oor} da faixa` : ''}`);
      if (pts.length === 4) break;
    }
    if (pts.length) {
      return `Seus resultados de **${label}**, do mais recente para o mais antigo:\n${pts.join('\n')}` + FOOTER;
    }
  }

  // Mais recente de cada analito (1º a aparecer, já que a lista vem em ordem decrescente de data).
  const seen = new Set<string>();
  const alerts: string[] = [];
  let total = 0;
  for (const e of exams) {
    for (const it of e.items) {
      const k = it.nameCanonical || it.name;
      if (seen.has(k)) continue;
      seen.add(k);
      total++;
      const oor = outOfRange(it);
      if (oor && alerts.length < 8) alerts.push(`- ${it.name}: ${line(it)} — ${oor} da faixa, em ${fmtDate(e.performedAt)}`);
    }
  }
  const head = `Olhei o resultado mais recente de cada item dos seus exames (${total} ${total === 1 ? 'item' : 'itens'}).`;
  if (!alerts.length) {
    return `${head} Nenhum aparece fora da faixa de referência do laudo.` + FOOTER;
  }
  return `${head} Estes aparecem fora da faixa de referência do laudo:\n${alerts.join('\n')}` + FOOTER;
}
