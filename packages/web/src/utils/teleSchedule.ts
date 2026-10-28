/**
 * Agendamento de teleconsulta (portal do médico) — regras PURAS do diálogo
 * (TeleScheduleDialog). Sem React/MUI: testável em node.
 *
 * Datas SEMPRE no fuso LOCAL do aparelho: `toISOString()` é UTC e, depois das 21h em
 * Brasília, virava o dia seguinte — o atalho "Hoje" agendava amanhã e a data mínima do
 * campo pulava um dia (bug 27/10/26).
 */

/** Estado do formulário (mesmo shape do `tele` do DoctorPortal). `price` vai SEMPRE
 *  normalizado "N,NN" (ou vazio = sem cobrança) — o envio só remove os não-dígitos. */
export interface TeleForm { date: string; time: string; link: string; title: string; recurrence: string; price: string }

export type CallMode = 'app' | 'meet' | 'link';

/** Capacidades do servidor (GET /doctor/google/status). */
export interface CallCaps { configured?: boolean; connected?: boolean; livekit?: boolean; priceMinCents?: number }

/** Fallback do mínimo (= default de AppSetting teleconsulta.priceMinCents no server). */
export const DEFAULT_PRICE_MIN_CENTS = 2000;
/** Teto aceito pelo server (POST /doctor/patients/:id/teleconsulta). */
export const PRICE_MAX_CENTS = 2_000_000;

const pad = (n: number) => String(n).padStart(2, '0');

/** AAAA-MM-DD no fuso LOCAL. */
export const localYmd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const addDays = (d: Date, n: number): Date => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export interface TeleShortcut { key: string; label: string; date: string; time: string }

/** Atalhos de horário — só futuros. "Hoje" = próxima hora cheia (até 22h). De madrugada
 *  (antes das 6h) vira "Hoje 10h": à 0h30 o atalho oferecia "Hoje 1h", e para quem ainda
 *  não dormiu o "amanhã" é o hoje de manhã. */
export const buildTeleShortcuts = (now: Date): TeleShortcut[] => {
  const out: TeleShortcut[] = [];
  const h = now.getHours();
  const todayHour = h < 6 ? 10 : h + 1;
  if (todayHour <= 22) out.push({ key: 'hoje', label: `Hoje ${todayHour}h`, date: localYmd(now), time: `${pad(todayHour)}:00` });
  const tomorrow = localYmd(addDays(now, 1));
  out.push({ key: 'amanha-10', label: 'Amanhã 10h', date: tomorrow, time: '10:00' });
  out.push({ key: 'amanha-14', label: 'Amanhã 14h', date: tomorrow, time: '14:00' });
  out.push({ key: 'em-3-dias', label: 'Em 3 dias 10h', date: localYmd(addDays(now, 3)), time: '10:00' });
  out.push({ key: 'proxima-semana', label: 'Próx. semana 14h', date: localYmd(addDays(now, 7)), time: '14:00' });
  return out;
};

/** Valor digitado em REAIS → centavos. "150" = R$ 150,00; "15,9" = R$ 15,90.
 *  Antes a máscara era de centavos: digitar "20" virava "0,20" e o server recusava.
 *  pt-BR: vírgula é SEMPRE decimal; ponto só é decimal com até 2 casas no fim
 *  ("150.5"), senão é milhar ("1.500"). */
