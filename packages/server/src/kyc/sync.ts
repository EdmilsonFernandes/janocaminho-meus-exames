import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { audit } from '../utils/audit';
import { createLogger } from '../utils/logger';
import { getDoctorKycConfig } from '../utils/settings';
import { getUaiidVerification } from '../utils/uaiid';
import { decideDoctorVerification, type DoctorKycStatus } from './decide';
import { notifyDoctorKyc, notifyKycAdmin } from './notify';

const log = createLogger('kyc-sync');

export type SyncSource = 'webhook' | 'poll' | 'on_demand';

/** "Não regride" (spec §1): approved não muda por evento; legacy só sobe p/ approved. */
export function nextDoctorStatus(current: string, proposed: DoctorKycStatus): DoctorKycStatus | null {
  if (current === 'approved') return null;
  if (current === 'legacy') return proposed === 'approved' ? 'approved' : null;
  return proposed === current ? null : proposed;
}

/**
 * Sincroniza 1 tentativa com o UaiID (GET = fonte da verdade) e aplica no médico.
 * Idempotente: webhook repetido, poll e on-demand gravam o mesmo resultado.
 *
 * Corrida (exigência do dono, spec §5b): webhook + on-demand + poll podem terminar JUNTOS.
 * O GET (rede) roda fora; a leitura→decisão→gravação roda numa transação com advisory lock
 * POR MÉDICO (`kyc-doctor:<id>`, a MESMA das decisões do dono em admin.routes — revisão final I1: com travas
 * diferentes um sync atrasado lia o estado ANTES da recusa/aprovação do dono, esperava o lock de linha e gravava
 * por cima) — os concorrentes viram fila, o 2º já vê a decisão gravada pelo 1º e não reenvia e-mail.
 * Tentativa sem médico (conta apagada) usa a trava do providerId. E-mails/audit ficam FORA da tx (padrão
 * doctor.routes:1342): falha externa não rola estado atrás.
 */
