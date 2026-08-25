import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
await p.goto('https://drexame.janocaminho.com.br/#/api-docs', { waitUntil: 'domcontentloaded', timeout: 45000 });
await p.waitForTimeout(4000);
const body = await p.evaluate(() => document.body.innerText);
for (const t of ['Como começar', 'Solicite o acesso', 'Autenticação', 'Limites e erros', 'Buscar medicamentos', 'Preços por farmácia', 'Interações entre medicamentos', 'Pacotes e preços', 'Profissional', 'Console interativo']) {
  console.log(body.includes(t) ? `✓ "${t}"` : `FALHOU: "${t}"`);
}
await p.screenshot({ path: 'design-lab/qa/api-docs-portal-prod.png', fullPage: true });
// Guard: área logada sem token → /entrar
const p2 = await b.newPage({ viewport: { width: 390, height: 844 } });
await p2.addInitScript(() => { localStorage.clear(); });
await p2.goto('https://drexame.janocaminho.com.br/#/perfil', { waitUntil: 'domcontentloaded', timeout: 45000 });
await p2.waitForTimeout(4000);
console.log('guard /perfil sem login →', p2.url().includes('/entrar') ? '✓ redireciona pro login' : `ver: ${p2.url()}`);
await b.close();
