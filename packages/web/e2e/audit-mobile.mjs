/**
 * AUDITORIA MOBILE WEB (iOS Safari / Chrome Android) — Dr. Exame
 * -----------------------------------------------------------------
 * Mede por ROTA × LARGURA × ENGINE (chromium|webkit):
 *   1. Overflow horizontal REAL do documento (scrollWidth - clientWidth, tolerância 2px).
 *   2. Elementos ofensores: folhas visíveis cujo rect ultrapassa o viewport (right > vw+1.5).
 *      Filhos de contêiner com scroll horizontal próprio são OK no documento — o gate é
 *      o scrollWidth do <html>; a lista de ofensores serve para DIAGNÓSTICO de causa.
 *   3. Interativos cobertos pela MobileBottomNav no fim da rolagem.
 *   4. Não alcança o rodapé do documento (scrollHeight clamp).
 *   5. Erros de console/pageerror.
 *
 * Uso (a partir de packages/web):
 *   node e2e/audit-mobile.mjs                                  # chromium+webkit @390
 *   AUDIT_ENGINES=chromium AUDIT_WIDTHS=320,375,390,430 node e2e/audit-mobile.mjs
 *   AUDIT_OUT=e2e/screenshots/audit/after node e2e/audit-mobile.mjs
 * Saída: JSON em e2e/audit-report.json + resumo no stdout + screenshots em AUDIT_OUT.
 */
import { chromium, webkit } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:4011';
const API = `${BASE}/api`;
const OUT_DIR = process.env.AUDIT_OUT || 'e2e/screenshots/audit/before';
const WIDTHS = (process.env.AUDIT_WIDTHS || '390').split(',').map(Number);
const ENGINES = (process.env.AUDIT_ENGINES || 'chromium,webkit').split(',');
const SHOT_EVERY = Number(process.env.AUDIT_SHOT || 1); // 1 = screenshot em toda rota

const DEV_USER = 'edmilson@exemplo.com';
const DEV_PASS = 'troque123';

// ─── Matriz de rotas (extraída de App.tsx) ────────────────────────────────
const AUTH_ROUTES = [
  ['/', 'dashboard'],
  ['/exams', 'exams-list'],
  ['/alterados', 'alterados'],
  ['/evolucao', 'evolucao'],
  ['/tendencias', 'tendencias'],
  ['/linha-do-tempo', 'timeline'],
  ['/relatorio', 'relatorio'],
  ['/medicoes', 'medicoes'],
  ['/medicoes/historico/STEPS', 'medicoes-hist'],
  ['/saude-mental', 'saude-mental'],
  ['/medicamentos', 'medicamentos'],
  ['/vacinas', 'vacinas'],
  ['/lembretes', 'lembretes'],
  ['/emergencia', 'emergencia'],
  ['/conquistas', 'conquistas'],
  ['/despesas', 'despesas'],
  ['/familia', 'familia'],
  ['/patients', 'dependentes'],
  ['/medicos', 'medicos'],
  ['/perguntas', 'perguntas'],
  ['/perfil', 'perfil'],
  ['/seguranca', 'seguranca'],
  ['/privacidade', 'privacidade'],
  ['/planos', 'planos'],
  ['/faq', 'faq'],
  ['/chat', 'chat'],
  ['/notificacoes', 'notificacoes'],
  ['/suporte', 'suporte'],
  ['/api', 'api-panel'],
];
const PUBLIC_ROUTES = [
  ['/entrar', 'login'],
  ['/entrar/medico', 'login-medico'],
  ['/registrar', 'registrar'],
  ['/recuperar-senha', 'recuperar-senha'],
  ['/landing', 'landing'],
  ['/termos', 'termos'],
  ['/como-validamos', 'como-validamos'],
  ['/api-docs', 'api-docs'],
  ['/convite/token-invalido-teste', 'convite-invalido'],
  ['/doctor', 'doctor-portal'],
  ['/rota-que-nao-existe', 'notfound'],
];

