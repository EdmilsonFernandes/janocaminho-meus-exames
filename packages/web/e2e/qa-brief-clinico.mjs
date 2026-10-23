/**
 * QA do Brief Clínico in-call (23/10/26) — E2E REAL paciente × médico.
 * Cenário completo: share exams → médico agenda (LiveKit do dev) → paciente
 * consentiu via API → ambos entram com mídia fake → médico abre 📋 Exames
 * (brief com alterados + expand todos) → paciente aprova gravação IA no
 * banner in-call (fix 23/10: o caminho de quem JÁ consentiu Art.15).
 * Dev: web 5173 · API 4013 (PORT=4013). Screenshots em e2e/screen shots/qa-brief
 * alimentam o review de design (design-critic + skills UX). overflow=0 · pageerror=0.
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const WEB = 'http://127.0.0.1:5173';
const API = 'http://127.0.0.1:4013/api';
const OUT = 'e2e/screenshots/qa-brief';
fs.mkdirSync(OUT, { recursive: true });

const PSQL = (sql) => execSync(`docker exec meus-exames-db psql -U meus_exames -d meus_exames -qtAc "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).toString().trim();

/** CPF válido (mod-11) p/ registro do médico QA. */
function genCpf(seed) {
  const d = Array.from({ length: 9 }, (_, i) => (seed * (i + 7)) % 10);
  const dv = (arr) => { const s = arr.reduce((n, v, i) => n + v * (arr.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  const a = [...d, dv(d)];
  return [...a, dv(a)].join('');
}

// ── 1. Login paciente + limpeza de runs anteriores ────────────────────────────
const lr = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'edmilson@exemplo.com', password: 'troque123' }) });
if (!lr.ok) { console.error('login paciente falhou', lr.status); process.exit(1); }
const auth = await lr.json();
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` };
const pid = auth.patientId;

const list = await (await fetch(`${API}/reminders?patientId=${pid}`, { headers: H })).json();
for (const it of list) if (it.type === 'teleconsulta') await fetch(`${API}/reminders/${it.id}`, { method: 'DELETE', headers: H });
PSQL(`DELETE FROM exams WHERE id LIKE 'qa-brief-%'`);

// ── 2. Médico QA: conta REAL do dev (CRM 65432-SP ativo no CFM — registrar CRM
//      fake aqui 400a no consultacRM). É o mesmo médico do E2E Meet do F1. ─────
const docEmail = 'meet.teste@drexame.dev';
const dlog = await (await fetch(`${API}/doctor/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: docEmail, password: 'meet12345' }) })).json();
if (!dlog.token) { console.error('login médico falhou'); process.exit(1); }
const HD = { 'Content-Type': 'application/json', Authorization: `Bearer ${dlog.token}` };
console.log('médico QA ok:', dlog.doctor?.name, dlog.doctor?.id);

// ── 3. Share (scope exams) + exame semeado direto no DB (2 alterados + 1 ok) ──
const share = await fetch(`${API}/doctor-shares`, { method: 'POST', headers: H, body: JSON.stringify({ doctorCrm: '65432-SP', scopes: ['exams'], patientId: pid }) });
if (share.status !== 201 && share.status !== 200) { console.error('share falhou', share.status, await share.text()); process.exit(1); }

