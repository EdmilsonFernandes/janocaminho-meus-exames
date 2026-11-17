// Verificação DOM (relay não vê imagem — padrão "DOM > visão" da auditoria 72 telas)
import { chromium } from 'playwright-core';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const URL = 'file:///' + resolve(HERE, 'short05.html').replace(/\\/g, '/');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.evaluate(async () => { await document.fonts.ready; });

const fonts = await page.evaluate(() => ({
  poppins: document.fonts.check('800 40px Poppins'),
  inter: document.fonts.check('700 40px Inter'),
}));
console.log('FONTS', JSON.stringify(fonts));

// [t, id, descrição, exigências]
const checks = [
  [1.2, 's1num', 'S1 número 400'], [1.8, 's1ask', 'S1 pergunta'],
  [4.2, 's2t', 'S2 título'], [5.8, 'cardA', 'S2 card A'], [8.4, 'cardB', 'S2 card B'],
  [13.0, 's3t', 'S3 título'], [21.0, 's3cap', 'S3 caption'], [21.0, 'cline', 'S3 linha'],
  [24.8, 's4t', 'S4 título'], [25.6, 's4pdf', 'S4 PDF'], [28.2, 'phone', 'S4 phone'],
  [29.5, 'phval', 'S4 valor'], [30.9, 's4foot', 'S4 rodapé'],
  [33.4, 's5nome', 'S5 nome'], [34.2, 's5fala', 'S5 fala'], [35.6, 's5bio', 'S5 pill'], [37.2, 's5disc', 'S5 disclaimer'],
];
let fails = 0;
for (const [t, id, desc] of checks) {
  await page.evaluate(tt => window.seek(tt), t);
  const r = await page.evaluate((sel) => {
    const el = document.getElementById(sel);
    if (!el) return { missing: true };
    const cs = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    // opacidade efetiva (cena × elemento)
    let op = parseFloat(cs.opacity);
    let p = el.parentElement;
    while (p) { op *= parseFloat(getComputedStyle(p).opacity); p = p.parentElement; }
    return { op, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height),
      txt: (el.textContent || '').trim().slice(0, 40), dashoff: el.getAttribute('stroke-dashoffset') };
  }, id);
  const inStage = !r.missing && r.x >= -4 && r.y >= -4 && r.x + r.w <= 1084 && r.y + r.h <= 1924;
  const ok = !r.missing && r.op > 0.85 && inStage && r.w > 0;
  if (!ok) fails++;
  console.log(`${ok ? 'OK ' : 'FAIL'} t=${t} ${desc}: op=${(r.op ?? -1).toFixed(2)} rect=${r.x},${r.y} ${r.w}x${r.h}${r.missing ? ' (missing!)' : ''}${!inStage && !r.missing ? ' (FORA DO PALCO!)' : ''}`);
}
// sobreposição indevida: cards A/B e título×cards
await page.evaluate(tt => window.seek(tt), 9);
const overlap = await page.evaluate(() => {
  const R = (id) => document.getElementById(id).getBoundingClientRect();
  const ov = (a, b) => !(a.bottom <= b.top + 6 || b.bottom <= a.top + 6);
  return { cardAxB: ov(R('cardA'), R('cardB')), tituloXcardA: ov(R('s2t'), R('cardA')) };
});
console.log('OVERLAP', JSON.stringify(overlap), (overlap.cardAxB || overlap.tituloXcardA) ? '⚠️ CONFLITO' : 'ok');
await browser.close();
console.log(fails === 0 ? 'VERIFY_OK' : `VERIFY_FAIL (${fails})`);
process.exit(fails === 0 && !overlap.cardAxB && !overlap.tituloXcardA ? 0 : 1);
