import { test, expect, type Page, type APIRequestContext, type BrowserContext, type Locator } from '@playwright/test';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURES, BASE, type InsightFixture } from './fixtures/cross-insight';
// @ts-ignore — módulo JS compartilhado com o script Android
import { sheetGeometry } from './fixtures/sheet-geometry.mjs';

/**
 * AUDITORIA · Bottom Sheet de insight clínico × tipografia dinâmica (02/11/26)
 *
 * Componente real: src/components/clinical/CrossInsightBottomSheet.tsx (MUI Drawer bottom +
 * Badge ReUI). Caminho real do usuário: /notificacoes → toque na notificação com
 * data.crossInsight. Caminho controlado: evento `openCrossInsight` que a página já escuta
 * (código de produção pré-existente — nada foi adicionado só para o teste).
 *
 * A) ESTRESSE POR ESCALA CSS: html.fontSize = 16px × escala. Afeta rem/em (Tailwind, MUI
 *    pxToRem, theme) — NÃO é a configuração de fonte do Android (px fixos não mudam).
 * B) text-size-adjust: cenário separado, só documenta o comportamento do motor.
 * C) WebView real: ver insight-sheet-android.mjs (emulador) — registrado à parte.
 */
const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:4175';
const API = process.env.E2E_API_URL || 'http://127.0.0.1:4001/api';
const USER = { username: 'edmilson@exemplo.com', password: 'troque123' };
const PG = 'docker exec meus-exames-db psql -U meus_exames -d meus_exames -At -c';
const SCALES = [0.85, 1, 1.25, 1.5, 2] as const;
const SHEET = '[data-testid="cross-insight-sheet"]';
/** E2E_REPORT_ONLY=1: colhe TODOS os defeitos da matriz como anotações em vez de parar no 1º (ciclo de descoberta). */
const REPORT_ONLY = process.env.E2E_REPORT_ONLY === '1';

const versionCode = (() => {
  try { return fs.readFileSync(path.resolve(__dirname, '../src/generated/buildInfo.ts'), 'utf8').match(/"versionCode":\s*"(\d+)"/)?.[1] ?? '0'; } catch { return '0'; }
})();
const sql = (q: string) => execSync(`${PG} "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();

async function login(request: APIRequestContext) {
  const r = await request.post(`${API}/auth/login`, { data: USER });
  expect(r.ok(), `login falhou: ${r.status()}`).toBeTruthy();
  return (await r.json()) as { token: string; patientId: string; user: { id: string } };
}
async function seed(context: BrowserContext, s: { token: string; patientId: string; user: unknown }) {
  await context.addInitScript((ctx) => {
    localStorage.setItem('token', ctx.token);
    localStorage.setItem('patientId', ctx.patientId); localStorage.setItem('selPatientId', ctx.patientId);
    localStorage.setItem('user', JSON.stringify(ctx.user));
    localStorage.setItem('onboarded', '1');
    localStorage.setItem(`whatsnew_vc_${ctx.vc}`, '1');
    localStorage.setItem('dxGoals', '[]');
    localStorage.setItem('motdShown', 'x');
    sessionStorage.setItem('coldDialogWinner', 'e2e'); // nenhum modal de boot disputa a tela
    sessionStorage.setItem('engagementSlot', 'survey'); // nem patrocinador
    // limpa "já dispensado" dos insights de teste — senão o sheet nem abre
    Object.keys(localStorage).filter((k) => k.startsWith('dx_cross_insight_dismissed_')).forEach((k) => localStorage.removeItem(k));
  }, { ...s, vc: versionCode });
}

/** Escala A: raiz rem. Verifica que pegou (o app não deve sobrescrever html.fontSize). */
async function setScale(page: Page, scale: number) {
  await page.evaluate((px) => { document.documentElement.style.fontSize = `${px}px`; }, 16 * scale);
  const got = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  expect(Math.abs(got - 16 * scale), `html.fontSize não aplicou (${got})`).toBeLessThan(0.5);
}

async function gotoNotifications(page: Page) {
  await page.goto(`${BASE_URL}/#/notificacoes`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/Notificações/).first()).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
}

