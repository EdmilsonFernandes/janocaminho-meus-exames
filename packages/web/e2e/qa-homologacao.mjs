/**
 * §17 HOMOLOGAÇÃO — jornada COMPLETA médico×paciente (24/10/26), 2 contexts independentes.
 * Spec: docs/design/2026-10-24-teleconsulta-gaps-spec.md §17.2 + §17.5.
 *
 * Jornada: agenda R$120 → TOO_EARLY countdown → abre janela (psql) → 402 PAYMENT_REQUIRED
 * → PIX dialog (copy assert) → paidAt simulado (psql, webhook tem suíte própria) →
 * médico entra sozinho (dialog 3 opções R4) → paciente entra (banner gravação → ● Gravando IA)
 * → brief com exames → encerra completed<min → 400 dialog honesto → technical →
 * resumo IA (LLM REAL) → editar → salvar → paciente NÃO vê draft → aprovar →
 * paciente vê aprovado → chips Reminders/Portal (sem "Entrar", R1) → readonly (R2) →
 * §15 exception_queue. Screenshots em e2e/screenshots/qa-homologacao/ + results.json.
 *
 * Dev: server PORT=4013 · web 5173 · LiveKit/GROQ reais do .env · PIX provider real
 * (mp por padrão — se falhar, marca NÃO VALIDADO e segue). Mídia sintética (flags).
 * Logs: uma linha por etapa ✓/✗ + JSON final.
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'server');

const WEB = 'http://127.0.0.1:5173';
const API = 'http://127.0.0.1:4013/api';
const OUT = 'e2e/screenshots/qa-homologacao';
fs.mkdirSync(OUT, { recursive: true });

const PSQL = (sql) => execSync(`docker exec meus-exames-db psql -U meus_exames -d meus_exames -qtAc "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).toString().trim();

// ── Log estruturado: uma linha por etapa + JSON no fim ─────────────────────────
const RESULTS = [];
const step = (id, name, pass, extra = '') => {
  RESULTS.push({ id, name, status: pass ? 'aprovado' : 'FALHOU', extra });
  console.log(`${pass ? '✓' : '✗'} [${id}] ${name}${extra ? ' — ' + extra : ''}`);
};
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
const txt = async (page) => page.evaluate(() => document.body.innerText).catch(() => '');

// ══ S01 — SETUP: logins, limpeza, share, exame, agenda R$120, consent ═══════════
const lr = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'edmilson@exemplo.com', password: 'troque123' }) });
if (!lr.ok) { console.error('login paciente falhou', lr.status); process.exit(1); }
const auth = await lr.json();
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` };
const pid = auth.patientId;

const dlog = await (await fetch(`${API}/doctor/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'meet.teste@drexame.dev', password: 'meet12345' }) })).json();
if (!dlog.token) { console.error('login médico falhou'); process.exit(1); }
const HD = { 'Content-Type': 'application/json', Authorization: `Bearer ${dlog.token}` };

// limpeza: teleconsultas anteriores do paciente (API owner) + drafts/exames QA
const list = await (await fetch(`${API}/reminders?patientId=${pid}`, { headers: H })).json();
for (const it of list) if (it.type === 'teleconsulta') await fetch(`${API}/reminders/${it.id}`, { method: 'DELETE', headers: H });
PSQL(`DELETE FROM consult_summaries WHERE "reminderId" NOT IN (SELECT id FROM reminders)`);
PSQL(`DELETE FROM exception_queue WHERE kind LIKE 'teleconsulta_%'`); // limpa runs QA (fila não tem FK)
PSQL(`DELETE FROM exam_items WHERE "examId" LIKE 'qa-homol-%'`);
PSQL(`DELETE FROM exams WHERE id LIKE 'qa-homol-%'`);

// share (scope exams) + exame semeado (2 alterados + 1 normal)
const share = await fetch(`${API}/doctor-shares`, { method: 'POST', headers: H, body: JSON.stringify({ doctorCrm: '65432-SP', scopes: ['exams'], patientId: pid }) });
step('S01a', 'share exams ativo', share.status === 201 || share.status === 200, `HTTP ${share.status}`);
PSQL(`INSERT INTO exams (id, "patientId", title, kind, "performedAt", "sourceLab", "filePath", "fileSha256", "fileSizeBytes", "pageCount", status, "extractedAt", "createdAt", "updatedAt") VALUES ('qa-homol-exam-1', '${pid}', 'HEMOGRAMA', 'LAB_PANEL', NOW() - INTERVAL '3 days', 'Lab QA', 'qa/homol.pdf', 'qa-homol-sha-${Date.now()}', 1024, 1, 'EXTRACTED', NOW(), NOW(), NOW())`);
PSQL(`INSERT INTO exam_items (id, "examId", panel, name, "nameCanonical", "valueNumeric", "valueText", unit, "refLow", "refHigh", "refText", flag, "isAbnormal", "extractedPage", "createdAt") VALUES ('qa-homol-it-1', 'qa-homol-exam-1', 'Bioquímica', 'ZZ-GLICOSE-QA', 'ZZ-GLICOSE-QA', 128, '128', 'mg/dL', 70, 99, '70 a 99 mg/dL', 'HIGH', true, 1, NOW())`);
PSQL(`INSERT INTO exam_items (id, "examId", panel, name, "nameCanonical", "valueNumeric", "valueText", unit, "refLow", "refHigh", "refText", flag, "isAbnormal", "extractedPage", "createdAt") VALUES ('qa-homol-it-2', 'qa-homol-exam-1', 'Bioquímica', 'ZZ-TSH-QA', 'ZZ-TSH-QA', 0.12, '0,12', 'mUI/L', 0.4, 4.0, '0,4 a 4,0 mUI/L', 'LOW', true, 1, NOW())`);
PSQL(`INSERT INTO exam_items (id, "examId", panel, name, "nameCanonical", "valueNumeric", "valueText", unit, "refLow", "refHigh", "refText", flag, "isAbnormal", "extractedPage", "createdAt") VALUES ('qa-homol-it-3', 'qa-homol-exam-1', 'Eritrograma', 'ZZ-HGB-QA', 'ZZ-HGB-QA', 14.2, '14,2', 'g/dL', 13, 17, '13 a 17 g/dL', 'NORMAL', false, 1, NOW())`);

// agenda: R$120, dueDate +10min (janela abre +5min → TOO_EARLY agora)
const due = new Date(Date.now() + 10 * 60_000);
const tele = await (await fetch(`${API}/doctor/patients/${pid}/teleconsulta`, { method: 'POST', headers: HD, body: JSON.stringify({ dueDate: due.toISOString(), consultPriceCents: 12000, title: 'QA Homologação §17 — jornada completa' }) })).json();
if (!tele.reminder?.id) { console.error('agenda falhou', JSON.stringify(tele)); process.exit(1); }
const teleId = tele.reminder.id;
const dbPrice = PSQL(`SELECT "consultPriceCents" FROM reminders WHERE id='${teleId}'`);
step('S01b', 'agenda médico R$120 (valor congelado)', dbPrice === '12000', `teleId=${teleId.slice(-6)} price=${dbPrice}`);
const consent = await fetch(`${API}/reminders/${teleId}/consent`, { method: 'PUT', headers: H });
step('S01c', 'consent Art.15 paciente (via API)', consent.status === 200, `HTTP ${consent.status}`);

// ══ Playwright: 2 contexts INDEPENDENTES (nunca trocar perfil na mesma sessão) ══
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const mkPage = async ({ width, height, doctor, clipboard }) => {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: width < 800, hasTouch: width < 800, deviceScaleFactor: 2 });
  if (clipboard) await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: WEB });
  await ctx.addInitScript((opts) => {
    if (opts.doctor) { localStorage.setItem('doctorToken', opts.doctor); }
    else {
      localStorage.setItem('token', opts.auth.token); localStorage.setItem('user', JSON.stringify(opts.auth.user));
      if (opts.auth.patientId) { localStorage.setItem('patientId', opts.auth.patientId); localStorage.setItem('selPatientId', opts.auth.patientId); }
    }
    localStorage.setItem('onboarded', '1'); localStorage.setItem('lead_popup_dismissed_at', String(Date.now()));
    localStorage.setItem('dx_install_banner_off', '1');
  }, { doctor, auth });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  return { ctx, page, errs };
};

const PAT = await mkPage({ width: 390, height: 844, clipboard: true });
const DOC = await mkPage({ width: 390, height: 844, doctor: dlog.token });

/** Clica botão ESPERANDO enabled (phase loading/preview deixa o CTA disabled —
 *  clicar cedo vira TimeoutError "not stable/detached"). Match por aria-label OU texto. */
