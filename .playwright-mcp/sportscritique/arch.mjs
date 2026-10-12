import { chromium } from '@playwright/test';
const BASE = 'http://localhost:5176';
const API = 'http://localhost:4003/api';
const OUT = 'C:/tmp/sportscritique/shots';
const log = (...a) => console.log('[a]', ...a);
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
const tok = await page.evaluate(() => { const t = localStorage.getItem('ra.token') || localStorage.getItem('token'); if (t) return t.replace(/"/g, ''); for (const [k, v] of Object.entries(localStorage)) if (/token/i.test(k)) return v.replace(/"/g, ''); return ''; });
log('token found:', !!tok);
const H = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' };
async function profile() { const r = await page.evaluate(async (h) => (await (await fetch('http://localhost:4003/api/sports/profile', { headers: JSON.parse(h) }))).json(), JSON.stringify({ Authorization: H.Authorization })); return r; }
async function putProfile(body) { const r = await page.evaluate(async ({ b, h }) => (await fetch('http://localhost:4003/api/sports/profile', { method: 'PUT', headers: JSON.parse(h), body: JSON.stringify(b) })).status, { b: body, h: JSON.stringify(H) }); return r; }
// switch corrida
const cur = await profile();
const cc = (cur.profile && cur.profile.collectionContext) || {};
cc.hormonalContext = cc.hormonalContext || 'trt';
log('PUT corrida status:', await putProfile({ modality: 'Corrida/Ciclismo', collectionContext: cc }));
await page.goto(BASE + '/landing#/', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
const chipsC = await page.locator('.MuiChip-root').allTextContents();
log('chips CORRIDA:', JSON.stringify(chipsC.filter((c) => /\(\d/.test(c))));
const tilesC = await page.locator('[aria-label*="— ver"]').allTextContents();
log('tiles CORRIDA:', JSON.stringify(tilesC));
const persC = await page.locator('text=Modo Esporte').first().evaluate((e) => { const c = e.closest('.MuiCard-root'); return c ? c.innerText.slice(0, 350) : 'NO'; });
log('persona CORRIDA:', persC.replace(/\n/g, ' | '));
const orderC = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map((b) => b.textContent.trim()).filter((t) => /\(\d+\)/.test(t)));
log('domain order CORRIDA:', JSON.stringify(orderC));
await page.screenshot({ path: OUT + '/a1-dash-corrida-1280.png', fullPage: true });
// now endurance lens: hormonalContext nenhum + corrida
cc.hormonalContext = 'nenhum';
log('PUT corrida+nenhum status:', await putProfile({ modality: 'Corrida/Ciclismo', collectionContext: cc }));
await page.goto(BASE + '/landing#/', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
const chipsE = await page.locator('.MuiChip-root').allTextContents();
log('chips ENDURANCE:', JSON.stringify(chipsE.filter((c) => /\(\d/.test(c)).slice(0, 8)));
const tilesE = await page.locator('[aria-label*="— ver"]').allTextContents();
log('tiles ENDURANCE:', JSON.stringify(tilesE));
const persE = await page.locator('text=Modo Esporte').first().evaluate((e) => { const c = e.closest('.MuiCard-root'); return c ? c.innerText.slice(0, 250) : 'NO'; });
log('persona ENDURANCE:', persE.replace(/\n/g, ' | '));
await page.screenshot({ path: OUT + '/a2-dash-endurance-1280.png', fullPage: true });
// restore musculação + trt
cc.hormonalContext = 'trt';
log('PUT restore:', await putProfile({ modality: 'Musculação/Hipertrofia', collectionContext: cc }));
await browser.close();
