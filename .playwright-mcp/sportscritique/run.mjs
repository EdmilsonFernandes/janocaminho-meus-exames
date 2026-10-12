import { chromium } from '@playwright/test';
import fs from 'node:fs';
const BASE = 'http://localhost:5176';
const OUT = '/tmp/sportscritique/shots';
const shot = (p, n) => p.screenshot({ path: OUT + '/' + n + '.png', fullPage: true });
const log = (...a) => console.log('[crit]', ...a);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

await page.goto(BASE + '/landing#/entrar', { waitUntil: 'networkidle' });
const pwdGate = page.getByRole('button', { name: /senha/i }).first();
if (await pwdGate.count()) { await pwdGate.click(); await page.waitForTimeout(400); }
await page.locator('input[type=email]').first().fill('edmilson@exemplo.com');
await page.locator('input[type=password]').first().fill('troque123');
await shot(page, '01-login-1280');
await page.locator('button[type=submit]').first().click();
await page.waitForTimeout(4000);
await page.keyboard.press('Escape').catch(()=>{});
await page.waitForTimeout(800);
await page.keyboard.press('Escape').catch(()=>{});
await shot(page, '01b-after-login');
log('url after login:', page.url());

let isSports = await page.getByText('Modo Esporte').count() > 0;
log('sports on dash?', isSports);
if (!isSports) {
  await page.goto(BASE + '/landing#/perfil', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const swAny = page.locator('[role=switch]').first();
  if (await swAny.count()) { try { await swAny.click({ timeout: 5000 }); } catch(e){ log('switch fail', e.message.slice(0,80)); await page.keyboard.press('Escape'); await swAny.click({ timeout: 5000 }).catch(()=>{}); } await page.waitForTimeout(1200); }
  await shot(page, '02-perfil-sports-on');
}
await page.goto(BASE + '/landing#/', { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
isSports = await page.getByText('Modo Esporte').count() > 0;
log('sports after toggle:', isSports);
await shot(page, '03-dash-1280-light');

const ctxBtn = page.getByText(/📚/).first();
if (await ctxBtn.count()) {
  await ctxBtn.click().catch(() => {});
  await page.waitForTimeout(600);
  await shot(page, '04-dash-banner-expanded');
}
const chipH = page.getByRole('button', { name: /Hormonal \(/ }).first();
if (await chipH.count()) {
  try { await chipH.click({ timeout: 4000 }); } catch(e){ log('chipH fail'); } await page.waitForTimeout(700);
  await shot(page, '05-dash-domain-hormonal');
  await page.getByRole('button', { name: /Todos \(/ }).first().click();
  await page.waitForTimeout(400);
}
const card = page.locator('[aria-label*="Ver tendência"]').first();
if (await card.count()) {
  log('marker card:', await card.getAttribute('aria-label'));
  try { await card.click({ timeout: 4000 }); } catch(e){ log('card fail'); } await page.waitForTimeout(1800);
  log('nav to', page.url());
  await shot(page, '06-tendencias-from-card');
  await page.goBack(); await page.waitForTimeout(1500);
}
await page.evaluate(() => { try { localStorage.setItem('RaStore.theme', '"dark"'); } catch (e) {} });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(3500);
await shot(page, '07-dash-1280-dark');

await page.goto(BASE + '/landing#/perfil', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await shot(page, '08-perfil-wizard-1280-dark');
const subsBtn = page.getByRole('button', { name: /Declarar subst/i }).first();
if (await subsBtn.count()) {
  await page.keyboard.press('Escape').catch(()=>{});
  try { await subsBtn.click({ timeout: 4000 }); } catch(e){ log('subsBtn fail'); } await page.waitForTimeout(500);
  await page.getByLabel(/Subst/i).first().fill('Testosterona (enantato)');
  await page.waitForTimeout(900);
  const opt = page.locator('[role=option]').first();
  if (await opt.count()) { log('option:', await opt.textContent()); await opt.click(); }
  await shot(page, '09-substance-form');
  const decl = page.getByRole('button', { name: /^Declarar$/ }).first();
  if (await decl.count()) { await decl.click(); await page.waitForTimeout(1500); }
  await shot(page, '10-substance-declared');
}
const chipRun = page.getByRole('button', { name: 'Corrida/Ciclismo' }).first();
if (await chipRun.count()) {
  try { await chipRun.click({ timeout: 4000 }); } catch(e){ log('chipRun fail'); } await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Salvar perfil/i }).first().click();
  await page.waitForTimeout(1500);
  await shot(page, '11-perfil-archetype-corrida');
}
await page.goto(BASE + '/landing#/', { waitUntil: 'networkidle' }); await page.waitForTimeout(3500);
await shot(page, '12-dash-1280-dark-corrida');
await page.evaluate(() => { try { localStorage.setItem('RaStore.theme', '"light"'); } catch (e) {} });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(3000);

for (const cfg of [[390, 844, '13-dash-390-light', false], [390, 844, '14-dash-390-dark', true], [320, 700, '15-dash-320-light', false]]) {
  const p2 = await ctx.newPage();
  await p2.setViewportSize({ width: cfg[0], height: cfg[1] });
  if (cfg[3]) await p2.addInitScript(() => { try { localStorage.setItem('RaStore.theme', '"dark"'); } catch (e) {} });
  await p2.goto(BASE + '/landing#/', { waitUntil: 'networkidle' });
  await p2.waitForTimeout(3500);
  await p2.screenshot({ path: OUT + '/' + cfg[2] + '.png', fullPage: true });
  await p2.close();
}
const p3 = await ctx.newPage(); await p3.setViewportSize({ width: 390, height: 844 });
await p3.goto(BASE + '/landing#/', { waitUntil: 'networkidle' }); await p3.waitForTimeout(3500);
const persona = p3.locator('text=Modo Esporte').locator('xpath=ancestor::*[contains(@class, "MuiCard-root")]').first();
if (await persona.count()) { try { await persona.screenshot({ path: OUT + '/16-persona-390-light.png' }); } catch (e) { log('persona shot fail', e.message); } }
await p3.evaluate(() => { try { localStorage.setItem('RaStore.theme', '"dark"'); } catch (e) {} });
await p3.reload({ waitUntil: 'networkidle' }); await p3.waitForTimeout(2500);
const personaD = p3.locator('text=Modo Esporte').locator('xpath=ancestor::*[contains(@class, "MuiCard-root")]').first();
if (await personaD.count()) { try { await personaD.screenshot({ path: OUT + '/17-persona-390-dark.png' }); } catch (e) {} }
await p3.close();

await page.goto(BASE + '/landing#/perfil', { waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
const chipMus = page.getByRole('button', { name: 'Musculação/Hipertrofia' }).first();
if (await chipMus.count()) {
  await chipMus.click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Salvar perfil/i }).first().click();
  await page.waitForTimeout(1200);
}
fs.writeFileSync('/tmp/sportscritique/errors.json', JSON.stringify(errors.slice(0, 30), null, 1));
log('console errors:', errors.length);
await browser.close();
