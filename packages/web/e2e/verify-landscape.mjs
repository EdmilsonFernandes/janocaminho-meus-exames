import { chromium } from '@playwright/test';
const BASE = 'http://127.0.0.1:4011';
const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'edmilson@exemplo.com', password: 'troque123' }) });
const auth = await r.json();
const browser = await chromium.launch();
for (const [route, name] of [['/', 'dashboard'], ['/chat', 'chat'], ['/exams', 'exams'], ['/planos', 'planos']]) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
  await ctx.addInitScript((a) => {
    localStorage.setItem('token', a.token); localStorage.setItem('user', JSON.stringify(a.user));
    if (a.patientId) { localStorage.setItem('patientId', a.patientId); localStorage.setItem('selPatientId', a.patientId); }
    localStorage.setItem('onboarded', '1'); localStorage.setItem('dxGoals', '[]');
  }, auth);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: 'Depois' }).click({ timeout: 1200 }).catch(() => {});
  const res = await page.evaluate(() => {
    const de = document.documentElement;
    const nav = document.querySelector('nav');
    const navRect = nav?.getBoundingClientRect();
    // conteúdo alcança o fim?
    const se = document.scrollingElement || de;
    se.scrollTo({ top: se.scrollHeight, behavior: 'instant' });
    return new Promise((resolve) => setTimeout(() => {
      const atEnd = se.scrollTop + se.clientHeight >= se.scrollHeight - 3;
      se.scrollTo({ top: 0, behavior: 'instant' });
      resolve({ docOvX: de.scrollWidth - de.clientWidth, atEnd, navVisible: navRect ? Math.round(navRect.height) > 0 : false });
    }, 600));
  });
  console.log(`[landscape 844x390] ${name.padEnd(10)}`, JSON.stringify(res));
  await ctx.close();
}
await browser.close();
