import { chromium } from '@playwright/test';
const BASE = 'http://localhost:5176';
const OUT = 'C:/tmp/sportscritique/shots';
const nl = String.fromCharCode(10);
const log = (...a) => console.log('[m]', ...a);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.goto(BASE + '/landing#/entrar', { waitUntil: 'networkidle' });
const pwdGate = page.getByRole('button', { name: /senha/i }).first();
if (await pwdGate.count()) { await pwdGate.click(); await page.waitForTimeout(400); }
await page.locator('input[type=email]').first().fill('edmilson@exemplo.com');
await page.locator('input[type=password]').first().fill('troque123');
await page.locator('button[type=submit]').first().click();
await page.waitForTimeout(4000);
for (let i = 0; i < 4; i++) { try { const dl = page.locator('[role=dialog]').last(); if (!(await dl.count())) break; const b = dl.getByRole('button', { name: /Pular|Agora n/i }).first(); if (await b.count()) await b.click({ timeout: 2000 }).catch(() => {}); await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(600); } catch (e) { break; } }
await page.goto(BASE + '/landing#/', { waitUntil: 'networkidle' });
await page.waitForSelector('text=Modo Esporte', { timeout: 15000 });
await page.waitForTimeout(3000);

// geometry helper
const geo = (sel) => page.locator(sel).first().evaluate((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { w: Math.round(r.width), h: Math.round(r.height), fs: cs.fontSize, fw: cs.fontWeight }; });

// persona card metrics
await page.locator('text=Modo Esporte').first().evaluate((e) => { const c = e.closest('.MuiCard-root'); if (c) c.setAttribute('data-p', '1'); });
log('persona 1280:', JSON.stringify(await geo('[data-p="1"]')));
const personaLines = await page.locator('[data-p="1"]').evaluate((e) => e.innerText.split(
).filter((t) => t.trim()).length);
log('persona text lines 1280:', personaLines);

// stats tiles
const tileBoxes = await page.locator('[aria-label*=" — ver"], [aria-label*="— ver"]').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height), txt: e.textContent.slice(0, 30) }; }));
log('stat tiles boxes:', JSON.stringify(tileBoxes));

// marker card 1: outerHTML compact + metrics
const m1 = await page.locator('[aria-label*="Ver tendência"]').first();
log('marker1 box:', JSON.stringify(await geo('[aria-label*="Ver tendência"]')));
const html = await m1.evaluate((e) => e.outerHTML.replace(/\s+/g, ' ').slice(0, 3000));
log('marker1 html:', html.slice(0, 2600));
// ruler geometry inside marker1
const ruler = await m1.evaluate((e) => { const r = e.querySelector('[role=img]'); if (!r) return 'NO RULER'; const rr = r.getBoundingClientRect(); const bands = Array.from(r.querySelectorAll(':scope > div > div')).map((b) => { const bb = b.getBoundingClientRect(); return { left: Math.round(bb.x - rr.x), w: Math.round(bb.width), h: Math.round(bb.height) }; }); return { w: Math.round(rr.width), h: Math.round(rr.height), bands }; });
log('marker1 ruler:', JSON.stringify(ruler));

// marker WITH ruler (find one whose aria-label contains 'Acima'/'Abaixo'/'Na referência' with range)
const withRuler = page.locator('[aria-label*="Na referência. Ver"], [aria-label*="Acima da referência. Ver"], [aria-label*="Abaixo da referência. Ver"]').first();
if (await withRuler.count()) {
  const r2 = await withRuler.evaluate((e) => { const el = e.querySelector('[role=img]'); if (!el) return 'NO RULER'; const rr = el.getBoundingClientRect(); const bands = Array.from(el.querySelectorAll(':scope > div > div')).map((b) => { const bb = b.getBoundingClientRect(); return { left: Math.round(bb.x - rr.x), w: Math.round(bb.width), h: Math.round(bb.height) }; }); return { w: Math.round(rr.width), h: Math.round(rr.height), bands, label: el.getAttribute('aria-label').slice(0, 120) }; });
  log('marker WITH ruler:', JSON.stringify(r2));
  await withRuler.screenshot({ path: OUT + '/m2-ruler-card.png' }).catch(() => {});
} else log('no marker with ruler+range found');

