import { chromium } from '@playwright/test';
const BASE = 'http://localhost:5176';
const log = (...a) => console.log('[r]', ...a);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 320, height: 700 } });
const page = await ctx.newPage();
await page.goto(BASE + '/landing#/entrar', { waitUntil: 'networkidle' });
const pw = page.getByRole('button', { name: /senha/i }).first();
if (await pw.count()) { await pw.click(); await page.waitForTimeout(400); }
await page.locator('input[type=email]').first().fill('edmilson@exemplo.com');
await page.locator('input[type=password]').first().fill('troque123');
await page.locator('button[type=submit]').first().click();
await page.waitForTimeout(4500);
for (let i = 0; i < 4; i++) { try { const dl = page.locator('[role=dialog]').last(); if (!(await dl.count())) break; const b = dl.getByRole('button', { name: /Pular|Agora n/i }).first(); if (await b.count()) await b.click({ timeout: 2000 }).catch(() => {}); await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(600); } catch (e) { break; } }
await page.goto(BASE + '/landing#/', { waitUntil: 'networkidle' });
await page.waitForSelector('text=Modo Esporte', { timeout: 15000 });
await page.waitForTimeout(3500);
const data = await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('[aria-label*="Ver tendência"]'));
  const out = { n: cards.length, rulerCards: [], first: null };
  for (const c of cards.slice(0, 12)) {
    const r = c.getBoundingClientRect();
    const ruler = c.querySelector('[role=img]');
    if (!ruler) continue;
    const rr = ruler.getBoundingClientRect();
    const track = (ruler.firstElementChild || ruler).getBoundingClientRect();
    const bands = Array.from((track && track.children) || []).map((b) => { const bb = b.getBoundingClientRect(); return { x: Math.round(bb.x), w: Math.round(bb.width), h: Math.round(bb.height) }; });
    const labels = Array.from(ruler.querySelectorAll('span')).map((s) => { const b = s.getBoundingClientRect(); return { t: s.textContent.trim().slice(0, 24), x: Math.round(b.x), w: Math.round(b.width), clipped: s.scrollWidth > s.clientWidth + 1 }; });
    // overlap check between adjacent labels
    let overlap = false;
    for (let i = 1; i < labels.length; i++) if (labels[i].x < labels[i - 1].x + labels[i - 1].w - 1) overlap = true;
    out.rulerCards.push({ cardW: Math.round(r.width), rulerW: Math.round(rr.width), trackW: Math.round(track.width), bands, labels, labelOverlap: overlap, h: Math.round(r.height) });
    if (!out.first) out.first = c.getAttribute('aria-label').slice(0, 50);
  }
  return out;
});
console.log('[r] cards:', data.n, 'with ruler:', data.rulerCards.length, 'first:', data.first);
for (const rc of data.rulerCards.slice(0, 3)) console.log('[r] card', JSON.stringify(rc));
// persona 390
const p390 = await ctx.newPage(); await p390.setViewportSize({ width: 390, height: 844 });
await p390.goto(BASE + '/landing#/', { waitUntil: 'networkidle' }); await p390.waitForTimeout(3500);
const pd = await p390.evaluate(() => {
  const el = Array.from(document.querySelectorAll('*')).find((e) => e.children.length === 0 && /Modo Esporte/.test(e.textContent || ''));
  const card = el && el.closest('.MuiCard-root');
  if (!card) return null;
  const r = card.getBoundingClientRect();
  const chips = card.querySelectorAll('.MuiChip-root').length;
  return { h: Math.round(r.height), w: Math.round(r.width), chips, lines: card.innerText.split(String.fromCharCode(10)).filter((t) => t.trim()).length, viewportH: window.innerHeight, pctOfViewport: Math.round((r.height / window.innerHeight) * 100) };
});
console.log('[r] persona 390:', JSON.stringify(pd));
await browser.close();
