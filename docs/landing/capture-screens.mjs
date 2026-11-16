// Captura TELAS REAIS do app (identidade fictícia "Ana Martins", dados QA/demo) p/ vitrine da landing.
// Uso: node docs/landing/capture-screens.mjs
// Porta anti-PII: se "Edmilson" aparecer no texto visível, ABORTA a captura da tela.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';

const BASE = 'http://192.168.15.30:5173';
const OUT = fileURLToPath(new URL('../../packages/web/public/screens/', import.meta.url));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'pt-BR',
});
const page = await ctx.newPage();

const login = async (email) => {
  await page.goto(`${BASE}/#/entrar`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.getByRole('textbox', { name: 'E-mail' }).fill(email);
  await page.getByRole('textbox', { name: 'Senha' }).fill('troque123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForFunction(() => location.hash === '#/', null, { timeout: 20000 });
  await page.waitForTimeout(1500);
};

const shot = async (name, waitMs = 3000) => {
  await page.waitForTimeout(waitMs);
  const text = await page.evaluate(() => document.body.innerText || '');
  if (/Edmilson/i.test(text)) { console.error(`⛔ ${name}: PII detectado ("Edmilson") — captura ABORTADA`); process.exitCode = 1; return false; }
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log(`✓ ${name} (${text.length} chars de texto visível)`);
  return true;
};

// 1) Dashboard — modo exemplo (dados fictícios "Ana" por design) via deep-link ?demo=1
await login('qa-vazio@exemplo.com');
await page.goto(`${BASE}/#/?demo=1`, { waitUntil: 'domcontentloaded' });
await shot('app-dashboard-demo', 4500);

// 2) Chat (entrada do assistente) e 3) lista de exames — conta QA (Ana)
await page.evaluate(() => localStorage.clear());
await login('qa.paciente@local.test');
await page.goto(`${BASE}/#/chat`, { waitUntil: 'domcontentloaded' });
await shot('app-chat', 3500);
await page.goto(`${BASE}/#/exams`, { waitUntil: 'domcontentloaded' });
await shot('app-exames', 3500);

await browser.close();
console.log('DONE →', OUT);