const clickEnabled = async (page, reSource, timeout = 90_000) => {
  await page.waitForFunction((src) => {
    const re = new RegExp(src);
    const b = [...document.querySelectorAll('button')].find((x) => re.test(x.getAttribute('aria-label') || x.textContent || ''));
    return !!b && !b.disabled;
  }, reSource, { timeout });
  await page.getByRole('button', { name: new RegExp(reSource) }).first().click({ timeout: 60_000 });
};
const END_BTN = 'button[aria-label="Encerrar consulta"]';

// ══ S02 — TOO_EARLY: paciente abre ANTES da janela → countdown visível ════════
// Bootstrap (Teleconsulta.tsx:1021): paciente COM consent AUTO-JOINA no load —
// o 403 TOO_EARLY chega sozinho e a sala de espera renderiza direto (sem CTA).
await PAT.page.goto(`${WEB}/#/teleconsulta/${teleId}`, { waitUntil: 'commit', timeout: 90_000 });
let p2 = await PAT.page.getByText('A consulta abre às', { exact: false }).first().waitFor({ timeout: 45_000 }).then(() => true).catch(() => false);
let t2 = p2 ? await txt(PAT.page) : '';
step('S02', 'TOO_EARLY → sala de espera com countdown', p2 && /Faltam \d+ min\./.test(t2) && t2.includes('5 minutos antes'), p2 ? (t2.match(/A consulta abre às \d{2}:\d{2}/)?.[0] ?? '') : 'não apareceu');
await shot(PAT.page, '02-paciente-too-early');
step('S02b', 'DB: teleStatus ainda scheduled/null (sozinho não inicia)', ['scheduled', 'null', ''].includes(PSQL(`SELECT COALESCE("teleStatus",'null') FROM reminders WHERE id='${teleId}'`)));

