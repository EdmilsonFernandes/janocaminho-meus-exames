import { describe, it, expect, afterEach } from 'vitest';
import { practiceStatuses, doctorCanPractice, doctorAccessDenial } from '../src/utils/doctorAccess';
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
});
