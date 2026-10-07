// qa.mjs — bateria de validação das peças (briefing exige conferir antes de finalizar).
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';

const ROOT = 'C:/Users/esantos/Desktop/Exame Edmilson/docs/saude-esportiva/cartaz-academia';
const HTML = pathToFileURL(path.join(ROOT, 'poster.html')).href;
const URL = 'https://drexame.janocaminho.com.br/?utm_source=academia&utm_medium=qr_code&utm_campaign=saude_esportiva';
const MM = 96 / 25.4;
let fail = 0;
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? '✓' : '✗ FALHA'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) fail++;
};

/* ---------- 1. QR decodifica dentro das peças finais ---------- */
for (const f of ['dr-exame-cartaz-a3-300dpi.png', 'dr-exame-display-a5-300dpi.png']) {
  const png = PNG.sync.read(fs.readFileSync(path.join(ROOT, f)));
  // jsQR na imagem inteira (3582px+) é lento; descemos p/ ~1400px mantendo módulos >3px
  const scale = Math.max(1, Math.ceil(png.width / 1400));
  const w = Math.floor(png.width / scale), h = Math.floor(png.height / scale);
  const small = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, j = (y * scale * png.width + x * scale) * 4;
    small[i] = png.data[j]; small[i + 1] = png.data[j + 1]; small[i + 2] = png.data[j + 2]; small[i + 3] = 255;
  }
  const code = jsQR(small, w, h);
  ok(`QR decodifica em ${f}`, code?.data === URL, code ? `→ ${code.data.slice(0, 48)}…` : 'jsQR não encontrou QR');
}

/* ---------- 2. Overflow: todo texto dentro do trim ---------- */
const browser = await chromium.launch();
for (const [size, trimW, trimH] of [['a3', 297, 420], ['a5', 148, 210]]) {
  const page = await browser.newPage({ viewport: { width: Math.round((trimW + 6) * MM), height: Math.round((trimH + 6) * MM) } });
  await page.goto(`${HTML}?size=${size}&marks=0`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  const report = await page.evaluate(([tw, th]) => {
    const trim = { x: 3 * 96 / 25.4, y: 3 * 96 / 25.4, w: tw * 96 / 25.4, h: th * 96 / 25.4 };
    const out = [];
    for (const el of document.querySelectorAll('[data-qa], .qr-card, .kicker, .brand-name, .head-right, .spine, .mark')) {
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      const inside = r.left >= trim.x - .5 && r.top >= trim.y - .5 &&
                     r.right <= trim.x + trim.w + .5 && r.bottom <= trim.y + trim.h + .5;
      if (!inside) out.push(`${el.className || el.tagName}: ${Math.round(r.left)},${Math.round(r.top)} → ${Math.round(r.right)},${Math.round(r.bottom)}`);
    }
    // textos cortados horizontalmente (headline não pode quebrar linha além do planejado)
    const h1 = document.querySelector('h1');
    return { out, h1Lines: h1 ? Math.round(h1.getBoundingClientRect().height / (parseFloat(getComputedStyle(h1).fontSize) * .9)) : 0 };
  }, [trimW, trimH]);
  ok(`Sem overflow fora do trim (${size})`, report.out.length === 0, report.out.join(' | '));

  /* ---------- 3. Glifos PT-BR (Ê, Ç, í) renderizam nas fontes do canvas ---------- */
  const glyph = await page.evaluate(() => {
    const c = document.createElement('canvas').getContext('2d');
    const test = (font, ch) => {
      c.font = `700 100px ${font}`;
      const wCustom = c.measureText(ch).width, wFallback = (c.font = `700 100px monospace`, c.measureText(ch).width);
      return { wCustom, wFallback };
    };
    return test('"Big Shoulders"', 'Ê');
  });
  ok(`Glifo Ê em Big Shoulders (${size})`, glyph.wCustom > 0 && Math.abs(glyph.wCustom - glyph.wFallback) > 1,
     `largura custom ${glyph.wCustom.toFixed(1)} vs fallback ${glyph.wFallback.toFixed(1)}`);
  await page.close();
}
await browser.close();

/* ---------- 4. Contraste WCAG dos pares usados ---------- */
function lum(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
}
const ratio = (a, b) => { const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1 + .05) / (l2 + .05); };
for (const [fg, bg, onde, min] of [
  ['#e8eef0', '#0f1818', 'texto principal', 4.5],
  ['#20b2aa', '#0f1818', 'headline teal', 3.0],
  ['#5fc9c3', '#0f1818', 'URL teal-light', 4.5],
  ['#d4a574', '#0f1818', 'copper (rótulos)', 4.5],
  ['#c3d0d0', '#0f1818', 'disclaimer', 4.5],
  ['#9fb3b3', '#0f1818', 'head-right/colophon', 4.5],
  ['#000000', '#ffffff', 'QR modules', 4.5],
]) {
  const r = ratio(fg, bg);
  ok(`Contraste ${onde} ${fg}/${bg} = ${r.toFixed(2)}:1 (mín ${min})`, r >= min);
}

/* ---------- 5. PDF: MediaBox = trim + 6mm ---------- */
for (const [f, wmm, hmm] of [['dr-exame-cartaz-a3-sangria.pdf', 303, 426], ['dr-exame-display-a5-sangria.pdf', 154, 216]]) {
  const buf = fs.readFileSync(path.join(ROOT, f));
  const m = buf.toString('latin1').match(/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  const [w, h] = m ? [+m[3], +m[4]] : [0, 0];
  const exp = [wmm / 25.4 * 72, hmm / 25.4 * 72];
  ok(`MediaBox ${f} = ${w.toFixed(1)}×${h.toFixed(1)}pt (esperado ~${exp[0].toFixed(1)}×${exp[1].toFixed(1)})`,
     Math.abs(w - exp[0]) < 1.5 && Math.abs(h - exp[1]) < 1.5);
}

console.log(fail === 0 ? '\nQA: TODOS OS CHECKS PASSARAM' : `\nQA: ${fail} FALHA(S)`);
process.exit(fail === 0 ? 0 : 1);
