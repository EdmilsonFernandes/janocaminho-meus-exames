/**
 * QA visual ISOLADO do Lote 2 (modo cuidador + badge pediátrico + onboarding do dependente).
 * Browser próprio — não briga com o Playwright MCP da sessão paralela.
 *   node scripts/qa-lote2-visual.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const WEB = 'http://localhost:5173';
const API = 'http://localhost:4001/api';
const OUT = 'design-lab/qa';
const EMAIL = process.env.SEED_EMAIL || 'edmilson@exemplo.com';
const PASS = process.env.SEED_PASSWORD || 'troque123';

fs.mkdirSync(OUT, { recursive: true });

const login = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASS }) });
if (!login.ok) { console.error('login falhou:', login.status); process.exit(1); }
const { token: jwt } = await login.json();
const H = { Authorization: `Bearer ${jwt}` };

// Popup de notificação (NotificationPopup) abre com delay 2.5s quando há não-lida recente —
// exatamente a corrida que cobria os screenshots. Marca tudo como lido: unread=0 → nunca arma.
const notifs = await (await fetch(`${API}/notifications`, { headers: H })).json();
for (const n of notifs.items ?? []) {
  await fetch(`${API}/notifications/${n.id}/read`, { method: 'PATCH', headers: H }).catch(() => {});
}

const patients = await (await fetch(`${API}/patients`, { headers: H })).json();
const theo = patients.find((p) => p.fullName === 'Theo Teste');
if (!theo) { console.error('Rode scripts/seed-pediatric-demo.ts antes.'); process.exit(1); }
const exams = await (await fetch(`${API}/exams?patientId=${theo.id}`, { headers: H }).then((r) => r.json()));
const exam = (Array.isArray(exams) ? exams : [])[0];
console.log('Theo:', theo.id, '· exame:', exam?.id);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
// QA determinístico: conquistas (heartbeat + list) abrem o popup "Conquista: Saudável" com
// timing variável por cima de TUDO, e cada page.goto é um boot completo (tour + popup voltam).
// Bloquear TODAS as respostas de /achievements mata o popup na fonte — não interfere com
// faixa/badges (endpoints distintos).
await page.route('**/api/achievements/**', (route) => route.fulfill({ json: {} }));
await page.addInitScript(([t, pid]) => { localStorage.setItem('token', t); localStorage.setItem('selPatientId', pid); }, [jwt, theo.id]);

// 1 · Dashboard (Theo selecionado)
await page.goto(`${WEB}/#/`, { waitUntil: 'domcontentloaded' });

// 1a · Se o ONBOARDING abriu pro dependente (perfil incompleto) → captura + "Agora não"
const dialog = page.locator('.MuiDialog-root').first();
try {
  await dialog.waitFor({ state: 'visible', timeout: 8000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/l2-00-onboarding-dependente.png` });
  const passo = await page.locator('text=/Passo \\d+ de \\d+/').first().textContent().catch(() => '—');
  console.log('onboarding do dependente abriu:', passo);
  await page.getByRole('button', { name: 'Agora não' }).click();
  await page.waitForTimeout(800);
} catch { console.log('onboarding: não abriu (perfil completo)'); }

// 1b · Faixa do cuidador (espera de verdade)
// O boot pode abrir popup de conquista ("Depois") e/ou tour ("Próximo") por cima —
// dispensa ambos antes de tirar screenshot/checar, senão a foto só mostra o overlay.
const dismissOverlays = async () => {
  // Tour ("Pular" termina TUDO de uma vez) + popup de conquista ("Depois"). force:true é
  // essencial: com tour e conquista empilhados, o backdrop do tour intercepta o click normal.
  for (let i = 0; i < 10; i++) {
    let acted = false;
    for (const name of ['Pular', 'Depois', 'Próximo']) {
      const btn = page.getByRole('button', { name: new RegExp(`^${name}`, 'i') }).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click({ force: true, timeout: 1500 }).catch(() => {});
        acted = true;
        await page.waitForTimeout(450);
        break;
      }
    }
    if (!acted) break;
  }
};
await page.waitForTimeout(1500);
await dismissOverlays();
let stripOk = false;
try {
  await page.locator('text=Você está cuidando de').first().waitFor({ state: 'visible', timeout: 10000 });
  stripOk = true;
} catch { /* fica false */ }
const pidFinal = await page.evaluate(() => localStorage.getItem('selPatientId'));
console.log('selPatientId após boot:', pidFinal === theo.id ? 'Theo ✓ (stomp corrigido)' : `${pidFinal} ✗`);
// Conquista pode (re)abrir após o heartbeat — dispensa DE NOVO antes da foto.
await dismissOverlays();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/l2-01-dashboard-cuidador.png` });
console.log('faixa cuidador:', stripOk ? 'OK' : `NÃO ENCONTRADA (url: ${page.url()})`);

// 2 · Exame do Theo direto pela URL → badges pediátricos
if (exam) {
  await page.goto(`${WEB}/#/exams/${exam.id}/show`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await dismissOverlays();
  await page.waitForTimeout(900);   // boot completo reabre tour/popup — segundo sweep pega os atrasados
  await dismissOverlays();
  await page.screenshot({ path: `${OUT}/l2-02-exame-detalhe.png` });
  const badges = await page.locator('text=Pediátrico ·').count();
  console.log('badges pediátricos no detalhe:', badges);
  if (badges > 0) {
    const chip = page.locator('text=Pediátrico ·').first();
    await chip.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/l2-03-badge-closeup.png` });
  }
}

// 3 · Controle: titular → SEM faixa
const titular = patients.find((p) => p.relationship === 'Titular') || patients[0];
await page.evaluate((pid) => { localStorage.setItem('selPatientId', pid); }, titular.id);
await page.goto(`${WEB}/#/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await dismissOverlays();
await page.screenshot({ path: `${OUT}/l2-04-dashboard-titular-controle.png` });
const stripTitular = await page.locator('text=Você está cuidando de').count();
console.log('titular sem faixa (controle):', stripTitular === 0 ? 'OK' : 'FALHOU — apareceu pro titular');

await browser.close();
console.log('Screenshots em', OUT);