/** Caminho controlado: evento que a página de notificações já escuta em produção. */
async function openControlled(page: Page, fx: InsightFixture) {
  await page.evaluate((f) => { window.dispatchEvent(new CustomEvent('openCrossInsight', { detail: f })); }, fx);
  const sheet = page.locator(SHEET);
  await expect(sheet).toBeVisible();
  // estados concretos: título e nº de métricas presentes (nunca medir antes disso)
  await expect(sheet.locator('h2')).toHaveText(fx.title);
  await expect(sheet.getByTestId('metric-chip')).toHaveCount(fx.metrics.length);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(260); // transição do Drawer (225ms) — medição só com o sheet parado
  return sheet;
}

async function closeSheet(page: Page) {
  await page.locator(SHEET).getByTestId('bottomsheet-primary-btn').click();
  await expect(page.locator(SHEET)).toHaveCount(0);
}

interface Issue { kind: string; el: string; text: string; measure: string }

/** Geometria compartilhada com o script Android (fixtures/sheet-geometry.mjs). */
const geometry = (page: Page): Promise<{ issues: Issue[]; stats: Record<string, number> }> => page.evaluate(sheetGeometry as any, SHEET) as any;

/** Ação principal: visível, habilitada, clicável de verdade e não encoberta. Padrão do
 *  componente = ação DEPOIS do conteúdo (rolagem interna no papel); com pouca altura ela
 *  precisa ser alcançável rolando — nunca reduzindo fonte. */
async function assertPrimaryReachable(page: Page, sheet: Locator, label: string) {
  const btn = sheet.getByTestId('bottomsheet-primary-btn');
  await expect(btn, label).toBeEnabled();
  const inView = await btn.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight + 1; });
  if (!inView) {
    await sheet.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(120);
  }
  await expect(btn, label).toBeVisible();
  await btn.click({ trial: true });
  const covered = await btn.evaluate((el) => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !(hit === el || el.contains(hit)); });
  expect(covered, `${label}: botão principal encoberto`).toBeFalsy();
  // último conteúdo alcançável por rolagem interna
  // ÚLTIMO botão do sheet em ordem de documento (querySelector('button:last-of-type') devolvia o
  // 1º match = botão Copiar, que legitimamente sai de vista ao rolar — falso positivo).
  const lastOk = await sheet.evaluate((el) => { const btns = el.querySelectorAll('button'); const last = btns[btns.length - 1] as HTMLElement; el.scrollTop = el.scrollHeight; const r = last.getBoundingClientRect(); return r.bottom <= window.innerHeight + 1 && r.top >= 0; });
  expect(lastOk, `${label}: último conteúdo não alcançável por rolagem`).toBeTruthy();
}

const fmtIssues = (label: string, issues: Issue[]) => `${label}\n` + issues.map((i) => `  - ${i.kind} ${i.el} "${i.text}" → ${i.measure}`).join('\n');

// ───────────────────────────────────────────────────────────────────────────────

let session: Awaited<ReturnType<typeof login>>;
test.beforeAll(async ({ request }) => { session = await login(request); });

// (sem modo serial: cada teste cria o próprio contexto; uma falha não deve pular os demais)

for (const scale of SCALES) {
  test(`A · escala CSS ${Math.round(scale * 100)}% — geometria, ação principal e rolagem em todas as fixtures`, async ({ browser }, info) => {
    const context = await browser.newContext(info.project.use);
    await seed(context, session);
    const page = await context.newPage();
    await gotoNotifications(page);
    await setScale(page, scale);
    const report: string[] = [];
    for (const [name, fx] of Object.entries(FIXTURES)) {
      const label = `[${info.project.name} · ${Math.round(scale * 100)}% · ${name}]`;
      const sheet = await openControlled(page, fx);
      const g = await geometry(page);
      report.push(`${label} ${JSON.stringify(g.stats)}`);
      if (REPORT_ONLY && g.issues.length) report.push(fmtIssues(label, g.issues)); else expect(g.issues, fmtIssues(label, g.issues)).toEqual([]);
      // escala realmente aplicada ao título (rem): ±8% (clamp/breakpoint podem arredondar)
      const expectedH2 = (info.project.name === 'desktop-1440' ? 24 : 20) * scale;
      expect(Math.abs(g.stats.h2px - expectedH2) / expectedH2, `${label} h2 ${g.stats.h2px}px esperado ~${expectedH2}px`).toBeLessThan(0.08);
      // status legível além da cor em TODAS as métricas (inclusive fixture sem label)
      const statuses = await sheet.getByTestId('metric-status').allTextContents();
      expect(statuses.every((s) => /Elevado|Normal|Baixo/.test(s)), `${label} status só por cor: ${JSON.stringify(statuses)}`).toBeTruthy();
      await assertPrimaryReachable(page, sheet, label);
      await closeSheet(page);
    }
    test.info().annotations.push({ type: 'matriz', description: report.join('\n') });
    if (REPORT_ONLY) console.log(report.join('\n'));
    await context.close();
  });
}

