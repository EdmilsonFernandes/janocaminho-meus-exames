// Disparo da campanha Dr. Exame → médicos — v3 (dor WhatsApp → brief/PIX/convite).
// Template: marketing/outreach-medicos-v3.html (+ .txt). Prints HOSPEDADOS por URL absoluta
// (packages/web/public/promo/) — sem anexos, sem cid. 1:1 via SMTP Zoho + BCC edmls2008.
// Uso: node marketing/outreach-medicos/send-batch.mjs [--dry] [--csv=...] [--delay=4000] [--subject=B]
// NÃO disparar sem ordem do dono (spam-rate / fail2ban / reputação do domínio).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const require = createRequire(path.join(root, 'packages', 'server', 'package.json'));
const nodemailer = require('nodemailer');

const DRY = process.argv.includes('--dry');
const BCC = 'edmls2008@gmail.com';
const SUBJECTS = {
  A: 'Seu paciente te manda foto de exame no WhatsApp?',
  B: 'Exames dos seus pacientes, organizados ANTES da consulta',
};
const SUBJECT = SUBJECTS[(process.argv.find((a) => a.startsWith('--subject=')) || '--subject=A').slice(10)] ?? SUBJECTS.A;

// ---- template v3 ----
const HTML_TPL = readFileSync(path.join(root, 'marketing', 'outreach-medicos-v3.html'), 'utf8');
const TEXT_TPL = readFileSync(path.join(root, 'marketing', 'outreach-medicos-v3.txt'), 'utf8');

const env = {};
for (const line of readFileSync(path.join(root, 'packages', 'server', '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

// ---- lista ----
const csvArg = process.argv.find((a) => a.startsWith('--csv='));
const csvPath = csvArg ? csvArg.slice(6) : path.join(here, 'lista-semente.csv');
const csv = readFileSync(csvPath, 'utf8').replace(/^﻿/, '').trim();
const rows = csv.split(/\r?\n/).slice(1).filter(Boolean).map((l) => {
  const [nome, especialidade, cidade, email, url, tipo] = l.split(';');
  return { nome, especialidade, cidade, email: email.trim(), url, tipo };
});

// dedup: 1 e-mail por organização (unidades/endereços alternativos da mesma rede entram 1x)
const seenOrg = new Set();
const seenMail = new Set();
const targets = [];
for (const r of rows) {
  const org = r.nome.split(' (')[0].split(' — ')[0].toLowerCase().trim();
  const mail = r.email.toLowerCase();
  if (seenOrg.has(org) || seenMail.has(mail)) { console.log(`[skip dup] ${r.nome} <${r.email}>`); continue; }
  seenOrg.add(org); seenMail.add(mail);
  targets.push(r);
}

// Merge: 1:1 nome por destinatário (médico = nome com título; clínica = "equipe X").
// {{NOME}} entra SEM título — o CSV já traz "Dr./Dra." no nome.
const display = (r) => (r.tipo === 'medico' ? r.nome : `equipe ${r.nome}`);
const merge = (tpl, r) => tpl
  .replaceAll('{{NOME}}', display(r))
  .replaceAll('{{FONTE}}', r.url ? ` (${r.url})` : '')
  .replaceAll('{{UNSUBSCRIBE_URL}}', 'mailto:' + env.SMTP_USER + '?subject=Descadastrar%20Dr.%20Exame');

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: Number(env.SMTP_PORT || 587),
  secure: env.SMTP_SECURE === 'true',
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

const sleep = (ms) => new Promise((f) => setTimeout(f, ms));
const DELAY = Number((process.argv.find((a) => a.startsWith('--delay=')) || '--delay=4000').slice(8));

console.log(`Alvo: ${targets.length} destinatários (de ${rows.length} linhas, ${rows.length - targets.length} duplicados) | Assunto [${SUBJECT}] | DRY=${DRY}`);
let ok = 0; const fails = [];
for (const r of targets) {
  if (DRY) { console.log(`[dry] ${r.nome} <${r.email}> (${r.tipo})`); ok++; continue; }
  try {
    const info = await transporter.sendMail({
      from: 'Edmilson (Dr. Exame) <' + env.SMTP_USER + '>',
      to: r.email,
      bcc: BCC,
      subject: SUBJECT,
      text: merge(TEXT_TPL, r),
      html: merge(HTML_TPL, r),
    });
    ok++;
    console.log(`[ok ${ok}] ${r.nome} <${r.email}> — ${info.response}`);
  } catch (e) {
    fails.push(`${r.nome} <${r.email}> — ${e.message}`);
    console.log(`[FALHA] ${r.nome} <${r.email}> — ${e.message}`);
  }
  await sleep(DELAY);
}
console.log(`\nRESUMO: ${ok} enviados, ${fails.length} falhas`);
if (fails.length) console.log('FALHAS:\n' + fails.join('\n'));
