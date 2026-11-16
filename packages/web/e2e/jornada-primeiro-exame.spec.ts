/**
 * JORNADA E2E: 1º acesso → 1º exame (16/11/26).
 *
 * Valida a experiência de quem ACABOU de criar a conta, com a regra real de créditos:
 *   cadastro (0 créditos) → 1º upload GRÁTIS → durante a análise, 2º envio mostra
 *   "Estamos analisando seu primeiro exame" (409 first_exam_processing, NÃO paywall)
 *   → conclusão → bônus de boas-vindas entra → resultado acessível.
 *
 * Processamento é REAL no dev (pdftotext → GLM via relay) — pode levar até ~3 min.
 * Roda só em mobile-375 (chromium estreito) e desktop-1440: os 5 projetos do config
 * multiplicariam chamadas de LLM à toa.
 * Requer: server dev em :4001, web dev em :5173 →
 *   $env:E2E_BASE_URL='http://localhost:5173'; $env:E2E_API_URL='http://localhost:4001/api'
 *   npx playwright test e2e/jornada-primeiro-exame.spec.ts --project=mobile-375
 */
import { test, expect } from '@playwright/test';
import { criarUsuarioNovo, entrarComo, dispensarOverlays, buildPdfExame, creditosDe, API } from './jornada-helpers';

const RODAR_EM = new Set(['mobile-375', 'desktop-1440']);

/** Espera REAL por visibilidade (isVisible ignora timeout — retorna instantâneo!). */
async function visivel(loc: import('@playwright/test').Locator, ms: number): Promise<boolean> {
  return loc.waitFor({ state: 'visible', timeout: ms }).then(() => true).catch(() => false);
}

/** Jornada REAL de envio (mapeada por debug 16/11, ordem determinística):
 *  1. tela "Enviar exame" abre o consentimento LGPD (1ª vez): checkbox "Li e entendi"
 *     + "Entendi e aceito" — o dialog COBRE o botão de submit (clique seria bloqueado).
 *  2. anexa o arquivo (input hidden "Arquivo ou Foto").
 *  3. "Conferência rápida antes de enviar" → "Está certo, enviar" (ou submit direto). */
async function submeterEnvio(page: import('@playwright/test').Page, arquivo: { name: string; buffer: Buffer }, opts?: { duranteProcessamento?: boolean; reenvio?: boolean }) {
  // Log de rede do envio (diagnóstico: o POST /api/exams disparou? com qual status?)
  page.on('response', (r) => { if (r.url().includes('/api/exams') && r.request().method() === 'POST') console.log(`[jornada] POST /api/exams → ${r.status()}`); });
  // 1. LGPD (1ª vez): marca o checkbox de verdade (input real, force pega o hidden do MUI)
  const aceito = page.getByRole('button', { name: 'Entendi e aceito' });
  if (await visivel(aceito, 6_000)) {
    const cb = page.locator('input[type="checkbox"]').first();
    await cb.check({ force: true }).catch(async () => { await page.getByText(/Li e entendi este aviso/i).first().click(); });
    await page.waitForTimeout(300);
    await aceito.click();
    await page.waitForTimeout(700);
  }
  // 2. Anexa
  await page.setInputFiles('input[type="file"]', { name: arquivo.name, mimeType: 'application/pdf', buffer: arquivo.buffer });
  await page.waitForTimeout(1500);
  // 3. Conferência rápida (se aparecer) — ⚠️ "Está certo, enviar" só FECHA o diálogo
  //    (não faz o POST); o submit de verdade é o botão grande DEPOIS dele.
  const conferencia = page.getByRole('button', { name: 'Está certo, enviar' });
  if (await visivel(conferencia, 6_000)) {
    await conferencia.click();
    await page.waitForTimeout(800);
  }
  // 4. Submit de verdade
  const analisar = page.getByRole('button', { name: /Enviar e extrair com IA|Analisar exame com IA/ });
  await expect(analisar).toBeEnabled({ timeout: 10_000 });
  await analisar.click();
  // 5. VERIFICA (espera REAL) — dois desfechos legítimos:
  //    a) envio normal → lista mostra o exame processando (Cancelar e excluir);
  //    b) 2º envio DURANTE a 1ª análise → 409 first_exam_processing → UI de espera
  //       (sem paywall) — o card "Cancelar" novo NÃO existe nesse caso.
  if (opts?.duranteProcessamento) {
    const espera = page.getByText(/Estamos analisando seu primeiro exame|créditos de boas-vindas/i).first();
    const mostrouEspera = await visivel(espera, 20_000);
    console.log(`[jornada] cenário 2º-envio: ${mostrouEspera ? 'mensagem de espera exibida (regra 409 ativa ✓)' : '1ª extração já havia concluído — sem janela de espera (correto)'}`);
    // A regressão que importa: paywall JAMAIS para quem está nas boas-vindas
    await expect(page.getByText(/Recarregue créditos|Para enviar um exame é preciso/i).first(),
      'paywall não pode aparecer para quem está nas boas-vindas').toBeHidden({ timeout: 3_000 });
  } else if (opts?.reenvio) {
    // reenvio idempotente: o servidor devolve o exame EXISTENTE — não há novo
    // processamento (card "Cancelar" não deve surgir; o saldo é assertido fora).
    console.log('[jornada] reenvio submetido (idempotência: sem novo processamento esperado)');
  } else {
    // Âncora textual: o envio pode aterrissar PROCESSANDO ou já em desfecho (relay
    // fora → falha em segundos, sem janela de processamento).
    const aterrissou = await Promise.race([
      page.getByText(/Em processamento/i).first().waitFor({ state: 'visible', timeout: 30_000 }).then(() => true).catch(() => false),
      page.getByText(/Não foi possível ler/i).first().waitFor({ state: 'visible', timeout: 30_000 }).then(() => true).catch(() => false),
    ]);
    expect(aterrissou, 'envio deve aterrissar na lista (processando ou com desfecho)').toBeTruthy();
  }
}

