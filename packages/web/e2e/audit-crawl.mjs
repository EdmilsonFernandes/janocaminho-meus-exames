/**
 * Auditoria visual ponta-a-ponta (15/11/26) — crawl das rotas dos 3 ambientes.
 * Uso: cd packages/web && node e2e/audit-crawl.mjs
 * Saída: scratch/audit-shots/*.png + scratch/audit-report.json (erros console, scroll-x, redirects)
 *
 * Credenciais demo (dev): edmilson@exemplo.com / troque123 — conta de teste, sem dado real de paciente.
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const BASE = 'http://localhost:5173/#';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../../scratch/audit-shots');
fs.mkdirSync(OUT, { recursive: true });

const EMAIL = process.env.AUDIT_EMAIL || 'edmilson@exemplo.com';
const PASS = process.env.AUDIT_PASS || 'troque123';

// Rotas paciente + públicas + médico + admin
const ROUTES = [
  { r: '/', name: 'dashboard' },
  { r: '/exames', name: 'exames' },
  { r: '/evolucao', name: 'evolucao' },
  { r: '/alterados', name: 'alterados' },
  { r: '/tendencias', name: 'tendencias' },
  { r: '/linha-do-tempo', name: 'timeline' },
  { r: '/relatorio', name: 'relatorio-consolidado' },
  { r: '/consultas', name: 'consultas' },
  { r: '/medicos', name: 'meus-medicos' },
  { r: '/radar-hormonal', name: 'radar-hormonal' },
  { r: '/composicao', name: 'composicao' },
  { r: '/alimentacao', name: 'alimentacao' },
  { r: '/vacinas', name: 'vacinas' },
  { r: '/medicamentos', name: 'medicamentos' },
  { r: '/lembretes', name: 'lembretes' },
  { r: '/despesas', name: 'despesas' },
  { r: '/chat', name: 'chat' },
  { r: '/notificacoes', name: 'notificacoes' },
  { r: '/perfil', name: 'perfil' },
  { r: '/carteira', name: 'carteira' },
  { r: '/planos', name: 'planos' },
  { r: '/conquistas', name: 'conquistas' },
  { r: '/saude-mental', name: 'saude-mental' },
  { r: '/sinais', name: 'sinais' },
  { r: '/medicoes', name: 'medicoes' },
  { r: '/emergencia', name: 'emergencia' },
  { r: '/familia', name: 'familia' },
  { r: '/suporte', name: 'suporte' },
  { r: '/encontrar', name: 'encontrar', auth: false },
  { r: '/landing', name: 'landing', auth: false },
  { r: '/simulador-hormonal', name: 'radar-publico', auth: false },
  { r: '/para-medicos', name: 'para-medicos', auth: false },
  { r: '/registrar', name: 'registro', auth: false },
  { r: '/entrar', name: 'login', auth: false },
  { r: '/doctor', name: 'portal-medico' },
  { r: '/admin', name: 'admin' },
];
// Desktop só nas telas-chave (o resto é revisão mobile-first)
const DESKTOP_SET = new Set(['dashboard', 'exames', 'consultas', 'perfil', 'planos', 'admin', 'portal-medico', 'landing', 'radar-publico']);

const report = { startedAt: new Date().toISOString(), pages: [] };

async function login(page) {
  await page.goto(BASE + '/entrar', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const email = page.locator('input[type="email"], input[name="email"]').first();
  const pass = page.locator('input[type="password"]').first();
  await email.fill(EMAIL, { timeout: 8000 });
  await pass.fill(PASS);
  const btn = page.getByRole('button', { name: /entrar|login|acessar/i }).first();
  await btn.click();
  await page.waitForTimeout(2500);
}

async function auditContext(browser, { width, height, label, needLogin }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${label}] ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => errors.push(`[${label}] PAGEERROR ${String(e).slice(0, 300)}`));

  if (needLogin) await login(page);

  for (const route of ROUTES) {
    const wantsDesktop = label === 'desktop';
    if (wantsDesktop && !DESKTOP_SET.has(route.name)) continue;
    const entry = { route: route.r, name: route.name, viewport: label };
    try {
      await page.goto(BASE + route.r, { waitUntil: 'load', timeout: 15000 });
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(600); // animações de entrada terminarem
      // URL final (redirect?)
      entry.finalUrl = page.url().replace(BASE, '');
      // scroll-x horizontal indevido? (regra mobile-first absoluta)
      entry.scrollX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      // height do documento (telas aberrantes)
      entry.docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.screenshot({ path: path.join(OUT, `${route.name}-${label}.png`), fullPage: true });
      entry.ok = true;
    } catch (e) {
      entry.ok = false;
      entry.error = String(e).slice(0, 200);
    }
    report.pages.push(entry);
    process.stdout.write(`${entry.ok ? '✓' : '✗'} ${route.name}-${label}${entry.scrollX > 0 ? ` ⚠️scrollX=${entry.scrollX}px` : ''}\n`);
  }
  await ctx.close();
  return errors;
}

const browser = await chromium.launch();
const errs = [];
errs.push(...await auditContext(browser, { width: 390, height: 844, label: 'm390', needLogin: true }));
errs.push(...await auditContext(browser, { width: 1440, height: 900, label: 'd1440', needLogin: true }));
await browser.close();

report.consoleErrors = [...new Set(errs)].slice(0, 60);
fs.writeFileSync(path.resolve(HERE, '../../scratch/audit-report.json'), JSON.stringify(report, null, 2));
console.log(`\n${report.pages.length} telas capturadas em ${OUT}`);
if (report.consoleErrors.length) console.log(`${report.consoleErrors.length} erros de console únicos (ver audit-report.json)`);
