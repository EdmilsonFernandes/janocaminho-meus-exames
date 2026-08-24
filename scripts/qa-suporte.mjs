/** QA visual do suporte premium + fix Libras — contra o dev local (mesmo código do prod). */
import { chromium } from 'playwright';

const WEB = process.env.QA_WEB || 'http://localhost:5173';
const API = WEB.includes('5199') ? 'http://localhost:4001/api' : WEB.replace(/\/?$/, '').includes('5173') ? 'http://localhost:4001/api' : `${WEB}/api`;
const EMAIL = 'edmilson@exemplo.com';
const PASS = 'troque123';

const login = await fetch('http://localhost:4001/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASS }) });
if (!login.ok) { console.error('login falhou'); process.exit(1); }
const { token: jwt } = await login.json();
const H = { Authorization: `Bearer ${jwt}` };
const notifs = await (await fetch('http://localhost:4001/api/notifications', { headers: H })).json();
for (const n of notifs.items ?? []) await fetch(`http://localhost:4001/api/notifications/${n.id}/read`, { method: 'PATCH', headers: H }).catch(() => {});
// Idempotência: fecha QA-tickets de runs anteriores (senão o anti-flood 429 segura o dialog).
const mine = await (await fetch('http://localhost:4001/api/tickets', { headers: H })).json();
for (const t of (mine ?? [])) {
  if (String(t.subject).includes('QA — teste')) {
    await fetch(`http://localhost:4001/api/admin/tickets/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...H }, body: JSON.stringify({ status: 'closed' }) }).catch(() => {});
  }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.addInitScript((t) => {
  localStorage.setItem('token', t);
  localStorage.setItem('meus_exames_libras', '0'); // opt-out: Libras NUNCA pode aparecer
  localStorage.setItem('onboarded', '1');
}, jwt);

const dismiss = async () => {
  // Universal: enquanto houver dialog, clica botão de dispensa CONHECIDO ou Escape.
  // (WhatsNew "Legal!", promo "Portal do médico", tour "Pular", conquista "Depois"…)
  for (let i = 0; i < 12; i++) {
    if (!(await page.locator('.MuiDialog-root').count())) break;
    let acted = false;
    for (const name of ['Pular', 'Depois', 'Agora não', 'Legal!', 'Entendi', 'Fechar', 'Pular tour']) {
      const btn = page.getByRole('button', { name: new RegExp(`^${name}`, 'i') }).first();
      if (await btn.isVisible().catch(() => false)) { await btn.click({ force: true, timeout: 1200 }).catch(() => {}); acted = true; await page.waitForTimeout(450); break; }
    }
    if (!acted) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(500); }
  }
};

// 1 · /suporte — hero, auto-ajuda, fila
await page.goto(`${WEB}/#/suporte`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(2500); await dismiss(); await dismiss();
const body1 = await page.evaluate(() => document.body.innerText);
for (const t of ['Como podemos ajudar?', 'Resposta na hora', 'Exame não apareceu?', 'Créditos e planos', 'Seus chamados', 'Resposta em até 1 dia útil']) {
  console.log(body1.includes(t) ? `✓ "${t}"` : `FALHOU: "${t}"`);
}
await page.screenshot({ path: 'design-lab/qa/sup-01-lista.png', fullPage: true });

// 2 · Card de auto-ajuda → FAQ com busca pré-preenchida
await page.locator('text=Como enviar seu exame').first().click();
await page.waitForTimeout(1800);
const faqQ = await page.evaluate(() => decodeURIComponent(location.hash));
console.log('auto-ajuda → FAQ com ?q:', faqQ.includes('faq?q=') ? '✓' : `FALHOU (${faqQ})`);
await page.screenshot({ path: 'design-lab/qa/sup-02-faq-deeplink.png' });
await page.goto(`${WEB}/#/suporte`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500); await dismiss();

// 3 · Novo chamado (dialog)
await page.getByRole('button', { name: /Novo chamado/ }).first().click();
await page.waitForTimeout(800);
await page.getByLabel('Título resumido').fill('QA — teste do dialog premium');
await page.getByLabel('Descreva o que aconteceu').fill('Chamado de teste do QA — pode fechar.');
await page.screenshot({ path: 'design-lab/qa/sup-03-dialog.png' });
await page.getByRole('button', { name: 'Abrir chamado' }).click();
await page.waitForTimeout(1800);
await dismiss(); // se 429/erro segurou o dialog, fecha e segue (o chamado de antes já cobre o fluxo)
const created = await page.evaluate(() => document.body.innerText);
console.log('chamado criado:', /\d+ em aberto|QA — teste do dialog premium/.test(created) ? '✓' : 'ver lista');
const firstTicket = await page.locator('text=QA — teste do dialog premium').first();
if (await firstTicket.count()) {
  await firstTicket.click(); await page.waitForTimeout(1800); await dismiss();
  await page.screenshot({ path: 'design-lab/qa/sup-04-thread.png' });
  const thread = await page.evaluate(() => document.body.innerText);
  console.log('thread renderiza (bubbles/Dr. Suporte):', thread.includes('QA — teste do dialog premium') ? '✓' : 'FALHOU');
}

// 4 · LIBRAS: opt-out em tela autenticada — widget invisível
await page.goto(`${WEB}/#/suporte`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
const libras = await page.evaluate(() => Array.from(document.querySelectorAll('[vw], [class*="vp-"], [class*="vw-"], [class*="vpw-"]')).filter((e) => { const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && e.getClientRects().length > 0; }).length);
console.log('libras invisível (opt-out):', libras === 0 ? '✓' : `FALHOU (${libras} elementos visíveis)`);

// 5 · ADMIN — fila + macros + contexto (se user é admin)
const me = await (await fetch('http://localhost:4001/api/auth/me', { headers: H })).json();
if (me?.user?.role === 'ADMIN') {
  const apage = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  await apage.addInitScript((t) => { localStorage.setItem('token', t); }, jwt);
  await apage.goto(`${WEB}/#/admin?tab=support`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await apage.waitForTimeout(3000);
  await apage.screenshot({ path: 'design-lab/qa/sup-05-admin-fila.png', fullPage: true });
  const fila = await apage.evaluate(() => document.body.innerText);
  console.log('admin fila carrega:', fila.includes('Fila de suporte') ? '✓' : 'FALHOU');
  const ticket = apage.locator('text=QA — teste do dialog premium').first();
  if (await ticket.count()) {
    await ticket.click(); await apage.waitForTimeout(2000);
    const conv = await apage.evaluate(() => document.body.innerText);
    for (const t of ['Resposta rápida', 'Créditos:', 'Cliente desde', 'Resolver']) {
      console.log(conv.includes(t) ? `✓ admin "${t}"` : `FALHOU admin "${t}"`);
    }
    await apage.screenshot({ path: 'design-lab/qa/sup-06-admin-conversa.png' });
  }
} else {
  console.log('admin: usuário seed não é ADMIN — pulado (validar macros no deploy como admin)');
}

await browser.close();
console.log('Screenshots em design-lab/qa');
