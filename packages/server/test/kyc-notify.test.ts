import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sendEmail } from '../src/utils/mailer';
import { notifyDoctorKyc, notifyKycAdmin } from '../src/kyc/notify';
import { kycMessage, kycCaptureIssue } from '../src/kyc/messages';
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

  // --- Fix round 1 (privacidade/LGPD + "Como resolver" coerente com o motivo) ---
  const CAPTURE = ['face_mismatch', 'liveness_fail', 'challenge_failed', 'document_not_recognized', 'document_expired', 'data_mismatch_name', 'name_mismatch'];
  const NOT_CAPTURE = ['crm_inactive', 'cfm_unavailable', 'cfm_situation_unknown', 'data_mismatch_cpf', 'fraud_confirmed', 'expired', 'manual_policy', 'admin_rejected', 'face_mismatch_review', 'document_name_unavailable', 'xyz', '', null, undefined];
  const ana = { name: 'Dra. Ana Lima', email: 'ana@exemplo.com' };

  it('kycCaptureIssue: só documento / selfie / prova de vida / nome ≠ CFM', () => {
    for (const c of CAPTURE) expect(kycCaptureIssue(c), String(c)).toBe(true);
    for (const c of NOT_CAPTURE) expect(kycCaptureIssue(c), String(c)).toBe(false);
  });

  it('sem fonte/recurso externo: nenhum <link>/@import/url(); o único recurso remoto é o mascote, em https no domínio próprio', async () => {
    const prev = process.env.WEB_ORIGIN;
    delete process.env.WEB_ORIGIN; // o setup aponta pro localhost; aqui vale o padrão de produção
    try {
      const base = { name: 'Dra. Maria da Silva', crm: '116739-SP', portalUrl: PORTAL };
      const mails = [
        doctorKycEmail({ ...base, kind: 'received' }),
        doctorKycEmail({ ...base, kind: 'approved' }),
        doctorKycEmail({ ...base, kind: 'rejected', reason: 'O rosto não bateu.', captureTips: true }),
        doctorKycEmail({ ...base, kind: 'rejected', reason: 'Motivo do dono.' }),
        kycAdminEmail({ title: 'Dr. Exame — x', lines: ['y'], adminUrl: 'https://a/#/admin' }),
      ];
      for (const html of mails) {
        expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic|<link|@import|url\(|<script|<iframe/i);
        expect([...html.matchAll(/\ssrc="([^"]+)"/g)].map((m) => m[1])).toEqual(['https://janocaminho.com.br/minhasaude/app-icon.png']);
      }
    } finally {
      if (prev === undefined) delete process.env.WEB_ORIGIN; else process.env.WEB_ORIGIN = prev;
    }
    // e pelo caminho real de envio
    await notifyDoctorKyc(ana, 'approved');
    expect(lastMail().html).not.toContain('fonts.googleapis');
  });

  it('recusa por motivo de captura (documento/selfie/vida/nome) mostra as 3 dicas "Como resolver"', async () => {
    for (const code of CAPTURE) {
      await notifyDoctorKyc(ana, 'rejected', code);
      expect(lastMail().html, code).toContain('Como resolver');
      expect(lastMail().html, code).toContain('bem iluminado');
      expect(lastMail().html, code).not.toContain('E agora?');
      expect(lastMail().html, code).toContain('Tentar de novo');
    }
  });

  it('recusa por outro motivo (CRM/CFM, CPF, fraude, expirado, desconhecido, sem código) mostra "E agora?" e NÃO as dicas', async () => {
    for (const code of NOT_CAPTURE) {
      await notifyDoctorKyc(ana, 'rejected', code);
      const html = lastMail().html as string;
      expect(html, String(code)).toContain('E agora?');
      expect(html, String(code)).toContain('Responda este e-mail');
      expect(html, String(code)).toContain('contato@janocaminho.com.br');
      expect(html, String(code)).not.toContain('Como resolver');
      expect(html, String(code)).not.toContain('bem iluminado');
      expect(html, String(code)).toContain('Tentar de novo');
    }
  });

  it('motivo escrito pelo dono → sempre "E agora?" (mesmo com código de captura), nunca as dicas', async () => {
    await notifyDoctorKyc(ana, 'rejected', 'face_mismatch', 'Seu CRM não confere com o CFM.');
    const html = lastMail().html as string;
    expect(html).toContain('Seu CRM não confere com o CFM.');
    expect(html).toContain('E agora?');
    expect(html).not.toContain('Como resolver');
    expect(html).not.toContain('bem iluminado');
    expect(html).toContain('Tentar de novo');
    // texto em branco do dono não conta como motivo: vale o código (captura → dicas)
    await notifyDoctorKyc(ana, 'rejected', 'face_mismatch', '   ');
    expect(lastMail().html).toContain('Como resolver');
  });
});
