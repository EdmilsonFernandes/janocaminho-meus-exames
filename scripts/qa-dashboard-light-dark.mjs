import { chromium } from 'playwright';

const b = await chromium.launch();

for (const mode of ['light', 'dark']) {
  const page = await b.newPage({ viewport: { width: 390, height: 1400 } });

  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/exams?_start=0&_end=1&status=FAILED')) {
      await route.fulfill({ status: 200, headers: { 'X-Total-Count': '0' }, body: '[]' });
    } else if (url.includes('/exams?_start=0&_end=1&status=REJECTED')) {
      await route.fulfill({ status: 200, headers: { 'X-Total-Count': '0' }, body: '[]' });
    } else if (url.includes('/exams?_start=0&_end=1')) {
      await route.fulfill({
        status: 200,
        headers: { 'X-Total-Count': '5' },
        body: JSON.stringify([{ id: 'e-1', title: 'Hemograma Completo', performedAt: '2026-08-15T10:00:00Z' }]),
      });
    } else if (url.includes('/items/flag-summary')) {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ buckets: { bons: 18, alerta: 2, alterados: 1 } }),
      });
    } else if (url.includes('/health-summary')) {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          score: 84,
          byPriority: { importante: 1, moderada: 1 },
          cardiometabolicRisk: { level: 'baixo', factors: [] },
          markers: 21,
          worsening: [{ name: 'Glicose', nameCanonical: 'GLICOSE', unit: 'mg/dL', latest: { valueNumeric: 104 }, refHigh: 99, flag: 'HIGH' }],
          improving: [{ name: 'Colesterol Total', nameCanonical: 'COLESTEROL_TOTAL', unit: 'mg/dL', latest: { valueNumeric: 180 }, refHigh: 190, flag: 'NORMAL' }],
        }),
      });
    } else if (url.includes('/patients')) {
      await route.fulfill({
        status: 200,
        body: JSON.stringify([{ id: 'p-123', fullName: 'Edmilson Santos', profileCompleteness: { pct: 100, missing: [] } }]),
      });
    } else if (url.includes('/billing/status')) {
      await route.fulfill({ status: 200, body: JSON.stringify({ credits: 12 }) });
    } else if (url.includes('/measurements/since-exam')) {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          hasData: true,
          lastExamDate: '2026-08-15',
          habitChanges: [
            { metric: 'steps', label: 'Passos diários', emoji: '👟', unit: 'passos', from: 6500, to: 8200, deltaPct: 26, direction: 'up' },
          ],
          examChanges: [
            { name: 'Colesterol Total', direction: 'down', deltaPct: -5 },
          ],
        }),
      });
    } else if (url.includes('/patient-activities')) {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ items: [] }),
      });
    } else {
      await route.fulfill({ status: 200, body: '{}' });
    }
  });

  await page.addInitScript((m) => {
    localStorage.setItem('token', 'mock-token-123');
    localStorage.setItem('patientId', 'p-123');
    localStorage.setItem('selPatientId', 'p-123');
    localStorage.setItem('user', JSON.stringify({ id: 'u-123', fullName: 'Edmilson Santos', role: 'PATIENT' }));
    localStorage.setItem('onboarded', '1');
    localStorage.setItem('dx_goals_seen', '1');
    localStorage.setItem('dxGoals', JSON.stringify(['entender']));
    localStorage.setItem('whatsnew_2.7', '1');
    localStorage.setItem('whatsnew_2.7.173', '1');
    sessionStorage.setItem('profileSkippedSession', '1');
    localStorage.setItem('theme', m);
    localStorage.setItem('themeMode', m);
    localStorage.setItem('RaStore.theme', JSON.stringify(m));
  }, mode);

  await page.goto('http://localhost:5173/#/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `design-lab/qa/dash-compare-${mode}.png`, fullPage: true });
}

await b.close();
console.log('Screenshots generated successfully.');
