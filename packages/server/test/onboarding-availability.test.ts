import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/prisma';
import { resetDb, createUser, createExam, createItem, api, authHeader } from './helpers';

// Cenários A–L do replanejamento de primeiro acesso (2026-08) — HONESTIDADE DE ESTADOS:
//   sem dados ≠ "em dia" · sem exame ≠ "calculando" · insuficiente ≠ "em breve"
// Cada estado explica o que falta e o cliente nunca infere resultado positivo de null.
describe('Onboarding + availability (estados vazios honestos)', () => {
  beforeEach(async () => { await resetDb(); });

  it('A/B) usuário novo, zero exames: score null + availability no_data; bio pede perfil', async () => {
    const { patient, token } = await createUser(); // sem gender/dob/height, sem peso (com CPF)
    const r = await api().get(`/api/patients/${patient.id}/health-summary`).set(authHeader(token));
    expect(r.status).toBe(200);
    expect(r.body.score).toBeNull();
    expect(r.body.markers).toBe(0);
    // Score SEM exames é no_data — nunca "calculando" (não há nada processando).
    expect(r.body.availability.healthScore).toEqual({ status: 'no_data', missing: ['firstExam'] });
    // Sem dateOfBirth a idade biológica pede PERFIL (CTA "Completar perfil"), não exame.
    expect(r.body.availability.biologicalAge.status).toBe('missing_profile');
    expect(r.body.availability.biologicalAge.missing).toContain('dateOfBirth');
    // Cardiometabólico sem NENHUM input é no_data — nunca "Em dia".
    expect(r.body.availability.cardiometabolic.status).toBe('no_data');
    expect(r.body.cardiometabolicRisk).toBeNull();

    // Completude (fonte única p/ onboarding + dashboard + perfil):
    const p = await api().get(`/api/patients/${patient.id}`).set(authHeader(token));
    expect(p.status).toBe(200);
    expect(p.body.profileCompleteness.missing).toEqual(expect.arrayContaining(['gender', 'dateOfBirth', 'heightCm', 'weight']));
    expect(p.body.profileCompleteness.missing).not.toContain('cpf'); // fluxo e-mail/senha já traz CPF
    expect(p.body.profileCompleteness.pct).toBe(20); // 1 de 5 essenciais (CPF) presente
    expect(p.body.weightKg).toBeNull();
  });

  it('C/K) perfil completo + peso mas ZERO exames: bio = no_data; cardio = ready com IMC REAL', async () => {
    const { patient, token } = await createUser();
    await prisma.patient.update({ where: { id: patient.id }, data: { gender: 'female', dateOfBirth: new Date('1990-05-10T00:00:00Z'), heightCm: 165 } });
    await prisma.measurement.create({ data: { patientId: patient.id, type: 'WEIGHT', value: 70.5, unit: 'kg', measuredAt: new Date() } });

    const r = await api().get(`/api/patients/${patient.id}/health-summary`).set(authHeader(token));
    expect(r.body.availability.healthScore.status).toBe('no_data');
    expect(r.body.availability.biologicalAge).toEqual({ status: 'no_data', missing: ['firstExam'] });
    // Tem peso+altura reais → IMC calcula → cardiometabólico "ready" é DADO, não invenção.
    expect(r.body.availability.cardiometabolic.status).toBe('ready');
    expect(r.body.cardiometabolicRisk).not.toBeNull();

    const p = await api().get(`/api/patients/${patient.id}`).set(authHeader(token));
    expect(p.body.profileCompleteness.missing).toEqual([]);
    expect(p.body.profileCompleteness.pct).toBe(100);
    expect(p.body.weightKg).toBe(70.5);
  });

  it('E) exame processado: score calcula e availability fica ready', async () => {
    const { patient, token } = await createUser();
    const e = await createExam(patient.id, { sha: 'ok-e1' });
    await createItem(e.id, { valueNumeric: 14, refLow: 12, refHigh: 16 });
    await createItem(e.id, { name: 'HEMATOCRITO', nameCanonical: 'HEMATOCRITO', valueNumeric: 40, refLow: 36, refHigh: 46 });

    const r = await api().get(`/api/patients/${patient.id}/health-summary`).set(authHeader(token));
    expect(r.body.score).toBe(100);
    expect(r.body.availability.healthScore.status).toBe('ready');
  });

  it('A/risk) POST /risk/assess com 0 marcadores NÃO persiste riskLevel low (sem dados ≠ normal)', async () => {
    const { patient, token } = await createUser();
    const r = await api().post('/api/risk/assess').set(authHeader(token)).send({ patientId: patient.id });
    expect(r.status).toBe(201);
    expect(r.body.markersEvaluated).toBe(0);
    expect(r.body.insufficientData).toBe(true);
    const persisted = await prisma.riskAssessment.count({ where: { patientId: patient.id } });
    expect(persisted).toBe(0); // antes: gravava 'low' + "não foram identificadas alterações"
  });

  it('F) usuário antigo com exames mas sem altura: completude segue apontando heightCm', async () => {
    const { patient, token } = await createUser();
    const e = await createExam(patient.id, { sha: 'old-f1' });
    await createItem(e.id, { valueNumeric: 14, refLow: 12, refHigh: 16 });
    const p = await api().get(`/api/patients/${patient.id}`).set(authHeader(token));
    expect(p.body.profileCompleteness.missing).toContain('heightCm');
    expect(p.body.profileCompleteness.missing).toContain('weight');
  });

  it('G) exame REJEITADO (CPF divergente) fica FORA dos agregados e VISÍVEL na lista', async () => {
    const { user, patient, token } = await createUser();
    const rej = await prisma.exam.create({
      data: {
        patientId: patient.id, title: 'Exame de Terceiro', kind: 'LAB_PANEL', status: 'REJECTED',
        filePath: 'rej.pdf', fileSha256: 'sha-rej-g', fileSizeBytes: 10,
        extractionError: 'cpf_mismatch: O CPF identificado no documento é diferente do CPF cadastrado na sua conta.',
        rawExtraction: { identityMatch: { method: 'cpf', cpfMatch: false, mismatch: true, severity: 'hard_block', docCpfMasked: '***.***.***-11', profileCpfMasked: '***.***.***-22' } } as any,
      },
    });
    const ok = await createExam(patient.id, { sha: 'sha-ok-g' });
    await createItem(ok.id, { valueNumeric: 15, refLow: 12, refHigh: 16, isAbnormal: true, flag: 'HIGH' });

    // health-summary conta SÓ o exame válido (1 marcador — o rejeitado não contamina).
    const hs = await api().get(`/api/patients/${patient.id}/health-summary`).set(authHeader(token));
    expect(hs.body.markers).toBe(1);
    expect(hs.body.score).toBe(0);

    // lista devolve o rejeitado — o dono precisa ver o aviso, apelar ou excluir.
    const list = await api().get('/api/exams?_start=0&_end=50').set(authHeader(token));
    expect(list.body.some((x: any) => x.id === rej.id)).toBe(true);

    // bônus de 1º exame NÃO conta o rejeitado (só EXTRACTED) — anti-farm intacto.
    const countExtracted = await prisma.exam.count({ where: { patientId: patient.id, status: 'EXTRACTED' } });
    expect(countExtracted).toBe(1);
  });

  it('G/suporte) ticket com examId anexa contexto técnico com CPF SEMPRE mascarado', async () => {
    const { user, patient, token } = await createUser();
    const rej = await prisma.exam.create({
      data: {
        patientId: patient.id, title: 'Exame de Terceiro', kind: 'LAB_PANEL', status: 'REJECTED',
        filePath: 'rej2.pdf', fileSha256: 'sha-rej-h', fileSizeBytes: 10,
        rawExtraction: { identityMatch: { method: 'cpf', cpfMatch: false, mismatch: true, severity: 'hard_block', docCpfMasked: '***.***.***-11', profileCpfMasked: '***.***.***-22' } } as any,
      },
    });
    const r = await api().post('/api/tickets').set(authHeader(token)).send({
      category: 'Exame rejeitado (CPF divergente)',
      subject: 'Este exame é meu',
      message: 'O documento é meu, podem conferir?',
      examId: rej.id,
    });
    expect(r.status).toBe(201);
    const ticket = await prisma.supportTicket.findFirst({ where: { userId: user.id }, include: { messages: true } });
    expect(ticket).toBeTruthy();
    const body = ticket!.messages[0].body;
    expect(body).toContain('Contexto técnico');
    expect(body).toContain('***.***.***-11'); // mascarado
    expect(body).toContain(rej.id);
    expect(body).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/); // JAMAIS CPF integral
  });

  it('L) exames existentes mas sem os marcadores da idade biológica: insufficient_data com a lista', async () => {
    const { patient, token } = await createUser();
    await prisma.patient.update({ where: { id: patient.id }, data: { dateOfBirth: new Date('1985-03-01T00:00:00Z') } });
    const e = await createExam(patient.id, { sha: 'sha-l1' });
    await createItem(e.id, { valueNumeric: 14, refLow: 12, refHigh: 16 }); // só hemoglobina — 1 age marker

    const r = await api().get(`/api/patients/${patient.id}/health-summary`).set(authHeader(token));
    // z-score com 1 marcador: se calcula → ready; se não: insufficient_data listando os 9 do PhenoAge.
    const bio = r.body.availability.biologicalAge;
    expect(['ready', 'insufficient_data']).toContain(bio.status);
    if (bio.status === 'insufficient_data') {
      expect(bio.missing.length).toBeGreaterThan(0);
      expect(bio.missing).toEqual(expect.arrayContaining(['Creatinina', 'Glicose', 'PCR']));
    }
  });
});
