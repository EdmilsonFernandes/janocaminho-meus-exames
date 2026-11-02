/**
 * VALIDAÇÃO REAL · Android WebView × "Tamanho da fonte" do sistema (auditoria 02/11/26).
 *
 * Diferente do estresse por CSS (html.fontSize), aqui a escala é a CONFIGURAÇÃO DO
 * ANDROID (`settings put system font_scale`), que o WebView aplica via text-size-adjust
 * nativo. Requer: emulador/dispositivo com o APK debug apontando para o preview na LAN
 * (capacitor.config.ts server.url — temporário), adb no PATH ou ANDROID_SDK em LOCALAPPDATA.
 *
 *   npx tsx e2e/insight-sheet-android.mjs
 * Restaura font_scale=1.0 ao final (inclusive em erro).
 */
import { _android as android } from 'playwright';
import fs from 'node:fs';
import { sheetGeometry } from './fixtures/sheet-geometry.mjs';
import { BASE, LONG_METRIC, MANY_METRICS } from './fixtures/cross-insight.ts'; // rodar com: npx tsx e2e/insight-sheet-android.mjs

const BASE_URL = process.env.E2E_BASE_URL || 'http://192.168.15.30:4175';
const API = process.env.E2E_API_URL || 'http://192.168.15.30:4001/api';
const PKG = 'com.janocaminho.drexame';
const SCALES = (process.env.ANDROID_SCALES || '1.0,1.3,1.5,2.0').split(',').map(Number);
const SHEET = '[data-testid="cross-insight-sheet"]';
const OUT = 'e2e/screenshots';
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function login() {
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'edmilson@exemplo.com', password: 'troque123' }) });
  if (!r.ok) throw new Error(`login ${r.status}`);
  return r.json();
}

const [device] = await android.devices();
if (!device) { console.error('Nenhum dispositivo/emulador Android conectado.'); process.exit(2); }
log('device', device.model(), device.serial());
const session = await login();
const results = [];
try {
  for (const scale of SCALES) {
    await device.shell(`settings put system font_scale ${scale}`);
    await device.shell(`am force-stop ${PKG}`);
    await device.shell(`am start -n ${PKG}/${PKG}.MainActivity`);
    await new Promise((r) => setTimeout(r, 4000)); // splash + 1ª carga do WebView (Capacitor pode recriar a página)
    const webview = await device.webView({ pkg: PKG }, { timeout: 90_000 });
    let page = await webview.page();
    await page.waitForLoadState('load').catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));
    // semeia a sessão e abre /notificacoes (mesmo origin = preview na LAN)
    await page.evaluate((ctx) => {
      localStorage.setItem('token', ctx.token); localStorage.setItem('patientId', ctx.patientId); localStorage.setItem('selPatientId', ctx.patientId);
      localStorage.setItem('user', JSON.stringify(ctx.user)); localStorage.setItem('onboarded', '1'); localStorage.setItem('dxGoals', '[]'); localStorage.setItem('motdShown', 'x');
      Object.keys(localStorage).filter((k) => k.startsWith('whatsnew_vc_') || k.startsWith('dx_cross_insight_dismissed_')).forEach((k) => localStorage.removeItem(k));
      localStorage.setItem('whatsnew_vc_' + ((window.__BUILD_INFO__ && window.__BUILD_INFO__.versionCode) || '0'), '1');
      sessionStorage.setItem('coldDialogWinner', 'e2e'); sessionStorage.setItem('engagementSlot', 'survey');
    }, session);
    await page.goto(`${BASE_URL}/#/notificacoes`, { waitUntil: 'domcontentloaded' });
    await page.getByText(/Notificações/).first().waitFor({ timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    for (const [name, fx] of [['base', BASE], ['longMetric', LONG_METRIC], ['manyMetrics', MANY_METRICS]]) {
     try {
      if (page.isClosed()) { page = await webview.page(); await page.waitForLoadState('load').catch(() => {}); }
      await page.evaluate((f) => window.dispatchEvent(new CustomEvent('openCrossInsight', { detail: f })), fx);
      const sheet = page.locator(SHEET);
      await sheet.waitFor({ state: 'visible', timeout: 15_000 });
      await sheet.locator('[data-testid="metric-chip"]').nth(fx.metrics.length - 1).waitFor();
      await page.waitForTimeout(700); // transição do Drawer + layout com a escala do sistema
      const g = await page.evaluate(sheetGeometry, SHEET);
      const btn = sheet.locator('[data-testid="bottomsheet-primary-btn"]');
      await sheet.evaluate((el) => { el.scrollTop = el.scrollHeight; });
      const diag = await btn.evaluate((el) => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); const d = (x) => x ? x.tagName.toLowerCase() + (x.getAttribute('data-testid') ? '[' + x.getAttribute('data-testid') + ']' : '') + '.' + String(x.className).split(' ').slice(0, 2).join('.') : 'null'; const sheetEl = el.closest('[data-testid="cross-insight-sheet"]'); const sr = sheetEl ? sheetEl.getBoundingClientRect() : null; return { ok: r.top >= 0 && r.bottom <= window.innerHeight + 1 && (hit === el || el.contains(hit)), top: Math.round(r.top), bottom: Math.round(r.bottom), innerH: window.innerHeight, hit: d(hit), sheetTop: sr ? Math.round(sr.top) : null, sheetBottom: sr ? Math.round(sr.bottom) : null, transform: sheetEl ? getComputedStyle(sheetEl).transform : null }; });
      const btnOk = diag.ok;
      if (!btnOk) log('   diag:', JSON.stringify(diag));
      const tsa = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('-webkit-text-size-adjust'));
      const shot = `${OUT}/android-fontscale-${scale}-${name}.png`;
      await page.screenshot({ path: shot });
      results.push({ scale, fixture: name, ...g.stats, textSizeAdjust: tsa, primaryReachable: btnOk, issues: g.issues });
      log(`font_scale ${scale} · ${name}: vw ${g.stats.vw} h2 ${g.stats.h2px}px chip ${g.stats.chipPx}px issues ${g.issues.length} primary ${btnOk ? 'ok' : 'NÃO alcançável'}`);
      for (const i of g.issues) log('   -', i.kind, i.el, JSON.stringify(i.text), i.measure);
      await btn.click();
      await sheet.waitFor({ state: 'detached', timeout: 10_000 });
     } catch (e) {
      const msg = String(e && e.message ? e.message : e).split(/\r?\n/)[0];
      results.push({ scale, fixture: name, error: msg, issues: [], primaryReachable: false });
      log(`font_scale ${scale} · ${name}: ERRO ${msg}`);
     }
    }
    // (não fechar a página: fechar o alvo do WebView deixa o próximo device.webView() pendurado)
  }
} finally {
  await device.shell('settings put system font_scale 1.0');
  await device.shell(`am force-stop ${PKG}`).catch(() => {});
  await device.close();
}
fs.writeFileSync(`${OUT}/android-fontscale-results.json`, JSON.stringify(results, null, 2));
const bad = results.filter((r) => r.issues.length || !r.primaryReachable);
log(bad.length ? `FALHAS: ${bad.length}` : 'OK: nenhum corte/sobreposição e ação alcançável em todas as escalas');
process.exit(bad.length ? 1 : 0);
