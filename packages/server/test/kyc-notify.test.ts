import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sendEmail } from '../src/utils/mailer';
import { notifyDoctorKyc, notifyKycAdmin } from '../src/kyc/notify';
import { kycMessage } from '../src/kyc/messages';
import { doctorKycEmail, kycAdminEmail, escapeHtml, DOCTOR_KYC_SUBJECTS } from '../src/kyc/emails';

const PORTAL = 'https://drexame.janocaminho.com.br/#/doctor';
const lastMail = () => { const c = vi.mocked(sendEmail).mock.calls; return c[c.length - 1][0] as any; };

describe('KYC — mensagens e e-mails premium (spec §5b)', () => {
  beforeEach(() => vi.mocked(sendEmail).mockClear());

  it('kycMessage: motivo conhecido → texto; desconhecido/nulo → null', () => {
    expect(kycMessage('face_mismatch')).toMatch(/rosto/i);
    expect(kycMessage('manual_policy')).toMatch(/equipe/i);
    expect(kycMessage('xyz')).toBeNull();
    expect(kycMessage(null)).toBeNull();
  });

  it('layout premium: dark mode, preheader, mascote, marca e saudação pelo primeiro nome (sem título)', () => {
    const html = doctorKycEmail({ name: 'Dra. Maria da Silva', crm: '116739-SP', kind: 'received', portalUrl: PORTAL });
    expect(html).toContain('name="color-scheme" content="light dark"');
    expect(html).toContain('prefers-color-scheme: dark');
    expect(html).toContain('app-icon.png');
    expect(html).toContain('Portal do Médico');
    expect(html).toContain('Recebemos seu cadastro, Maria');
    expect(html).toContain('116739-SP');
    expect(html).toContain('#20b2aa');
  });

  it('nome é escapado (dado do usuário)', () => {
    const html = doctorKycEmail({ name: '<script>x</script>', kind: 'approved', portalUrl: PORTAL });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain(escapeHtml('<script>x</script>'));
  });

  it('recebido / aprovado / recusado: assunto, link do portal e motivo amigável', async () => {
    const doc = { name: 'Dra. Ana Lima', email: 'ana@exemplo.com', crm: '23456-SP' };
    await notifyDoctorKyc(doc, 'received');
    expect(lastMail()).toMatchObject({ to: 'ana@exemplo.com', subject: DOCTOR_KYC_SUBJECTS.received });
    await notifyDoctorKyc(doc, 'approved');
    expect(lastMail().subject).toBe(DOCTOR_KYC_SUBJECTS.approved);
    expect(lastMail().html).toContain(PORTAL);
    await notifyDoctorKyc(doc, 'rejected', 'face_mismatch');
    expect(lastMail().subject).toBe(DOCTOR_KYC_SUBJECTS.rejected);
    expect(lastMail().html).toContain('O rosto não bateu');
  });

  it('aviso ao dono vai pro ADMIN_EMAIL com as linhas escapadas', async () => {
    process.env.ADMIN_EMAIL = 'dono@exemplo.com';
    await notifyKycAdmin('Dr. Exame — médico pronto para aprovar (tudo verde)', ['Médico: <b>Ana</b> · CRM 123-SP']);
    expect(lastMail().to).toBe('dono@exemplo.com');
    expect(lastMail().html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
    expect(kycAdminEmail({ title: 'x', lines: [], adminUrl: 'https://a/#/admin' })).toContain('https://a/#/admin');
  });

  it('SMTP falhando não lança', async () => {
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error('SMTP fora'));
    await expect(notifyDoctorKyc({ name: 'X', email: 'x@exemplo.com' }, 'received')).resolves.toBeUndefined();
  });

  it('recusa pelo dono leva o motivo escrito por ele (escapado), não o texto padrão', async () => {
    await notifyDoctorKyc({ name: 'Dra. Ana', email: 'ana@exemplo.com' }, 'rejected', 'admin_rejected', 'Documento ilegível <reenvie>');
    expect(lastMail().html).toContain('Documento ilegível &lt;reenvie&gt;');
    expect(lastMail().html).not.toContain(kycMessage('admin_rejected')!);
  });
});
