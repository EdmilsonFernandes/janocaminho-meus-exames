import { chromium } from '@playwright/test';
const BASE = 'http://localhost:5176';
const OUT = 'C:/tmp/sportscritique/shots';
const log = (...a) => console.log('[probe]', ...a);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.goto(BASE + '/landing#/entrar', { waitUntil: 'networkidle' });
const pwdGate = page.getByRole('button', { name: /senha/i }).first();
if (await pwdGate.count()) { await pwdGate.click(); await page.waitForTimeout(400); }
await page.locator('input[type=email]').first().fill('edmilson@exemplo.com');
await page.locator('input[type=password]').first().fill('troque123');
await page.locator('button[type=submit]').first().click();
await page.waitForTimeout(4000);
await page.keyboard.press('Escape').catch(() => {});
await page.goto(BASE + '/landing#/', { waitUntil: 'networkidle' });
await page.waitForSelector('text=Modo Esporte', { timeout: 15000 });
await page.waitForTimeout(3000);
const dlg = page.locator('[role=dialog]').first();
if (await dlg.count()) { log('DIALOG OPEN:', (await dlg.textContent()).slice(0, 120)); await page.keyboard.press('Escape'); await page.waitForTimeout(500); }
const chips = await page.locator('.MuiChip-root').allTextContents();
log('chips:', JSON.stringify(chips.slice(0, 24)));
const tiles = await page.locator('[aria-label*="— ver"]').allTextContents();
log('stat tiles:', JSON.stringify(tiles));
const cards = await page.locator('[aria-label*="Ver tendência"]').evaluateAll((els) => els.slice(0, 10).map((e) => e.getAttribute('aria-label')));
log('marker cards:', JSON.stringify(cards));
const h2 = await page.evaluate(() => Array.from(document.querySelectorAll('h1,h2,h3')).map((e) => e.tagName + ':' + e.textContent.trim().slice(0, 60)));
log('headings:', JSON.stringify(h2.slice(0, 20)));
const personaTxt = await page.locator('text=Modo Esporte').first().evaluate((e) => { const c = e.closest('.MuiCard-root'); return c ? c.innerText.slice(0, 600) : 'NO CARD'; });
log('PERSONA:', personaTxt.replace(/\n/g, ' | '));
const banner = page.locator('[role=alert]').first();
if (await banner.count()) log('ALERT:', (await banner.innerText()).slice(0, 400).replace(/\n/g, ' | '));
const ovf = await page.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, iw: window.innerWidth }));
log('overflow 1280:', JSON.stringify(ovf));
const eshot = async (sel, name) => { const el = page.locator(sel).first(); if (await el.count()) { try { await el.screenshot({ path: OUT + '/' + name + '.png' }); log('shot', name); } catch (e) { log('shot fail', name); } } else log('no el', name); };
await eshot('text=Modo Esporte >> xpath=ancestor::*[contains(@class,"MuiCard-root")]', 'e1-persona-1280');
const mSel = '[aria-label*="Ver tendência"]';
await page.locator(mSel).nth(0).screenshot({ path: OUT + '/e2-marker1-1280.png' }).catch(() => log('m1 fail'));
await page.locator(mSel).nth(1).screenshot({ path: OUT + '/e3-marker2-1280.png' }).catch(() => log('m2 fail'));
await eshot('text=Linha do tempo >> xpath=ancestor::*[contains(@class,"MuiCard-root")]', 'e4-timeline');
await page.locator('[aria-label*="— ver"]').first().evaluate((e) => { let p = e.parentElement; while (p && getComputedStyle(p).display !== 'grid') p = p.parentElement; if (p) p.setAttribute('data-stats', '1'); });
await eshot('[data-stats="1"]', 'e7-stats-1280');
const bn = page.getByText(/📚/).first();
if (await bn.count()) {
  try { await bn.click({ timeout: 3000 }); await page.waitForTimeout(700);
    await page.getByText(/📚/).first().evaluate((e) => { const c = e.closest('.MuiCard-root'); if (c) c.setAttribute('data-bn', '1'); });
    await eshot('[data-bn="1"]', 'e8-banner-1280');
    log('BANNER:', (await page.locator('[data-bn="1"]').innerText()).slice(0, 700).replace(/\n/g, ' | '));
  } catch (e) { log('banner fail'); }
}
const chipH = page.getByRole('button', { name: /Hormonal/ }).first();
log('chip Hormonal count:', await page.getByRole('button', { name: /Hormonal/ }).count());
if (await chipH.count()) {
  await chipH.click({ timeout: 4000 }).then(() => log('chipH clicked')).catch(() => log('chipH fail'));
  await page.waitForTimeout(800);
  log('marker count after Hormonal filter:', await page.locator(mSel).count());
  await page.screenshot({ path: OUT + '/i1-filter-hormonal.png' });
  await page.getByRole('button', { name: /Todos/ }).first().click().catch(() => {});
}
await page.keyboard.press('Escape').catch(() => {});
log('dialogs open before card click:', await page.locator('[role=dialog]').count());
await page.locator(mSel).first().click({ timeout: 4000 }).then(() => log('card clicked')).catch((e) => log('card fail', String(e).slice(0, 90)));
await page.waitForTimeout(1500);
log('url after card click:', page.url());
await page.goto(BASE + '/landing#/perfil', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const wiz = page.getByText('Seu esporte').first();
if (await wiz.count()) {
  await wiz.evaluate((e) => { const c = e.closest('.MuiCard-root'); if (c) c.setAttribute('data-w', '1'); });
  await eshot('[data-w="1"]', 'e9-wizard-1280');
  log('WIZARD:', (await page.locator('[data-w="1"]').innerText()).slice(0, 900).replace(/\n/g, ' | '));
  log('wizard card height px:', await page.locator('[data-w="1"]').evaluate((e) => e.getBoundingClientRect().height));
}
log('substance form btn:', await page.getByRole('button', { name: /Declarar subst/i }).count());
const dc = await page.locator('.MuiChip-label').allTextContents();
log('declared chips:', JSON.stringify(dc.filter((c) => c.includes('['))));
const lastCards = await page.locator('.MuiCard-root').allTextContents();
const subst = lastCards.find((t) => t.includes('Substância'));
if (subst) log('SUBSTANCES CARD:', subst.slice(0, 500).replace(/\n/g, ' | '));
const p2 = await ctx.newPage(); await p2.setViewportSize({ width: 320, height: 700 });
await p2.goto(BASE + '/landing#/', { waitUntil: 'networkidle' }); await p2.waitForTimeout(3000);
log('overflow 320:', JSON.stringify(await p2.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, iw: window.innerWidth }))));
await p2.close();
await browser.close();
