import { chromium, webkit } from '@playwright/test';
const BASE = 'http://127.0.0.1:4011';
const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'edmilson@exemplo.com', password: 'troque123' }) });
const auth = await r.json();
for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch();
  for (const w of [320, 390]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, hasTouch: true });
    await ctx.addInitScript((a) => {
      localStorage.setItem('token', a.token); localStorage.setItem('user', JSON.stringify(a.user));
      if (a.patientId) { localStorage.setItem('patientId', a.patientId); localStorage.setItem('selPatientId', a.patientId); }
      localStorage.setItem('onboarded', '1'); localStorage.setItem('dxGoals', '[]');
    }, auth);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/#/chat`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1700);
    const res = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const send = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '') === 'Enviar');
      const input = document.querySelector('#main-content input');
      const sr = send?.getBoundingClientRect();
      const ir = input?.getBoundingClientRect();
      return { vw, sendRight: sr ? Math.round(sr.right) : null, sendVisible: !!sr && sr.right <= vw + 1, inputRight: ir ? Math.round(ir.right) : null };
    });
    console.log(`[${engineName} ${w}]`, JSON.stringify(res));
    await ctx.close();
  }
  await browser.close();
}
