/**
 * PERFIL DE CPU por interação (CDP Profiler) a 4× — quem gasta o tempo ao trocar de aba.
 *   node e2e/perf-profile.mjs
 */
import { chromium } from 'playwright';
const BASE = process.env.E2E_BASE_URL || 'http://192.168.15.30:4175';
const API = process.env.E2E_API_URL || 'http://192.168.15.30:4001/api';
const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'edmilson@exemplo.com', password: 'troque123' }) });
const session = await r.json();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
await ctx.addInitScript((s) => { localStorage.setItem('token', s.token); localStorage.setItem('patientId', s.patientId); localStorage.setItem('selPatientId', s.patientId); localStorage.setItem('user', JSON.stringify(s.user)); localStorage.setItem('onboarded', '1'); localStorage.setItem('dxGoals', '[]'); sessionStorage.setItem('coldDialogWinner', 'perf'); sessionStorage.setItem('engagementSlot', 'survey'); }, session);
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
await page.getByText(/Ver análise completa/).first().waitFor({ timeout: 90000 });
await page.waitForTimeout(2500);

const dom = await page.evaluate(() => {
  const all = document.querySelectorAll('*');
  let blur = 0, shadowAnim = 0, fixed = 0;
  for (const el of all) { const cs = getComputedStyle(el); if (cs.backdropFilter && cs.backdropFilter !== 'none') blur++; if (cs.position === 'fixed' || cs.position === 'sticky') fixed++; }
  for (const a of document.getAnimations()) { try { const kf = a.effect.getKeyframes(); if (kf.some((k) => 'boxShadow' in k || 'filter' in k || 'background' in k)) shadowAnim++; } catch {} }
  let cacheKb = 0; try { cacheKb = Math.round((localStorage.getItem('__meus_exames_api_cache') || '').length / 1024); } catch {}
  return { nodes: all.length, blur, fixed, animations: document.getAnimations().length, paintAnimations: shadowAnim, cacheKb, styleSheets: document.styleSheets.length, cssRules: Array.from(document.styleSheets).reduce((n, s) => { try { return n + s.cssRules.length; } catch { return n; } }, 0) };
});
console.log('DOM no dashboard:', JSON.stringify(dom));

async function profile(label, action, waitFor) {
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
  await cdp.send('Profiler.start');
  const t0 = Date.now();
  await action();
  const deadline = t0 + 15000;
  while (Date.now() < deadline) { if (await page.evaluate(waitFor).catch(() => false)) break; await page.waitForTimeout(16); }
  await page.waitForTimeout(600);
  const { profile } = await cdp.send('Profiler.stop');
  await cdp.send('Profiler.disable');
  // agrega self-time por função+arquivo (cdp: samples + timeDeltas)
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  let total = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const n = byId.get(profile.samples[i]); const dt = (profile.timeDeltas[i] || 0) / 1000; total += dt;
    const cf = n.callFrame; const key = `${cf.functionName || '(anon)'} @ ${(cf.url || '').split('/').pop().split('?')[0] || '(native)'}`;
    self.set(key, (self.get(key) || 0) + dt);
  }
  const top = Array.from(self.entries()).sort((a, b) => b[1] - a[1]).slice(0, 14);
  const byFile = new Map();
  for (const [k, v] of self.entries()) { const f = k.split(' @ ')[1]; byFile.set(f, (byFile.get(f) || 0) + v); }
  const files = Array.from(byFile.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  console.log(`\n== ${label}: ${Math.round(Date.now() - t0)} ms até pronto · CPU amostrada ${Math.round(total)} ms ==`);
  console.log('  por arquivo:', files.map(([f, v]) => `${f} ${Math.round(v)}ms`).join(' · '));
  for (const [k, v] of top) console.log(`  ${String(Math.round(v)).padStart(5)} ms  ${k}`);
}

await profile('bottom-nav Exames', () => page.getByRole('button', { name: /Exames/ }).last().click(), () => location.hash.startsWith('#/exams') && document.body.innerText.length > 1500);
await profile('bottom-nav Início', () => page.getByRole('button', { name: /Início/ }).last().click(), () => location.hash === '#/' && /Ver análise completa/.test(document.body.innerText));
await profile('menu Mais (drawer)', () => page.getByRole('button', { name: /Mais/ }).last().click(), () => !!document.querySelector('.MuiDrawer-modal .MuiDrawer-paper'));
await browser.close();
