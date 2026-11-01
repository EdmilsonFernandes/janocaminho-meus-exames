// QA Portal Médico — aba Teleconsultas (lista + agenda calendário) com doctor/me e
// doctor/teleconsultas mockados. Desktop 1280 e mobile 390.
// ⚠️ LIMITAÇÃO conhecida (31/10): o shell do portal valida a sessão no bootstrap
// (doctorToken + pacientes) e cai em "Não foi possível carregar" com token mockado —
// pra funcionar 100% precisa de credenciais de médico QA reais (login POST /doctor/login
// {email,password}) OU mockar também o bootstrap de pacientes. Deixa o esqueleto pronto.
// Uso: node e2e/qa-teleportal.mjs [base-web]
import { chromium } from 'playwright';

const WEB = process.argv[2] || 'https://drexame.janocaminho.com.br';
const iso = (min) => new Date(Date.now() + min * 60000).toISOString();
const dayAt = (d, h) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x.toISOString(); };

const ME = { id: 'dqa', name: 'Daniel Shirane', crm: '123456', crmUf: 'SP', specialty: 'Endocrinologia', email: 'dr.qa@teste.com', plan: 'pro', photoUrl: null };
const TELES = [
  { id: 't1', type: 'teleconsulta', title: 'Consulta de retorno — tireoide', dueDate: iso(30), endedAt: null, teleStatus: 'SCHEDULED', consultPriceCents: 7990, paidAt: iso(-1440), patientId: 'p1', patientName: 'Edmilson QA', provider: 'livekit' },
  { id: 't2', type: 'teleconsulta', title: 'Primeira consulta', dueDate: dayAt(1, 9), endedAt: null, teleStatus: null, consultPriceCents: 0, paidAt: null, patientId: 'p1', patientName: 'Edmilson QA', provider: 'livekit' },
  { id: 't3', type: 'teleconsulta', title: 'Revisão de exames', dueDate: iso(-2880), endedAt: iso(-2875), teleStatus: 'ENDED', consultPriceCents: 7990, paidAt: iso(-4320), patientId: 'p1', patientName: 'Edmilson QA', provider: 'livekit' },
];

const b = await chromium.launch();
for (const vp of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'mobile', width: 390, height: 844 }]) {
  const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 160)); });

  await ctx.route('**/minhasaude/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await ctx.route('**/api/doctor/me*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ME) }));
  await ctx.route('**/api/doctor/teleconsultas*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: TELES }) }));

  await p.addInitScript(() => {
    localStorage.setItem('doctorToken', 'mock-qa');
    localStorage.setItem('doctorPhotoToken', 'mock-qa');
  });
  await p.goto(`${WEB}/#/doctor`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(5000);
  // Ir pra aba de teleconsultas (estado interno — clica no nav/tab).
  const tab = p.locator('button,a,[role=tab]', { hasText: /teleconsulta/i }).first();
  if (await tab.count()) { await tab.click().catch(() => {}); await p.waitForTimeout(2500); }
  const snap = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 300));
  await p.screenshot({ path: `e2e/screenshots/qa-teleportal/${vp.name}-teleconsultas.png`, fullPage: true });
  // Alternar pra visão calendário (agenda ReUI) se existir o toggle.
  const cal = p.locator('button', { hasText: /calend/i }).first();
  if (await cal.count()) { await cal.click().catch(() => {}); await p.waitForTimeout(2000); await p.screenshot({ path: `e2e/screenshots/qa-teleportal/${vp.name}-agenda-calendario.png`, fullPage: true }); }
  console.log(JSON.stringify({ vp: vp.name, erros: errs.slice(0, 3), text: snap }));
  await ctx.close();
}
await b.close();
console.log('screenshots em e2e/screenshots/qa-teleportal/');
