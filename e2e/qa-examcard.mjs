// QA ExamCard: injeta os exames REAIS do dono (mesmos do print — Sabin/Shirane,
// ANTITIREOGLOBULINA 1 alt., TIREOIDEANA 2 alt., HEMOGRAMA 9 alt./55 itens) na
// resposta de /exams e fotografa a tela "Meus Exames" em 390px (light e dark).
// Uso: node e2e/qa-examcard.mjs [base-web]   (default = prod; passe http://localhost:5173 p/ dev)
import { chromium } from 'playwright';

const API = 'https://janocaminho.com.br/minhasaude/api';
const WEB = process.argv[2] || 'https://drexame.janocaminho.com.br';
const day = (n) => new Date(Date.now() - n * 86400000).toISOString();

const EXAMS = [
  { id: 'qa1', title: 'ANTITIREOGLOBULINA (ANTI-TG) E TIREOGLOBULINA — PAINEL TIREOIDEANO COMPLETO DE RASTREAMENTO AUTOIMUNE', kind: 'LAB_PANEL', status: 'EXTRACTED', sourceLab: 'Sabin', performedAt: day(8), createdAt: day(8), reviewRequired: false,
    rawExtraction: { requestingDoctor: 'DANIEL CESAR SHIRANE', identityMatch: { method: 'cpf', cpfMatch: true } },
    _count: { items: 4 } },
  { id: 'qa2', title: 'TIREOIDEANA (TSH, T4 LIVRE, ANTICORPOS, TIREOGLOBULINA)', kind: 'LAB_PANEL', status: 'EXTRACTED', sourceLab: 'Sabin', performedAt: day(62), createdAt: day(62), reviewRequired: false,
    rawExtraction: { requestingDoctor: 'DANIEL CESAR SHIRANE', identityMatch: { method: 'cpf', cpfMatch: true } },
    _count: { items: 4 } },
  { id: 'qa3', title: 'HEMOGRAMA COMPLETO', kind: 'LAB_PANEL', status: 'EXTRACTED', sourceLab: 'Sabin', performedAt: day(88), createdAt: day(88), reviewRequired: false,
    rawExtraction: { requestingDoctor: 'ENRICO DO AMARAL FONSECA', identityMatch: { method: 'cpf', cpfMatch: true } },
    _count: { items: 55 } },
];
// alterados: qa1=1, qa2=2, qa3=9 (bate com o print do dono)
const ABN = [
  { examId: 'qa1' }, { examId: 'qa2' }, { examId: 'qa2' },
  ...Array.from({ length: 9 }, () => ({ examId: 'qa3' })),
];

const r = await fetch(`${API}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'qa.dono.271026@gmail.com', password: 'QaDono@2026' }),
});
const { token } = await r.json();

const b = await chromium.launch();
for (const mode of ['light', 'dark']) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 200)); });

  await ctx.route(`**/api/exams*`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: EXAMS, total: EXAMS.length }) });
  });
  await ctx.route(`**/api/items/abnormal*`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: ABN }) });
  });
  await ctx.route(`**/api/billing/status*`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ active: true, planExpiresAt: day(-30), examsCount: 3, credits: 100, tokensUsed: 0, trialAvailable: false, reportVouchers: 0, firstExamBonusGranted: true }) });
  });

  await p.addInitScript((t, m) => { localStorage.setItem('token', t); localStorage.setItem('theme', m); }, token, mode);
  await p.goto(`${WEB}/#/exams`, { waitUntil: 'domcontentloaded', timeout: 150000 });
  await p.waitForSelector('.MuiCard-root', { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(4000);
  await p.screenshot({ path: `e2e/screenshots/qa-examcard/${mode}-390.png`, fullPage: true });
  if (mode === 'light') {
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log('overflow-x px:', overflow);
  }
  console.log(`[${mode}] erros:`, errs.length ? errs.slice(0, 3).join(' | ') : 'nenhum');
  await ctx.close();
}
await b.close();
console.log('screenshots em e2e/screenshots/qa-examcard/');
