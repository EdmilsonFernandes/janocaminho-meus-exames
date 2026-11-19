// Auditoria visual 8K (19/11) — brief Staff Product Designer.
// Captura 412x915@3x light+dark das rotas-chave + medições DOM (visão do relay não funciona):
// toque 44px, sombras vs hairline, tabular-nums, letter-spacing, font-smoothing, safe-area,
// contraste computado, overflow-x. Uso:
//   node e2e/visual-audit-8k.mjs <email> <senha> <examId>   (BASE=http://localhost:5173)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'audit-8k');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:5173';
const API = process.env.API || 'http://127.0.0.1:4001/api';
const [email, senha, examId] = process.argv.slice(2);

const login = await fetch(`${API}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: email, password: senha }),
}).then((r) => r.json());
if (!login.token) { console.error('LOGIN FALHOU', login); process.exit(1); }

const ROUTES = [
  { key: 'landing', href: '/landing', auth: false },
  { key: 'dashboard', href: '/', auth: true },
  { key: 'laudo', href: `/exams/${examId}/show`, auth: true },
  { key: 'esportiva', href: '/saude-esportiva', auth: false },
  { key: 'chat', href: '/chat', auth: true },
];

const AUDIT_JS = () => {
  const r = {};
  const vis = (el) => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0 && b.height > 0; };
  // 1. toque <44px
  const targets = [...document.querySelectorAll('button,[role="button"],a[href],input,select,.MuiListItemButton,[role="tab"]')].filter(vis);
  r.touchTotal = targets.length;
  r.touchSmall = targets.filter((t) => { const b = t.getBoundingClientRect(); return b.width < 44 || b.height < 44; }).slice(0, 8)
    .map((t) => ({ tag: t.tagName, txt: (t.innerText || t.getAttribute('aria-label') || '').slice(0, 28), w: Math.round(t.getBoundingClientRect().width), h: Math.round(t.getBoundingClientRect().height) }));
  // 2. sombras vs bordas hairline (amostra de superfícies: cards, papers, appbars)
  const surfaces = [...document.querySelectorAll('.MuiCard-root,.MuiPaper-root,.MuiAppBar-root,[class*="MuiPaper"]')].filter(vis);
  let withShadow = 0, withBorder = 0; const shadowWho = {};
  surfaces.forEach((s) => {
    const cs = getComputedStyle(s);
    if (cs.boxShadow && cs.boxShadow !== 'none') { withShadow++; const k = s.className.toString().split(' ')[0]; shadowWho[k] = (shadowWho[k] || 0) + 1; }
    if (cs.borderTopWidth !== '0px' || cs.borderTopStyle !== 'none') withBorder++;
  });
  r.surfaces = { total: surfaces.length, withShadow, withBorder, shadowWho: Object.entries(shadowWho).sort((a, b) => b[1] - a[1]).slice(0, 4) };
  // 3. tipografia
  r.fontSmoothing = getComputedStyle(document.body).webkitFontSmoothing || '(none)';
  const heads = [...document.querySelectorAll('h1,h2,h3,h4,.MuiTypography-h5,.MuiTypography-h6')].filter(vis).slice(0, 6).map((h) => ({ t: h.tagName, ls: getComputedStyle(h).letterSpacing }));
  r.headings = heads;
  const numeric = [...document.querySelectorAll('.MuiTypography-root,.MuiTableCell-root')].filter(vis).filter((n) => /\d\s*[,.]?\s*\d/.test(n.innerText || '')).slice(0, 40);
  r.numericCount = numeric.length;
  r.numericTabular = numeric.filter((n) => getComputedStyle(n).fontVariantNumeric.includes('tabular-nums')).length;
  // 4. safe-area
  r.safeArea = (() => { try { let hits = 0; for (const sh of document.styleSheets) { try { for (const ru of sh.cssRules) { if (String(ru.cssText || '').includes('safe-area-inset')) hits++; } } catch {} } return hits; } catch { return -1; } })();
  // 5. contraste (amostra de nós de texto) — v2: COMPÕE ALFA (bug 19/11: fundo rgba(…,.09)
  //    era tratado como sólido → falsos 1.0 em chips tinta-sobre-tinta-da-mesma-cor).
  const parseC = (c) => { const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/); return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null; };
  const lumRGB = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const lum = (c) => { const p = parseC(c); return p ? lumRGB(p) : null; };
  const bgOf = (el) => {
    // sobe compostando camadas translúcidas até bater numa opaca (ou no fundo da página)
    let acc = null;
    let e = el;
    while (e && e !== document.documentElement) {
      const bg = parseC(getComputedStyle(e).backgroundColor);
      if (bg && bg.a > 0) {
        if (acc === null) acc = bg;
        else if (bg.a >= 1) { acc = { r: bg.r * bg.a + acc.r * (1 - bg.a), g: bg.g * bg.a + acc.g * (1 - bg.a), b: bg.b * bg.a + acc.b * (1 - bg.a), a: 1 }; }
        // camada parcial sobre parcial: continua subindo (aproximação por compositing simples)
        if (acc.a >= 1) break;
      }
      e = e.parentElement;
    }
    if (!acc || acc.a < 1) {
      const rootBg = parseC(getComputedStyle(document.body).backgroundColor);
      if (rootBg && rootBg.a > 0 && acc) acc = { r: rootBg.r * rootBg.a + acc.r * (1 - rootBg.a), g: rootBg.g * rootBg.a + acc.g * (1 - rootBg.a), b: rootBg.b * rootBg.a + acc.b * (1 - rootBg.a), a: 1 };
      else if (rootBg) acc = rootBg;
    }
    return acc ? `rgb(${Math.round(acc.r)},${Math.round(acc.g)},${Math.round(acc.b)})` : 'rgb(255,255,255)';
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set(); let lowContrast = 0, sampled = 0; const lowWho = [];
  let node; const weak = [];
  while ((node = walker.nextNode()) && sampled < 60) {
    const t = node.textContent.trim(); if (t.length < 6 || !t.match(/[A-Za-zÀ-ú]/)) continue;
    const el = node.parentElement; if (!el || !vis(el) || seen.has(el)) continue; seen.add(el);
    const cs = getComputedStyle(el);
    const fg = cs.color; const bg = bgOf(el);
    const l1 = lum(fg), l2 = lum(bg); if (l1 == null || l2 == null) continue;
    sampled++;
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    // WCAG: texto GRANDE (≥24px, ou ≥18,66px com peso ≥700) exige 3:1; normal, 4,5:1.
    const px = parseFloat(cs.fontSize); const bold = parseInt(cs.fontWeight) >= 700;
    const min = (px >= 24 || (px >= 18.66 && bold)) ? 3 : 4.5;
    if (ratio < min) { lowContrast++; if (lowWho.length < 6) lowWho.push({ txt: t.slice(0, 24), ratio: +ratio.toFixed(2), fg, bg }); }
  }
  r.contrast = { sampled, lowContrast, lowWho };
  // 6. overflow-x + h1
  r.scrollX = document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth;
  r.h1 = document.querySelectorAll('h1').length;
  return r;
};

const browser = await chromium.launch();
const report = {};
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 3, colorScheme: scheme, locale: 'pt-BR' });
  const page = await ctx.newPage();
  if (email) await page.addInitScript((sess) => {
    try { localStorage.clear(); } catch {}
    localStorage.setItem('token', sess.token);
    if (sess.patientId) { localStorage.setItem('patientId', sess.patientId); localStorage.setItem('selPatientId', sess.patientId); }
    localStorage.setItem('user', JSON.stringify(sess.user));
  }, login);
  // WARM-UP: vite dev compila a rota na 1ª visita (print saía antes do mount). Aquece tudo,
  // depois captura na 2ª passada — dados reais nas duas schemes.
  for (const rota of ROUTES) {
    try { await page.goto(`${BASE}${rota.href}`, { waitUntil: 'domcontentloaded', timeout: 60000 }); await page.waitForTimeout(1500); } catch { /* segue */ }
  }
  for (const rota of ROUTES) {
    const key = `${rota.key}-${scheme}`;
    const gotoSettled = async (href) => {
      // SPA redireciona (auth guard) durante o goto → 'interrupted'. 2ª tentativa após
      // assentar pega a rota final.
      try { await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 45000 }); }
      catch { await page.waitForTimeout(1800); await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 45000 }); }
      await page.waitForTimeout(2400);
    };
    try {
      await gotoSettled(`${BASE}${rota.href}`);
      await page.screenshot({ path: path.join(OUT, `${key}.png`) });
      const audit = await page.evaluate(AUDIT_JS);
      report[key] = { url: rota.href, ...audit };
      console.log(`📸 ${key} — toque<44: ${audit.touchSmall.length}/${audit.touchTotal} · sombra: ${audit.surfaces.withShadow}/${audit.surfaces.total} · tabular: ${audit.numericTabular}/${audit.numericCount} · contraste<4.5: ${audit.contrast.lowContrast}/${audit.contrast.sampled} · scrollX: ${audit.scrollX}`);
    } catch (e) { report[key] = { error: String(e.message).slice(0, 120) }; console.log(`❌ ${key}: ${e.message}`); }
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(`\nRELATORIO+PRINTS em ${OUT}`);