const MEASURE = () => {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const vh = window.innerHeight;
  const docOverflowX = de.scrollWidth - vw;
  const bodyOverflowX = document.body ? document.body.scrollWidth - vw : 0;
  // Ofensores: elementos VISÍVEIS que furam o viewport à direita/esquerda e não têm
  // filho furando mais (folha do estouro) — reduz a cadeia de ancestrais ao culpado.
  const offenders = [];
  const all = document.querySelectorAll('*');
  for (const el of all) {
    // popups/modais têm overlay próprio acima da página — não são ofensores do layout da rota
    if (el.closest('.MuiModal-root, [role="dialog"]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 && r.height < 1) continue;
    if (r.right <= vw + 1.5 && r.left >= -1.5) continue;
    let outermost = true;
    for (const c of el.children) {
      const cr = c.getBoundingClientRect();
      if (cr.right > r.right + 0.5 || cr.left < r.left - 0.5) { outermost = false; break; }
    }
    if (!outermost) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) continue;
    // contido? — ancestor com overflow-x hidden/clip/auto/scroll = corte intencional
    // (fileira de chips com scroll próprio, blob decorativo clipado). Só é ofensor
    // REAL do documento quem fura SEM clipper (aí o docOvX sobe junto).
    let clipper = null;
    let p = el.parentElement;
    while (p && p !== document.documentElement) {
      const pcs = getComputedStyle(p);
      if (/(hidden|clip|auto|scroll)/.test(pcs.overflowX)) { clipper = `${p.tagName.toLowerCase()}.${String(p.className).slice(0, 40)}`; break; }
      p = p.parentElement;
    }
    offenders.push({
      tag: el.tagName.toLowerCase(),
      cls: String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').slice(0, 110),
      id: el.id || undefined,
      left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
      contained: !!clipper,
      clipper,
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 44),
    });
    if (offenders.length >= 10) break;
  }
  // Interativos cobertos pela bottom nav no fim da rolagem
  const navVar = getComputedStyle(de).getPropertyValue('--me-bottom-nav-h').trim();
  const navH = parseFloat(navVar) || 76;
  const covered = [];
  const interactive = document.querySelectorAll('a, button, [role="button"], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  for (const el of interactive) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const nav = document.querySelector('nav');
    if (nav && nav.contains(el)) continue;
    if (r.bottom > vh - navH + 6 && r.top < vh) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
      covered.push({ tag: el.tagName.toLowerCase(), text: (el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 40), bottom: Math.round(r.bottom), vh: Math.round(vh), navH });
      if (covered.length >= 6) break;
    }
  }
  return { vw, vh, docOverflowX, bodyOverflowX, offenders, covered, navVar, scrollHeight: de.scrollHeight, canReachBottom: true };
};

