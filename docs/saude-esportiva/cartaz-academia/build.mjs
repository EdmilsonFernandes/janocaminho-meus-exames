// build.mjs — renderiza as peças: PDF c/ sangria 3mm + marcas de corte, e PNG 300dpi full-bleed.
// Uso: node build.mjs  (requires playwright do monorepo raiz)
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = 'C:/Users/esantos/Desktop/Exame Edmilson/docs/saude-esportiva/cartaz-academia';
const HTML = pathToFileURL(path.join(ROOT, 'poster.html')).href;
const MM = 96 / 25.4;                 // 1mm em px CSS
const DPI = 300;

const SPECS = [
  { size: 'a3', trimW: 297, trimH: 420, out: 'dr-exame-cartaz-a3'  },
  { size: 'a5', trimW: 148, trimH: 210, out: 'dr-exame-display-a5' },
];

const browser = await chromium.launch();
for (const s of SPECS) {
  const w = s.trimW + 6, h = s.trimH + 6;             // trim + 3mm sangria/lado
  const page = await browser.newPage({
    viewport: { width: Math.round(w * MM), height: Math.round(h * MM) },
    deviceScaleFactor: DPI / 96,
  });

  // PDF: com marcas de corte
  await page.goto(`${HTML}?size=${s.size}&marks=1`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.pdf({
    path: path.join(ROOT, `${s.out}-sangria.pdf`),
    width: `${w}mm`, height: `${h}mm`,
    printBackground: true, pageRanges: '1',
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });

  // PNG: arte full-bleed 300dpi, sem marcas (uso digital/verificação QR)
  await page.goto(`${HTML}?size=${s.size}&marks=0`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.screenshot({
    path: path.join(ROOT, `${s.out}-300dpi.png`),
    clip: { x: 0, y: 0, width: Math.round(w * MM), height: Math.round(h * MM) },
  });

  const pxW = Math.round(w * MM * DPI / 96), pxH = Math.round(h * MM * DPI / 96);
  console.log(`${s.out}: PDF ${w}x${h}mm (trim ${s.trimW}x${s.trimH} + 3mm) · PNG ~${pxW}x${pxH}px @${DPI}dpi`);
  await page.close();
}
await browser.close();
console.log('BUILD OK');
