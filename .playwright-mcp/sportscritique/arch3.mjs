import { chromium } from '@playwright/test';
const BASE = 'http://localhost:5176';
const API = 'http://localhost:4003/api';
const OUT = 'C:/tmp/sportscritique/shots';
const log = (...a) => console.log('[a3]', ...a);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
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
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0].id : 'PID?';
});
log('pid:', pid);
await page.evaluate((p) => { try { localStorage.setItem('RaStore.sportsMode.' + p, 'true'); } catch (e) {} }, pid);
await page.goto(BASE + '/landing#/perfil', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const chipRun = page.getByRole('button', { name: 'Corrida/Ciclismo' }).first();
log('wizard visible via localStorage:', await chipRun.count());
if (await chipRun.count()) {
  const wizardH = await page.evaluate(() => { const el = Array.from(document.querySelectorAll('p')).find((p) => /Seu esporte/.test(p.textContent || '')); let b = el; while (b && b.getBoundingClientRect().height < 40) b = b.parentElement; return b ? Math.round(b.getBoundingClientRect().height) : 0; });
  log('wizard visible block h:', wizardH);
  await chipRun.click({ timeout: 3000 });
  await page.getByRole('button', { name: /Reposição com prescri/i }).first().click({ timeout: 3000 }).catch(() => log('horm fail'));
  await page.getByRole('button', { name: /Salvar perfil/i }).first().click({ timeout: 3000 });
  await page.waitForTimeout(1800);
  log('saved CORRIDA via wizard');
  await page.screenshot({ path: OUT + '/a6-wizard-corrida-saved.png', fullPage: false });
}
await page.goto(BASE + '/landing#/', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
const pers = await page.locator('text=Modo Esporte').first().evaluate((e) => { const c = e.closest('.MuiCard-root'); return c ? c.innerText.slice(0, 320) : 'NO'; });
log('persona CORRIDA:', pers.replace(/\n/g, ' | '));
const order = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map((b) => b.textContent.trim()).filter((t) => /\(\d+\)/.test(t)));
log('domain order CORRIDA:', JSON.stringify(order));
const tiles = await page.locator('[aria-label*="— ver"]').allTextContents();
log('tiles CORRIDA:', JSON.stringify(tiles));
const first3 = await page.locator('[aria-label*="Ver tendência"]').evaluateAll((els) => els.slice(0, 3).map((e) => e.getAttribute('aria-label').slice(0, 45)));
log('first 3 cards CORRIDA:', JSON.stringify(first3));
await page.screenshot({ path: OUT + '/a7-dash-corrida-reorg.png', fullPage: true });
// restore
await page.goto(BASE + '/landing#/perfil', { waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
const cm = page.getByRole('button', { name: 'Musculação/Hipertrofia' }).first();
if (await cm.count()) { await cm.click(); await page.waitForTimeout(300); await page.getByRole('button', { name: /Salvar perfil/i }).first().click(); await page.waitForTimeout(1200); log('restored musculação'); }
await browser.close();