async function login() {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: DEV_USER, password: DEV_PASS }),
  });
  if (!r.ok) throw new Error(`login falhou: HTTP ${r.status}`);
  return r.json();
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const auth = await login();
  console.log(`login OK — user ${auth.user?.email} role=${auth.user?.role}`);

  // id do 1º exame p/ rota de detalhe
  let examId = null;
  try {
    const r = await fetch(`${API}/exams?_end=1&_start=0`, { headers: { Authorization: `Bearer ${auth.token}` } });
    const list = await r.json();
    if (Array.isArray(list) && list[0]) examId = list[0].id;
  } catch { /* sem exames — segue sem a rota de detalhe */ }
  const routes = [...AUTH_ROUTES];
  if (examId) routes.push([`/exams/${examId}`, 'exam-detail']);
  if (auth.user?.role === 'ADMIN') routes.push(['/admin', 'admin']);

  const results = [];
  const browsers = { chromium, webkit };

  for (const engineName of ENGINES) {
    const engine = browsers[engineName];
    if (!engine) throw new Error(`engine desconhecida: ${engineName}`);
    const browser = await engine.launch();
    console.log(`\n═══ ENGINE ${engineName} ═══`);

    for (const width of WIDTHS) {
      for (const [route, name] of [...routes, ...PUBLIC_ROUTES]) {
        const isPublic = PUBLIC_ROUTES.some(([r]) => r === route);
        const ctx = await browser.newContext({
          viewport: { width, height: 844 },
          hasTouch: true,
          ...(engineName === 'chromium' ? { isMobile: true } : {}),
          locale: 'pt-BR',
        });
        if (!isPublic) {
          await ctx.addInitScript((a) => {
            localStorage.setItem('token', a.token);
            localStorage.setItem('user', JSON.stringify(a.user));
            if (a.patientId) { localStorage.setItem('patientId', a.patientId); localStorage.setItem('selPatientId', a.patientId); }
            // determinismo: sem modais de onboarding/whatsnew/goalquiz atrapalhando a medição
            localStorage.setItem('onboarded', '1');
            localStorage.setItem('whatsnew_vc_9999', '1');
            localStorage.setItem('dxGoals', '[]');
            localStorage.setItem('meus_exames_libras', '0');
          }, { token: auth.token, user: auth.user, patientId: auth.patientId });
        } else {
          await ctx.addInitScript(() => {
            try { localStorage.setItem('meus_exames_libras', '0'); } catch {}
            // popups de aquisição (LeadPopup) fora da medição — landing/etc têm layout próprio
            try { localStorage.setItem('lead_popup_dismissed_at', String(Date.now())); sessionStorage.setItem('lead_popup_seen_session', '1'); } catch {}
          });
        }
        const page = await ctx.newPage();
        const consoleErrors = [];
        page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
        page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 160)}`));

        const rec = { engine: engineName, width, route, name, ok: false };
        try {
          await page.goto(`${BASE}/#${route}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await page.waitForTimeout(1700); // boot splash (1100ms) + fade + polls
          // popup de notificação push (ex.: "PIX expirou" do dev DB) encobre a página — dispensa.
          await page.getByRole('button', { name: 'Depois' }).click({ timeout: 1500 }).catch(() => {});
          await page.waitForTimeout(400);
          const m = await page.evaluate(MEASURE);
          // consegue rolar até o fim? (scroll-behavior:smooth anima o salto — usa instant + settle)
          const reach = await page.evaluate(async () => {
            const se = document.scrollingElement || document.documentElement;
            se.scrollTo({ top: se.scrollHeight, behavior: 'instant' });
            await new Promise((res) => setTimeout(res, 900));
            const atEnd = se.scrollTop + se.clientHeight >= se.scrollHeight - 3;
            const shAtEnd = se.scrollHeight;
            se.scrollTo({ top: 0, behavior: 'instant' });
            return { atEnd, shAtEnd };
          });
          // interativos cobertos pelo nav MEDIDOS NO FIM da rolagem (estado real do usuário).
          // Só se aplica ao shell do app: a var --me-bottom-nav-h só existe com MobileBottomNav
          // montada (páginas públicas/landing têm layout próprio, sem rodapé fixo do app).
          const coveredAtEnd = await page.evaluate(async () => {
            const se = document.scrollingElement || document.documentElement;
            se.scrollTo({ top: se.scrollHeight, behavior: 'instant' });
            await new Promise((res) => setTimeout(res, 700));
            const vh = window.innerHeight;
            const navVar = getComputedStyle(document.documentElement).getPropertyValue('--me-bottom-nav-h').trim();
            if (!navVar) return [];
            const navH = parseFloat(navVar) || 76;
            const nav = document.querySelector('nav');
            const out = [];
            for (const el of document.querySelectorAll('a, button, [role="button"], input, select, textarea')) {
              if (nav && nav.contains(el)) continue;
              // modals/drawers empilham ACIMA do nav (z 1300 > 1100) — não é cobertura real
              if (el.closest('.MuiModal-root, [role="dialog"], .MuiDrawer-root')) continue;
              const r = el.getBoundingClientRect();
              if (r.width < 1 || r.height < 1 || r.top > vh) continue;
              const cs = getComputedStyle(el);
              if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
              if (r.bottom > vh - navH + 6) out.push({ tag: el.tagName.toLowerCase(), text: (el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 40), bottom: Math.round(r.bottom) });
              if (out.length >= 6) break;
            }
            se.scrollTo({ top: 0, behavior: 'instant' });
            return out;
          });
          // dialogs abertos (modais podem poluir a medição — registrar qual)
          const dialogs = await page.evaluate(() =>
            [...document.querySelectorAll('[role="dialog"], .MuiDialog-root')].filter(d => {
              const cs = getComputedStyle(d); return cs.display !== 'none' && cs.visibility !== 'hidden';
            }).map(d => d.getAttribute('aria-label') || d.querySelector('h2,h6,.MuiDialogTitle-root')?.textContent?.slice(0, 40) || '(sem título)')
          );
          rec.docOverflowX = m.docOverflowX;
          rec.bodyOverflowX = m.bodyOverflowX;
          // ofensores REAIS = sem clipper intencional (contidos são design: chip-row c/
          // scroll próprio, blob clipado). LinearProgress indeterminado = animação.
          rec.offenders = (m.offenders || []).filter(o => !/MuiLinearProgress/.test(o.cls || '') && !o.contained);
          rec.containedOffenders = (m.offenders || []).filter(o => o.contained).length;
          rec.coveredByNav = coveredAtEnd;
          rec.canReachBottom = reach.atEnd;
          rec.dialogs = dialogs;
          rec.consoleErrors = consoleErrors.slice(0, 4);
          rec.ok = m.docOverflowX <= 2 && reach.atEnd && coveredAtEnd.length === 0;
          if (SHOT_EVERY) {
            const shot = path.join(OUT_DIR, `${engineName}-${width}-${name}.png`);
            await page.screenshot({ path: shot, fullPage: false, timeout: 20000 }).catch(() => {});
          }
          const flag = rec.ok ? 'OK ' : 'FAIL';
          const off = rec.offenders.length ? ` | ofensores: ${rec.offenders.slice(0, 3).map(o => `${o.tag}.${(o.cls||'').split(/\s+/)[0]||o.id||''}→${o.right}`).join(', ')}` : '';
          const cov = coveredAtEnd.length ? ` | SOB-NAV: ${coveredAtEnd.map(c => c.text || c.tag).slice(0, 2).join('|')}` : '';
          const dg = dialogs.length ? ` | dialog: ${dialogs[0]}` : '';
          console.log(`${flag} [${engineName} ${width}] ${name.padEnd(14)} docOvX=${String(m.docOverflowX).padStart(3)}${off}${cov}${!reach.atEnd ? ' | NÃO-ALCANÇA-FIM' : ''}${dg}${consoleErrors.length ? ' | consoleErr=' + consoleErrors.length : ''}`);
        } catch (e) {
          rec.error = String(e).slice(0, 200);
          console.log(`ERR  [${engineName} ${width}] ${name}: ${rec.error}`);
        }
        results.push(rec);
        await ctx.close();
      }
    }
    await browser.close();
  }

  fs.writeFileSync('e2e/audit-report.json', JSON.stringify(results, null, 2));
  const fail = results.filter(r => !r.ok);
  console.log(`\n═══ RESUMO: ${results.length - fail.length}/${results.length} OK · ${fail.length} FALHAS ═══`);
  process.exit(0);
})();
