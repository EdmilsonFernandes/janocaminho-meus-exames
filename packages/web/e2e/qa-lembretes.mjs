/**
 * QA visual do lote "encontro estilo Teams" (18/10/26) — tela /lembretes + portal.
 * Dev: web 5173 · API 4013 (PORT=4013). Cria lembretes variados (tipos, recorrência,
 * teleconsulta com/sem consentimento) via API e valida render + interação por DOM.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const WEB = 'http://127.0.0.1:5173';
const API = 'http://127.0.0.1:4013/api';
const OUT = 'e2e/screenshots/qa-lembretes';
fs.mkdirSync(OUT, { recursive: true });

const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'edmilson@exemplo.com', password: 'troque123' }) });
if (!r.ok) { console.error('login falhou', r.status); process.exit(1); }
const auth = await r.json();
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` };
const pid = auth.patientId;

// limpa lembretes anteriores do QA e sê o cenário
const list = await (await fetch(`${API}/reminders?patientId=${pid}`, { headers: H })).json();
for (const it of list) await fetch(`${API}/reminders/${it.id}`, { method: 'DELETE', headers: H });
const mk = (body) => fetch(`${API}/reminders`, { method: 'POST', headers: H, body: JSON.stringify({ patientId: pid, ...body }) });
const day = 86400000;
await mk({ title: 'Refazer hemograma completo', dueDate: new Date(Date.now() + 2 * day).toISOString(), type: 'exame', recurrence: 'semestral', notifyOffsetsMin: [1440, 0] });
await mk({ title: 'Consulta cardiologista', dueDate: new Date(Date.now() + 5 * day).toISOString(), type: 'consulta', notifyOffsetsMin: [1440, 300, 0] });
await mk({ title: 'Tomar vitamina D', dueDate: new Date(Date.now() + 9 * day).toISOString(), type: 'medicamento', recurrence: 'diario' });
const tele = await (await mk({ title: 'Teleconsulta de retorno', dueDate: new Date(Date.now() + 1 * day).toISOString(), type: 'teleconsulta', linkUrl: 'https://meet.google.com/qa-teste', notifyOffsetsMin: [60, 0] })).json();
console.log('seed ok · teleconsulta', tele.id);

const browser = await chromium.launch();
let fails = 0;
const shot = async ({ route, name, width = 390, height = 844, dark = false, act }) => {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: width < 800, hasTouch: width < 800, deviceScaleFactor: 2 });
  await ctx.addInitScript((a, isDark) => {
    localStorage.setItem('token', a.token); localStorage.setItem('user', JSON.stringify(a.user));
    if (a.patientId) { localStorage.setItem('patientId', a.patientId); localStorage.setItem('selPatientId', a.patientId); }
    localStorage.setItem('onboarded', '1'); localStorage.setItem('lead_popup_dismissed_at', String(Date.now()));
    if (isDark) localStorage.setItem('theme', 'dark');
  }, auth, dark);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
  await page.goto(`${WEB}/#${route}`, { waitUntil: 'commit', timeout: 60_000 });
  // boot lento na máquina dev (Vite sob carga) → espera CONTEÚDO, não timer fixo
  await page.waitForFunction(() => {
    const t = document.body.innerText.toUpperCase();
    return t.includes('CRIAR') || t.includes('LEMBRETES');
  }, { timeout: 60_000 });
  await page.getByRole('button', { name: 'Depois' }).click({ timeout: 2000 }).catch(() => {});
  await act?.(page);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: width < 800 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`${name}.png · overflow=${overflow} · errs=${errs.length}${errs.length ? ' ⚠ ' + errs[0] : ''}`);
  if (overflow > 2 || errs.length) fails++;
  await ctx.close();
  return ctx;
};

// 1) Lembretes 390 claro — grupos, chips de tipo/recorrência, botão de consentir
await shot({ route: '/lembretes', name: 'lembretes-390', act: async (p) => {
  await p.waitForTimeout(600);
  const txt = (await p.evaluate(() => document.body.innerText)).toUpperCase();
  const checks = {
    grupos: txt.includes('HOJE') || txt.includes('PRÓXIMOS 7 DIAS'),
    chipExame: txt.includes('EXAME'),
    chipTele: txt.includes('TELECONSULTA'),
    recorre: txt.includes('REPETE') || txt.includes('MENSAL') || txt.includes('DIÁRIO'),
    autorizar: txt.includes('AUTORIZAR E ENTRAR'),
    wa: await p.locator('button[aria-label="Compartilhar no WhatsApp"]').count() > 0,
  };
  console.log('  DOM:', JSON.stringify(checks));
  // abre o form "Criar" p/ o screenshot pegar o form novo (tipos + repetir)
  await p.getByRole('button', { name: 'Criar', exact: true }).click().catch(() => {});
  await p.waitForTimeout(500);
}});

// 2) Fluxo de CONSENTIMENTO: dialog Art.15 → autoriza → botão vira "Entrar na consulta"
await shot({ route: '/lembretes', name: 'consentimento-390', act: async (p) => {
  await p.waitForTimeout(800);
  await p.getByRole('button', { name: /Autorizar e entrar/ }).first().click({ timeout: 15_000 });
  await p.waitForTimeout(600);
  const dialogTxt = (await p.evaluate(() => document.body.innerText)).toLowerCase();
  console.log('  dialog Art.15:', JSON.stringify({ termo: dialogTxt.includes('telemedicina'), cfm: dialogTxt.includes('2.314') }));
  await p.screenshot({ path: `${OUT}/dialog-consentimento.png` });
  await p.getByRole('button', { name: /Autorizar e entrar/ }).last().click({ timeout: 5000 });
  await p.waitForTimeout(1200);
}});

// 3) Pós-consentimento: botão direto + chip "telemedicina autorizada"
await shot({ route: '/lembretes', name: 'pos-consentimento-390', act: async (p) => {
  await p.waitForTimeout(900);
  const txt = (await p.evaluate(() => document.body.innerText)).toLowerCase();
  console.log('  pós:', JSON.stringify({ entrar: txt.includes('entrar na consulta'), autorizada: txt.includes('telemedicina autorizada') }));
}});

// 4) Dark + desktop
await shot({ route: '/lembretes', name: 'lembretes-390-dark', dark: true });
await shot({ route: '/lembretes', name: 'lembretes-1280', width: 1280, height: 900 });

await browser.close();
console.log(fails ? `❌ ${fails} problema(s)` : '✅ QA lembretes passou');
process.exit(fails ? 1 : 0);
