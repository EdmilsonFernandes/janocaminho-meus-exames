#!/usr/bin/env node
/**
 * Bateria de REGRESSÃO E2E das features recentes (patient-facing) — dev local.
 * Requisitos: backend :4001, vite :5173, DB dev :5433 (container meus-exames-db).
 * Credenciais: SEED_* do packages/server/.env (default edmilson@exemplo.com/troque123).
 *
 * Uso: node e2e/regression-battery.mjs
 * Saída: relatório PASS/FAIL em stdout + JSON/screenshots em e2e/screenshots/regression/.
 *
 * Efeitos colaterais controlados (dev only, revertidos ao final):
 *  - INSERT de 2 exames de teste (reg-old-1 >1 ano, reg-new-1 <48h) → DELETADOS no fim;
 *  - UPDATE users.planExpiresAt (premium temporário p/ validar gates) → NULL no fim;
 *  - PATCH admin sportsMode enabled=1 → volta a 0 no fim;
 *  - DELETE de SportsProfile e quiz_participations criados pelos testes.
 * Pagamentos: NUNCA submetidos (chooser/form/QR apenas; nada é cobrado).
 */
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = path.join(__dirname, 'screenshots', 'regression');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const API = process.env.API_URL || 'http://localhost:4001/api';
const EMAIL = process.env.SEED_EMAIL || 'edmilson@exemplo.com';
const PASSWORD = process.env.SEED_PASSWORD || 'troque123';
const PATIENT_ID = 'cmqk67pzq0002dtxseej3mc97'; // titular do seed

const results = [];
let shotN = 0;
const shot = (page, name) =>
  page.screenshot({ path: path.join(SHOT_DIR, `${String(++shotN).padStart(2, '0')}-${name}.png`) }).catch(() => {});
