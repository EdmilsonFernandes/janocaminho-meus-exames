import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
await p.goto('http://localhost:4001/api/docs', { waitUntil: 'domcontentloaded', timeout: 30000 });
await p.waitForTimeout(2500);
const body = await p.evaluate(() => document.body.innerText);
for (const t of ['Dr. Exame API', 'Buscar medicamentos', 'Preços por farmácia', 'Interações entre remédios', 'Criar chave']) {
  console.log(body.includes(t) ? `✓ "${t}"` : `FALHOU: "${t}"`);
}
await p.screenshot({ path: 'design-lab/qa/api-docs.png' });
await b.close();