test('B · text-size-adjust (cenário separado): documenta o comportamento do motor, não substitui o Android', async ({ browser }, info) => {
  const context = await browser.newContext(info.project.use);
  await seed(context, session);
  const page = await context.newPage();
  await gotoNotifications(page);
  const sheet = await openControlled(page, BASE);
  const before = await sheet.locator('h2').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  await page.evaluate(() => { document.body.style.setProperty('-webkit-text-size-adjust', '150%'); });
  await page.waitForTimeout(120);
  const after = await sheet.locator('h2').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  // Chromium desktop/emulado IGNORA text-size-adjust (só Chrome Android/Safari iOS aplicam).
  // Registro: se um dia mudar, este teste avisa — a escala real continua sendo validada no emulador.
  test.info().annotations.push({ type: 'text-size-adjust', description: `${info.project.name}: h2 ${before}px → ${after}px com -webkit-text-size-adjust:150% (${before === after ? 'ignorado pelo motor' : 'aplicado'})` });
  expect(after).toBeGreaterThanOrEqual(before);
  await closeSheet(page);
  await context.close();
});

test('rolagem: fundo travado, posição preservada ao fechar, safe-area no rodapé, abrir/fechar ×5 sem duplicar', async ({ browser }, info) => {
  const context = await browser.newContext(info.project.use);
  await seed(context, session);
  const page = await context.newPage();
  await gotoNotifications(page);
  await setScale(page, 1.5);
  // espera a lista renderizar (senão scrollTo não pega) e rola a página 80px antes de abrir
  await page.locator('[role="button"]').first().waitFor({ timeout: 30_000 });
  // lista estável (a altura da página para de mudar) antes de medir posições
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollHeight), { timeout: 15_000, intervals: [300, 300, 300] }).toBeGreaterThan(0);
  let lastH = -1; for (let i = 0; i < 20; i++) { const h = await page.evaluate(() => document.documentElement.scrollHeight); if (h === lastH) break; lastH = h; await page.waitForTimeout(300); }
  await page.evaluate(() => window.scrollTo(0, 80));
  // scrollY estável por 2 leituras seguidas (layout tardio acima do viewport dispara ancoragem de
  // scroll e move a página sozinho — nada a ver com o sheet); só então abre.
  let yBefore = -1; for (let i = 0; i < 12; i++) { const y = await page.evaluate(() => Math.round(window.scrollY)); if (y === yBefore) break; yBefore = y; await page.waitForTimeout(400); }
  const sheet = await openControlled(page, FIXTURES.longSummary);
  const yAtOpen = await page.evaluate(() => Math.round(window.scrollY));
  // Ao abrir, o lock do MUI (overflow hidden no body) pode reacomodar o fundo em poucos px
  // (observado: 8px). Sob o backdrop isso é imperceptível; o que importa é não rolar com a
  // roda (abaixo) e restaurar ao fechar (adiante). Tolerância 12px.
  expect(Math.abs(yAtOpen - yBefore), `abrir o sheet moveu a página (${yBefore} → ${yAtOpen})`).toBeLessThanOrEqual(12);
  const bodyOverflow = await page.evaluate(() => getComputedStyle(document.body).overflow);
  expect(bodyOverflow, 'MUI Modal deve travar o scroll do fundo').toBe('hidden');
  // tentativa de rolar o fundo com a roda sobre o backdrop: viewport não pode mover
  await page.mouse.move(10, 10); await page.mouse.wheel(0, 400); await page.waitForTimeout(200);
  const yDuring = await page.evaluate(() => Math.round(window.scrollY));
  expect(yDuring, `fundo rolou com o sheet aberto (${yAtOpen} → ${yDuring})`).toBe(yAtOpen);
  // rolagem interna até o fim
  const reached = await sheet.evaluate((el) => { el.scrollTop = el.scrollHeight; return Math.abs(el.scrollTop + el.clientHeight - el.scrollHeight) <= 2; });
  expect(reached).toBeTruthy();
  // safe-area: padding inferior do conteúdo ≥ 24px (max(1.5rem, env()) — env() = 0 no navegador)
  const pb = await sheet.evaluate((el) => parseFloat(getComputedStyle(el.firstElementChild as HTMLElement).paddingBottom));
  expect(pb).toBeGreaterThanOrEqual(24 * 1.5 - 1);
  await closeSheet(page);
  const restored = await page.evaluate(() => ({ overflow: getComputedStyle(document.body).overflow, y: Math.round(window.scrollY) }));
  expect(restored.overflow).not.toBe('hidden');
  // mesma tolerância da abertura (a lista ainda pode crescer alguns px enquanto carrega);
  // o defeito que se quer pegar é "voltou pro topo" / "pulou de posição".
  expect(Math.abs(restored.y - yBefore), `posição da página não preservada ao fechar (${yBefore} → ${restored.y})`).toBeLessThanOrEqual(12);
  // abrir/fechar repetido: nunca 2 overlays, nada sobra no DOM
  for (let i = 0; i < 5; i++) {
    await openControlled(page, i % 2 ? FIXTURES.short : FIXTURES.base);
    // .MuiDrawer-modal = só drawers TEMPORÁRIOS (o menu lateral do desktop também é um MuiDrawer, permanente)
    expect(await page.locator('.MuiDrawer-modal').count(), 'mais de um overlay modal').toBe(1);
    expect(await page.locator('.MuiDrawer-modal .MuiBackdrop-root:visible').count(), 'backdrop duplicado/ausente').toBe(1);
    await closeSheet(page);
    expect(await page.locator('.MuiDrawer-modal').count(), 'overlay sobrou no DOM após fechar').toBe(0);
  }
  await context.close();
});