export async function syncVerification(
  providerId: string,
  source: SyncSource,
  opts: { documentName?: string | null; now?: Date } = {},
): Promise<{ ok: boolean; doctorStatus?: string }> {
  const now = opts.now ?? new Date();
  const known = await prisma.doctorVerification.findUnique({ where: { providerId }, select: { id: true, doctorId: true } });
  if (!known) { log.warn('verificação desconhecida', { providerId, source }); return { ok: false }; }
  const lockKey = known.doctorId ? `kyc-doctor:${known.doctorId}` : `kyc-sync:${providerId}`;
  const remote = await getUaiidVerification(providerId);
  if (!remote) return { ok: false }; // UaiID fora → não marca lastSyncedAt; o job tenta de novo

  const result = await prisma.$transaction(async (tx) => {
    // Serializa syncs do mesmo médico E as decisões do dono (mesma chave em admin.routes). $executeRaw (não
    // $queryRaw): advisory lock devolve void (P2010).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    const attempt = await tx.doctorVerification.findUnique({
      where: { providerId },
      select: { id: true, doctorId: true, documentName: true, cfmName: true, cfmSituation: true, expiresAt: true, decision: true, decidedBy: true },
    });
    if (!attempt) return null; // apagada entre o pre-check e o lock

    const documentName = opts.documentName ?? attempt.documentName ?? null;
    const d = decideDoctorVerification({
      remote: { status: remote.status, reasonCode: remote.reasonCode, nameRatio: remote.nameRatio },
      expiresAt: attempt.expiresAt,
      documentName,
      cfm: attempt.cfmName ? { name: attempt.cfmName, situation: attempt.cfmSituation } : null,
      autoApprove: getDoctorKycConfig().autoApprove === 1,
      now,
    });
    const humanDecided = !!attempt.decidedBy && attempt.decidedBy !== 'auto';
    // Identidade OK mas sem o nome do documento (GET não traz; só o webhook carrega data.full_name):
    // SEGURA a decisão — decidir agora mandaria o dono um "aguardando" onde o webhook, milissegundos
    // depois, traria o "pronto para aprovar". Fail-closed: médico segue in_progress até o nome chegar.
    const holdingForName = !humanDecided
      && d.doctorStatus === 'needs_admin' && d.reason === 'document_name_unavailable' && source !== 'webhook';

    await tx.doctorVerification.update({
      where: { id: attempt.id },
      data: {
        status: d.attemptStatus,
        reasonCode: remote.reasonCode ?? d.reason,
        score: remote.score,
        nameRatio: remote.nameRatio,
        cpfSituacao: remote.cpfSituacao,
        documentName,
        nameMatch: d.nameMatch,
        ...(humanDecided || holdingForName ? {} : { decision: d.doctorStatus, decidedBy: d.doctorStatus === 'approved' || d.doctorStatus === 'rejected' ? 'auto' : null }),
        completedAt: remote.completedAt,
        lastSyncedAt: now,
        syncSource: source,
      },
    });
    if (!attempt.doctorId || humanDecided || holdingForName) return { ok: true };

    const latest = await tx.doctorVerification.findFirst({ where: { doctorId: attempt.doctorId }, orderBy: { createdAt: 'desc' }, select: { id: true } });
    if (latest?.id !== attempt.id) return { ok: true }; // tentativa antiga terminando atrasada
    const doc = await tx.doctor.findUnique({
      where: { id: attempt.doctorId },
      select: { id: true, name: true, email: true, crm: true, verificationStatus: true, blocked: true },
    });
    if (!doc) return { ok: true };

    const next = nextDoctorStatus(doc.verificationStatus, d.doctorStatus);
    const data: Prisma.DoctorUpdateInput = {};
    if (next) {
      data.verificationStatus = next;
      if (next === 'approved') { data.verifiedAt = now; data.verifiedBy = 'auto'; }
    }
    const fraudBlock = d.fraud && !doc.blocked;
    if (fraudBlock) { data.blocked = true; data.blockedAt = now; data.blockedReason = 'kyc_fraud'; }
    if (Object.keys(data).length) await tx.doctor.update({ where: { id: doc.id }, data });

    return {
      ok: true,
      doctorId: doc.id,
      doctorStatus: next ?? doc.verificationStatus,
      // E-mails só na TRANSIÇÃO (spec §5b): decisão lida DEPOIS do lock ≠ decisão nova.
      transition: d.doctorStatus !== attempt.decision || fraudBlock,
      fraudBlock, decision: d.doctorStatus, reason: d.reason, next,
      doc: { id: doc.id, name: doc.name, email: doc.email, crm: doc.crm },
      providerId, attemptStatus: d.attemptStatus,
    };
  });

  if (!result) { log.warn('verificação desapareceu durante o sync', { providerId, source }); return { ok: false }; }
  if (!result.doctorId) return { ok: true };

  void audit('DOCTOR_KYC_RESULT', null, {
    actorType: 'SYSTEM', targetType: 'DOCTOR', targetId: result.doctorId,
    after: { providerId, status: result.attemptStatus, decision: result.decision, reason: result.reason, source },
  });
  if (result.transition) {
    const who = `Médico: ${result.doc.name} · CRM ${result.doc.crm}`;
    if (result.fraudBlock) {
      void notifyKycAdmin('Dr. Exame — fraude confirmada no KYC de médico', [who, `Motivo: ${result.reason}`, 'A conta foi bloqueada automaticamente.']);
    } else if (result.decision === 'needs_admin') {
      void notifyKycAdmin(
        result.reason === 'manual_policy' ? 'Dr. Exame — médico pronto para aprovar (tudo verde)' : 'Dr. Exame — médico aguardando sua análise',
        [who, `Motivo: ${result.reason ?? '-'}`],
      );
    } else if (result.decision === 'uaiid_review') {
      void notifyKycAdmin('Dr. Exame — KYC em revisão no painel do UaiID', [who, `Motivo: ${result.reason ?? '-'}`, 'Decida no painel do UaiID; o resultado volta sozinho.']);
    }
    if (result.next === 'approved') void notifyDoctorKyc(result.doc, 'approved');
    else if (result.decision === 'rejected') void notifyDoctorKyc(result.doc, 'rejected', result.reason);
    else if (result.decision === 'needs_admin' || result.decision === 'uaiid_review') void notifyDoctorKyc(result.doc, 'received');
  }
  return { ok: true, doctorStatus: result.doctorStatus };
}
