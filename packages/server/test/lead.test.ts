import { describe, it, expect, beforeEach } from 'vitest';
import { api, resetDb } from './helpers';
import { prisma } from '../src/prisma';

/**
 * E2E do POST /api/public/lead — captura de e-mail da landing (popup).
 * Honeypot, idempotência, validação e normalização. O e-mail de boas-vindas é
 * best-effort (SMTP em teste falha silenciosamente — não afeta o status).
 */

describe('Lead da landing (popup)', () => {
  beforeEach(async () => { await resetDb(); });

  it('e-mail válido → 201 + row criada com source padrão e e-mail normalizado', async () => {
    const r = await api().post('/api/public/lead').send({ email: 'Maria@Exemplo.COM' });
    expect(r.status).toBe(201);
    expect(r.body.ok).toBe(true);
    const row = await prisma.landingLead.findFirst({});
    expect(row?.email).toBe('maria@exemplo.com');
    expect(row?.source).toBe('popup_landing');
  });

  it('duplicado → 201 idempotente, sem segunda row', async () => {
    await api().post('/api/public/lead').send({ email: 'a@b.co' });
    const again = await api().post('/api/public/lead').send({ email: 'a@b.co' });
    expect(again.status).toBe(201);
    expect(await prisma.landingLead.count()).toBe(1);
  });

  it('honeypot preenchido → 201 (sem enumerar) e NADA gravado', async () => {
    const r = await api().post('/api/public/lead').send({ email: 'bot@spam.xx', website: 'http://spam.com' });
    expect(r.status).toBe(201);
    expect(await prisma.landingLead.count()).toBe(0);
  });

  it('e-mail inválido → 400', async () => {
    expect((await api().post('/api/public/lead').send({ email: 'nao-e-email' })).status).toBe(400);
    expect((await api().post('/api/public/lead').send({})).status).toBe(400);
  });

  it('source custom respeitado (mesmo e-mail pode vir de funis diferentes)', async () => {
    await api().post('/api/public/lead').send({ email: 'x@y.co', source: 'decifre' });
    await api().post('/api/public/lead').send({ email: 'x@y.co', source: 'popup_landing' });
    expect(await prisma.landingLead.count()).toBe(2);
  });
});
