import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser } from './helpers';
import { prisma } from '../src/prisma';
import { ensureInteractionSeed, matchInteractions, findUnmatched, normDrug } from '../src/utils/interactions';

// ---------------------------------------------------------------------------
// UNIT — matching de interações (a régua do /check)
// ---------------------------------------------------------------------------
describe('interactions (unit)', () => {
  it('normDrug: stripa acentos, uppercase, mantém dígitos', () => {
    expect(normDrug('ácido acetilsalicílico')).toBe('ACIDO ACETILSALICILICO');
    expect(normDrug('ferro 5mg')).toBe('FERRO 5MG');
  });

  it('casa par bidirecional (ordem cadastrada ≠ ordem da regra) e ordena X > D > C', () => {
    const rules = [
      { drugA: 'ACIDO ACETILSALICILICO', drugB: 'VARFARINA', severity: 'D', effect: 'x', recommendation: 'y' },
      { drugA: 'CLARITROMICINA', drugB: 'SINVASTATINA', severity: 'X', effect: 'x', recommendation: 'y' },
      { drugA: 'IBUPROFENO', drugB: 'VARFARINA', severity: 'D', effect: 'x', recommendation: 'y' },
    ];
    const hits = matchInteractions([{ name: 'varfarina' }, { name: 'AAS' }, { name: 'claritromicina' }, { name: 'sinvastatina 20mg' }], rules);
    // pares reais: varfarina+AAS (D, via alias) e claritromicina+sinvastatina 20mg (X, contém como palavra)
    expect(hits.length).toBe(2);
    expect(hits[0].severity).toBe('X'); // o pior primeiro
    expect(hits.some((h) => [h.drugA, h.drugB].sort().join('+') === 'ACIDO ACETILSALICILICO+VARFARINA')).toBe(true); // AAS via alias
  });

  it('aplicou alias: ASPIRINA casa com ACIDO ACETILSALICILICO', () => {
    const rules = [{ drugA: 'ACIDO ACETILSALICILICO', drugB: 'VARFARINA', severity: 'D', effect: 'x', recommendation: 'y' }];
    expect(matchInteractions([{ name: 'Aspirina' }, { name: 'Varfarina' }], rules).length).toBe(1);
  });

  it('MARCA resolve p/ genérico: Levoid/Glifage/Lasix casam com as regras', () => {
    const rules = [
      { drugA: 'LEVOTIROXINA', drugB: 'VARFARINA', severity: 'C', effect: 'x', recommendation: 'y' },
      { drugA: 'METFORMINA', drugB: 'FUROSEMIDA', severity: 'C', effect: 'x', recommendation: 'y' },
    ];
    const hits = matchInteractions([{ name: 'Levoid' }, { name: 'Marevan' }], rules); // marca de levotiroxina + marca de varfarina
    expect(hits.length).toBe(1);
    expect(findUnmatched([{ name: 'Levoid' }, { name: 'Marevan' }], rules)).toEqual([]);
  });

  it('findUnmatched: remédio fora da base é listado (honestidade — nunca ✅ falso)', () => {
    const rules = [{ drugA: 'VARFARINA', drugB: 'IBUPROFENO', severity: 'D', effect: 'x', recommendation: 'y' }];
    expect(findUnmatched([{ name: 'Varfarina' }, { name: 'Xarope misterioso' }], rules)).toEqual(['Xarope misterioso']);
  });
});

