import { chromium } from '@playwright/test';
const BASE = 'http://127.0.0.1:4011';
const browser = await chromium.launch();
for (const [route, name] of [['/landing', 'landing'], ['/termos', 'termos'], ['/#/faq', 'faq']]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${route.startsWith('/#') ? route : '/#' + route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);
  const out = await page.evaluate(() => {
    const de = document.documentElement;
    const containers = [...document.querySelectorAll('.MuiContainer-root')].slice(0, 2).map(c => Math.round(c.getBoundingClientRect().width));
    return { docOvX: de.scrollWidth - de.clientWidth, containers };
  });
  console.log(`[1440] ${name.padEnd(8)}`, JSON.stringify(out));
  await ctx.close();
}
await browser.close();
