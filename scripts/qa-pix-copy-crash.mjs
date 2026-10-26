/**
 * QA regressão — crash do toast no pagamento PIX (bug Heloisa 26/10, Safari/iOS).
 *
 * CAUSA (confirmada): ConfirmDialog.tsx renderizava <SwipeableAlert> (FC sem forwardRef)
 * como filho do <Snackbar>. O Transition (MUI Grow) anexa ref no filho p/ medir a
 * animação (onEnter → reflow(node) → node.scrollTop). Sem ref anexado → nodeRef.current
 * = null → `TypeError: Cannot read properties of null (reading 'scrollTop')` →
 * ErrorBoundary → "A client error occurred" com a cobrança JÁ gerada no server.
 *
 * Este script reproduz o fluxo do usuário (pagar consulta → copiar código, várias
 * vezes + fechar/reabrir o dialog rápido) com a API de billing MOCKADA (nenhuma
 * cobrança real) e falha se a tela de erro aparecer, se o dialog morrer ou se o
 * toast não confirmar a cópia.
 *
 *   node scripts/qa-pix-copy-crash.mjs            (web 5173 + server 4001 dev)
 */
import { chromium } from 'playwright';

const WEB = 'http://localhost:5173';
const API = 'http://localhost:4001';
const EMAIL = process.env.QA_EMAIL || 'edmilson@exemplo.com';
const PASS = process.env.QA_PASS || 'troque123';

const PIX_CODE = '00020126580014BR.GOV.BCB.PIX0136repro-pix-code-0123456789abcdef0123456789abcdef5204000053039865802BR5909DR EXAME6009SAO PAULO62070503***6304ABCD';
const QR_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let fails = 0;
const check = (ok, label) => { console.log(`${ok ? '✓' : 'FALHOU'}: ${label}`); if (!ok) fails++; };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

// Mocks: cobrança PIX + lista de reminders (zero chamada real ao billing/Asaas)
await page.route('**/api/billing/teleconsulta/**', (route) =>
  route.request().method() === 'POST'
    ? route.fulfill({ json: { paymentId: 'pay-repro-1', qrCode: PIX_CODE, qrBase64: QR_PNG, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), priceCents: 15000 } })
    : route.continue());
await page.route('**/api/billing/payment-status/**', (route) => route.fulfill({ json: { approved: false } }));
await page.route('**/api/reminders?**', (route) => route.fulfill({ json: [{
  id: 'repro-1', patientId: 'any', title: 'Consulta de retorno', done: false,
  dueDate: new Date(Date.now() + 2 * 3600_000).toISOString(), type: 'teleconsulta',
  consultPriceCents: 15000, paidAt: null, notifyOffsetsMin: [], linkUrl: 'https://meet.google.com/repro-test',
}] }));

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message)));

// Login
await page.goto(`${WEB}/#/entrar`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.getByLabel(/e-mail/i).first().fill(EMAIL);
await page.locator('input[type="password"]').first().fill(PASS);
await page.getByRole('button', { name: /entrar/i }).first().click();
await page.waitForTimeout(4000);

// Fluxo: pagar consulta → dialog PIX
await page.goto(`${WEB}/#/lembretes`);
await page.waitForTimeout(2500);
await page.locator('button:has-text("Pagar consulta")').first().click();
await page.waitForTimeout(1200);
check(await page.locator('button:has-text("Copiar Código PIX")').count() > 0, 'dialog PIX aberto com botão Copiar');

// Stress: 4 cópias rápidas + fechar/reabrir o dialog rápido + copiar de novo
for (let i = 0; i < 4; i++) {
  await page.locator('button:has-text("Copiar Código PIX")').first().click();
  await page.waitForTimeout(400);
}
const dlg = page.locator('.MuiDialog-root').first();
await dlg.getByRole('button', { name: /fechar/i }).first().click().catch(() => {});
await page.waitForTimeout(300);
await page.locator('button:has-text("Pagar consulta")').first().click();
await page.waitForTimeout(1200);
await page.locator('button:has-text("Copiar Código PIX")').first().click();
await page.waitForTimeout(1000);

const bodyText = await page.evaluate(() => document.body.innerText);
check(!bodyText.includes('A client error occurred') && !bodyText.includes('Algo deu errado'), 'sem tela de erro (regressão do scrollTop)');
check(pageErrors.length === 0, `nenhum pageerror (${pageErrors.slice(0, 2).join(' | ') || 'zero'})`);
check(await page.locator('.MuiDialog-root').count() > 0, 'dialog PIX sobrevive ao copy (QR + código + validade preservados)');
check(await page.locator('.MuiDialog-root img[alt="QR Code PIX da consulta"]').count() > 0, 'QR ainda visível no dialog');
check(await page.locator('button:has-text("Código PIX Copiado")').count() > 0, 'botão confirma "Código PIX Copiado!" (só após copy real)');
const toast = await page.evaluate(() => { const s = document.querySelector('.MuiSnackbar-root'); return s ? s.innerText : ''; });
check(toast.includes('Código PIX copiado'), `toast de sucesso aparece ("${toast.replace(/\n/g, ' ').trim()}")`);

await page.screenshot({ path: 'scripts/screenshots/qa-pix-copy-crash.png' });
await browser.close();
console.log(fails ? `\n${fails} FALHA(S)` : '\nTodos os checks ✓');
process.exit(fails ? 1 : 0);
