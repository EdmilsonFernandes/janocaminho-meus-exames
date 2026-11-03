// QA UX dashboard (briefing 03/11): card de consulta com FOTO do médico (payload
// doctor.photoUrl — mesma fonte da Agenda) × fallback iniciais; + screenshots de
// créditos/conquistas/ações rápidas para o diagnóstico das áreas 4/5.
// Uso: node e2e/qa-ux-dashboard.mjs [base-web]
import { chromium } from 'playwright';

const API = 'https://janocaminho.com.br/minhasaude/api';
const WEB = process.argv[2] || 'https://drexame.janocaminho.com.br';
const iso = (min) => new Date(Date.now() + min * 60000).toISOString();
const PHOTO = 'https://drexame.janocaminho.com.br/app-icon.png'; // foto de TESTE (pública, não é dado real)

const baseReminders = (photo) => ([
  { id: 'qa-tele-foto', patientId: 'p1', type: 'teleconsulta', title: 'Consulta de retorno', dueDate: iso(180), createdAt: iso(-2880), consentAt: iso(-10), endedAt: null, done: false, linkUrl: null, consultPriceCents: 0, paidAt: null, consultSummaryApproved: false, createdByDoctorId: 'dqa-1',
    doctor: { id: 'dqa-1', name: 'Daniel Shirane', crm: '123456', crmUf: 'SP', specialty: 'Endocrinologia', ...(photo ? { photoUrl: PHOTO } : {}) } },
]);
const me = { id: 'u1', name: 'QA Dono', email: 'qa@x', credits: 96636, planExpiresAt: null, trialUsedAt: null, reportVouchers: 0, firstExamBonusGranted: true };

const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'qa.dono.271026@gmail.com', password: 'QaDono@2026' }) });
const { token } = await r.json();

const b = await chromium.launch();
const report = [];
for (const [name, withPhoto] of [['com-foto', true], ['fallback-iniciais', false]]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message.slice(0, 150)));
  // DISPATCHER ÚNICO (catch-all engolia os mocks específicos — ordem de routes do
  // Playwright não é confiável entre versões): um handler decide pela URL.
  await ctx.route('**/api/**', (rt) => {
    const u = rt.request().url();
    const j = (body) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: { 'Access-Control-Allow-Origin': '*' } }); // CORS: dev (localhost) precisa — fulfill sem ACAO era bloqueado pelo browser
    if (u.includes('/api/reminders')) return j(baseReminders(withPhoto));
    if (u.includes('/api/measurements/activity-summary')) return j({ metrics: { STEPS: { series30: [] }, CALORIES: { series30: [] }, DISTANCE: { series30: [] }, HEART_RATE: { series30: [] } }, lastSyncAt: null });
    if (u.includes('/api/billing/status')) return j({ active: false, planExpiresAt: null, examsCount: 3, freeExamLimit: 1, credits: 96636, tokensUsed: 0, trialAvailable: false, reportVouchers: 0, firstExamBonusGranted: true });
    if (u.includes('/api/achievements')) return j({
      badges: [
        { id: 'first_exam', emoji: '🧪', title: 'Primeiro exame', desc: 'Envie seu primeiro exame', metric: 'exams', threshold: 1, reward: 1, earned: true, progress: 1, claimed: true },
        { id: 'streak7', emoji: '🔥', title: 'Sete dias seguidos', desc: 'Abra o app 7 dias seguidos', metric: 'streak', threshold: 7, reward: 1, earned: false, progress: 4 / 7, claimed: false },
        { id: 'score5', emoji: '⭐', title: 'Cinco análises', desc: 'Use a IA 5 vezes', metric: 'ai', threshold: 5, reward: 1, earned: false, progress: 2 / 5, claimed: false },
      ], streak: 4, creditsClaimed: 1, creditsAvailable: 8, balance: 96636, achievementAlerts: true, monthLabel: 'novembro de 2026' });
    return j({});
  });
  await p.addInitScript((t) => { localStorage.setItem('token', t); localStorage.setItem('selPatientId', 'p1'); localStorage.setItem('dx.dashV2', '1'); }, token);
  await p.goto(`${WEB}/#/`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await p.waitForSelector('text=Shirane', { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(2500);
  const info = await p.evaluate(() => {
    const card = [...document.querySelectorAll('.MuiCard-root')].find((c) => c.textContent?.includes('Shirane'));
    const av = card?.querySelector('.MuiAvatar-root, img');
    return {
      hasCard: !!card,
      titleInPage: document.body.innerText.includes('Consulta de retorno'),
      shiraneAnywhere: document.body.innerText.includes('Shirane'),
      telePill: document.body.innerText.includes('Entrar na consulta'),
      avatarSrc: (av?.getAttribute('src') || av?.querySelector('img')?.getAttribute('src') || '')?.slice(0, 70),
      avatarInitial: card?.querySelector('.MuiAvatar-root')?.textContent?.trim() ?? null,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  await p.screenshot({ path: `e2e/screenshots/qa-ux-dashboard/${name}-390.png`, fullPage: true });
  report.push({ name, erros: errs.slice(0, 2), ...info });
  await ctx.close();
}
await b.close();
for (const x of report) console.log(JSON.stringify(x));
console.log('screenshots em e2e/screenshots/qa-ux-dashboard/');
