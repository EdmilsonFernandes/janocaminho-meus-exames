import { test, expect, type Page } from '@playwright/test';

/**
 * Validação E2E do FIX do gesto/botão voltar (Android/Capacitor).
 *
 * Honest scope: o ato do OS FECHAR o app num gesto só é reprodutível num device
 * (browser não "sai de app"). O que este E2E prova no app REAL é o SINAL em que o
 * fix apoia — window.history.state.idx (índice do histórico do react-router):
 *   - aumenta a cada navegação in-app (push)
 *   - DIMINUI ao voltar (diferente de window.history.length, que só cresce)
 *   - volta a 0 na raiz, MESMO com history.length > 1  ← cenário exato do bug,
 *     onde a lógica antiga (length>1) chamava history.back() no índice 0 e SAÍA
 *     do app no gesto; a nova (idx>0) corretamente fica.
 *
 * A LÓGICA da decisão em si (back/go-home/stay) é provada deterministicamente em
 * src/utils/backNavigation.test.ts. Este spec complementa provando que o react-router
 * deste app de fato mantém `idx` — sem ele o fix cairia no fallback (inAppStack).
 *
 * Roda contra o env local na 4011 (mesmo storageState da suíte):
 *   docker compose -f docker-compose.local.yml up -d
 *   npx playwright test e2e/back-gesture.spec.ts
 */

const readIdx = (page: Page) =>
  page.evaluate(() => {
    const s = window.history.state as { idx?: number } | null;
    return { idx: s && typeof s.idx === 'number' ? s.idx : null, length: window.history.length };
  });

async function dismissOverlays(page: Page) {
  for (const label of ['Pular', 'Depois', 'Agora não']) {
    try { await page.getByRole('button', { name: label }).first().click({ timeout: 500 }); } catch { /* overlay ausente */ }
  }
}

test('gesto/botão voltar: idx do react-router é o sinal correto (não history.length)', async ({ page }) => {
  test.setTimeout(60_000);
  // Back-gesture é mobile; o rodapé (NAV) só renderiza em telas pequenas.
  test.skip((page.viewportSize()?.width ?? 0) >= 600, 'rodapé mobile-only');

  // Dashboard (raiz). idx deve ser 0 (ou null antes da 1ª navegação in-app).
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await dismissOverlays(page);
  const root0 = await readIdx(page);

  // Push 1: Início → Exames (navegação client-side pelo rodapé).
  await page.getByText('Exames', { exact: true }).first().click();
  await page.waitForURL('**/exams', { timeout: 15_000 });
  await page.waitForTimeout(300);
  const atExams = await readIdx(page);

  // Push 2: Exames → Evolução.
  await page.getByText('Evolução', { exact: true }).first().click();
  await page.waitForURL('**/evolucao', { timeout: 15_000 });
  await page.waitForTimeout(300);
  const atEvo = await readIdx(page);

  // O idx precisa estar sendo mantido pelo react-router (premissa do fix).
  expect(atExams.idx, 'idx deve existir após navegar (react-router mantém history.state.idx)').not.toBeNull();
  expect(atEvo.idx, 'idx deve aumentar a cada push').toBeGreaterThan(atExams.idx as number);

  // Back 1: Evolução → Exames (idx diminui, history.length NÃO).
  await page.goBack();
  await page.waitForURL('**/exams', { timeout: 15_000 });
  await page.waitForTimeout(300);
  const back1 = await readIdx(page);
  expect(back1.idx, 'idx deve DIMINUIR ao voltar').toBeLessThan(atEvo.idx as number);
  expect(back1.length, 'history.length NÃO diminui (é esse o bug)').toBeGreaterThanOrEqual(atEvo.length);

  // Back 2: Exames → Início (raiz). idx volta a 0, mas length segue > 1.
  await page.goBack();
  await page.waitForURL('/', { timeout: 15_000 });
  await page.waitForTimeout(300);
  const back2 = await readIdx(page);

  // === CENÁRIO EXATO DO BUG ===
  // Lógica antiga: window.history.length > 1 → TRUE → history.back() → SAÍA do app no gesto.
  // Lógica nova:    idx > 0 → FALSE → engole o back → FICA no app.
  expect(back2.idx, 'na raiz, idx deve ser 0 (não há tela anterior in-app)').toBe(0);
  expect(back2.length, 'e mesmo assim history.length > 1 — exatamente onde o bug saía do app').toBeGreaterThan(1);
});
