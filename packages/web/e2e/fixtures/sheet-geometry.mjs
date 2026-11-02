/**
 * Geometria do CrossInsightBottomSheet — função executada NO NAVEGADOR (page.evaluate).
 * Compartilhada pelo spec Playwright (web) e pelo script Android (WebView real).
 * Sem falsos positivos: só elementos renderizados, dentro do sheet ativo; o papel do sheet
 * (scroll container intencional) é isento da regra vertical; inline mede por client rects;
 * tolerância 1,5–2 px para arredondamento.
 */
export function sheetGeometry(SHEET_SEL) {
  const T = 1.5;
  const issues = [];
  const sheet = document.querySelector(SHEET_SEL);
  if (!sheet) return { issues: [{ kind: 'sheet-missing', el: SHEET_SEL, text: '', measure: '' }], stats: {} };
  const sr = sheet.getBoundingClientRect();
  const vw = window.innerWidth; const vh = window.innerHeight;
  const describe = (el) => `${el.tagName.toLowerCase()}${el.getAttribute('data-testid') ? `[${el.getAttribute('data-testid')}]` : ''}`;
  const txt = (el) => (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const push = (kind, el, measure) => issues.push({ kind, el: describe(el), text: txt(el), measure });

  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + T) issues.push({ kind: 'page-overflow-x', el: 'html', text: '', measure: `scrollWidth ${de.scrollWidth} > clientWidth ${de.clientWidth}` });
  if (sheet.scrollWidth > sheet.clientWidth + T) push('sheet-overflow-x', sheet, `scrollWidth ${sheet.scrollWidth} > clientWidth ${sheet.clientWidth}`);
  if (sr.left < -T || sr.right > vw + T) push('sheet-outside-viewport', sheet, `left ${sr.left.toFixed(1)} right ${sr.right.toFixed(1)} vw ${vw}`);
  if (sr.bottom > vh + T) push('sheet-below-viewport', sheet, `bottom ${sr.bottom.toFixed(1)} vh ${vh}`);

  const els = Array.from(sheet.querySelectorAll('h2, p, span, strong, button, [data-testid="metric-chip"], [data-testid="metric-status"]'));
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    const inline = cs.display.startsWith('inline') && !cs.display.includes('flex') && !cs.display.includes('block');
    const rects = inline ? Array.from(el.getClientRects()) : [r];
    for (const cr of rects) {
      if (cr.right > sr.right + T || cr.left < sr.left - T) { push('text-outside-sheet', el, `line right ${cr.right.toFixed(1)} vs sheet right ${sr.right.toFixed(1)}`); break; }
    }
    if (!inline) {
      const clipsX = ['hidden', 'clip'].includes(cs.overflowX) || cs.textOverflow === 'ellipsis';
      if (clipsX && el.scrollWidth > el.clientWidth + T) push('clip-x', el, `scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth} (overflow-x ${cs.overflowX}, text-overflow ${cs.textOverflow})`);
      const clamp = cs.webkitLineClamp;
      const clipsY = ['hidden', 'clip'].includes(cs.overflowY) || (clamp && clamp !== 'none');
      const isScroller = ['auto', 'scroll'].includes(cs.overflowY);
      if (clipsY && !isScroller && el.scrollHeight > el.clientHeight + 2) push('clip-y', el, `scrollHeight ${el.scrollHeight} > clientHeight ${el.clientHeight} (overflow-y ${cs.overflowY}, line-clamp ${clamp})`);
    }
    let p = el.parentElement;
    while (p && p !== sheet) {
      const pcs = getComputedStyle(p);
      if (['hidden', 'clip'].includes(pcs.overflowX) || ['hidden', 'clip'].includes(pcs.overflowY)) {
        const pr = p.getBoundingClientRect();
        if (r.right > pr.right + T || r.bottom > pr.bottom + T || r.left < pr.left - T) { push('clipped-by-ancestor', el, `el ${r.left.toFixed(0)}-${r.right.toFixed(0)}×${r.top.toFixed(0)}-${r.bottom.toFixed(0)} dentro de ${p.tagName.toLowerCase()} ${pr.left.toFixed(0)}-${pr.right.toFixed(0)}×${pr.top.toFixed(0)}-${pr.bottom.toFixed(0)}`); break; }
      }
      p = p.parentElement;
    }
  }
  const chips = Array.from(sheet.querySelectorAll('[data-testid="metric-chip"]')).map((c) => ({ el: c, r: c.getBoundingClientRect() }));
  const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  for (let i = 0; i < chips.length; i++) for (let j = i + 1; j < chips.length; j++) {
    const o = overlap(chips[i].r, chips[j].r);
    if (o > 4) push('chip-overlap', chips[j].el, `sobrepõe "${txt(chips[i].el)}" em ${o.toFixed(0)}px²`);
  }
  const btns = Array.from(sheet.querySelectorAll('button'));
  for (const b of btns) {
    const r = b.getBoundingClientRect();
    if (r.height < 40 || r.width < 40) push('button-too-small', b, `${r.width.toFixed(0)}×${r.height.toFixed(0)}px`);
    for (const c of chips) { const o = overlap(r, c.r); if (o > 4) push('button-chip-overlap', b, `${o.toFixed(0)}px² com "${txt(c.el)}"`); }
  }
  const h2 = sheet.querySelector('h2');
  const badge = h2 && h2.previousElementSibling ? h2.previousElementSibling.querySelector('span,div') : null;
  if (badge && h2) { const o = overlap(badge.getBoundingClientRect(), h2.getBoundingClientRect()); if (o > 4) push('badge-title-overlap', badge, `${o.toFixed(0)}px²`); }
  const copy = sheet.querySelector('[data-testid="copy-question-btn"]');
  const q = copy && copy.parentElement ? copy.parentElement.querySelector('p') : null;
  if (copy && q) { const o = overlap(copy.getBoundingClientRect(), q.getBoundingClientRect()); if (o > 4) push('copy-question-overlap', copy, `${o.toFixed(0)}px²`); }

  const h2fs = h2 ? parseFloat(getComputedStyle(h2).fontSize) : 0;
  const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const chipPx = chips[0] ? parseFloat(getComputedStyle(chips[0].el).fontSize) : 0;
  return { issues, stats: { vw, vh, rootPx, sheetW: Math.round(sr.width), sheetH: Math.round(sr.height), sheetScrollH: sheet.scrollHeight, h2px: Math.round(h2fs * 10) / 10, chipPx: Math.round(chipPx * 10) / 10, chips: chips.length } };
}
