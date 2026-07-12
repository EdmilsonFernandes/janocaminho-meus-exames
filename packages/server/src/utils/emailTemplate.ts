/** Template HTML profissional para e-mails transacionais do Meus Exames. */
const _origin = (process.env.WEB_ORIGIN || '').replace(/\/$/, '');
const _base = (process.env.WEB_BASE_PATH || '').replace(/^\/+|\/+$/g, '');
const BRAND_URL = _base ? `${_origin}/${_base}/app-icon.png` : `${_origin}/app-icon.png`;

export function emailTemplate(opts: { title: string; preheader?: string; content: string }): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${opts.title}</title></head>
<body style="margin:0;padding:0;background:#eef3fb;font-family:'Segoe UI',Roboto,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef3fb;padding:24px 0">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(32,178,170,.10)">
        <!-- header (mascote oficial + identidade teal da marca) -->
        <tr><td style="background:linear-gradient(135deg,#20b2aa,#178f89);padding:22px 32px;text-align:center">
          <img src="${BRAND_URL}" width="56" height="56" alt="Dr. Exame" style="border-radius:14px;display:block;margin:0 auto 8px" />
          <h1 style="color:#fff;font-size:22px;margin:0;font-weight:800;letter-spacing:.5px">Meus Exames</h1>
          <p style="color:rgba(255,255,255,.88);font-size:13px;margin:4px 0 0">Seu assistente de saúde no bolso</p>
        </td></tr>
        <!-- body -->
        <tr><td style="padding:32px">
          ${opts.preheader ? `<p style="color:#51607a;font-size:14px;margin:0 0 16px">${opts.preheader}</p>` : ''}
          ${opts.content}
        </td></tr>
        <!-- footer -->
        <tr><td style="background:#f3f6fb;padding:20px 32px;border-top:1px solid #e0e6f0">
          <p style="color:#8b9bb4;font-size:12px;margin:0;text-align:center;line-height:1.5">
            Meus Exames — análise educativa, não substitui consulta médica.<br>
            Este e-mail foi enviado automaticamente. Não responda.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** E-mail com código OTP (login sem senha). */
export function otpEmail(name: string, code: string): string {
  return emailTemplate({
    title: 'Seu código — Meus Exames',
    preheader: `Olá ${name}! Use o código abaixo para entrar.`,
    content: `
      <p style="font-size:16px;color:#15233b;margin:0 0 8px">Olá <strong>${name}</strong>!</p>
      <p style="font-size:15px;color:#51607a;margin:0 0 24px">Use o código abaixo para acessar o Meus Exames. Ele expira em <strong>10 minutos</strong>.</p>
      <div style="text-align:center;background:#e6f7f5;border:2px dashed #20b2aa;border-radius:16px;padding:28px 20px;margin:0 0 16px">
        <span style="font-size:46px;font-weight:800;letter-spacing:10px;color:#0f3d3a;font-family:'Courier New',monospace">${code}</span>
        <p style="font-size:12px;color:#757575;margin:14px 0 0">👆 Toque e segure no código pra copiar, depois cole no app.</p>
      </div>
      <p style="font-size:14px;color:#8b9bb4;margin:0">Se não foi você quem pediu este código, ignore este e-mail.</p>`,
  });
}

/** E-mail de reset de senha. */
export function resetEmail(name: string, link: string): string {
  return emailTemplate({
    title: 'Redefinição de senha — Meus Exames',
    preheader: 'Redefina sua senha com o botão abaixo.',
    content: `
      <p style="font-size:16px;color:#15233b;margin:0 0 8px">Olá <strong>${name}</strong>!</p>
      <p style="font-size:15px;color:#51607a;margin:0 0 24px">Clique no botão abaixo para redefinir sua senha. O link expira em 30 minutos.</p>
      <div style="text-align:center;margin:0 0 24px">
        <a href="${link}" style="display:inline-block;background:#0b5cab;color:#fff;font-size:16px;font-weight:700;padding:14px 36px;border-radius:10px;text-decoration:none">Redefinir senha</a>
      </div>
      <p style="font-size:14px;color:#8b9bb4;margin:0">Se não foi você, ignore este e-mail — sua senha não foi alterada.</p>`,
  });
}

