import { chromium } from '@playwright/test';
const BASE = 'http://localhost:5176';
const OUT = 'C:/tmp/sportscritique/shots';
const log = (...a) => console.log('[f2]', ...a);
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
// close onboarding dialog via Pular
for (let i = 0; i < 4; i++) {
  try {
    const dl = page.locator("[role=dialog]").last();
    if (!(await dl.count())) break;
    const txt = String((await dl.innerText({ timeout: 2000 }).catch(() => "")).slice(0, 80)).split(String.fromCharCode(10)).join(" ");
    log("dialog", i, ":", txt);
    const b = dl.getByRole("button", { name: /Pular|Agora n~ao|Depois|Fechar|Entendi/i }).first();
    if (await b.count()) { await b.click({ timeout: 2500 }).catch(() => {}); }
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(700);
  } catch (e) { break; }
}
if (await page.locator('[role=dialog]').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(500); log('dialog esc'); }

// ── PERFIL: declare substance ──
await page.goto(BASE + '/landing#/perfil', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
if (await page.locator('[role=dialog]').count()) { const s2 = page.getByRole('button', { name: /Pular/i }).first(); if (await s2.count()) await s2.click(); await page.waitForTimeout(600); }
await page.screenshot({ path: OUT + '/p1-perfil-top.png', fullPage: false });
const sportsCardTxt = await page.getByText('Saúde Esportiva').first().count();
log('sports card on perfil:', sportsCardTxt);
const subsBtn = page.getByRole('button', { name: /Declarar subst/i }).first();
log('subsBtn:', await subsBtn.count());
if (await subsBtn.count()) {
  await subsBtn.click(); await page.waitForTimeout(500);
  const combo = page.locator('[role=combobox]').first();
  await combo.fill('Testosterona (enantato)');
  await page.waitForTimeout(900);
  const opts = await page.locator('[role=option]').allTextContents();
  log('catalog options:', JSON.stringify(opts.slice(0, 5)));
  if (opts.length) await page.locator('[role=option]').first().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/p2-substance-form.png' });
  await page.getByRole('button', { name: /^Declarar$/ }).first().click();
  await page.waitForTimeout(1500);
  const chipsNow = await page.locator('.MuiChip-label').allTextContents();
  log('declared after save:', JSON.stringify(chipsNow.filter((c) => c.includes('['))));
  await page.screenshot({ path: OUT + '/p3-substance-declared.png', fullPage: false });
}

// ── DASH with substance: substances card + prep + banner ──
await page.goto(BASE + '/landing#/', { waitUntil: 'networkidle' });
await page.waitForSelector('text=Modo Esporte', { timeout: 15000 });
await page.waitForTimeout(3500);
const cardsTxt = await page.locator('.MuiCard-root').allTextContents();
const subsCard = cardsTxt.find((t) => t.includes('Substâncias declaradas'));
log('SUBSTANCES:', subsCard ? subsCard.slice(0, 600).replace(/\n/g, ' | ') : 'NOT FOUND');
const prepCard = cardsTxt.find((t) => t.includes('Perguntas'));
log('PREP:', prepCard ? prepCard.slice(0, 800).replace(/\n/g, ' | ') : 'NOT FOUND');
const bn = cardsTxt.find((t) => t.includes('📚'));
log('BANNER CARD:', bn ? bn.slice(0, 500).replace(/\n/g, ' | ') : 'no 📚 in cards');
// substances card element shot
await page.getByText('Substâncias declaradas').first().evaluate((e) => { const c = e.closest('.MuiCard-root'); if (c) c.setAttribute('data-s', '1'); });
await page.locator('[data-s="1"]').first().screenshot({ path: OUT + '/p4-substances-card.png' }).catch(() => log('p4 fail'));
await page.getByText('Perguntas').first().evaluate((e) => { const c = e.closest('.MuiCard-root'); if (c) c.setAttribute('data-q', '1'); });
await page.locator('[data-q="1"]').first().screenshot({ path: OUT + '/p5-prep-card.png' }).catch(() => log('p5 fail'));

// marker card click (no dialog now)
log('dialogs:', await page.locator('[role=dialog]').count());
await page.locator('[aria-label*="Ver tendência"]').first().click({ timeout: 5000 }).then(() => log('card CLICKED')).catch((e) => log('card fail', String(e).slice(0, 80)));
await page.waitForTimeout(1500);
log('url after card:', page.url());
await page.screenshot({ path: OUT + '/p6-after-card-click.png', fullPage: false });
await page.goto(BASE + '/landing#/', { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);

// chip Hormonal (0) → empty state
const chipH = page.getByRole('button', { name: /Hormonal/ }).first();
if (await chipH.count()) {
  await chipH.click({ timeout: 4000 }); await page.waitForTimeout(800);
  const empty = await page.locator('.MuiCard-root').allTextContents();
  const em = empty.find((t) => t.includes('Nenhum marcador'));
  log('EMPTY STATE:', em ? em.slice(0, 300).replace(/\n/g, ' | ') : 'none');
  await page.screenshot({ path: OUT + '/p7-hormonal-empty.png', fullPage: false });
  await page.getByRole('button', { name: /Todos/ }).first().click().catch(() => {});
  await page.waitForTimeout(500);
}

// ── switch archetype: corrida ──
await page.goto(BASE + '/landing#/perfil', { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
const chipRun = page.getByRole('button', { name: 'Corrida/Ciclismo' }).first();
log('chipRun:', await chipRun.count());
if (await chipRun.count()) {
  await chipRun.click({ timeout: 4000 }); await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Salvar perfil/i }).first().click({ timeout: 4000 }); await page.waitForTimeout(1600);
  log('archetype saved corrida');
}
await page.goto(BASE + '/landing#/', { waitUntil: 'networkidle' });
await page.waitForSelector('text=Modo Esporte', { timeout: 15000 });
await page.waitForTimeout(3500);
const chips2 = await page.locator('.MuiChip-root').allTextContents();
log('chips CORRIDA:', JSON.stringify(chips2.slice(0, 20)));
const tiles2 = await page.locator('[aria-label*="— ver"]').allTextContents();
log('tiles CORRIDA:', JSON.stringify(tiles2));
const persona2 = await page.locator('text=Modo Esporte').first().evaluate((e) => { const c = e.closest('.MuiCard-root'); return c ? c.innerText.slice(0, 400) : 'NO'; });
log('PERSONA CORRIDA:', persona2.replace(/\n/g, ' | '));
await page.locator('text=Modo Esporte').first().evaluate((e) => { const c = e.closest('.MuiCard-root'); if (c) c.setAttribute('data-p2', '1'); });
await page.locator('[data-p2="1"]').screenshot({ path: OUT + '/p8-persona-corrida.png' }).catch(() => {});
await page.screenshot({ path: OUT + '/p9-dash-corrida-light.png', fullPage: true });

// restore musculação
await page.goto(BASE + '/landing#/perfil', { waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
const chipMus = page.getByRole('button', { name: 'Musculação/Hipertrofia' }).first();
if (await chipMus.count()) { await chipMus.click(); await page.waitForTimeout(300); await page.getByRole('button', { name: /Salvar perfil/i }).first().click(); await page.waitForTimeout(1200); log('restored musculação'); }
await browser.close();
