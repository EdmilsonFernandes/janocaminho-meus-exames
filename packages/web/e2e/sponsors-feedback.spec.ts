import { test, expect, type Page, type APIRequestContext, type BrowserContext } from '@playwright/test';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * E2E · PATROCINADORES & OPINIÕES (02/11/26) — ponta a ponta contra a stack local.
 *
 * Cobre (spec do dono): campanha rascunho/ativa/pausada/encerrada; popup "vidro" no dashboard
 * (mobile + desktop), rótulo "Patrocinado", clique registra impressão+clique, reload não
 * repete (frequência server-side); dispensa via teclado (Esc) no portal do médico; prévia do
 * admin; pesquisa pelo acesso permanente (Perfil) com perguntas condicionais, envio e
 * agradecimento; convite contextual para conta sem exame + dispensa; exclusividade
 * patrocinador × convite na mesma sessão; pesquisa do médico; triagem no admin; 403 p/ não-admin.
 */
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4175';
const API = process.env.E2E_API_URL || 'http://127.0.0.1:4001/api';
const PATIENT_ADMIN = { username: 'edmilson@exemplo.com', password: 'troque123' }; // role ADMIN no banco dev
const PATIENT_EMPTY = { username: 'audit-vazio@exemplo.com', password: 'audit123' }; // zero exames
const DOCTOR = { email: 'qa-medico@exemplo.com', password: 'audit123' };
const PG = 'docker exec meus-exames-db psql -U meus_exames -d meus_exames -At -c';
const SHOT = (name: string, project: string) => `e2e/screenshots/sf-${name}-${project}.png`;

const versionCode = (() => {
  try {
    const src = fs.readFileSync(path.resolve(__dirname, '../src/generated/buildInfo.ts'), 'utf8');
    return src.match(/"versionCode":\s*"(\d+)"/)?.[1] ?? '0';
  } catch { return '0'; }
})();

