// Captura prints extras p/ slides (notificações, segurança, suporte) — 9:16, 1080x1920.
// Roda contra o vite dev (5174) -> API 4001. Mesmo padrão do capture-store-shots.
import { chromium } from 'playwright';
import { mkdirSync, readdirSync, unlinkSync } from 'fs';
import path from 'path';

const WEB = 'http://localhost:5174';
const API = 'http://localhost:4001/api';
const OUT = path.join(process.cwd(), 'store-screenshots');
const DEV_USER = 'edmilson@exemplo.com', DEV_PASS = 'troque123';

const dismiss = async (page) => { for (const l of ['Pular', 'Depois', 'Agora não', 'Beleza', 'Entendi']) { try { await page.getByRole('button', { name: l }).first().click({ timeout: 600 }); } catch {} } };
const ready = async (page, extra = 1500) => { await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(extra); await dismiss(page); };
const snap = async (page, name) => { const text = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 140)); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); console.log(`  ✓ ${name} — ${text || '(vazio)'}`); };
const clickText = async (page, text) => { await page.getByText(text, { exact: true }).first().click({ timeout: 5000 }).catch(() => {}); await ready(page, 1500); };

(async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await context.route('**/sw.js', (r) => r.abort());
  const page = await context.newPage();

  await page.goto(WEB + '/', { waitUntil: 'domcontentloaded' });
  const lr = await fetch(API + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: DEV_USER, password: DEV_PASS }) });
  const d = await lr.json();
  await page.evaluate((dd) => { localStorage.setItem('token', dd.token); localStorage.setItem('user', JSON.stringify(dd.user)); if (dd.patientId) { localStorage.setItem('patientId', dd.patientId); localStorage.setItem('selPatientId', dd.patientId); } localStorage.setItem('onboarded', '1'); }, d);

  console.log('Capturando extras...');
  // 09 - Notificações
  await page.goto(WEB + '/#/notificacoes', { waitUntil: 'domcontentloaded' }); await ready(page, 2000); await snap(page, '09-notificacoes');
  // 10 - Segurança (MFA / biometria / LGPD)
  await page.goto(WEB + '/#/seguranca', { waitUntil: 'domcontentloaded' }); await ready(page, 2000); await snap(page, '10-seguranca-mfa-biometria');
  // 11 - Suporte (chamados)
  await page.goto(WEB + '/#/suporte', { waitUntil: 'domcontentloaded' }); await ready(page, 2000); await snap(page, '11-suporte-chamados');
  // 12 - Portal do Médico (tela de entrada da área médica; dados do paciente exigem compartilhamento)
  await page.goto(WEB + '/#/doctor', { waitUntil: 'domcontentloaded' }); await ready(page, 2500); await snap(page, '12-portal-medico');

  await browser.close();
  console.log('Pronto. PNGs em', OUT);
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
