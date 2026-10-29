/**
 * QA do painel "Verificação de identidade" (admin) + selo "Identidade verificada" (paciente)
 * — Plano 2 · Task W2 (docs/design/2026-10-29-verificacao-medico-plano-web.md).
 *
 * Roda contra o vite dev (E2E_BASE_URL, padrão http://127.0.0.1:5182) com `**\/api\/**` 100%
 * simulado em memória (nenhum servidor/banco): fila com nome divergente, tentativas anteriores,
 * caso no painel do UaiID, legados, estados vazios e os erros INVALID_STATE / REASON_REQUIRED /
 * KYC_CONFIG_INVALID. Token admin simulado em localStorage (token + user.role=ADMIN), como a
 * área admin lê. Screenshots 375×800 e 1280×800, claro e escuro → KYC_SHOTS_DIR
 * (padrão C:\Users\esantos\AppData\Local\Temp\kyc-web-shots\w2).
 *
 *   node e2e/qa-kyc-admin.mjs            (de packages/web, com o vite já no ar)
 *
 * Sai com código 1 se qualquer asserção falhar, houver overflow horizontal ou erro de página.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = (process.env.E2E_BASE_URL || 'http://127.0.0.1:5182').replace(/\/$/, '');
const OUT = process.env.KYC_SHOTS_DIR || 'C:\\Users\\esantos\\AppData\\Local\\Temp\\kyc-web-shots\\w2';
fs.mkdirSync(OUT, { recursive: true });

const ADMIN_USER = { id: 'adm1', email: 'dono@drexame.dev', name: 'Dono', role: 'ADMIN' };
const PATIENT_USER = { id: 'u1', email: 'paciente@exemplo.com', name: 'Paciente QA', role: 'USER' };

// ───────────────────────────── relatório ─────────────────────────────
let passed = 0;
const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); } else { failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
  return !!cond;
};

// ───────────────────────────── backend simulado ─────────────────────────────
const endOfDay = (ms) => { const d = new Date(ms); d.setHours(23, 59, 59, 999); return d.getTime(); };
const dateInput = (ms) => { const d = new Date(ms); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const DAY = 86_400_000;

function makeAdminState({ empty = false } = {}) {
  const now = Date.now();
  const ago = (min) => new Date(now - min * 60_000).toISOString();
  const doc = (id, name, crm, crmUf, email, verificationStatus, extra = {}) => ({
    id, name, crm, crmUf, specialty: extra.specialty ?? null, email, emailVerified: extra.emailVerified ?? true, photoUrl: null,
    createdAt: ago(60 * 24 * (extra.ageDays ?? 6)), blocked: false, blockedAt: null, blockedReason: null, _count: { shares: extra.shares ?? 0 },
    ...(verificationStatus === undefined ? {} : { verificationStatus }),
  });
  const attempt = (id, d, over) => ({
    id, providerId: `ver_${id}9f3a1c7e2b`, crm: `${d.crm}-${d.crmUf}`, status: 'approved', reasonCode: 'manual_policy', decision: 'needs_admin',
    documentName: null, cfmName: null, nameRatio: null, score: null, createdAt: ago(90), priorAttempts: 0, decideIn: 'drexame',
    doctor: { id: d.id, name: d.name, crm: d.crm, crmUf: d.crmUf, email: d.email, verificationStatus: d.verificationStatus },
    ...over,
  });

  const d1 = doc('doc-r1', 'Dr. Marcelo Augusto Pereira', '48213', 'SP', 'marcelo.pereira@clinicasp.com.br', 'needs_admin', { specialty: 'Cardiologia', shares: 3 });
  const d2 = doc('doc-r2', 'Dra. Ana Beatriz Cardoso Lima', '31577', 'MG', 'ana.cardoso@saudemg.com.br', 'needs_admin', { specialty: 'Endocrinologia' });
  const d3 = doc('doc-r3', 'Dr. Rafael Nogueira', '90210', 'RJ', 'rafael.nogueira@gmail.com', 'uaiid_review', { emailVerified: true });
  const d4 = doc('doc-r4', 'Dr. Tiago Mendes', '55012', 'BA', 'tiago.mendes@outlook.com', 'needs_admin', { specialty: 'Clínica Geral' });
  const approved = doc('doc-ok', 'Dra. Paula Nogueira', '77001', 'SP', 'paula@clinica.com', 'approved', { specialty: 'Dermatologia', shares: 12 });
  const rejected = doc('doc-rej', 'Dr. Caio Prado', '66012', 'PR', 'caio.prado@med.com', 'rejected');
  const pending = doc('doc-pen', 'Dra. Lívia Santos', '70422', 'GO', 'livia.santos@med.com', 'pending', { emailVerified: false });
  const progress = doc('doc-prog', 'Dr. Otávio Ramos', '80311', 'SC', 'otavio@med.com', 'in_progress');
  const legacyDocs = [
    doc('doc-l1', 'Dr. Henrique Alves Moreira', '12345', 'SP', 'henrique.moreira@clinicaalves.com.br', 'legacy', { ageDays: 400, specialty: 'Ortopedia' }),
    doc('doc-l2', 'Dra. Camila Duarte', '23456', 'RJ', 'camila.duarte@med.com', 'legacy', { ageDays: 380 }),
    doc('doc-l3', 'Dr. Fábio Lacerda Rocha', '34567', 'MG', 'fabio.rocha@med.com', 'legacy', { ageDays: 350, specialty: 'Pediatria' }),
    doc('doc-l4', 'Dra. Renata Figueiredo', '45678', 'RS', 'renata.f@med.com', 'legacy', { ageDays: 300 }),
  ];
  const semCampo = doc('doc-old', 'Dr. Antônio Sem Campo (server antigo)', '99887', 'DF', 'antonio@med.com', undefined);

  const review = empty ? [] : [
    // ordem do servidor (mais novo primeiro) — o painel deve subir "Aguardando você"
    attempt('r3', d3, { status: 'manual_review', decision: 'uaiid_review', reasonCode: 'face_mismatch_review', documentName: null, cfmName: 'RAFAEL NOGUEIRA DA COSTA', score: 58, priorAttempts: 1, decideIn: 'uaiid', createdAt: ago(20) }),
    attempt('r1', d1, { reasonCode: 'name_mismatch', documentName: 'MARCELO AUGUSTO PEREIRA SANTOS', cfmName: 'MARCELO AUGUSTO PEREIRA SOUZA', nameRatio: 0.88, score: 74, createdAt: ago(35) }),
    attempt('r2', d2, { reasonCode: 'manual_policy', documentName: 'ANA BEATRIZ CARDOSO LIMA', cfmName: 'Ana Beatriz Cardoso de Lima', nameRatio: 1, score: 96, priorAttempts: 2, createdAt: ago(75) }),
    attempt('r4', d4, { reasonCode: 'document_name_unavailable', documentName: null, cfmName: 'TIAGO MENDES FERREIRA', nameRatio: 0.91, score: 81, createdAt: ago(240) }),
  ];

  return {
    review,
    legacy: empty ? [] : legacyDocs.map(({ id, name, crm, crmUf, email, createdAt }) => ({ id, name, crm, crmUf, email, createdAt })),
    doctors: empty ? [approved, semCampo] : [d1, d2, d3, d4, approved, rejected, pending, progress, ...legacyDocs, semCampo],
    graceMs: empty ? 0 : endOfDay(now + 45 * DAY),
    calls: [],
    fail: {},          // erro de uma vez só: { approve|reject|legacy|grace: { status, body } }
    unchanged: false,  // próxima decisão volta com { unchanged: true }
    queue: { status: 200, offlineEmpty: false },
    config: { status: 200 },
  };
}

function adminHandler(state) {
  return async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname.replace(/^.*?\/api/, '');
    const method = req.method();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const body = (() => { try { return req.postDataJSON(); } catch { return null; } })();
    const json = (status, data, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { ...cors, ...headers }, body: JSON.stringify(data) });
    const takeFail = (k) => { const f = state.fail[k]; if (f) { delete state.fail[k]; return f; } return null; };
    const setDoctorStatus = (id, s) => { const d = state.doctors.find((x) => x.id === id); if (d) d.verificationStatus = s; };
    if (method !== 'GET') state.calls.push({ method, path: p, body });

    if (p === '/auth/me') return json(200, { user: ADMIN_USER });
    if (p === '/admin/users') return json(200, { users: [], total: 0, stats: { users: 128, exams: 2310, revenue: 8420 } });
    if (p === '/admin/doctors' && method === 'GET') return json(200, { doctors: state.doctors, total: state.doctors.length });
    if (p === '/admin/doctors/verification-queue') {
      if (state.queue.offlineEmpty) return json(200, { items: [], data: [], total: 0 }, { 'X-Offline-Empty': 'true' });
      if (state.queue.status !== 200) return json(state.queue.status, { error: 'boom' });
      return json(200, { review: state.review, legacy: state.legacy });
    }
    if (p === '/admin/config' && method === 'GET') {
      if (state.config.status !== 200) return json(state.config.status, { error: 'boom' });
      return json(200, { creditCosts: { chat: 2 }, doctorKyc: { legacyGraceUntilMs: state.graceMs, autoApprove: 0 } });
    }
    let m;
    if (method === 'POST' && (m = p.match(/^\/admin\/doctors\/([^/]+)\/verification\/(approve|reject)$/))) {
      const [, id, kind] = m;
      const f = takeFail(kind);
      if (f) return json(f.status, f.body);
      if (kind === 'reject' && !String(body?.reason ?? '').trim()) return json(400, { code: 'REASON_REQUIRED', error: 'Informe o motivo.' });
      const idx = state.review.findIndex((r) => r.doctor.id === id);
      if (state.unchanged) { state.unchanged = false; if (idx >= 0) state.review.splice(idx, 1); setDoctorStatus(id, kind === 'approve' ? 'approved' : 'rejected'); return json(200, { ok: true, status: kind === 'approve' ? 'approved' : 'rejected', unchanged: true }); }
      if (kind === 'approve' && (idx < 0 || state.review[idx].decideIn !== 'drexame')) return json(409, { code: 'INVALID_STATE', status: 'pending', error: 'Só dá para aprovar quem está em análise na fila do Dr. Exame.' });
      if (idx >= 0) state.review.splice(idx, 1);
      setDoctorStatus(id, kind === 'approve' ? 'approved' : 'rejected');
      return json(200, { ok: true, status: kind === 'approve' ? 'approved' : 'rejected' });
    }
    if (method === 'POST' && p === '/admin/doctors/verification/approve-legacy') {
      const f = takeFail('legacy');
      if (f) return json(f.status, f.body);
      const ids = Array.isArray(body?.ids) ? body.ids : [];
      const hit = state.legacy.filter((l) => ids.includes(l.id));
      state.legacy = state.legacy.filter((l) => !ids.includes(l.id));
      hit.forEach((l) => setDoctorStatus(l.id, 'approved'));
      return json(200, { ok: true, approved: hit.length });
    }
    if (method === 'PATCH' && p === '/admin/config/costs') {
      const f = takeFail('grace');
      if (f) return json(f.status, f.body);
      if (body?.category === 'doctorKyc' && typeof body.legacyGraceUntilMs === 'number') {
        const ms = body.legacyGraceUntilMs;
        if (ms !== 0 && !(ms > Date.now())) return json(400, { code: 'KYC_CONFIG_INVALID', error: 'legacyGraceUntilMs deve ser 0 (sem prazo) ou uma data futura em milissegundos.' });
        state.graceMs = ms;
        return json(200, { doctorKyc: { legacyGraceUntilMs: ms, autoApprove: 0 } });
      }
      return json(400, { error: 'category inválida' });
    }
    if (p === '/public/config') return json(200, {});
    return json(200, {});
  };
}

// ───────────────────────────── navegação ─────────────────────────────
const SPLASH = ['INICIANDO O DR', 'CARREGANDO SEUS EXAMES', 'PREPARANDO SEU PAINEL', 'QUASE LÁ'];
const noSplash = (page) => page.waitForFunction((s) => { const t = document.body.innerText.toUpperCase(); return !s.some((x) => t.includes(x)); }, SPLASH, { timeout: 45_000 });

// QA_ONLY=1,3 roda só esses cenários (depuração)
const ONLY = (process.env.QA_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const want = (n) => !ONLY.length || ONLY.includes(String(n)) || ONLY.includes(String(n).replace(/[a-z]+$/, ''));
/** Um cenário que lança NÃO derruba o resto: vira falha no relatório e a corrida segue. */
async function run(n, title, fn) {
  console.log(`\n[${n}] ${title}`);
  if (!want(n)) return;
  try { await fn(); } catch (e) {
    const msg = String(e?.message || e).split('\n').filter(Boolean).slice(0, 3).join(' | ');
    failures.push(`[${n}] exceção: ${msg}`);
    console.log(`  ✗ EXCEÇÃO no cenário ${n}: ${msg}`);
  }
}