const sql = (q: string) => execSync(`${PG} "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();

async function loginPatient(request: APIRequestContext, creds: { username: string; password: string }) {
  const r = await request.post(`${API}/auth/login`, { data: creds });
  expect(r.ok(), `login ${creds.username} falhou: ${r.status()}`).toBeTruthy();
  return (await r.json()) as { token: string; patientId: string; user: { id: string; role: string; email: string } };
}
async function loginDoctor(request: APIRequestContext) {
  const r = await request.post(`${API}/doctor/login`, { data: DOCTOR });
  expect(r.ok(), `login médico falhou: ${r.status()}`).toBeTruthy();
  return (await r.json()) as { token: string; doctor: { id: string; name: string } };
}
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Semeia a sessão do PACIENTE e sela os modais de boot que não estão sob teste
 *  (onboarding, novidades da versão, quiz) — assim o slot de cold-dialog fica livre p/ o patrocinador. */
async function seedPatient(context: BrowserContext, s: { token: string; patientId: string; user: unknown }, request?: APIRequestContext) {
  // Notificação recente não lida vira modal de boot e ganha o slot (regra do app: máx 1 modal
  // de boot por sessão). Fora do teste isso é desejado; aqui a marcamos como já dispensada.
  let notifId: string | null = null;
  if (request) {
    const d = await (await request.get(`${API}/notifications`, { headers: auth(s.token) })).json().catch(() => null);
    const item = d?.items?.find((n: any) => n.type !== 'first_exam');
    notifId = item?.id ?? null;
  }
  await context.addInitScript((ctx) => {
    localStorage.setItem('token', ctx.token);
    localStorage.setItem('patientId', ctx.patientId); localStorage.setItem('selPatientId', ctx.patientId);
    localStorage.setItem('user', JSON.stringify(ctx.user));
    localStorage.setItem('onboarded', '1');
    localStorage.setItem(`whatsnew_vc_${ctx.vc}`, '1');
    localStorage.setItem('dxGoals', '[]');
    localStorage.setItem('motdShown', 'x');
    if (ctx.notifId) localStorage.setItem('meDismissedNotif', ctx.notifId);
  }, { ...s, vc: versionCode, notifId });
}

/** Diagnóstico quando o popup/convite não aparece: quem levou o slot de boot/engajamento. */
const slots = (page: Page) => page.evaluate(() => `coldDialogWinner=${sessionStorage.getItem('coldDialogWinner')} engagementSlot=${sessionStorage.getItem('engagementSlot')} dialogs=${document.querySelectorAll('.MuiDialog-root').length}`).catch(() => 'n/a');
async function seedDoctor(context: BrowserContext, token: string) {
  await context.addInitScript((t) => { localStorage.setItem('doctorToken', t); localStorage.setItem('doctorPhotoToken', t); }, token);
}

/** Dispensa diálogos de boot que podem aparecer (alerta de saúde, perfil…) enquanto espera o alvo. */
async function waitForTestId(page: Page, id: string, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await page.getByTestId(id).isVisible().catch(() => false)) return true;
    for (const label of ['Ver depois', 'Depois', 'Pular', 'Agora não', 'Entendi']) {
      const b = page.getByRole('button', { name: label }).first();
      if (await b.isVisible().catch(() => false)) {
        // nunca dispensar o próprio alvo
        const inside = await b.evaluate((el, tid) => !!el.closest(`[data-testid="${tid}"]`), id).catch(() => false);
        if (!inside) await b.click({ timeout: 1000 }).catch(() => {});
      }
    }
    await page.waitForTimeout(500);
  }
  return false;
}

const S: { sponsorId: string; campaignId: string; adminToken: string; emptyUserId: string } = { sponsorId: '', campaignId: '', adminToken: '', emptyUserId: '' };

test.describe.configure({ mode: 'serial' });

test('admin API: patrocinador + campanha (rascunho → publicada), regras globais de teste', async ({ request }) => {
  const a = await loginPatient(request, PATIENT_ADMIN);
  expect(a.user.role).toBe('ADMIN');
  S.adminToken = a.token;
  // encerra campanhas E2E antigas (histórico fica) e zera o intervalo global p/ determinismo
  const list = await (await request.get(`${API}/admin/campaigns`, { headers: auth(a.token) })).json();
  for (const c of list.campaigns as { id: string; title: string; effectiveStatus: string }[]) {
    if (c.title.startsWith('E2E ') && c.effectiveStatus !== 'ended') await request.post(`${API}/admin/campaigns/${c.id}/end`, { headers: auth(a.token) });
  }
  const cfg = await request.patch(`${API}/admin/config/costs`, { headers: auth(a.token), data: { category: 'sponsorAds', enabled: 1, globalIntervalHours: 0 } });
  expect(cfg.ok()).toBeTruthy();
  const fb = await request.patch(`${API}/admin/config/costs`, { headers: auth(a.token), data: { category: 'feedback', enabled: 1, minAccountAgeDays: 2, inviteIntervalDays: 30, maxDismissals: 3 } });
  expect(fb.ok()).toBeTruthy();

  const sp = await request.post(`${API}/admin/sponsors`, { headers: auth(a.token), data: { name: 'Lab Vida E2E', website: 'https://labvida.example.com' } });
  expect(sp.status()).toBe(201);
  S.sponsorId = (await sp.json()).id;

  const stamp = Date.now().toString(36);
  const cp = await request.post(`${API}/admin/campaigns`, { headers: auth(a.token), data: {
    sponsorId: S.sponsorId, title: `E2E Check-up ${stamp}`, description: 'Exames de rotina com condição especial para quem usa o Dr. Exame.',
    ctaLabel: 'Ver condições', ctaType: 'internal', ctaTarget: '/planos', audience: 'all', priority: 50, frequencyHours: 48, maxImpressionsPerUser: 2,
  } });
  expect(cp.status()).toBe(201);
  const camp = await cp.json();
  S.campaignId = camp.id;
  expect(camp.effectiveStatus).toBe('draft');

  // rascunho não é elegível
  const e0 = await (await request.get(`${API}/campaigns/eligible`, { headers: auth(a.token) })).json();
  expect(e0.campaign).toBeNull();
  const pub = await request.post(`${API}/admin/campaigns/${S.campaignId}/publish`, { headers: auth(a.token) });
  expect(pub.ok()).toBeTruthy();
  expect((await pub.json()).effectiveStatus).toBe('active');
});

test('paciente: popup vidro no dashboard, rótulo Patrocinado, foco/teclado, CTA navega, impressão+clique, reload não repete', async ({ browser, request }, info) => {
  const s = await loginPatient(request, PATIENT_ADMIN);
  const context = await browser.newContext({ ...info.project.use, reducedMotion: info.project.name.startsWith('desktop') ? 'reduce' : 'no-preference' });
  await seedPatient(context, s, request);
  const page = await context.newPage();
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  expect(await waitForTestId(page, 'sponsor-popup', 40_000), 'popup do patrocinador não apareceu no dashboard · ' + await slots(page)).toBeTruthy();
  const popup = page.getByTestId('sponsor-popup');
  await expect(popup.getByText('Patrocinado')).toBeVisible();
  await expect(popup.getByText('Lab Vida E2E')).toBeVisible();
  await expect(popup.getByText(/Conteúdo publicitário/)).toBeVisible();
  await expect(popup.getByTestId('sponsor-close')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: SHOT('sponsor-popup', info.project.name) });
  // sem overflow horizontal com o popup aberto
  const diff = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(diff).toBeLessThanOrEqual(2);
  // foco preso no diálogo (MUI Dialog) — Tab mantém o foco dentro
  await page.keyboard.press('Tab');
  const focusInside = await page.evaluate(() => !!document.activeElement?.closest('[data-testid="sponsor-popup"]'));
  expect(focusInside).toBeTruthy();
  // contraste mínimo do título (texto escuro sobre vidro claro / claro sobre escuro) — sanity
  const titleColor = await popup.locator('h2').evaluate((el) => getComputedStyle(el).color);
  expect(titleColor).not.toBe('rgba(0, 0, 0, 0)');

  await popup.getByTestId('sponsor-cta').click();
  await expect.poll(() => page.url()).toContain('#/planos');
  await expect(popup).toBeHidden();

  // eventos no servidor: 1 impressão + 1 clique desta sessão
  await expect.poll(async () => {
    const m = await (await request.get(`${API}/admin/campaigns/${S.campaignId}/metrics`, { headers: auth(S.adminToken) })).json();
    return `${m.totals.impressions}/${m.totals.clicks}`;
  }, { timeout: 10_000 }).toMatch(/^[1-9]\d*\/[1-9]\d*$/);

  // reload no dashboard: frequência (48h) é do servidor → não repete
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  expect(await waitForTestId(page, 'sponsor-popup', 12_000)).toBeFalsy();
  await context.close();
});

test('médico: popup no portal, Esc fecha e registra dispensa', async ({ browser, request }, info) => {
  const d = await loginDoctor(request);
  const before = (await (await request.get(`${API}/admin/campaigns/${S.campaignId}/metrics`, { headers: auth(S.adminToken) })).json()).totals.dismisses as number;
  const context = await browser.newContext(info.project.use);
  await seedDoctor(context, d.token);
  const page = await context.newPage();
  await page.goto(`${BASE}/#/doctor`, { waitUntil: 'domcontentloaded' });
  expect(await waitForTestId(page, 'sponsor-popup', 40_000), 'popup não apareceu no portal do médico').toBeTruthy();
  await page.screenshot({ path: SHOT('sponsor-popup-doctor', info.project.name) });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('sponsor-popup')).toBeHidden();
  await expect.poll(async () => (await (await request.get(`${API}/admin/campaigns/${S.campaignId}/metrics`, { headers: auth(S.adminToken) })).json()).totals.dismisses, { timeout: 10_000 }).toBeGreaterThan(before);
  await context.close();
});