const now = new Date();
// SQL em LINHA ÚNICA — multiline quebra no docker exec do Windows (CMD mastiga \n)
PSQL(`INSERT INTO exams (id, "patientId", title, kind, "performedAt", "sourceLab", "filePath", "fileSha256", "fileSizeBytes", "pageCount", status, "extractedAt", "createdAt", "updatedAt") VALUES ('qa-brief-exam-1', '${pid}', 'HEMOGRAMA', 'LAB_PANEL', NOW() - INTERVAL '3 days', 'Lab QA', 'qa/brief.pdf', 'qa-brief-sha-${Date.now()}', 1024, 1, 'EXTRACTED', NOW(), NOW(), NOW())`);
PSQL(`INSERT INTO exam_items (id, "examId", panel, name, "nameCanonical", "valueNumeric", "valueText", unit, "refLow", "refHigh", "refText", flag, "isAbnormal", "extractedPage", "createdAt") VALUES ('qa-brief-it-1', 'qa-brief-exam-1', 'Bioquímica', 'ZZ-GLICOSE-QA', 'ZZ-GLICOSE-QA', 128, '128', 'mg/dL', 70, 99, '70 a 99 mg/dL', 'HIGH', true, 1, NOW())`);
PSQL(`INSERT INTO exam_items (id, "examId", panel, name, "nameCanonical", "valueNumeric", "valueText", unit, "refLow", "refHigh", "refText", flag, "isAbnormal", "extractedPage", "createdAt") VALUES ('qa-brief-it-2', 'qa-brief-exam-1', 'Bioquímica', 'ZZ-TSH-QA', 'ZZ-TSH-QA', 0.12, '0,12', 'mUI/L', 0.4, 4.0, '0,4 a 4,0 mUI/L', 'LOW', true, 1, NOW())`);
PSQL(`INSERT INTO exam_items (id, "examId", panel, name, "nameCanonical", "valueNumeric", "valueText", unit, "refLow", "refHigh", "refText", flag, "isAbnormal", "extractedPage", "createdAt") VALUES ('qa-brief-it-3', 'qa-brief-exam-1', 'Eritrograma', 'ZZ-HGB-QA', 'ZZ-HGB-QA', 14.2, '14,2', 'g/dL', 13, 17, '13 a 17 g/dL', 'NORMAL', false, 1, NOW())`);
console.log('exame QA semeado (2 alterados + 1 normal)');

// sanity: médico vê o brief pela API (o mesmo GET que o drawer faz)
const briefApi = await (await fetch(`${API}/doctor/patients/${pid}/exams`, { headers: HD })).json();
console.log('brief via API:', JSON.stringify({ exams: briefApi.items?.length, abnormal: briefApi.items?.[0]?.items?.length, title: briefApi.items?.[0]?.title }));

// ── 4. Agenda teleconsulta (LiveKit) + consent do paciente via API ───────────
const due = new Date(Date.now() + 2 * 3600_000);
const tele = await (await fetch(`${API}/doctor/patients/${pid}/teleconsulta`, { method: 'POST', headers: HD, body: JSON.stringify({ dueDate: due.toISOString() }) })).json();
if (!tele.reminder?.id) { console.error('agenda falhou', JSON.stringify(tele)); process.exit(1); }
const teleId = tele.reminder.id;
const consent = await fetch(`${API}/reminders/${teleId}/consent`, { method: 'PUT', headers: H });
console.log('teleconsulta', teleId, '· provider', tele.reminder.provider, '· consent', consent.status);

// ── 5. Playwright: médico entra (sozinho) → abre brief ────────────────────────
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
let fails = 0;
const mkPage = async ({ width, height, dark, doctor }) => {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: width < 800, hasTouch: width < 800, deviceScaleFactor: 2 });
  await ctx.addInitScript((opts) => {
    if (opts.doctor) { localStorage.setItem('doctorToken', opts.doctor); }
    else {
      localStorage.setItem('token', opts.auth.token); localStorage.setItem('user', JSON.stringify(opts.auth.user));
      if (opts.auth.patientId) { localStorage.setItem('patientId', opts.auth.patientId); localStorage.setItem('selPatientId', opts.auth.patientId); }
    }
    localStorage.setItem('onboarded', '1'); localStorage.setItem('lead_popup_dismissed_at', String(Date.now()));
    if (opts.dark) { localStorage.setItem('theme', 'dark'); localStorage.setItem('RaStore.theme', 'dark'); }
  }, { doctor, auth, dark });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  return { ctx, page, errs };
};
const overflowCheck = async (name, page, errs) => {
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`${name} · overflow=${ov} · errs=${errs.length}${errs.length ? ' ⚠ ' + errs[0] : ''}`);
  if (ov > 2 || errs.length) fails++;
};

