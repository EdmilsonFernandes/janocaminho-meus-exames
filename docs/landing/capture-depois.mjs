// Captura a landing LOCAL (depois) em desktop + mobile p/ comparação before/after.
// Uso: node docs/landing/capture-depois.mjs [url] — default http://192.168.15.30:5173/
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const TARGET = process.argv[2] || 'http://192.168.15.30:5173/';
const OUT = fileURLToPath(new URL('./depois/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
for (const [name, vp] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 160)));
  await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4500);
  await page.screenshot({ path: `${OUT}depois-${name}.png`, fullPage: true });
  // Prova textual das mudanças (DOM > visão): headline + badge + pilares do CTA
  const h1 = await page.locator('h1').first().innerText().catch(() => '');
  const badge = await page.getByText('A IA lê o seu laudo', { exact: false }).count();
  const pilares = await page.getByText('A IA educa, não diagnostica', { exact: false }).count();
  console.log(`✓ ${name} | erros:${errors.length} | h1="${h1.replace(/\n/g, ' ')}" | badge:${badge} | pilares:${pilares}`);
  if (errors.length) console.log('  ', errors.slice(0, 4).join('\n   '));
  await ctx.close();
}
await browser.close();
console.log('DONE →', OUT);
