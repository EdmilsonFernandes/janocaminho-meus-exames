/**
 * QA da jornada de verificação de identidade do médico (KYC UaiID) — Task W1, 29/10/26.
 *
 * Playwright (lib) contra o vite dev (E2E_BASE_URL, default http://127.0.0.1:5181) com TODA a API
 * simulada via `context.route('**\/api\/**')` — não precisa de backend nem do UaiID. Cobre CADA linha
 * da matriz de estados do plano (+ 429 nas duas variantes, 503, CPF, suspensa, o estado "Conferindo"
 * vindo de `?kyc=1` com o fallback de 90 s, a volta do UaiID com `status=approved` na URL, 401, rede),
 * em 375×800 e 1280×800, claro e escuro, com asserts de texto/ARIA, sem scroll horizontal, alvos de
 * 48 px, tema realmente aplicado e screenshots em KYC_SHOTS_DIR (default …\Temp\kyc-web-shots\w1).
 *
 * Como rodar (do packages/web, com o vite dev no ar na 5181):
 *   node e2e/qa-kyc-medico.mjs                  # tudo
 *   QA_ONLY=intro node e2e/qa-kyc-medico.mjs     # só os cenários cujo id casa o regex
 *   QA_FAST=1 node e2e/qa-kyc-medico.mjs         # só 375 claro (iteração rápida)
 *
 * Os 90 s do "Conferindo" são avançados com o relógio falso do Playwright (page.clock) — o produto não
 * tem nenhum override de tempo.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';

const BASE = (process.env.E2E_BASE_URL || 'http://127.0.0.1:5181').replace(/\/$/, '');
const OUT = process.env.KYC_SHOTS_DIR || 'C:/Users/esantos/AppData/Local/Temp/kyc-web-shots/w1';
const ONLY = process.env.QA_ONLY ? new RegExp(process.env.QA_ONLY) : null;
const FAST = !!process.env.QA_FAST;
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = FAST ? [{ w: 375, h: 800 }] : [{ w: 375, h: 800 }, { w: 1280, h: 800 }];
const THEMES = FAST ? ['light'] : ['light', 'dark'];
const TOKEN = `qa.doctor.token.${'x'.repeat(28)}`;
const VERIFY_URL = 'https://verify.uaiid.test/v/qa-session-1';
const EXPIRES = '2026-11-05T12:00:00.000Z';
const DOCTOR = { id: 'doc_qa_1', name: 'Maria Souza', crm: '116739', crmUf: 'SP', specialty: 'Cardiologia', email: 'maria@qa.test', photoUrl: null };
// o que o UaiID anexa à volta (id interno do médico incluso): NUNCA pode ser lido, exibido nem enviado a lugar nenhum
const RETURN_QS = 'kyc=1&status=approved&verification_id=3f2a9c1e-0000-4000-8000-000000000001&external_reference=doc_qa_1';
const DASH_MARK = 'Acesso médico · leitura';

let failures = 0;
let checks = 0;
const als = new AsyncLocalStorage();
const log = (s) => { const b = als.getStore(); if (b) b.push(s); else console.log(s); };
const ok = (msg) => { checks++; log(`    ✓ ${msg}`); };
const bad = (msg) => { checks++; failures++; log(`    ✗ ${msg}`); };
const check = (cond, msg) => (cond ? ok(msg) : bad(msg));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── dados simulados ────────────────────────────────────────────────────────────── */

const att = (status, extra = {}) => ({ status, reasonCode: null, message: null, expiresAt: EXPIRES, captureIssue: false, ...extra });
const ver = (status, attempt = null, extra = {}) => ({ status, attempt, ...extra });
const V = (status, attempt = null, extra = {}) => ({ status: 200, body: ver(status, attempt, extra) });

const MSG = {
  face: 'O rosto não bateu com a foto do documento. Tente de novo com boa luz e sem óculos.',
  crm: 'Seu CRM consta como inativo no CFM. Fale com o suporte.',
  admin: 'Nossa equipe não conseguiu confirmar seus dados. Fale com o suporte para entender o motivo.',
};

/* ── backend simulado ───────────────────────────────────────────────────────────── */

function makeBackend(init = {}) {
  const b = {
    verification: V('pending'),
    post: { status: 201, body: { verifyUrl: VERIFY_URL, expiresAt: EXPIRES, status: 'in_progress' } },
    me: { status: 200, body: { doctor: DOCTOR } },
    getDelayMs: 0,
    getAbort: false,
    postAbort: false,
    requests: [],
    ...init,
  };
  b.count = (method, p) => b.requests.filter((r) => r.method === method && r.path === p).length;
  return b;
}

async function mount(ctx, b) {
  // o "UaiID": só uma página simulada para provar que a navegação aconteceu
  await ctx.route('https://verify.uaiid.test/**', (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><title>UaiID (simulado)</title><h1>UaiID simulado</h1>' }));
  await ctx.route('**/api/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.origin === new URL(BASE).origin) return route.fallback(); // arquivo do próprio dev server
    const p = u.pathname.replace(/^.*?\/api(?=\/)/, '');
    const m = req.method();
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': req.headers()['access-control-request-headers'] || 'authorization,content-type',
    };
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    b.requests.push({ method: m, path: p, url: req.url() });
    const send = (r) => route.fulfill({ status: r.status, headers: cors, contentType: 'application/json', body: JSON.stringify(r.body) });

    if (p === '/doctor/verification' && m === 'GET') {
      if (b.getDelayMs) await sleep(b.getDelayMs);
      if (b.getAbort) return route.abort('failed');
      return send(typeof b.verification === 'function' ? b.verification() : b.verification);
    }
    if (p === '/doctor/verification' && m === 'POST') {
      if (b.postAbort) return route.abort('failed');
      return send(typeof b.post === 'function' ? b.post() : b.post);
    }
    if (p === '/doctor/me' && m === 'GET') return send(b.me);
    if (p === '/doctor/me/plan') return send({ status: 200, body: { isPremium: false } });
    if (p === '/doctor/questions/unread') return send({ status: 200, body: { count: 0 } });
    // qualquer outra rota (dashboard do médico, config pública…): vazio no formato que os efeitos esperam
    return send({ status: 200, body: { items: [], data: [], total: 0, count: 0 } });
  });
}

/* ── navegador / contexto ───────────────────────────────────────────────────────── */

async function newCtx(browser, { w, h, theme, reducedMotion = false, clipboard = false }) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    isMobile: w < 800,
    hasTouch: w < 800,
    deviceScaleFactor: w < 800 ? 2 : 1,
    colorScheme: theme,
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    permissions: clipboard ? ['clipboard-read', 'clipboard-write'] : [],
  });
  await ctx.routeWebSocket(/.*/, () => { /* HMR do vite desligado: sem recarga externa no meio do cenário */ });
  ctx.setDefaultNavigationTimeout(120_000);
  ctx.setDefaultTimeout(45_000);
  await ctx.addInitScript(({ token, dark }) => {
    try {
      localStorage.setItem('doctorToken', token);
      localStorage.setItem('doctorPhotoToken', token);
      localStorage.setItem('onboarded', '1');
      localStorage.setItem('lead_popup_dismissed_at', String(Date.now()));
      localStorage.setItem('RaStore.theme', dark ? '"dark"' : '"light"'); // useStore('theme') do react-admin
    } catch { /* sem storage */ }
  }, { token: TOKEN, dark: theme === 'dark' });
  return ctx;
}