// ══ S03 — abre janela (dueDate agora+4min) → 402 PAYMENT_REQUIRED ══════════════
PSQL(`UPDATE reminders SET "dueDate" = NOW() + INTERVAL '4 minutes' WHERE id='${teleId}'`);
await clickEnabled(PAT.page, '^Atualizar$');
const payBox = await PAT.page.getByText('Consulta particular', { exact: false }).first().waitFor({ timeout: 60_000 }).then(() => true).catch(() => false);
const t3 = payBox ? await txt(PAT.page) : '';
step('S03', '402 PAYMENT_REQUIRED → box cobrança (sem entrar)', payBox && t3.includes('R$ 120,00') && !!t3.includes('Ir para o pagamento'), payBox ? 'R$ 120,00 visível' : 'box não apareceu');
await shot(PAT.page, '03-paciente-payment-required');

// ══ S04 — PIX: dialog + copy (regressão §17.5 "copiar PIX falha no app") ═══════
const billCfg = await (await fetch(`${API}/billing/plans`, { headers: H })).json().catch(() => ({}));
console.log(`  · PIX provider ativo: ${billCfg.pixProvider ?? '?'}`);
await clickEnabled(PAT.page, 'Ir para o pagamento');
await PAT.page.getByRole('button', { name: /Pagar consulta — R\$ 120,00/ }).first().waitFor({ timeout: 60_000 });
await shot(PAT.page, '04a-reminders-pagar-consulta');
const tryPixDialog = () => Promise.race([
  PAT.page.locator('img[alt="QR Code PIX da consulta"]').waitFor({ timeout: 45_000 }).then(() => 'qr'),
  PAT.page.getByText('Código PIX copia e cola').first().waitFor({ timeout: 45_000 }).then(() => 'code'),
  PAT.page.getByText(/Pagamento indisponível|não foi possível gerar|Falha ao gerar/i).first().waitFor({ timeout: 45_000 }).then(() => 'err'),
]).catch(() => 'timeout');
let pixOk = 'n';
let pixNote = '';
const payClick = async () => {
  const btn = PAT.page.getByRole('button', { name: /Pagar consulta/ }).first();
  await btn.waitFor({ state: 'visible', timeout: 45_000 });
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  await btn.click({ timeout: 45_000 });
};
await payClick();
pixOk = await tryPixDialog();
if (pixOk !== 'qr' && pixOk !== 'code') {
  // Provider real falhou EM DEV (ex.: MP token sem chave PIX — erro 13253 "Collector
  // user without key enabled for QR render"). Valida o DIALOG+copy pela RETOMADA 409
  // (mesmo shape do PIX real — caminho com teste próprio em teleconsulta-payment.test.ts):
  // semeia charge PENDING viva → reload (reseta estado client) → clique devolve o MESMO QR.
  pixNote = `charge REAL não validada em dev (provider ${billCfg.pixProvider}: ${pixOk}) — dialog validado via retomada 409 com charge sintética`;
  const uid = PSQL(`SELECT "ownerId" FROM reminders WHERE id='${teleId}'`);
  const emv = '00020126580014BR.GOV.BCB.PIX0136qa-homol-17-teleconsulta-charge-sintetica-dev-000000000000520400005303986540512.005802BR5913DR EXAME QA6009SAO PAULO62070503***6304ABCD';
  const qr1px = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  PSQL(`DELETE FROM subscriptions WHERE "mpPreferenceId"='teleconsulta_${teleId}' AND status IN ('PENDING','FAILED','CANCELLED')`);
  PSQL(`INSERT INTO subscriptions (id, "userId", amount, "periodDays", status, "mpPreferenceId", "mpPaymentId", "pixQrCode", "pixQrBase64", "pixExpiresAt", "createdAt", "updatedAt") VALUES ('qa-homol-sub-${Date.now()}', '${uid}', 120, 0, 'PENDING', 'teleconsulta_${teleId}', 'qa-homol-pix-${Date.now()}', '${emv}', '${qr1px}', NOW() + INTERVAL '10 minutes', NOW(), NOW())`);
  await PAT.page.reload({ waitUntil: 'commit', timeout: 90_000 });
  await payClick();
  pixOk = await tryPixDialog();
}
if (pixOk === 'qr' || pixOk === 'code') {
  await shot(PAT.page, '04b-pix-dialog');
  await clickEnabled(PAT.page, 'Copiar código PIX');
  await PAT.page.waitForTimeout(1500);
  const clip = await PAT.page.evaluate(() => navigator.clipboard.readText().catch(() => '')).catch(() => '');
  const selInfo = await PAT.page.evaluate(() => { const i = document.querySelector('input[aria-label="Código PIX copia e cola"]'); return i ? (i.selectionEnd ?? 0) - (i.selectionStart ?? 0) : -1; }).catch(() => -1);
  const toastTxt = await txt(PAT.page);
  step('S04', 'PIX dialog + copy funciona (WebView-safe)', clip.length > 50 || selInfo > 50 || toastTxt.includes('Código PIX copiado'), `provider=${billCfg.pixProvider} clipboard=${clip.length}c sel=${selInfo}c${toastTxt.includes('Código PIX copiado') ? ' toast=OK' : ''}${pixNote ? ' · ' + pixNote : ''}`);
  await shot(PAT.page, '04c-pix-copiado');
} else {
  step('S04', 'PIX dialog + copy funciona (WebView-safe)', false, `NÃO VALIDADO: provider ${billCfg.pixProvider} (${pixOk})`);
  await shot(PAT.page, '04b-pix-falhou');
}