/** E-mail de lembrete de exame. */
export function reminderEmail(name: string, title: string, dueDate: string): string {
  return emailTemplate({
    title: 'Lembrete: ' + title,
    preheader: 'Não esqueça do seu exame!',
    content: `
      <p style="font-size:16px;color:#15233b;margin:0 0 8px">Olá <strong>${name}</strong>!</p>
      <p style="font-size:15px;color:#51607a;margin:0 0 16px">Este é um lembrete do seu compromisso de saúde:</p>
      <div style="background:#fff3e0;border-left:4px solid #ff9800;border-radius:8px;padding:16px;margin:0 0 24px">
        <p style="font-size:18px;font-weight:700;color:#15233b;margin:0 0 4px">🩺 ${title}</p>
        <p style="font-size:15px;color:#51607a;margin:0">📅 ${dueDate}</p>
      </div>
      <p style="font-size:14px;color:#8b9bb4;margin:0">Acesse o app para mais detalhes e para marcar como concluído.</p>`,
  });
}

/**
 * Nudge de saúde por E-MAIL — canal de fallback p/ quem NÃO tem push (ex.: iPhone no
 * navegador, onde não há app nativo nem FCM). Mesmo alerta/lembrete do push, em texto.
 */
export function nudgeEmail(opts: { name: string; title: string; body: string; ctaUrl: string; ctaLabel?: string; unsubUrl: string }): string {
  // title vem como "Edmilson, um valor precisa de atenção" → vira headline limpa no corpo.
  const headline = opts.title.replace(/^[^,]+,\s*/, '').replace(/^./, (c) => c.toUpperCase());
  return emailTemplate({
    title: opts.title,
    preheader: opts.body.slice(0, 140),
    content: `
      <p style="font-size:16px;color:#15233b;margin:0 0 10px">Olá <strong>${opts.name}</strong>,</p>
      <h2 style="font-size:19px;color:#0f3d3a;margin:0 0 12px;line-height:1.35">${headline}</h2>
      <p style="font-size:15px;color:#51607a;line-height:1.6;margin:0 0 22px">${opts.body}</p>
      <div style="text-align:center;margin:0 0 22px">
        <a href="${opts.ctaUrl}" style="display:inline-block;background:#20b2aa;color:#fff;font-size:16px;font-weight:700;padding:14px 36px;border-radius:99px;text-decoration:none">${opts.ctaLabel ?? 'Abrir o app'}</a>
      </div>
      <p style="font-size:13px;color:#8b9bb4;line-height:1.55;margin:0 0 6px">Você recebeu este aviso por e-mail porque ainda não recebemos notificações push deste aparelho (por exemplo, iPhone acessando pelo navegador). As notificações dentro do app continuam funcionando normalmente.</p>
      <p style="font-size:13px;margin:0"><a href="${opts.unsubUrl}" style="color:#8b9bb4;text-decoration:underline">Não quero receber estes avisos por e-mail</a></p>`,
  });
}

/** Monta uma URL absoluta do app (WEB_ORIGIN + WEB_BASE_PATH + path). Ex.: webUrl('/#/suporte'). */
export function webUrl(path: string): string {
  return `${_origin}${_base ? '/' + _base : ''}${path}`;
}