function watch(page) {
  const w = { pageErrors: [], consoleErrors: [], urls: [] };
  page.on('pageerror', (e) => w.pageErrors.push(String(e).slice(0, 240)));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const t = msg.text();
    if (/Failed to load resource/i.test(t)) return; // 4xx/5xx simulados de propósito
    w.consoleErrors.push(t.slice(0, 240));
  });
  page.on('request', (r) => w.urls.push(r.url()));
  return w;
}

const bodyText = (page) => page.evaluate(() => document.body.textContent || '');
const lum = (rgb) => {
  const m = rgb.match(/\d+(\.\d+)?/g)?.map(Number) ?? [255, 255, 255];
  const [r, g, b] = m.slice(0, 3).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** O BootSplash do app (fixed, z-index 9999, fundo #031412) cobre a tela ~1,5 s depois da carga — e engole cliques/fotos. */
async function waitSplashGone(page, timeout = 8_000) {
  try {
    await page.waitForFunction(() => ![...document.querySelectorAll('div')].some((el) => {
      const cs = getComputedStyle(el);
      return cs.position === 'fixed' && cs.zIndex === '9999' && cs.backgroundColor === 'rgb(3, 20, 18)';
    }), null, { timeout });
  } catch { /* segue: o assert de texto/foto acusa */ }
}

async function waitText(page, text, timeout = 20_000) {
  try {
    await page.waitForFunction((t) => (document.body.textContent || '').includes(t), text, { timeout });
    await waitSplashGone(page);
    return true;
  } catch { return false; }
}
async function waitGone(page, text, timeout = 12_000) {
  try {
    await page.waitForFunction((t) => !(document.body.textContent || '').includes(t), text, { timeout });
    return true;
  } catch { return false; }
}

/** Asserts visuais comuns a TODA tela da jornada. */
async function commonChecks(page, { theme, label, scope = 'main' }) {
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, bsw: document.body.scrollWidth, iw: window.innerWidth }));
  check(m.sw <= m.iw && m.bsw <= m.iw, `${label}: sem scroll horizontal (scrollWidth ${m.sw} / janela ${m.iw})`);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(theme === 'dark' ? lum(bg) < 0.1 : lum(bg) > 0.8, `${label}: tema ${theme} aplicado de verdade (fundo ${bg})`);
  if (scope === 'main') {
    const geo = await page.evaluate(() => {
      const m = document.querySelector('main');
      if (!m) return null;
      return { mainBottom: Math.round(m.getBoundingClientRect().bottom + window.scrollY), docH: document.documentElement.scrollHeight };
    });
    if (geo) check(geo.docH <= geo.mainBottom + 2, `${label}: nada incha a rolagem da página além da tela (documento ${geo.docH} px / main ${geo.mainBottom} px)`);
  }
  const bar = await page.evaluate(() => {
    const el = document.querySelector('[data-kyc="actions"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight };
  });
  if (bar) check(bar.bottom <= bar.vh && bar.top >= 0, `${label}: painel da ação primária visível sem rolar (${bar.top}–${bar.bottom} de ${bar.vh})`);
  const small = await page.evaluate((sel) => [...document.querySelectorAll(`${sel} button, ${sel} a.MuiButton-root, ${sel} .MuiIconButton-root`)]
    .filter((el) => el.getClientRects().length > 0)
    .map((el) => { const r = el.getBoundingClientRect(); return { t: ((el.getAttribute('aria-label') || el.textContent || '').trim()).slice(0, 28), w: Math.round(r.width), h: Math.round(r.height) }; })
    .filter((x) => x.h < 47.5 || x.w < 47.5), scope);
  check(small.length === 0, `${label}: alvos de toque >= 48 px${small.length ? ' — ' + JSON.stringify(small) : ''}`);
}

/**
 * Duas fotos por tela: `-fold` = a 1ª tela exatamente como o médico vê (o painel de ação gruda no rodapé);
 * a principal = a página inteira com o painel assentado no fim do card (o sticky de uma captura fullPage
 * ficaria no meio do conteúdo).
 */
const shot = async (page, name) => {
  await waitSplashGone(page);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 8_000 }).catch(() => {});
  await page.screenshot({ path: path.join(OUT, `${name}-fold.png`) });
  const tall = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 4);
  if (!tall) { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); return; } // cabe na tela: a 1ª foto já é a página inteira
  const style = await page.addStyleTag({ content: '[data-kyc="actions"]{position:static !important}' });
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  await style.evaluate((el) => el.remove());
};

/* ── cenários ESTÁTICOS (matriz do plano) — cada um em 375/1280 × claro/escuro ───── */
/*
 * { id, backend, hash?, texts[], notTexts[], dashboard?, primary?, act?(page, b), clock? , check?(page, b, ctx) }
 */