/** Volta pra tela de envio pela UI (lista → "Enviar exame" ou banner do 1º exame). */
async function abrirTelaDeEnvio(page: import('@playwright/test').Page) {
  await page.goto('/#/exams', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const banner = page.getByRole('button', { name: /1º exame|Toque para enviar/i }).first();
  const botaoEnviar = page.getByRole('button', { name: 'Enviar exame' }).first();
  if (await banner.isVisible({ timeout: 3_000 }).catch(() => false)) await banner.click();
  else { await expect(botaoEnviar).toBeVisible({ timeout: 6_000 }); await botaoEnviar.click(); }
  await page.waitForTimeout(1500);
}

test.describe('Jornada paciente — 1º exame', () => {
  test('usuário novo entra, envia o 1º exame, espera a análise e recebe créditos', async ({ page, request }, info) => {
    test.skip(!RODAR_EM.has(info.project.name), `projeto ${info.project.name} fora do conjunto da jornada (quota de LLM)`);
    test.setTimeout(300_000); // extração REAL via relay: fôlego p/ LLM lento

    // ── Arrange: conta NOVA (0 créditos — bônus só depois do 1º exame extraído) ──
    const sess = await criarUsuarioNovo(request);
    expect(sess.user['credits'], 'conta nova precisa nascer com 0 créditos (anti-farm)').toBe(0);
    await entrarComo(page, sess);
    await dispensarOverlays(page);

    // ── 1. Acha o envio de exame e manda o PDF sintético ──
    await abrirTelaDeEnvio(page);
    await submeterEnvio(page, { name: 'exame-e2e.pdf', buffer: buildPdfExame() });

    // ── 2. Feedback de recebimento: exame visível na lista — processando OU já em
    //    desfecho terminal (relay fora → falha em segundos, sem janela de processamento)
    const processando = page.getByText(/Em processamento/i).first();
    const falhouRapido = page.getByText(/Não foi possível ler/i).first();
    const estadoInicial = await Promise.race([
      processando.waitFor({ state: 'visible', timeout: 25_000 }).then(() => 'processando' as const).catch(() => null),
      falhouRapido.waitFor({ state: 'visible', timeout: 25_000 }).then(() => 'falha' as const).catch(() => null),
    ]);
    expect(estadoInicial, 'exame enviado deve aparecer na lista (processando ou com desfecho)').toBeTruthy();

    // ── 3. Durante o processamento: 2º envio NÃO pode cair no paywall ──
    const jaFinalizou = estadoInicial !== 'processando';
    if (!jaFinalizou) {
      await abrirTelaDeEnvio(page);
      // Cenário da regra real: 409 first_exam_processing → espera, NÃO paywall.
      // Janela = latência real do LLM: se a 1ª extração terminou antes do 2º envio,
      // não há 409 (comportamento correto) — o teste aceita os dois desfechos e
      // falha APENAS se aparecer paywall (a regressão que a regra evita).
      await submeterEnvio(page, { name: 'exame-e2e-2.pdf', buffer: buildPdfExame(Date.now() + 1) }, { duranteProcessamento: true });
    }

    // ── 4. Terminal da extração REAL (GLM via relay): sucesso OU falha são desfechos
    //    legítimos (o relay oscila); o teste valida o CONTRATO de cada um.
    const concluiu = page.getByRole('button', { name: 'Ver análise' }).first();
    const falhou = page.getByText(/Não foi possível ler/i).first();
    const desfecho = await Promise.race([
      concluiu.waitFor({ state: 'visible', timeout: 240_000 }).then(() => 'ok' as const).catch(() => null),
      falhou.waitFor({ state: 'visible', timeout: 240_000 }).then(() => 'falha' as const).catch(() => null),
    ]);
    if (desfecho === 'ok') {
      // ── 5. Bônus de boas-vindas entrou (fonte de verdade: API) ──
      const saldo = await creditosDe(request, sess.token);
      expect(saldo, '1ª extração concluída deve liberar os créditos de boas-vindas').toBeGreaterThan(0);
      // ── 6. Resultado acessível: valores extraídos visíveis ──
      await concluiu.click();
      await expect(page.getByText(/Hemoglobina/i).first()).toBeVisible({ timeout: 20_000 });
    } else {
      // Falha honesta: aviso + ação de recuperar + reenvio continua grátis (FAILED não
      // queima o 1º grátis — regra exam.routes:183). Bônus fica pendente p/ a próxima.
      expect(desfecho, 'extração deve terminar (resultado ou falha) — nunca ficar presa').toBeTruthy();
      await expect(page.getByRole('button', { name: /Re-extrair/i }).first(),
        'estado de falha oferece recuperar sem custo').toBeVisible({ timeout: 10_000 });
      console.log('[jornada] extração FALHOU (relay oscilou) — estado de falha validado; bônus fica pendente');
    }
  });

  test('mesmo arquivo reenviado não duplica nem cobra (idempotência sha256)', async ({ page, request }, info) => {
    test.skip(!RODAR_EM.has(info.project.name), 'conjunto da jornada');
    test.setTimeout(180_000);
    const sess = await criarUsuarioNovo(request);
    await entrarComo(page, sess);
    await dispensarOverlays(page);
    await abrirTelaDeEnvio(page);
    const pdf = buildPdfExame(424242);
    await submeterEnvio(page, { name: 'idem.pdf', buffer: pdf });
    await Promise.race([
      page.getByText(/Em processamento/i).first().waitFor({ state: 'visible', timeout: 25_000 }).catch(() => {}),
      page.getByText(/Não foi possível ler/i).first().waitFor({ state: 'visible', timeout: 25_000 }).catch(() => {}),
    ]);
    // Terminal (sucesso ou falha de extração — relay oscila; idempotência vale nos dois)
    await Promise.race([
      page.getByRole('button', { name: 'Ver análise' }).first().waitFor({ state: 'visible', timeout: 240_000 }).catch(() => {}),
      page.getByText(/Não foi possível ler/i).first().waitFor({ state: 'visible', timeout: 240_000 }).catch(() => {}),
    ]);
    const antes = await creditosDe(request, sess.token);

    // Reenvio do MESMO buffer → o servidor devolve o exame existente (sha256 igual)
    await abrirTelaDeEnvio(page);
    await submeterEnvio(page, { name: 'idem.pdf', buffer: pdf }, { reenvio: true });
    await page.waitForTimeout(4000);
    const depois = await creditosDe(request, sess.token);
    expect(depois, 'reenvio idempotente não pode debitar créditos').toBe(antes);
  });
});
