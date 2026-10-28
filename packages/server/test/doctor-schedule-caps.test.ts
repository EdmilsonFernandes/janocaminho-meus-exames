// GET /doctor/google/status devolve o MÍNIMO da cobrança da teleconsulta (27/10/26):
// o diálogo de agendar mostra/valida no campo — antes o médico só descobria no 400
// (e o toast do erro ficava atrás do diálogo).
import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createDoctor } from './helpers';
import { loadSettings, saveSettings } from '../src/utils/settings';

describe('doctor: capacidades de agendamento (google/status)', () => {
  beforeEach(async () => {
    await resetDb();
    await loadSettings();
  });

  it('expõe priceMinCents = default (R$ 20,00) junto das capacidades de chamada', async () => {
    const { token } = await createDoctor({ crm: '77001-SP', email: 'caps1@t.com' });
    const r = await api().get('/api/doctor/google/status').set(authHeader(token));
    expect(r.status).toBe(200);
    expect(r.body.priceMinCents).toBe(2000);
    expect(typeof r.body.livekit).toBe('boolean');
  });

  it('segue o ajuste do admin (AppSetting teleconsulta.priceMinCents)', async () => {
    await saveSettings('teleconsulta', { priceMinCents: 3000 });
    const { token } = await createDoctor({ crm: '77002-SP', email: 'caps2@t.com' });
    const r = await api().get('/api/doctor/google/status').set(authHeader(token));
    expect(r.body.priceMinCents).toBe(3000);
    await saveSettings('teleconsulta', { priceMinCents: 2000 }); // devolve o default
  });
});