const STATIC = [
  {
    id: 'intro',
    backend: () => makeBackend({ verification: V('pending') }),
    texts: ['Passo 2 de 3 · Verificação de identidade', 'Vamos validar sua identidade', 'Queremos te conhecer melhor. Antes de atender pacientes', 'O que você vai precisar', 'Um documento com foto', 'RG, CNH ou RNE, original e sem reflexo', 'Uma selfie', 'câmera do celular ou do computador, em local bem iluminado', 'Cerca de 2 minutos', 'pode parar e continuar depois', 'Seus dados, protegidos', 'A verificação é feita pelo UaiID, nosso parceiro especializado.', 'Validar minha identidade', 'Prefere no celular?', 'Copiar link', 'Maria Souza', 'CRM 116739-SP', 'Sair', 'Falar com o suporte'],
    notTexts: [DASH_MARK],
    primary: 1,
    check: async (page, b) => {
      check(b.count('GET', '/doctor/verification') >= 1, 'consultou GET /api/doctor/verification no mount');
      check(b.count('GET', '/doctor/me') >= 1, 'personalizou com GET /api/doctor/me');
      check((await page.locator('img[alt="Dr. Exame"]').count()) >= 1, 'mascote Dr. Exame presente');
      check(await page.locator('a[href="mailto:contato@janocaminho.com.br"]').count() >= 1, 'link do suporte (mailto) presente');
      const cta = page.getByRole('button', { name: 'Validar minha identidade' });
      const box = await cta.boundingBox();
      log(`    · CTA "Validar minha identidade": y=${Math.round(box?.y ?? -1)} (viewport ${page.viewportSize()?.height})`);
    },
  },
  { id: 'intro-rejected-sem-tentativa', backend: () => makeBackend({ verification: V('rejected', null) }), texts: ['Vamos validar sua identidade', 'Validar minha identidade'], notTexts: ['Não conseguimos aprovar'], once: true },
  { id: 'intro-in-progress-sem-tentativa', backend: () => makeBackend({ verification: V('in_progress', null) }), texts: ['Vamos validar sua identidade'], notTexts: ['Falta pouco para terminar'], once: true },
  { id: 'intro-in-progress-tentativa-expirada', backend: () => makeBackend({ verification: V('in_progress', att('expired')) }), texts: ['Vamos validar sua identidade'], once: true },
  {
    id: 'continuar',
    backend: () => makeBackend({ verification: V('in_progress', att('collecting')) }),
    texts: ['Falta pouco para terminar', 'Você começou a verificação mas não chegou ao fim. Continue de onde parou.', 'Continuar verificação'],
    notTexts: ['Vamos validar sua identidade', DASH_MARK],
    primary: 1,
  },
  {
    id: 'conferindo',
    backend: () => makeBackend({ verification: V('in_progress', att('processing')) }),
    hash: `#/doctor?${RETURN_QS}`,
    texts: ['Conferindo seus dados…', 'Recebemos suas imagens. Leva só alguns instantes — pode deixar esta tela aberta.', 'Comparando seu rosto com o documento'],
    notTexts: ['Está demorando mais que o normal', DASH_MARK, 'Conta aprovada'],
    check: async (page) => {
      check((await page.locator('[aria-live="polite"]').count()) >= 1, 'região viva (aria-live=polite) presente');
      const hash = await page.evaluate(() => location.hash);
      check(hash === '#/doctor', `URL limpa depois de consumir o kyc=1 (${hash})`);
    },
  },
  {
    id: 'conferindo-demorado-90s',
    clock: true,
    backend: () => makeBackend({ verification: V('in_progress', att('collecting')) }),
    hash: `#/doctor?${RETURN_QS}`,
    texts: ['Conferindo seus dados…'],
    act: async (page, b) => {
      const before = b.count('GET', '/doctor/verification');
      await page.clock.runFor(95_000);
      await waitText(page, 'Está demorando mais que o normal');
      check(b.count('GET', '/doctor/verification') >= before, 'o poll de 4 s continuou lendo o servidor durante a espera');
    },
    afterTexts: ['Está demorando mais que o normal. Pode fechar esta tela — avisamos por e-mail assim que houver novidade.', 'Atualizar', 'Ainda não terminou?', 'Continuar verificação'],
  },
  {
    id: 'em-analise-needs-admin',
    backend: () => makeBackend({ verification: V('needs_admin', att('approved', { reasonCode: 'manual_policy', message: 'Recebemos sua verificação — nossa equipe está conferindo seus dados.' })) }),
    texts: ['EM ANÁLISE', 'Recebemos! Seu cadastro está em análise', 'Sua identidade foi enviada. Agora nossa equipe confere seus dados e o seu CRM no CFM.', 'Cadastro no portal', 'Conta criada e e-mail confirmado', 'Verificação de identidade', 'Documento e selfie enviados', 'Análise da equipe', 'Conferindo seus dados e o CRM 116739-SP', 'Atendimento liberado', 'Você passa a receber pacientes pelo Dr. Exame', 'Você recebe um e-mail assim que terminarmos. Não precisa fazer mais nada.', 'Atualizar status', 'Sair'],
    notTexts: [DASH_MARK, 'Vamos validar'],
  },
  { id: 'em-analise-uaiid-review', backend: () => makeBackend({ verification: V('uaiid_review', att('manual_review')) }), texts: ['Recebemos! Seu cadastro está em análise'], once: true },
  {
    id: 'recusado-captura',
    backend: () => makeBackend({ verification: V('rejected', att('rejected', { reasonCode: 'face_mismatch', message: MSG.face, captureIssue: true })) }),
    texts: ['NÃO APROVADO', 'Não conseguimos aprovar sua verificação', MSG.face, 'Como resolver', 'Use um documento original (RG, CNH ou RNE), sem reflexo.', 'Faça a selfie em local bem iluminado, sem óculos ou boné.', 'Confira se o nome do documento é o mesmo do seu registro no CFM.', 'Tentar de novo'],
    notTexts: ['E agora?', DASH_MARK],
    primary: 1,
  },
  {
    id: 'recusado-neutro',
    backend: () => makeBackend({ verification: V('rejected', att('rejected', { reasonCode: 'crm_inactive', message: MSG.crm, captureIssue: false })) }),
    texts: ['NÃO APROVADO', MSG.crm, 'E agora?', 'Leia o motivo acima. Se foi engano, escreva para ', 'contato@janocaminho.com.br', 'respondemos rápido. Quando estiver tudo certo, tente de novo.', 'Tentar de novo'],
    notTexts: ['Como resolver', 'sem óculos ou boné'],
  },
  {
    id: 'recusado-dono',
    backend: () => makeBackend({ verification: V('rejected', att('approved', { reasonCode: 'admin_rejected', message: MSG.admin, captureIssue: false })) }),
    texts: ['Não conseguimos aprovar sua verificação', MSG.admin, 'Enviamos os detalhes para o seu e-mail.', 'E agora?'],
  },
  {
    id: 'recusado-sem-mensagem',
    backend: () => makeBackend({ verification: V('rejected', att('rejected')) }),
    texts: ['Não foi possível confirmar sua identidade.'],
    once: true,
  },
  {
    id: 'recusado-429-horas',
    backend: () => makeBackend({
      verification: V('rejected', att('rejected', { reasonCode: 'face_mismatch', message: MSG.face, captureIssue: true })),
      post: { status: 429, body: { code: 'KYC_ATTEMPT_LIMIT', retryAfterHours: 3, error: 'Limite de tentativas atingido. Tente mais tarde.' } },
    }),
    texts: ['Tentar de novo'],
    act: async (page) => { await page.getByRole('button', { name: 'Tentar de novo' }).click(); await waitText(page, 'Você atingiu o limite de tentativas'); },
    afterTexts: ['Você atingiu o limite de tentativas. Tente de novo em cerca de 3 h.'],
    afterNot: ['Fale com o suporte para liberar'],
    check: async (page) => {
      check(await page.getByRole('button', { name: 'Tentar de novo' }).isDisabled(), '429 com horas: CTA "Tentar de novo" desabilitado');
      check((await page.locator('[role="alert"]').count()) >= 1, '429: aviso em role=alert');
    },
  },
  {
    id: 'recusado-429-suporte',
    backend: () => makeBackend({
      verification: V('rejected', att('rejected', { reasonCode: 'face_mismatch', message: MSG.face, captureIssue: true })),
      post: { status: 429, body: { code: 'KYC_ATTEMPT_LIMIT', retryAfterHours: null, error: 'Limite de tentativas atingido. Tente mais tarde.' } },
    }),
    texts: ['Tentar de novo'],
    act: async (page) => { await page.getByRole('button', { name: 'Tentar de novo' }).click(); await waitText(page, 'Você atingiu o limite de tentativas de verificação'); },
    afterTexts: ['Você atingiu o limite de tentativas de verificação. Fale com o suporte para liberar uma nova tentativa.'],
    afterNot: ['Tente de novo em cerca de'],
    check: async (page) => {
      check(await page.getByRole('button', { name: 'Tentar de novo' }).isDisabled(), '429 sem horas: CTA "Tentar de novo" desabilitado');
      const mail = page.locator('[role="alert"] a[href="mailto:contato@janocaminho.com.br"]');
      check((await mail.count()) === 1, '429 sem horas: botão "Falar com o suporte" (mailto) dentro do aviso');
    },
  },
  {
    id: 'intro-503',
    backend: () => makeBackend({ verification: V('pending'), post: { status: 503, body: { code: 'KYC_UNAVAILABLE', error: 'Verificação indisponível no momento. Tente em alguns minutos.' } } }),
    texts: ['Validar minha identidade'],
    act: async (page) => { await page.getByRole('button', { name: 'Validar minha identidade' }).click(); await waitText(page, 'indisponível no momento'); },
    afterTexts: ['A verificação está indisponível no momento. Tente em alguns minutos.'],
    check: async (page) => { check(!(await page.getByRole('button', { name: 'Validar minha identidade' }).isDisabled()), '503: CTA volta a ficar habilitado (dá para tentar de novo)'); },
  },
  {
    id: 'intro-cpf',
    backend: () => makeBackend({ verification: V('pending'), post: { status: 400, body: { code: 'CPF_REQUIRED', error: 'Cadastre seu CPF no perfil antes de verificar a identidade.' } } }),
    texts: ['Validar minha identidade'],
    act: async (page) => { await page.getByRole('button', { name: 'Validar minha identidade' }).click(); await waitText(page, 'Precisamos do seu CPF'); },
    afterTexts: ['Precisamos do seu CPF para verificar. Fale com o suporte para atualizar seu cadastro.'],
    once: true,
  },
  {
    id: 'suspensa',
    backend: () => makeBackend({ verification: { status: 403, body: { blocked: true, code: 'DOCTOR_BLOCKED', error: 'Acesso suspenso pela administração.', reason: 'Seu acesso foi suspenso após denúncias de conduta.' } } }),
    texts: ['Conta suspensa', 'Seu acesso está temporariamente suspenso pela administração.', 'Seu acesso foi suspenso após denúncias de conduta.', 'Falar com o suporte', 'contato@janocaminho.com.br'],
    notTexts: [DASH_MARK, 'Vamos validar'],
  },
  {
    id: 'suspensa-motivo-interno',
    backend: () => makeBackend({ verification: { status: 403, body: { blocked: true, code: 'DOCTOR_BLOCKED', reason: 'kyc_fraud' } } }),
    texts: ['Conta suspensa'],
    notTexts: ['kyc_fraud'],
    once: true,
  },
  {
    id: 'conta-aprovada',
    // 1ª leitura: em análise; depois o dono aprova → "Atualizar status" → tela de transição
    backend: () => makeBackend({ verification: V('needs_admin', att('approved', { reasonCode: 'manual_policy' })) }),
    texts: ['Recebemos! Seu cadastro está em análise'],
    act: async (page, b) => {
      b.verification = V('approved', att('approved'));
      await page.getByRole('button', { name: 'Atualizar status' }).click();
      await waitText(page, 'Conta aprovada');
    },
    afterTexts: ['Conta aprovada', '🎉', 'Sua identidade foi verificada. Você já pode atender.', 'Ir para o portal'],
    afterNot: [DASH_MARK],
    check: async (page) => {
      const n = await page.locator('button.MuiButton-containedPrimary').count();
      check(n === 1, `conta aprovada: 1 ação primária na tela (${n})`);
    },
  },
  {
    id: 'legado-no-prazo',
    backend: () => makeBackend({ verification: V('legacy', null, { legacyGraceUntilMs: new Date(2026, 10, 28, 12).getTime() }) }),
    dashboard: true,
    texts: ['Verifique sua identidade até 28/11/2026', 'Para continuar atendendo, confirme quem você é — leva 2 minutos.', 'Verificar agora'],
    notTexts: ['Vamos validar sua identidade'],
    check: async (page) => {
      const dismiss = page.getByRole('button', { name: 'Dispensar aviso' });
      check((await dismiss.count()) === 1, 'banner: botão "Dispensar aviso" presente');
    },
  },
  {
    id: 'legado-sem-prazo',
    backend: () => makeBackend({ verification: V('legacy') }),
    dashboard: true,
    texts: ['Verifique sua identidade', 'Verificar agora'],
    notTexts: ['Verifique sua identidade até'],
    once: true,
  },
  {
    id: 'legado-em-analise',
    backend: () => makeBackend({ verification: V('legacy', att('manual_review')) }),
    dashboard: true,
    texts: ['Recebemos sua verificação', 'Estamos conferindo seus dados. Avisamos por e-mail assim que terminarmos.'],
    notTexts: ['Verificar agora'],
    once: true,
  },
  {
    id: 'legado-vencido',
    backend: () => makeBackend({ verification: V('legacy', null, { legacyGraceUntilMs: Date.now() - 86_400_000 }) }),
    texts: ['Vamos validar sua identidade', 'Verificação de identidade', 'Validar minha identidade'],
    notTexts: ['Passo 2 de 3', DASH_MARK],
  },
  {
    id: 'aprovado',
    backend: () => makeBackend({ verification: V('approved', att('approved')) }),
    dashboard: true,
    texts: [],
    notTexts: ['Vamos validar sua identidade', 'Conta aprovada', 'Verifique sua identidade', 'Recebemos!'],
    once: true,
  },
  {
    id: 'carregando',
    backend: () => makeBackend({ verification: V('pending'), getDelayMs: 9_000 }),
    texts: ['Carregando…'],
    notTexts: [DASH_MARK, 'Vamos validar'],
    noWaitIdle: true,
  },
  {
    id: 'erro-de-rede',
    backend: () => makeBackend({ getAbort: true }),
    texts: ['Não foi possível carregar', 'Sem conexão. Tente novamente.', 'Tentar de novo', 'Sair'],
    notTexts: [DASH_MARK, 'Vamos validar'],
  },
];