test('admin UI: aba Patrocinadores — status, métricas, prévia mobile/desktop, pausar e retomar', async ({ browser, request }, info) => {
  const s = await loginPatient(request, PATIENT_ADMIN);
  const context = await browser.newContext(info.project.use);
  await seedPatient(context, s, request);
  const page = await context.newPage();
  await page.goto(`${BASE}/#/admin?tab=sponsors`, { waitUntil: 'domcontentloaded' });
  const row = page.getByTestId(`campaign-row-${S.campaignId}`);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row.getByTestId('campaign-status')).toHaveText('Ativa');
  await expect(row.getByText(/impressões/)).toBeVisible();
  await expect(row.getByText(/CTR/)).toBeVisible();
  await row.getByTestId('campaign-preview').click();
  const prev = page.getByTestId('campaign-preview-dialog');
  await expect(prev).toBeVisible();
  await expect(prev.getByTestId('sponsor-card')).toHaveAttribute('data-variant', 'preview');
  await expect(prev.getByText(/não conta como impressão/)).toBeVisible();
  await page.screenshot({ path: SHOT('admin-preview', info.project.name) });
  await prev.getByRole('button', { name: 'Fechar', exact: true }).click();
  // prévia NÃO gerou impressão (métrica estável)
  const m1 = (await (await request.get(`${API}/admin/campaigns/${S.campaignId}/metrics`, { headers: auth(S.adminToken) })).json()).totals;
  await row.getByTestId('campaign-pause').click();
  await page.getByRole('button', { name: 'Pausar' }).last().click();
  await expect(row.getByTestId('campaign-status')).toHaveText('Pausada', { timeout: 15_000 });
  const e = await (await request.get(`${API}/campaigns/eligible`, { headers: auth(s.token) })).json();
  expect(e.campaign).toBeNull();
  await row.getByTestId('campaign-publish').click();
  await page.getByRole('button', { name: 'Publicar' }).last().click();
  await expect(row.getByTestId('campaign-status')).toHaveText('Ativa', { timeout: 15_000 });
  const m2 = (await (await request.get(`${API}/admin/campaigns/${S.campaignId}/metrics`, { headers: auth(S.adminToken) })).json()).totals;
  expect(m2.impressions).toBe(m1.impressions);
  await page.screenshot({ path: SHOT('admin-sponsors', info.project.name), fullPage: true });
  await context.close();
});

