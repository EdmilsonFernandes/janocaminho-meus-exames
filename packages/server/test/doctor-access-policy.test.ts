import { describe, it, expect, afterEach } from 'vitest';
import { practiceStatuses, doctorCanPractice, doctorAccessDenial, doctorMayPractice } from '../src/utils/doctorAccess';
import { saveSettings } from '../src/utils/settings';

describe('doctorAccess — política única (spec §7)', () => {
  afterEach(async () => { await saveSettings('doctorKyc', { legacyGraceUntilMs: 0, autoApprove: 0 }); });

  it('approved pode; os demais status (fora legacy) não', () => {
    expect(doctorCanPractice('approved')).toBe(true);
    for (const s of ['pending', 'in_progress', 'uaiid_review', 'needs_admin', 'rejected', '', null, undefined]) {
      expect(doctorCanPractice(s as any)).toBe(false);
    }
  });

  it('legacy: sem prazo (0) pode; com prazo, só antes dele', async () => {
    expect(practiceStatuses()).toEqual(['approved', 'legacy']);
    await saveSettings('doctorKyc', { legacyGraceUntilMs: new Date('2026-12-01T00:00:00Z').getTime() });
    expect(doctorCanPractice('legacy', new Date('2026-11-30T23:59:00Z'))).toBe(true);
    expect(doctorCanPractice('legacy', new Date('2026-12-01T00:00:01Z'))).toBe(false);
    expect(practiceStatuses(new Date('2026-12-02T00:00:00Z'))).toEqual(['approved']);
  });

  it('bloqueado → DOCTOR_BLOCKED, mesmo com allowUnverified e approved', () => {
    const d = doctorAccessDenial({ blocked: true, blockedReason: 'kyc_fraud', verificationStatus: 'approved' }, { allowUnverified: true });
    expect(d?.status).toBe(403);
    expect(d?.body).toMatchObject({ blocked: true, code: 'DOCTOR_BLOCKED', reason: 'kyc_fraud' });
  });

  it('não verificado → VERIFICATION_REQUIRED com o status; allowUnverified libera', () => {
    const d = doctorAccessDenial({ blocked: false, verificationStatus: 'pending' });
    expect(d?.status).toBe(403);
    expect(d?.body).toMatchObject({ code: 'VERIFICATION_REQUIRED', status: 'pending' });
    expect(doctorAccessDenial({ blocked: false, verificationStatus: 'pending' }, { allowUnverified: true })).toBeNull();
    expect(doctorAccessDenial({ blocked: false, verificationStatus: 'approved' })).toBeNull();
  });

  // Predicado dos canais FORA do HTTP (e-mail/push/jobs) — mesma regra do gate, sem allowUnverified.
  it('doctorMayPractice: só quem não está bloqueado E tem status que atende (concorda com doctorAccessDenial)', () => {
    expect(doctorMayPractice({ blocked: false, verificationStatus: 'approved' })).toBe(true);
    expect(doctorMayPractice({ blocked: false, verificationStatus: 'legacy' })).toBe(true); // sem prazo configurado
    for (const s of ['pending', 'in_progress', 'needs_admin', 'uaiid_review', 'rejected', '', null, undefined]) {
      expect(doctorMayPractice({ blocked: false, verificationStatus: s as string | null | undefined })).toBe(false);
    }
    expect(doctorMayPractice({ blocked: true, verificationStatus: 'approved' })).toBe(false); // bloqueio vence tudo
    expect(doctorMayPractice({ blocked: null, verificationStatus: 'approved' })).toBe(true);
    for (const row of [
      { blocked: false, verificationStatus: 'approved' }, { blocked: false, verificationStatus: 'pending' },
      { blocked: true, verificationStatus: 'approved' }, { blocked: false, verificationStatus: 'legacy' },
    ]) expect(doctorMayPractice(row)).toBe(doctorAccessDenial(row) === null);
  });

  it('doctorMayPractice respeita o prazo do legado (fora do prazo → não)', async () => {
    await saveSettings('doctorKyc', { legacyGraceUntilMs: Date.now() + 60_000, autoApprove: 0 });
    try {
      expect(doctorMayPractice({ blocked: false, verificationStatus: 'legacy' })).toBe(true);
      expect(doctorMayPractice({ blocked: false, verificationStatus: 'legacy' }, new Date(Date.now() + 120_000))).toBe(false);
    } finally {
      await saveSettings('doctorKyc', { legacyGraceUntilMs: 0, autoApprove: 0 });
    }
  });
});
