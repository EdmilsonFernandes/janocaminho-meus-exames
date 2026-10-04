import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:4011';
const API = `${BASE}/api`;

const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'edmilson@exemplo.com', password: 'troque123' }) });
const auth = await r.json();

const browser = await chromium.launch();
for (const route of ['/', '/exams', '/evolucao', '/tendencias']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript((a) => {
    localStorage.setItem('token', a.token); localStorage.setItem('user', JSON.stringify(a.user));
    if (a.patientId) { localStorage.setItem('patientId', a.patientId); localStorage.setItem('selPatientId', a.patientId); }
  }, auth);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const out = await page.evaluate(async () => {
    const se = document.scrollingElement || document.documentElement;
    const snap = () => ({ sh: se.scrollHeight, st: se.scrollTop, ch: se.clientHeight, bodySh: document.body.scrollHeight });
    const before = snap();
    se.scrollTop = se.scrollHeight;
    await new Promise(res => setTimeout(res, 350));
    const afterJump = snap();
    await new Promise(res => setTimeout(res, 700));
    const after7 = snap();
    // quem está no fundo do documento? (maior bottom visível no momento do fim)
    let bottomEls = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.position === 'sticky') continue;
      const r2 = el.getBoundingClientRect();
      if (r2.height < 2) continue;
      bottomEls.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 70), bottom: Math.round(r2.bottom), pos: cs.position, h: Math.round(r2.height) });
    }
    bottomEls = bottomEls.sort((a, b) => b.bottom - a.bottom).slice(0, 6);
    // algum elemento com position fixed cuja altura soma no scrollHeight? (absolute no body)
    const absBottom = [];
    for (const el of document.querySelectorAll('body > *')) {
      const cs = getComputedStyle(el);
      const r2 = el.getBoundingClientRect();
      absBottom.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 50), pos: cs.position, bottom: Math.round(r2.bottom), display: cs.display, vis: cs.visibility });
    }
    return { before, afterJump, after7, bottomEls, absBottom };
  });
  console.log(`\n=== ${route} ===`);
  console.log(JSON.stringify(out, null, 1).slice(0, 2200));
  await ctx.close();
}
await browser.close();
