// Diagnóstico SMTP end-to-end: verify + envio REAL, capturando a resposta exata do Zoho.
// Lê SMTP_* de packages/server/.env (NÃO contém segredo hardcoded).
// Uso:
//   node scripts/test-smtp.mjs                 -> envia pra si mesmo (testa config)
//   node scripts/test-smtp.mjs irma@email.com  -> envia pra um destinatário (testa rejeição do provedor)
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const recipient = process.argv[2];
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(__dirname, '..', 'packages', 'server', '.env');
const env = {};
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const HOST = env.SMTP_HOST || 'smtp.zoho.com';
const PORT = Number(env.SMTP_PORT || 587);
const USER = env.SMTP_USER;
const PASS = env.SMTP_PASS;
if (!USER || !PASS) { console.error('❌ SMTP_USER/SMTP_PASS ausentes em packages/server/.env'); process.exit(1); }

const TO = recipient || USER;
const t = nodemailer.createTransport({ host: HOST, port: PORT, secure: false, auth: { user: USER, pass: PASS } });

process.stdout.write(`[1] verify() [${USER}] ... `);
try { await t.verify(); console.log('✅ AUTH OK'); }
catch (e) { console.log('❌ AUTH FALHOU:', e?.message); process.exit(1); }

process.stdout.write(`[2] sendMail() real -> ${TO} ... `);
try {
  const info = await t.sendMail({
    from: `Meus Exames <${USER}>`, to: TO,
    subject: 'TESTE Meus Exames — diagnóstico SMTP',
    text: 'Se você recebeu isto, o envio via Zoho funciona end-to-end. (teste diagnóstico)',
  });
  console.log('✅ ACEITO pelo Zoho — messageId:', info.messageId);
  console.log('   response:', info.response);
  console.log(recipient
    ? '\nZoho aceitou. Se NÃO chegar, a rejeição foi ASSÍNCRONA (provedor do destinatário). O motivo vem no e-mail de bounce.'
    : '\nCheque a caixa de ' + USER + ' (e o spam). Se chegou, config 100%.');
} catch (e) {
  console.log('❌ REJEITADO na hora pelo SMTP:');
  console.log('   msg:', e?.message);
  console.log('   code:', e?.code, '| responseCode:', e?.responseCode, '| response:', e?.response);
}