const browser = await chromium.launch();
const reactWarnings = [];
const pageErrors = [];

async function newPage({ width, height, dark = false, user, extraStorage = {}, handler }) {
  const ctx = await browser.newContext({
    viewport: { width, height }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: dark ? 'dark' : 'light',
    isMobile: width < 800, hasTouch: width < 800, deviceScaleFactor: width < 800 ? 2 : 1,
  });
  ctx.setDefaultTimeout(20_000);
  await ctx.addInitScript(({ user, dark, extra }) => {
    localStorage.setItem('token', 'qa-token');
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('onboarded', '1');
    localStorage.setItem('lead_popup_dismissed_at', String(Date.now()));
    for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v);
    if (dark) { localStorage.setItem('theme', 'dark'); localStorage.setItem('RaStore.theme', JSON.stringify('dark')); }
  }, { user, dark, extra: extraStorage });
  const page = await ctx.newPage();
  const tag = `${width}${dark ? 'd' : 'l'}`;
  page.on('pageerror', (e) => pageErrors.push(`[${tag}] ${String(e).slice(0, 220)}`));
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    const t = m.text();
    if (/validateDOMNesting|unique "key"|Warning:|not wrapped in act|Invalid DOM property|React does not recognize|cannot be a descendant|hydrat/i.test(t)) reactWarnings.push(`[${tag}] ${t.slice(0, 260)}`);
  });
  await page.route('**/api/**', handler);
  return { ctx, page };
}

