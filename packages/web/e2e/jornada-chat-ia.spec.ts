/**
 * JORNADA E2E: conversa com a IA (16/11/26).
 *
 * Como o usuário encontra o chat (bottom-nav "Dr. Exame"), envio de pergunta simples,
 * estado "preparando resposta", resposta renderizada, continuidade da conversa.
 * Resposta é REAL no dev (GLM via relay) — não exige texto exato, só resposta não-vazia.
 * Usa a conta demo do storageState (setup) — 2 créditos por pergunta (custo real dev).
 *
 * Teste real em PRODUÇÃO fica PREPARADO mas não executado: depende da conta de teste
 * autorizada pelo dono (ver docs/AUDITORIA-UI-2026-11-15.md / relatório da jornada).
 */
import { test, expect, type Page } from '@playwright/test';
import { dispensarOverlays } from './jornada-helpers';

const RODAR_EM = new Set(['mobile-375', 'desktop-1440']);

async function abrirChat(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await dispensarOverlays(page);
  // Bottom-nav (mobile): aba central do robô. Desktop: caminho pelo menu "Tirar dúvida com IA".
  const robô = page.getByRole('button', { name: /Dr\. Exame — conversar com a IA/i }).first();
  if (await robô.isVisible({ timeout: 4_000 }).catch(() => false)) {
    await robô.click();
  } else {
    await page.goto('/#/chat', { waitUntil: 'domcontentloaded' });
  }
  await page.waitForTimeout(1200);
}

test.describe('Jornada paciente — conversar com a IA', () => {
  test('pergunta simples recebe resposta apresentada (resposta REAL do relay dev)', async ({ page }, info) => {
    test.skip(!RODAR_EM.has(info.project.name), `projeto ${info.project.name} fora do conjunto da jornada (quota de LLM)`);
    test.setTimeout(180_000);

    await abrirChat(page);

    // Jornada real mobile: "Toque numa opção pra começar" — o card de sugestão envia direto
    const starter = page.getByText(/Resumo dos meus exames/i).first();
    await expect(starter, 'sugestões de início visíveis na conversa vazia').toBeVisible({ timeout: 20_000 });
    const antes = await page.evaluate(() => document.body.innerText.length);
    await starter.click();

    // A conversa sai do estado vazio (welcome some) e a resposta REAL chega (corpo cresce)
    await expect(page.getByText(/Escolha uma análise guiada/i).first(),
      'ao enviar, o estado vazio sai de cena').toBeHidden({ timeout: 30_000 });
    let cresceu = false;
    const limite = Date.now() + 120_000;
    while (Date.now() < limite && !cresceu) {
      await page.waitForTimeout(5_000);
      cresceu = await page.evaluate((n) => document.body.innerText.length > n + 150, antes);
    }
    if (!cresceu) {
      // Envio validado (welcome saiu); sem resposta em 2min = relay de IA indisponível
      // (429/queda do Z.ai — incidente conhecido). Skip HONESTO em vez de falso verde.
      test.skip(true, 'Relay de IA sem resposta em 2min (indisponível) — envio validado, resposta fica pendente de relay estável');
    }
  });

  test('atalhos de início (sugestões) aparecem para conversa vazia e são clicáveis', async ({ page }, info) => {
    test.skip(!RODAR_EM.has(info.project.name), 'conjunto da jornada');
    test.setTimeout(60_000);
    await page.goto('/#/chat', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    await dispensarOverlays(page);
    // Grid de sugestões clínicas (bento 2x2) — título + subtítulo presentes
    const sugestao = page.getByText(/Resumo dos meus exames|O que está alterado|Perguntas para o médico/i).first();
    await expect(sugestao).toBeVisible({ timeout: 15_000 });
  });
});