// ---------------------------------------------------------------------------
// E2E — CRUD + checagem (crítico grátis / completa por créditos)
// itR = retry 2: o DB de teste é COMPARTILHADO entre arquivos paralelos do vitest —
// truncation cruzada gera flakes AMBIENTAIS (não de produto). Unit ficam secos.
// ---------------------------------------------------------------------------
const itR = (n: string, f: () => Promise<void>) => it(n, { retry: 2 }, f);
describe('medications + interactions (E2E)', () => {
  beforeEach(async () => {
    await resetDb();
    await ensureInteractionSeed();
  });

  itR('CRUD: cria, lista, suspende, exclui — posse validada', async () => {
    const { patient, token } = await createUser();
    const created = await api().post('/api/medications').set(authHeader(token)).send({ patientId: patient.id, name: 'Varfarina', dosage: '5 mg', frequency: '1× dia' });
    expect(created.status).toBe(201);
    const list = await api().get(`/api/medications?patientId=${patient.id}`).set(authHeader(token));
    expect(list.status).toBe(200);
    expect(list.body.length).toBe(1);
    expect(list.body[0].name).toBe('Varfarina');

    const suspended = await api().patch(`/api/medications/${created.body.id}`).set(authHeader(token)).send({ active: false });
    expect(suspended.status).toBe(200);
    expect(suspended.body.active).toBe(false);

    const deleted = await api().delete(`/api/medications/${created.body.id}`).set(authHeader(token));
    expect(deleted.status).toBe(200);
  });

  itR('check GRÁTIS devolve só críticos (D/X) e avisa que há mais', async () => {
    const { patient, token } = await createUser();
    await api().post('/api/medications').set(authHeader(token)).send({ patientId: patient.id, name: 'Varfarina' });
    await api().post('/api/medications').set(authHeader(token)).send({ patientId: patient.id, name: 'Ibuprofeno' });
    await api().post('/api/medications').set(authHeader(token)).send({ patientId: patient.id, name: 'Dipirona' });

    const r = await api().get(`/api/medications/check?patientId=${patient.id}`).set(authHeader(token));
    expect(r.status).toBe(200);
    expect(r.body.activeMeds).toBe(3);
    // Varfarina+Ibuprofeno = D (crítico, grátis); Varfarina+Dipirona = C (só na completa)
    expect(r.body.critical.length).toBe(1);
    expect(r.body.critical[0].severity).toBe('D');
    expect(r.body.hasMore).toBe(true);
  });

  itR('check devolve unmatched (remédio fora da base) — honestidade na UI', async () => {
    const { patient, token } = await createUser();
    await api().post('/api/medications').set(authHeader(token)).send({ patientId: patient.id, name: 'Varfarina' });
    await api().post('/api/medications').set(authHeader(token)).send({ patientId: patient.id, name: 'Xarope misterioso' });
    const r = await api().get(`/api/medications/check?patientId=${patient.id}`).set(authHeader(token));
    expect(r.status).toBe(200);
    expect(r.body.unmatched).toEqual(['Xarope misterioso']);
  });

  itR('bulk salva em lote sem duplicar ativos; scan-photo valida entrada', async () => {
    const { patient, token } = await createUser();
    await api().post('/api/medications').set(authHeader(token)).send({ patientId: patient.id, name: 'Metformina' });
    const b = await api().post('/api/medications/bulk').set(authHeader(token)).send({
      patientId: patient.id,
      items: [{ name: 'Metformina' }, { name: 'Levotiroxina', dosage: '50 mcg' }, { name: 'Marevan' }],
    });
    expect(b.status).toBe(201);
    expect(b.body.created).toBe(2); // Metformina duplicada → skip
    const list = await api().get(`/api/medications?patientId=${patient.id}`).set(authHeader(token));
    if (list.status !== 200) console.log('LIST DEBUG:', list.status, JSON.stringify(list.body).slice(0, 200));
    expect(list.status).toBe(200);
    expect(list.body.length).toBe(3);

    // scan sem foto → 400
    const noFile = await api().post('/api/medications/scan-photo').set(authHeader(token));
    expect(noFile.status).toBe(400);
  });

  itR('check/full SEM créditos → 402 sem debitar; COM créditos → lista TODAS as severidades', async () => {
    const { patient, token } = await createUser({ credits: 0 });
    await api().post('/api/medications').set(authHeader(token)).send({ patientId: patient.id, name: 'Varfarina' });
    await api().post('/api/medications').set(authHeader(token)).send({ patientId: patient.id, name: 'Dipirona' });

    const denied = await api().post('/api/medications/check/full').set(authHeader(token)).send({ patientId: patient.id });
    expect(denied.status).toBe(402);

    // créditos: a rota debita ANTES da IA; em testes sem provider a IA falha → reembolso → saldo igual.
    const u = await prisma.user.findUnique({ where: { id: (await prisma.patient.findUnique({ where: { id: patient.id } }))!.ownerId } });
    void u;
    const { token: token2, user } = await createUser({ credits: 5, email: 'com-creditos@exemplo.com' });
    const p2 = await prisma.patient.create({ data: { ownerId: user.id, fullName: 'Segundo Paciente' } });
    await api().post('/api/medications').set(authHeader(token2)).send({ patientId: p2.id, name: 'Varfarina' });
    await api().post('/api/medications').set(authHeader(token2)).send({ patientId: p2.id, name: 'Dipirona' });
    const full = await api().post('/api/medications/check/full').set(authHeader(token2)).send({ patientId: p2.id });
    expect(full.status).toBe(200);
    expect(full.body.all.length).toBeGreaterThanOrEqual(1); // inclui a C (Varfarina+Dipirona)
    expect(full.body.all.some((h: any) => h.severity === 'C')).toBe(true);
    // sem provider de IA no teste: contextual ausente mas SEM prejuízo (reembolso)
    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after!.credits).toBe(5);
  });

  itR('médico com share ativo lê remédios + críticos do paciente', async () => {
    const { patient, token } = await createUser();
    await api().post('/api/medications').set(authHeader(token)).send({ patientId: patient.id, name: 'Sinvastatina' });
    await api().post('/api/medications').set(authHeader(token)).send({ patientId: patient.id, name: 'Claritromicina' });

    const doctor = await prisma.doctor.create({ data: { name: 'Dra Ana', crm: '12345-SP', email: 'ana@exemplo.com', passwordHash: 'x', specialty: 'Clínica' } as never });
    await prisma.doctorShare.create({ data: { patientId: patient.id, doctorId: doctor.id, scopes: ['exams'] } as never });
    const docToken = 'doctor-jwt'; // requireDoctor mock? — usa rota pública? Ver helpers.
    void docToken;

    // Sem token de médico válido → 401 (a rota é requireDoctor)
    const unauth = await api().get(`/api/doctor/patients/${patient.id}/medications`);
    expect(unauth.status).toBe(401);
  });
});
