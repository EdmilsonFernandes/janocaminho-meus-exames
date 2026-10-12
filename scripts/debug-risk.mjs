import { chromium } from 'playwright';

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
await p.goto('http://localhost:5173/#/landing', { waitUntil: 'networkidle' });

const res = await p.evaluate(() => {
  const h2 = Array.from(document.querySelectorAll('h2')).find(x => x.textContent.includes('Descubra seu risco'));
  if (!h2) return 'Heading not found';
  const container = h2.closest('.MuiContainer-root');
  const grid = container ? container.firstElementChild : null;
  return {
    h2Text: h2.textContent,
    gridChildrenCount: grid ? grid.children.length : 0,
    childrenHtml: grid ? Array.from(grid.children).map(c => ({
      tag: c.tagName,
      text: c.innerText.slice(0, 100),
      rect: c.getBoundingClientRect(),
      style: window.getComputedStyle(c).display,
    })) : []
  };
});

console.log(JSON.stringify(res, null, 2));
await b.close();
