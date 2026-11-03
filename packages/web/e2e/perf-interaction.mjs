/**
 * MEDIÇÃO · fluidez e tempo de resposta ao toque (avaliação 4★ de 02/11/26).
 *
 * Playwright + CDP: viewport Android 360×800, CPU throttling (1× e 4× = Android médio),
 * build de produção servido localmente. Mede por interação:
 *  - latência toque → mudança visível (poll de 8ms até a condição de DOM);
 *  - Event Timing (INP-like): duração dos eventos de input > 16ms;
 *  - long tasks (>50ms) durante o boot e durante as interações;
 *  - repouso no dashboard: animações ativas (document.getAnimations) e quadros perdidos (rAF > 32ms).
 *
 *   node e2e/perf-interaction.mjs   (E2E_BASE_URL / E2E_API_URL como nos demais)
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL || 'http://192.168.15.30:4175';
const API = process.env.E2E_API_URL || 'http://192.168.15.30:4001/api';
const RATES = (process.env.CPU_RATES || '1,4').split(',').map(Number);
const LABEL = process.env.PERF_LABEL || '';

const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'edmilson@exemplo.com', password: 'troque123' }) });
const session = await r.json();

const INSTRUMENT = () => {
  window.__perf = { longTasks: [], events: [] };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.longTasks.push({ t: Math.round(e.startTime), d: Math.round(e.duration) }); }).observe({ type: 'longtask', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.events.push({ name: e.name, t: Math.round(e.startTime), d: Math.round(e.duration), proc: Math.round(e.processingEnd - e.processingStart) }); }).observe({ type: 'event', buffered: true, durationThreshold: 16 }); } catch {}
};

async function measureIdle(page, ms) {
  return page.evaluate(async (ms) => {
    const anims = document.getAnimations();
    const infinite = anims.filter((a) => { try { return a.effect.getTiming().iterations === Infinity; } catch { return false; } }).length;
    let frames = 0, dropped = 0, worst = 0, last = performance.now();
    await new Promise((res) => { const t0 = performance.now(); const tick = (now) => { const dt = now - last; last = now; frames++; if (dt > 32) dropped++; if (dt > worst) worst = dt; if (now - t0 < ms) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
    return { animations: anims.length, infinite, frames, dropped, droppedPct: Math.round((dropped / frames) * 100), worstFrameMs: Math.round(worst) };
  }, ms);
}

async function tapAndWait(page, label, tap, condition, timeout = 15000) {
  const t0 = Date.now();
  const lt0 = await page.evaluate(() => window.__perf.longTasks.length);
  await tap();
  const deadline = t0 + timeout;
  let ok = false;
  while (Date.now() < deadline) { if (await page.evaluate(condition).catch(() => false)) { ok = true; break; } await page.waitForTimeout(8); }
  const latency = Date.now() - t0;
  await page.waitForTimeout(400);
  const lts = await page.evaluate((n) => window.__perf.longTasks.slice(n), lt0);
  const ev = await page.evaluate(() => window.__perf.events.filter((e) => /pointer|click|touch/.test(e.name)).slice(-3));
  return { label, ok, latencyMs: latency, longTasks: lts.length, longTaskMs: lts.reduce((a, b) => a + b.d, 0), worstEventMs: Math.max(0, ...ev.map((e) => e.d)) };
}

for (const rate of RATES) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36' });
  await ctx.addInitScript((s) => { localStorage.setItem('token', s.token); localStorage.setItem('patientId', s.patientId); localStorage.setItem('selPatientId', s.patientId); localStorage.setItem('user', JSON.stringify(s.user)); localStorage.setItem('onboarded', '1'); localStorage.setItem('dxGoals', '[]'); sessionStorage.setItem('coldDialogWinner', 'perf'); sessionStorage.setItem('engagementSlot', 'survey'); }, session);
  await ctx.addInitScript(INSTRUMENT);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });

  const tBoot = Date.now();
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await page.getByText(/Bo[am] (tarde|noite|dia)/).first().waitFor({ timeout: 60000 });
  await page.getByText(/Ver análise completa|envie seu primeiro exame/i).first().waitFor({ timeout: 60000 });
  const bootMs = Date.now() - tBoot;
  await page.waitForTimeout(1500);
  await page.waitForTimeout(Number(process.env.SETTLE_MS || 0)); // deixa o prefetch em idle terminar (uso real: o usuário lê o dashboard antes de tocar)
  const bootLT = await page.evaluate(() => ({ n: window.__perf.longTasks.length, ms: window.__perf.longTasks.reduce((a, b) => a + b.d, 0), worst: Math.max(0, ...window.__perf.longTasks.map((x) => x.d)) }));
  const idle = await measureIdle(page, 3000);

  const results = [];
  results.push(await tapAndWait(page, 'bottom-nav Exames', () => page.getByRole('button', { name: /^Exames$|Exames/ }).last().click(), () => location.hash.startsWith('#/exams') && !!document.querySelector('.RaList-main, [data-testid="exam-list"], .MuiDataGrid-root, .MuiTable-root, [class*="ExamList"]')));
  results.push(await tapAndWait(page, 'bottom-nav Início', () => page.getByRole('button', { name: /Início/ }).last().click(), () => location.hash === '#/' && !!document.body.textContent.match(/Bo[am] (tarde|noite|dia)/)));
  results.push(await tapAndWait(page, 'Ver análise completa', () => page.getByText(/Ver análise completa/).first().click(), () => location.hash !== '#/'));
  await page.goBack().catch(() => {});
  await page.waitForTimeout(800);
  results.push(await tapAndWait(page, 'menu Mais (drawer)', () => page.getByRole('button', { name: /Mais/ }).last().click(), () => !!document.querySelector('.MuiDrawer-modal .MuiDrawer-paper')));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  results.push(await tapAndWait(page, 'bottom-nav Consultas', () => page.getByRole('button', { name: /Cons/ }).last().click(), () => /#\/(consultas|medicos|encontrar)/.test(location.hash) && document.body.textContent.length > 2000));

  const inp = await page.evaluate(() => { const d = window.__perf.events.map((e) => e.d).sort((a, b) => b - a); return { count: d.length, p98: d[Math.floor(d.length * 0.02)] ?? 0, worst: d[0] ?? 0 }; });
  console.log(`\n=== ${LABEL} CPU ${rate}× · 360×800 · build prod ===`);
  console.log(`boot até dashboard útil: ${bootMs} ms · long tasks no boot: ${bootLT.n} (${bootLT.ms} ms bloqueados, pior ${bootLT.worst} ms)`);
  console.log(`repouso no dashboard (3s): animações ativas ${idle.animations} (infinitas ${idle.infinite}) · quadros ${idle.frames}, perdidos ${idle.dropped} (${idle.droppedPct}%), pior quadro ${idle.worstFrameMs} ms`);
  for (const x of results) console.log(`${x.ok ? 'ok ' : 'TIMEOUT'} ${x.label.padEnd(24)} latência ${String(x.latencyMs).padStart(5)} ms · long tasks ${x.longTasks} (${x.longTaskMs} ms) · pior evento de input ${x.worstEventMs} ms`);
  console.log(`eventos de input >16ms: ${inp.count} · p98 ${inp.p98} ms · pior ${inp.worst} ms`);
  await browser.close();
}
