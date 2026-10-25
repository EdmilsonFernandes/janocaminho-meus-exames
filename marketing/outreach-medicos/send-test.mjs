// Envio de TESTE do e-mail Dr. Exame → médico — v3 (template outreach-medicos-v3.html).
// Prints hospedados em https://drexame.janocaminho.com.br/promo/ (URL absoluta, sem anexo).
// Uso: node marketing/outreach-medicos/send-test.mjs [destinatario@teste] [--subject=B]
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

const TO = process.argv.find((a) => a.includes('@') && !a.startsWith('--')) || 'edmls2008@gmail.com';
const SUBJECTS = {
  A: 'Seu paciente te manda foto de exame no WhatsApp?',
  B: 'Exames dos seus pacientes, organizados ANTES da consulta',
};
const SUBJECT = SUBJECTS[(process.argv.find((a) => a.startsWith('--subject=')) || '--subject=A').slice(10)] ?? SUBJECTS.A;

// ---- merge de exemplo (prospect real da lista-semente) ----
const prospect = { nome: 'Dr. André Isquierdo', especialidade: 'médico', fonteUrl: 'https://clinicadocoracao.com.br/' };

const HTML_TPL = readFileSync(path.join(root, 'marketing', 'outreach-medicos-v3.html'), 'utf8');
const TEXT_TPL = readFileSync(path.join(root, 'marketing', 'outreach-medicos-v3.txt'), 'utf8');
const merge = (tpl) => tpl
  .replaceAll('{{NOME}}', prospect.nome)
  .replaceAll('{{FONTE}}', ` (${prospect.fonteUrl})`)
  .replaceAll('{{UNSUBSCRIBE_URL}}', 'mailto:' + env.SMTP_USER + '?subject=Descadastrar%20Dr.%20Exame');

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: Number(env.SMTP_PORT || 587),
  secure: env.SMTP_SECURE === 'true',
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

const info = await transporter.sendMail({
  from: 'Edmilson (Dr. Exame) <' + env.SMTP_USER + '>',
  to: TO,
  subject: SUBJECT,
  text: merge(TEXT_TPL),
  html: merge(HTML_TPL),
});

console.log('ENVIADO:', info.messageId, '→', TO, '| assunto:', SUBJECT, '| resposta:', info.response);