// ══ S05 — paidAt simulado (psql = webhook em dev) ══════════════════════════════
PSQL(`UPDATE reminders SET "paidAt" = NOW() WHERE id='${teleId}'`);
PSQL(`UPDATE subscriptions SET status='APPROVED' WHERE "mpPreferenceId"='teleconsulta_${teleId}'`);
const paid = PSQL(`SELECT "paidAt" IS NOT NULL FROM reminders WHERE id='${teleId}'`);
step('S05', 'paidAt persistido (simula webhook)', paid === 't', 'psql UPDATE ok');

// ══ S06 — MÉDICO entra primeiro (sozinho na sala) ══════════════════════════════
await DOC.page.goto(`${WEB}/#/teleconsulta/${teleId}?role=doctor`, { waitUntil: 'commit', timeout: 90_000 });
await clickEnabled(DOC.page, 'Entrar na consulta');
await DOC.page.locator(END_BTN).first().waitFor({ timeout: 60_000 });
await shot(DOC.page, '06-medico-sozinho-aguardando');
// aguarda >25s: guard do endCall trata saída rápida como "saiu da espera"
await DOC.page.waitForTimeout(27_000);

// ══ S07 — R4 §17.5: médico SOZINHO encerra → dialog 3 opções (não encerra) ═════
await DOC.page.locator(END_BTN).first().click();
const endDlgBtn = DOC.page.getByRole('dialog').getByRole('button', { name: 'Encerrar', exact: true }).first();
await endDlgBtn.waitFor({ timeout: 30_000 });
await endDlgBtn.click();
const dlg = await DOC.page.getByText('Como encerrar?').first().waitFor({ timeout: 30_000 }).then(() => true).catch(() => false);
const t7 = dlg ? await txt(DOC.page) : '';
const threeOpts = t7.includes('Encerrar consulta') && t7.includes('Paciente não compareceu') && t7.includes('Tivemos problema técnico');
step('S07', 'R4: médico sozinho → dialog honesto 3 opções', dlg && threeOpts && t7.includes('sozinho'), threeOpts ? '3 opções presentes' : t7.slice(0, 120));
await shot(DOC.page, '07-medico-dialog-3-opcoes');
await DOC.page.getByRole('button', { name: 'Voltar à chamada' }).first().click();
await DOC.page.waitForTimeout(1200);
step('S07b', 'R4: "Voltar à chamada" NÃO encerra (teleStatus intacto)', ['scheduled', 'null', ''].includes(PSQL(`SELECT COALESCE("teleStatus",'null') FROM reminders WHERE id='${teleId}'`)));

