// fontstress-audit.mjs — valida que o layout NÃO quebra com fonte ampliada
// (simula o textZoom do Android: multiplica o font-size computado de TODOS os
// elementos, que é o que a escala de fonte do sistema faz num WebView com px).
// Também mede overflow horizontal e texto cortado SEM ellipsis (clipping real).
//
// Uso: node e2e/fontstress-audit.mjs
// Precisa: dev server (4001) + vite (5173) rodando; seed edmilson@exemplo.com.
// Screenshots: .playwright-mcp/fontstress-<tela>-<escala>.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5173';
const API = process.env.AUDIT_API || 'http://127.0.0.1:4001/api';
const SCALES = [1, 1.3, 1.5]; // normal · "fonte grande" do Android (~130%) · máx (~150%)
const SHOT_DIR = '.playwright-mcp';

const login = async () => {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'edmilson@exemplo.com', password: 'troque123' }),
  });
  if (!r.ok) throw new Error(`login falhou: ${r.status}`);
  return (await r.json()).token;
};

/** Multiplica o font-size computado de todos os elementos (uma vez por load). */
const scaleFonts = (page, mult) => page.evaluate((m) => {
  let n = 0;
  document.querySelectorAll('body *').forEach((el) => {
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs > 0) { el.style.fontSize = `${(fs * m).toFixed(2)}px`; n += 1; }
  });
  return n;
}, mult);

/** hscroll (página mais larga que a viewport) + texto clipped SEM ellipsis. */
const audit = (page) => page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const docW = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  const clipped = [];
  document.querySelectorAll('body *').forEach((el) => {
    if (el.children.length > 0 || !el.textContent || !el.textContent.trim()) return;
    if (el instanceof SVGElement) return; // svg escalado por font-size reporta scrollWidth absurdo — não é texto
    const cs = getComputedStyle(el);
    if (cs.textOverflow === 'ellipsis') return; // truncagem controlada (design)
    if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 3) {
      const cls = String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).split(' ').slice(0, 2).join('.');
      clipped.push(`${el.textContent.trim().slice(0, 40)} [${el.scrollWidth}>${el.clientWidth}px @${el.tagName}${cls ? '.' + cls : ''}]`);
    }
  });
  // elemento larguísimo (culpado do hscroll), se houver
  let widest = null;
  if (docW > vw + 2) {
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!widest || r.width > widest.width) widest = { tag: el.tagName, cls: String(el.className).slice(0, 60), width: Math.round(r.width) };
    });
  }
  return { vw, docW, hscroll: docW > vw + 2, widest, clipped: clipped.slice(0, 8) };
});

const run = async () => {
  mkdirSync(SHOT_DIR, { recursive: true });
  const token = await login();
  const browser = await chromium.launch();
  const results = [];
  const screens = [
    { name: 'landing', hash: '#/', auth: false },
    { name: 'dashboard', hash: '#/', auth: true },
    { name: 'profile', hash: '#/profile', auth: true },
  ];
  for (const s of screens) {
    for (const scale of SCALES) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      if (s.auth) await ctx.addInitScript((t) => localStorage.setItem('token', t), token);
      const page = await ctx.newPage();
      await page.goto(`${BASE}/${s.hash}`, { waitUntil: 'commit', timeout: 20000 });
      await page.waitForTimeout(3500); // app boot + fetches (vite HMR segura o domcontentloaded)
      if (scale !== 1) await scaleFonts(page, scale);
      await page.waitForTimeout(350); // reflow
      const a = await audit(page);
      try { await page.screenshot({ path: `${SHOT_DIR}/fontstress-${s.name}-x${scale}.png`, timeout: 8000 }); }
      catch { /* vite HMR pendura document.fonts.ready — o dado do audit é o veredito */ }
      results.push({ tela: s.name, escala: `×${scale}`, ...a });
      await ctx.close();
    }
  }
  await browser.close();
  console.table(results.map((r) => ({ tela: r.tela, escala: r.escala, hscroll: r.hscroll, larguraDoc: r.docW, clipped: r.clipped.length })));
  const broken = results.filter((r) => r.hscroll || r.clipped.length);
  if (broken.length) {
    console.log('\n== DETALHE DOS PROBLEMAS ==');
    for (const b of broken) console.log(`\n[${b.tela} ×${b.escala === '×1' ? '1' : b.escala}] hscroll=${b.hscroll} ${b.widest ? `maior elemento: ${b.widest.tag}.${b.widest.cls} ${b.widest.width}px` : ''}\n  clipped: ${b.clipped.join('\n          ') || '—'}`);
  } else {
    console.log('\n✅ Nenhuma quebra: sem scroll horizontal e sem texto cortado em nenhuma escala.');
  }
};

run().catch((e) => { console.error('AUDIT FAIL:', e.message); process.exit(1); });
