/**
 * QA do lote LiveKit F2 (19/10/26) — rota imersiva /teleconsulta/:id.
 * Dev: web 5173 · API 4013 (PORT=4013). Sem LIVEKIT_* no dev → join 501 →
 * valida pré-join (título, consent Art.15, CTA Autorizar) + tela fallback
 * "Abrir no Meet" (degradação da casa). overflow=0 · pageerror=0 · shots 390/1280.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const WEB = 'http://127.0.0.1:5173';
const API = 'http://127.0.0.1:4013/api';
const OUT = 'e2e/screenshots/qa-teleconsulta';
fs.mkdirSync(OUT, { recursive: true });

const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'edmilson@exemplo.com', password: 'troque123' }) });
if (!r.ok) { console.error('login falhou', r.status); process.exit(1); }
const auth = await r.json();
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` };
const pid = auth.patientId;

// limpa teleconsultas anteriores do QA e semeia 1 (meet fake → fallback "Abrir no Meet")
const list = await (await fetch(`${API}/reminders?patientId=${pid}`, { headers: H })).json();
for (const it of list) if (it.type === 'teleconsulta') await fetch(`${API}/reminders/${it.id}`, { method: 'DELETE', headers: H });
const tele = await (await fetch(`${API}/reminders`, { method: 'POST', headers: H, body: JSON.stringify({
  patientId: pid,
  title: 'Teleconsulta de retorno — LiveKit QA',
  dueDate: new Date(Date.now() + 86400000).toISOString(),
  type: 'teleconsulta',
  linkUrl: 'https://meet.google.com/qa-livekit-f2',
  notifyOffsetsMin: [60, 0],
}) })).json();
if (!tele.id) { console.error('seed falhou', JSON.stringify(tele)); process.exit(1); }
console.log('seed ok · teleconsulta', tele.id, '· consentAt:', tele.consentAt ?? null);

// sanity do join pelo lado da API: dev sem LIVEKIT_* → 501 + linkUrl (contrato 501)
const probe = await fetch(`${API}/teleconsulta/${tele.id}/join`, { headers: H });
const probeBody = await probe.json().catch(() => ({}));
console.log('join probe:', probe.status, JSON.stringify({ code: probeBody.code, configured: probeBody.configured, hasLink: !!probeBody.linkUrl }));
const probeOk = probe.status === 501 && probeBody.code === 'LIVEKIT_UNAVAILABLE' && !!probeBody.linkUrl;

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
let fails = 0;
// Estado que deve estar VISÍVEL no momento exato do screenshot. Necessário porque o
// vite dev pode disparar full-reload no meio da run (HMR da outra sessão editando src/,
// re-otimização de dep) — o app reboota (splash) e o fetch-cache pode servir a lista
// de lembretes PRÉ-consentimento → a foto saía na fase errada (caçado no QA 19/10).
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
  // Portão: fase final visível + sem splash, estável 2 checagens seguidas → foto já.
  let ok = false;
  for (let i = 0; i < 12 && !ok; i++) {
    if (await stable(page, final)) {
      await page.waitForTimeout(450);
      ok = await stable(page, final);
    } else await page.waitForTimeout(1000);
  }
  if (!ok) { console.log(`${name}: FASE FINAL "${final}" NÃO ESTAVEL — screenshot best-effort`); fails++; }
  // evidência no instante da foto: URL + fase visível (rastreio do bug da foto errada)
  const at = await page.evaluate(() => `${location.hash} :: ${document.body.innerText.toUpperCase().replace(/\n+/g, ' | ').slice(0, 120)}`).catch((e) => `EVAL-FAIL ${e}`);
  console.log(`  [shot ${name}] ${at}`);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: width < 800 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`${name}.png · overflow=${overflow} · errs=${errs.length}${errs.length ? ' ⚠ ' + errs[0] : ''}`);
  if (overflow > 2 || errs.length) fails++;
  await ctx.close();
};

// 1) Pré-join 390 claro: título, consent Art.15/CFM, CTA "Autorizar e entrar"
await shot({ route: `/teleconsulta/${tele.id}`, name: 'prejoin-390', waitFor: 'SUA CONSULTA VAI COMEÇAR', final: 'AUTORIZAR E ENTRAR', act: async (p) => {
  await p.waitForTimeout(600);
  const txt = (await p.evaluate(() => document.body.innerText)).toUpperCase();
  const cta = p.getByRole('button', { name: /Autorizar e entrar/ });
  const checks = {
    titulo: txt.includes('TELECONSULTA DE RETORNO — LIVEKIT QA'),
    medico: txt.includes('TELECONSULTA MÉDICA') || txt.includes('CRM'),
    consent: txt.includes('2.314'),
    cfm: txt.includes('CFM'),
    cta: await cta.count() > 0,
  };
  console.log('  pré-join DOM:', JSON.stringify(checks));
  if (Object.values(checks).some((v) => !v)) fails++;
}});

// 2) Fluxo completo: Autorizar (PUT consent) → join 501 → fallback "Abrir no Meet"
await shot({ route: `/teleconsulta/${tele.id}`, name: 'fallback-390', waitFor: 'SUA CONSULTA VAI COMEÇAR', final: 'ABRIR NO MEET', act: async (p) => {
  await p.getByRole('button', { name: /Autorizar e entrar/ }).first().click({ timeout: 20_000 });
  await p.waitForFunction(() => document.body.innerText.toUpperCase().includes('ABRIR NO MEET'), { timeout: 30_000 });
  const txt = (await p.evaluate(() => document.body.innerText)).toUpperCase();
  const meet = p.getByRole('button', { name: 'Abrir no Meet' });
  const checks = {
    indisponivel: txt.includes('TELECONSULTA PELO APP INDISPONÍVEL'),
    abrirMeet: await meet.count() > 0,
    voltar: txt.includes('VOLTAR AOS LEMBRETES'),
  };
  console.log('  fallback DOM:', JSON.stringify(checks));
  if (Object.values(checks).some((v) => !v)) fails++;
}});

// 3) Re-entrada já consentida: pré-join direto no fallback (spec §1: consentido → join) + dark
await shot({ route: `/teleconsulta/${tele.id}`, name: 'fallback-390-dark', dark: true, waitFor: 'ABRIR NO MEET', final: 'ABRIR NO MEET', act: async (p) => {
  const txt = (await p.evaluate(() => document.body.innerText)).toUpperCase();
  const chip = txt.includes('TELECONSULTA PELO APP INDISPONÍVEL');
  console.log('  dark pós-consent (join direto → fallback):', JSON.stringify({ fallback: chip }));
  if (!chip) fails++;
}});

// 4) Desktop 1280
await shot({ route: `/teleconsulta/${tele.id}`, name: 'fallback-1280', width: 1280, height: 900, waitFor: 'ABRIR NO MEET', final: 'ABRIR NO MEET' });

await browser.close();
if (!probeOk) { console.error('❌ join probe fora do contrato 501'); fails++; }
console.log(fails ? `❌ ${fails} problema(s)` : '✅ QA teleconsulta passou');
process.exit(fails ? 1 : 0);