const comboList = (scn) => VIEWPORTS.flatMap((vp) => THEMES.map((theme) => [vp, theme]))
  .filter(([vp, theme]) => !scn.once || (vp.w === 375 && theme === 'light'));

async function runCombo(browser, scn, vp, theme) {
  const label = `${scn.id} ${vp.w}px ${theme}`;
  await withRetry(`  · ${label}`, async () => {
    let ctx;
    try {
      ctx = await newCtx(browser, { w: vp.w, h: vp.h, theme });
      const b = scn.backend();
      await mount(ctx, b);
      const page = await ctx.newPage();
      const w = watch(page);
      if (scn.clock) await page.clock.install();
      await page.goto(`${BASE}/${scn.hash ?? '#/doctor'}`, { waitUntil: 'domcontentloaded' });
      let missed = false; // 1ª ausência = a tela não chegou; as demais só conferem o que já está no DOM
      for (const t of scn.texts) {
        const found = await waitText(page, t, missed ? 1_200 : scn.noWaitIdle ? 8_000 : 25_000);
        if (!found) missed = true;
        check(found, `${label}: mostra "${t.slice(0, 70)}"`);
      }
      if (scn.dashboard) check(await waitText(page, DASH_MARK, 20_000), `${label}: o dashboard montou (${DASH_MARK})`);
      if (scn.primary != null) {
        const n = await page.locator('button.MuiButton-containedPrimary').count();
        check(n === scn.primary, `${label}: ${scn.primary} ação primária na tela (${n})`);
      }
      const txt = await bodyText(page);
      for (const t of scn.notTexts ?? []) check(!txt.includes(t), `${label}: NÃO mostra "${t.slice(0, 60)}"`);
      if (scn.act) await scn.act(page, b);
      for (const t of scn.afterTexts ?? []) check(await waitText(page, t, 15_000), `${label}: depois da ação mostra "${t.slice(0, 70)}"`);
      const txt2 = await bodyText(page);
      for (const t of scn.afterNot ?? []) check(!txt2.includes(t), `${label}: depois da ação NÃO mostra "${t.slice(0, 60)}"`);
      if (scn.check) await scn.check(page, b, ctx);
      if (!scn.noWaitIdle) await sleep(450); // deixa a animação de entrada assentar
      await commonChecks(page, { theme, label, scope: scn.dashboard ? '[data-kyc="banner"]' : 'main' });
      check(w.pageErrors.length === 0, `${label}: sem erro de página${w.pageErrors.length ? ' — ' + w.pageErrors[0] : ''}`);
      check(w.consoleErrors.length === 0, `${label}: sem console.error${w.consoleErrors.length ? ' — ' + w.consoleErrors[0] : ''}`);
      check(!w.urls.some((u) => /verification_id|external_reference|3f2a9c1e/.test(u)), `${label}: nenhum request carregou verification_id/external_reference da volta do UaiID`);
      await shot(page, `${scn.id}-${vp.w}-${theme}`);
    } catch (e) {
      bad(`${label}: exceção — ${String(e).slice(0, 300)}`);
    } finally {
      await ctx?.close().catch(() => {});
    }
  });
}