test('acessibilidade: dialog nomeado, foco contido, Esc fecha, nomes nos botões, alvos de toque', async ({ browser }, info) => {
  const context = await browser.newContext(info.project.use);
  await seed(context, session);
  const page = await context.newPage();
  await gotoNotifications(page);
  await setScale(page, 1.25);
  const sheet = await openControlled(page, FIXTURES.minimal);
  await expect(sheet).toHaveAttribute('role', 'dialog');
  await expect(sheet).toHaveAttribute('aria-modal', 'true');
  const name = await sheet.evaluate((el) => document.getElementById(el.getAttribute('aria-labelledby')!)?.textContent?.trim());
  expect(name).toBe(FIXTURES.minimal.title);
  const desc = await sheet.evaluate((el) => document.getElementById(el.getAttribute('aria-describedby')!)?.textContent?.trim());
  expect(desc).toBe(FIXTURES.minimal.clinical_summary);
  // foco inicial dentro do diálogo
  const focusInside = await sheet.evaluate((el) => el === document.activeElement || el.contains(document.activeElement));
  expect(focusInside, 'foco inicial fora do sheet').toBeTruthy();
  // Tab ×6 nunca sai do diálogo (contenção)
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); const inside = await sheet.evaluate((el) => el.contains(document.activeElement)); expect(inside, `Tab #${i + 1} saiu do diálogo`).toBeTruthy(); }
  // nomes acessíveis
  await expect(sheet.getByRole('button', { name: /Copiar pergunta/ })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Entendido' })).toBeVisible();
  // alvos de toque ≥ 44px nos botões
  for (const b of await sheet.locator('button').all()) { const box = (await b.boundingBox())!; expect(box.height, 'alvo de toque < 44px').toBeGreaterThanOrEqual(43); expect(box.width).toBeGreaterThanOrEqual(43); }
  // Esc fecha
  await page.keyboard.press('Escape');
  await expect(page.locator(SHEET)).toHaveCount(0);
  await context.close();
});

