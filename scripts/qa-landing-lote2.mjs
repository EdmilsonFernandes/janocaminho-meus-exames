/**
 * QA visual da landing atualizada (Família de verdade + Ciência sem caixa-preta + mural).
 * Público, sem login. Mobile 390 + desktop 1280.
 *   node scripts/qa-landing-lote2.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const WEB = 'http://localhost:5199';
const OUT = 'design-lab/qa';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

const CHECKS = [
  // Seção família
  'A saúde de quem você ama', 'Você está cuidando de', 'Theo: exame lido', 'Pediátrico · 2–6 anos', 'Harriet Lane', 'Cadastrar minha família',
  // Seção ciência
  'Ciência sem caixa-preta', 'fórmula e fonte', 'PhenoAge', 'CKD-EPI', 'RDC 657', 'Ver cada regra, com a fonte',
  // Mural + portal + planos
  'Faixas pediátricas', 'Remédios + interações', '1º resumo de IA grátis', 'Brief em PDF de 1 página',
];

for (const [label, width, height] of [['mobile-390', 390, 844], ['desktop-1280', 1280, 800]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`${WEB}/#/landing`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  // Mural: cards novos ficam atrás de "Ver todos" — expande e CONFIRMA (botão vira "Ver menos")
  // antes de checar. Clique pode disparar pré-hidrateção do React → retry até confirmar.
  for (let i = 0; i < 3; i++) {
    const verTodos = page.getByRole('button', { name: /Ver (todos os \d+ recursos|menos)/ });
    if (!await verTodos.count()) break;
    const label = await verTodos.first().innerText().catch(() => '');
    if (label.includes('menos')) break;
    await verTodos.first().scrollIntoViewIfNeeded().catch(() => {});
    await verTodos.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(900);
  }
  let fails = 0;
  // innerText do body INTEIRO (determinístico — imune a texto partido por span/Reveal).
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); });
  await page.waitForTimeout(500);
  const bodyText = await page.evaluate(() => document.body.innerText);
  for (const t of CHECKS) {
    if (!bodyText.includes(t)) { fails++; console.log(`[${label}] FALHOU: "${t}"`); }
  }
  console.log(`[${label}] ${CHECKS.length - fails}/${CHECKS.length} checks ✓`);
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 50)); } });
  await page.screenshot({ path: `${OUT}/landing-lote2-${label}-full.png`, fullPage: true });
  // Sem overflow horizontal (regra mobile)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`[${label}] overflow-x: ${overflow > 1 ? `FALHOU (${overflow}px)` : 'OK'}`);
  await page.close();
}

await browser.close();
console.log('Screenshots em', OUT);