/** E-mail: suporte respondeu um chamado (Zendesk-like). */
export function ticketReplyEmail(opts: { name?: string; ticketNumber: number; body: string; appUrl: string }): string {
  const safe = (opts.body || '(anexo)').replace(/</g, '&lt;').replace(/\n/g, '<br>');
  return emailTemplate({
    title: `Seu chamado #${opts.ticketNumber} — Meus Exames`,
    preheader: `O suporte respondeu seu chamado #${opts.ticketNumber}.`,
    content: `
      <p style="font-size:16px;color:#15233b;margin:0 0 8px">Olá${opts.name ? `, <strong>${opts.name}</strong>` : ''}!</p>
      <p style="font-size:15px;color:#51607a;margin:0 0 20px">O suporte respondeu seu chamado <strong>#${opts.ticketNumber}</strong>:</p>
      <div style="background:#f3f6fb;border-left:4px solid #20b2aa;border-radius:8px;padding:16px 18px;margin:0 0 24px">
        <p style="font-size:15px;color:#15233b;line-height:1.6;margin:0">${safe}</p>
      </div>
      <div style="text-align:center;margin:0 0 16px">
        <a href="${opts.appUrl}" style="display:inline-block;background:#20b2aa;color:#fff;font-size:16px;font-weight:700;padding:14px 36px;border-radius:99px;text-decoration:none">Ver e responder no app</a>
      </div>
      <p style="font-size:14px;color:#8b9bb4;margin:0">Abra o app → Ajuda &amp; Suporte para continuar a conversa.</p>`,
  });
}

/** E-mail: paciente compartilhou dados com o médico (convite ao Portal do Médico). */
export function doctorInviteEmail(opts: { doctorName?: string; patientName: string; scopes: string[]; convenio?: string | null; portalUrl: string }): string {
  const scopeLabels: Record<string, string> = { exams: 'Exames', evolution: 'Evolução', alerts: 'Alertas', summary: 'Resumos IA' };
  const labels = (opts.scopes.length ? opts.scopes : ['exams']).map((s) => scopeLabels[s] || s);
  return emailTemplate({
    title: `${opts.patientName} compartilhou dados — Meus Exames`,
    preheader: `${opts.patientName} compartilhou dados de saúde com você.`,
    content: `
      <p style="font-size:16px;color:#15233b;margin:0 0 8px">Olá${opts.doctorName ? `, <strong>${opts.doctorName}</strong>` : ''}!</p>
      <p style="font-size:15px;color:#51607a;margin:0 0 20px">O paciente <strong>${opts.patientName}</strong> compartilhou dados de saúde com você no Meus Exames.</p>
      <div style="background:#f3f6fb;border-radius:10px;padding:16px 18px;margin:0 0 24px">
        <p style="font-size:13px;color:#8b9bb4;margin:0 0 6px;text-transform:uppercase;letter-spacing:.5px">O que foi compartilhado</p>
        <p style="font-size:16px;color:#15233b;font-weight:700;margin:0">${labels.join(' · ')}</p>
        ${opts.convenio ? `<p style="font-size:14px;color:#51607a;margin:8px 0 0">Convênio: ${opts.convenio}</p>` : ''}
      </div>
      <div style="text-align:center;margin:0 0 16px">
        <a href="${opts.portalUrl}" style="display:inline-block;background:#20b2aa;color:#fff;font-size:16px;font-weight:700;padding:14px 36px;border-radius:99px;text-decoration:none">Acessar o Portal do Médico</a>
      </div>
      <p style="font-size:14px;color:#8b9bb4;margin:0">Pré-cadastro automático pelo CRM. Você vê apenas o que o paciente autorizou.</p>`,
  });
}

/** E-mail: plano Premium vence em N dias. */
export function planExpiryEmail(opts: { name: string; days: number; expiresAt: Date; renewUrl: string }): string {
  const first = (opts.name || '').split(' ')[0];
  const dia = opts.days === 1 ? 'dia' : 'dias';
  return emailTemplate({
    title: `${first}, seu Premium vence em ${opts.days} ${dia} — Meus Exames`,
    preheader: 'Renove pra continuar com relatórios, score e o Dr. Exame.',
    content: `
      <p style="font-size:16px;color:#15233b;margin:0 0 8px">Oi <strong>${first}</strong>,</p>
      <p style="font-size:15px;color:#51607a;margin:0 0 20px">Seu plano Premium do Meus Exames termina em <strong>${opts.expiresAt.toLocaleDateString('pt-BR')}</strong> (${opts.days} ${dia}).</p>
      <div style="background:#fff3e0;border-left:4px solid #ff9800;border-radius:8px;padding:14px 18px;margin:0 0 24px">
        <p style="font-size:14px;color:#51607a;margin:0">Renove pra não perder: <strong style="color:#15233b">relatórios completos, score de saúde, comparação de exames e o assistente Dr. Exame</strong>.</p>
      </div>
      <div style="text-align:center;margin:0 0 16px">
        <a href="${opts.renewUrl}" style="display:inline-block;background:#20b2aa;color:#fff;font-size:16px;font-weight:700;padding:14px 36px;border-radius:99px;text-decoration:none">Renovar Premium</a>
      </div>
      <p style="font-size:13px;color:#8b9bb4;margin:0">Sem renovação automática — você decide. Seus exames e dados continuam acessíveis mesmo sem Premium.</p>`,
  });
}