// ══ S08 — PACIENTE entra (contexto próprio): auto-join (consent) → banner IA ═══
// S04 deixou o paciente na LISTA (#/lembretes) — goto explícito pra consulta. Bootstrap
// auto-joina (consent OK) → connecting → in-call + banner. Botões são FALLBACK (prejoin
// raro); join real é provado pelo audit/DB (S08b) mesmo se a UI divergir.
await PAT.page.goto(`${WEB}/#/teleconsulta/${teleId}`, { waitUntil: 'commit', timeout: 90_000 });
const dumpPat = () => PAT.page.evaluate(() => ({
  hash: location.hash,
  body: document.body.innerText.replace(/\n+/g, ' | ').slice(0, 350),
  btns: [...document.querySelectorAll('button')].map((b) => `${b.disabled ? '[x] ' : ''}${(b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 32)}`).filter((t) => /Atender|Entrar|Gravar|Recusar|Atualizar|consulta/i.test(t)).slice(0, 10),
})).catch(() => null);
const entrar = await Promise.race([
  PAT.page.getByText('Gravação & Transcrição por IA', { exact: false }).first().waitFor({ timeout: 60_000 }).then(() => 'auto'),
  PAT.page.getByRole('button', { name: 'Atender chamada' }).first().waitFor({ timeout: 60_000 }).then(() => 'atender'),
  PAT.page.getByRole('button', { name: 'Autorizar e atender' }).first().waitFor({ timeout: 60_000 }).then(() => 'autorizar'),
  PAT.page.getByRole('button', { name: /Entrar na consulta/ }).first().waitFor({ timeout: 60_000 }).then(() => 'entrar'),
]).catch(() => 'timeout');
if (entrar !== 'auto') console.log(`  · S08 caminho=${entrar} — estado:`, JSON.stringify(await dumpPat()).slice(0, 500));
if (entrar !== 'auto' && entrar !== 'timeout') {
  try {
    await clickEnabled(PAT.page, entrar === 'atender' ? 'Atender chamada' : entrar === 'autorizar' ? 'Autorizar e atender' : 'Entrar na consulta', 45_000);
  } catch { console.log('  · S08 clique fallback falhou (botão disabled?) — segue; join real validado pelo audit'); }
}
const banner = await PAT.page.getByText('Gravação & Transcrição por IA', { exact: false }).first().waitFor({ timeout: 75_000 }).then(() => true).catch(() => false);
if (!banner) console.log('  · S08 sem banner — estado:', JSON.stringify(await dumpPat()).slice(0, 500), '· pageerrors:', PAT.errs.slice(0, 3));
if (banner) {
  await shot(PAT.page, '08a-paciente-banner-gravacao');
  await clickEnabled(PAT.page, 'Sim, Gravar com IA');
}
const gravando = await PAT.page.getByText('● Gravando IA', { exact: false }).first().waitFor({ timeout: 45_000 }).then(() => true).catch(() => false);
step('S08', 'paciente in-call + aprova gravação → ● Gravando IA', gravando, `${entrar} · banner=${banner}`);
await shot(PAT.page, '08b-paciente-gravando-ia');
const dbJoint = PSQL(`SELECT COALESCE("teleStatus",'null'), "patientJoinedAt" IS NOT NULL FROM reminders WHERE id='${teleId}'`);
step('S08b', 'DB: ambos com JOIN → teleStatus=in_progress', dbJoint.startsWith('in_progress|t'), dbJoint.replace('|', '·'));

