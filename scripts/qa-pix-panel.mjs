/** QA do PIX no painel: retomada do MESMO QR + countdown mm:ss tickando no card. */
import { chromium } from 'playwright';
const API = 'http://localhost:4001/api';
const WEB = 'http://localhost:5199';
const login = await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'edmilson@exemplo.com', password: 'troque123' }) })).json();
const H = { Authorization: `Bearer ${login.token}`, 'Content-Type': 'application/json' };

const buy = await fetch(`${API}/billing/buy-api-pack`, { method: 'POST', headers: H, body: JSON.stringify({ pack: 'api1k', method: 'pix' }) });
console.log('buy status:', buy.status);
if (buy.ok) {
  const d = await buy.json();
  console.log('qr:', String(d.qrCode).slice(0, 10), '| calls:', d.calls);
  const buy2 = await (await fetch(`${API}/billing/buy-api-pack`, { method: 'POST', headers: H, body: JSON.stringify({ pack: 'api1k', method: 'pix' }) })).json();
  console.log('2ª compra resumed:', buy2.resumed === true && buy2.qrCode === d.qrCode ? '✓ MESMO QR' : `ver: ${JSON.stringify(buy2).slice(0, 90)}`);
}

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.addInitScript((t) => { localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); }, login.token);
await p.goto(`${WEB}/#/api`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await p.waitForTimeout(3000);
for (let i = 0; i < 8; i++) {
  if (!(await p.locator('.MuiDialog-root').count())) break;
  let acted = false;
  for (const n of ['Pular', 'Depois', 'Agora não', 'Legal!', 'Entendi']) {
    const btn = p.getByRole('button', { name: new RegExp(`^${n}`, 'i') }).first();
    if (await btn.isVisible().catch(() => false)) { await btn.click({ force: true, timeout: 1200 }).catch(() => {}); acted = true; await p.waitForTimeout(400); break; }
  }
  if (!acted) { await p.keyboard.press('Escape').catch(() => {}); await p.waitForTimeout(400); }
}
const body = await p.evaluate(() => document.body.innerText);
console.log('card "Aguardando pagamento":', body.includes('Aguardando pagamento') ? '✓' : 'FALHOU');
console.log('botão "Retomar pagamento":', body.includes('Retomar pagamento') ? '✓' : 'FALHOU');
const t1 = await p.evaluate(() => (document.body.innerText.match(/\d{2}:\d{2}/g) ?? []));
await p.waitForTimeout(2600);
const t2 = await p.evaluate(() => (document.body.innerText.match(/\d{2}:\d{2}/g) ?? []));
const ticked = t1.some((x) => t2.includes(x) === false);
console.log('countdown ticka:', ticked ? `✓ (${t1.join(',')} → ${t2.join(',')})` : `ver (${t1.join(',')} → ${t2.join(',')})`);
await p.screenshot({ path: 'design-lab/qa/api-pix-countdown.png', fullPage: true });
await b.close();
