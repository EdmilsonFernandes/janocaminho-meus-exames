import { getDoctorKycConfig } from './settings';

/**
 * Política ÚNICA de acesso do médico (spec verificação §7). O parse do JWT continua LOCAL em
 * cada módulo (padrão D8 — examRequest.routes.ts:10-12); todos chamam doctorAccessDenial()
 * depois de carregar o médico com DOCTOR_ACCESS_SELECT.
 */
export const DOCTOR_ACCESS_SELECT = { id: true, blocked: true, blockedReason: true, verificationStatus: true } as const;

export interface DoctorAccessRow { blocked: boolean; blockedReason?: string | null; verificationStatus: string }

const BLOCKED_MSG = 'Acesso suspenso pela administração. Entre em contato com o suporte: contato@janocaminho.com.br';

/** Status que atendem agora: approved sempre; legacy enquanto o prazo vale (0 = sem prazo). */
export function practiceStatuses(now: Date = new Date()): string[] {
  const { legacyGraceUntilMs } = getDoctorKycConfig();
  const legacyOk = legacyGraceUntilMs === 0 || now.getTime() < legacyGraceUntilMs;
  return legacyOk ? ['approved', 'legacy'] : ['approved'];
}

export function doctorCanPractice(verificationStatus: string | null | undefined, now: Date = new Date()): boolean {
  return !!verificationStatus && practiceStatuses(now).includes(verificationStatus);
}

/** null = pode seguir; senão a resposta HTTP a devolver. Bloqueio vence tudo. */
export function doctorAccessDenial(
  doc: DoctorAccessRow,
  opts: { allowUnverified?: boolean; now?: Date } = {},
): { status: number; body: Record<string, unknown> } | null {
  if (doc.blocked) return { status: 403, body: { blocked: true, code: 'DOCTOR_BLOCKED', error: BLOCKED_MSG, reason: doc.blockedReason || undefined } };
  if (opts.allowUnverified) return null;
  if (doctorCanPractice(doc.verificationStatus, opts.now)) return null;
  return { status: 403, body: { code: 'VERIFICATION_REQUIRED', status: doc.verificationStatus, error: 'Verifique sua identidade para liberar o acesso.' } };
}
