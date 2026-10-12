/** Spot-check PROD da landing atualizada: seções novas renderizam no ar. */
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.goto('https://janocaminho.com.br/minhasaude/#/landing', { waitUntil: 'domcontentloaded', timeout: 45000 });
await p.waitForTimeout(4000);
await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 800) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } });
const body = await p.evaluate(() => document.body.innerText);
for (const t of ['Família de verdade', 'A saúde de quem você ama', 'Ciência sem caixa-preta', 'PhenoAge', 'Harriet Lane', '1º resumo de IA grátis', 'Ver cada regra, com a fonte']) {
  console.log(body.includes(t) ? `✓ "${t}"` : `FALHOU: "${t}"`);
}
await b.close();
