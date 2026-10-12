import { chromium } from 'playwright';

const b = await chromium.launch();

const viewports = [
  { name: 'desktop', width: 1280, height: 950 },
  { name: 'mobile', width: 390, height: 860 },
];

for (const vp of viewports) {
  const page = await b.newPage({ viewport: { width: vp.width, height: vp.height } });

  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/exams/email-upload-code')) {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ code: 'EX-6GVG', inbox: 'contato@janocaminho.com.br', enabled: true }),
      });
    } else if (url.includes('/public/config')) {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ freeSignup: 45 }),
      });
    } else if (url.includes('/auth/me')) {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ user: { id: 'u-1', fullName: 'Edmilson', firstExamBonusGranted: false } }),
      });
    } else if (url.includes('/patients')) {
      await route.fulfill({
        status: 200,
        body: JSON.stringify([{ id: 'p-1', fullName: 'Edmilson Santos' }]),
      });
    } else if (url.includes('/exams?_start=0&_end=1')) {
      await route.fulfill({
        status: 200,
        headers: { 'X-Total-Count': '0' },
        body: '[]',
      });
    } else {
      await route.fulfill({ status: 200, body: '{}' });
    }
  });

  await page.addInitScript(() => {
    localStorage.setItem('token', 'mock-token-123');
    localStorage.setItem('patientId', 'p-1');
    localStorage.setItem('selPatientId', 'p-1');
    localStorage.setItem('user', JSON.stringify({ id: 'u-1', fullName: 'Edmilson Santos', role: 'PATIENT' }));
    localStorage.setItem('meus_exames_upload_disclosure_v1', 'accepted');
    localStorage.setItem('onboarded', '1');
    localStorage.setItem('dx_goals_seen', '1');
    localStorage.setItem('dxGoals', JSON.stringify(['entender']));
    localStorage.setItem('whatsnew_2.7', '1');
    localStorage.setItem('whatsnew_2.7.173', '1');
    sessionStorage.setItem('profileSkippedSession', '1');
    localStorage.setItem('theme', 'light');
    localStorage.setItem('themeMode', 'light');
    localStorage.setItem('RaStore.theme', JSON.stringify('light'));
  });

  try {
    await page.goto('http://localhost:5173/#/exams/create', { waitUntil: 'networkidle', timeout: 30000 });
    
    // Espera a tela de envio carregar e sair o boot splash
    await page.waitForSelector('text=Enviar exames', { timeout: 20000 });
    await page.waitForTimeout(1000);

    // 1. Screenshot Aba: Upload
    await page.screenshot({ path: `design-lab/qa/exam-create-${vp.name}-upload.png`, fullPage: true });
    console.log(`Captured exam-create-${vp.name}-upload.png`);

    // 2. Alterna para Aba: E-mail
    const emailTabBtn = page.locator('button:has-text("Encaminhar por E-mail")');
    await emailTabBtn.click();
    await page.waitForSelector('text=Encaminhe direto do seu e-mail', { timeout: 5000 });
    await page.waitForTimeout(600);

    await page.screenshot({ path: `design-lab/qa/exam-create-${vp.name}-email.png`, fullPage: true });
    console.log(`Captured exam-create-${vp.name}-email.png`);
  } catch (err) {
    console.error(`Error on ${vp.name}:`, err.message);
  } finally {
    await page.close();
  }
}

await b.close();