async function openAdmin(opts, state) {
  const { ctx, page } = await newPage({ ...opts, user: ADMIN_USER, handler: adminHandler(state) });
  // 'commit': o <link> do Google Fonts (sem rede/CSP) segura o domcontentloaded; os waitFor abaixo bastam.
  await page.goto(`${BASE}/#/admin?tab=doctors`, { waitUntil: 'commit', timeout: 60_000 });
  await page.waitForSelector('[data-testid="kyc-panel"]', { timeout: 90_000 });
  await noSplash(page);
  // pronto = o painel saiu do "carregando" (cai em contadores, vazio OU o cartão de erro da carga)
  await page.waitForFunction(() => { const p = document.querySelector('[data-testid="kyc-panel"]'); return !!p && !p.querySelector('[role="progressbar"]'); }, null, { timeout: 30_000 });
  return { ctx, page, state };
}

const overflow = (page) => page.evaluate(() => ({ doc: document.documentElement.scrollWidth - window.innerWidth, body: document.body.scrollWidth - window.innerWidth }));
async function noOverflow(page, label) {
  const o = await overflow(page);
  return check(`sem scroll horizontal (${label})`, o.doc <= 1 && o.body <= 1, JSON.stringify(o));
}
const shot = async (page, name, opts = {}) => { const f = path.join(OUT, `${name}.png`); await page.screenshot({ path: f, fullPage: true, ...opts }); console.log(`    📸 ${f}`); };
// foto de elemento: esconde só durante a foto o rodapé fixo do mobile (senão ele cobre a base do elemento)
const elShot = async (loc, name) => {
  const f = path.join(OUT, `${name}.png`);
  const style = await loc.page().addStyleTag({ content: 'footer{display:none!important}' });
  await loc.screenshot({ path: f });
  await style.evaluate((e) => e.remove());
  console.log(`    📸 ${f}`);
};
/** Esconde (só durante a foto) o que é fixo e encostado no rodapé: barra de navegação, FAB do chat… */
const hideFixedBottom = (page) => page.evaluate(() => {
  window.__qaHidden = [];
  for (const el of document.querySelectorAll('body *')) {
    if (getComputedStyle(el).position !== 'fixed') continue;
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.height < 260 && r.bottom >= window.innerHeight - 48) { window.__qaHidden.push([el, el.style.visibility]); el.style.visibility = 'hidden'; }
  }
});
const restoreFixed = (page) => page.evaluate(() => { for (const [el, v] of window.__qaHidden || []) el.style.visibility = v; window.__qaHidden = []; });
const text = (page) => page.evaluate(() => document.body.innerText);
const dialog = (page) => page.getByRole('dialog');
const card = (page, i) => page.locator('[data-testid="kyc-review-card"]').nth(i);
/** Linha da LISTA de médicos (abaixo do painel): o único cartão com "Bloquear/Desbloquear acesso". */
const docRow = (page, name) => page.locator('.MuiCardContent-root').filter({ hasText: name }).filter({ hasText: /Bloquear acesso/ }).first();
const settle = (page, ms = 450) => page.waitForTimeout(ms);

