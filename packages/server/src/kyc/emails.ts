/**
 * E-mails do KYC do médico — layout PREMIUM do Portal do Médico (spec §5b) com os tokens do
 * .claude/DESIGN_SYSTEM.md: teal #20b2aa→#178f89 (marca), cobre #d4a574 (acento premium),
 * Poppins (títulos) + Inter (corpo), card 20/16, botão 12, mascote oficial (app-icon.png) e
 * modo escuro (#0f1818 / #1a2424 / #e8eef0). E-mail = tabela + estilo inline (o Gmail ignora
 * <style>; o bloco <style> só refina dark mode e celular onde há suporte). Texto do usuário
 * sempre por escapeHtml. Nada de dado de saúde (LGPD).
 * PRIVACIDADE: sem webfont (nada de <link>/@import do Google Fonts — cada abertura do e-mail
 * viraria uma requisição a terceiro). Poppins/Inter valem se instaladas; senão cai na fonte do
 * sistema. O único recurso remoto é o mascote, no nosso próprio domínio https (assetUrl).
 */
import { stripDoctorTitle } from '../utils/doctorTitle';

const HEAD = "'Poppins',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const BODY = "'Inter',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SUPPORT = 'contato@janocaminho.com.br';

// Tons de texto no claro (contraste AA sobre branco e sobre o cartão #f6fbfa); no escuro, as classes dx-* trocam.
const INK = '#2d3748';   // texto principal (token light)
const LEAD = '#51607a';  // parágrafo de abertura
const MUTED = '#5b6b82'; // notas, detalhes, rodapé
const FAINT = '#75849a'; // etapa ainda não alcançada
const LINK = '#0f7a74';  // link: teal da marca um tom mais fundo (o #178f89 não alcança 4.5:1 em corpo pequeno)

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** Asset público do web (mesma regra do utils/emailTemplate.ts, com fallback de produção). */
function assetUrl(file: string): string {
  const origin = (process.env.WEB_ORIGIN || 'https://janocaminho.com.br').replace(/\/$/, '');
  const base = (process.env.WEB_BASE_PATH ?? 'minhasaude').replace(/^\/+|\/+$/g, '');
  return base ? `${origin}/${base}/${file}` : `${origin}/${file}`;
}

/** Primeiro nome sem título ("Dra. Maria da Silva" → "Maria"), já escapado; '' se o cadastro não tem nome. */
const firstName = (name: string) => escapeHtml(stripDoctorTitle(name || '').split(/\s+/)[0] || '');
/** ", Maria" quando há nome; '' quando não há (a saudação não fica com vírgula solta). */
const comma = (first: string) => (first ? `, ${first}` : '');

type Tone = 'pending' | 'ok' | 'warn' | 'info';
const TONES: Record<Tone, [string, string, string]> = {
  pending: ['#fbf3ea', '#8a5a2b', '#ecd3b6'], // cobre — em análise
  ok: ['#e6f7f5', '#0f5f5a', '#bfe7e3'],      // teal — aprovado
  warn: ['#fdeeee', '#9b2c2c', '#f5c6c6'],    // recusado
  info: ['#eef2f7', '#334155', '#d8e0ea'],    // aviso interno
};
function badge(tone: Tone, text: string): string {
  const [bg, fg, bd] = TONES[tone];
  return `<span class="dx-badge-${tone}" style="display:inline-block;background:${bg};color:${fg};border:1px solid ${bd};border-radius:999px;padding:7px 14px;font:600 11px/1 ${BODY};letter-spacing:1.4px;text-transform:uppercase">${text}</span>`;
}

