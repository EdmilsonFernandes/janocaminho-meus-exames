// Captura a landing de PROD (antes) em desktop + mobile p/ comparação before/after.
// Uso: node docs/landing/capture-antes.mjs [url] — default https://drexame.janocaminho.com.br/
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const TARGET = process.argv[2] || 'https://drexame.janocaminho.com.br/';
const OUT = fileURLToPath(new URL('./antes/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
for (const [name, vp] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4500); // lazy sections + animações
  await page.screenshot({ path: `${OUT}antes-${name}.png`, fullPage: true });
  console.log(`✓ ${name} (${errors.length} erros de console)`);
  if (errors.length) console.log('  ', errors.slice(0, 5).join('\n   '));
  await ctx.close();
}
await browser.close();
console.log('DONE →', OUT);
