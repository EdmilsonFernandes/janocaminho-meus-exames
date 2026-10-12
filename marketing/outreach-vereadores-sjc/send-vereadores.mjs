// Disparo Dr. Exame → vereadores de SJC (contatos públicos da Câmara, 19ª Legislatura).
// Mesma máquina do outreach-medicos: SMTP Zoho, BCC pro fundador, dedup, delay, ZERO links.
// Uso:
//   node marketing/outreach-vereadores-sjc/send-vereadores.mjs --dry            (simula tudo)
//   node marketing/outreach-vereadores-sjc/send-vereadores.mjs --dry --only=l1  (simula só Comissão de Saúde)
//   node marketing/outreach-vereadores-sjc/send-vereadores.mjs --only=l1        (ENVIA l1, confirmar com o dono antes!)
// CSV: nome;genero;papel;partido;email;prioridade (l1=Saúde, l2=Educação/Promoção Social, l3=resto)
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const require = createRequire(path.join(root, 'packages', 'server', 'package.json'));
const nodemailer = require('nodemailer');

const DRY = process.argv.includes('--dry');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
// --to=email → TESTE REAL: 1 envio pra você mesmo, com a personalização da 1ª linha da lista
const TEST_TO = (process.argv.find((a) => a.startsWith('--to=')) || '').slice(5);
const BCC = 'edmls2008@gmail.com';
const SUBJECT = 'Dr. Exame, app de saúde desenvolvido em São José';

