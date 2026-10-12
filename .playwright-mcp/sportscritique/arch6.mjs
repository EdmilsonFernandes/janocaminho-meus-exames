import { chromium } from '@playwright/test';
const BASE = 'http://localhost:5176';
const OUT = 'C:/tmp/sportscritique/shots';
const log = (...a) => console.log('[a6]', ...a);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
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
const wizardState = () => page.evaluate(() => {
  const chips = Array.from(document.querySelectorAll('button[aria-pressed]')).filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent.trim());
  const sv = Array.from(document.querySelectorAll('button')).filter((b) => /Salvar perfil esportivo/.test(b.textContent));
  return { active: chips, saves: sv.map((b) => ({ disabled: b.disabled, w: Math.round(b.getBoundingClientRect().width) })) };
});
async function trySave(tag) {
  await page.goto(BASE + '/landing#/perfil', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2400);
  log(tag, 'state:', JSON.stringify(await wizardState()));
  const sv = page.getByRole('button', { name: 'Salvar perfil esportivo' }).first();
  log(tag, 'save count:', await page.getByRole('button', { name: 'Salvar perfil esportivo' }).count());
  try { await sv.click({ timeout: 4000 }); log(tag, 'save clicked'); } catch (e) { log(tag, 'SAVE FAIL:', String(e).split(String.fromCharCode(10))[0].slice(0, 90)); }
  await page.waitForTimeout(2000);
  log(tag, 'snack:', JSON.stringify(await page.locator('.MuiSnackbar-root').allTextContents()));
}
// PHASE 1: set corrida
await page.goto(BASE + '/landing#/perfil', { waitUntil: 'networkidle' });
await page.waitForTimeout(2400);
log('ph1 state:', JSON.stringify(await wizardState()));
const chipRun = page.locator('button[aria-pressed]').filter({ hasText: 'Corrida/Ciclismo' }).first();
log('ph1 chipRun count:', await page.locator('button[aria-pressed]').filter({ hasText: 'Corrida/Ciclismo' }).count());
await chipRun.click({ timeout: 3000 }).catch((e) => log('ph1 chip fail', String(e).slice(0, 60)));
await page.waitForTimeout(400);
log('ph1 after click:', JSON.stringify(await wizardState()));
await trySave('ph1');
// dashboard
await page.goto(BASE + '/landing#/', { waitUntil: 'networkidle' }); await page.waitForTimeout(4200);
const pers = await page.locator('text=Modo Esporte').first().evaluate((e) => { const c = e.closest('.MuiCard-root'); return c ? c.innerText.slice(0, 260) : 'NO'; });
log('persona after corrida:', pers.replace(/\n/g, ' | '));
const order = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map((b) => b.textContent.trim()).filter((t) => /\(\d+\)/.test(t)));
log('domain order:', JSON.stringify(order));
const tiles = await page.locator('[aria-label*="— ver"]').allTextContents();
log('tiles:', JSON.stringify(tiles));
await page.screenshot({ path: OUT + '/b1-dash-corrida-reorg.png', fullPage: true });
await browser.close();
