import { chromium } from 'playwright';

const b = await chromium.launch();

const targets = [
  { name: 'prod-desktop', url: 'https://drexame.janocaminho.com.br/#/landing', viewport: { width: 1280, height: 900 } },
  { name: 'prod-mobile', url: 'https://drexame.janocaminho.com.br/#/landing', viewport: { width: 390, height: 844 } },
];

for (const t of targets) {
  const p = await b.newPage({ viewport: t.viewport });
  try {
    await p.goto(t.url, { waitUntil: 'networkidle', timeout: 30000 });
    await p.waitForTimeout(2000);
    await p.screenshot({ path: `design-lab/qa/landing-${t.name}-hero.png` });
    await p.screenshot({ path: `design-lab/qa/landing-${t.name}-full.png`, fullPage: true });
    console.log(`Captured ${t.name}`);
  } catch (err) {
    console.error(`Failed ${t.name}:`, err.message);
  } finally {
    await p.close();
  }
}

await b.close();
