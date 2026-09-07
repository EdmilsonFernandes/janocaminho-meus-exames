import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, createUser, resetDb } from './helpers';

/** "Ver fontes" do RiskCard — evidência citada (knowledge/*.md curado, skill medical-research). */
describe('GET /api/risk/sources', () => {
  beforeEach(resetDb);

  it('devolve as fontes datadas da condição (lê o card curado direto)', async () => {
    const u = await createUser();
    const r = await api().get('/api/risk/sources?condition=diabetes').set(authHeader(u.token));
    expect(r.status).toBe(200);
    expect(r.body.condition).toBe('diabetes');
    expect(Array.isArray(r.body.sources)).toBe(true);
    expect(r.body.sources.length).toBeGreaterThan(0);
    // formato do protocolo: PMID + data de consulta
    expect(r.body.sources.join(' ')).toMatch(/PMID/);
    expect(r.body.sources.join(' ')).toMatch(/consultado \d{4}-\d{2}-\d{2}/);
  });

  it('condição desconhecida → lista vazia (nunca path arbitrário)', async () => {
    const u = await createUser();
    const r = await api().get('/api/risk/sources?condition=../../../etc/passwd').set(authHeader(u.token));
    expect(r.status).toBe(200);
    expect(r.body.sources).toEqual([]);
  });

  it('exige autenticação', async () => {
    const r = await api().get('/api/risk/sources?condition=diabetes');
    expect(r.status).toBe(401);
  });
});
