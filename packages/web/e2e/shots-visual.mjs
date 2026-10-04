import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:4011';
const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'edmilson@exemplo.com', password: 'troque123' }) });
const auth = await r.json();
const OUT = 'e2e/screenshots/audit/visual';

const browser = await chromium.launch();

async function shot(route, name, { width = 390, height = 844, dark = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: width < 800, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.addInitScript((a) => {
    localStorage.setItem('token', a.token); localStorage.setItem('user', JSON.stringify(a.user));
    if (a.patientId) { localStorage.setItem('patientId', a.patientId); localStorage.setItem('selPatientId', a.patientId); }
    localStorage.setItem('onboarded', '1'); localStorage.setItem('dxGoals', '[]'); localStorage.setItem('meus_exames_libras', '0');
    localStorage.setItem('lead_popup_dismissed_at', String(Date.now()));
  }, auth);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1900);
  await page.getByRole('button', { name: 'Depois' }).click({ timeout: 1200 }).catch(() => {});
  await page.waitForTimeout(300);
  if (dark) {
    // theme via react-admin store (PatientSwitcher toggle usa useStore('theme'))
    const ok = await page.evaluate(() => {
      try { localStorage.setItem('theme', 'dark'); } catch {}
      return true;
    });
    if (ok) { await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1900); await page.getByRole('button', { name: 'Depois' }).click({ timeout: 1200 }).catch(() => {}); }
  }
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const darkApplied = dark ? await page.evaluate(() => getComputedStyle(document.body).color.slice(0, 15)) : null;
  console.log(`${name}.png ${darkApplied ? '· bodycolor=' + darkApplied : ''}`);
  await ctx.close();
}

fs: {
  const { default: fs } = await import('node:fs');
  fs.mkdirSync(OUT, { recursive: true });
}

await shot('/', 'dashboard-light-390');
await shot('/', 'dashboard-dark-390', { dark: true });
await shot('/chat', 'chat-light-390');
await shot('/exams', 'exams-light-390');
await shot('/planos', 'planos-light-390');
await shot('/', 'dashboard-landscape-844x390', { width: 844, height: 390 });
await shot('/chat', 'chat-landscape-844x390', { width: 844, height: 390 });
await shot('/exams', 'exams-320', { width: 320, height: 700 });
await shot('/', 'dashboard-320', { width: 320, height: 700 });
await shot('/landing', 'landing-light-390');
await shot('/entrar', 'login-light-390');
await browser.close();
console.log('VISUAL SHOTS DONE');
