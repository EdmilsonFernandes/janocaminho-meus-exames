// E1.4 — substância DECLARADA via Medication (zero migration). O name prefixado pela
// classe ("[Hormônio] Testosterona") tem que: (1) criar/ler pelo CRUD existente,
// (2) aparecer no bloco de contexto da IA, (3) continuar casando interações por
// palavra inteira (o prefixo não quebra o match).
import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser } from './helpers';
import { prisma } from '../src/prisma';
import { medicationsContextBlock } from '../src/analysis/medications-context';
import { matchInteractions } from '../src/utils/interactions';

describe('sports: substância declarada via Medication (E1.4)', () => {
  beforeEach(async () => { await resetDb(); });

  it('E2E: cria Medication prefixada (form do modo esportivo) e lista de volta', async () => {
    const { user, patient, token } = await createUser();
    const r = await api().post('/api/medications').set(authHeader(token)).send({
      patientId: patient.id,
      name: '[Hormônio] Testosterona (enantato)',
      dosage: '250mg/semana — declarado pelo paciente',
      startedAt: '2026-03-01',
    });
    expect(r.status).toBe(201);
    expect(r.body.name).toBe('[Hormônio] Testosterona (enantato)');

    const list = await api().get(`/api/medications?patientId=${patient.id}`).set(authHeader(token));
    expect(list.status).toBe(200);
    const mine = list.body.filter((m: any) => m.patientId === patient.id);
    expect(mine.some((m: any) => m.name.startsWith('[Hormônio]'))).toBe(true);

    // entra como medicação ATIVA do paciente (contexto da IA)
    const active = await prisma.medication.findMany({ where: { patient: { ownerId: user.id }, active: true } });
    expect(active.some((m) => m.name.includes('Testosterona'))).toBe(true);
  });

  it('contexto da IA: nome prefixado entra no bloco MEDICAÇÕES ATIVAS com a data de início', () => {
    const block = medicationsContextBlock([{ name: '[Suplemento] Creatina', startedAt: new Date('2026-09-01T00:00:00Z') }]);
    expect(block).toContain('MEDICAÇÕES ATIVAS');
    expect(block).toContain('[Suplemento] Creatina');
    expect(block).toContain('desde');
  });

  it('interações: o prefixo de classe NÃO quebra o match por palavra inteira', () => {
    const rules = [{ drugA: 'TESTOSTERONA', drugB: 'VARFARINA', severity: 'C', effect: 'x', recommendation: 'y' }];
    const hits = matchInteractions(
      [{ name: '[Hormônio] Testosterona (enantato)' }, { name: 'Marevan' }],
      rules,
    );
    expect(hits.length).toBe(1);
    expect(hits[0].matchedA).toBe('[Hormônio] Testosterona (enantato)');
  });
});