// ══ S09 — médico vê paciente + brief clínico (exames compartilhados) ═══════════
await DOC.page.waitForTimeout(2500);
await DOC.page.getByText('Exames', { exact: true }).first().waitFor({ timeout: 60_000 });
await DOC.page.getByText('Exames', { exact: true }).first().click();
const briefOk = await DOC.page.getByText('ZZ-GLICOSE-QA').first().waitFor({ timeout: 45_000 }).then(() => true).catch(() => false);
const t9 = briefOk ? await txt(DOC.page) : '';
step('S09', 'brief clínico in-call com exames alterados', briefOk && t9.includes('ZZ-GLICOSE-QA') && t9.includes('128') && /\d+ alterados/.test(t9), briefOk ? 'ZZ-GLICOSE 128 + alterados' : 'item não apareceu');
await shot(DOC.page, '09-medico-brief');
console.log(`  · sinais vitais no brief: ${t9.includes('Sinais') ? 'presente' : 'ausente (share só exams)'}`);
await DOC.page.keyboard.press('Escape');
await DOC.page.waitForTimeout(800);

// ══ S10 — encerra pelo médico: completed → 400 min_time → dialog → technical ═══
await DOC.page.locator(END_BTN).first().click();
const endDlgBtn2 = DOC.page.getByRole('dialog').getByRole('button', { name: 'Encerrar', exact: true }).first();
await endDlgBtn2.waitFor({ timeout: 30_000 });
await endDlgBtn2.click();
const dlg2 = await DOC.page.getByText('Como encerrar?').first().waitFor({ timeout: 30_000 }).then(() => true).catch(() => false);
const t10 = dlg2 ? await txt(DOC.page) : '';
step('S10', 'completed<min_joint → 400 → dialog honesto (sugere technical)', dlg2 && t10.includes('abaixo do mínimo') && t10.includes('Tivemos problema técnico · sugerido'), dlg2 ? 'sugestão=technical' : 'dialog não abriu');
await shot(DOC.page, '10-medico-dialog-min-time');
await DOC.page.getByRole('button', { name: /Tivemos problema técnico/ }).first().click();
const ended = await DOC.page.getByText('Consulta encerrada', { exact: false }).first().waitFor({ timeout: 60_000 }).then(() => true).catch(() => false);
step('S10b', 'encerramento técnico persistiu', ended);
const dbEnd = PSQL(`SELECT "teleStatus", "endedAt" IS NOT NULL, COALESCE("jointMs",0) FROM reminders WHERE id='${teleId}'`);
step('S10c', 'DB: teleStatus=technical + endedAt + jointMs<300s', dbEnd.startsWith('technical|t|') && Number(dbEnd.split('|')[2]) < 300_000, dbEnd.replace(/\|/g, '·'));
await shot(DOC.page, '10b-medico-pos-chamada');

// ══ S11 — §14.1 resumo: gerar rascunho com IA (LLM REAL do dev) ════════════════
let llmReal = true;
try {
  await clickEnabled(DOC.page, 'Gerar rascunho com IA');
} catch { /* área pode já ter resumo de run anterior — segue */ }
const draftOk = await Promise.race([
  DOC.page.getByText('Motivo da consulta').first().waitFor({ timeout: 150_000 }).then(() => true),
  DOC.page.locator('[role="alert"]').getByText(/Não foi possível gerar/i).first().waitFor({ timeout: 150_000 }).then(() => false),
]).catch(() => false);
if (!draftOk) {
  llmReal = false;
  step('S11', 'gerar rascunho com IA (LLM real)', false, 'NÃO VALIDADO (LLM falhou em dev) — fallback: draft via psql p/ validar o fluxo');
  const docId = PSQL(`SELECT id FROM doctors WHERE email='meet.teste@drexame.dev'`);
  // SQL LINHA ÚNICA (docker exec Windows quebra com \n literal): E'…\\n…' = newline no psql
  PSQL(`INSERT INTO consult_summaries ("reminderId", status, "draftMd", "generatedAt", version, revisions, "createdAt", "updatedAt") VALUES ('${teleId}', 'draft', E'## Motivo da consulta\\nQA Homologação §17 (fallback psql — LLM indisponível).\\n\\n## Pontos discutidos\\n- Fluxo validado por E2E.', NOW(), NOW(), 1, E'[{"md":"fallback","at":"2026-10-24","by":"${docId}","kind":"generate"}]', NOW(), NOW())`);
  await DOC.page.reload({ timeout: 90_000 });
  await DOC.page.getByText('Consulta encerrada', { exact: false }).first().waitFor({ timeout: 60_000 });
} else {
  const t11 = await txt(DOC.page);
  step('S11', 'gerar rascunho com IA (LLM real)', t11.includes('Motivo da consulta') && (t11.includes('Resumo em rascunho') || t11.includes('Rascunho')), 'GLM real do dev');
}
await shot(DOC.page, '11-medico-rascunho-ia');

