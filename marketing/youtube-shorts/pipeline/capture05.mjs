// Captura frame a frame do short05.html (timeline determinística via window.seek)
// Uso: node capture05.mjs   (requer http.server na 8777 servindo esta pasta)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRAMES = resolve(HERE, 'frames05');
mkdirSync(FRAMES, { recursive: true });

const FPS = 24;
const URL = 'file:///' + resolve(HERE, 'short05.html').replace(/\\/g, '/') + '?t=0';

const t0 = Date.now();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.evaluate(async () => {
  await document.fonts.ready;
  await Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; })));
});
const DUR = await page.evaluate(() => window.DUR);
const total = Math.round(DUR * FPS);
console.log(`DUR=${DUR}s frames=${total}`);
for (let f = 0; f < total; f++) {
  const t = f / FPS;
  await page.evaluate(tt => window.seek(tt), t);
  await page.screenshot({ path: resolve(FRAMES, 'f' + String(f + 1).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 92 });
  if (f % 96 === 0) console.log(`frame ${f + 1}/${total} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
await browser.close();
console.log(`CAPTURE_OK ${total} frames em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