const env = {};
for (const line of readFileSync(path.join(root, 'packages', 'server', '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

// ---- lista ----
const csvPath = (process.argv.find((a) => a.startsWith('--csv=')) || '').slice(6) || path.join(here, 'lista-vereadores.csv');
const csv = readFileSync(csvPath, 'utf8').replace(/^﻿/, '').trim();
let rows = csv.split(/\r?\n/).slice(1).filter(Boolean).map((l) => {
  const [nome, genero, papel, partido, email, prioridade] = l.split(';');
  return { nome: nome.trim(), genero, papel, partido, email: email.trim(), prioridade };
});
if (ONLY) rows = rows.filter((r) => r.prioridade === ONLY);

const seen = new Set();
const targets = rows.filter((r) => {
  const k = r.email.toLowerCase();
  if (seen.has(k)) { console.log(`[skip dup] ${r.nome}`); return false; }
  seen.add(k);
  return true;
});

// ---- personalização ---- (tom par a par: sem "senhor", sem pedir agenda, sem travessão)
const abertura = {
  l1: () => `Pelo seu trabalho na <strong>Comissão de Saúde</strong> da Câmara, você está entre as primeiras pessoas que procurei.`,
  l2: () => `Pela sua atuação na <strong>Educação e Promoção Social</strong>, área onde saúde e cidadania se encontram, você está entre as primeiras pessoas que procurei.`,
  l3: () => `Como você representa São José dos Campos, quis apresentar um projeto desenvolvido aqui na cidade.`,
};

const html = (r) => `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:0;background:#f2f7f6;">
<div style="display:none;max-height:0;overflow:hidden;">App de saúde criado em São José ajuda o cidadão a entender o resultado do exame. 15 minutos para conhecer.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f7f6;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;font-family:Helvetica,Arial,sans-serif;color:#2d3748;">
  <tr><td style="padding:28px 36px 8px 36px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="background:#20b2aa;color:#fff;border-radius:12px;padding:8px 14px;font-weight:bold;font-size:15px;">Dr. Exame</td>
      <td style="color:#178f89;font-size:13px;padding-left:10px;">tecnologia de saúde feita em São José</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:20px 36px 0 36px;font-size:15px;line-height:1.55;">
    <p style="margin:0 0 14px 0;">Olá, Ver. ${r.nome} 👋</p>
    <p style="margin:0 0 14px 0;">Sou <strong>Edmilson Fernandes</strong>, criador do <strong>Dr. Exame</strong>, e quero apresentar o projeto pra você.</p>
    <p style="margin:0 0 14px 0;">${abertura[r.prioridade] ? abertura[r.prioridade]() : abertura.l3()}</p>
    <p style="margin:0 0 14px 0;"><strong>O problema é conhecido:</strong> o cidadão recebe o resultado do exame do laboratório e não entende o que os valores significam, principalmente quem tem 40+ anos e os familiares que cuidam dos pais. O Dr. Exame resolve isso: a pessoa envia o PDF do exame pelo celular e recebe, na hora, uma leitura <strong>educativa</strong> dos valores, a comparação com exames anteriores e as perguntas certas para levar ao médico.</p>
    <p style="margin:0 0 14px 0;">Ele <strong>não dá diagnóstico</strong>. Prepara o paciente para a consulta, com dado de saúde tratado conforme a LGPD.</p>
  </td></tr>
  <tr><td style="padding:0 36px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2eceb;border-radius:14px;">
      <tr><td colspan="2" align="center" style="padding:12px 8px 0 8px;color:#178f89;font-size:12px;font-weight:bold;letter-spacing:0.4px;">📱 LADO DO CIDADÃO</td></tr>
      <tr>
        <td align="center" style="padding:10px 8px 6px 8px;"><img src="cid:print1" width="235" alt="App do Dr. Exame, visão do paciente" style="border-radius:10px;border:1px solid #dce8e7;display:block;"></td>
        <td align="center" style="padding:10px 8px 6px 8px;"><img src="cid:print2" width="235" alt="App do Dr. Exame, visão do paciente" style="border-radius:10px;border:1px solid #dce8e7;display:block;"></td>
      </tr>
      <tr><td colspan="2" style="border-top:1px solid #eef5f4;"></td></tr>
      <tr><td colspan="2" align="center" style="padding:12px 8px 0 8px;color:#178f89;font-size:12px;font-weight:bold;letter-spacing:0.4px;">🩺 ACOMPANHAMENTO (FAMÍLIA/MÉDICO)</td></tr>
      <tr>
        <td align="center" style="padding:10px 8px 14px 8px;"><img src="cid:print3" width="235" alt="Portal do Médico, Dr. Exame" style="border-radius:10px;border:1px solid #dce8e7;display:block;"></td>
        <td align="center" style="padding:10px 8px 14px 8px;"><img src="cid:print4" width="235" alt="Portal do Médico, Dr. Exame" style="border-radius:10px;border:1px solid #dce8e7;display:block;"></td>
      </tr>
    </table>
  </td></tr>
  <tr><td style="padding:22px 36px 0 36px;font-size:15px;line-height:1.55;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8faf4;border:1px solid #e3ecd8;border-radius:12px;margin-bottom:16px;"><tr><td style="padding:14px 18px;font-size:14.5px;line-height:1.6;color:#2d3748;">
      <strong>Já passou pelas mãos de quem usa:</strong> apresentei o app pessoalmente ao <strong>Dr. Daniel Shirane</strong>, cirurgião de cabeça e pescoço, e ao <strong>Dr. Enrico do Amaral Fonseca</strong>. O feedback dos dois virou melhoria concreta no produto.
    </td></tr></table>
    <p style="margin:0 0 10px 0;">Vejo potencial de <strong>parceria com a rede municipal de saúde</strong> (laboratórios e UBSs) e para programas de prevenção, tudo desenvolvido aqui, sem sair da cidade.</p>
    <p style="margin:0 0 14px 0;"><strong>Para conhecer (sem clicar em nada):</strong> no navegador, digite você mesmo <strong style="color:#178f89;">drexame.janocaminho.com.br</strong>, crie uma conta grátis e suba um exame em PDF para ver como fica. No Android, também está na Google Play como <strong>"Dr. Exame"</strong>. E tem o vídeo oficial explicando o app em 2 minutos: <strong style="color:#178f89;">youtube.com/watch?v=jyHezElJyjA</strong>.</p>
    <p style="margin:0 0 14px 0;">Se fizer sentido pra você, é só responder este e-mail que a gente conversa. Leio e respondo pessoalmente.</p>
  </td></tr>
  <tr><td style="padding:0 36px 18px 36px;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2eceb;" width="100%"><tr><td style="padding-top:14px;font-size:14px;line-height:1.5;">
      <strong style="color:#2d3748;">Edmilson Fernandes</strong><br>
      <span style="color:#7a8b8a;">Fundador, Dr. Exame, drexame.janocaminho.com.br<br>
      LinkedIn: linkedin.com/in/edmilson-santos-6805a515</span>
    </td></tr></table>
  </td></tr>
  <tr><td style="background:#f7fbfa;padding:14px 36px;color:#9aa9a8;font-size:11.5px;line-height:1.5;">
    Contato obtido na página oficial da Câmara Municipal de São José dos Campos (camarasjc.sp.gov.br/vereadores). Contato profissional único — sem cadeia de e-mails.<br>
    Não quer receber? Responda <strong>REMOVER</strong> e saímos da lista imediatamente. O Dr. Exame não faz diagnóstico; não substitui consulta médica.
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

const text = (r) => `Olá, Ver. ${r.nome}

Sou Edmilson Fernandes, criador do Dr. Exame, e quero apresentar o projeto pra você.

${(abertura[r.prioridade] ? abertura[r.prioridade]() : abertura.l3()).replace(/<[^>]+>/g, '')}

O problema é conhecido: o cidadão recebe o resultado do exame do laboratório e não entende o que os valores significam, principalmente quem tem 40+ anos e os familiares que cuidam dos pais. O Dr. Exame resolve: a pessoa envia o PDF do exame pelo celular e recebe, na hora, uma leitura EDUCATIVA dos valores, a comparação com exames anteriores e as perguntas certas para levar ao médico. Não dá diagnóstico. Prepara o paciente para a consulta, com dado de saúde tratado conforme a LGPD.

Para conhecer (sem clicar em nada): no navegador, digite drexame.janocaminho.com.br, crie uma conta grátis e suba um exame em PDF. No Android, também na Google Play como "Dr. Exame". Vídeo oficial de 2 minutos: youtube.com/watch?v=jyHezElJyjA.

Já passou pelas mãos de quem usa: apresentei o app pessoalmente ao Dr. Daniel Shirane, cirurgião de cabeça e pescoço, e ao Dr. Enrico do Amaral Fonseca. O feedback dos dois virou melhoria concreta no produto.

Vejo potencial de parceria com a rede municipal de saúde (laboratórios e UBSs) e para programas de prevenção, tudo desenvolvido aqui na cidade.

Se fizer sentido pra você, é só responder este e-mail que a gente conversa. Leio e respondo pessoalmente.

Edmilson Fernandes
Fundador, Dr. Exame, drexame.janocaminho.com.br

---
Contato obtido na página oficial da Câmara Municipal de SJC. Contato único. Não quer receber? Responda REMOVER.`;

// prints reutilizados da campanha de médicos (mesmas telas do app)
const shots = path.resolve(here, '..', 'outreach-medicos', 'screenshots');
const attachments = [
  { filename: 'paciente1.png', path: path.join(shots, 'paciente1.png'), cid: 'print1', contentDisposition: 'inline' },
  { filename: 'paciente2.png', path: path.join(shots, 'paciente2.png'), cid: 'print2', contentDisposition: 'inline' },
  { filename: 'medico1.png', path: path.join(shots, 'medico1.png'), cid: 'print3', contentDisposition: 'inline' },
  { filename: 'medico2.png', path: path.join(shots, 'medico2.png'), cid: 'print4', contentDisposition: 'inline' },
  // FOTOS COM OS MÉDICOS (fotos-medicos/): SÓ depois de autorização por escrito
  // (WhatsApp vale) — direito de imagem em contexto promocional exige ok do retratado.
  // Autorizou? Descomente e adicione as imgs cid:fotodr1/fotodr2 no bloco de credibilidade:
  // { filename: 'drenrico.jpeg', path: path.join(here, 'fotos-medicos', 'drenrico.jpeg'), cid: 'fotodr1', contentDisposition: 'inline' },
  // { filename: 'daniel1.jpg', path: path.join(here, 'fotos-medicos', 'daniel1.jpg'), cid: 'fotodr2', contentDisposition: 'inline' },
];

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: Number(env.SMTP_PORT || 587),
  secure: env.SMTP_SECURE === 'true',
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

const sleep = (ms) => new Promise((f) => setTimeout(f, ms));
const DELAY = Number((process.argv.find((a) => a.startsWith('--delay=')) || '--delay=5000').slice(8));

console.log(`Alvo: ${targets.length} vereadores${ONLY ? ` (prioridade ${ONLY})` : ''} | DRY=${DRY}${DRY ? ' (nenhum e-mail sai)' : ' — ENVIO REAL'}${TEST_TO ? ` | TESTE p/ ${TEST_TO}` : ''}`);

// Modo teste: 1 e-mail real pra você ver como chega (usa a personalização do 1º da lista)
if (TEST_TO) {
  const sample = targets[0];
  if (!sample) { console.error('Lista vazia — nada para amostrar.'); process.exit(1); }
  const info = await transporter.sendMail({
    from: 'Edmilson (Dr. Exame) <' + env.SMTP_USER + '>',
    to: TEST_TO,
    bcc: BCC,
    subject: '[TESTE, como chega pro vereador] ' + SUBJECT,
    text: `[Amostra com a personalização de: ${sample.nome} — ${sample.papel} (${sample.prioridade})]\n\n` + text(sample),
    html: html(sample).replace('<div style="display:none;max-height:0;overflow:hidden;">', `<div style="display:none;max-height:0;overflow:hidden;">[TESTE: personalização de ${sample.nome} — ${sample.papel}] `),
    attachments,
  });
  console.log(`[TESTE ENVIADO] ${TEST_TO} — ${info.response}`);
  process.exit(0);
}
let ok = 0; const fails = [];
for (const r of targets) {
  if (DRY) { console.log(`[dry] ${r.nome} (${r.prioridade}) <${r.email}>`); ok++; continue; }
  try {
    const info = await transporter.sendMail({
      from: 'Edmilson (Dr. Exame) <' + env.SMTP_USER + '>',
      to: r.email,
      bcc: BCC,
      subject: SUBJECT,
      text: text(r),
      html: html(r),
      attachments,
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
