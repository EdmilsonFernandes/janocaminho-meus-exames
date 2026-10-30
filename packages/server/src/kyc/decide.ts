import { normalizeKey } from '../utils/normalize';
import { cfmState } from '../utils/cfm';

/**
 * Decisão PURA do KYC do médico (spec verificação §4). Duas provas, as duas obrigatórias:
 * o UaiID prova QUEM é a pessoa; aqui provamos que ela é o TITULAR do CRM (nome estrito = CFM).
 */
export type DoctorKycStatus = 'pending' | 'in_progress' | 'uaiid_review' | 'needs_admin' | 'approved' | 'rejected' | 'legacy';

/** Tentativa ainda em andamento no UaiID. */
export const NON_FINAL_ATTEMPT: readonly string[] = ['created', 'consent_pending', 'collecting', 'processing', 'challenge'];

const PARTICLES = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E']);

/**
 * Nome canônico p/ comparação ESTRITA: sem pontuação, maiúsculas, sem acento, sem partículas.
 * Normaliza p/ NFC ANTES de tirar o que não é letra: acento decomposto (NFD) é uma marca combinante
 * (\p{M}) que viraria espaço e partiria a palavra. Nome sem letras (vazio/só partículas) dá '' — e '' nunca casa.
 */
export function strictName(s: string | null | undefined): string {
  return normalizeKey(String(s ?? '').normalize('NFC').replace(/[^\p{L}\s]/gu, ' '))
    .split(' ')
    .filter((w) => w && !PARTICLES.has(w))
    .join(' ');
}

export interface DecisionInput {
  remote: { status: string; reasonCode: string | null; nameRatio: number | null };
  expiresAt: Date | null;
  documentName: string | null; // do webhook assinado (data.full_name), se veio
  cfm: { name: string; situation: string | null } | null; // snapshot da criação = nome declarado ao UaiID
  autoApprove: boolean; // doctorKyc.autoApprove === 1 (0 = todo médico passa pelo dono)
  now: Date;
}

export interface Decision {
  attemptStatus: string;
  doctorStatus: DoctorKycStatus;
  reason: string | null;
  nameMatch: boolean | null;
  fraud: boolean;
  final: boolean;
}

const out = (attemptStatus: string, doctorStatus: DoctorKycStatus, final: boolean, reason: string | null = null, nameMatch: boolean | null = null, fraud = false): Decision =>
  ({ attemptStatus, doctorStatus, reason, nameMatch, fraud, final });

export function decideDoctorVerification(i: DecisionInput): Decision {
  const st = i.remote.status;
  if (NON_FINAL_ATTEMPT.includes(st)) {
    // 'processing' = documentos já enviados ao UaiID: o TTL do link não vale mais, segue esperando
    // (o backstop de 7 dias fica no job). Os demais não finais expiram junto com o link.
    if (st !== 'processing' && i.expiresAt && i.expiresAt.getTime() < i.now.getTime()) return out('expired', 'pending', true, 'expired');
    return out(st, 'in_progress', false);
  }
  if (st === 'manual_review') return out(st, 'uaiid_review', false, i.remote.reasonCode);
  if (st === 'rejected') return out(st, 'rejected', true, i.remote.reasonCode ?? 'rejected', null, i.remote.reasonCode === 'fraud_confirmed');
  if (st === 'cancelled' || st === 'expired') return out(st, 'pending', true, st);
  if (st !== 'approved') return out(st, 'in_progress', false); // status novo/desconhecido: espera

  // Identidade OK no UaiID — agora: essa pessoa é o titular do CRM?
  if (!i.cfm) return out(st, 'needs_admin', true, 'cfm_unavailable');
  const state = cfmState(i.cfm.situation);
  if (state === 'inactive') return out(st, 'rejected', true, 'crm_inactive');
  const cfmName = strictName(i.cfm.name);
  let nameMatch: boolean | null = null;
  if (i.documentName) {
    const docName = strictName(i.documentName);
    nameMatch = docName !== '' && docName === cfmName; // nome sem letras (vazio/só partículas) nunca casa
  } else if (typeof i.remote.nameRatio === 'number') {
    nameMatch = cfmName !== '' && i.remote.nameRatio >= 0.999; // declarado ao UaiID = nome do CFM (que precisa ter letras)
  }
  if (nameMatch === null) return out(st, 'needs_admin', true, 'document_name_unavailable');
  if (!nameMatch) return out(st, 'needs_admin', true, 'name_mismatch', false);
  if (state === 'unknown') return out(st, 'needs_admin', true, 'cfm_situation_unknown', true);
  // Tudo verde. Política do dono (28/10/26): no começo todo médico passa pela fila (autoApprove 0).
  if (!i.autoApprove) return out(st, 'needs_admin', true, 'manual_policy', true);
  return out(st, 'approved', true, null, true);
}