/** Card 16: `soft` = teal clarinho (status); `warm` = cobre clarinho (o que fazer agora). */
const card = (inner: string, kind: 'soft' | 'warm' = 'soft') => {
  const [bg, bd] = kind === 'warm' ? ['#fbf6ef', '#efdcc4'] : ['#f6fbfa', '#e3efed'];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="dx-${kind}" style="background:${bg};border:1px solid ${bd};border-radius:16px;margin:0 0 24px"><tr><td class="dx-cardpad" style="padding:20px">${inner}</td></tr></table>`;
};

type StepState = 'done' | 'current' | 'todo';
/** Marcadores de 24px (mesmo eixo nos três estados, para a linha do tempo alinhar). */
function stepMark(s: StepState): string {
  if (s === 'done') return `<div style="width:24px;height:24px;border-radius:12px;background:#178f89;background-image:linear-gradient(135deg,#20b2aa,#178f89);color:#ffffff;font:700 13px/24px ${BODY};text-align:center">&#10003;</div>`;
  if (s === 'current') return '<div class="dx-mark-now" style="width:20px;height:20px;border-radius:12px;border:2px solid #d4a574;background:#fbf3ea"><div style="width:10px;height:10px;border-radius:5px;background:#d4a574;margin:5px"></div></div>';
  return '<div class="dx-mark-todo" style="width:20px;height:20px;border-radius:12px;border:2px solid #d3dedd;background:#ffffff"></div>';
}

