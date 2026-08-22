/**
 * QA visual ISOLADO do Lote 2b: página pública "Como validamos" + quiz-first onboarding.
 *   node scripts/qa-lote2b-visual.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const WEB = 'http://localhost:5173';
const API = 'http://localhost:4001/api';
const OUT = 'design-lab/qa';
const EMAIL = process.env.SEED_EMAIL || 'edmilson@exemplo.com';
const PASS = process.env.SEED_PASSWORD || 'troque123';

fs.mkdirSync(OUT, { recursive: true });

// A · Página pública /como-validamos — SEM login
{
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${WEB}/#/como-validamos`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const checks = ['Como validamos', 'Harriet Lane', 'RDC', 'LGPD', 'nunca faz', 'Criar conta grátis'];
  let ok = true;
  for (const t of checks) {
    const n = await page.locator(`text=${t}`).count();
    if (!n) ok = false;
    console.log(`página "Como validamos" contém "${t}":`, n > 0 ? '✓' : 'FALHOU');
  }
  await page.screenshot({ path: `${OUT}/l2b-01-como-validamos.png`, fullPage: true });
  console.log('página pública renderiza:', ok ? 'OK' : 'FALHOU');
  await browser.close();
}

// B · Quiz onboarding (1x por dispositivo, depois de tour/perfil fecharem)
{
  const login = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASS }) });
  const { token: jwt } = await login.json();
  const H = { Authorization: `Bearer ${jwt}` };
  // Popup de notificação abre com 2.5s de delay — marca tudo lido (QA determinístico).
  const notifs = await (await fetch(`${API}/notifications`, { headers: H })).json();
  for (const n of notifs.items ?? []) await fetch(`${API}/notifications/${n.id}/read`, { method: 'PATCH', headers: H }).catch(() => {});

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript((t) => { localStorage.setItem('token', t); }, jwt);
  await page.goto(`${WEB}/#/`, { waitUntil: 'domcontentloaded' });

  // Tour (1ª visita): Pular. CUIDADO: o GoalQuiz também tem "Pular" — assim que o quiz
  // aparece, o loop PARA (senão ele mesmo mata o quiz com lista vazia).
  await page.waitForTimeout(1800);
  for (let i = 0; i < 10; i++) {
    if (await page.locator('text=O que você quer entender?').count()) break;
    let acted = false;
    for (const name of ['Pular', 'Depois', 'Próximo']) {
      const btn = page.getByRole('button', { name: new RegExp(`^${name}`, 'i') }).first();
      if (await btn.isVisible().catch(() => false)) { await btn.click({ force: true, timeout: 1500 }).catch(() => {}); acted = true; await page.waitForTimeout(450); break; }
    }
    if (!acted) break;
  }

  // Quiz deve abrir quando nenhum dialog estiver mais aberto (checa a cada 1.2s, até 12s)
  let quizOk = false;
  try {
    await page.locator('text=O que você quer entender?').first().waitFor({ state: 'visible', timeout: 14000 });
    quizOk = true;
  } catch { /* fica false */ }
  console.log('quiz abriu (sem empilhar):', quizOk ? 'OK' : 'FALHOU');
  if (!quizOk) {
    // Diagnóstico: o que tem aberto / salvo no momento da falha
    const diag = await page.evaluate(() => ({
      dialogs: Array.from(document.querySelectorAll('.MuiDialog-root')).map((d) => d.textContent?.slice(0, 80)),
      dxGoals: localStorage.getItem('dxGoals'),
      onboarded: localStorage.getItem('onboarded'),
      url: location.hash,
      bodyHas: document.body.textContent?.slice(0, 120),
    }));
    console.log('DIAG:', JSON.stringify(diag, null, 2));
    await page.screenshot({ path: `${OUT}/l2b-02b-diag.png` });
  }
  if (quizOk) {
    await page.screenshot({ path: `${OUT}/l2b-02-quiz.png` });
    await page.locator('text=Entender o que meus exames significam').first().click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/l2b-03-quiz-selecionado.png` });
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.waitForTimeout(800);
    const saved = await page.evaluate(() => localStorage.getItem('dxGoals'));
    console.log('dxGoals salvo:', saved?.includes('entender') ? 'OK' : `FALHOU (${saved})`);
    const quizGone = await page.locator('text=O que você quer entender?').count();
    console.log('quiz fechou:', quizGone === 0 ? 'OK' : 'FALHOU');
  }

  // Recarrega: quiz NÃO pode voltar (1x por dispositivo)
  await page.goto(`${WEB}/#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const quizAgain = await page.locator('text=O que você quer entender?').count();
  console.log('quiz não reabre após reload:', quizAgain === 0 ? 'OK' : 'FALHOU');
  await browser.close();
}

console.log('Screenshots em', OUT);
