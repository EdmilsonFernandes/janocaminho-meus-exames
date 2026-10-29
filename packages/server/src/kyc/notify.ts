import { sendEmail } from '../utils/mailer';
import { createLogger } from '../utils/logger';
import { DOCTOR_KYC_SUBJECTS, doctorKycEmail, kycAdminEmail } from './emails';
import { kycMessage } from './messages';

const log = createLogger('kyc-notify');
const portalUrl = () => process.env.DOCTOR_PORTAL_URL || 'https://drexame.janocaminho.com.br/#/doctor';
const adminUrl = () => process.env.ADMIN_PANEL_URL || 'https://janocaminho.com.br/minhasaude/#/admin';

/** E-mail ao dono (mesmo destino do aviso de cadastro — auth.routes.ts:57). Nunca lança. */
export async function notifyKycAdmin(subject: string, lines: string[]): Promise<void> {
  try {
    const to = process.env.ADMIN_EMAIL || 'edmls2008@gmail.com';
    await sendEmail({ to, subject, html: kycAdminEmail({ title: subject, lines, adminUrl: adminUrl() }) });
  } catch (e: any) {
    log.warn('falha no e-mail ao dono (KYC)', { msg: e?.message });
  }
}

/**
 * E-mail ao médico nas transições (spec §5b). Nunca lança; sem e-mail → no-op.
 * Na recusa, o motivo escrito pelo dono (`reasonText`) tem precedência sobre o texto
 * padrão do `reasonCode` (dono, 28/10: "caso reprovado explicar o porquê por e-mail").
 */
export async function notifyDoctorKyc(
  doctor: { name: string; email: string; crm?: string | null },
  kind: 'received' | 'approved' | 'rejected',
  reasonCode?: string | null,
  reasonText?: string | null, // motivo escrito pelo dono na recusa manual — vai para o médico (dono, 28/10)
): Promise<void> {
  if (!doctor.email) return;
  try {
    const reason = reasonText?.trim() || kycMessage(reasonCode);
    await sendEmail({
      to: doctor.email,
      subject: DOCTOR_KYC_SUBJECTS[kind],
      html: doctorKycEmail({ name: doctor.name, crm: doctor.crm, kind, reason, portalUrl: portalUrl() }),
    });
  } catch (e: any) {
    log.warn('falha no e-mail ao médico (KYC)', { kind, msg: e?.message });
  }
}
