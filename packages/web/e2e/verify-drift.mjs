import { chromium, webkit } from '@playwright/test';
const BASE = 'http://127.0.0.1:4011';
const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'edmilson@exemplo.com', password: 'troque123' }) });
const auth = await r.json();
for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await ctx.addInitScript((a) => {
    localStorage.setItem('token', a.token); localStorage.setItem('user', JSON.stringify(a.user));
    if (a.patientId) { localStorage.setItem('patientId', a.patientId); localStorage.setItem('selPatientId', a.patientId); }
    localStorage.setItem('onboarded', '1'); localStorage.setItem('dxGoals', '[]');
  }, auth);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/evolucao`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const res = await page.evaluate(() => {
    const de = document.documentElement, b = document.body;
    de.scrollLeft = 60; b.scrollLeft = 60;
    try { window.scrollTo(60, 0); } catch {}
    return { deScrollLeft: de.scrollLeft, bScrollLeft: b.scrollLeft, deOvX: getComputedStyle(de).overflowX, bOvX: getComputedStyle(b).overflowX };
  });
  console.log(`[${engineName}] drift →`, JSON.stringify(res));
  await ctx.close(); await browser.close();
}