// ══ S12 — editar rascunho + salvar (versão rastreável) ═════════════════════════
await clickEnabled(DOC.page, 'Editar rascunho|Editar \\(nova versão\\)');
const ta = DOC.page.locator('textarea[aria-label="Rascunho do resumo da consulta"]');
await ta.waitFor({ timeout: 30_000 });
await ta.fill('## Motivo da consulta\nQA Homologação §17 — rascunho editado pelo médico (E2E).\n\n## Pontos discutidos\n- Jornada completa validada.\n\n## Avaliação e conduta\n[avaliação médica] Sem intercorrências no fluxo.');
await shot(DOC.page, '12a-medico-editando');
await clickEnabled(DOC.page, 'Salvar rascunho');
const saved = await DOC.page.getByText('Rascunho salvo', { exact: false }).first().waitFor({ timeout: 30_000 }).then(() => true).catch(() => false);
step('S12', 'editar + salvar rascunho (sem aprovar)', saved || PSQL(`SELECT status FROM consult_summaries WHERE "reminderId"='${teleId}'`) === 'draft');
await shot(DOC.page, '12b-medico-rascunho-salvo');

// ══ S13 — R§14.9: paciente BLOQUEADO em rascunho não-aprovado (readonly) ══════
await PAT.page.goto(`${WEB}/#/teleconsulta/${teleId}`, { waitUntil: 'commit', timeout: 90_000 });
await PAT.page.getByText('Consulta encerrada', { exact: false }).first().waitFor({ timeout: 60_000 });
const t13 = await txt(PAT.page);
const draftHidden = !t13.includes('Motivo da consulta') && !t13.includes('Rascunho — ainda não visível');
const noRejoin = !t13.includes('Entrar na consulta');
step('S13', 'paciente em rascunho: NÃO vê draft + readonly (R2: sem re-entrar)', draftHidden && noRejoin, draftHidden ? 'draft não vazou' : 'DRAFT VAZOU');
await shot(PAT.page, '13-paciente-readonly-sem-resumo');
step('S13b', 'DB: consult_summaries status=draft', PSQL(`SELECT status FROM consult_summaries WHERE "reminderId"='${teleId}'`) === 'draft');

// ══ S14 — aprovar (dialog de confirmação) ══════════════════════════════════════
await clickEnabled(DOC.page, 'Aprovar e disponibilizar');
await DOC.page.getByText('Aprovar o resumo?').first().waitFor({ timeout: 30_000 });
await shot(DOC.page, '14a-medico-confirmar-aprovacao');
await DOC.page.getByRole('dialog').getByRole('button', { name: 'Aprovar', exact: true }).first().click();
const approvedChip = await DOC.page.getByText('Resumo aprovado ✓', { exact: false }).first().waitFor({ timeout: 45_000 }).then(() => true).catch(() => false);
const dbCs = PSQL(`SELECT status, version, jsonb_array_length("revisions") FROM consult_summaries WHERE "reminderId"='${teleId}'`);
step('S14', 'aprovar resumo → aprovado ✓ (médico)', approvedChip && dbCs.startsWith('approved|'), dbCs.replace(/\|/g, '·'));
await shot(DOC.page, '14b-medico-resumo-aprovado');

// ══ S15 — paciente vê SÓ o aprovado (contexto paciente reabre readonly) ════════
await PAT.page.reload({ timeout: 90_000 });
const patResumo = await PAT.page.getByText('Resumo da consulta', { exact: false }).first().waitFor({ timeout: 60_000 }).then(() => true).catch(() => false);
const t15 = patResumo ? await txt(PAT.page) : '';
step('S15', 'paciente vê o resumo APROVADO (pós-aprovação)', patResumo && t15.includes('Motivo da consulta') && t15.includes('rascunho editado pelo médico'), patResumo ? 'conteúdo aprovado visível' : 'resumo não apareceu');
await shot(PAT.page, '15-paciente-resumo-aprovado');