/** Linha do tempo vertical (robusta no celular): o fio liga um marcador ao próximo; teal até onde já chegou. */
function progress(steps: Array<{ label: string; detail: string; state: StepState }>): string {
  const rows = steps.map((s, i) => {
    const last = i === steps.length - 1;
    const pad = last ? 0 : 16;
    const todo = s.state === 'todo';
    const wire = s.state === 'done' ? ['dx-wire-done', '#8fd8d2'] : ['dx-wire-todo', '#dfe7e6'];
    const markTd = last
      ? '<td width="40" valign="top" style="padding:0">'
      : `<td width="40" valign="top" class="${wire[0]}" style="padding:0 0 ${pad}px;background-image:linear-gradient(${wire[1]},${wire[1]});background-repeat:no-repeat;background-position:11px 0;background-size:2px 100%">`;
    return `<tr>
      ${markTd}${stepMark(s.state)}</td>
      <td valign="top" style="padding:3px 0 ${pad}px">
        <div class="${todo ? 'dx-faint' : 'dx-text'}" style="font:600 14px/1.4 ${BODY};color:${todo ? FAINT : INK}">${s.label}</div>
        <div class="dx-muted" style="font:400 13px/1.5 ${BODY};color:${MUTED}">${s.detail}</div>
      </td></tr>`;
  }).join('');
  return card(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`);
}

/** Lista numerada com círculos cobre (primeiros passos / como resolver) em card cobre clarinho. */
function numbered(title: string, items: string[]): string {
  const rows = items.map((t, i) => {
    const pad = i === items.length - 1 ? 0 : 12;
    return `<tr>
      <td width="36" valign="top" style="padding:0 0 ${pad}px"><div style="width:24px;height:24px;border-radius:12px;background:#d4a574;color:#4a2f12;font:700 12px/24px ${BODY};text-align:center">${i + 1}</div></td>
      <td valign="top" class="dx-text" style="padding:2px 0 ${pad}px;font:400 14px/1.5 ${BODY};color:${INK}">${t}</td></tr>`;
  }).join('');
  return card(`<div class="dx-text" style="font:700 15px/1.4 ${HEAD};color:${INK};margin:0 0 14px">${title}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`, 'warm');
}

/** Botão "à prova de cliente": célula com bgcolor + gradiente (quem não renderiza gradiente vê o teal). */
function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center" class="dx-btn" style="margin:4px auto 8px"><tr>
    <td align="center" bgcolor="#178f89" style="border-radius:12px;background:#178f89;background-image:linear-gradient(135deg,#20b2aa,#178f89);box-shadow:0 6px 16px rgba(23,143,137,.28)">
      <a class="dx-btn-a" href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:15px 34px;font:600 15px/1 ${BODY};color:#ffffff;text-decoration:none;border-radius:12px">${label}</a>
    </td></tr></table>`;
}

const link = (href: string, label: string) => `<a class="dx-link" href="${href}" style="color:${LINK};text-decoration:underline">${label}</a>`;
const supportLink = link(`mailto:${SUPPORT}`, SUPPORT);

function layout(o: {
  title: string; preheader: string; tone: Tone; badgeText: string; heading: string; lead: string;
  /** Abertura em destaque (recusa: o motivo é o conteúdo principal) em vez de parágrafo corrido. */
  quote?: boolean;
  body: string; cta?: { href: string; label: string }; note: string; footer?: string;
}): string {
  const lead = o.quote
    ? `<div class="dx-quote" style="margin:8px 0 26px;padding:16px 18px;background:#fdf4f3;border-left:4px solid #e0877f;border-radius:8px"><p class="dx-text" style="margin:0;font:400 15px/1.65 ${BODY};color:${INK};overflow-wrap:anywhere;word-break:break-word;text-wrap:pretty">${o.lead}</p></div>`
    : `<p class="dx-muted" style="margin:0 0 26px;font:400 15px/1.65 ${BODY};color:${LEAD};overflow-wrap:anywhere;word-break:break-word;text-wrap:pretty">${o.lead}</p>`;
  return `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(o.title)}</title>
<style>
  @media (prefers-color-scheme: dark) {
    .dx-bg { background:#0f1818 !important; }
    .dx-card { background:#1a2424 !important; }
    .dx-text { color:#e8eef0 !important; }
    .dx-muted { color:#a9b8bb !important; }
    .dx-faint { color:#829699 !important; }
    .dx-link { color:#5fc9c3 !important; }
    .dx-soft { background:#13201f !important; border-color:#24403d !important; }
    .dx-warm { background:#221b14 !important; border-color:#4a3822 !important; }
    .dx-quote { background:#2a1b1b !important; border-left-color:#d9776f !important; }
    .dx-badge-pending { background:#2b2118 !important; color:#e8c39e !important; border-color:#5a4228 !important; }
    .dx-badge-ok { background:#0f2e2c !important; color:#7fe0d9 !important; border-color:#1d5a56 !important; }
    .dx-badge-warn { background:#3a1f1f !important; color:#f4b0b0 !important; border-color:#6b2f2f !important; }
    .dx-badge-info { background:#1f2a36 !important; color:#c5d3e0 !important; border-color:#34475a !important; }
    .dx-mark-now { background:#2b2118 !important; }
    .dx-mark-todo { background:#13201f !important; border-color:#3a4f4d !important; }
    .dx-wire-done { background-image:linear-gradient(#1d6b66,#1d6b66) !important; }
    .dx-wire-todo { background-image:linear-gradient(#2b3d3c,#2b3d3c) !important; }
  }
  @media (max-width: 620px) {
    .dx-container { width:100% !important; }
    .dx-pad { padding-left:22px !important; padding-right:22px !important; }
    .dx-cardpad { padding:16px !important; }
    .dx-h1 { font-size:22px !important; }
    .dx-btn { width:100% !important; }
    .dx-btn-a { display:block !important; padding-left:0 !important; padding-right:0 !important; }
  }
</style>
</head>
<body class="dx-bg" style="margin:0;padding:0;background:#eef7f6;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all">${escapeHtml(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="dx-bg" style="background:#eef7f6">
  <tr><td align="center" style="padding:32px 12px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" class="dx-container dx-card" style="width:600px;max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px rgba(23,143,137,.14)">
      <tr><td align="center" bgcolor="#178f89" style="background:#178f89;background-image:linear-gradient(135deg,#20b2aa,#178f89);padding:30px 32px 26px">
        <img src="${assetUrl('app-icon.png')}" width="64" height="64" alt="Dr. Exame" style="display:block;border:0;border-radius:16px;margin:0 auto 12px;box-shadow:0 0 0 3px rgba(255,255,255,.22),0 8px 20px rgba(8,70,66,.35)">
        <div style="font:700 22px/1.2 ${HEAD};color:#ffffff;letter-spacing:.3px">Dr. Exame</div>
        <div style="font:600 11px/1.4 ${BODY};color:#f6e7d5;letter-spacing:2.4px;text-transform:uppercase;margin-top:6px">Portal do Médico</div>
      </td></tr>
      <tr><td style="height:4px;line-height:4px;font-size:0;background:#d4a574;background-image:linear-gradient(90deg,#c9955f,#e8c39e,#c9955f)">&nbsp;</td></tr>
      <tr><td class="dx-pad" style="padding:36px 40px 12px">
        ${badge(o.tone, o.badgeText)}
        <h1 class="dx-text dx-h1" style="margin:18px 0 10px;font:700 24px/1.3 ${HEAD};color:${INK};text-wrap:balance">${o.heading}</h1>
        ${lead}
        ${o.body}
        ${o.cta ? button(o.cta.href, o.cta.label) : ''}
      </td></tr>
      <tr><td class="dx-pad" style="padding:12px 40px 32px">
        <p class="dx-muted" style="margin:0;font:400 13px/1.6 ${BODY};color:${MUTED}">${o.note}</p>
      </td></tr>
      <tr><td class="dx-soft" style="background:#f6fbfa;border-top:1px solid #e3efed;padding:20px 40px;text-align:center">
        <p class="dx-muted" style="margin:0;font:400 12px/1.7 ${BODY};color:${MUTED}">
          Dr. Exame · Portal do Médico<br>
          Dúvidas: ${supportLink}<br>
          ${o.footer ?? 'Você recebeu este e-mail porque se cadastrou no Portal do Médico. Envio automático.'}
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export const DOCTOR_KYC_SUBJECTS = {
  received: 'Recebemos seu cadastro — está em análise | Dr. Exame',
  approved: 'Sua conta foi aprovada — você já pode atender | Dr. Exame',
  rejected: 'Sua verificação não foi aprovada — veja como resolver | Dr. Exame',
} as const;

/**
 * `captureTips` (só na recusa): true → card "Como resolver" com as 3 dicas de captura (motivo de
 * documento/selfie/prova de vida/nome — ver kycCaptureIssue); false/ausente → card neutro "E agora?"
 * (CRM/CFM, CPF, fraude, expirado, desconhecido e todo motivo escrito pelo dono).
 */
export function doctorKycEmail(i: { name: string; crm?: string | null; kind: 'received' | 'approved' | 'rejected'; reason?: string | null; captureTips?: boolean; portalUrl: string }): string {
  const first = firstName(i.name);
  const crm = i.crm ? `CRM ${escapeHtml(i.crm)}` : 'seu CRM';
  if (i.kind === 'received') {
    return layout({
      title: DOCTOR_KYC_SUBJECTS.received,
      preheader: 'Sua verificação chegou. Nossa equipe confere seus dados e avisa por e-mail.',
      tone: 'pending', badgeText: 'Em análise',
      heading: `Recebemos seu cadastro${comma(first)}`,
      lead: `Sua verificação de identidade chegou. Agora nossa equipe confere seus dados e o ${crm} no CFM — você recebe um e-mail assim que terminarmos.`,
      body: progress([
        { label: 'Cadastro no portal', detail: 'Conta criada e e-mail confirmado', state: 'done' },
        { label: 'Verificação de identidade', detail: 'Documento e selfie enviados', state: 'done' },
        { label: 'Análise da equipe', detail: `Conferindo seus dados e o ${crm}`, state: 'current' },
        { label: 'Atendimento liberado', detail: 'Você recebe pacientes pelo Dr. Exame', state: 'todo' },
      ]),
      cta: { href: i.portalUrl, label: 'Acompanhar no portal' },
      note: `Não reconhece este cadastro? Fale com a gente em ${supportLink} — levamos a segurança dos pacientes a sério.`,
    });
  }
  if (i.kind === 'approved') {
    return layout({
      title: DOCTOR_KYC_SUBJECTS.approved,
      preheader: 'Identidade e CRM confirmados. Seu atendimento pelo Dr. Exame está liberado.',
      tone: 'ok', badgeText: 'Conta aprovada',
      heading: `Tudo pronto${comma(first)}! Sua conta está aprovada`,
      lead: `Confirmamos sua identidade e o ${crm}. A partir de agora você pode atender pacientes pelo Dr. Exame.`,
      body: progress([
        { label: 'Cadastro no portal', detail: 'Conta criada e e-mail confirmado', state: 'done' },
        { label: 'Verificação de identidade', detail: 'Documento e selfie conferidos', state: 'done' },
        { label: 'Análise da equipe', detail: `${crm} confirmado no CFM`, state: 'done' },
        { label: 'Atendimento liberado', detail: 'Pronto para receber pacientes', state: 'done' },
      ]) + numbered('Seus primeiros passos', [
        '<strong>Complete seu perfil</strong> — foto, especialidade e uma apresentação curta.',
        '<strong>Ative a verificação em 2 etapas</strong> para proteger sua conta.',
        '<strong>Fique online em “Atender agora”</strong> para receber pacientes da fila.',
      ]),
      cta: { href: i.portalUrl, label: 'Abrir o Portal do Médico' },
      note: 'Por segurança, nunca pedimos sua senha ou códigos por e-mail.',
    });
  }
  return layout({
    title: DOCTOR_KYC_SUBJECTS.rejected,
    preheader: 'Não conseguimos concluir sua verificação. Veja como resolver.',
    tone: 'warn', badgeText: 'Verificação não aprovada',
    heading: `Não conseguimos aprovar sua verificação${comma(first)}`,
    // Motivo = conteúdo principal; pode ser texto livre do dono (várias linhas): escapa e preserva as quebras.
    lead: escapeHtml(i.reason?.trim() || 'Algo não bateu na conferência dos seus dados.').replace(/\r?\n/g, '<br>'),
    quote: true,
    body: i.captureTips
      ? numbered('Como resolver', [
        'Use um documento <strong>original</strong> (RG, CNH ou RNE), sem reflexo.',
        'Faça a selfie em local <strong>bem iluminado</strong>, sem óculos ou boné.',
        'Confira se o nome do documento é o mesmo do seu <strong>registro no CFM</strong>.',
      ])
      : numbered('E agora?', [
        '<strong>Leia o motivo</strong> acima — ele explica o que impediu a aprovação.',
        `<strong>Acha que foi um engano?</strong> Responda este e-mail ou escreva para ${supportLink}.`,
        '<strong>Está tudo em ordem?</strong> Tente de novo pelo Portal do Médico.',
      ]),
    cta: { href: i.portalUrl, label: 'Tentar de novo' },
    // No card neutro o contato já está no passo 2 — não repete; fecha com o aviso de segurança.
    note: i.captureTips ? `Precisa de ajuda? Fale com a gente em ${supportLink}.` : 'Por segurança, nunca pedimos sua senha ou códigos por e-mail.',
  });
}

/** Aviso ao dono (fila de KYC) — mesmo layout; linhas em texto puro, escapadas aqui. */
export function kycAdminEmail(i: { title: string; lines: string[]; adminUrl: string }): string {
  return layout({
    title: i.title,
    preheader: i.lines[0] ?? i.title,
    tone: 'info', badgeText: 'Ação necessária',
    // Título do assunto sem o prefixo da marca e com a inicial maiúscula ("médico pronto…" → "Médico pronto…").
    heading: escapeHtml(i.title.replace(/^Dr\. Exame — /, '').replace(/^./, (c) => c.toUpperCase())),
    lead: i.lines.map(escapeHtml).join('<br>'),
    body: '',
    cta: { href: i.adminUrl, label: 'Abrir Médicos em análise' },
    note: 'Aviso interno do Dr. Exame — KYC de médicos.',
    footer: 'Notificação automática da verificação de médicos. Não responda a este e-mail.',
  });
}
