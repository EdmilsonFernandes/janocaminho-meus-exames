import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, createUser, resetDb } from './helpers';
import { prisma } from '../src/prisma';
import { examCodeFromSubject, genExamCode, EXAM_CODE_RE } from '../src/utils/emailInbox';

/** R2: envio de exame por e-mail (código EX-XXXX no assunto) + escape "não tenho agora". */
describe('emailInbox — utilidades puras', () => {
  it('casae o código no assunto (e ignora mensagens sem código)', () => {
    expect(examCodeFromSubject('EX-AB2C meu exame')).toBe('EX-AB2C');
    expect(examCodeFromSubject('Fwd: EX-AB2C')).toBe('EX-AB2C');
    expect(examCodeFromSubject('re: exame do laboratório')).toBeNull();
    expect(examCodeFromSubject('EX-ab2c minúsculo')).toBeNull(); // case-sensitive: código é maiúsculo
  });

  it('gera códigos no formato válido e sem ambíguos', () => {
    for (let i = 0; i < 20; i++) {
      const c = genExamCode();
      expect(c).toMatch(/^EX-[A-Z2-7]{4}$/);
      expect(EXAM_CODE_RE.test(c)).toBe(true);
    }
  });
});

describe('Rotas — defer-first e email-upload-code', () => {
  beforeEach(resetDb);

  it('defer-first registra o adiamento (idempotente) e o firstExamNudge respeita', async () => {
    const u = await createUser({ emailVerified: true });
    const r1 = await api().post('/api/exams/defer-first').set(authHeader(u.token));
    expect(r1.status).toBe(200);
    const r2 = await api().post('/api/exams/defer-first').set(authHeader(u.token));
    expect(r2.status).toBe(200);
    // idempotente: 1 notificação só (janela de 14d)
    expect(await prisma.notification.count({ where: { userId: u.user.id, type: 'first_exam_deferred' } })).toBe(1);
  });

  it('email-upload-code gera 1 código válido e o reutiliza nas chamadas seguintes', async () => {
    const u = await createUser();
    const r1 = await api().get('/api/exams/email-upload-code').set(authHeader(u.token));
    expect(r1.status).toBe(200);
    expect(r1.body.code).toMatch(/^EX-[A-Z2-7]{4}$/);
    expect(r1.body.inbox).toBeTruthy();
    const r2 = await api().get('/api/exams/email-upload-code').set(authHeader(u.token));
    expect(r2.body.code).toBe(r1.body.code); // não gera outro enquanto válido
    // usuário diferente → código diferente
    const v = await createUser();
    const r3 = await api().get('/api/exams/email-upload-code').set(authHeader(v.token));
    expect(r3.body.code).not.toBe(r1.body.code);
  });

  it('ambas exigem autenticação', async () => {
    expect((await api().post('/api/exams/defer-first')).status).toBe(401);
    expect((await api().get('/api/exams/email-upload-code')).status).toBe(401);
  });
});
