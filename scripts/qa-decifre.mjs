/** QA visual do DecifreReal v2: modo PDF, shimmer de loading, reveal escalonado, GradientButton. */
import { chromium } from 'playwright';

const MOCK = {
  items: [
    { name: 'Hemoglobina', value: 13.5, unit: 'g/dL', refLow: 12, refHigh: 16, flag: 'NORMAL' },
    { name: 'Hematócrito', value: 41.2, unit: '%', refLow: 36, refHigh: 46, flag: 'NORMAL' },
    { name: 'LDL colesterol', value: 178, unit: 'mg/dL', refLow: null, refHigh: 130, flag: 'HIGH' },
    { name: 'Triglicerídeos', value: 245, unit: 'mg/dL', refLow: null, refHigh: 150, flag: 'HIGH' },
    { name: 'HDL colesterol', value: 38, unit: 'mg/dL', refLow: 40, refHigh: null, flag: 'LOW' },
    { name: 'TSH', value: 3.1, unit: 'µUI/mL', refLow: 0.4, refHigh: 4, flag: 'NORMAL' },
    { name: 'Glicose', value: 99, unit: 'mg/dL', refLow: 70, refHigh: 99, flag: 'NORMAL' },
    { name: 'Creatinina', value: 1.8, unit: 'mg/dL', refLow: 0.6, refHigh: 1.2, flag: 'HIGH' },
  ],
  totalDetected: 8, cached: false, disclaimer: 'Leitura automática — informativa, não é diagnóstico.',
};

const b = await chromium.launch();
for (const [label, w, h] of [['mobile-390', 390, 844], ['desktop-1280', 1280, 800]]) {
  const ctx = await b.newContext({ serviceWorkers: 'block', viewport: { width: w, height: h } }); // sw.js escapa das routes
  const p = await ctx.newPage();
  await p.route('**/*decifre*', async (route) => {
    await new Promise((r) => setTimeout(r, 3500)); // delay → captura o loading/shimmer
    return route.fulfill({ json: MOCK });
  });
  await p.goto('http://localhost:5199/#/landing', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await p.waitForTimeout(3500);
  // modo default = PDF (upload). Screenshot do box, depois troca pra texto.
  const pdfBtn = p.getByRole('button', { name: /Escolher PDF do exame/ });
  await pdfBtn.scrollIntoViewIfNeeded();
  await p.waitForTimeout(300);
  await p.screenshot({ path: `design-lab/qa/decifre-v2-${label}-1-box.png` });
  console.log((await p.evaluate(() => document.body.innerText)).includes('PDF do exame') ? `✓ [${label}] modo PDF default` : `FALHOU [${label}] modo PDF`);
  await p.getByRole('button', { name: /Colar texto/ }).click();
  await p.waitForTimeout(300);
  const ta = p.locator('textarea').first();
  await ta.fill('EXAME LABORATORIAL Hemoglobina 13,5 g/dL (12,0 - 16,0) LDL colesterol 178 mg/dL (< 130)');
  await p.getByRole('button', { name: /Decifrar/ }).click({ force: true });
  await p.waitForTimeout(1600); // meio do loading
  await p.screenshot({ path: `design-lab/qa/decifre-v2-${label}-2-loading.png` });
  const loadingTxt = await p.evaluate(() => document.body.innerText);
  console.log(/Abrindo o laudo|Encontrando os valores|Conferindo as faixas|Quase lá/.test(loadingTxt) ? `✓ [${label}] loading com fases` : `ver [${label}] loading`);
  await p.waitForTimeout(3200);
  const body = await p.evaluate(() => document.body.innerText);
  for (const t of ['8 valores encontrados', '4 pedem atenção', 'Criar conta grátis']) {
    console.log(body.includes(t) ? `✓ [${label}] "${t}"` : `FALHOU [${label}] "${t}"`);
  }
  await p.locator('text=8 valores encontrados').first().scrollIntoViewIfNeeded().catch(() => {});
  await p.waitForTimeout(400);
  await p.screenshot({ path: `design-lab/qa/decifre-v2-${label}-3-resultado.png` });
  await ctx.close();
}
await b.close();
console.log('Screenshots em design-lab/qa');
