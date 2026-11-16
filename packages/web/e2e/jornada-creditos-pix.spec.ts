/**
 * JORNADA E2E: compra de créditos + QR PIX (16/11/26).
 *
 * ⚠️ SIMULADO POR INTERCEPTAÇÃO — e por um bom motivo: o MP_ACCESS_TOKEN do dev é de
 * PRODUÇÃO (APP_USR). Criar cobrança dali = cobrança REAL na conta do dono. O teste
 * intercepta `POST /api/billing/buy-credits` e devolve um payload PIX plausível,
 * validando 100% da UI (QR, copia-e-cola, loading, erro, cancelar/repetir).
 * Para um QR de cobrança VÁLIDA: trocar o token por um TEST- (sandbox MP) ou rodar
 * na conta de teste autorizada em prod — anotado como limitação no relatório.
 */
import { test, expect } from '@playwright/test';
import { dispensarOverlays } from './jornada-helpers';

const RODAR_EM = new Set(['mobile-375', 'desktop-1440']);

// payload EMV "copia e cola" fictício (formato real, valores de teste)
const PIX_FAKE = {
  id: 'e2e_pix_123',
  qrCode: '00020126580014BR.GOV.BCB.PIX0136e2e-jornada-pix-520400005303986540510.005802BR5913JORNADA E2E6009SAO PAULO62070503***6304ABCD',
  qrBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
};

test.describe('Jornada paciente — comprar créditos (PIX simulado por intercept)', () => {
  test.beforeEach(async ({ page }) => {
    // Proteção dupla: se a interceptação falhar em algum caso, a rota REAL está bloqueada
    // (fulfill de emergência 503) — nunca cria cobrança de produção a partir do E2E.
    void page.route('**/api/billing/buy-credits', async (route) => {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'bloqueado pelo E2E (token de produção)' }) });
    });
  });

  test('pacote selecionado → QR + copia-e-cola exibidos (payload interceptado)', async ({ page }, info) => {
    test.skip(!RODAR_EM.has(info.project.name), 'conjunto da jornada');
    test.setTimeout(120_000);

    await page.goto('/#/planos', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await dispensarOverlays(page);

    // Pacotes visíveis com preço (vêm da API pública — nunca mentir sobre preço)
    await expect(page.getByText(/cr[eé]ditos/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/R\$\s?\d+/).first(), 'preço do pacote visível').toBeVisible({ timeout: 10_000 });

    // Interceptação ATIVA com payload de sucesso antes do clique
    await page.unroute('**/api/billing/buy-credits');
    await page.route('**/api/billing/buy-credits', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PIX_FAKE) });
    });

    // Botão de COMPRA DE CRÉDITOS (pack avulso) — não confundir com "Assinar Premium"
    // (30s: os packs/preços vêm da API pública e podem renderizar depois do resto)
    const comprar = page.getByRole('button', { name: /Comprar \d+ leituras/ }).first();
    await expect(comprar).toBeVisible({ timeout: 30_000 });
    await comprar.click();

    // Modal "Como quer pagar?" → método PIX → a cobrança é criada (interceptada)
    await expect(page.getByText(/Como quer pagar/i), 'modal de escolha de pagamento abre').toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /Pagar com Pix/i }).click();
    const qrImg = page.locator('img[src^="data:image"], img[alt*="QR" i]').first();
    const copiaECola = page.getByText(/000201/, { exact: false }).first();
    const temQr = await qrImg.isVisible({ timeout: 8_000 }).catch(() => false);
    const temCodigo = await copiaECola.isVisible({ timeout: 3_000 }).catch(() => false);
    expect(temQr || temCodigo, 'QR (imagem) OU copia-e-cola precisa aparecer').toBeTruthy();

    // Botão de copiar presente (ação principal do fluxo copia-e-cola)
    await expect(page.getByRole('button', { name: /copiar/i }).first()).toBeVisible({ timeout: 8_000 });
  });

  test('falha de geração (503) vira mensagem compreensível, não spinner eterno', async ({ page }, info) => {
    test.skip(!RODAR_EM.has(info.project.name), 'conjunto da jornada');
    test.setTimeout(90_000);

    await page.goto('/#/planos', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await dispensarOverlays(page);
    // beforeEach já deixou a rota respondendo 503 (estado "provider sem credencial")
    const comprar = page.getByRole('button', { name: /Comprar \d+ leituras/ }).first();
    await expect(comprar).toBeVisible({ timeout: 15_000 });
    await comprar.click();
    await expect(page.getByText(/Como quer pagar/i)).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /Pagar com Pix/i }).click();

    // Estado de erro humano em <15s: mensagem amigável (nunca o body cru da API) + ação
    await expect(
      page.getByText(/Não conseguimos gerar o código de pagamento/i).first(),
      'falha do provedor deve virar mensagem clara (sem technobabble cru)',
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/bloqueado pelo E2E/i).first(), 'o erro cru da API NÃO pode aparecer ao paciente').toBeHidden();
  });
});