/* ── cenários DINÂMICOS (interação) ─────────────────────────────────────────────── */

const DYNAMIC = [
  {
    id: 'fluxo-web-mesma-aba',
    run: async (browser) => {
      const ctx = await newCtx(browser, { w: 375, h: 800, theme: 'light' });
      const b = makeBackend({ verification: V('pending') });
      await mount(ctx, b);
      const page = await ctx.newPage();
      const w = watch(page);
      await page.goto(`${BASE}/#/doctor`, { waitUntil: 'domcontentloaded' });
      check(await waitText(page, 'Vamos validar sua identidade'), 'Intro apareceu depois do cadastro (status pending)');
      // CTA: POST + navegação NA MESMA ABA para o UaiID (popup depois de await seria bloqueado)
      const popup = page.waitForEvent('popup', { timeout: 1_500 }).then(() => true).catch(() => false);
      b.verification = V('in_progress', att('created'));
      await page.getByRole('button', { name: 'Validar minha identidade' }).click();
      await page.waitForURL(VERIFY_URL, { timeout: 15_000 }).catch(() => {});
      check(page.url() === VERIFY_URL, `navegou na mesma aba para o UaiID (${page.url()})`);
      check(b.count('POST', '/doctor/verification') === 1, 'exatamente 1 POST /api/doctor/verification');
      check(!(await popup), 'nenhum popup foi aberto');
      // a volta: o UaiID devolve o médico para #/doctor?kyc=1&status=approved&verification_id=…&external_reference=…
      b.verification = V('in_progress', att('processing'));
      await page.goto(`${BASE}/#/doctor?${RETURN_QS}`, { waitUntil: 'domcontentloaded' });
      check(await waitText(page, 'Conferindo seus dados…'), 'volta do UaiID → "Conferindo seus dados…"');
      await sleep(300);
      const h = await page.evaluate(() => location.href);
      check(!/verification_id|external_reference|status=|kyc=/.test(h), `URL limpa (sem status/ids do UaiID): ${h.replace(BASE, '')}`);
      // o servidor segue "processing" por mais de um ciclo de poll (4 s): a tela NÃO pode virar nada sozinha
      const gets0 = b.count('GET', '/doctor/verification');
      await sleep(9_000);
      check((await bodyText(page)).includes('Conferindo seus dados…'), 'segue em "Conferindo" enquanto o servidor diz processing');
      check(b.count('GET', '/doctor/verification') >= gets0 + 1, `poll de 4 s ativo (${b.count('GET', '/doctor/verification') - gets0} leituras em 9 s)`);
      // o servidor decide → o poll pega sozinho
      b.verification = V('needs_admin', att('approved', { reasonCode: 'manual_policy' }));
      check(await waitText(page, 'Recebemos! Seu cadastro está em análise', 12_000), 'o poll de 4 s levou para "Recebemos! Seu cadastro está em análise"');
      check(w.pageErrors.length === 0, 'sem erro de página no fluxo');
      check(!w.urls.some((u) => /verification_id|external_reference/.test(u)), 'nenhum request carregou verification_id/external_reference');
      await ctx.close();
    },
  },
  {
    id: 'status-da-url-nunca-decide',
    run: async (browser) => {
      // o texto `status=approved` da URL é controlável pelo usuário: a verdade é só o GET do servidor
      const ctx = await newCtx(browser, { w: 375, h: 800, theme: 'light' });
      const b = makeBackend({ verification: V('in_progress', att('collecting')) });
      await mount(ctx, b);
      const page = await ctx.newPage();
      const w = watch(page);
      await page.goto(`${BASE}/#/doctor?${RETURN_QS}`, { waitUntil: 'domcontentloaded' });
      check(await waitText(page, 'Conferindo seus dados…'), 'URL com status=approved + servidor in_progress → "Conferindo seus dados…"');
      const gets0 = b.count('GET', '/doctor/verification');
      await sleep(9_000);
      const t = await bodyText(page);
      check(t.includes('Conferindo seus dados…'), 'continua em "Conferindo" depois de 9 s (2 ciclos de poll)');
      check(!t.includes('Conta aprovada') && !t.includes(DASH_MARK), 'não promoveu a "Conta aprovada" nem abriu o dashboard por causa do texto da URL');
      check(b.count('GET', '/doctor/verification') > gets0, 'e continua consultando o servidor');
      check(!(await page.evaluate(() => location.href)).includes('approved'), 'a palavra "approved" não ficou na barra de endereço');
      check(w.pageErrors.length === 0, 'sem erro de página');
      await ctx.close();
    },
  },
  {
    id: 'conferindo-janela-de-90s-reinicia-no-atualizar',
    run: async (browser) => {
      const ctx = await newCtx(browser, { w: 375, h: 800, theme: 'light' });
      const b = makeBackend({ verification: V('in_progress', att('processing')) });
      await mount(ctx, b);
      const page = await ctx.newPage();
      const w = watch(page);
      await page.clock.install();
      await page.goto(`${BASE}/#/doctor?kyc=1`, { waitUntil: 'domcontentloaded' });
      check(await waitText(page, 'Conferindo seus dados…'), 'Conferindo');
      await page.clock.runFor(60_000);
      check(!(await bodyText(page)).includes('Está demorando mais'), 'aos 60 s ainda não mostra o aviso de demora');
      await page.clock.runFor(35_000);
      check(await waitText(page, 'Está demorando mais que o normal'), 'aos 95 s mostra o aviso de demora');
      check(!(await bodyText(page)).includes('Continuar verificação'), 'tentativa já enviada (processing): não oferece voltar ao UaiID');
      const gets = b.count('GET', '/doctor/verification');
      await page.getByRole('button', { name: 'Atualizar' }).click();
      check(await waitGone(page, 'Está demorando mais que o normal'), '"Atualizar" reabre a janela de 90 s (aviso some)');
      check(b.count('GET', '/doctor/verification') > gets, '"Atualizar" releu o servidor (GET, sem reload da página)');
      await page.clock.runFor(95_000);
      check(await waitText(page, 'Está demorando mais que o normal'), 'e passados mais 90 s o aviso volta');
      // o servidor responde → sai do "Conferindo"
      b.verification = V('needs_admin', att('approved'));
      await page.getByRole('button', { name: 'Atualizar' }).click();
      check(await waitText(page, 'Recebemos! Seu cadastro está em análise'), 'resposta do servidor tira da espera → "Em análise"');
      check(w.pageErrors.length === 0, 'sem erro de página');
      await ctx.close();
    },
  },
  {
    id: 'conferindo-demorado-pode-voltar-ao-uaiid',
    run: async (browser) => {
      const ctx = await newCtx(browser, { w: 375, h: 800, theme: 'light' });
      const b = makeBackend({ verification: V('in_progress', att('collecting')) });
      await mount(ctx, b);
      const page = await ctx.newPage();
      await page.clock.install();
      await page.goto(`${BASE}/#/doctor?kyc=1`, { waitUntil: 'domcontentloaded' });
      check(await waitText(page, 'Conferindo seus dados…'), 'Conferindo');
      await page.clock.runFor(95_000);
      check(await waitText(page, 'Ainda não terminou?'), 'tentativa ainda em coleta: oferece "Continuar verificação"');
      await page.getByRole('button', { name: 'Continuar verificação' }).click();
      await page.waitForURL(VERIFY_URL, { timeout: 15_000 }).catch(() => {});
      check(page.url() === VERIFY_URL, 'reabre o UaiID na mesma aba');
      check(b.count('POST', '/doctor/verification') === 1, 'POST uma vez');
      await ctx.close();
    },
  },
  {
    id: 'em-analise-auto-refresh-30s-e-aprovacao-na-sessao',
    run: async (browser) => {
      const ctx = await newCtx(browser, { w: 375, h: 800, theme: 'light' });
      const b = makeBackend({ verification: V('needs_admin', att('approved', { reasonCode: 'manual_policy' })) });
      await mount(ctx, b);
      const page = await ctx.newPage();
      await page.clock.install();
      await page.goto(`${BASE}/#/doctor`, { waitUntil: 'domcontentloaded' });
      check(await waitText(page, 'Recebemos! Seu cadastro está em análise'), 'Em análise');
      const gets = b.count('GET', '/doctor/verification');
      await page.clock.runFor(31_000);
      await sleep(400);
      check(b.count('GET', '/doctor/verification') > gets, 'releitura automática a cada 30 s');
      // o dono aprova no admin; o médico nem toca na tela
      b.verification = V('approved', att('approved'));
      await page.clock.runFor(31_000);
      check(await waitText(page, 'Conta aprovada'), 'aprovado durante a sessão → "Conta aprovada" aparece sozinho');
      check(!(await bodyText(page)).includes(DASH_MARK), 'o dashboard ainda NÃO monta (a transição aparece uma vez)');
      await page.getByRole('button', { name: 'Ir para o portal' }).click();
      check(await waitText(page, DASH_MARK, 20_000), '"Ir para o portal" → dashboard');
      check(!(await bodyText(page)).includes('Conta aprovada'), 'a tela de transição some');
      // recarregar: aprovado desde o início → dashboard direto, sem repetir a transição
      await page.goto(`${BASE}/#/doctor`, { waitUntil: 'domcontentloaded' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      check(await waitText(page, DASH_MARK, 20_000), 'depois de recarregar, aprovado vai direto ao dashboard');
      check(!(await bodyText(page)).includes('Conta aprovada'), 'e a transição NÃO repete');
      await ctx.close();
    },
  },
  {
    id: 'aprovado-no-meio-do-fluxo-mantem-a-transicao-apos-reload',
    run: async (browser) => {
      // volta do UaiID em outra carga de página (mesma aba): o aviso de "viu pendente" sobrevive no sessionStorage
      const ctx = await newCtx(browser, { w: 375, h: 800, theme: 'light' });
      const b = makeBackend({ verification: V('pending') });
      await mount(ctx, b);
      const page = await ctx.newPage();
      await page.goto(`${BASE}/#/doctor`, { waitUntil: 'domcontentloaded' });
      check(await waitText(page, 'Vamos validar sua identidade'), 'Intro');
      b.verification = V('approved', att('approved'));
      await page.reload({ waitUntil: 'domcontentloaded' });
      check(await waitText(page, 'Conta aprovada'), 'quem estava pendente e voltou aprovado vê "Conta aprovada" mesmo após recarregar a aba');
      await ctx.close();
    },
  },
  {
    id: 'volta-ao-primeiro-plano-relê-o-servidor',
    run: async (browser) => {
      const ctx = await newCtx(browser, { w: 375, h: 800, theme: 'light' });
      const b = makeBackend({ verification: V('in_progress', att('collecting')) });
      await mount(ctx, b);
      const page = await ctx.newPage();
      await page.goto(`${BASE}/#/doctor`, { waitUntil: 'domcontentloaded' });
      check(await waitText(page, 'Falta pouco para terminar'), 'Continuar');
      const gets = b.count('GET', '/doctor/verification');
      b.verification = V('needs_admin', att('approved'));
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      check(await waitText(page, 'Recebemos! Seu cadastro está em análise'), 'visibilitychange (voltou ao primeiro plano) → releu e foi para "Em análise"');
      check(b.count('GET', '/doctor/verification') > gets, 'nova leitura do servidor');
      await ctx.close();
    },
  },
  {
    id: 'copiar-link-no-celular',
    run: async (browser) => {
      const ctx = await newCtx(browser, { w: 375, h: 800, theme: 'light', clipboard: true });
      const b = makeBackend({ verification: V('pending') });
      await mount(ctx, b);
      const page = await ctx.newPage();
      await page.goto(`${BASE}/#/doctor`, { waitUntil: 'domcontentloaded' });
      check(await waitText(page, 'Prefere no celular?'), 'Intro');
      await page.getByRole('button', { name: 'Copiar link' }).click();
      check(await waitText(page, 'Link copiado! Abra no celular e conclua a verificação.'), 'confirma "Link copiado!"');
      const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
      check(clip === VERIFY_URL, `o link do UaiID foi para a área de transferência (${clip || 'vazio'})`);
      check(page.url().startsWith(BASE), 'não navegou: o médico continua no portal');
      check(b.count('POST', '/doctor/verification') === 1, 'criou a sessão uma vez');
      await shot(page, 'copiar-link-ok-375-light');
      await ctx.close();
    },
  },
  {
    id: 'copiar-link-sem-permissao-mostra-o-link',
    run: async (browser) => {
      const ctx = await newCtx(browser, { w: 375, h: 800, theme: 'light' });
      await ctx.addInitScript(() => {
        try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('negado')) }, configurable: true }); } catch { /* ok */ }
        document.execCommand = () => false;
      });
      const b = makeBackend({ verification: V('pending') });
      await mount(ctx, b);
      const page = await ctx.newPage();
      await page.goto(`${BASE}/#/doctor`, { waitUntil: 'domcontentloaded' });
      await waitText(page, 'Prefere no celular?');
      await page.getByRole('button', { name: 'Copiar link' }).click();
      check(await waitText(page, 'Toque e segure o link abaixo para copiar.'), 'sem permissão de copiar: orienta o toque-e-segure');
      const val = await page.locator('input[aria-label="Link da verificação"]').inputValue().catch(() => '');
      check(val === VERIFY_URL, 'mostra o link num campo somente leitura para copiar na mão');
      await shot(page, 'copiar-link-manual-375-light');
      await ctx.close();
    },
  },
  {
    id: 'erro-de-rede-e-tentar-de-novo',
    run: async (browser) => {
      const ctx = await newCtx(browser, { w: 375, h: 800, theme: 'light' });
      const b = makeBackend({ getAbort: true });
      await mount(ctx, b);
      const page = await ctx.newPage();
      await page.goto(`${BASE}/#/doctor`, { waitUntil: 'domcontentloaded' });
      check(await waitText(page, 'Sem conexão. Tente novamente.'), 'sem rede no 1º GET → "Sem conexão. Tente novamente."');
      check(!(await bodyText(page)).includes(DASH_MARK), 'e o dashboard não monta');
      b.getAbort = false;
      b.verification = V('pending');
      await page.getByRole('button', { name: 'Tentar de novo' }).click();
      check(await waitText(page, 'Vamos validar sua identidade'), '"Tentar de novo" relê o servidor e segue para a Intro');
      await ctx.close();
    },
  },
  {
    id: 'sem-rede-no-cta',
    run: async (browser) => {
      const ctx = await newCtx(browser, { w: 375, h: 800, theme: 'light' });
      const b = makeBackend({ verification: V('pending'), postAbort: true });
      await mount(ctx, b);
      const page = await ctx.newPage();
      await page.goto(`${BASE}/#/doctor`, { waitUntil: 'domcontentloaded' });
      await waitText(page, 'Validar minha identidade');
      await page.getByRole('button', { name: 'Validar minha identidade' }).click();
      check(await waitText(page, 'Sem conexão. Tente novamente.'), 'POST sem rede → "Sem conexão. Tente novamente."');
      check(!(await page.getByRole('button', { name: 'Validar minha identidade' }).isDisabled()), 'CTA habilitado de novo');
      await ctx.close();
    },
  },
  {
    id: '401-vai-para-o-login',
    run: async (browser) => {
      const ctx = await newCtx(browser, { w: 375, h: 800, theme: 'light' });
      const b = makeBackend({ verification: { status: 401, body: { code: 'INVALID_TOKEN', error: 'Token médico inválido.' } } });
      await mount(ctx, b);
      const page = await ctx.newPage();
      await page.goto(`${BASE}/#/doctor`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => location.hash.startsWith('#/entrar/medico'), null, { timeout: 20_000 }).catch(() => {});
      check((await page.evaluate(() => location.hash)).startsWith('#/entrar/medico'), '401 → logout → #/entrar/medico');
      check((await page.evaluate(() => localStorage.getItem('doctorToken'))) === null, 'token do médico removido');
      await ctx.close();
    },
  },
  {
    id: 'suspensa-no-post',
    run: async (browser) => {
      const ctx = await newCtx(browser, { w: 375, h: 800, theme: 'light' });
      const b = makeBackend({ verification: V('pending'), post: { status: 403, body: { blocked: true, code: 'DOCTOR_BLOCKED', error: 'Acesso suspenso.', reason: 'Conta suspensa por violação dos termos de uso.' } } });
      await mount(ctx, b);
      const page = await ctx.newPage();
      await page.goto(`${BASE}/#/doctor`, { waitUntil: 'domcontentloaded' });
      await waitText(page, 'Validar minha identidade');
      await page.getByRole('button', { name: 'Validar minha identidade' }).click();
      check(await waitText(page, 'Conta suspensa'), '403 DOCTOR_BLOCKED no POST → "Conta suspensa"');
      check((await bodyText(page)).includes('Conta suspensa por violação dos termos de uso.'), 'com o motivo, quando é uma frase');
      await ctx.close();
    },
  },
  {
    id: 'ja-aprovado-ou-em-analise-no-post-so-relê',
    run: async (browser) => {
      const ctx = await newCtx(browser, { w: 375, h: 800, theme: 'light' });
      const b = makeBackend({ verification: V('pending'), post: { status: 409, body: { code: 'IN_REVIEW', status: 'needs_admin', error: 'Sua verificação está em análise.' } } });
      await mount(ctx, b);
      const page = await ctx.newPage();
      await page.goto(`${BASE}/#/doctor`, { waitUntil: 'domcontentloaded' });
      await waitText(page, 'Validar minha identidade');
      b.verification = V('needs_admin', att('approved'));
      await page.getByRole('button', { name: 'Validar minha identidade' }).click();
      check(await waitText(page, 'Recebemos! Seu cadastro está em análise'), '409 IN_REVIEW no POST → relê e mostra "Em análise" (sem erro para o médico)');
      await ctx.close();
    },
  },
  {
    id: 'legado-dispensar-e-verificar-agora',
    run: async (browser) => {
      const ctx = await newCtx(browser, { w: 375, h: 800, theme: 'light' });
      const b = makeBackend({ verification: V('legacy', null, { legacyGraceUntilMs: new Date(2026, 10, 28, 12).getTime() }), post: { status: 201, body: { verifyUrl: VERIFY_URL, expiresAt: EXPIRES, status: 'legacy' } } });
      await mount(ctx, b);
      const page = await ctx.newPage();
      await page.goto(`${BASE}/#/doctor`, { waitUntil: 'domcontentloaded' });
      check(await waitText(page, DASH_MARK, 25_000), 'dashboard montou');
      check(await waitText(page, 'Verifique sua identidade até 28/11/2026'), 'banner com o prazo');
      await page.getByRole('button', { name: 'Dispensar aviso' }).click();
      check(await waitGone(page, 'Verifique sua identidade até'), 'dispensar esconde o banner');
      check((await bodyText(page)).includes(DASH_MARK), 'e o dashboard continua montado (não remonta)');
      await ctx.close();
      // "Verificar agora" abre o UaiID
      const ctx2 = await newCtx(browser, { w: 375, h: 800, theme: 'light' });
      const b2 = makeBackend({ verification: V('legacy'), post: { status: 201, body: { verifyUrl: VERIFY_URL, expiresAt: EXPIRES, status: 'legacy' } } });
      await mount(ctx2, b2);
      const page2 = await ctx2.newPage();
      await page2.goto(`${BASE}/#/doctor`, { waitUntil: 'domcontentloaded' });
      await waitText(page2, 'Verificar agora', 25_000);
      await page2.getByRole('button', { name: 'Verificar agora' }).click();
      await page2.waitForURL(VERIFY_URL, { timeout: 15_000 }).catch(() => {});
      check(page2.url() === VERIFY_URL, '"Verificar agora" → UaiID na mesma aba');
      await ctx2.close();
    },
  },
  {
    id: 'movimento-reduzido',
    run: async (browser) => {
      const ctx = await newCtx(browser, { w: 375, h: 800, theme: 'light', reducedMotion: true });
      const b = makeBackend({ verification: V('in_progress', att('processing')) });
      await mount(ctx, b);
      const page = await ctx.newPage();
      await page.goto(`${BASE}/#/doctor?kyc=1`, { waitUntil: 'domcontentloaded' });
      await waitText(page, 'Conferindo seus dados…');
      await sleep(600);
      const anim = await page.evaluate(() => [...document.querySelectorAll('main *')].map((el) => getComputedStyle(el).animationName).filter((n) => n && n !== 'none'));
      check(anim.length === 0, `prefers-reduced-motion: nenhuma animação CSS ativa na tela (${anim.join(',') || 'nenhuma'})`);
      await ctx.close();
    },
  },
  {
    id: 'movimento-normal-anima',
    run: async (browser) => {
      const ctx = await newCtx(browser, { w: 375, h: 800, theme: 'light' });
      const b = makeBackend({ verification: V('in_progress', att('processing')) });
      await mount(ctx, b);
      const page = await ctx.newPage();
      await page.goto(`${BASE}/#/doctor?kyc=1`, { waitUntil: 'domcontentloaded' });
      await waitText(page, 'Conferindo seus dados…');
      await sleep(400);
      const anim = await page.evaluate(() => [...document.querySelectorAll('main *')].map((el) => getComputedStyle(el).animationName).filter((n) => n && n !== 'none'));
      check(anim.length > 0, 'sem a preferência, o mascote pulsa (controle do teste anterior)');
      await ctx.close();
    },
  },
];

