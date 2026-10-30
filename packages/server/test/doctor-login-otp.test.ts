// Revisão final do KYC, 2ª rodada (Important #5-B): POST /api/doctor/login com e-mail NÃO verificado respondia 403
// { needsVerification:true } mas NUNCA emitia o código (só o /register o fazia, 1x). O médico do convite entra com JWT
// sem OTP e, quando ele vence (7 dias), o login cai na tela de código sem nenhum código enviado — trancado para fora.
// Agora o login (com a SENHA certa) emite o mesmo e-mail do cadastro, no máximo 1 por e-mail a cada 60 s.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api, resetDb, testCpf, createUser } from './helpers';
import { prisma } from '../src/prisma';
import { sendEmail } from '../src/utils/mailer';
import { resetDoctorOtpThrottleForTests } from '../src/routes/doctor.routes';

let seq = 48000;
const settle = () => new Promise((r) => setTimeout(r, 150));
const otpMails = (to: string) => vi.mocked(sendEmail).mock.calls.map(([m]) => m).filter((m) => m.to === to && m.subject.includes('Ative sua conta'));
/** O código está no <span ...monospace">123456</span> do otpEmail. */
const codeOf = (html: string) => html.match(/monospace">(\d{6})<\/span>/)?.[1];
const login = (email: string, password: string) => api().post('/api/doctor/login').send({ email, password });

/** Cadastro pela API (e-mail NÃO verificado). Por padrão zera a janela de 60 s e o mock — o próprio /register já marca a janela. */
async function cadastrar(opts: { reset?: boolean } = {}) {
  const email = `login-otp-${seq}-${Date.now().toString(36)}@exemplo.com`;
  const password = 'senha123';
  const r = await api().post('/api/doctor/register').send({ name: 'Dra Login', cpf: testCpf(), crm: `${seq++}-SP`, specialty: 'Clinico Geral', email, password });
  expect(r.status).toBe(201);
  if (opts.reset !== false) { resetDoctorOtpThrottleForTests(); vi.mocked(sendEmail).mockClear(); }
  return { email, password };
}

describe('POST /api/doctor/login — e-mail não verificado emite o código (B2-2)', () => {
  beforeEach(async () => {
    await resetDb();
    resetDoctorOtpThrottleForTests();
    vi.mocked(sendEmail).mockClear();
  });

  it('senha certa + e-mail não verificado → 403 needsVerification (resposta inalterada) e 1 e-mail com o código; o 2º login em <60 s não manda outro; o código vale no /verify-email', async () => {
    const { email, password } = await cadastrar();
    const r1 = await login(email, password);
    expect(r1.status).toBe(403);
    expect(r1.body).toMatchObject({ needsVerification: true, email });
    expect(r1.body.token).toBeUndefined();
    await vi.waitFor(() => expect(otpMails(email)).toHaveLength(1));
    const code = codeOf(otpMails(email)[0].html);
    expect(code).toMatch(/^\d{6}$/);

    const r2 = await login(email, password); // 5 s depois no portal, p. ex.
    expect(r2.status).toBe(403);
    await settle();
    expect(otpMails(email)).toHaveLength(1); // sem bomba de e-mail

    const v = await api().post('/api/doctor/verify-email').send({ email, code });
    expect(v.status).toBe(200);
    expect(v.body.token).toBeTruthy();
    expect((await prisma.doctor.findFirstOrThrow({ where: { email } })).emailVerified).toBe(true);
  });

  it('passada a janela de 60 s (relógio adiantado) o login volta a mandar o código', async () => {
    const { email, password } = await cadastrar();
    expect((await login(email, password)).status).toBe(403);
    await vi.waitFor(() => expect(otpMails(email)).toHaveLength(1));
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(Date.now() + 61_000));
      expect((await login(email, password)).status).toBe(403);
      await settle();
      expect(otpMails(email)).toHaveLength(2);
      expect((await login(email, password)).status).toBe(403); // e a nova janela também limita
      await settle();
      expect(otpMails(email)).toHaveLength(2);
    } finally { vi.useRealTimers(); }
  });

  it('senha ERRADA ou e-mail inexistente NÃO enviam nada (não vira oráculo nem bomba de e-mail)', async () => {
    const { email } = await cadastrar();
    const errada = await login(email, 'senha-errada');
    expect(errada.status).toBe(401);
    expect(errada.body.needsVerification).toBeUndefined();
    expect((await login('ninguem@exemplo.com', 'senha123')).status).toBe(401);
    await settle();
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });

  it('e-mail JÁ verificado → login normal (200) e nenhum e-mail de código', async () => {
    const { email, password } = await cadastrar();
    await prisma.doctor.updateMany({ where: { email }, data: { emailVerified: true } });
    const r = await login(email, password);
    expect(r.status).toBe(200);
    expect(r.body.token).toBeTruthy();
    await settle();
    expect(otpMails(email)).toHaveLength(0);
  });

  it('o cadastro também marca a janela: login logo depois do /register não manda um 2º código', async () => {
    const { email, password } = await cadastrar({ reset: false }); // o /register mandou o 1º
    await vi.waitFor(() => expect(otpMails(email)).toHaveLength(1));
    expect((await login(email, password)).status).toBe(403);
    await settle();
    expect(otpMails(email)).toHaveLength(1);
  });

  it('conta do convite (nunca recebeu código): o 1º login com a senha certa já emite o código', async () => {
    const { user } = await createUser();
    const patient = await prisma.patient.findFirstOrThrow({ where: { ownerId: user.id } });
    const token = `${Date.now().toString(16)}${'b'.repeat(24)}`;
    await prisma.appSetting.create({ data: { key: `doc_invite:${token}`, value: { status: 'pending', expiresAt: new Date(Date.now() + 86_400_000).toISOString(), patientId: patient.id, scopes: ['exams'], examIds: [] } } });
    const email = `convite-otp-${Date.now().toString(36)}@exemplo.com`;
    const reg = await api().post(`/api/public/doctor-invite/${token}/register`).send({ name: 'Dra Convite', crm: `${seq++}`, crmUf: 'SP', email, password: 'senha123' });
    expect(reg.status).toBe(201); // o convite devolve o JWT SEM nenhum OTP
    expect(otpMails(email)).toHaveLength(0);
    expect((await login(email, 'senha123')).status).toBe(403);
    await vi.waitFor(() => expect(otpMails(email)).toHaveLength(1));
    const v = await api().post('/api/doctor/verify-email').send({ email, code: codeOf(otpMails(email)[0].html) });
    expect(v.status).toBe(200); // destrancado
  });
});