// ═════════════════════════════ 1 · PAINEL POPULADO ═════════════════════════════
await run(1, 'Painel populado — 375/1280 × claro/escuro', async () => {
for (const [width, dark, name] of [[375, false, '375-light'], [375, true, '375-dark'], [1280, false, '1280-light'], [1280, true, '1280-dark']]) {
  const { ctx, page } = await openAdmin({ width, height: 800, dark }, makeAdminState());
  console.log(`  • ${name}`);
  await settle(page, 700);
  const cards = page.locator('[data-testid="kyc-review-card"]');
  if (name === '375-light' || name === '1280-light') {
    check('título "Verificação de identidade"', await page.getByRole('heading', { name: 'Verificação de identidade' }).isVisible());
    const counters = await page.locator('[data-testid="kyc-counters"]').innerText();
    check('contadores: Aguardando você / No painel do UaiID / Médicos antigos sem verificação',
      /Aguardando você/.test(counters) && /No painel do UaiID/.test(counters) && /Médicos antigos sem verificação/.test(counters), counters.replace(/\n/g, ' | '));
    check('contadores com os números 3 · 1 · 4',
      (await page.locator('[data-testid="kyc-count-waiting-n"]').innerText()) === '3' &&
      (await page.locator('[data-testid="kyc-count-inUaiid-n"]').innerText()) === '1' &&
      (await page.locator('[data-testid="kyc-count-legacy-n"]').innerText()) === '4');
    check('4 cartões na fila', (await cards.count()) === 4);
    const order = await cards.evaluateAll((els) => els.map((e) => e.getAttribute('data-decide-in')));
    check('"Aguardando você" sobe; painel do UaiID por último', order.join(',') === 'drexame,drexame,drexame,uaiid', order.join(','));

    // cartão 0 = nome divergente (Marcelo): lado a lado + destaque
    const c0 = card(page, 0);
    const dBox = await c0.locator('[data-testid="kyc-name-doc"]').boundingBox();
    const cBox = await c0.locator('[data-testid="kyc-name-cfm"]').boundingBox();
    check('nomes LADO A LADO (mesma linha, documento à esquerda do CFM)', !!dBox && !!cBox && Math.abs(dBox.y - cBox.y) < 3 && cBox.x > dBox.x + dBox.width - 3,
      `doc=${JSON.stringify(dBox)} cfm=${JSON.stringify(cBox)}`);
    check('colunas com larguras próximas (comparação justa)', !!dBox && !!cBox && Math.abs(dBox.width - cBox.width) < 4);
    const diffs = await c0.locator('[data-diff="true"]').allInnerTexts();
    check('só a palavra divergente é destacada (SANTOS × SOUZA)', diffs.join(',') === 'SANTOS,SOUZA', diffs.join(','));
    check('veredito "Nomes diferentes"', (await c0.locator('[data-testid="kyc-name-verdict"]').innerText()) === 'Nomes diferentes');
    check('motivo da fila (nome do documento diferente do CFM)', /nome do documento é diferente do nome no CFM/.test(await c0.locator('[data-testid="kyc-reason"]').innerText()));
    // contraste do destaque: marca vermelha ≠ cor do texto normal e fundo tingido
    const style = await c0.locator('[data-diff="true"]').first().evaluate((e) => { const s = getComputedStyle(e); return { color: s.color, bg: s.backgroundColor, deco: s.textDecorationLine }; });
    check('destaque não depende só de cor (sublinhado + fundo)', style.deco.includes('underline') && style.bg !== 'rgba(0, 0, 0, 0)', JSON.stringify(style));
    check('Aprovar e Recusar presentes (Aguardando você)', (await c0.getByRole('button', { name: 'Aprovar', exact: true }).count()) === 1 && (await c0.getByRole('button', { name: 'Recusar', exact: true }).count()) === 1);
    const approveH = (await c0.getByRole('button', { name: 'Aprovar', exact: true }).boundingBox())?.height ?? 0;
    check('alvo de toque ≥ 44px', approveH >= 44, `h=${approveH}`);

    // cartão 1 = nomes que conferem + 2 tentativas anteriores
    const c1 = card(page, 1);
    check('nomes iguais (caixa/partícula) → "Nomes conferem", sem destaque', (await c1.locator('[data-testid="kyc-name-verdict"]').innerText()) === 'Nomes conferem' && (await c1.locator('[data-diff="true"]').count()) === 0);
    check('⚠ "2 tentativas anteriores neste CRM"', /2 tentativas anteriores neste CRM/.test(await c1.innerText()));
    check('motivo "Tudo conferiu"', /Tudo conferiu/.test(await c1.locator('[data-testid="kyc-reason"]').innerText()));
    check('semelhança 100% e score 96', /100%/.test(await c1.innerText()) && /Score do UaiID\s*96/.test((await c1.innerText()).replace(/\n/g, ' ')));

    // cartão 2 = sem nome do documento
    const c2 = card(page, 2);
    check('sem nome do documento → "Não recebido do UaiID" + "Sem como comparar"', /Não recebido do UaiID/.test(await c2.innerText()) && /Sem como comparar/.test(await c2.innerText()));

    // cartão 3 = decide no UaiID (sem botões)
    const c3 = card(page, 3);
    check('painel do UaiID: aviso do plano e SEM botões de decisão',
      /Decida no painel do UaiID — o resultado volta sozinho\./.test(await c3.innerText()) && (await c3.getByRole('button', { name: /^(Aprovar|Recusar)$/ }).count()) === 0);
    check('painel do UaiID: mostra o ID da verificação p/ copiar', /ver_r39f3a1c7e2b/.test(await c3.innerText()) && (await c3.getByRole('button', { name: /Copiar ID/ }).count()) === 1);

    // médicos antigos + prazo
    const legacy = page.locator('[data-testid="kyc-legacy"]');
    check('bloco "Médicos antigos" com 4 linhas', (await legacy.locator('[data-testid="kyc-legacy-row"]').count()) === 4);
    check('prazo atual exibido', /Prazo atual: até \d{2}\/\d{2}\/\d{4}/.test(await legacy.innerText()));
    check('NÃO expõe autoApprove / aprovação automática', !/auto[- ]?approve|aprovação automática|aprova[cç][aã]o autom/i.test(await text(page)));

    // chip "Identidade: …" nas linhas dos médicos (abaixo do painel)
    const chips = await page.locator('[data-testid="identity-chip"]').allInnerTexts();
    check('chips "Identidade: …" na lista (7 status; sem campo = sem chip)', chips.length >= 9 && chips.every((c) => c.startsWith('Identidade: ')), chips.join(' | '));
    for (const lbl of ['Identidade: verificada', 'Identidade: aguardando você', 'Identidade: no UaiID', 'Identidade: recusada', 'Identidade: pendente', 'Identidade: em andamento', 'Identidade: não verificada (antigo)']) {
      check(`chip "${lbl}"`, chips.includes(lbl));
    }
    const semCampoRow = docRow(page, 'Antônio Sem Campo');
    check('médico sem verificationStatus → sem chip', (await semCampoRow.count()) === 1 && (await semCampoRow.locator('[data-testid="identity-chip"]').count()) === 0);
    check('filtro "✓ Verificados" (e-mail) intacto', /✓ Verificados \(\d+\)/.test(await text(page)));
  }
  await noOverflow(page, name);
  await shot(page, `01-panel-${name}`);
  // 1ª tela: o painel começa logo abaixo do título da aba (rola até o título do painel)
  await page.getByRole('heading', { name: 'Verificação de identidade' }).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -88));
  await settle(page, 250);
  await shot(page, `01-top-${name}`, { fullPage: false });
  if (name === '375-light' || name === '1280-light' || name === '375-dark') {
    await elShot(card(page, 0), `01-card-mismatch-${name}`);
    await elShot(card(page, 1), `01-card-match-prior-${name}`);
    await elShot(card(page, 3), `01-card-uaiid-${name}`);
    await elShot(page.locator('[data-testid="kyc-legacy"]'), `01-legacy-${name}`);
    await elShot(page.locator('[data-testid="kyc-counters"]'), `01-counters-${name}`);
  }
  await ctx.close();
}
});