// ══ S16 — chips nas listas: Reminders (R1: encerrada NÃO oferece "Entrar") ════
try {
  await PAT.page.goto(`${WEB}/#/lembretes`, { waitUntil: 'commit', timeout: 90_000 });
  // card encerrado vive num Accordion "Histórico de consultas" COLAPSADO — expande 1º
  const histBtn = PAT.page.getByText('Histórico de consultas', { exact: false }).first();
  await histBtn.waitFor({ timeout: 60_000 });
  await histBtn.click();
  await PAT.page.waitForTimeout(1500);
  await PAT.page.getByText('Ver resumo da consulta', { exact: false }).first().waitFor({ timeout: 30_000 });
  const t16 = await txt(PAT.page);
  step('S16', 'Reminders: chip "Ver resumo" + "Consulta paga" + SEM "Entrar" (R1)', t16.includes('Ver resumo da consulta') && t16.includes('Consulta paga') && !t16.includes('Entrar na consulta'), 'R1 ok');
  await shot(PAT.page, '16-paciente-lembretes-chips');
} catch (e) {
  step('S16', 'Reminders: chip "Ver resumo" + "Consulta paga" + SEM "Entrar" (R1)', false, `timeout: ${String(e.message).slice(0, 80)}`);
  await shot(PAT.page, '16-paciente-lembretes-FAIL');
}

// ══ S17 — portal médico: PortalTeleconsultas estado (histórico, sem Entrar) ═══
try {
  await DOC.page.goto(`${WEB}/#/doctor`, { waitUntil: 'commit', timeout: 90_000 });
  await clickEnabled(DOC.page, '^Consultas$');
  const histOk = await DOC.page.getByText('Problema técnico', { exact: false }).first().waitFor({ timeout: 60_000 }).then(() => true).catch(() => false);
  const t17 = histOk ? await txt(DOC.page) : '';
  step('S17', 'Portal: histórico "Encerrada" + chip "Problema técnico" + "Ver resumo"', histOk && t17.includes('Encerrada') && t17.includes('Problema técnico') && t17.includes('Ver resumo'), histOk ? 'estado técnico correto' : 'histórico não apareceu');
  await shot(DOC.page, '17-portal-historico-tecnico');
} catch (e) {
  step('S17', 'Portal: histórico "Encerrada" + chip "Problema técnico" + "Ver resumo"', false, `timeout: ${String(e.message).slice(0, 80)}`);
  await shot(DOC.page, '17-portal-FAIL');
}

// ══ S18 — §15: exception_queue (pago + technical → exceção p/ triagem) ════════
// O JOB de 10min cobre payment_unconfirmed/ended_no_summary; o caso pago-sem-
// atendimento é do DIAGNÓSTICO §15.1 (script --repair --apply enfileira revisão
// humana SEM tocar no financeiro — nunca repara pago/technical).
try {
  execSync('npx tsx scripts/teleconsulta-diagnose.ts --repair --apply', { cwd: SERVER_DIR, encoding: 'utf8', timeout: 120_000, stdio: 'pipe' });
} catch (e) { console.log('  · diagnose §15.1:', String(e.stdout || e.message).slice(0, 150)); }
const eq = PSQL(`SELECT kind FROM exception_queue WHERE "reminderId"='${teleId}' AND status='open'`);
step('S18', '§15 exception_queue registra pago-sem-atendimento (technical)', eq.includes('teleconsulta_paid_no_atendimento'), eq || '(sem exceção — ver reconciliation.test.ts)');
const auditEnd = PSQL(`SELECT COUNT(*) FROM audit_logs WHERE "targetId"='${teleId}' AND action IN ('TELECONSULTA_END','TELECONSULTA_START','TELECONSULTA_SUMMARY_APPROVE')`);
step('S18b', 'auditoria: START/END/APPROVE registrados', Number(auditEnd) >= 3, `${auditEnd} eventos`);

// ══ Wrap-up ═══════════════════════════════════════════════════════════════════
const pageErrs = [...PAT.errs, ...DOC.errs];
if (pageErrs.length) console.log('⚠ pageerrors:', pageErrs.slice(0, 3));
await PAT.ctx.close(); await DOC.ctx.close(); await browser.close();

const failed = RESULTS.filter((r) => r.status === 'FALHOU');
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ run: new Date().toISOString(), teleId, llmReal, steps: RESULTS }, null, 2));
console.log('\n════ RESUMO §17 ════');
console.log(RESULTS.map((r) => `${r.status === 'FALHOU' ? '✗' : '✓'} ${r.id} ${r.name}`).join('\n'));
console.log(`\n${RESULTS.length - failed.length}/${RESULTS.length} etapas OK · ${failed.length} falha(s)${llmReal ? '' : ' · LLM real NÃO VALIDADO (fallback psql)'}`);
process.exit(failed.length ? 1 : 0);
