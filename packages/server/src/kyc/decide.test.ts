import { describe, it, expect } from 'vitest';
import { decideDoctorVerification, strictName, type DecisionInput } from './decide';

const now = new Date('2026-10-28T12:00:00Z');
const base = (over: Partial<DecisionInput> = {}): DecisionInput => ({
  remote: { status: 'approved', reasonCode: null, nameRatio: null },
  expiresAt: null,
  documentName: 'Maria da Silva Souza',
  cfm: { name: 'MARIA SILVA SOUZA', situation: 'Ativo' },
  autoApprove: true,
  now,
  ...over,
});
const remote = (status: string, reasonCode: string | null = null, nameRatio: number | null = null) => ({ status, reasonCode, nameRatio });

describe('strictName', () => {
  it('tira pontuação, acento, caixa e partículas', () => {
    expect(strictName("Maria-José D'Ávila dos Santos")).toBe('MARIA JOSE D AVILA SANTOS');
    expect(strictName('  joão  da   silva ')).toBe('JOAO SILVA');
  });
});

describe('decideDoctorVerification (spec §4)', () => {
  it('em andamento → in_progress, não final', () => {
    expect(decideDoctorVerification(base({ remote: remote('collecting') }))).toMatchObject({ doctorStatus: 'in_progress', final: false });
  });
  it('em andamento com link vencido → tentativa expired, médico pending', () => {
    expect(decideDoctorVerification(base({ remote: remote('collecting'), expiresAt: new Date('2026-10-28T11:00:00Z') })))
      .toMatchObject({ attemptStatus: 'expired', doctorStatus: 'pending', final: true });
  });
  it('status desconhecido → espera (in_progress)', () => {
    expect(decideDoctorVerification(base({ remote: remote('queued') }))).toMatchObject({ doctorStatus: 'in_progress', final: false });
  });
  it('manual_review → uaiid_review (decide no painel do UaiID)', () => {
    expect(decideDoctorVerification(base({ remote: remote('manual_review', 'document_not_recognized') })))
      .toMatchObject({ doctorStatus: 'uaiid_review', reason: 'document_not_recognized', final: false });
  });
  it('rejected comum → rejected sem fraude; fraud_confirmed → fraude', () => {
    expect(decideDoctorVerification(base({ remote: remote('rejected', 'face_mismatch') }))).toMatchObject({ doctorStatus: 'rejected', fraud: false });
    expect(decideDoctorVerification(base({ remote: remote('rejected', 'fraud_confirmed') }))).toMatchObject({ doctorStatus: 'rejected', fraud: true });
  });
  it('cancelled → pending', () => {
    expect(decideDoctorVerification(base({ remote: remote('cancelled') }))).toMatchObject({ doctorStatus: 'pending', final: true });
  });
  it('approved + nome igual (estrito) + CFM ativo → approved', () => {
    expect(decideDoctorVerification(base())).toMatchObject({ doctorStatus: 'approved', nameMatch: true, final: true });
  });
  it('approved + "Souza" × "Santos" (passaria nos 0.75 do UaiID) → needs_admin name_mismatch', () => {
    expect(decideDoctorVerification(base({ documentName: 'Maria Silva Santos' })))
      .toMatchObject({ doctorStatus: 'needs_admin', reason: 'name_mismatch', nameMatch: false });
  });
  it('approved sem nome do webhook: ratio 1 → approved; 0.9 → name_mismatch; null → document_name_unavailable', () => {
    expect(decideDoctorVerification(base({ documentName: null, remote: remote('approved', null, 1) }))).toMatchObject({ doctorStatus: 'approved' });
    expect(decideDoctorVerification(base({ documentName: null, remote: remote('approved', null, 0.9) }))).toMatchObject({ doctorStatus: 'needs_admin', reason: 'name_mismatch' });
    expect(decideDoctorVerification(base({ documentName: null }))).toMatchObject({ doctorStatus: 'needs_admin', reason: 'document_name_unavailable' });
  });
  it('approved sem snapshot do CFM → needs_admin cfm_unavailable', () => {
    expect(decideDoctorVerification(base({ cfm: null }))).toMatchObject({ doctorStatus: 'needs_admin', reason: 'cfm_unavailable' });
  });
  it('approved com CFM "Inativo" → rejected crm_inactive', () => {
    expect(decideDoctorVerification(base({ cfm: { name: 'MARIA SILVA SOUZA', situation: 'Inativo' } })))
      .toMatchObject({ doctorStatus: 'rejected', reason: 'crm_inactive' });
  });
  it('approved com situação desconhecida → needs_admin cfm_situation_unknown', () => {
    expect(decideDoctorVerification(base({ cfm: { name: 'MARIA SILVA SOUZA', situation: '' } })))
      .toMatchObject({ doctorStatus: 'needs_admin', reason: 'cfm_situation_unknown' });
  });
  it('tudo verde com autoApprove desligado (política do começo) → needs_admin manual_policy', () => {
    expect(decideDoctorVerification(base({ autoApprove: false })))
      .toMatchObject({ doctorStatus: 'needs_admin', reason: 'manual_policy', nameMatch: true, final: true });
  });
});
