/** Overflow horizontal nas rotas do smoke M3 (mesma regra do smoke.spec), com login via API do backend. */
import { chromium } from 'playwright';
const BASE = process.env.E2E_BASE_URL || 'http://192.168.15.30:4175';
const API = process.env.E2E_API_URL || 'http://192.168.15.30:4001/api';
const ROUTES = ['/', '/exams', '/notificacoes', '/perfil', '/planos', '/medicos', '/familia', '/conquistas', '/tendencias', '/alterados', '/evolucao', '/linha-do-tempo', '/lembretes', '/vacinas', '/medicoes', '/despesas', '/emergencia', '/consultas'];
const s = await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'edmilson@exemplo.com', password: 'troque123' }) })).json();
let fails = 0;
const b = await chromium.launch();
for (const vp of [{ width: 375, height: 760, isMobile: true, hasTouch: true }, { width: 1440, height: 900 }]) {
  const { width, height, ...rest } = vp;
  const c = await b.newContext({ viewport: { width, height }, ...rest });
  await c.addInitScript((x) => { localStorage.setItem('token', x.token); localStorage.setItem('patientId', x.patientId); localStorage.setItem('selPatientId', x.patientId); localStorage.setItem('user', JSON.stringify(x.user)); localStorage.setItem('onboarded', '1'); localStorage.setItem('dxGoals', '[]'); sessionStorage.setItem('coldDialogWinner', 'e2e'); sessionStorage.setItem('engagementSlot', 'survey'); }, s);
  const p = await c.newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  for (const r of ROUTES) {
    await p.goto(`${BASE}/#${r}`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2500);
    const diff = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const blank = await p.evaluate(() => (document.querySelector('main')?.innerText || '').trim().length < 20);
    const ok = diff <= 2 && !blank;
    if (!ok) fails++;
    console.log(`${ok ? 'ok ' : 'FAIL'} ${width}px ${r.padEnd(16)} overflow=${diff}px ${blank ? 'TELA VAZIA' : ''}`);
  }
  if (errors.length) { fails += errors.length; console.log('erros JS:', errors.slice(0, 3)); }
  await c.close();
}
await b.close();
console.log(fails ? `FALHAS: ${fails}` : 'OK: nenhuma rota com overflow, tela vazia ou erro JS');
process.exit(fails ? 1 : 0);
