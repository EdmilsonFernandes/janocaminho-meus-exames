/**
 * Auditoria DOM sistemática (15/11/26) — substitui revisão visual (relay sem visão).
 * Por rota (m390, logado): tap targets <40px (fail) e 40-44 (warn), fontes <12px,
 * h1 (contagem/texto), img sem alt, botões/links sem nome acessível, corpo vazio, nº de botões.
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EMAIL = process.env.AUDIT_EMAIL || 'edmilson@exemplo.com';
const PASS = process.env.AUDIT_PASS || 'troque123';

const ROUTES = ['/', '/exames', '/evolucao', '/alterados', '/tendencias', '/consultas', '/medicos',
  '/radar-hormonal', '/composicao', '/alimentacao', '/vacinas', '/medicamentos', '/lembretes',
  '/despesas', '/chat', '/notificacoes', '/perfil', '/carteira', '/planos', '/conquistas',
  '/saude-mental', '/sinais', '/medicoes', '/emergencia', '/familia', '/suporte', '/doctor', '/admin'];

const CHECK_JS = `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden'; };
  const out = { smallTaps: [], warnTaps: [], smallFonts: [], imgNoAlt: [], noName: [], h1: [], buttons: 0, textLen: document.body.innerText.length };
  const inter = document.querySelectorAll('button, a, [role="button"], input, select, textarea, [role="tab"], [role="switch"]');
  for (const el of inter) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    const d = el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || '';
    const rec = { tag: el.tagName.toLowerCase(), txt: (d || '').trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) };
    if (r.height < 40 || r.width < 40) out.smallTaps.push(rec);
    else if (r.height < 44 || r.width < 44) out.warnTaps.push(rec);
    const name = el.getAttribute('aria-label') || el.innerText?.trim() || el.getAttribute('title') || el.getAttribute('placeholder');
    if (!name && el.tagName !== 'INPUT' && el.tagName !== 'SELECT' && el.tagName !== 'TEXTAREA') out.noName.push(rec);
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let n;
  while ((n = walker.nextNode())) {
    if (!vis(n) || getComputedStyle(n).visibility === 'hidden') continue;
    const fs = parseFloat(getComputedStyle(n).fontSize);
    const hasOwnText = Array.from(n.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim());
    if (hasOwnText && fs < 12) out.smallFonts.push({ txt: (n.innerText ?? n.textContent ?? '').trim().slice(0, 30), fs });
    if (n.tagName === 'H1') out.h1.push(n.innerText.trim().slice(0, 60));
    if (n.tagName === 'BUTTON') out.buttons++;
    if (n.tagName === 'IMG' && !n.hasAttribute('alt')) out.imgNoAlt.push(n.getAttribute('src')?.slice(-40) ?? '');
  }
  out.smallTaps = out.smallTaps.slice(0, 6); out.warnTaps = out.warnTaps.slice(0, 6);
  out.smallFonts = out.smallFonts.slice(0, 6); out.imgNoAlt = out.imgNoAlt.slice(0, 6); out.noName = out.noName.slice(0, 6);
  return out;
})()`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.goto('http://localhost:5173/#/entrar', { waitUntil: 'load' });
await page.waitForTimeout(1000);
await page.locator('input[type="email"]').first().fill(EMAIL);
await page.locator('input[type="password"]').first().fill(PASS);
await page.getByRole('button', { name: /entrar|login|acessar/i }).first().click();
await page.waitForTimeout(2200);

const results = {};
for (const r of ROUTES) {
  await page.goto(`http://localhost:5173/#${r}`, { waitUntil: 'load' });
  await page.waitForTimeout(1100);
  const data = await page.evaluate(CHECK_JS).catch((e) => ({ error: String(e).slice(0, 100) }));
  results[r] = data;
  const f = data.smallTaps?.length ?? '?';
  const sf = data.smallFonts?.length ?? '?';
  const na = data.noName?.length ?? '?';
  console.log(`${r.padEnd(18)} taps<40:${String(f).padStart(2)} fonts<12:${String(sf).padStart(2)} noName:${String(na).padStart(2)} btns:${data.buttons ?? '?'} h1:${data.h1?.length ?? '?'} text:${data.textLen ?? '?'}`);
}
fs.writeFileSync(path.resolve(HERE, '../../scratch/audit-dom.json'), JSON.stringify(results, null, 2));
await browser.close();
console.log('\nDetalhes: packages/scratch/audit-dom.json');
