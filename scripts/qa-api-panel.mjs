/** QA do PAINEL da API (#/api): estado sem acesso (form) + aprovado (chaves/saldo/packs). */
import { chromium } from 'playwright';

const API = 'http://localhost:4001/api';
const WEB = 'http://localhost:5199';
const post = (path, body, token) => fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

// Usuário NOVO (sem solicitação): register NÃO devolve token (verificação de e-mail) —
// o QA cria direto no DB dev (docker psql) e loga normal.
const email = `qa-panel-${Date.now()}@exemplo.com`;
const { execSync } = await import('node:child_process');
const hash = execSync('node -e "console.log(require(\'bcryptjs\').hashSync(\'senha12345\',10))"', { cwd: process.cwd() }).toString().trim();
execSync(`docker exec meus-exames-db psql -U meus_exames -d meus_exames -c "INSERT INTO users (id, email, name, \\"passwordHash\\", credits, \\"emailVerified\\", role, \\"createdAt\\") VALUES ('qa${Date.now()}', '${email}', 'QA Panel', '${hash}', 45, true, 'OWNER', now());"`, { stdio: 'ignore' });
const newTok = (await (await post('/auth/login', { email, password: 'senha12345' })).json()).token;
if (!newTok) { console.error('login do usuário QA falhou'); process.exit(1); }

// Seed user = aprovado (da QA Fase 2)
const seed = (await (await post('/auth/login', { email: 'edmilson@exemplo.com', password: 'troque123' })).json());

const b = await chromium.launch();
const dismiss = async (p) => {
  for (let i = 0; i < 10; i++) {
    if (!(await p.locator('.MuiDialog-root').count())) break;
    let acted = false;
    for (const n of ['Pular', 'Depois', 'Agora não', 'Legal!', 'Entendi']) {
      const btn = p.getByRole('button', { name: new RegExp(`^${n}`, 'i') }).first();
      if (await btn.isVisible().catch(() => false)) { await btn.click({ force: true, timeout: 1200 }).catch(() => {}); acted = true; await p.waitForTimeout(400); break; }
    }
    if (!acted) { await p.keyboard.press('Escape').catch(() => {}); await p.waitForTimeout(400); }
  }
};

// ── Estado 1: SEM acesso (usuário novo) → form + endpoints showcase ──
const p1 = await b.newPage({ viewport: { width: 390, height: 844 } });
await p1.addInitScript((t) => { localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); }, newTok);
await p1.goto(`${WEB}/#/api`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await p1.waitForTimeout(2500); await dismiss(p1);
let body = await p1.evaluate(() => document.body.innerText);
for (const t of ['API do Dr. Exame', 'Solicitar acesso', 'Empresa / projeto', 'O que você vai construir?', '25 chamadas de teste', '/meds?q=dipirona']) {
  console.log(body.includes(t) ? `✓ sem-acesso "${t}"` : `FALHOU sem-acesso "${t}"`);
}
await p1.screenshot({ path: 'design-lab/qa/api-panel-1-form.png', fullPage: true });

// envia a solicitação pelo PRÓPRIO FORM
await p1.getByLabel('Empresa / projeto').fill('QA Painel LTDA');
await p1.getByLabel('O que você vai construir?').fill('Teste do painel self-service da API');
await p1.getByRole('button', { name: 'Enviar solicitação' }).click();
await p1.waitForTimeout(1500);
body = await p1.evaluate(() => document.body.innerText);
console.log(body.includes('em análise') ? '✓ form envia → estado "em análise"' : 'FALHOU estado em análise');
await p1.screenshot({ path: 'design-lab/qa/api-panel-2-pending.png' });

// ── Estado 2: APROVADO (seed) → saldo 0 + chaves + packs ──
const p2 = await b.newPage({ viewport: { width: 390, height: 844 } });
await p2.addInitScript((t) => { localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); }, seed.token);
await p2.goto(`${WEB}/#/api`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await p2.waitForTimeout(2500); await dismiss(p2);
body = await p2.evaluate(() => document.body.innerText);
for (const t of ['SALDO', 'chamadas', 'Suas chaves', 'Recarregar chamadas', 'PIX (na hora)', 'Cartão / débito', 'MAIS VENDIDO']) {
  console.log(body.includes(t) ? `✓ aprovado "${t}"` : `FALHOU aprovado "${t}"`);
}
await p2.screenshot({ path: 'design-lab/qa/api-panel-3-aprovado.png', fullPage: true });

// cria chave pelo UI → dialog com a chave UMA vez
await p2.getByRole('button', { name: '+ Nova chave' }).click();
await p2.waitForTimeout(600);
await p2.getByLabel('Nome (pra que serve)').fill('QA UI');
await p2.getByRole('button', { name: 'Criar' }).click();
await p2.waitForTimeout(1500);
const created = await p2.evaluate(() => document.body.innerText.includes('dxk_live_'));
console.log(created ? '✓ dialog mostra a chave criada (1x)' : 'FALHOU criar chave pela UI');
await p2.screenshot({ path: 'design-lab/qa/api-panel-4-chave.png' });

await b.close();
console.log('Screenshots em design-lab/qa');
