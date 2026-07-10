import { describe, expect, it, beforeEach } from 'vitest';
import { api, authHeader, createUser, resetDb, testCpf } from './helpers';
import { prisma } from '../src/prisma';
import { formatCpf } from '../src/utils/cpf';

describe('suporte PII / CPF', () => {
  beforeEach(async () => { await resetDb(); });

  it('admin busca CPF por HMAC e revela CPF com auditoria', async () => {
    const cpf = testCpf();
    const patientOwner = await createUser({ email: 'paciente-pii@t.com', cpf });
    const admin = await createUser({ email: 'admin-pii@t.com' });
    await prisma.user.update({ where: { id: admin.user.id }, data: { role: 'ADMIN' } });

    const denied = await api().get(`/api/admin/pii/lookup?cpf=${encodeURIComponent(cpf)}`).set(authHeader(patientOwner.token));
    expect(denied.status).toBe(403);

    const lookup = await api().get(`/api/admin/pii/lookup?cpf=${encodeURIComponent(cpf)}`).set(authHeader(admin.token));
    expect(lookup.status).toBe(200);
    expect(lookup.body.patients).toHaveLength(1);
    expect(lookup.body.patients[0].cpfMasked).toMatch(/\*\*\*\.\*\*\*\.\*\*\*-\d{2}/);
    expect(lookup.body.patients[0].cpfEncrypted).toBeUndefined();

    const lookupByEmail = await api().get('/api/admin/pii/lookup?email=paciente-pii@t.com').set(authHeader(admin.token));
    expect(lookupByEmail.status).toBe(200);
    expect(lookupByEmail.body.patients).toHaveLength(1);
    expect(lookupByEmail.body.patients[0].cpfMasked).toBe(lookup.body.patients[0].cpfMasked);

    const targetId = lookup.body.patients[0].id;
    const missingReason = await api().post('/api/admin/pii/reveal').set(authHeader(admin.token))
      .send({ targetType: 'PATIENT', targetId, reason: '' });
    expect(missingReason.status).toBe(400);

    const reveal = await api().post('/api/admin/pii/reveal').set(authHeader(admin.token))
      .send({ targetType: 'PATIENT', targetId, reason: 'Chamado #1234' });
    expect(reveal.status).toBe(200);
    expect(reveal.body.cpf).toBe(formatCpf(cpf));

    const audit = await prisma.auditLog.findFirst({ where: { action: 'REVEAL_CPF', targetId } });
    expect(audit).toBeTruthy();
    expect(JSON.stringify(audit?.after)).not.toContain(cpf);
    expect(await prisma.auditLog.findFirst({ where: { action: 'LOOKUP_PII_EMAIL' } })).toBeTruthy();
  });
});