// MÉDICO 390 claro — entra na sala e abre o brief ainda aguardando o paciente
const doc = await mkPage({ width: 390, height: 844, dark: false, doctor: dlog.token });
await doc.page.goto(`${WEB}/#/teleconsulta/${teleId}?role=doctor`, { waitUntil: 'commit', timeout: 60_000 });
await doc.page.getByRole('button', { name: /Entrar na consulta/ }).first().waitFor({ timeout: 45_000 });
await doc.page.getByRole('button', { name: /Entrar na consulta/ }).first().click();
await doc.page.getByText('Exames', { exact: true }).first().waitFor({ timeout: 45_000 });
console.log('✓ médico in-call, chip 📋 Exames visível');
await doc.page.getByText('Exames', { exact: true }).first().click();
await doc.page.getByText('Brief clínico').first().waitFor({ timeout: 20_000 });
await doc.page.getByText('ZZ-GLICOSE-QA').first().waitFor({ timeout: 20_000 });
await doc.page.waitForTimeout(700);
let dtxt = await doc.page.evaluate(() => document.body.innerText);
let briefChecks = {
  header: dtxt.includes('Brief clínico'),
  alteredChip: /\d+ alterados/.test(dtxt),
  glicoseH: dtxt.includes('ZZ-GLICOSE-QA') && dtxt.includes('128'),
  tshL: dtxt.includes('ZZ-TSH-QA') && dtxt.includes('0,12'),
  refs: dtxt.includes('70 a 99'),
  expandHint: /ver todos os \d+ valores/.test(dtxt),
};
console.log('brief checks:', JSON.stringify(briefChecks));
if (Object.values(briefChecks).some((v) => !v)) fails++;
await doc.page.screenshot({ path: `${OUT}/01-doctor-brief-390.png` });
await overflowCheck('01-doctor-brief-390', doc.page, doc.errs);

// expande → todos os valores (fetch do detalhe). Clique NA LINHA do item único
// (o card alvo é o ancestral role=button dele — os outros 9 exames têm nomes comuns).
const zzRow = doc.page.getByText('ZZ-GLICOSE-QA').first().locator('xpath=ancestor::*[contains(@class,"MuiCardContent-root")][1]').locator('[role="button"]').first();
await zzRow.click();
await doc.page.getByText('ZZ-HGB-QA').first().waitFor({ timeout: 20_000 });
await doc.page.waitForTimeout(500);
dtxt = await doc.page.evaluate(() => document.body.innerText);
const expandOk = dtxt.includes('ZZ-HGB-QA') && dtxt.includes('14,2') && /\d+ valores/.test(dtxt);
console.log('expand todos:', expandOk);
if (!expandOk) fails++;
await doc.page.screenshot({ path: `${OUT}/02-doctor-brief-expanded-390.png` });
await overflowCheck('02-doctor-brief-expanded-390', doc.page, doc.errs);

// ── 6. PACIENTE 390 — auto-join (já consentiu) + banner gravação IA ──────────
const pat = await mkPage({ width: 390, height: 844, dark: false });
await pat.page.goto(`${WEB}/#/teleconsulta/${teleId}`, { waitUntil: 'commit', timeout: 60_000 });
// consent via API → bootstrap entra DIRETO na chamada (fix 23/10 testado aqui:
// o opt-in de gravação precisa aparecer mesmo sem passar pelo pré-join)
try {
  await pat.page.getByText('Gravação & Transcrição por IA').first().waitFor({ timeout: 45_000 });
} catch {
  // debug: o que o paciente está vendo?
  await pat.page.screenshot({ path: `${OUT}/99-paciente-debug.png`, fullPage: true });
  const dbg = await pat.page.evaluate(() => `${location.hash} :: ${document.body.innerText.replace(/\n+/g, ' | ').slice(0, 500)}`).catch(() => 'EVAL-FAIL');
  console.error('paciente SEM banner de gravação. Estado:', dbg);
  await browser.close();
  process.exit(1);
}
await pat.page.screenshot({ path: `${OUT}/03-paciente-banner-gravacao-390.png` });
await pat.page.getByRole('button', { name: /Sim, Gravar com IA/ }).first().click();
await pat.page.getByText('● Gravando IA').first().waitFor({ timeout: 30_000 });
console.log('✓ paciente aprovou gravação → chip ● Gravando IA');
const ptxt = await pat.page.evaluate(() => document.body.innerText);
const patChecks = { gravando: ptxt.includes('Gravando IA'), autorizada: ptxt.includes('autorizada') };
console.log('paciente in-call:', JSON.stringify(patChecks));
if (Object.values(patChecks).some((v) => !v)) fails++;
await pat.page.screenshot({ path: `${OUT}/04-paciente-incall-gravando-390.png` });
await overflowCheck('04-paciente-incall', pat.page, pat.errs);