/** E-mail: paciente fez uma PERGUNTA ao médico (avisa o médico pra abrir o portal). */
export function doctorQuestionEmail(opts: { doctorName?: string; patientName: string; subject: string; portalUrl: string }): string {
  const subj = (opts.subject || '').replace(/</g, '&lt;').slice(0, 280);
  return emailTemplate({
    title: `${opts.patientName} fez uma pergunta — Meus Exames`,
    preheader: `${opts.patientName} tem uma dúvida pra você.`,
    content: `
      <p style="font-size:16px;color:#15233b;margin:0 0 8px">Olá${opts.doctorName ? `, <strong>${opts.doctorName}</strong>` : ''}!</p>
      <p style="font-size:15px;color:#51607a;margin:0 0 20px">O paciente <strong>${opts.patientName}</strong> fez uma pergunta pra você:</p>
      <div style="background:#f3f6fb;border-left:4px solid #20b2aa;border-radius:8px;padding:16px 18px;margin:0 0 24px">
        <p style="font-size:15px;color:#15233b;line-height:1.6;margin:0">${subj}</p>
      </div>
      <div style="text-align:center;margin:0 0 16px">
        <a href="${opts.portalUrl}" style="display:inline-block;background:#20b2aa;color:#fff;font-size:16px;font-weight:700;padding:14px 36px;border-radius:99px;text-decoration:none">Responder no Portal do Médico</a>
      </div>
      <p style="font-size:14px;color:#8b9bb4;margin:0">Você só recebe perguntas de pacientes que compartilharam dados com você.</p>`,
  });
}

/** E-mail: o médico RESPONDEU uma pergunta (avisa o paciente). */
export function doctorAnswerEmail(opts: { patientName?: string; doctorName: string; subject: string; answer: string; appUrl: string }): string {
  const safeAns = (opts.answer || '').replace(/</g, '&lt;').replace(/\n/g, '<br>').slice(0, 600);
  const safeSub = (opts.subject || '').replace(/</g, '&lt;').slice(0, 200);
  return emailTemplate({
    title: `${opts.doctorName} respondeu sua pergunta — Meus Exames`,
    preheader: `Resposta à sua pergunta${safeSub ? ` sobre ${safeSub}` : ''}.`,
    content: `
      <p style="font-size:16px;color:#15233b;margin:0 0 8px">Olá${opts.patientName ? `, <strong>${opts.patientName}</strong>` : ''}!</p>
      <p style="font-size:15px;color:#51607a;margin:0 0 8px"><strong>${opts.doctorName}</strong> respondeu sua pergunta${safeSub ? ` sobre <em>${safeSub}</em>` : ''}:</p>
      <div style="background:#f3f6fb;border-left:4px solid #20b2aa;border-radius:8px;padding:16px 18px;margin:0 0 24px">
        <p style="font-size:15px;color:#15233b;line-height:1.6;margin:0">${safeAns}</p>
      </div>
      <div style="text-align:center;margin:0 0 16px">
        <a href="${opts.appUrl}" style="display:inline-block;background:#20b2aa;color:#fff;font-size:16px;font-weight:700;padding:14px 36px;border-radius:99px;text-decoration:none">Ver no app</a>
      </div>
      <p style="font-size:14px;color:#8b9bb4;margin:0">A resposta do médico é orientação profissional — não substitui uma consulta presencial quando ele julgar necessária.</p>`,
  });
}