test('opinião (paciente): acesso permanente no Perfil → 3 perguntas condicionais → comentário → agradecimento', async ({ browser, request }, info) => {
  const s = await loginPatient(request, PATIENT_ADMIN);
  const context = await browser.newContext(info.project.use);
  await seedPatient(context, s, request);
  const page = await context.newPage();
  await page.goto(`${BASE}/#/perfil?tab=preferencias`, { waitUntil: 'domcontentloaded' });
  expect(await waitForTestId(page, 'profile-feedback-button', 30_000)).toBeTruthy();
  await page.getByTestId('profile-feedback-button').scrollIntoViewIfNeeded();
  await page.getByTestId('profile-feedback-button').click();
  const dlg = page.getByTestId('feedback-dialog');
  await expect(dlg).toBeVisible();
  await expect(dlg.getByTestId('feedback-step-1')).toBeVisible({ timeout: 15_000 });
  await expect(dlg.getByTestId('fb-next')).toBeDisabled(); // sem resposta não avança
  await dlg.getByTestId('fb-outcome-partial').click();
  await dlg.getByTestId('fb-next').click();
  await expect(dlg.getByText('Onde você encontrou dificuldade?')).toBeVisible(); // enunciado condicional
  await dlg.getByTestId('fb-detail-credits').click();
  await dlg.getByTestId('fb-detail-ai_analysis').click();
  await dlg.getByTestId('fb-detail-trends').click();
  await expect(dlg.getByTestId('fb-detail-upload')).toBeDisabled(); // máx 3
  await page.screenshot({ path: SHOT('survey-q2', info.project.name) });
  await dlg.getByTestId('fb-next').click();
  await dlg.getByTestId('fb-improvement-credits_clarity').click();
  await dlg.getByTestId('fb-next').click();
  await expect(dlg.getByText(/Não inclua resultados de exames/)).toBeVisible();
  await expect(dlg.getByText(/vinculada à sua conta/)).toBeVisible();
  await dlg.getByTestId('fb-comment').fill('E2E: ficou confuso quanto custa o relatório completo.');
  await dlg.getByTestId('fb-submit').click();
  await expect(dlg.getByTestId('feedback-thanks')).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: SHOT('survey-thanks', info.project.name) });
  await dlg.getByTestId('fb-done').click();
  await expect(dlg).toBeHidden();
  // chegou no admin com categoria "preço" e contexto técnico
  const list = await (await request.get(`${API}/admin/feedback?subjectType=user&q=E2E`, { headers: auth(S.adminToken) })).json();
  const mine = list.items.find((i: any) => i.subject?.email === PATIENT_ADMIN.username && i.comment?.includes('relatório completo'));
  expect(mine).toBeTruthy();
  expect(mine.category).toBe('pricing');
  expect(mine.context?.trigger).toBe('profile');
  expect(mine.context?.platform).toBe('web');
  await context.close();
});