export const parseReaisToCents = (raw: string): number | null => {
  const s = raw.replace(/[^\d,.]/g, '');
  if (!/\d/.test(s)) return null;
  let i = s.lastIndexOf(',');
  if (i < 0) {
    const m = s.match(/\.(\d{0,2})$/);
    i = m ? s.length - m[0].length : -1;
  }
  const intPart = (i >= 0 ? s.slice(0, i) : s).replace(/\D/g, '');
  const decPart = i >= 0 ? s.slice(i + 1).replace(/\D/g, '').slice(0, 2) : '';
  const cents = Number(intPart || '0') * 100 + Number(decPart.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
};

/** Máscara do campo enquanto digita: só dígitos e separadores, tamanho limitado. */
export const maskReaisInput = (raw: string): string => raw.replace(/[^\d,.]/g, '').slice(0, 10);

/** Centavos → "150,00" (formato do `tele.price` — o envio remove não-dígitos). */
export const centsToPriceField = (cents: number): string => (cents / 100).toFixed(2).replace('.', ',');

/** Centavos → "R$ 1.500,00" (determinístico, sem depender do ICU do ambiente). */
export const formatBRL = (cents: number): string => {
  const [int, dec] = (cents / 100).toFixed(2).split('.');
  return `R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
};

/** Centavos do `tele.price` normalizado ("150,00" → 15000; vazio → null). */
export const priceFieldToCents = (price: string): number | null => {
  const digits = price.replace(/\D/g, '');
  return digits ? Number(digits) : null;
};

export type ChargeIssue = 'empty' | 'min' | 'max' | null;

export const chargeIssue = (price: string, minCents: number): ChargeIssue => {
  const c = priceFieldToCents(price);
  if (!c) return 'empty';
  if (c < minCents) return 'min';
  if (c > PRICE_MAX_CENTS) return 'max';
  return null;
};

/** Modos oferecidos — mesma precedência do envio: app (LiveKit) > Meet > link manual. */
export const callOptions = (caps: CallCaps | null): CallMode[] =>
  caps?.livekit ? ['app', 'link'] : caps?.connected ? ['meet', 'link'] : ['link'];

/** Modo efetivo dado o toggle "sala automática" do portal (`createMeet`). */
export const resolveCallMode = (caps: CallCaps | null, auto: boolean): CallMode =>
  auto && caps?.livekit ? 'app' : auto && caps?.connected ? 'meet' : 'link';

export const MODE_LABEL: Record<CallMode, string> = { app: 'No app', meet: 'Google Meet', link: 'Link externo' };

export const LINK_RE = /^https?:\/\/[^\s/]+/i;

/** Data/hora no fuso local (null se inválida). */
export const teleDue = (date: string, time: string): Date | null => {
  if (!date) return null;
  const d = new Date(`${date}T${time || '14:00'}`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Por que o "Agendar" está bloqueado (null = pode agendar). O rodapé mostra este texto —
 *  botão desabilitado em silêncio parecia "morto" (lição do openTele). */
export const teleBlockingReason = (p: {
  hasPatient: boolean; date: string; time: string; now: Date; mode: CallMode; link: string;
  charge: boolean; price: string; minCents: number;
}): string | null => {
  if (!p.hasPatient) return 'Selecione o paciente';
  if (!p.date) return 'Escolha a data da consulta';
  const due = teleDue(p.date, p.time);
  if (!due) return 'Data ou horário inválido';
  if (due.getTime() <= p.now.getTime()) return 'Esse horário já passou — escolha um futuro';
  if (p.mode === 'link' && !LINK_RE.test(p.link.trim())) return 'Cole o link da chamada (https://…)';
  if (p.charge) {
    const issue = chargeIssue(p.price, p.minCents);
    if (issue === 'empty') return 'Informe o valor ou desligue a cobrança';
    if (issue === 'min') return `Valor mínimo ${formatBRL(p.minCents)}`;
    if (issue === 'max') return `Valor máximo ${formatBRL(PRICE_MAX_CENTS)}`;
  }
  return null;
};

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Resumo do rodapé: "Qui, 28/10 às 14:00 · No app · R$ 150,00". */
export const teleSummary = (p: { date: string; time: string; mode: CallMode; charge: boolean; price: string }): string => {
  const due = teleDue(p.date, p.time);
  const when = due ? `${WEEKDAYS[due.getDay()]}, ${pad(due.getDate())}/${pad(due.getMonth() + 1)} às ${pad(due.getHours())}:${pad(due.getMinutes())}` : 'Sem data';
  const cents = p.charge ? priceFieldToCents(p.price) : null;
  return `${when} · ${MODE_LABEL[p.mode]} · ${cents ? formatBRL(cents) : 'Sem cobrança'}`;
};
