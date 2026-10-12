import { chromium } from '@playwright/test';
const BASE = 'http://localhost:5176';
const log = (...a) => console.log('[a4]', ...a);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const puts = [];
page.on('request', (r) => { if (r.method() === 'PUT' && r.url().includes('sports')) puts.push({ t: Date.now(), body: r.postData()?.slice(0, 200) }); });
const gets = [];
page.on('response', async (r) => { if (r.url().includes('/sports/profile') && r.request().method() === 'GET') { try { gets.push({ status: r.status(), modality: (await r.json())?.profile?.modality }); } catch (e) {} } });
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
await page.evaluate((p) => { try { localStorage.setItem('RaStore.sportsMode.' + p, 'true'); } catch (e) {} }, pid);
await page.goto(BASE + '/landing#/perfil', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.getByRole('button', { name: 'Corrida/Ciclismo' }).first().click({ timeout: 3000 });
await page.waitForTimeout(200);
await page.getByRole('button', { name: /Salvar perfil/i }).first().click({ timeout: 3000 });
await page.waitForTimeout(2000);
log('PUTs captured:', JSON.stringify(puts));
// server truth NOW (bypass app)
const serverNow = await page.evaluate(async () => {
  let t = ''; for (const [k, v] of Object.entries(localStorage)) if (/token/i.test(k)) { t = v.replace(/"/g, ''); break; }
  const r = await fetch('http://localhost:4003/api/sports/profile?bust=' + Date.now(), { headers: { Authorization: 'Bearer ' + t } });
  return (await r.json()).profile.modality;
});
log('SERVER modality after wizard save:', serverNow);
await page.goto(BASE + '/landing#/', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
log('GETs seen by dashboard:', JSON.stringify(gets.slice(-3)));
const pers = await page.locator('text=Modo Esporte').first().evaluate((e) => { const c = e.closest('.MuiCard-root'); return c ? c.innerText.slice(0, 160) : 'NO'; });
log('persona now:', pers.replace(/\n/g, ' | '));
// restore
await page.goto(BASE + '/landing#/perfil', { waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
await page.getByRole('button', { name: 'Musculação/Hipertrofia' }).first().click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: /Salvar perfil/i }).first().click();
await page.waitForTimeout(1200);
await browser.close();
