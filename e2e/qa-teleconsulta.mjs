// QA Teleconsulta (paciente) — exercita as FASES sem LiveKit via route-mock do join:
//   A waiting (TOO_EARLY + countdown) · B fallback Meet (501) · C pós-consulta (ENDED +
//   resumo aprovado + pedidos + transcrição) · D pagamento (402).
// Contra PROD por padrão (WEB=https://drexame.janocaminho.com.br); passe URL dev se quiser.
// Uso: node e2e/qa-teleconsulta.mjs [base-web]
import { chromium } from 'playwright';

const API = 'https://janocaminho.com.br/minhasaude/api';
const WEB = process.argv[2] || 'https://drexame.janocaminho.com.br';
const ID = 'qa-tele-1';
const iso = (ms) => new Date(Date.now() + ms).toISOString();

const SUMMARY_ENDED = {
  doctorInRoom: false,
  endedAt: iso(-3600_000),
  consentAt: iso(-3700_000),
  recordConsentAt: iso(-3700_000),
  doctorNote: undefined,
  cid10: undefined,
  consultSummary: {
    status: 'approved',
    approvedAt: iso(-3500_000),
    markdown: [
      '## Resumo da consulta',
      '**Queixa:** retorno para revisão de exames de tireoide.',
      '**Conduta:** manter dose atual; novo TSH em 8 semanas.',
      '**Pedidos:** TSH, T4 livre',
      'Comparecer em caso de piora. Este resumo foi revisado pelo médico.',
    ].join('\n'),
  },
  durationSec: 900,
  transcript: { at: iso(-3550_000) },
  recordingAt: null,
  examRequests: [
    { id: 'er1', title: 'TSH (Tiroestimulante)', status: 'pending', createdAt: iso(-3590_000) },
    { id: 'er2', title: 'T4 livre', status: 'pending', createdAt: iso(-3590_000) },
  ],
  feedback: null,
  durationHint: 'aprox. 15 min',
  stt: true,
  patient: { id: 'p1', name: 'Edmilson QA', photoUrl: null },
  doctor: { id: 'd1', name: 'Daniel Shirane', crm: '123456/SP', specialty: 'Endocrinologia', photoUrl: null, phone: null },
};

const SCENARIOS = [
  { name: 'A-waiting', mode: 'light', join: { status: 403, body: { code: 'TOO_EARLY', error: 'A sala abre 15 minutos antes do horário da consulta.', opensAt: iso(75_000), dueDate: iso(25 * 60_000) } } },
  { name: 'B-fallback-meet', mode: 'light', join: { status: 501, body: { error: 'Sala externa', linkUrl: 'https://meet.google.com/qa-teste-x' } } },
  { name: 'C-encerrada-resumo', mode: 'light', join: { status: 403, body: { code: 'TELECONSULTA_ENDED', error: 'Esta consulta já foi encerrada.', endedAt: iso(-3600_000) } }, summary: SUMMARY_ENDED },
  { name: 'C-encerrada-resumo', mode: 'dark', join: { status: 403, body: { code: 'TELECONSULTA_ENDED', error: 'Esta consulta já foi encerrada.', endedAt: iso(-3600_000) } }, summary: SUMMARY_ENDED },
  { name: 'D-pagamento', mode: 'light', join: { status: 402, body: { code: 'PAYMENT_REQUIRED', error: 'Pagamento da consulta pendente — conclua o PIX antes de entrar.', consultPriceCents: 7990 } } },
];

const r = await fetch(`${API}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'qa.dono.271026@gmail.com', password: 'QaDono@2026' }),
});
const { token } = await r.json();

const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const report = [];
for (const s of SCENARIOS) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.grantPermissions(['camera', 'microphone'], { origin: WEB }).catch(() => {});
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 160)); });
  p.on('response', (resp) => { if (resp.status() >= 400) errs.push(`HTTP ${resp.status()} ${resp.url().replace(API, '').slice(0, 80)}`); });

  // catch-all: qualquer API não-mockada (consent de reminders, feedback…) → 200 vazio.
  await ctx.route(`**/minhasaude/api/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await ctx.route(`**/api/teleconsulta/${ID}/join*`, (route) =>
    route.fulfill({ status: s.join.status, contentType: 'application/json', body: JSON.stringify(s.join.body) }));
  await ctx.route(`**/api/teleconsulta/${ID}/summary*`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(s.summary ?? { doctorInRoom: false, endedAt: null, stt: false, examRequests: [], durationSec: null, transcript: null, recordingAt: null, feedback: null, durationHint: null, patient: SUMMARY_ENDED.patient, doctor: SUMMARY_ENDED.doctor, consultSummary: null, consentAt: null, recordConsentAt: null }) }));
  await ctx.route(`**/api/teleconsulta/${ID}/transcript*`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ready', segments: [
      { t: 0, who: 'doctor', text: 'Olá! Vamos revisar seus exames de tireoide.' },
      { t: 42, who: 'patient', text: 'Bom, me senti bem cansado nesse mês...' },
      { t: 95, who: 'doctor', text: 'Entendi. Vamos manter a dose e repetir o TSH.' },
    ] }) }));

  await p.addInitScript((t, m) => { localStorage.setItem('token', t); localStorage.setItem('theme', m); }, token, s.mode);
  await p.goto(`${WEB}/#/teleconsulta/${ID}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(3500);
  // Fases waiting/fallback/payment só existem DEPOIS do "Entrar" (prejoin é o lobby).
  // Só clica quando há CTA de entrada (cenários A/B/D); C é read-only (sem join válido).
  if (s.name !== 'C-encerrada-resumo') {
    const btn = p.locator('button', { hasText: 'Entrar na consulta' }).first();
    if (await btn.count()) {
      await btn.click().catch(() => {});
      await p.waitForTimeout(1200);
      // consentAndJoin: o dialog Art.15/gravação aparece DEPOIS do clique no CTA.
      for (const label of [/Concordo/i, /Autorizo/i, /Aceito/i, /Entendi/i, /Continuar/i]) {
        const c = p.locator(`button:has-text("${label.source.replace(/\\\\/g, '\\')})" )`).first(); // regex→texto
        const c2 = p.locator('button', { hasText: label }).first();
        if (await c2.count()) { await c2.click().catch(() => {}); await p.waitForTimeout(1200); }
      }
      await p.waitForTimeout(5000);
    }
  }
  await p.waitForTimeout(2500); // polls/countdowns terminarem de assentar
  const snap = await p.evaluate(() => ({
    h1: document.querySelector('h1,h2,h4,[class*=title]')?.textContent?.slice(0, 60) ?? null,
    bodyLen: document.body.innerText.length,
    meetLink: !!document.querySelector('a[href*="meet.google"]'),
    text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 220),
  }));
  await p.screenshot({ path: `e2e/screenshots/qa-teleconsulta/${s.name}-${s.mode}-390.png`, fullPage: true });
  report.push({ cenario: `${s.name}/${s.mode}`, erros: errs.slice(0, 3), ...snap });
  await ctx.close();
}
await b.close();
for (const r of report) console.log(JSON.stringify(r));
console.log('screenshots em e2e/screenshots/qa-teleconsulta/');