/* ── main ───────────────────────────────────────────────────────────────────────── */

/** O vite dev compila o app inteiro na 1ª carga (minutos, com o otimizador de deps): aquece antes dos cenários cronometrados. */
async function warmUp(browser) {
  const t0 = Date.now();
  const ctx = await newCtx(browser, { w: 375, h: 800, theme: 'light' });
  await mount(ctx, makeBackend({ verification: V('pending') }));
  const page = await ctx.newPage();
  const w = watch(page);
  log('  · aquecendo o vite dev (1ª carga compila o app inteiro)…');
  await page.goto(`${BASE}/#/doctor`, { waitUntil: 'domcontentloaded', timeout: 420_000 });
  const found = await waitText(page, 'Vamos validar sua identidade', 420_000);
  log(`  · aquecimento: ${found ? 'ok' : 'FALHOU'} em ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (!found) {
    log(`    pageErrors: ${JSON.stringify(w.pageErrors.slice(0, 3))}`);
    log(`    consoleErrors: ${JSON.stringify(w.consoleErrors.slice(0, 3))}`);
    log(`    body: ${(await bodyText(page)).slice(0, 200)}`);
    await browser.close();
    process.exit(2);
  }
  await ctx.close();
}

/**
 * Roda um bloco com log em buffer. Se ele falhar por INFRA (o vite dev recarregou a página por causa de outra sessão, o
 * goto estourou numa máquina cheia, a aba fechou) refaz UMA vez — sem contar os asserts do 1º bloco. Falha de produto nunca é refeita.
 */
async function withRetry(header, body) {
  for (let attempt = 0; ; attempt++) {
    const buf = [header];
    const before = { c: checks, f: failures };
    await als.run(buf, body);
    const infra = buf.some((l) => /✗.*(Execution context was destroyed|Target (page, context or browser has been )?closed|page\.goto: Timeout|net::ERR_)/.test(l));
    if (infra && attempt < 1) { checks = before.c; failures = before.f; continue; }
    console.log(buf.join('\n'));
    return;
  }
}

/** Limita quantos contextos rodam ao mesmo tempo (o dev server e a máquina agradecem). */
const pool = (n) => {
  let active = 0;
  const q = [];
  const pump = () => {
    while (active < n && q.length) {
      const { fn, res, rej } = q.shift();
      active++;
      fn().then(res, rej).finally(() => { active--; pump(); });
    }
  };
  return (fn) => new Promise((res, rej) => { q.push({ fn, res, rej }); pump(); });
};

async function main() {
  log(`QA KYC médico — ${BASE} — shots em ${OUT}`);
  const browser = await chromium.launch();
  const PAR = Math.max(1, Number(process.env.QA_PAR || 6));
  try {
    await warmUp(browser);
    const run = pool(PAR);
    const jobs = [];
    for (const scn of STATIC) {
      if (ONLY && !ONLY.test(scn.id)) continue;
      for (const [vp, theme] of comboList(scn)) jobs.push(run(() => runCombo(browser, scn, vp, theme)));
    }
    for (const d of DYNAMIC) {
      if (process.env.QA_SKIP_DYNAMIC || (ONLY && !ONLY.test(d.id))) continue;
      jobs.push(run(() => withRetry(`\n■ [dinâmico] ${d.id}`, async () => {
        try { await d.run(browser); } catch (e) { bad(`${d.id}: exceção — ${String(e).slice(0, 300)}`); }
      })));
    }
    await Promise.all(jobs);
  } finally {
    await browser.close();
  }
  log(`\n${failures ? '✗' : '✓'} ${checks - failures}/${checks} asserts passaram${failures ? ` — ${failures} FALHA(S)` : ''}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