// ═════════════════════════════ 2 · APROVAR ═════════════════════════════
await run(2, 'Aprovar — confirmação + nota, idempotência, INVALID_STATE', async () => {
  const state = makeAdminState();
  const { ctx, page } = await openAdmin({ width: 375, height: 800 }, state);
  await settle(page);
  const c1 = card(page, 1); // Ana (tentativas anteriores)
  await c1.getByRole('button', { name: 'Aprovar', exact: true }).click();
  const dlg = dialog(page);
  await dlg.waitFor();
  check('diálogo "Aprovar este médico?" com observação opcional', /Aprovar este médico\?/.test(await dlg.innerText()) && /Observação \(opcional\)/.test(await dlg.innerText()));
  check('aviso "o médico não vê" + tentativas anteriores no diálogo', /o médico não vê/.test(await dlg.innerText()) && /2 tentativas anteriores neste CRM/.test(await dlg.innerText()));
  await settle(page, 350);
  await shot(page, '02-approve-dialog-375-light', { fullPage: false });
  await dlg.getByLabel('Observação (opcional)').fill('Conferido no CFM e no UaiID.');
  await dlg.getByRole('button', { name: 'Aprovar', exact: true }).click();
  await page.waitForSelector('[data-testid="kyc-notice"]');
  await settle(page, 600);
  const call = state.calls.find((c) => c.path.endsWith('/verification/approve'));
  check('POST approve com a nota', !!call && call.path === '/admin/doctors/doc-r2/verification/approve' && call.body?.note === 'Conferido no CFM e no UaiID.', JSON.stringify(call));
  const notice = page.locator('[data-testid="kyc-notice"]');
  check('aviso de sucesso em português', /Aprovado: Dra\. Ana Beatriz Cardoso Lima já pode atender\./.test(await notice.innerText()));
  check('cartão sai da fila (refetch sem reload) e contador cai para 2', (await page.locator('[data-testid="kyc-review-card"]').count()) === 3 && (await page.locator('[data-testid="kyc-count-waiting-n"]').innerText()) === '2');
  check('lista de médicos atualizada: chip da Ana virou "Identidade: verificada"',
    (await docRow(page, 'Ana Beatriz Cardoso Lima').locator('[data-testid="identity-chip"]').innerText()) === 'Identidade: verificada');
  check('não recarregou a página (hash segue /admin)', /#\/admin/.test(page.url()));
  // o aviso é FIXO: aparece na tela onde o dono está (meio da fila), acima da barra do mobile
  const nb = await notice.boundingBox();
  const footerTop = (await page.locator('footer').boundingBox())?.y ?? Infinity;
  const vh = await page.evaluate(() => window.innerHeight);
  check('aviso visível na tela atual (fixo) e acima da barra inferior do mobile', !!nb && nb.y >= 0 && nb.y + nb.height <= vh && nb.y + nb.height <= footerTop + 1, JSON.stringify({ nb, footerTop, vh }));
  check('aviso tem largura de leitura (cabe nos 375px)', !!nb && nb.x >= 0 && nb.x + nb.width <= 375);
  await shot(page, '02-approve-done-375-light', { fullPage: false });

  // idempotente: unchanged → sucesso, sem erro
  state.unchanged = true;
  await card(page, 1).getByRole('button', { name: 'Aprovar', exact: true }).click(); // Tiago
  await dialog(page).waitFor();
  const tiagoBody = await dialog(page).innerText();
  check('nomes divergentes/ausentes: diálogo de aprovar identifica o médico', /Tiago Mendes/.test(tiagoBody));
  await dialog(page).getByRole('button', { name: 'Aprovar', exact: true }).click();
  await page.waitForFunction(() => /Tiago Mendes já pode atender/.test(document.body.innerText));
  const noteless = state.calls.filter((c) => c.path.endsWith('/verification/approve')).at(-1);
  check('sem nota → corpo {} (nada de campo vazio)', JSON.stringify(noteless?.body) === '{}', JSON.stringify(noteless?.body));
  check('unchanged = sucesso (nenhum erro na tela)', (await page.locator('[data-testid="kyc-notice"]').getAttribute('data-kind')) === 'ok');

  // INVALID_STATE → mensagem em português, diálogo fecha, fila atualiza
  state.fail.approve = { status: 409, body: { code: 'INVALID_STATE', status: 'rejected', error: 'Só dá para aprovar quem está em análise na fila do Dr. Exame.' } };
  await card(page, 0).getByRole('button', { name: 'Aprovar', exact: true }).click(); // Marcelo
  await dialog(page).waitFor();
  await dialog(page).getByRole('button', { name: 'Aprovar', exact: true }).click();
  await page.waitForSelector('[data-testid="kyc-notice"][data-kind="error"]');
  const errTxt = await page.locator('[data-testid="kyc-notice"]').innerText();
  check('INVALID_STATE em português, com a situação atual', /não está mais aguardando a sua decisão \(situação atual: recusado\)/.test(errTxt), errTxt);
  check('código técnico não vaza', !/INVALID_STATE/.test(errTxt));
  check('aviso de erro tem role=alert', (await page.locator('[data-testid="kyc-notice"]').getAttribute('role')) === 'alert');
  check('diálogo fechou depois do INVALID_STATE', await dialog(page).waitFor({ state: 'detached', timeout: 4000 }).then(() => true, () => false));
  await shot(page, '02-invalid-state-375-light', { fullPage: false });
  await page.locator('[data-testid="kyc-notice"]').getByRole('button', { name: 'Fechar' }).click();
  await page.locator('[data-testid="kyc-notice"]').waitFor({ state: 'detached' });
  check('erro fica até o dono fechar ("Fechar" remove o aviso)', (await page.locator('[data-testid="kyc-notice"]').count()) === 0);
  await noOverflow(page, 'aprovar');
  await ctx.close();
});

// ═════════════════════════════ 3 · RECUSAR ═════════════════════════════
await run(3, 'Recusar — motivo obrigatório, aviso de e-mail, atalhos, REASON_REQUIRED', async () => {
  const state = makeAdminState();
  const { ctx, page } = await openAdmin({ width: 375, height: 800 }, state);
  await settle(page);
  await card(page, 0).getByRole('button', { name: 'Recusar', exact: true }).click(); // Marcelo
  const dlg = dialog(page);
  await dlg.waitFor();
  await settle(page, 350);
  const body = await dlg.innerText();
  check('aviso "Este motivo será enviado por e-mail ao médico."', body.includes('Este motivo será enviado por e-mail ao médico.'));
  const noticeY = (await dlg.locator('[data-testid="kyc-reject-notice"]').boundingBox())?.y ?? 0;
  const fieldY = (await dlg.getByLabel('Motivo da recusa').boundingBox())?.y ?? 0;
  check('o aviso vem ANTES do campo', noticeY > 0 && noticeY < fieldY, `aviso=${noticeY} campo=${fieldY}`);
  check('4 atalhos de motivo', ['Documento ilegível', 'Nome do documento não confere com o CRM', 'CRM inativo no CFM', 'Suspeita de documento de terceiros'].every((s) => body.includes(s)));
  const confirm = dlg.getByRole('button', { name: 'Recusar e avisar o médico' });
  check('confirmar desabilitado com motivo vazio', await confirm.isDisabled());
  await dlg.getByLabel('Motivo da recusa').fill('   ');
  check('confirmar continua desabilitado com só espaços', await confirm.isDisabled());
  await shot(page, '03-reject-dialog-375-light', { fullPage: false });
  await dlg.getByRole('button', { name: 'Documento ilegível', exact: true }).click();
  await dlg.getByRole('button', { name: 'CRM inativo no CFM', exact: true }).click();
  const v = await dlg.getByLabel('Motivo da recusa').inputValue();
  check('atalhos preenchem o campo (frases encadeadas)', v === 'Documento ilegível. CRM inativo no CFM', v);
  check('contador de caracteres', /\d+\/500/.test(await dlg.innerText()));
  check('confirmar habilitado', await confirm.isEnabled());
  await confirm.click();
  await page.waitForSelector('[data-testid="kyc-notice"]');
  const call = state.calls.find((c) => c.path.endsWith('/verification/reject'));
  check('POST reject com o motivo', call?.path === '/admin/doctors/doc-r1/verification/reject' && call.body?.reason === 'Documento ilegível. CRM inativo no CFM', JSON.stringify(call));
  check('aviso: motivo segue por e-mail', /recusada\. O motivo segue por e-mail ao médico\./.test(await page.locator('[data-testid="kyc-notice"]').innerText()));
  await settle(page, 500);
  check('cartão saiu da fila', (await page.locator('[data-testid="kyc-review-card"]').count()) === 3);

  // REASON_REQUIRED (servidor) → diálogo continua aberto, texto preservado
  state.fail.reject = { status: 400, body: { code: 'REASON_REQUIRED', error: 'Informe o motivo.' } };
  await card(page, 0).getByRole('button', { name: 'Recusar', exact: true }).click(); // Ana
  await dialog(page).waitFor();
  await dialog(page).getByLabel('Motivo da recusa').fill('Foto cortada');
  await dialog(page).getByRole('button', { name: 'Recusar e avisar o médico' }).click();
  await dialog(page).locator('[role="alert"]').waitFor();
  const errTxt = await dialog(page).innerText();
  check('REASON_REQUIRED em português dentro do diálogo', /Escreva o motivo da recusa\. Ele é enviado por e-mail ao médico\./.test(errTxt) && !/REASON_REQUIRED/.test(errTxt), errTxt.slice(-200));
  check('diálogo segue aberto e preserva o texto', (await dialog(page).getByLabel('Motivo da recusa').inputValue()) === 'Foto cortada');
  await shot(page, '03-reject-dialog-error-375-light', { fullPage: false });
  await dialog(page).getByRole('button', { name: 'Cancelar' }).click();
  await dialog(page).waitFor({ state: 'detached' });

  // INVALID_STATE na recusa (já decidido em outro lugar)
  state.fail.reject = { status: 409, body: { code: 'INVALID_STATE', status: 'pending' } };
  await card(page, 0).getByRole('button', { name: 'Recusar', exact: true }).click();
  await dialog(page).waitFor();
  await dialog(page).getByLabel('Motivo da recusa').fill('CRM inativo no CFM');
  await dialog(page).getByRole('button', { name: 'Recusar e avisar o médico' }).click();
  await page.waitForSelector('[data-testid="kyc-notice"][data-kind="error"]');
  check('INVALID_STATE na recusa também vira português', /não está mais aguardando a sua decisão/.test(await page.locator('[data-testid="kyc-notice"]').innerText()));
  await noOverflow(page, 'recusar');
  await ctx.close();
});
await run('3b', 'Diálogos de recusar/aprovar — 375 escuro e 1280 claro/escuro', async () => {
for (const [width, dark, name] of [[375, true, '375-dark'], [1280, false, '1280-light'], [1280, true, '1280-dark']]) {
  const { ctx, page } = await openAdmin({ width, height: 800, dark }, makeAdminState());
  await settle(page);
  await card(page, 0).getByRole('button', { name: 'Recusar', exact: true }).click();
  await dialog(page).waitFor();
  await dialog(page).getByRole('button', { name: 'Nome do documento não confere com o CRM', exact: true }).click();
  await settle(page, 400);
  await shot(page, `03-reject-dialog-${name}`, { fullPage: false });
  await dialog(page).getByRole('button', { name: 'Cancelar' }).click();
  await dialog(page).waitFor({ state: 'detached' });
  await card(page, 1).getByRole('button', { name: 'Aprovar', exact: true }).click();
  await dialog(page).waitFor();
  await settle(page, 400);
  await shot(page, `02-approve-dialog-${name}`, { fullPage: false });
  await ctx.close();
}
});

// ═════════════════════════════ 4 · MÉDICOS ANTIGOS EM LOTE ═════════════════════════════
await run(4, 'Médicos antigos — seleção + aprovação em lote', async () => {
  const state = makeAdminState();
  const { ctx, page } = await openAdmin({ width: 375, height: 800 }, state);
  await settle(page);
  const legacy = page.locator('[data-testid="kyc-legacy"]');
  await legacy.scrollIntoViewIfNeeded();
  const approveBtn = legacy.getByRole('button', { name: /^Aprovar selecionados/ });
  check('"Aprovar selecionados" desabilitado sem seleção', await approveBtn.isDisabled());
  await legacy.getByLabel('Selecionar todos').check();
  check('selecionar todos → "Aprovar selecionados (4)"', (await approveBtn.innerText()) === 'Aprovar selecionados (4)');
  await legacy.getByLabel('Selecionar Dra. Camila Duarte').uncheck();
  check('desmarcar um → (3)', (await approveBtn.innerText()) === 'Aprovar selecionados (3)');
  await approveBtn.click();
  const dlg = dialog(page);
  await dlg.waitFor();
  const t = await dlg.innerText();
  check('confirmação explícita ("Aprovar 3 médicos antigos?") e só mexe em legado', /Aprovar 3 médicos antigos\?/.test(t) && /mexe apenas em médicos antigos/.test(t), t.replace(/\n/g, ' | '));
  await settle(page, 500); // espera o fade do diálogo terminar antes da foto
  await shot(page, '04-legacy-confirm-375-light', { fullPage: false });
  await dlg.getByRole('button', { name: 'Cancelar' }).click();
  await dlg.waitFor({ state: 'detached' });
  check('cancelar não chama o servidor', state.calls.filter((c) => c.path.includes('approve-legacy')).length === 0);
  await approveBtn.click();
  await dialog(page).getByRole('button', { name: 'Aprovar', exact: true }).click();
  await page.waitForSelector('[data-testid="kyc-notice"]');
  const call = state.calls.find((c) => c.path === '/admin/doctors/verification/approve-legacy');
  check('POST approve-legacy com os 3 ids marcados', !!call && JSON.stringify([...call.body.ids].sort()) === JSON.stringify(['doc-l1', 'doc-l3', 'doc-l4']), JSON.stringify(call?.body));
  check('aviso "3 médicos antigos aprovados."', /3 médicos antigos aprovados\./.test(await page.locator('[data-testid="kyc-notice"]').innerText()));
  await settle(page, 500);
  check('lista de antigos encolhe para 1 e contador atualiza', (await legacy.locator('[data-testid="kyc-legacy-row"]').count()) === 1 && (await page.locator('[data-testid="kyc-count-legacy-n"]').innerText()) === '1');
  check('seleção limpa depois do lote', await legacy.getByRole('button', { name: /^Aprovar selecionados$/ }).isDisabled());
  // erro do servidor no lote
  state.fail.legacy = { status: 500, body: {} };
  await legacy.getByLabel('Selecionar todos').check();
  await legacy.getByRole('button', { name: /^Aprovar selecionados/ }).click();
  await dialog(page).getByRole('button', { name: 'Aprovar', exact: true }).click();
  await page.waitForSelector('[data-testid="kyc-notice"][data-kind="error"]');
  check('falha genérica em português', /Não foi possível concluir\. Tente novamente\./.test(await page.locator('[data-testid="kyc-notice"]').innerText()));
  await noOverflow(page, 'lote');
  await ctx.close();
});

// ═════════════════════════════ 5 · PRAZO ═════════════════════════════
await run(5, 'Prazo para médicos antigos — data → legacyGraceUntilMs', async () => {
  const state = makeAdminState();
  const { ctx, page } = await openAdmin({ width: 1280, height: 800 }, state);
  await settle(page);
  const legacy = page.locator('[data-testid="kyc-legacy"]');
  await legacy.scrollIntoViewIfNeeded();
  const input = legacy.locator('input[type="date"]');
  check('campo traz o prazo atual do GET /admin/config', (await input.inputValue()) === dateInput(state.graceMs), `${await input.inputValue()} vs ${dateInput(state.graceMs)}`);
  const today = dateInput(Date.now());
  check('min = hoje (data futura)', (await input.getAttribute('min')) === today, `${await input.getAttribute('min')} vs ${today}`);
  const save = legacy.getByRole('button', { name: 'Salvar prazo' });
  check('"Salvar prazo" desabilitado sem alteração', await save.isDisabled());
  const nCalls = () => state.calls.filter((c) => c.path === '/admin/config/costs').length;

  await input.fill(dateInput(Date.now() - 3 * DAY));
  check('"Salvar prazo" habilitado após editar', await save.isEnabled());
  await save.click();
  await settle(page, 300);
  check('data passada barrada no cliente, em português, sem chamar o servidor', /Escolha uma data futura\./.test(await legacy.innerText()) && nCalls() === 0);

  const target = dateInput(Date.now() + 60 * DAY);
  await input.fill(target);
  await save.click();
  await page.waitForSelector('[data-testid="kyc-notice"][data-kind="ok"]');
  const call = state.calls.find((c) => c.path === '/admin/config/costs');
  const [y, mo, d] = target.split('-').map(Number);
  const expectMs = new Date(y, mo - 1, d, 23, 59, 59, 999).getTime();
  check('PATCH category=doctorKyc + legacyGraceUntilMs = fim do dia escolhido (ms)', call?.body?.category === 'doctorKyc' && call.body.legacyGraceUntilMs === expectMs, JSON.stringify(call?.body));
  check('nunca envia outro campo (autoApprove fora)', JSON.stringify(Object.keys(call.body).sort()) === JSON.stringify(['category', 'legacyGraceUntilMs']));
  check('aviso "Prazo salvo" + "Prazo atual" atualizado', /Prazo salvo/.test(await page.locator('[data-testid="kyc-notice"]').innerText()) && new RegExp(`Prazo atual: até ${String(d).padStart(2, '0')}/${String(mo).padStart(2, '0')}/${y}`).test(await legacy.innerText()));

  // KYC_CONFIG_INVALID do servidor → português no próprio campo
  state.fail.grace = { status: 400, body: { code: 'KYC_CONFIG_INVALID', error: 'legacyGraceUntilMs deve ser 0 (sem prazo) ou uma data futura em milissegundos.' } };
  await input.fill(dateInput(Date.now() + 90 * DAY));
  await save.click();
  await settle(page, 400);
  const lt = await legacy.innerText();
  check('KYC_CONFIG_INVALID em português no campo', /Prazo inválido\. Escolha uma data futura ou deixe sem prazo\./.test(lt) && !/KYC_CONFIG_INVALID|legacyGraceUntilMs/.test(lt), lt.slice(0, 300));
  await shot(page, '05-grace-error-1280-light', { fullPage: false });

  // remover prazo → 0
  await input.fill(target); // volta ao valor salvo → limpa o erro ao editar
  await legacy.getByRole('button', { name: 'Remover prazo' }).click();
  await page.waitForFunction(() => /Prazo removido/.test(document.body.innerText));
  const rm = state.calls.filter((c) => c.path === '/admin/config/costs').at(-1);
  check('"Remover prazo" envia legacyGraceUntilMs = 0', rm?.body?.legacyGraceUntilMs === 0, JSON.stringify(rm?.body));
  check('"Prazo atual: sem prazo" e botão some', /Prazo atual: sem prazo/.test(await legacy.innerText()) && (await legacy.getByRole('button', { name: 'Remover prazo' }).count()) === 0);
  // limpar o campo e salvar também = sem prazo (0)
  await input.fill(dateInput(Date.now() + 30 * DAY));
  await input.fill('');
  check('campo vazio fica "sujo" só se havia prazo (aqui já é sem prazo → desabilitado)', await save.isDisabled());
  await noOverflow(page, 'prazo');
  await ctx.close();
});

// ═════════════════════════════ 6 · ESTADOS VAZIOS / ERRO ═════════════════════════════
await run('6a', 'Estados vazios (375 claro/escuro, 1280 claro)', async () => {
for (const [width, dark, name] of [[375, false, '375-light'], [375, true, '375-dark'], [1280, false, '1280-light']]) {
  const { ctx, page } = await openAdmin({ width, height: 800, dark }, makeAdminState({ empty: true }));
  await settle(page, 600);
  if (name === '375-light') {
    const t = await text(page);
    check('fila vazia: "Nenhum médico aguardando análise"', /Nenhum médico aguardando análise/.test(t));
    check('legado vazio: "Nenhum médico antigo sem verificação"', /Nenhum médico antigo sem verificação/.test(t));
    check('contadores zerados', (await page.locator('[data-testid="kyc-count-waiting-n"]').innerText()) === '0' && (await page.locator('[data-testid="kyc-count-legacy-n"]').innerText()) === '0');
    check('prazo continua acessível no estado vazio', (await page.locator('[data-testid="kyc-legacy"] input[type="date"]').count()) === 1 && /Prazo atual: sem prazo/.test(t));
  }
  await noOverflow(page, `vazio ${name}`);
  await shot(page, `06-empty-${name}`);
  await ctx.close();
}
});
await run('6b', 'Erro de carga, cache offline vazio e config indisponível', async () => {
  // queue 500 → SectionError + "Tentar de novo"; offline-first vazio ≠ fila vazia
  const state = makeAdminState();
  state.queue.status = 500;
  const { ctx, page } = await openAdmin({ width: 375, height: 800 }, state);
  await settle(page, 500);
  const t = await text(page);
  check('GET da fila falha → "Não foi possível carregar a verificação de identidade."', /Não foi possível carregar a verificação de identidade\./.test(t));
  check('lista de médicos (abaixo) continua funcionando', /Médicos & Portais/.test(t) && (await page.locator('[data-testid="identity-chip"]').count()) > 0);
  await shot(page, '06-error-375-light');
  state.queue.status = 200;
  await page.getByRole('button', { name: 'Tentar de novo' }).first().click();
  await page.waitForSelector('[data-testid="kyc-counters"]');
  check('"Tentar de novo" recarrega sem reload', (await page.locator('[data-testid="kyc-review-card"]').count()) === 4);
  state.queue.offlineEmpty = true;
  await page.getByRole('button', { name: 'Atualizar verificação de identidade' }).click();
  await page.waitForSelector('[data-testid="kyc-notice"][data-kind="error"]');
  check('resposta vazia do cache offline NÃO vira "Tudo em dia": mantém a fila e avisa "Sem conexão"',
    (await page.locator('[data-testid="kyc-review-card"]').count()) === 4 && /Sem conexão\. Tente novamente\./.test(await page.locator('[data-testid="kyc-notice"]').innerText()));
  await ctx.close();
  // config indisponível → campo de prazo travado, resto funciona
  const s2 = makeAdminState();
  s2.config.status = 500;
  const o2 = await openAdmin({ width: 375, height: 800 }, s2);
  await settle(o2.page, 500);
  check('GET /admin/config falhou → prazo "indisponível" e campo travado', /Prazo atual: indisponível/.test(await o2.page.locator('[data-testid="kyc-legacy"]').innerText()) && (await o2.page.locator('[data-testid="kyc-legacy"] input[type="date"]').isDisabled()));
  await o2.ctx.close();
});

// ═════════════════════════════ 7 · SELO NA FILA DO PACIENTE ═════════════════════════════
await run(7, 'FalarAgora — selo "Identidade verificada" só com verified === true (320/375/1280, claro/escuro)', async () => {
  const status = (doctors) => ({
    online: true, entry: null, doctorsOnline: doctors.length, doctors, priceRangeCents: { min: 8000, max: 25000 }, matched: null,
  });
  const base = (over) => ({ photoAvailable: false, city: null, ...over });
  // verified: true → selo · false / campo ausente (server antigo) / valor não-booleano → SEM selo
  const DOCS = [
    { key: 'Helena Duarte', verified: true, d: base({ id: 'd-a', name: 'Dra. Helena Duarte', specialty: 'Cardiologia', crmUf: 'SP', priceCents: 15000, city: 'São Paulo', verified: true }) },
    { key: 'Ricardo Vasconcelos', verified: false, d: base({ id: 'd-b', name: 'Dr. Ricardo Vasconcelos', specialty: 'Clínica Geral', crmUf: 'MG', priceCents: 8000, verified: false }) },
    { key: 'Bruno Lemos', verified: false, d: base({ id: 'd-c', name: 'Dr. Bruno Lemos de Albuquerque Filho', specialty: 'Endocrinologia e Metabologia', crmUf: 'RJ', priceCents: 25000, city: 'Rio de Janeiro' }) }, // campo ausente
    { key: 'Marina Teixeira', verified: true, d: base({ id: 'd-d', name: 'Dra. Marina Teixeira', specialty: 'Dermatologia', crmUf: 'BA', priceCents: 12000, verified: true }) },
    { key: 'Maria Fernanda', verified: true, d: base({ id: 'd-e', name: 'Dra. Maria Fernanda Albuquerque de Vasconcelos Pimentel', specialty: 'Endocrinologia Pediátrica e Metabologia', crmUf: 'RS', priceCents: 19000, city: 'Porto Alegre', verified: true }) }, // pior caso: nome + especialidade longos COM selo
    { key: 'Paulo Truthy', verified: false, d: base({ id: 'd-f', name: 'Dr. Paulo Truthy', specialty: 'Clínica Geral', crmUf: 'GO', priceCents: 9000, verified: 'true' }) }, // não-booleano: NÃO ganha selo
  ];
  const payload = status(DOCS.map((x) => x.d));
  const patientHandler = async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname.replace(/^.*?\/api/, '');
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const json = (data) => route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(data) });
    if (p === '/auth/me') return json({ user: PATIENT_USER, patientId: 'p1' });
    if (p === '/teleconsulta-queue/status') return json(payload);
    if (p.startsWith('/reminders')) return json([]);
    return json({});
  };
  const VERIFIED_KEYS = DOCS.filter((x) => x.verified).map((x) => x.key);
  for (const [width, dark] of [[375, false], [375, true], [1280, false], [1280, true], [320, false], [320, true]]) {
    const name = `${width}-${dark ? 'dark' : 'light'}`;
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: dark ? 'dark' : 'light', isMobile: width < 800, hasTouch: width < 800, deviceScaleFactor: width < 800 ? 2 : 1 });
    ctx.setDefaultTimeout(20_000);
    await ctx.addInitScript(({ user, dark }) => {
      localStorage.setItem('token', 'qa-token'); localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('patientId', 'p1'); localStorage.setItem('selPatientId', 'p1');
      localStorage.setItem('onboarded', '1'); localStorage.setItem('lead_popup_dismissed_at', String(Date.now()));
      sessionStorage.setItem('profileSkippedSession', '1'); // sem o modal "complete seu perfil" cobrindo a tela
      localStorage.setItem('dxGoals', '[]'); // sem o quiz "O que você quer entender?" (GoalQuiz)
      if (dark) { localStorage.setItem('theme', 'dark'); localStorage.setItem('RaStore.theme', JSON.stringify('dark')); }
    }, { user: PATIENT_USER, dark });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(`[fa ${name}] ${String(e).slice(0, 220)}`));
    await page.route('**/api/**', patientHandler);
    await page.goto(`${BASE}/#/consultas`, { waitUntil: 'commit', timeout: 60_000 });
    const faCard = page.getByLabel('Falar agora com um médico');
    await faCard.waitFor({ timeout: 90_000 });
    await noSplash(page);
    await page.waitForSelector('text=Dra. Helena Duarte', { timeout: 30_000 });
    await settle(page, 600);
    console.log(`  • ${name}`);

    // nenhum modal de onboarding cobrindo a lista (o screenshot tem de PROVAR o selo)
    check(`sem modal de onboarding cobrindo a lista (${name})`, (await page.getByRole('dialog').count()) === 0 && !/O que você quer entender|Vamos preparar o Dr\. Exame/.test(await text(page)));

    const rows = faCard.locator('button[aria-label^="Falar com"]');
    const rowOf = (key) => rows.filter({ hasText: key });
    const badgeOf = (key) => rowOf(key).locator('[data-testid="identity-verified-badge"]');

    // ── presença: EXATAMENTE nos verificados, por médico (nome → selo) ──
    check(`${DOCS.length} médicos na lista (${name})`, (await rows.count()) === DOCS.length);
    for (const { key, verified } of DOCS) {
      const n = await badgeOf(key).count();
      const label = (await rowOf(key).getAttribute('aria-label')) || '';
      check(`selo ${verified ? 'PRESENTE' : 'AUSENTE'} em ${key} (${name})`, n === (verified ? 1 : 0) && /identidade verificada/i.test(label) === verified, `selos=${n} aria="${label}"`);
    }
    const total = await faCard.locator('[data-testid="identity-verified-badge"]').count();
    check(`selo exatamente nos ${VERIFIED_KEYS.length} verificados de ${DOCS.length} (${name})`, total === VERIFIED_KEYS.length, `total=${total}`);
    const b0 = badgeOf('Helena Duarte');
    check(`selo: texto visível "Identidade verificada" + aria-label + role=img (${name})`,
      (await b0.innerText()).trim() === 'Identidade verificada' && (await b0.getAttribute('aria-label')) === 'Identidade verificada' && (await b0.getAttribute('role')) === 'img');

    // ── layout: o selo cabe na coluna de texto, não colide com o preço e não vira uma pilha de linhas ──
    for (const key of VERIFIED_KEYS) {
      const row = rowOf(key);
      const bb = await badgeOf(key).boundingBox();
      const rb = await row.boundingBox();
      const pb = await row.getByText(/^R\$ \d/).first().boundingBox();
      check(`selo de ${key} dentro da coluna e sem colidir com o preço (${name})`, !!bb && !!rb && !!pb && bb.x >= rb.x - 1 && bb.x + bb.width <= pb.x + 1, `badge=${JSON.stringify(bb)} price=${JSON.stringify(pb)}`);
      check(`selo de ${key} em no máximo 2 linhas (${name})`, !!bb && bb.height <= 34, `h=${bb?.height}`);
    }
    await noOverflow(page, `FalarAgora ${name}`);

    // ── fotos: cartão inteiro + recortes justos (verificado · não verificado · pior caso longo) ──
    await hideFixedBottom(page);
    await elShot(faCard, `07-falaragora-${name}`);
    await elShot(rowOf('Helena Duarte'), `07-badge-verified-${name}`);
    await elShot(rowOf('Ricardo Vasconcelos'), `07-badge-notverified-${name}`);
    await elShot(rowOf('Maria Fernanda'), `07-badge-long-verified-${name}`);
    await restoreFixed(page);
    await ctx.close();
  }
});

// ═════════════════════════════ resultado ═════════════════════════════
console.log('\n──────── resumo ────────');
if (reactWarnings.length) { console.log(`⚠ avisos do React (${reactWarnings.length}):`); [...new Set(reactWarnings)].slice(0, 12).forEach((w) => console.log('  ', w)); }
if (pageErrors.length) { console.log(`✗ erros de página (${pageErrors.length}):`); [...new Set(pageErrors)].slice(0, 12).forEach((w) => console.log('  ', w)); }
const bad = failures.length + pageErrors.length + reactWarnings.length;
console.log(`${passed} verificações ok · ${failures.length} falhas · ${pageErrors.length} erros de página · ${reactWarnings.length} avisos do React`);
failures.forEach((f) => console.log(`  ✗ ${f}`));
console.log(`📸 ${OUT}`);
// o Chromium headless no Windows às vezes não fecha: tenta fechar, mas nunca prende o script
await Promise.race([browser.close().catch(() => {}), new Promise((r) => setTimeout(r, 10_000))]);
process.exit(bad ? 1 : 0);
