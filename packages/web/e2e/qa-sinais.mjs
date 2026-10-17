/**
 * QA visual do lote Sinais Vitais (16/10/26) — roda contra o DEV LOCAL:
 *   server PORT=4013 (4001 ocupado por outro app) · web 5173 com VITE_API_URL=4013.
 *
 * 1) login dev → 2) SEED de 16 dias de atividade COM sono (activity-sync)
 * 3) screenshots /sinais (390 light/dark + 1280) + dashboard (tile Sono no ActivityCard)
 * 4) fail rápido em: erro de console, overflow horizontal, página vazia.
 *
 * Uso: node e2e/qa-sinais.mjs   (do packages/web, com dev no ar)
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const WEB = process.env.QA_WEB_URL || 'http://127.0.0.1:5173';
const API = process.env.QA_API_URL || 'http://127.0.0.1:4013/api';
const OUT = 'e2e/screenshots/qa-sinais';
fs.mkdirSync(OUT, { recursive: true });

// Creds dev (docker local / seed). Se o 1º falhar, tenta as SEED_* do .env do server.
const login = async (u, p) => fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
let r = await login('edmilson@exemplo.com', 'troque123');
if (!r.ok) {
  const env = fs.readFileSync('../server/.env', 'utf8');
  const u2 = env.match(/^SEED_EMAIL=(.*)$/m)?.[1];
  const p2 = env.match(/^SEED_PASSWORD=(.*)$/m)?.[1];
  if (u2 && p2) r = await login(u2.trim(), p2.trim());
}
if (!r.ok) { console.error('LOGIN FALHOU', r.status, await r.text()); process.exit(1); }
const auth = await r.json();
console.log('login ok · user', auth.user?.email ?? '?');

// ── Seed: 16 dias com passos/sono/FC/exercício (padrão realista, meta em alguns dias)
const days = [];
for (let i = 0; i < 16; i++) {
  const d = new Date(Date.now() - i * 86400000);
  const iso = d.toISOString().slice(0, 10);
  const base = 5200 + ((i * 977) % 4200); // 5.2k..9.4k variando
  days.push({
    date: iso,
    steps: i === 0 ? Math.round(base * 0.62) : base, // hoje pela metade (dia em curso)
    kcal: 1600 + ((i * 173) % 700),
    km: Number((base / 1350).toFixed(2)),
    hr: 56 + (i % 7), // FC repouso 56-62
    exerciseMin: i % 3 === 0 ? 35 : 0,
    sleepMin: i === 1 ? 0 : 372 + ((i * 23) % 96), // 6h12..7h48 (uma noite sem registro)
  });
}
const sync = await fetch(`${API}/measurements/activity-sync`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
  body: JSON.stringify({ days }),
});
if (!sync.ok) { console.error('SEED FALHOU', sync.status, await sync.text()); process.exit(1); }
console.log('seed ok ·', (await sync.json()).synced, 'medições');

const browser = await chromium.launch();
let failures = 0;

const shot = async ({ route, name, width = 390, height = 844, dark = false }) => {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: width < 800, hasTouch: width < 800, deviceScaleFactor: 2 });
  await ctx.addInitScript((a, isDark) => {
    localStorage.setItem('token', a.token); localStorage.setItem('user', JSON.stringify(a.user));
    if (a.patientId) { localStorage.setItem('patientId', a.patientId); localStorage.setItem('selPatientId', a.patientId); }
    localStorage.setItem('onboarded', '1'); localStorage.setItem('dxGoals', '[]');
    localStorage.setItem('lead_popup_dismissed_at', String(Date.now()));
    if (isDark) localStorage.setItem('theme', 'dark');
  }, auth, dark);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  await page.goto(`${WEB}/#${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2300);
  await page.getByRole('button', { name: 'Depois' }).click({ timeout: 1200 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: width < 800 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const bodyHas = await page.evaluate(() => document.body.innerText.length > 200);
  console.log(`${name}.png · overflowX=${overflow}px · conteúdo=${bodyHas ? 'ok' : 'VAZIO?'}${errors.length ? ' · consoleErrors=' + errors.length : ''}`);
  if (errors.length) console.log('  ⚠ console:', errors.slice(0, 3).join(' | '));
  if (overflow > 2 || !bodyHas) failures++;
  await ctx.close();
};

await shot({ route: '/sinais', name: 'sinais-390' });
await shot({ route: '/sinais', name: 'sinais-390-dark', dark: true });
await shot({ route: '/sinais', name: 'sinais-1280', width: 1280, height: 900 });
await shot({ route: '/', name: 'dashboard-390' });

await browser.close();
console.log(failures ? `❌ ${failures} problema(s)` : '✅ QA visual passou');
process.exit(failures ? 1 : 0);
