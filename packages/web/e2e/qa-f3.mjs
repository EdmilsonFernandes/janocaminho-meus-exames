/**
 * QA do lote F3 (telemedicina premium) — 19/10/26. Complementa qa-teleconsulta.mjs
 * validando o lado PACIENTE do F3 na rota /#/teleconsulta/:id:
 *  §1 checkbox "Autorizo gravar o áudio p/ transcrição" (default OFF, hint da promessa
 *     única "Opcional — a consulta funciona sem. O áudio é apagado…", alvo ≥44px)
 *  §1 fluxo SEM marcar → "Autorizar e entrar" → join → fallback "Abrir no Meet"
 *     (dev sem LIVEKIT_* → 501) e recordConsentAt PERMANECE null (opt-in honesto)
 *  §1 fluxo COM checkbox marcado (teleconsulta #2, dark) → PUT /record-consent no ar
 *     → recordConsentAt setado no Reminder (verificado via /reminders)
 * overflow=0 · pageerror=0 · shots 390 claro+escuro em e2e/screenshots/qa-f3/.
 * Dev: web 5173 · API 4013 (PORT=4013). Se LIVEKIT_* estiver no dev, join ≠ 501:
 * o script loga e pula as asserções de fallback (não derruba o veredito).
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const WEB = process.env.QA_WEB || 'http://127.0.0.1:5173';
const API = process.env.QA_API || 'http://127.0.0.1:4013/api';
const OUT = 'e2e/screenshots/qa-f3';
fs.mkdirSync(OUT, { recursive: true });

const CHECKBOX_ARIA = 'Autorizo gravar o áudio para gerar transcrição';
const CHECKBOX_LABEL = 'Autorizo gravar o áudio p/ transcrição';
const HINT = 'Opcional — a consulta funciona sem';

const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'edmilson@exemplo.com', password: 'troque123' }) });
if (!r.ok) { console.error('login falhou', r.status); process.exit(1); }
const auth = await r.json();
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` };
const pid = auth.patientId;

const seed = async (title, linkUrl) => {
  const t = await (await fetch(`${API}/reminders`, { method: 'POST', headers: H, body: JSON.stringify({
    patientId: pid, title, dueDate: new Date(Date.now() + 86400000).toISOString(), type: 'teleconsulta', linkUrl, notifyOffsetsMin: [60, 0],
  }) })).json();
  if (!t.id) { console.error('seed falhou', JSON.stringify(t)); process.exit(1); }
  return t;
};
const remindersList = async () => (await (await fetch(`${API}/reminders?patientId=${pid}`, { headers: H })).json());

// limpa teleconsultas de QA anteriores (deste script e do qa-teleconsulta) e semeia 2
const list0 = await remindersList();
for (const it of list0) if (it.type === 'teleconsulta' && /QA/.test(it.title || '')) await fetch(`${API}/reminders/${it.id}`, { method: 'DELETE', headers: H });
const tele1 = await seed('Teleconsulta de retorno — F3 QA', 'https://meet.google.com/qa-f3-sem-gravacao');
const tele2 = await seed('Teleconsulta cardiologia — F3 QA gravacao', 'https://meet.google.com/qa-f3-com-gravacao');
console.log('seed ok ·', tele1.id, tele2.id);

// probe join: sem LIVEKIT_* no dev → 501 LIVEKIT_UNAVAILABLE (fallback esperado)
const probe = await fetch(`${API}/teleconsulta/${tele1.id}/join`, { headers: H });
const probeBody = await probe.json().catch(() => ({}));
console.log('join probe:', probe.status, JSON.stringify({ code: probeBody.code, hasLink: !!probeBody.linkUrl }));
const expectFallback = probe.status === 501 && probeBody.code === 'LIVEKIT_UNAVAILABLE';
if (!expectFallback) console.log('  (dev com LIVEKIT_* → join real; asserções de fallback puladas, não contam falha)');

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
let fails = 0;
// mesmo portão do qa-teleconsulta: fase final estável + sem splash (HMR da sessão paralela)
const stable = (page, finalTxt) => page.evaluate((txt) => {
  const t = document.body.innerText.toUpperCase();
  const splash = ['INICIANDO O DR', 'CARREGANDO SEUS EXAMES', 'PREPARANDO SEU PAINEL', 'QUASE LÁ'].some((s) => t.includes(s));
  return !splash && t.includes(txt);
}, finalTxt).catch(() => false);
const shot = async ({ route, name, width = 390, height = 844, dark = false, waitFor, final, act }) => {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: width < 800, hasTouch: width < 800, deviceScaleFactor: 2 });
  await ctx.addInitScript((a, isDark) => {
    localStorage.setItem('token', a.token); localStorage.setItem('user', JSON.stringify(a.user));
    if (a.patientId) { localStorage.setItem('patientId', a.patientId); localStorage.setItem('selPatientId', a.patientId); }
    localStorage.setItem('onboarded', '1'); localStorage.setItem('lead_popup_dismissed_at', String(Date.now()));
    if (isDark) localStorage.setItem('theme', 'dark');
  }, auth, dark);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await page.goto(`${WEB}/#${route}`, { waitUntil: 'commit', timeout: 60_000 });
  await page.waitForFunction((txt) => document.body.innerText.toUpperCase().includes(txt), waitFor, { timeout: 60_000 });
  await act?.(page);
  let ok = false;
  for (let i = 0; i < 12 && !ok; i++) {
    if (await stable(page, final)) {
      await page.waitForTimeout(450);
      ok = await stable(page, final);
    } else await page.waitForTimeout(1000);
  }
  if (!ok) { console.log(`${name}: FASE FINAL "${final}" NÃO ESTAVEL — screenshot best-effort`); fails++; }
  const at = await page.evaluate(() => `${location.hash} :: ${document.body.innerText.toUpperCase().replace(/\n+/g, ' | ').slice(0, 120)}`).catch((e) => `EVAL-FAIL ${e}`);
  console.log(`  [shot ${name}] ${at}`);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: width < 800 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`${name}.png · overflow=${overflow} · errs=${errs.length}${errs.length ? ' ⚠ ' + errs[0] : ''}`);
  if (overflow > 2 || errs.length) fails++;
  await ctx.close();
};

// 1) Pré-join 390 claro — §1: checkbox gravação presente, default OFF, hint, alvo ≥44px
await shot({ route: `/teleconsulta/${tele1.id}`, name: 'prejoin-record-390', waitFor: 'SUA CONSULTA VAI COMEÇAR', final: 'AUTORIZAR E ENTRAR', act: async (p) => {
  await p.waitForTimeout(600);
  const box = p.locator(`[aria-label="${CHECKBOX_ARIA}"]`);
  const txt = (await p.evaluate(() => document.body.innerText)).toUpperCase();
  // alvo de toque = <label> raiz do FormControlLabel (checkbox 24px + p:10px = 44px)
  const row = box.locator('xpath=ancestor::label[1]');
  let targetH = 0;
  if ((await row.count()) > 0) targetH = (await row.first().boundingBox())?.height || 0;
  const checks = {
    checkbox: await box.count() > 0,
    defaultOff: await box.count() > 0 ? !(await box.isChecked()) : false,
    hintOpcional: txt.includes('OPCIONAL — A CONSULTA FUNCIONA SEM'),
    hintApagado: txt.includes('ÁUDIO É APAGADO'),
    consentArt15: txt.includes('2.314'),
    cta: await p.getByRole('button', { name: /Autorizar e entrar/ }).count() > 0,
    alvo44: targetH >= 44,
  };
  console.log('  pré-join §1 DOM:', JSON.stringify(checks), `· labelH=${Math.round(targetH)}px`);
  if (Object.values(checks).some((v) => !v)) fails++;
}});

// 2) Fluxo SEM marcar → "Autorizar e entrar" flui → fallback "Abrir no Meet" + recordConsentAt null
await shot({ route: `/teleconsulta/${tele1.id}`, name: 'fallback-sem-gravacao-390', waitFor: 'SUA CONSULTA VAI COMEÇAR', final: expectFallback ? 'ABRIR NO MEET' : 'SUA CONSULTA VAI COMEÇAR', act: async (p) => {
  await p.getByRole('button', { name: /Autorizar e entrar/ }).first().click({ timeout: 20_000 });
  if (expectFallback) {
    await p.waitForFunction(() => document.body.innerText.toUpperCase().includes('ABRIR NO MEET'), { timeout: 30_000 });
    const txt = (await p.evaluate(() => document.body.innerText)).toUpperCase();
    const checks = {
      indisponivel: txt.includes('TELECONSULTA PELO APP INDISPONÍVEL'),
      abrirMeet: await p.getByRole('button', { name: 'Abrir no Meet' }).count() > 0,
      voltar: txt.includes('VOLTAR AOS LEMBRETES'),
    };
    console.log('  fallback DOM:', JSON.stringify(checks));
    if (Object.values(checks).some((v) => !v)) fails++;
  } else {
    await p.waitForTimeout(4000); // join real: só prova que o CTA fluiu sem pageerror
    console.log('  (join real — CTA fluiu, fallback não se aplica)');
  }
}});
{
  const l1 = await remindersList();
  const t1 = l1.find((x) => x.id === tele1.id);
  const nullOk = !t1?.recordConsentAt;
  console.log('  sem checkbox → recordConsentAt:', t1?.recordConsentAt ?? null, nullOk ? '(null ✓ opt-in honesto)' : '⚠ DEVERIA SER NULL');
  if (!nullOk) fails++;
}

// 3) Fluxo COM checkbox marcado (dark 390) → PUT /record-consent → recordConsentAt setado
await shot({ route: `/teleconsulta/${tele2.id}`, name: 'record-consent-390-dark', dark: true, waitFor: 'SUA CONSULTA VAI COMEÇAR', final: expectFallback ? 'ABRIR NO MEET' : 'SUA CONSULTA VAI COMEÇAR', act: async (p) => {
  const box = p.locator(`[aria-label="${CHECKBOX_ARIA}"]`);
  await box.waitFor({ timeout: 15_000 });
  // marca via label clicável (FormControlLabel) e confere no input
  await p.getByText(CHECKBOX_LABEL, { exact: false }).first().click();
  await p.waitForTimeout(300);
  const nowChecked = await box.isChecked();
  console.log('  checkbox marcado:', nowChecked);
  if (!nowChecked) fails++;
  await p.getByRole('button', { name: /Autorizar e entrar/ }).first().click({ timeout: 20_000 });
  if (expectFallback) await p.waitForFunction(() => document.body.innerText.toUpperCase().includes('ABRIR NO MEET'), { timeout: 30_000 });
  else await p.waitForTimeout(4000);
}});
{
  let setOk = false, tries = 0;
  let t2 = null;
  while (tries++ < 10 && !setOk) {
    const l2 = await remindersList();
    t2 = l2.find((x) => x.id === tele2.id);
    setOk = !!t2?.recordConsentAt;
    if (!setOk) await new Promise((res) => setTimeout(res, 1000));
  }
  console.log('  com checkbox → recordConsentAt:', t2?.recordConsentAt ?? null, setOk ? '(setado ✓ PUT /record-consent no ar)' : '⚠ NÃO SETADO');
  if (!setOk) fails++;
}

await browser.close();
if (expectFallback === false) console.log('NOTA: probe join ≠ 501 (LIVEKIT configurado no dev) — asserções de fallback não aplicáveis.');
console.log(fails ? `❌ ${fails} problema(s)` : '✅ QA F3 telemedicina premium passou');
process.exit(fails ? 1 : 0);