// médico vê o paciente (header com nome) e o chip de gravação ligado
await doc.page.waitForTimeout(1500);
dtxt = await doc.page.evaluate(() => document.body.innerText);
const docSees = { paciente: dtxt.toUpperCase().includes((auth.user?.name ?? 'EDMILSON').split(' ')[0].toUpperCase()), gravando: dtxt.includes('Gravando IA') || dtxt.includes('Transcrição ativa') };
console.log('médico vê:', JSON.stringify(docSees));
if (!docSees.paciente) fails++;

// ── 7. Brief em dark + desktop 1280 (painel lateral) ─────────────────────────
// Contextos anteriores FECHADOS: mesmo doctorId = mesma identity no LiveKit;
// segunda entrada com a primeira ativa pode perder a sala (join re-cria room).
await pat.ctx.close();
await doc.ctx.close();
await new Promise((r) => setTimeout(r, 1500));
const docDark = await mkPage({ width: 390, height: 844, dark: true, doctor: dlog.token });
await docDark.page.goto(`${WEB}/#/teleconsulta/${teleId}?role=doctor`, { waitUntil: 'commit', timeout: 60_000 });
await docDark.page.getByRole('button', { name: /Entrar na consulta/ }).first().waitFor({ timeout: 45_000 });
await docDark.page.getByRole('button', { name: /Entrar na consulta/ }).first().click();
await docDark.page.getByText('Exames', { exact: true }).first().waitFor({ timeout: 45_000 });
await docDark.page.getByText('Exames', { exact: true }).first().click();
await docDark.page.getByText('ZZ-GLICOSE-QA').first().waitFor({ timeout: 20_000 });
await docDark.page.waitForTimeout(600);
// gate dark REAL (critic #1): screenshot "dark" já saiu igual ao light uma vez —
// o sheet precisa estar no paper escuro da casa (rgb(26, 36, 36)), senão é fail.
const darkBg = await docDark.page.evaluate(() => { const s = document.querySelector('[role="dialog"]'); return s ? getComputedStyle(s).backgroundColor : 'none'; });
console.log('dark sheet bg:', darkBg, /26,\s*36,\s*36/.test(darkBg) ? '✓ escuro' : '❌ CLARO — tema não aplicou');
if (!/26,\s*36,\s*36/.test(darkBg)) fails++;
await docDark.page.screenshot({ path: `${OUT}/05-doctor-brief-390-dark.png` });
await overflowCheck('05-doctor-brief-dark', docDark.page, docDark.errs);

const docDesk = await mkPage({ width: 1280, height: 900, dark: false, doctor: dlog.token });
await docDesk.page.goto(`${WEB}/#/teleconsulta/${teleId}?role=doctor`, { waitUntil: 'commit', timeout: 60_000 });
await docDesk.page.getByRole('button', { name: /Entrar na consulta/ }).first().waitFor({ timeout: 45_000 });
await docDesk.page.getByRole('button', { name: /Entrar na consulta/ }).first().click();
await docDesk.page.getByText('Exames', { exact: true }).first().waitFor({ timeout: 45_000 });
await docDesk.page.getByText('Exames', { exact: true }).first().click();
await docDesk.page.getByText('ZZ-GLICOSE-QA').first().waitFor({ timeout: 20_000 });
await docDesk.page.waitForTimeout(600);
await docDesk.page.screenshot({ path: `${OUT}/06-doctor-brief-1280.png` });
await overflowCheck('06-doctor-brief-1280', docDesk.page, docDesk.errs);

await browser.close();
console.log(fails ? `❌ ${fails} problema(s)` : '✅ QA brief clínico passou');
process.exit(fails ? 1 : 0);
