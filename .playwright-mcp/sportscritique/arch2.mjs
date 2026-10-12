import { chromium } from '@playwright/test';
const BASE = 'http://localhost:5176';
const OUT = 'C:/tmp/sportscritique/shots';
const log = (...a) => console.log('[a2]', ...a);
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

// PERFIL: find switch inside the box containing 'Saúde Esportiva'
await page.goto(BASE + '/landing#/perfil', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const switchState = await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll('*')).find((e) => e.children.length === 0 && /Saúde Esportiva/.test(e.textContent || ''));
  if (!el) return 'TXT NOT FOUND';
  let box = el; for (let i = 0; i < 6 && box; i++) { if (box.querySelector('[role=switch]')) break; box = box.parentElement; }
  const sw = box && box.querySelector('[role=switch]');
  if (!sw) return 'NO SWITCH';
  return { checked: sw.getAttribute('aria-checked'), visible: sw.getBoundingClientRect().height > 0, boxH: Math.round(box.getBoundingClientRect().height) };
});
log('sports switch state (fresh storage):', JSON.stringify(switchState));
// click it via coordinates of the found switch
const clicked = await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll('*')).find((e) => e.children.length === 0 && /Saúde Esportiva/.test(e.textContent || ''));
  let box = el; for (let i = 0; i < 6 && box; i++) { if (box.querySelector('[role=switch]')) break; box = box.parentElement; }
  const sw = box && box.querySelector('[role=switch]');
  if (!sw) return false;
  sw.scrollIntoView({ block: 'center' });
  sw.click();
  return true;
});
log('switch clicked:', clicked);
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT + '/a3-perfil-switch-on.png', fullPage: false });
// wizard now visible? count clicks to fully configure
const chipSport = page.getByRole('button', { name: 'Corrida/Ciclismo' }).first();
log('wizard chip Corrida visible:', await chipSport.count());
if (await chipSport.count()) {
  await chipSport.click({ timeout: 3000 });
  await page.getByRole('button', { name: /Amador competitivo/i }).first().click({ timeout: 3000 }).catch(() => log('level fail'));
  await page.getByRole('button', { name: /Reposição com prescrição/i }).first().click({ timeout: 3000 }).catch(() => log('hormonal fail'));
  await page.screenshot({ path: OUT + '/a4-wizard-filled.png', fullPage: false });
  await page.getByRole('button', { name: /Salvar perfil/i }).first().click({ timeout: 3000 });
  await page.waitForTimeout(1800);
  log('saved corrida via wizard');
}
// dashboard reorg
await page.goto(BASE + '/landing#/', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
const pers = await page.locator('text=Modo Esporte').first().evaluate((e) => { const c = e.closest('.MuiCard-root'); return c ? c.innerText.slice(0, 300) : 'NO'; });
log('persona CORRIDA (wizard):', pers.replace(/\n/g, ' | '));
const order = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map((b) => b.textContent.trim()).filter((t) => /\(\d+\)/.test(t)));
log('domain order CORRIDA:', JSON.stringify(order));
const tiles = await page.locator('[aria-label*="— ver"]').allTextContents();
log('tiles CORRIDA:', JSON.stringify(tiles));
await page.screenshot({ path: OUT + '/a5-dash-corrida-reorg.png', fullPage: true });
// restore musculação via wizard
await page.goto(BASE + '/landing#/perfil', { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
const cm = page.getByRole('button', { name: 'Musculação/Hipertrofia' }).first();
if (await cm.count()) { await cm.click(); await page.waitForTimeout(300); await page.getByRole('button', { name: /Salvar perfil/i }).first().click(); await page.waitForTimeout(1400); log('restored'); }
await browser.close();
