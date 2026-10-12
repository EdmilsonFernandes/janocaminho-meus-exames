import { chromium } from '@playwright/test';
const BASE = 'http://localhost:5176';
const OUT = 'C:/tmp/sportscritique/shots';
const log = (...a) => console.log('[a7]', ...a);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on('response', async (r) => { if (r.url().includes('/sports/profile') && r.request().method() === 'GET') { try { const served = r.headers()['x-served-from'] || 'net'; const j = await r.json(); console.log('[a7] GET resp served=' + served + ' modality=' + (j.profile ? j.profile.modality : '?') + ' hc=' + ((j.profile || {}).collectionContext || {}).hormonalContext); } catch (e) {} } });
page.on('request', (r) => { if (r.method() === 'PUT' && r.url().includes('sports')) log('PUT!', (r.postData() || '').slice(0, 120)); });
await page.goto(BASE + '/landing#/entrar', { waitUntil: 'networkidle' });
const pw = page.getByRole('button', { name: /senha/i }).first();
if (await pw.count()) { await pw.click(); await page.waitForTimeout(400); }
await page.locator('input[type=email]').first().fill('edmilson@exemplo.com');
await page.locator('input[type=password]').first().fill('troque123');
await page.locator('button[type=submit]').first().click();
await page.waitForTimeout(4000);
for (let i = 0; i < 4; i++) { try { const dl = page.locator('[role=dialog]').last(); if (!(await dl.count())) break; const b = dl.getByRole('button', { name: /Pular|Agora n/i }).first(); if (await b.count()) await b.click({ timeout: 2000 }).catch(() => {}); await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(600); } catch (e) { break; } }
const pid = await page.evaluate(async () => {
  let t = ''; for (const [k, v] of Object.entries(localStorage)) if (/token/i.test(k)) { t = v.replace(/"/g, ''); break; }
  const r = await fetch('http://localhost:4003/api/patients?_start=0&_end=5', { headers: { Authorization: 'Bearer ' + t } });
  return (await r.json())[0].id;
});
await page.evaluate((p) => { try { localStorage.setItem('RaStore.sportsMode.' + p, 'true'); } catch (e) {} }, pid);
// PHASE: hormonal Nenhum → ENDURANCE
await page.goto(BASE + '/landing#/perfil', { waitUntil: 'networkidle' });
await page.waitForTimeout(2400);
const noneChip = page.locator('button[aria-pressed]').filter({ hasText: 'Nenhum' }).first();
await noneChip.click({ timeout: 3000 }).catch((e) => log('nenhum fail'));
await page.waitForTimeout(400);
const dis = await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find((x) => /Salvar perfil esportivo/.test(x.textContent)); return b ? b.disabled : 'NO'; });
log('save disabled after Nenhum:', dis);
await page.getByRole('button', { name: 'Salvar perfil esportivo' }).first().click({ timeout: 5000 }).catch((e) => log('save fail', String(e).slice(0, 80)));
await page.waitForTimeout(2200);
log('snack:', JSON.stringify(await page.locator('.MuiSnackbar-root').allTextContents()));
await page.goto(BASE + '/landing#/', { waitUntil: 'networkidle' }); await page.waitForTimeout(4200);
const pers = await page.locator('text=Modo Esporte').first().evaluate((e) => { const c = e.closest('.MuiCard-root'); return c ? c.innerText.slice(0, 280) : 'NO'; });
log('persona ENDURANCE:', pers.replace(/\n/g, ' | '));
const order = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map((b) => b.textContent.trim()).filter((t) => /\(\d+\)/.test(t)));
log('domain order ENDURANCE:', JSON.stringify(order));
const tiles = await page.locator('[aria-label*="— ver"]').allTextContents();
log('tiles ENDURANCE:', JSON.stringify(tiles));
const f3 = await page.locator('[aria-label*="Ver tendência"]').evaluateAll((els) => els.slice(0, 4).map((e) => e.getAttribute('aria-label').slice(0, 42)));
log('first cards:', JSON.stringify(f3));
await page.screenshot({ path: OUT + '/b3-dash-endurance.png', fullPage: true });
// restore musculação+trt
await page.goto(BASE + '/landing#/perfil', { waitUntil: 'networkidle' }); await page.waitForTimeout(2200);
await page.locator('button[aria-pressed]').filter({ hasText: 'Musculação/Hipertrofia' }).first().click({ timeout: 3000 }).catch(() => log('mus fail'));
await page.locator('button[aria-pressed]').filter({ hasText: 'Reposição com prescrição' }).first().click({ timeout: 3000 }).catch(() => log('trt fail'));
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Salvar perfil esportivo' }).first().click({ timeout: 5000 }).catch((e) => log('restore save fail'));
await page.waitForTimeout(1500);
const srv = await page.evaluate(async () => {
  let t = ''; for (const [k, v] of Object.entries(localStorage)) if (/token/i.test(k)) { t = v.replace(/"/g, ''); break; }
  const r = await fetch('http://localhost:4003/api/sports/profile?b=' + Date.now(), { headers: { Authorization: 'Bearer ' + t } });
  const j = await r.json();
  return j.profile.modality + ' / ' + (j.profile.collectionContext || {}).hormonalContext;
});
log('server final:', srv);
await browser.close();
