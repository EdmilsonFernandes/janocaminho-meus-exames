// E2E do Cartão de Emergência com QR público (estudo Guava 21/11 — gap #3).
// Cobre: geração idempotente de token, payload público MÍNIMO (sem CPF/e-mail),
// 404 p/ token inexistente, revogação e isolamento (token de A não é lido por... ninguém precisa logar —
// o teste prova que só o token certo funciona).
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/prisma';
import { createUser, api, authHeader } from './helpers';

describe('Cartão de emergência QR público', () => {
  beforeEach(async () => {
    const { resetDb } = await import('./helpers');
    await resetDb();
  });

  it('gera token idempotente e o endpoint público devolve payload mínimo', async () => {
    const u = await createUser({ name: 'Maria Teste' });
    await prisma.patient.update({
      where: { id: u.patient.id },
      data: { allergies: 'Penicilina', clinicalProfile: 'Hipertensão', dateOfBirth: new Date('1990-05-10T12:00:00Z') },
    });
    await prisma.medication.create({
      data: { patientId: u.patient.id, name: 'Losartana', dosage: '50 mg', active: true },
    });

    const r1 = await api().post('/api/emergency/token').set(authHeader(u.token)).send({});
    expect(r1.status).toBe(201);
    const tok = r1.body.token as string;
    expect(tok).toMatch(/^[0-9a-f]{48}$/);

    // idempotente: mesma chamada devolve o MESMO token
    const r2 = await api().post('/api/emergency/token').set(authHeader(u.token)).send({});
    expect(r2.status).toBe(200);
    expect(r2.body.token).toBe(tok);

    // endpoint público SEM auth — payload mínimo
    const pub = await api().get(`/api/public/emergency/${tok}`);
    expect(pub.status).toBe(200);
    expect(pub.body.name).toBe('Maria Teste');
    expect(pub.body.age).toBeGreaterThanOrEqual(36);
    expect(pub.body.allergies).toBe('Penicilina');
    expect(pub.body.conditions).toBe('Hipertensão');
    expect(pub.body.medications).toEqual([{ name: 'Losartana', dosage: '50 mg' }]);
    // PROVA de minimização: nenhum campo sensível vaza
    const body = JSON.stringify(pub.body);
    expect(body).not.toMatch(/cpf|email|photoUrl|address|id/i);
  });

  it('token inexistente/formato inválido → 404 (sem vazar existência)', async () => {
    await createUser();
    const bad1 = await api().get('/api/public/emergency/000000000000000000000000000000000000000000000000');
    expect(bad1.status).toBe(404);
    const bad2 = await api().get('/api/public/emergency/abc'); // formato errado
    expect(bad2.status).toBe(404);
  });

  it('revogação invalida o QR imediatamente', async () => {
    const u = await createUser();
    const r1 = await api().post('/api/emergency/token').set(authHeader(u.token)).send({});
    const tok = r1.body.token as string;
    expect((await api().get(`/api/public/emergency/${tok}`)).status).toBe(200);

    const del = await api().delete(`/api/emergency/token?patientId=${u.patient.id}`).set(authHeader(u.token));
    expect(del.status).toBe(200);
    expect((await api().get(`/api/public/emergency/${tok}`)).status).toBe(404);
  });

  it('rota autenticada exige login (401 sem token)', async () => {
    const r = await api().post('/api/emergency/token').send({});
    expect(r.status).toBe(401);
  });
});
