// Baseline CWV sintético (19/11): TTFB/FCP/LCP + chunks de JS na landing (prod).
import { chromium } from 'playwright-core';

const URL = process.env.URL || 'https://drexame.janocaminho.com.br/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 3, locale: 'pt-BR' });
const page = await ctx.newPage();
const js = [];
page.on('response', async (r) => {
  const u = r.url();
  if (u.endsWith('.js') || u.includes('.js?')) {
    const h = r.headers();
    js.push({ file: u.split('/').pop().slice(0, 40), kb: Math.round((Number(h['content-length']) || 0) / 1024) });
  }
});
await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(3500);
const vitals = await page.evaluate(() => new Promise((resolve) => {
  const nav = performance.getEntriesByType('navigation')[0];
  const paint = performance.getEntriesByType('paint');
  let lcp = 0;
  try {
    const po = new PerformanceObserver(() => {});
    const entries = performance.getEntriesByType('largest-contentful-paint');
    lcp = entries.length ? entries[entries.length - 1].startTime : 0;
  } catch { lcp = -1; }
  resolve({
    ttfb: Math.round(nav.responseStart),
    fcp: Math.round(paint.find((p) => p.name === 'first-contentful-paint')?.startTime ?? 0),
    lcp: Math.round(lcp),
    domNodes: document.querySelectorAll('*').length,
    transferKB: Math.round((nav.transferSize || 0) / 1024),
  });
}));
console.log('VITALS (412x915, rede local):', JSON.stringify(vitals));
console.log('JS carregados na 1ª carga:', js.length, 'arquivos ·', js.reduce((a, b) => a + b.kb, 0), 'KB (content-length)');
js.sort((a, b) => b.kb - a.kb).slice(0, 8).forEach((j) => console.log('  ', j.kb + 'KB', j.file));
await browser.close();