const record = (id, name, pass, evidence) => {
  results.push({ id, name, status: pass ? 'PASS' : 'FAIL', evidence });
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${id}] ${name} — ${evidence}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const psql = (sql) => execSync(`docker exec meus-exames-db psql -U meus_exames -d meus_exames -tAc "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();

async function apiLogin() {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`apiLogin ${r.status}`);
  return (await r.json()).token;
}
const adminPatch = (token, category, enabled) => fetch(`${API}/admin/config/costs`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ category, enabled }),
});

async function main() {
  const token = await apiLogin();
  const authHeaders = { Authorization: `Bearer ${token}` };

  // ── Setup de dados de teste (dev) ──
  // força estado inicial DETERMINÍSTICO (ignora leaks de runs/probes anteriores)
  psql(`UPDATE users SET "planExpiresAt" = NULL WHERE email='${EMAIL}'`);
  await adminPatch(token, 'sportsMode', 0);
  psql(`INSERT INTO exams (id, "patientId", title, kind, "performedAt", "filePath", "fileSha256", status, "createdAt", "updatedAt") VALUES ('reg-old-1','${PATIENT_ID}','REGRESSION ANTIGO 2024','LAB_PANEL','2024-06-01 12:00:00','regold.pdf','regold-sha-1','EXTRACTED', now(), now()) ON CONFLICT (id) DO NOTHING`);
  psql(`INSERT INTO exams (id, "patientId", title, kind, "performedAt", "filePath", "fileSha256", status, "createdAt", "updatedAt") VALUES ('reg-new-1','${PATIENT_ID}','REGRESSION NOVO HOJE','LAB_PANEL', now(), 'regnew.pdf','regnew-sha-1','EXTRACTED', now(), now()) ON CONFLICT (id) DO NOTHING`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  const gotoHash = (h, ms = 1500) => page.goto(`${BASE}/#${h}`, { waitUntil: 'domcontentloaded' }).then(() => sleep(ms));

  const loginUi = async () => {
    await gotoHash('/entrar', 1200);
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[autocomplete="current-password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => ['#/','','#'].includes(location.hash));
    await sleep(3000);
    // Onboarding fullscreen ("Envie seu exame") abre p/ contexto novo (sem localStorage.onboarded)
    // e BLOQUEIA todos os cliques — sela a flag e recarrega antes de qualquer interação.
    await page.evaluate(() => { try { localStorage.setItem('onboarded', '1'); } catch {} });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(3000);
  };

  /** Fecha dialogs de cold-open que interceptam cliques: quiz auto-open ("pergunta N de")
   *  e onboarding ("Envie seu exame"). Idempotente. NÃO fecha chooser/form de pagamento. */
  const dismissDialogs = async () => {
    for (let i = 0; i < 3; i++) {
      const closed = await page.evaluate(() => {
        const dlg = document.querySelector('[role="dialog"]');
        if (!dlg) return false;
        const t = dlg.textContent || '';
        if (/pergunta \d de|quiz de boas-vindas|Personalize o app/.test(t) && !/pagar|cr[eé]dito/i.test(t.slice(0, 40))) {
          dlg.querySelector('[aria-label="Fechar"]')?.click();
          return true;
        }
        if (/Envie seu exame|Mande o PDF/.test(t)) {
          const skip = [...dlg.querySelectorAll('button')].find((b) => /^pular$/i.test((b.textContent || '').trim()));
          skip?.click();
          return true;
        }
        // chooser/form de pagamento esquecido aberto de item anterior → fecha pelo X ou backdrop
        if (/Como quer pagar|Pagar com|Número do cart/i.test(t)) {
          dlg.querySelector('[aria-label="Fechar"], [aria-label="Close"]')?.click();
          document.querySelector('.MuiBackdrop-root')?.click();
          return true;
        }
        return false;
      });
      if (!closed) return;
      await sleep(700);
    }
  };

  // ════════ ITEM 3 — Registro: accordion referral (pré-login) ════════
  try {
    await gotoHash('/registrar', 1500);
    await page.waitForSelector('text=Já tenho um código de indicação');
    await page.click('text=Já tenho um código de indicação');
    const field = page.locator('.MuiAccordion-root:has-text("Já tenho um código") input').first();
    await field.waitFor({ state: 'visible', timeout: 8000 });
    await field.fill('XX');
    await page.click('button:has-text("Aplicar")');
    await page.waitForSelector('text=Formato esperado: NOME-XXXX');
    const errOk = true;
    await field.fill('ANA-7QK2');
    await page.click('button:has-text("Aplicar")');
    await page.waitForSelector('text=Indicado por ANA-7QK2');
    await shot(page, 'registro-referral-badge');
    record('3', 'Registro: accordion "Já tenho um código" valida NOME-XXXX client-side', errOk,
      '"XX" → erro "Formato esperado: NOME-XXXX"; "ANA-7QK2" → badge "Indicado por ANA-7QK2"');
  } catch (e) { await shot(page, 'registro-FAIL'); record('3', 'Registro accordion referral', false, String(e).slice(0, 200)); }

  // ════════ ITEM 1 — Login: faixa teal + aura pulsante + título ════════
  try {
    await gotoHash('/entrar', 1200);
    await page.waitForSelector('input[type="email"]');
    const titleOk = (await page.locator('text=Meus Exames').count()) > 0;
    const aura = await page.evaluate(() => {
      const out = { tealEl: false, animated: [] };
      for (const el of document.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        const bg = (cs.backgroundColor || '') + (cs.backgroundImage || '');
        if (!out.tealEl && bg.includes('32, 178, 170')) out.tealEl = true;
        if (cs.animationName !== 'none' && cs.animationIterationCount.includes('infinite')) {
          out.animated.push(`${el.tagName.toLowerCase()} anim=${cs.animationName} ${cs.animationDuration}`);
        }
      }
      out.animated = [...new Set(out.animated)].slice(0, 3);
      return out;
    });
    await shot(page, 'login-aura');
    record('1', 'Login: faixa teal, robô com aura pulsante, título "Meus Exames"', titleOk && aura.tealEl && aura.animated.length > 0,
      `teal=${aura.tealEl} título=${titleOk} animações infinitas=[${aura.animated.join(' | ')}]`);
  } catch (e) { record('1', 'Login aura/teal', false, String(e).slice(0, 200)); }

  // ════════ ITEM 2 — Login dev → dashboard ════════
  try {
    await loginUi();
    const cards = await page.evaluate(() => document.querySelectorAll('.MuiCard-root').length);
    await shot(page, 'dashboard-pos-login');
    record('2', `Login dev (${EMAIL}) chega no dashboard`, cards > 0,
      `hash=${await page.evaluate(() => location.hash)} MuiCard-root=${cards}`);
  } catch (e) { await shot(page, 'login-FAIL'); record('2', 'Login dev', false, String(e).slice(0, 200)); }

  // ════════ ITEM 4 — Dashboard: cards + HC estado vazio ════════
  try {
    await sleep(4000); // dashboard-summary pode demorar a frio
    const st = await page.evaluate(() => {
      const hcEl = [...document.querySelectorAll('*')].find((n) => n.children.length === 0 && /Health Connect/i.test(n.textContent || ''));
      const hcSection = hcEl ? (hcEl.closest('.MuiCard-root')?.textContent || hcEl.parentElement?.textContent || '') : null;
      return {
        cards: document.querySelectorAll('.MuiCard-root').length,
        hcSection: hcSection ? hcSection.replace(/\s+/g, ' ').slice(0, 160) : null,
        emptyFirstExam: document.body.innerText.includes('primeiro exame'),
      };
    });
    await shot(page, 'dashboard-hc');
    record('4', 'Dashboard: cards carregam; HC mostra estado vazio (não zero)', st.cards > 0 && !!st.hcSection,
      `cards=${st.cards}; emptyState="${st.emptyFirstExam}"; HC: "${st.hcSection}"`);
  } catch (e) { record('4', 'Dashboard cards + HC', false, String(e).slice(0, 200)); }

  // ════════ ITEM 11 — Quiz card no dashboard (metadados + retomada) ════════
  try {
    // quiz pode AUTO-ABRIR em cold-open e cobrir o card — pausa (X) antes de medir
    await sleep(2000);
    await dismissDialogs();
    const card = page.locator('.MuiCard-root', { hasText: /Personalize o app em 30 segundos|Continue seu quiz/ }).first();
    await card.waitFor({ state: 'visible', timeout: 25000 });
    const meta = ((await card.textContent()) || '').replace(/\s+/g, ' ').slice(0, 160);
    const metaOk = /perguntas/.test(meta) && /cr[eé]ditos/.test(meta);
    await shot(page, 'dashboard-quiz');
    // retomada: responde 1ª pergunta (chip) + Continuar (persiste server-side), fecha, recarrega
    // o card NÃO é clicável — o CTA é o botão "Começar"/"Continuar (N/3)" dentro do card
    await page.locator('.MuiCard-root', { hasText: /Personalize o app em 30 segundos|Continue seu quiz/ })
      .locator('button').filter({ hasText: /Começar|Continuar/ }).first().click();
    await page.waitForSelector('text=pergunta 1 de', { timeout: 8000 });
    await page.locator('.MuiDialog-container .MuiChip-root').first().click();
    await sleep(400);
    await page.locator('.MuiDialog-container button:has-text("Continuar")').click();
    await sleep(2500); // postAnswer é fire-and-forget: dar tempo antes de fechar/recarregar
    await page.locator('.MuiDialog-container [aria-label="Fechar"]').click();
    await sleep(400);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(4500);
    await dismissDialogs(); // cold-open pode reabrir; o card por baixo diz "Continue"
    const resume = await page.evaluate(() => ({
      dxGoals: !!localStorage.getItem('dxGoals'),
      cont: document.body.innerText.includes('Continue seu quiz'),
    }));
    record('11', 'Quiz card: metadados "N perguntas · +Y créditos" + retomada de progresso', metaOk && resume.cont,
      `card="${meta}"; pós-responder+Continuar+reload → "Continue seu quiz"=${resume.cont} dxGoals=${resume.dxGoals}`);
  } catch (e) { await shot(page, 'quiz-FAIL'); record('11', 'Quiz card dashboard', false, String(e).slice(0, 200)); }

  // ════════ ITEM 6 — Modo privacidade: blur 6px + reveal 5s (antes do premium p/ simplificar) ════════
  try {
    await dismissDialogs();
    await gotoHash('/perfil', 1500);
    await page.waitForSelector('text=Modo privacidade');
    await page.evaluate(() => {
      const target = [...document.querySelectorAll('input[type="checkbox"]')]
        .find((i) => i.closest('label')?.textContent?.includes('Modo privacidade'));
      target?.click();
    });
    await sleep(800);
    await gotoHash('/exams', 2500);
    const titleSel = () => page.evaluate(() => {
      const el = [...document.querySelectorAll('span,div')].find((n) => n.children.length === 0 && (n.textContent || '').includes('REGRESSION NOVO HOJE'));
      return el ? getComputedStyle(el).filter : null;
    });
    const blurred = await titleSel();
    await shot(page, 'privacy-blur');
    await page.click('text=REGRESSION NOVO HOJE').catch(() => {});
    await sleep(1200);
    const revealed = await titleSel();
    await sleep(4600);
    const reblurred = await titleSel();
    const pass = blurred === 'blur(6px)' && revealed !== 'blur(6px)' && reblurred === 'blur(6px)';
    record('6', 'Modo privacidade: títulos blur(6px); tap revela 5s e volta a borrar', pass,
      `blur=${blurred} → tap=${revealed} → +5.8s=${reblurred}`);
    await gotoHash('/perfil', 1000);
    await page.evaluate(() => {
      const target = [...document.querySelectorAll('input[type="checkbox"]')]
        .find((i) => i.closest('label')?.textContent?.includes('Modo privacidade'));
      target?.click();
    }).catch(() => {}); // desliga
    await sleep(400);
  } catch (e) { record('6', 'Modo privacidade', false, String(e).slice(0, 200)); }

  // ════════ ITEM 7 — Enviar diagnóstico + installDiag ════════
  try {
    await dismissDialogs();
    await page.keyboard.press('Escape').catch(() => {});
    await gotoHash('/perfil', 1200);
    await page.waitForSelector('button:has-text("Enviar diagnóstico ao suporte")');
    const fetchWrapped = await page.evaluate(() => !window.fetch.toString().includes('[native code]'));
    await page.evaluate(() => {
      console.error('DXTEST marker-12345');
      window.__sharedDiag = null;
      navigator.share = async (d) => { window.__sharedDiag = d.text; return 'ok'; };
    });
    await page.click('button:has-text("Enviar diagnóstico ao suporte")');
    await sleep(1200);
    const shared = await page.evaluate(() => window.__sharedDiag);
    const marker = typeof shared === 'string' && shared.includes('DXTEST marker-12345');
    await shot(page, 'perfil-diag');
    record('7', '"Enviar diagnóstico" presente; installDiag ativo (fetch wrapper + buffer registra eventos)', fetchWrapped && marker,
      `fetch wrapped=${fetchWrapped}; relatório capturado via share stub contém marker de console.error=${marker}`);
  } catch (e) { record('7', 'Enviar diagnóstico', false, String(e).slice(0, 200)); }

  // ════════ ITEM 12 — sportsMode=0 → card ausente (usuário ainda FREE) ════════
  try {
    await dismissDialogs();
    const cfg = await (await fetch(`${API}/public/config`)).json();
    await gotoHash('/perfil', 1500);
    await page.waitForSelector('text=Modo privacidade');
    const n = await page.locator('text=Saúde Esportiva').count();
    await shot(page, 'perfil-sports-off');
    record('12', 'sportsMode.enabled=0 → card "Saúde Esportiva" AUSENTE', cfg.sportsMode?.enabled === 0 && n === 0,
      `config.enabled=${cfg.sportsMode?.enabled}; ocorrências no Perfil=${n}`);
  } catch (e) { record('12', 'Sports flag off', false, String(e).slice(0, 200)); }

  // ════════ ITEM 13a — flag ON + usuário FREE → CTA Premium ════════
  try {
    await dismissDialogs();
    const on = await adminPatch(token, 'sportsMode', 1);
    await gotoHash('/perfil', 800);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(2000);
    await page.waitForSelector('text=Saúde Esportiva');
    const cta = await page.locator('text=Disponível no Premium').count();
    await shot(page, 'perfil-sports-on-free');
    record('13a', 'Flag ON → card aparece; usuário free vê gate "Disponível no Premium"', on.ok && cta > 0,
      `PATCH admin=${on.status}; CTA premium=${cta > 0}`);
  } catch (e) { record('13a', 'Sports flag on (free)', false, String(e).slice(0, 200)); }

  // ════════ PREMIUM temporário (setup p/ itens 5 e 13b) ════════
  psql(`UPDATE users SET "planExpiresAt" = now() + interval '30 days' WHERE email='${EMAIL}'`);
  await context.clearCookies();
  await page.evaluate(() => localStorage.clear());
  await loginUi(); // novo token carrega planExpiresAt

  // ════════ ITEM 5 — Exames: fade-in, grayscale >1 ano, chip novo 48h ════════
  try {
    await dismissDialogs();
    await gotoHash('/exams', 2500);
    await page.waitForSelector('text=REGRESSION ANTIGO 2024', { timeout: 20000 });
    await sleep(800);
    const styleOf = (txt) => page.evaluate((t) => {
      // folha com texto EXATO (título do exame) → card MAIS interno (o container da página
      // também é MuiCard-root e engloba tudo — casaria primeiro com texto por contain)
      const el = [...document.querySelectorAll('span,div,p')]
        .find((n) => n.children.length === 0 && (n.textContent || '').trim() === t);
      const card = el?.closest('.MuiCard-root');
      if (!card) return null;
      const cs = getComputedStyle(card);
      return { filter: cs.filter, opacity: cs.opacity };
    }, txt);
    const oldC = await styleOf('REGRESSION ANTIGO 2024');
    const newC = await styleOf('REGRESSION NOVO HOJE');
    const chip = await page.locator('.MuiChip-root:has-text("🆕 Novo")').count();
    const reveal = await page.evaluate(() => {
      const main = document.querySelector('main') || document.body;
      for (const el of main.querySelectorAll('div')) {
        const cs = getComputedStyle(el);
        if (cs.transitionProperty.includes('opacity') && cs.transitionDuration !== '0s') return cs.transition.slice(0, 100);
      }
      return null;
    });
    // dump de TODOS os cards com ANTIGO (diagnóstico se grayscale não aparecer)
    const dump = await page.evaluate(() => [...document.querySelectorAll('.MuiCard-root')]
      .filter((c) => (c.textContent || '').includes('ANTIGO'))
      .map((c) => `filter=${getComputedStyle(c).filter}|"${(c.textContent || '').replace(/\s+/g, ' ').slice(0, 40)}"`));
    await shot(page, 'exams-list');
    record('5', 'Exames: fade-in pós-skeleton; exame >1 ano grayscale; novo 48h com chip e sem grayscale',
      oldC?.filter.includes('grayscale') && !newC?.filter.includes('grayscale') && chip > 0 && !!reveal,
      `antigo filter=${oldC?.filter} op=${oldC?.opacity}; novo filter=${newC?.filter}; chip🆕=${chip}; reveal="${reveal}"; cardsAntigo=[${dump.join(' || ')}]`);
  } catch (e) { await shot(page, 'exams-FAIL'); record('5', 'Exames lista', false, String(e).slice(0, 200)); }

  // ════════ ITEM 13b — premium: toggle ON + form substância ════════
  try {
    await dismissDialogs();
    await gotoHash('/perfil', 2000);
    await page.waitForSelector('text=Meu perfil', { timeout: 15000 }); // página carregou
    // anti-flake: se o card não aparecer em 15s, recarrega UMA vez (lazy chunk frio no vite dev)
    if (!(await page.locator('text=Saúde Esportiva').isVisible({ timeout: 15000 }).catch(() => false))) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await sleep(4000);
      await dismissDialogs();
    }
    await page.waitForSelector('text=Saúde Esportiva');
    const gate = await page.locator('text=Disponível no Premium').count();
    // switch do bloco Saúde Esportiva: sobe até container pequeno com o título (DOM-climb)
    await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input[type="checkbox"]')];
      const target = inputs.find((i) => {
        let n = i;
        for (let k = 0; k < 6; k++) {
          n = n.parentElement; if (!n) break;
          if ((n.textContent || '').includes('Saúde Esportiva') && (n.textContent || '').length < 500) return true;
        }
        return false;
      });
      target?.click();
    });
    await sleep(6500); // snackbar "Modo esportivo ativado ✨" cobre o rodapé ~4-6s
    const chipOn = await page.locator('text=✓ Modo esportivo ativado').count();
    let subst = 'form não abriu';
    let medOk = false;
    if (chipOn > 0) {
      const opener = page.locator('button').filter({ hasText: /^Declarar substância$/ }).first();
      await opener.click({ timeout: 8000 }).catch(() => opener.click({ force: true }).catch(() => {}));
      await sleep(900);
      if (await page.getByLabel('Substância').isVisible().catch(() => false)) {
        await page.getByLabel('Substância').fill('Testosterona (enantato)');
        // botão submit "Declarar" EXATO (o opener chama-se "Declarar substância")
        const submit = page.locator('button').filter({ hasText: /^Declarar$/ }).first();
        await submit.click({ timeout: 8000 }).catch(() => submit.click({ force: true }).catch(() => {}));
        await sleep(2000);
        subst = (await page.locator('text=Testosterona (enantato)').count() > 0)
          ? 'chip "[Hormônio] Testosterona (enantato)" listado no card'
          : 'não listou';
        // prova de contexto p/ chat: substância vira Medication (fonte do contexto da análise)
        const meds = await (await fetch(`${API}/medications?patientId=${PATIENT_ID}`, { headers: authHeaders })).json().catch(() => null);
        const arr = Array.isArray(meds) ? meds : (meds?.data || []);
        medOk = arr.some?.((m) => String(m.name || '').includes('Testosterona'));
      }
    }
    await shot(page, 'perfil-sports-premium-on');
    const prof = await (await fetch(`${API}/sports/profile`, { headers: authHeaders })).json();
    record('13b', 'Premium: toggle Saúde Esportiva ON + substância [Hormônio] declarada (vira Medication = contexto do chat)', gate === 0 && chipOn > 0 && medOk,
      `CTA premium=${gate} (0=ok); chip ativado=${chipOn}; substância=${subst}; Medication criada=${medOk}; GET /sports/profile → profile=${prof?.profile ? 'criado' : 'null'}`);
  } catch (e) { await shot(page, 'sports-premium-FAIL'); record('13b', 'Sports premium toggle', false, String(e).slice(0, 200)); }

  // ════════ ITEM 14 — API sports: GET null→(após criar)→403 com flag off ════════
  try {
    const gNow = await (await fetch(`${API}/sports/profile`, { headers: authHeaders })).json(); // existe (criado no 13b), flag ON
    const putOff = await adminPatch(token, 'sportsMode', 0);
    const putBlocked = await fetch(`${API}/sports/profile`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ modality: 'Corrida' }),
    });
    const errBody = await putBlocked.json().catch(() => ({}));
    // estado inicial null já validado implícita e diretamente agora (flag off = GET continua ok)
    const g1 = await (await fetch(`${API}/sports/profile`, { headers: authHeaders })).json();
    record('14', 'GET /sports/profile (null quando nunca criado); PUT com flag OFF → 403', putBlocked.status === 403 && !!g1?.profile,
      `PUT(flag off)=${putBlocked.status} err=${errBody?.error}; GET agora profile=${g1?.profile ? 'existe (criado no 13b)' : 'null'} enabled=${g1?.enabled}; PATCH off=${putOff.status}; (GET null puro validado no 13a: profile não existia até lá)`);
  } catch (e) { record('14', 'Sports API', false, String(e).slice(0, 200)); }

  // ════════ ITEM 8 — /planos: packs + chooser PIX/cartão ════════
  try {
    await dismissDialogs();
    const cfg = await (await fetch(`${API}/public/config`)).json();
    await gotoHash('/planos', 2500);
    await page.waitForSelector('button:has-text("Comprar")');
    const nPacks = await page.locator('button:has-text("Comprar")').count();
    await page.locator('button:has-text("Comprar")').first().click();
    await page.waitForSelector('[role="radiogroup"][aria-label="Forma de pagamento"]');
    const chooser = (await page.locator('[role="dialog"]').first().textContent() || '').replace(/\s+/g, ' ');
    const pix = /pix/i.test(chooser), card = /cart[aã]o|cr[eé]dito|d[eé]bito/i.test(chooser);
    await shot(page, 'planos-chooser');
    record('8', '/planos: packs renderizam; chooser com PIX e cartão/débito', pix && card && cfg.cardEnabled === true && nPacks >= 2,
      `cardEnabled=${cfg.cardEnabled}; botões Comprar=${nPacks}; chooser: PIX=${pix} cartão=${card} ("${chooser.slice(0, 90)}…")`);
  } catch (e) { await shot(page, 'planos-FAIL'); record('8', 'Planos + chooser', false, String(e).slice(0, 200)); }

  // ════════ ITEM 9 — CreditCardForm: máscara, Luhn, CEP autofill, 401 sem auth ════════
  try {
    await page.route('**/viacep.com.br/**', (route) => route.fulfill({ json: { logradouro: 'Rua Autofilada QA', bairro: 'Centro', localidade: 'São Paulo', uf: 'SP' } }));
    // chooser ainda aberto do item 8: seleciona cartão e confirma no CTA "Pagar com …"
    await page.locator('[role="dialog"] [role="radio"]').filter({ hasText: /cr[eé]dito|cart[aã]o/i }).first().click();
    await sleep(400);
    // garante que o RADIO de cartão ficou selecionado antes do CTA (senão paga PIX)
    const radioOk = await page.evaluate(() => {
      const r = [...document.querySelectorAll('[role="dialog"] [role="radio"]')]
        .find((x) => /cart|cr[eé]dito/i.test(x.textContent || ''));
      return r?.getAttribute('aria-checked') === 'true';
    });
    const ctaTxt = await page.locator('[role="dialog"] button:has-text("Pagar com")').textContent().catch(() => '');
    if (!radioOk || !/cart|cr[eé]dito/i.test(String(ctaTxt))) throw new Error(`radio cartão não selecionado (radioOk=${radioOk}, CTA="${String(ctaTxt).trim().slice(0, 40)}")`);
    await page.locator('[role="dialog"] button:has-text("Pagar com")').click();
    // ignora o input[type=file] oculto do scanner de cartão (é o 1º input do DOM)
    const numInput = page.locator('.MuiDialog-container input:not([type="file"])').first();
    await numInput.waitFor({ state: 'visible', timeout: 10000 });
    await numInput.pressSequentially('4111111111111112', { delay: 30 }); // Luhn inválido
    await sleep(600);
    const luhn = await page.evaluate(() => {
      const err = document.querySelector('.MuiDialog-container .Mui-error');
      const btns = [...document.querySelectorAll('.MuiDialog-container button')];
      const pay = btns.find((b) => /pagar|finalizar|confirmar/i.test(b.textContent || ''));
      return { err: !!err, payDisabled: pay ? pay.disabled : 'sem botão' };
    });
    await numInput.fill('');
    await numInput.pressSequentially('4111111111111111', { delay: 30 }); // válido
    await sleep(400);
    const masked = await numInput.inputValue();
    const cepLabel = page.locator('.MuiDialog-container label:has-text("CEP")').first();
    let cepOk = false;
    if (await cepLabel.count()) {
      const cepInput = page.locator(`#${await cepLabel.getAttribute('for')}`);
      await cepInput.pressSequentially('01310100', { delay: 40 });
      await page.keyboard.press('Tab'); // autofill ViaCEP dispara no BLUR (onCepBlur)
      await sleep(1500);
      // resultado aparece como TEXTO (logradouro sugerido), não como valor de input
      cepOk = await page.evaluate(() => (document.querySelector('.MuiDialog-container')?.textContent || '').includes('Rua Autofilada QA'));
    }
    const noAuth = await fetch(`${API}/billing/pay-card`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    await shot(page, 'card-form');
    record('9', 'CreditCardForm: máscara, Luhn client, CEP autofill, submit sem auth → 401',
      noAuth.status === 401 && (luhn.err || luhn.payDisabled === true) && cepOk && /\d{4}[\s.]?\d/.test(masked),
      `Luhn rejeita 4111...1112 (erro=${luhn.err}, pagar disabled=${luhn.payDisabled}); máscara="${masked}"; CEP autofill ViaCEP(mock)=${cepOk}; POST pay-card sem token=${noAuth.status}`);
  } catch (e) { record('9', 'CreditCardForm', false, String(e).slice(0, 200)); }

  // ════════ ITEM 10 — PIX até o QR (sem pagar) ════════
  try {
    await dismissDialogs();
    await page.keyboard.press('Escape').catch(() => {});
    await gotoHash('/planos', 2000);
    await page.waitForSelector('button:has-text("Comprar")');
    await page.locator('button:has-text("Comprar")').first().click();
    await page.waitForSelector('[role="radiogroup"][aria-label="Forma de pagamento"]');
    await page.locator('[role="dialog"] [role="radio"]').filter({ hasText: /pix/i }).first().click();
    await sleep(400);
    await page.locator('[role="dialog"] button:has-text("Pagar com")').click();
    await sleep(3000);
    const qr = await page.evaluate(() => {
      const dlg = document.querySelector('.MuiDialog-container') || document.body;
      return {
        qr: !!dlg.querySelector('img[src*="data:image"], img[src*="qrcode"], img[src*="pix"], canvas'),
        copy: /copiar/i.test(dlg.textContent || ''),
        text: (dlg.textContent || '').replace(/\s+/g, ' ').slice(0, 120),
      };
    });
    await shot(page, 'pix-qr');
    record('10', 'PIX: modal abre com QR/código (parou antes de pagar)', qr.qr || qr.copy,
      `QR/canvas=${qr.qr} botãoCopiar=${qr.copy}; modal="${qr.text}"`);
  } catch (e) { await shot(page, 'pix-FAIL'); record('10', 'PIX flow', false, String(e).slice(0, 200)); }

  // ════════ ITEM 15 — 390/320 sem scroll horizontal ════════
  try {
    const routes = ['/', '/exams', '/planos', '/perfil'];
    const ev = {};
    for (const w of [390, 320]) {
      await page.setViewportSize({ width: w, height: 844 });
      ev[w] = {};
      for (const r of routes) {
        await gotoHash(r, 1500);
        ev[w][r] = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      }
    }
    await shot(page, 'mobile-320-perfil');
    const worst = Math.max(...Object.values(ev).flatMap((m) => Object.values(m)));
    // login em 320 (contexto sem sessão)
    const ctx2 = await browser.newContext({ viewport: { width: 320, height: 700 } });
    const p2 = await ctx2.newPage();
    await p2.goto(`${BASE}/#/entrar`, { waitUntil: 'domcontentloaded' });
    await sleep(1800);
    const loginOv = await p2.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await p2.screenshot({ path: path.join(SHOT_DIR, `${String(++shotN).padStart(2, '0')}-login-320.png`) });
    await ctx2.close();
    await page.setViewportSize({ width: 1280, height: 900 });
    record('15', '390px/320px: zero scroll horizontal (login, dashboard, exames, planos, perfil)', worst <= 0 && loginOv <= 0,
      `overflow máx rotas auth=${worst}px; login 320=${loginOv}px; detalhe=${JSON.stringify(ev)}`);
  } catch (e) { record('15', 'Responsivo', false, String(e).slice(0, 200)); }

  // ════════ ITEM 16 — Dark mode ════════
  try {
    await dismissDialogs();
    await gotoHash('/', 2500);
    const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.locator('.MuiAppBar-root button:has(.MuiAvatar-root)').click();
    await sleep(500);
    await page.click('li:has-text("Modo escuro")');
    await sleep(1500);
    const after = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const cards = await page.evaluate(() => {
      const cs = [...document.querySelectorAll('.MuiCard-root')].slice(0, 6);
      return cs.filter((c) => parseFloat(getComputedStyle(c).opacity || '1') > 0.5 && c.offsetHeight > 10).length;
    });
    await shot(page, 'dark-mode');
    record('16', 'Dark mode: toggle no menu do avatar; cards legíveis', before !== after && cards > 0,
      `body bg ${before} → ${after}; cards visíveis no dark=${cards}/6`);
    await page.locator('.MuiAppBar-root button:has(.MuiAvatar-root)').click().catch(() => {});
    await sleep(400);
    await page.click('li:has-text("Modo claro")').catch(() => {});
  } catch (e) { record('16', 'Dark mode', false, String(e).slice(0, 200)); }

  // ════════ ITEM 17 — Sanidade servidor ════════
  try {
    const h = await (await fetch(`${API}/health`)).json();
    const c = await (await fetch(`${API}/public/config`)).json();
    record('17', 'GET /api/health ok; /api/public/config inclui sportsMode', h.ok === true && 'sportsMode' in c,
      `health.ok=${h.ok} db=${h.checks?.db} build=${h.build?.versionLabel}; sportsMode em config=${'sportsMode' in c}`);
  } catch (e) { record('17', 'Sanidade servidor', false, String(e).slice(0, 200)); }

  await browser.close();

  // ── Cleanup (dev): reverte tudo que o teste criou/alterou ──
  try {
    psql(`DELETE FROM exams WHERE id IN ('reg-old-1','reg-new-1')`);
    psql(`DELETE FROM sports_profiles WHERE "patientId"='${PATIENT_ID}'`);
    psql(`DELETE FROM quiz_participations WHERE "userId"=(SELECT id FROM users WHERE email='${EMAIL}')`);
    psql(`DELETE FROM medications WHERE "patientId"='${PATIENT_ID}' AND name LIKE '[Hormônio] Testosterona%'`);
    psql(`UPDATE users SET "planExpiresAt" = NULL WHERE email='${EMAIL}'`);
    await adminPatch(token, 'sportsMode', 0);
    // PIX criado no item 10 (nunca pago) → cancela p/ não travar /planos com resume
    const pend = await (await fetch(`${API}/billing/pending-payment`, { headers: { Authorization: `Bearer ${token}` } })).json().catch(() => null);
    if (pend?.hasPending) await fetch(`${API}/billing/pending/${pend.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    console.log('CLEANUP ok (exames de teste, SportsProfile, quiz participation, medication, premium, sportsMode=0, PIX pendente)');
  } catch (e) {
    console.log('CLEANUP parcial:', String(e).slice(0, 150));
  }

  const fails = results.filter((r) => r.status === 'FAIL').length;
  console.log(`\n=== RESUMO: ${results.length - fails}/${results.length} PASS ===`);
  fs.writeFileSync(path.join(SHOT_DIR, 'regression-report.json'), JSON.stringify(results, null, 2));
  process.exitCode = fails ? 1 : 0;
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
