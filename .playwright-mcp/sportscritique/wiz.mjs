import { chromium } from '@playwright/test';
const BASE = 'http://localhost:5176';
const log = (...a) => console.log('[w]', ...a);
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
  return (await r.json())[0].id;
});
await page.evaluate((p) => { try { localStorage.setItem('RaStore.sportsMode.' + p, 'true'); } catch (e) {} }, pid);
await page.goto(BASE + '/landing#/perfil', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
log('dialogs on perfil:', await page.locator('[role=dialog]').count());
// wizard state before
const st1 = await page.evaluate(() => {
  const chips = Array.from(document.querySelectorAll('button[aria-pressed]')).map((b) => ({ t: b.textContent.trim().slice(0, 30), on: b.getAttribute('aria-pressed') === 'true' }));
  const save = Array.from(document.querySelectorAll('button')).find((b) => /Salvar perfil/.test(b.textContent));
  return { chips: chips.slice(0, 14), saveDisabled: save ? save.disabled : 'NO BTN' };
});
log('wizard BEFORE:', JSON.stringify(st1));
const chipRun = page.getByRole('button', { name: 'Corrida/Ciclismo' }).first();
await chipRun.click({ timeout: 3000, force: true });
await page.waitForTimeout(400);
const st2 = await page.evaluate(() => {
  const chips = Array.from(document.querySelectorAll('button[aria-pressed]')).map((b) => ({ t: b.textContent.trim().slice(0, 30), on: b.getAttribute('aria-pressed') === 'true' }));
  const save = Array.from(document.querySelectorAll('button')).find((b) => /Salvar perfil/.test(b.textContent));
  return { chips: chips.slice(0, 14), saveDisabled: save ? save.disabled : 'NO BTN' };
});
log('wizard AFTER chip click:', JSON.stringify(st2));
const snack = await page.locator('.MuiSnackbar-root').allTextContents();
log('snackbars:', JSON.stringify(snack));
log('Salvar buttons:', await page.getByRole('button', { name: /Salvar perfil/i }).count());
log('Seu esporte headings:', await page.getByText('1 · Seu esporte').count());
const sv = page.getByRole('button', { name: /Salvar perfil/i }).last();
await sv.click({ timeout: 3000 }).catch((e) => log('save click fail', String(e).slice(0, 80)));
await page.waitForTimeout(2200);
log('snackbar after save:', JSON.stringify(await page.locator('.MuiSnackbar-root').allTextContents()));
await browser.close();
