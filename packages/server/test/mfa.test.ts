import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser } from './helpers';
import { generateTotpCode } from '../src/utils/totp';

describe('MFA (paciente): setup → login → desafio → verify', () => {
  beforeEach(async () => { await resetDb(); });

  it('fluxo completo: setup → confirm → login com mfaRequired → verify → token', async () => {
    const { user, token } = await createUser({});
    const setup = await api().post('/api/auth/mfa/setup/start').set(authHeader(token));
    expect(setup.status).toBe(200);
    expect(setup.body.secret).toBeTruthy();
    expect(setup.body.qrCodeDataUrl).toContain('data:image/png');
    const confirm = await api().post('/api/auth/mfa/setup/confirm').set(authHeader(token)).send({ code: generateTotpCode(setup.body.secret) });
    expect(confirm.status).toBe(200);
    expect(confirm.body.enabled).toBe(true);
    const login = await api().post('/api/auth/login').send({ username: user.email, password: 'senha123' });
    expect(login.body.mfaRequired).toBe(true);
    expect(login.body.challengeToken).toBeTruthy();
    const verify = await api().post('/api/auth/mfa/verify').send({ challengeToken: login.body.challengeToken, code: generateTotpCode(setup.body.secret) });
    expect(verify.status).toBe(200);
    expect(verify.body.token).toBeTruthy();
    expect(verify.body.user.email).toBe(user.email);
  });

  it('código errado → 401; após 5 tentativas → 429 bloqueado', async () => {
    const { user, token } = await createUser({});
    const setup = await api().post('/api/auth/mfa/setup/start').set(authHeader(token));
    await api().post('/api/auth/mfa/setup/confirm').set(authHeader(token)).send({ code: generateTotpCode(setup.body.secret) });
    const login = await api().post('/api/auth/login').send({ username: user.email, password: 'senha123' });
    for (let i = 0; i < 5; i++) {
      const r = await api().post('/api/auth/mfa/verify').send({ challengeToken: login.body.challengeToken, code: '000000' });
      expect(r.status).toBe(401);
    }
    const blocked = await api().post('/api/auth/mfa/verify').send({ challengeToken: login.body.challengeToken, code: generateTotpCode(setup.body.secret) });
    expect(blocked.status).toBe(429);
  });

  it('desativar MFA com código correto', async () => {
    const { token } = await createUser({});
    const setup = await api().post('/api/auth/mfa/setup/start').set(authHeader(token));
    await api().post('/api/auth/mfa/setup/confirm').set(authHeader(token)).send({ code: generateTotpCode(setup.body.secret) });
    const disable = await api().post('/api/auth/mfa/disable').set(authHeader(token)).send({ code: generateTotpCode(setup.body.secret) });
    expect(disable.status).toBe(200);
    expect(disable.body.enabled).toBe(false);
  });

  it('status reflete habilitado/desabilitado', async () => {
    const { token } = await createUser({});
    const before = await api().get('/api/auth/mfa/status').set(authHeader(token));
    expect(before.body.enabled).toBe(false);
    const setup = await api().post('/api/auth/mfa/setup/start').set(authHeader(token));
    await api().post('/api/auth/mfa/setup/confirm').set(authHeader(token)).send({ code: generateTotpCode(setup.body.secret) });
    const after = await api().get('/api/auth/mfa/status').set(authHeader(token));
    expect(after.body.enabled).toBe(true);
  });
});
