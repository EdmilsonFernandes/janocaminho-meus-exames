/** QA dos links de fonte: landing (ciência) + /como-validamos — build estático 5199. */
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });

// 1 · Landing — cards de ciência
await p.goto('http://localhost:5199/#/landing', { waitUntil: 'domcontentloaded', timeout: 30000 });
await p.waitForTimeout(2500);
await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 800) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } });
const hrefs = await p.evaluate(() => Array.from(document.querySelectorAll('a[href*="pubmed"], a[href*="who.int"], a[href*="planalto"]')).map((a) => a.href));
const expected = ['29676998', '34554658', '3899825', 'who.int/news-room/fact-sheets/detail/hypertension'];
for (const e of expected) console.log(hrefs.some((h) => h.includes(e)) ? `✓ link ${e}` : `FALHOU: link ${e}`);
console.log('landing: ano corrigido (2018)?', (await p.evaluate(() => document.body.innerText.includes('Aging 2018'))) ? '✓' : 'FALHOU');

// 2 · /como-validamos — link LGPD
await p.goto('http://localhost:5199/#/como-validamos', { waitUntil: 'domcontentloaded', timeout: 30000 });
await p.waitForTimeout(2000);
const lgpd = await p.evaluate(() => Array.from(document.querySelectorAll('a')).some((a) => a.href.includes('planalto.gov.br')));
console.log('como-validamos: link LGPD planalto?', lgpd ? '✓' : 'FALHOU');

await b.close();