// ── 320px: ruler + legend density ──
const p2 = await ctx.newPage(); await p2.setViewportSize({ width: 320, height: 700 });
await p2.goto(BASE + '/landing#/', { waitUntil: 'networkidle' });
await p2.waitForSelector('text=Modo Esporte', { timeout: 15000 });
await p2.waitForTimeout(3000);
const m320 = await p2.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('[aria-label*="Ver tendência"]'));
  const out = [];
  for (const c of cards.slice(0, 6)) {
    const r = c.getBoundingClientRect();
    const ruler = c.querySelector('[role=img]');
    const legend = Array.from(c.querySelectorAll('.MuiStack-root')).pop();
    const lbls = Array.from(c.querySelectorAll('span')).filter((s) => /Ref\. laboratório/.test(s.textContent));
    out.push({
      cardW: Math.round(r.width), cardH: Math.round(r.height),
      rulerW: ruler ? Math.round(ruler.getBoundingClientRect().width) : null,
      rulerBands: ruler ? ruler.querySelectorAll('div > div').length : 0,
      refLabelClipped: lbls.length ? (lbls[0].scrollWidth > lbls[0].clientWidth + 2) : null,
      cardLabel: c.getAttribute('aria-label').slice(0, 40),
    });
  }
  return out;
});
console.log('[m] cards 320:', JSON.stringify(m320, null, 1));
// persona 320 height
const p320 = await p2.locator('text=Modo Esporte').first().evaluate((e) => { const c = e.closest('.MuiCard-root'); return c ? { h: Math.round(c.getBoundingClientRect().height), lines: c.innerText.split(String.fromCharCode(10)).filter((t) => t.trim()).length } : null; });
console.log('[m] persona 320:', JSON.stringify(p320));
await p2.locator('text=Modo Esporte').first().evaluate((e) => { const c = e.closest('.MuiCard-root'); if (c) c.setAttribute('data-p', '1'); });
await p2.locator('[data-p="1"]').screenshot({ path: OUT + '/m3-persona-320.png' }).catch(() => {});
const firstCard320 = p2.locator('[aria-label*="Ver tendência"]').first();
await firstCard320.screenshot({ path: OUT + '/m4-marker-320.png' }).catch(() => {});
await p2.screenshot({ path: OUT + '/m5-dash-320-full.png', fullPage: true });
await p2.close();

// ── archetype switch via API: corrida ──
await page.evaluate(async () => {
  const t = localStorage.getItem('ra.token') || localStorage.getItem('token') || Object.entries(localStorage).find(([k]) => k.toLowerCase().includes('token'))?.[1];
  const r = await fetch('/api/sports/profile', { headers: { Authorization: 'Bearer ' + (t || '').replace(/"/g, '') } });
  const d = await r.json();
  const cc = (d.profile && d.profile.collectionContext) || {};
  cc.level = cc.level || null; cc.hormonalContext = cc.hormonalContext || 'trt';
  await fetch('/api/sports/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (t || '').replace(/"/g, '') }, body: JSON.stringify({ modality: 'Corrida/Ciclismo', collectionContext: cc }) });
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('text=Modo Esporte', { timeout: 15000 });
await page.waitForTimeout(3500);
const chipsC = await page.locator('.MuiChip-root').allTextContents();
console.log('[m] chips CORRIDA (api):', JSON.stringify(chipsC.filter((c) => /\(/.test(c)).slice(0, 10)));
const tilesC = await page.locator('[aria-label*="— ver"]').allTextContents();
console.log('[m] tiles CORRIDA:', JSON.stringify(tilesC));
const kick = await page.locator('text=Modo Esporte').first().evaluate((e) => { const c = e.closest('.MuiCard-root'); return c ? c.innerText.split(String.fromCharCode(10)).slice(0, 6).join(' | ') : 'NO'; });
console.log('[m] persona CORRIDA head:', kick);
await page.screenshot({ path: OUT + '/m6-dash-corrida-light-1280.png', fullPage: true });
// restore musculação
await page.evaluate(async () => {
  const t = localStorage.getItem('ra.token') || localStorage.getItem('token') || Object.entries(localStorage).find(([k]) => k.toLowerCase().includes('token'))?.[1];
  const r = await fetch('/api/sports/profile', { headers: { Authorization: 'Bearer ' + (t || '').replace(/"/g, '') } });
  const d = await r.json();
  const cc = (d.profile && d.profile.collectionContext) || {};
  await fetch('/api/sports/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (t || '').replace(/"/g, '') }, body: JSON.stringify({ modality: 'Musculação/Hipertrofia', collectionContext: cc }) });
});
console.log('[m] restored');
await browser.close();
