/** Libras no PROD (página pública): opt-out tem que esconder o widget. */
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.addInitScript(() => { localStorage.setItem('meus_exames_libras', '0'); });
await p.goto('https://drexame.janocaminho.com.br/#/entrar', { waitUntil: 'domcontentloaded', timeout: 45000 });
await p.waitForTimeout(6000);
const visible = await p.evaluate(() => {
  const els = Array.from(document.querySelectorAll('[vw], [class*="vp-"], [class*="vw-"], [class*="vpw-"]'));
  return els.filter((e) => { const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && e.getClientRects().length > 0; }).map((e) => `${e.tagName}.${e.className}`).slice(0, 6);
});
console.log('libras visível com opt-out?', visible.length ? `SIM — BUG: ${JSON.stringify(visible)}` : 'não visível');
await p.screenshot({ path: 'design-lab/qa/libras-prod-optout.png' });

// Sem localStorage nenhum (1ª visita — default tem que ser OFF)
const p2 = await b.newPage({ viewport: { width: 390, height: 844 } });
await p2.goto('https://drexame.janocaminho.com.br/#/entrar', { waitUntil: 'domcontentloaded', timeout: 45000 });
await p2.waitForTimeout(6000);
const visible2 = await p2.evaluate(() => {
  const els = Array.from(document.querySelectorAll('[vw], [class*="vp-"], [class*="vw-"], [class*="vpw-"]'));
  return els.filter((e) => { const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && e.getClientRects().length > 0; }).length;
});
console.log('libras visível na 1ª visita (default)?', visible2 > 0 ? `SIM — ${visible2} elementos` : 'não visível');
await p2.screenshot({ path: 'design-lab/qa/libras-prod-default.png' });
await b.close();
