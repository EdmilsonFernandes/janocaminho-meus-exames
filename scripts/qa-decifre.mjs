/** QA visual local do DecifreReal (resposta mockada = a validada contra o relay real). */
import { chromium } from 'playwright';

const MOCK = {
  items: [
    { name: 'Hemoglobina', value: 13.5, unit: 'g/dL', refLow: 12, refHigh: 16, flag: 'NORMAL' },
    { name: 'Hematócrito', value: 41.2, unit: '%', refLow: 36, refHigh: 46, flag: 'NORMAL' },
    { name: 'Leucócitos', value: 7800, unit: '/mm³', refLow: 4000, refHigh: 11000, flag: 'NORMAL' },
    { name: 'LDL colesterol', value: 178, unit: 'mg/dL', refLow: null, refHigh: 130, flag: 'HIGH' },
    { name: 'Triglicerídeos', value: 245, unit: 'mg/dL', refLow: null, refHigh: 150, flag: 'HIGH' },
    { name: 'HDL colesterol', value: 38, unit: 'mg/dL', refLow: 40, refHigh: null, flag: 'LOW' },
    { name: 'TSH', value: 3.1, unit: 'µUI/mL', refLow: 0.4, refHigh: 4, flag: 'NORMAL' },
    { name: 'Glicose', value: 99, unit: 'mg/dL', refLow: 70, refHigh: 99, flag: 'NORMAL' },
  ],
  totalDetected: 8, cached: false, disclaimer: 'Leitura automática — informativa, não é diagnóstico.',
};

const b = await chromium.launch();
for (const [label, w, h] of [['mobile-390', 390, 844], ['desktop-1280', 1280, 800]]) {
  const p = await (await b.newContext({ serviceWorkers: 'block' })).newPage({ viewport: { width: w, height: h } });
  await p.route('**/*decifre*', (route) => route.fulfill({ json: MOCK }));
  await p.goto('http://localhost:5199/#/landing', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await p.waitForTimeout(3500);
  // direto ao box (sem scroll-all prévio — era o que enroscava o locator)
  const ta = p.locator('textarea').first();
  await ta.scrollIntoViewIfNeeded();
  await p.waitForTimeout(300);
  await p.screenshot({ path: `design-lab/qa/decifre-${label}-1-box.png` });
  await ta.fill('EXAME LABORATORIAL Hemoglobina 13,5 g/dL (12,0 - 16,0) LDL colesterol 178 mg/dL (< 130)');
  await p.getByRole('button', { name: /Decifrar/ }).click({ force: true });
  await p.waitForTimeout(1800);
  const body = await p.evaluate(() => document.body.innerText);
  for (const t of ['8 valores encontrados', '3 pedem atenção', 'LDL colesterol', 'Criar conta grátis']) {
    console.log(body.includes(t) ? `✓ [${label}] "${t}"` : `FALHOU [${label}] "${t}"`);
  }
  await p.locator('text=8 valores encontrados').first().scrollIntoViewIfNeeded().catch(() => {});
  await p.waitForTimeout(300);
  await p.screenshot({ path: `design-lab/qa/decifre-${label}-2-resultado.png` });
  await p.close();
}
await b.close();
console.log('Screenshots em design-lab/qa');
