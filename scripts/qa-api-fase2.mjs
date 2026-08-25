/** QA visual Fase 2: landing (seção API) + admin (aba API) + fluxo solicitar→aprovar→chave→402. */
import { chromium } from 'playwright';

const API = 'http://localhost:4001/api';
const login = async (email, pass) => (await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pass }) })).json());
const H = (t) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

const seed = await login('edmilson@exemplo.com', 'troque123');
const notifs = await (await fetch(`${API}/notifications`, { headers: H(seed.token) })).json();
for (const n of notifs.items ?? []) await fetch(`${API}/notifications/${n.id}/read`, { method: 'PATCH', headers: H(seed.token) }).catch(() => {});

// ── Fluxo API completo ao vivo (usuário seed = ADMIN) ──
// 1. solicita acesso
const req = await (await fetch(`${API}/public/v1/access-request`, { method: 'POST', headers: H(seed.token), body: JSON.stringify({ company: 'QA Fase 2', useCase: 'Teste automatizado do fluxo de aprovacao e cobranca' }) })).json();
console.log('1. solicitação:', req.status ?? req.error);
// 2. seed é ADMIN → aprova via admin
if (req.id) {
  const ap = await (await fetch(`${API}/admin/api-access/${req.id}/approve`, { method: 'POST', headers: H(seed.token), body: '{}' })).json();
  console.log('2. aprovação:', ap.status, '| note:', (ap.note ?? '').slice(0, 40));
}
// 3. cria chave
const keyResp = await (await fetch(`${API}/public/v1/keys`, { method: 'POST', headers: H(seed.token), body: JSON.stringify({ name: 'QA F2' }) })).json();
console.log('3. chave criada:', keyResp.key ? `${keyResp.key.slice(0, 12)}…` : `ERRO: ${keyResp.error}`);
// 4. consome até zerar o teste (25) → 402
let calls = 0; let last = 0;
for (let i = 0; i < 30; i++) {
  const r = await fetch(`${API}/public/v1/meds?q=dipirona`, { headers: { 'x-api-key': keyResp.key } });
  if (r.status === 402) { last = 402; break; }
  calls++; last = r.status;
}
console.log(`4. consumo: ${calls} chamadas OK (teste grátis), depois → ${last}`);
// 5. saldo em GET /keys
const keys = await (await fetch(`${API}/public/v1/keys`, { headers: H(seed.token) })).json();
console.log('5. saldo visível:', keys.balance.calls, '| acesso:', keys.access.status);

// ── Visual: landing (seção API) ──
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.goto('http://localhost:5173/#/landing', { waitUntil: 'domcontentloaded', timeout: 45000 });
await p.waitForTimeout(3000);
await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 800) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } });
const body = await p.evaluate(() => document.body.innerText);
for (const t of ['Preço real de farmácia', 'no seu produto', 'Ver documentação', 'Solicitar acesso', '10 mil chamadas']) {
  console.log(body.includes(t) ? `✓ landing "${t}"` : `FALHOU landing "${t}"`);
}
await p.evaluate(() => window.scrollTo(0, 0));
await p.screenshot({ path: 'design-lab/qa/api-f2-landing-mobile.png', fullPage: true });

// ── Visual: admin aba API ──
const a = await b.newPage({ viewport: { width: 1366, height: 900 } });
await a.addInitScript((t) => { localStorage.setItem('token', t); }, seed.token);
await a.goto('http://localhost:5173/#/admin?tab=api', { waitUntil: 'domcontentloaded', timeout: 45000 });
await a.waitForTimeout(3000);
const adminBody = await a.evaluate(() => document.body.innerText);
for (const t of ['API pública', 'Solicitações de acesso', 'QA Fase 2', 'saldo:', 'pacotes ·', 'Avaliar']) {
  console.log(adminBody.includes(t) ? `✓ admin "${t}"` : `FALHOU admin "${t}"`);
}
await a.screenshot({ path: 'design-lab/qa/api-f2-admin.png', fullPage: true });
await b.close();
console.log('Screenshots em design-lab/qa');
