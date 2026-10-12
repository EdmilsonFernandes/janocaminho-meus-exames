// Envio de TESTE do e-mail de parceria Dr. Exame → médico.
// Usa o SMTP Zoho do servidor (packages/server/.env) e embute os prints (cid).
// Uso: node marketing/outreach-medicos/send-test.mjs [destinatario@teste]
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const require = createRequire(path.join(root, 'packages', 'server', 'package.json'));
const nodemailer = require('nodemailer');

// ---- env (packages/server/.env) ----
const env = {};
for (const line of readFileSync(path.join(root, 'packages', 'server', '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const TO = process.argv[2] || 'edmls2008@gmail.com';

// ---- merge de exemplo (prospect real da lista-semente) ----
const prospect = {
  nome: 'Dr. Mário Coutinho',
  especialidade: 'endocrinologista',
  fonteUrl: 'https://drmariocoutinho.com.br/',
};

const html = `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:0;background:#f2f7f6;">
<div style="display:none;max-height:0;overflow:hidden;">App brasileiro, gratuito para médicos. Dois minutos para conhecer.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f7f6;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;font-family:Helvetica,Arial,sans-serif;color:#2d3748;">

  <!-- topo -->
  <tr><td style="padding:28px 36px 8px 36px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="background:#20b2aa;color:#fff;border-radius:12px;padding:8px 14px;font-weight:bold;font-size:15px;">Dr. Exame</td>
      <td style="color:#178f89;font-size:13px;padding-left:10px;">assistente de exames com IA</td>
    </tr></table>
  </td></tr>

  <!-- corpo -->
  <tr><td style="padding:20px 36px 0 36px;font-size:15px;line-height:1.55;">
    <p style="margin:0 0 14px 0;">Olá, <strong>${prospect.nome}</strong> 👋</p>
    <p style="margin:0 0 14px 0;">Sou <strong>Edmilson Fernandes</strong>, fundador do <strong>Dr. Exame</strong> — app brasileiro que organiza os exames laboratoriais dos pacientes e traduz os laudos para linguagem simples.</p>
    <p style="margin:0 0 14px 0;"><strong>O problema:</strong> o paciente chega na consulta com exames espalhados entre WhatsApp, e-mail e papel. No app ele junta tudo em PDF, vê a evolução dos marcadores no tempo e recebe uma explicação <strong>educativa</strong> de cada item — comparando com a faixa de referência, <strong>sem diagnóstico e sem substituir o médico</strong>.</p>
    <p style="margin:0 0 8px 0;"><strong>Para você, ${prospect.especialidade}:</strong></p>
    <ul style="margin:0 0 12px 0;padding-left:22px;">
      <li style="margin-bottom:6px;">Paciente compartilha os exames com você direto pelo app — chega na consulta tudo organizado</li>
      <li style="margin-bottom:6px;"><strong>Portal do médico gratuito</strong>: painel dos pacientes, tendências de marcadores, histórico</li>
      <li style="margin-bottom:6px;">Sem custo, sem cadastro obrigatório, sem mudar sua rotina</li>
    </ul>
    <p style="margin:0 0 18px 0;">Por trás do app há <strong>IA que lê o laudo</strong>, compara cada item com a faixa de referência do laboratório e cruza os exames ao longo do tempo para apontar <strong>padrões e tendências</strong> — sempre como conteúdo educativo. <strong>A IA nunca dá diagnóstico:</strong> a interpretação e a decisão continuam sendo suas, com o contexto clínico que só você tem.</p>
  </td></tr>

  <!-- prints 2x2 (prints do dono): paciente1/2 + medico1/2 -->
  <tr><td style="padding:0 36px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2eceb;border-radius:14px;">
      <tr><td colspan="2" align="center" style="padding:12px 8px 0 8px;color:#178f89;font-size:12px;font-weight:bold;letter-spacing:0.4px;">📱 LADO DO PACIENTE</td></tr>
      <tr>
        <td align="center" style="padding:10px 8px 6px 8px;"><img src="cid:print1" width="235" alt="App do Dr. Exame — visão do paciente" style="border-radius:10px;border:1px solid #dce8e7;display:block;"></td>
        <td align="center" style="padding:10px 8px 6px 8px;"><img src="cid:print2" width="235" alt="App do Dr. Exame — visão do paciente" style="border-radius:10px;border:1px solid #dce8e7;display:block;"></td>
      </tr>
      <tr><td colspan="2" style="border-top:1px solid #eef5f4;"></td></tr>
      <tr><td colspan="2" align="center" style="padding:12px 8px 0 8px;color:#178f89;font-size:12px;font-weight:bold;letter-spacing:0.4px;">🩺 LADO DO MÉDICO</td></tr>
      <tr>
        <td align="center" style="padding:10px 8px 14px 8px;"><img src="cid:print3" width="235" alt="Portal do Médico — Dr. Exame" style="border-radius:10px;border:1px solid #dce8e7;display:block;"></td>
        <td align="center" style="padding:10px 8px 14px 8px;"><img src="cid:print4" width="235" alt="Portal do Médico — Dr. Exame" style="border-radius:10px;border:1px solid #dce8e7;display:block;"></td>
      </tr>
    </table>
  </td></tr>

  <!-- como conhecer — SEM links (anti-phishing: endereço pra digitar) -->
  <tr><td style="padding:22px 36px 0 36px;font-size:15px;line-height:1.55;">
    <p style="margin:0 0 10px 0;"><strong>Para conhecer os dois lados (sem clicar em nada):</strong></p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2faf9;border:1px solid #d8ebe9;border-radius:12px;margin-bottom:16px;"><tr><td style="padding:14px 18px;font-size:14.5px;line-height:1.7;color:#2d3748;">
      1. No navegador, digite você mesmo: <strong style="color:#178f89;">drexame.janocaminho.com.br</strong><br>
      2. <strong>Como paciente:</strong> crie sua conta grátis e suba um exame em PDF (seu mesmo) — veja como fica a organização e a explicação educativa<br>
      3. <strong>Como médico:</strong> na tela de login, aba <strong>Médico</strong> → criar conta com seu CRM — esse é o portal que os seus pacientes veriam ao compartilhar exames com você<br>
      4. No celular Android: abra a <strong>Google Play</strong> e busque <strong>"Dr. Exame"</strong> (ícone do robozinho com escudo). iPhone: o site funciona pelo navegador mesmo
    </td></tr></table>
    <p style="margin:0 0 14px 0;color:#7a8b8a;font-size:13px;">De propósito este e-mail não tem nenhum link clicável — as imagens acima são telas reais do app e os endereços estão escritos para você digitar e conferir.</p>
    <p style="margin:0 0 14px 0;"><strong>O que peço:</strong> se um paciente perguntar <em>"doutor, onde guardo meus exames?"</em>, indicar o Dr. Exame. Alguns médicos já recebem pacientes com o histórico pronto na tela — o feedback tem sido esse: consulta mais rápida, nada perdido.</p>
    <p style="margin:0 0 14px 0;">Qualquer dúvida, é só responder este e-mail — leio pessoalmente.</p>
  </td></tr>

  <!-- assinatura -->
  <tr><td style="padding:0 36px 18px 36px;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2eceb;" width="100%"><tr><td style="padding-top:14px;font-size:14px;line-height:1.5;">
      <strong style="color:#2d3748;">Edmilson Fernandes</strong><br>
      <span style="color:#7a8b8a;">Fundador · Dr. Exame — drexame.janocaminho.com.br<br>
      LinkedIn: linkedin.com/in/edmilson-santos-6805a515</span>
    </td></tr></table>
  </td></tr>

  <!-- rodapé -->
  <tr><td style="background:#f7fbfa;padding:14px 36px;color:#9aa9a8;font-size:11.5px;line-height:1.5;">
    Conseguimos seu contato no site público do seu consultório (${prospect.fonteUrl}). Contato profissional único — sem cadeia de e-mails.<br>
    Não quer receber? Responda <strong>REMOVER</strong> e saímos da lista imediatamente. O Dr. Exame não faz diagnóstico; não substitui consulta médica.
  </td></tr>

</table>
</td></tr></table>
</body></html>`;

const text = `Olá, ${prospect.nome}

Sou Edmilson Fernandes, fundador do Dr. Exame — app brasileiro que organiza os exames laboratoriais dos pacientes e traduz os laudos para linguagem simples.

O problema: o paciente chega na consulta com exames espalhados entre WhatsApp, e-mail e papel. No app ele junta tudo em PDF, vê a evolução dos marcadores no tempo e recebe uma explicação educativa de cada item — comparando com a faixa de referência, sem diagnóstico e sem substituir o médico.

Para você, ${prospect.especialidade}:
- Paciente compartilha os exames com você direto pelo app — chega na consulta tudo organizado
- Portal do médico gratuito: painel dos pacientes, tendências de marcadores, histórico
- Sem custo, sem cadastro obrigatório, sem mudar sua rotina

Por trás do app há IA que lê o laudo, compara cada item com a faixa de referência do laboratório e cruza os exames ao longo do tempo para apontar padrões e tendências — sempre como conteúdo educativo. A IA nunca dá diagnóstico: a interpretação e a decisão continuam sendo suas, com o contexto clínico que só você tem.

(Imagens em anexo: lado do paciente no celular — painel e exame com faixas; lado do médico no computador — painel do portal e lista de pacientes.)

Para conhecer os dois lados (sem clicar em nada — de propósito, este e-mail não tem links):
1. No navegador, digite você mesmo: drexame.janocaminho.com.br
2. Como paciente: crie sua conta grátis e suba um exame em PDF seu
3. Como médico: na tela de login, aba Médico → criar conta com seu CRM (portal que seus pacientes veriam)
4. Android: Google Play, busque "Dr. Exame" (robozinho com escudo). iPhone: site no navegador mesmo.

O que peço: se um paciente perguntar "doutor, onde guardo meus exames?", indicar o Dr. Exame. Alguns médicos já recebem pacientes com o histórico pronto na tela.

Qualquer dúvida, é só responder — leio pessoalmente.

Edmilson Fernandes
Fundador · Dr. Exame — drexame.janocaminho.com.br
https://www.linkedin.com/in/edmilson-santos-6805a515/

---
Conseguimos seu contato no site público do seu consultório. Contato profissional único. Não quer receber? Responda REMOVER.`;

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: Number(env.SMTP_PORT || 587),
  secure: env.SMTP_SECURE === 'true',
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

const info = await transporter.sendMail({
  from: 'Edmilson (Dr. Exame) <' + env.SMTP_USER + '>',
  to: TO,
  subject: 'Exames dos seus pacientes, organizados',
  text,
  html,
  attachments: [
    { filename: 'paciente1.png', path: path.join(here, 'screenshots', 'paciente1.png'), cid: 'print1', contentDisposition: 'inline' },
    { filename: 'paciente2.png', path: path.join(here, 'screenshots', 'paciente2.png'), cid: 'print2', contentDisposition: 'inline' },
    { filename: 'medico1.png', path: path.join(here, 'screenshots', 'medico1.png'), cid: 'print3', contentDisposition: 'inline' },
    { filename: 'medico2.png', path: path.join(here, 'screenshots', 'medico2.png'), cid: 'print4', contentDisposition: 'inline' },
  ],
});

console.log('ENVIADO:', info.messageId, '→', TO, '| resposta:', info.response);
