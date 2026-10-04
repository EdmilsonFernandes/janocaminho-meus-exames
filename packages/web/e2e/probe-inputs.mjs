import { chromium, webkit } from '@playwright/test';

const BASE = 'http://127.0.0.1:4011';
const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'edmilson@exemplo.com', password: 'troque123' }) });
const auth = await r.json();

for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch();
  for (const route of ['/#/entrar', '/#/recuperar-senha', '/#/perfil']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, ...(engineName === 'chromium' ? { isMobile: true } : {}) });
    if (route !== '/#/entrar' && route !== '/#/recuperar-senha') {
      await ctx.addInitScript((a) => {
        localStorage.setItem('token', a.token); localStorage.setItem('user', JSON.stringify(a.user));
        if (a.patientId) { localStorage.setItem('patientId', a.patientId); localStorage.setItem('selPatientId', a.patientId); }
        localStorage.setItem('onboarded', '1'); localStorage.setItem('dxGoals', '[]');
      }, auth);
    }
    const page = await ctx.newPage();
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1600);
    await page.getByRole('button', { name: 'Depois' }).click({ timeout: 1200 }).catch(() => {});
    const sizes = await page.evaluate(() =>
      [...document.querySelectorAll('input, select, textarea')].slice(0, 8).map(el => ({
        kind: el.tagName.toLowerCase() + (el.type ? `:${el.type}` : ''),
        fontSize: getComputedStyle(el).fontSize,
        placeholder: (el.placeholder || el.getAttribute('aria-label') || '').slice(0, 26),
      }))
    );
    console.log(`[${engineName}] ${route}: ${sizes.length} campos →`, sizes.map(s => `${s.kind}=${s.fontSize}`).join(', ') || '(nenhum)');
    await ctx.close();
  }
  await browser.close();
}