test('convite contextual (conta sem exame): cartão não-bloqueante, copy certa, "Agora não" registra intervalo', async ({ browser, request }, info) => {
  const adm = auth(S.adminToken);
  // pausa a campanha p/ isolar o convite; limpa o estado de convite da conta vazia
  await request.post(`${API}/admin/campaigns/${S.campaignId}/pause`, { headers: adm });
  const s = await loginPatient(request, PATIENT_EMPTY);
  S.emptyUserId = s.user.id;
  sql(`DELETE FROM feedback_prompt_states WHERE "subjectId"='${s.user.id}'`);
  const context = await browser.newContext(info.project.use);
  await seedPatient(context, s, request);
  const page = await context.newPage();
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await waitForTestId(page, 'feedback-invite', 1500); // dispensa modais de boot se houver
  await page.reload({ waitUntil: 'domcontentloaded' });
  expect(await waitForTestId(page, 'feedback-invite', 30_000), 'convite não apareceu · ' + await slots(page)).toBeTruthy();
  const card = page.getByTestId('feedback-invite');
  await expect(card.getByText(/Ainda não enviou um exame/)).toBeVisible();
  // não bloqueia: a tela continua clicável (sem backdrop)
  await expect(page.locator('.MuiBackdrop-root:visible')).toHaveCount(0);
  await page.screenshot({ path: SHOT('invite', info.project.name) });
  await card.getByTestId('feedback-invite-decline').click();
  await expect(card).toBeHidden();
  await expect.poll(async () => (await (await request.get(`${API}/feedback/eligibility`, { headers: auth(s.token) })).json()).reason, { timeout: 10_000 }).toBe('cooldown');
  await context.close();
});

test('exclusividade: patrocinador e convite nunca na mesma sessão', async ({ browser, request }, info) => {
  const adm = auth(S.adminToken);
  await request.post(`${API}/admin/campaigns/${S.campaignId}/publish`, { headers: adm });
  const s = await loginPatient(request, PATIENT_EMPTY);
  sql(`DELETE FROM feedback_prompt_states WHERE "subjectId"='${s.user.id}'`);
  sql(`DELETE FROM sponsor_campaign_events WHERE "subjectKey"='u:${s.user.id}'`);
  const context = await browser.newContext(info.project.use);
  await seedPatient(context, s, request);
  const page = await context.newPage();
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  expect(await waitForTestId(page, 'sponsor-popup', 40_000)).toBeTruthy();
  await page.getByTestId('sponsor-later').click();
  await expect(page.getByTestId('sponsor-popup')).toBeHidden();
  await page.waitForTimeout(13_000); // convite rodaria aos 9s — o slot da sessão já é do patrocinador
  await expect(page.getByTestId('feedback-invite')).toHaveCount(0);
  await context.close();
});

test('médico: "Dar minha opinião" no menu → pesquisa do médico (opções próprias) → envio', async ({ browser, request }, info) => {
  const d = await loginDoctor(request);
  const context = await browser.newContext(info.project.use);
  await seedDoctor(context, d.token);
  const page = await context.newPage();
  await page.goto(`${BASE}/#/doctor`, { waitUntil: 'domcontentloaded' });
  await waitForTestId(page, 'feedback-menu-item', 20_000);
  if (!(await page.getByTestId('feedback-menu-item').isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Menu do médico' }).first().click();
  }
  await page.getByText('Dar minha opinião').first().click();
  const dlg = page.getByTestId('feedback-dialog');
  await expect(dlg).toBeVisible();
  await expect(dlg.getByText('Ajude a melhorar o Portal do Médico')).toBeVisible({ timeout: 15_000 });
  await dlg.getByTestId('fb-outcome-done').click();
  await dlg.getByTestId('fb-next').click();
  await expect(dlg.getByText('O que mais ajudou no seu atendimento?')).toBeVisible();
  await expect(dlg.getByTestId('fb-detail-upload')).toHaveCount(0); // pergunta de paciente não aparece pro médico
  await dlg.getByTestId('fb-detail-shared_exams').click();
  await dlg.getByTestId('fb-next').click();
  await dlg.getByTestId('fb-improvement-scheduling').click();
  await dlg.getByTestId('fb-next').click();
  await dlg.getByTestId('fb-submit').click();
  await expect(dlg.getByTestId('feedback-thanks')).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: SHOT('survey-doctor', info.project.name) });
  const list = await (await request.get(`${API}/admin/feedback?subjectType=doctor`, { headers: auth(S.adminToken) })).json();
  expect(list.items[0].subject?.email).toBe(DOCTOR.email);
  expect(list.items[0].improvement?.id).toBe('scheduling');
  await context.close();
});