test('jornada real: notificação → toque → sheet com conteúdo → ação principal fecha e devolve o foco', async ({ browser, request }, info) => {
  const id = `e2e-ins-${Date.now().toString(36)}`;
  const data = JSON.stringify({ crossInsight: { ...BASE, signature: `e2e-journey-${id}` } }).replace(/'/g, "''");
  sql(`INSERT INTO notifications (id, "userId", type, title, body, data, read, "createdAt") VALUES ('${id}', '${session.user.id}', 'info', 'Cruzamento clínico: músculo × fígado', 'Toque para ver a leitura educativa dos seus marcadores.', '${data}'::jsonb, false, now())`);
  try {
    const context = await browser.newContext(info.project.use);
    await seed(context, session);
    const page = await context.newPage();
    await gotoNotifications(page);
    await setScale(page, 1.25);
    const item = page.getByRole('button', { name: /Cruzamento clínico: músculo × fígado/ }).first();
    await expect(item).toBeVisible({ timeout: 30_000 });
    await item.focus();
    await item.press('Enter'); // ativação por teclado — o item é role=button com tabIndex=0
    const sheet = page.locator(SHEET);
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('h2')).toHaveText(BASE.title);
    await expect(sheet.getByTestId('metric-chip')).toHaveCount(3);
    await expect(sheet.getByText('CK:')).toBeVisible();
    await expect(sheet.getByText('Modo Esporte')).toBeVisible();
    const g = await geometry(page);
    expect(g.issues, fmtIssues('[jornada real]', g.issues)).toEqual([]);
    await page.screenshot({ path: `e2e/screenshots/insight-journey-${info.project.name}.png` });
    await sheet.getByTestId('bottomsheet-primary-btn').click();
    await expect(page.locator(SHEET)).toHaveCount(0);
    // foco volta ao item que abriu
    const focusBack = await item.evaluate((el) => el === document.activeElement || el.contains(document.activeElement));
    expect(focusBack, 'foco não voltou ao gatilho').toBeTruthy();
    // dispensa persistida (anti-spam) e notificação marcada como lida
    const dismissed = await page.evaluate((sig) => !!localStorage.getItem(`dx_cross_insight_dismissed_${sig}`), `e2e-journey-${id}`);
    expect(dismissed).toBeTruthy();
    await expect.poll(() => sql(`SELECT read FROM notifications WHERE id='${id}'`)).toBe('t');
    await context.close();
  } finally {
    sql(`DELETE FROM notifications WHERE id='${id}'`);
  }
});

/** Regressão visual: subconjunto representativo (inclui os piores casos). Sheet recortado
 *  para defeito local + 1 viewport inteira por projeto para overlay/posicionamento. */
const VISUAL: { scale: number; fixture: keyof typeof FIXTURES; viewport?: boolean }[] = [
  { scale: 1, fixture: 'base', viewport: true },
  { scale: 2, fixture: 'longTitle' },
  { scale: 1.5, fixture: 'manyMetrics' },
  { scale: 2, fixture: 'longMetric' },
  { scale: 0.85, fixture: 'short' },
];
for (const v of VISUAL) {
  test(`visual · ${Math.round(v.scale * 100)}% · ${v.fixture}`, async ({ browser }, info) => {
    const context = await browser.newContext({ ...info.project.use, reducedMotion: 'reduce' });
    await seed(context, session);
    const page = await context.newPage();
    await gotoNotifications(page);
    await setScale(page, v.scale);
    const sheet = await openControlled(page, FIXTURES[v.fixture]);
    await page.evaluate(() => document.fonts.ready);
    await expect(sheet).toHaveScreenshot(`sheet-${v.fixture}-${Math.round(v.scale * 100)}.png`);
    if (v.viewport) await expect(page).toHaveScreenshot(`viewport-${v.fixture}-${Math.round(v.scale * 100)}.png`, { fullPage: false });
    await closeSheet(page);
    await context.close();
  });
}
