/** Template HTML profissional para e-mails transacionais do Meus Exames. */
export function emailTemplate(opts: { title: string; preheader?: string; content: string }): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${opts.title}</title></head>
<body style="margin:0;padding:0;background:#eef3fb;font-family:'Segoe UI',Roboto,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef3fb;padding:24px 0">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(11,92,171,.08)">
        <!-- header -->
        <tr><td style="background:linear-gradient(135deg,#0b5cab,#1565c0);padding:28px 32px;text-align:center">
          <div style="font-size:36px;line-height:1">🤖</div>
          <h1 style="color:#fff;font-size:22px;margin:8px 0 0;font-weight:800;letter-spacing:.5px">Meus Exames</h1>
          <p style="color:rgba(255,255,255,.8);font-size:13px;margin:4px 0 0">Seu assistente de saúde no bolso</p>
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
      <div style="text-align:center;background:#eef3fb;border-radius:12px;padding:24px;margin:0 0 24px">
        <span style="font-size:38px;font-weight:800;letter-spacing:8px;color:#0b5cab">${code}</span>
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
