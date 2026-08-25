import { chromium } from 'playwright';
const WEB = 'http://localhost:5199';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.goto(`${WEB}/#/landing`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await p.waitForTimeout(3000);
await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 800) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } });
const body = await p.evaluate(() => document.body.innerText);
for (const t of ['Preço real de farmácia', 'no seu produto', 'Ver documentação', 'Solicitar acesso', '10 mil chamadas']) {
  console.log(body.includes(t) ? `✓ landing "${t}"` : `FALHOU landing "${t}"`);
}
await p.screenshot({ path: 'design-lab/qa/api-f2-landing-mobile.png', fullPage: true });
const a = await b.newPage({ viewport: { width: 1366, height: 900 } });
const login = await (await fetch('http://localhost:4001/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'edmilson@exemplo.com', password: 'troque123' }) })).json();
await a.addInitScript((t) => { localStorage.setItem('token', t); }, login.token);
await a.goto(`${WEB}/#/admin?tab=api`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await a.waitForTimeout(3000);
const adminBody = await a.evaluate(() => document.body.innerText);
for (const t of ['API pública', 'Solicitações de acesso', 'QA Fase 2', 'saldo:', 'pacotes ·', 'Avaliar']) {
  console.log(adminBody.includes(t) ? `✓ admin "${t}"` : `FALHOU admin "${t}"`);
}
await a.screenshot({ path: 'design-lab/qa/api-f2-admin.png', fullPage: true });
await b.close();
