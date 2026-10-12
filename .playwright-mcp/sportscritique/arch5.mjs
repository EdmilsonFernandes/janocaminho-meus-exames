import { chromium } from '@playwright/test';
const BASE = 'http://localhost:5176';
const OUT = 'C:/tmp/sportscritique/shots';
const log = (...a) => console.log('[a5]', ...a);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
let putCount = 0;
page.on('request', (r) => { if (r.method() === 'PUT' && r.url().includes('sports')) { putCount++; log('PUT #' + putCount, (r.postData() || '').slice(0, 140)); } });
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
await page.goto(BASE + '/landing#/perfil', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.getByRole('button', { name: 'Corrida/Ciclismo', exact: true }).first().click({ timeout: 3000 });
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Salvar perfil esportivo', exact: true }).first().click({ timeout: 3000 });
await page.waitForTimeout(2200);
log('snackbar:', JSON.stringify(await page.locator('.MuiSnackbar-root').allTextContents()));
// dashboard reorg
await page.goto(BASE + '/landing#/', { waitUntil: 'networkidle' });
await page.waitForTimeout(4200);
const pers = await page.locator('text=Modo Esporte').first().evaluate((e) => { const c = e.closest('.MuiCard-root'); return c ? c.innerText.slice(0, 300) : 'NO'; });
log('persona CORRIDA:', pers.replace(/\n/g, ' | '));
const order = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map((b) => b.textContent.trim()).filter((t) => /\(\d+\)/.test(t)));
log('domain order CORRIDA:', JSON.stringify(order));
const tiles = await page.locator('[aria-label*="— ver"]').allTextContents();
log('tiles CORRIDA:', JSON.stringify(tiles));
const f3 = await page.locator('[aria-label*="Ver tendência"]').evaluateAll((els) => els.slice(0, 4).map((e) => e.getAttribute('aria-label').slice(0, 42)));
log('first cards CORRIDA:', JSON.stringify(f3));
await page.screenshot({ path: OUT + '/b1-dash-corrida-reorg.png', fullPage: true });
await page.locator('text=Modo Esporte').first().evaluate((e) => { const c = e.closest('.MuiCard-root'); if (c) c.setAttribute('data-p', '1'); });
await page.locator('[data-p="1"]').screenshot({ path: OUT + '/b2-persona-corrida.png' }).catch(() => {});
// ENDURANCE: corrida + hormonal nenhum
await page.goto(BASE + '/landing#/perfil', { waitUntil: 'networkidle' }); await page.waitForTimeout(2200);
await page.getByRole('button', { name: 'Nenhum', exact: true }).first().click({ timeout: 3000 });
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Salvar perfil esportivo', exact: true }).first().click({ timeout: 3000 });
await page.waitForTimeout(2000);
await page.goto(BASE + '/landing#/', { waitUntil: 'networkidle' }); await page.waitForTimeout(4200);
const pers2 = await page.locator('text=Modo Esporte').first().evaluate((e) => { const c = e.closest('.MuiCard-root'); return c ? c.innerText.slice(0, 260) : 'NO'; });
log('persona ENDURANCE:', pers2.replace(/\n/g, ' | '));
const order2 = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map((b) => b.textContent.trim()).filter((t) => /\(\d+\)/.test(t)));
log('domain order ENDURANCE:', JSON.stringify(order2));
const tiles2 = await page.locator('[aria-label*="— ver"]').allTextContents();
log('tiles ENDURANCE:', JSON.stringify(tiles2));
await page.screenshot({ path: OUT + '/b3-dash-endurance.png', fullPage: true });
// restore: musculação + trt
await page.goto(BASE + '/landing#/perfil', { waitUntil: 'networkidle' }); await page.waitForTimeout(2200);
await page.getByRole('button', { name: 'Musculação/Hipertrofia', exact: true }).first().click({ timeout: 3000 });
await page.getByRole('button', { name: 'Reposição com prescrição (TRT)' }).first().click({ timeout: 3000 });
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Salvar perfil esportivo', exact: true }).first().click({ timeout: 3000 });
await page.waitForTimeout(1500);
log('restored. total PUTs:', putCount);
await browser.close();
