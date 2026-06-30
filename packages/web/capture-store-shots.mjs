// Gera 8 screenshots 9:16 (1080x1920) p/ Play Store, do app na 4011.
// Layout mobile: viewport CSS 540x960 (< breakpoint sm=600) + deviceScaleFactor 2.
// Navegação por CLIQUES (bottom-nav + menu): goto em rotas profundas cai no dashboard
// (bug de deep-link do app), mas navegar clicando funciona (react-router navigate()).
import { chromium } from 'playwright';
import { mkdirSync, readdirSync, unlinkSync } from 'fs';
import path from 'path';

const BASE = 'http://localhost:4011';
const OUT = path.join(process.cwd(), 'store-screenshots');
const DEV_USER = 'edmilson@exemplo.com', DEV_PASS = 'troque123';

const dismiss = async (page) => {
  for (const label of ['Pular', 'Depois', 'Agora não', 'Beleza', 'Entendi']) {
    try { await page.getByRole('button', { name: label }).first().click({ timeout: 700 }); } catch { /* overlay ausente */ }
  }
};
// Fecha QUALQUER dialog MUI (notification popup, etc.) — Escape + botão + remoção forçada.
const clearDialogs = async (page) => {
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(250);
  for (const lbl of ['Depois', 'Close', 'Fechar', 'Agora não', 'Pular']) {
    try { await page.getByRole('button', { name: lbl }).first().click({ timeout: 500 }); await page.waitForTimeout(200); } catch { /* ausente */ }
  }
  await page.evaluate(() => document.querySelectorAll('.MuiDialog-root, .MuiBackdrop-root').forEach((e) => e.remove())).catch(() => {});
};
const ready = async (page, extra = 1500) => {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForFunction(() => {
    const p = document.querySelectorAll('[role="progressbar"], .RaLoading, .RaLoading-page');
    return ![...p].some((e) => e.offsetParent !== null);
  }, { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(extra);
  await dismiss(page);
  await clearDialogs(page);
};
const snap = async (page, name) => {
  const text = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 180));
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`  ✓ ${name}\n     ${text || '(vazio)'}`);
};
const clickText = async (page, text) => {
  await clearDialogs(page);
  await page.getByText(text, { exact: true }).first().click({ timeout: 5000 });
  await ready(page, 2000);
};
const openMenu = async (page) => {
  await page.locator('[title="Menu"]').first().click({ timeout: 5000 });
  await page.waitForTimeout(700);
};
// Navegação via menu lateral — NÃO aperta Escape (fecharia o drawer recém-aberto).
const menuNav = async (page, item, section) => {
  await openMenu(page);
  if (section) {
    try { await page.getByText(section, { exact: true }).first().click({ timeout: 4000 }); await page.waitForTimeout(600); } catch { /* seção já aberta */ }
  }
  await page.getByText(item, { exact: true }).first().click({ timeout: 5000 });
  await ready(page, 2000);
};

(async () => {
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) if (f.endsWith('.png')) unlinkSync(path.join(OUT, f));

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 540, height: 960 },
    deviceScaleFactor: 2,
    isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
  });
  await context.route('**/sw.js', (r) => r.abort());
  const page = await context.newPage();

  console.log('Capturando...');
  // 1) Landing (anônimo)
  await page.goto(BASE + '/landing', { waitUntil: 'domcontentloaded' });
  await ready(page, 1500);
  await snap(page, '01-landing');

  // Login dev + dashboard
  const lr = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: DEV_USER, password: DEV_PASS }),
  });
  const data = await lr.json();
  if (!data.token) throw new Error('login dev falhou: ' + JSON.stringify(data));
  await page.evaluate((d) => {
    localStorage.setItem('token', d.token);
    if (d.patientId) { localStorage.setItem('patientId', d.patientId); localStorage.setItem('selPatientId', d.patientId); }
    localStorage.setItem('user', JSON.stringify(d.user));
    localStorage.setItem('onboarded', '1'); // desativa o tour de onboarding (interceptava cliques)
  }, data);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await ready(page, 2000);
  // O popup de notificação ("um valor precisa de atenção") aparece ~8s após o load.
  // Espera e fecha aqui pra não interceptar os cliques seguintes.
  await page.waitForSelector('.MuiDialog-root', { timeout: 10000, state: 'visible' }).catch(() => {});
  await clearDialogs(page);
  await page.waitForTimeout(500);
  await snap(page, '02-painel-dashboard');

  // Helper: cada tela em try/catch (uma falha não aborta as demais)
  const trySnap = async (name, fn) => {
    try { await fn(); await snap(page, name); }
    catch (e) { console.log(`  ✗ ${name} (${String(e).split('\n')[0].slice(0, 80)})`); }
  };

  // 3) Exames (bottom-nav)
  await trySnap('03-lista-exames', async () => { await clickText(page, 'Exames'); });

  // 4) Detalhe do exame (HashRouter: rota é #/exams/{id}/show; exame é o último card)
  await trySnap('04-detalhe-exame-ia', async () => {
    await clearDialogs(page);
    const n = await page.locator('.MuiCard-root').count();
    let ok = false;
    for (let i = Math.min(n, 6) - 1; i >= 0 && !ok; i--) {
      await page.locator('.MuiCard-root').nth(i).click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(1500);
      if (/#\/exams\/[^?]+\/show/.test(page.url())) ok = true;
    }
    if (!ok) throw new Error('nenhum card navegou pro detalhe');
    await ready(page, 2500);
  });
  // volta ao dashboard
  try { await clickText(page, 'Início'); } catch { /* já no dashboard */ }
  await page.waitForTimeout(300);

  // 5) Dr. Exame IA (bottom-nav)
  await trySnap('05-dr-exame-ia', async () => { await clickText(page, 'Dr. Exame'); });

  // 6) Evolução (bottom-nav)
  await trySnap('06-evolucao-graficos', async () => { await clickText(page, 'Evolução'); });

  // 7) Valores alterados (menu → acordeão "Minha Saúde")
  await trySnap('07-valores-alterados', async () => { await menuNav(page, 'Valores alterados', 'Minha Saúde'); });

  // 8) Relatório completo (menu → PRINCIPAIS, sempre visível)
  await trySnap('08-relatorio-completo', async () => { await menuNav(page, 'Relatório completo'); });

  await browser.close();
  console.log('Pronto. PNGs em', OUT);
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