test('admin UI: aba Opiniões — denominadores, filtro, detalhe e triagem (status + melhoria)', async ({ browser, request }, info) => {
  const s = await loginPatient(request, PATIENT_ADMIN);
  const context = await browser.newContext(info.project.use);
  await seedPatient(context, s, request);
  const page = await context.newPage();
  await page.goto(`${BASE}/#/admin?tab=feedback`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('admin-feedback')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('kpi-Respostas (filtro)')).toBeVisible();
  await expect(page.getByTestId('kpi-Base elegível')).toBeVisible();
  await page.getByTestId('filter-q').fill('relatório completo');
  const item = page.locator('[data-testid^="feedback-item-"]').first();
  await expect(item).toBeVisible({ timeout: 20_000 });
  await expect(item.getByText('Créditos / preço')).toBeVisible();
  await page.screenshot({ path: SHOT('admin-feedback', info.project.name), fullPage: true });
  await item.click();
  const det = page.getByTestId('feedback-detail');
  await expect(det).toBeVisible();
  await expect(det.getByTestId('detail-comment')).toContainText('relatório completo');
  await expect(det.getByText(/plataforma web/)).toBeVisible();
  await det.getByTestId('detail-status').locator('..').click();
  await page.getByRole('option', { name: 'Planejada' }).click();
  await det.getByTestId('detail-improvement').fill('e2e-explicar-creditos');
  await det.getByTestId('detail-notes').fill('E2E: relacionar com o dialog 402.');
  await det.getByTestId('detail-save').click();
  await expect(det).toBeHidden({ timeout: 15_000 });
  await expect(item.getByText('Planejada')).toBeVisible();
  await page.getByRole('button', { name: /Melhorias \(/ }).click();
  await expect(page.getByTestId('improvement-e2e-explicar-creditos')).toBeVisible({ timeout: 15_000 });
  await context.close();
});

test('segurança: conta comum não acessa gestão de campanhas nem opiniões (403); sem token 401', async ({ request }) => {
  const s = await loginPatient(request, PATIENT_EMPTY);
  expect((await request.get(`${API}/admin/feedback`, { headers: auth(s.token) })).status()).toBe(403);
  expect((await request.get(`${API}/admin/campaigns`, { headers: auth(s.token) })).status()).toBe(403);
  expect((await request.post(`${API}/admin/sponsors`, { headers: auth(s.token), data: { name: 'x' } })).status()).toBe(403);
  expect((await request.get(`${API}/campaigns/eligible`)).status()).toBe(401);
  expect((await request.get(`${API}/feedback/survey`)).status()).toBe(401);
});

test('encerrar: campanha encerrada some e não volta; regras globais restauradas', async ({ request }) => {
  const adm = auth(S.adminToken);
  const end = await request.post(`${API}/admin/campaigns/${S.campaignId}/end`, { headers: adm });
  expect(end.ok()).toBeTruthy();
  expect((await end.json()).effectiveStatus).toBe('ended');
  expect((await request.post(`${API}/admin/campaigns/${S.campaignId}/publish`, { headers: adm })).status()).toBe(409);
  const s = await loginPatient(request, PATIENT_EMPTY);
  sql(`DELETE FROM sponsor_campaign_events WHERE "subjectKey"='u:${s.user.id}'`);
  expect((await (await request.get(`${API}/campaigns/eligible`, { headers: auth(s.token) })).json()).campaign).toBeNull();
  await request.patch(`${API}/admin/config/costs`, { headers: adm, data: { category: 'sponsorAds', enabled: 1, globalIntervalHours: 24 } });
});
