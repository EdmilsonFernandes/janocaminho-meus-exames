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
  it('NFD e NFC do mesmo nome dão o mesmo resultado (o acento combinante não parte a palavra)', () => {
    const nfc = 'João da Silva';
    const nfd = 'João da Silva'; // "ã" decomposto: "a" + til combinante
    expect(nfd).not.toBe(nfc);
    expect(nfc.normalize('NFD')).toBe(nfd);
    expect(strictName(nfd)).toBe('JOAO SILVA');
    expect(strictName(nfd)).toBe(strictName(nfc));
  });
  it('só partículas, só pontuação ou vazio → string vazia', () => {
    for (const v of ['de da', " - . ' ", '   ', '', null, undefined]) expect(strictName(v), String(v)).toBe('');
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

  // ---- fix round 1 (revisão: M1/M2/M3/M6 + política de autoApprove) ----
  it('aprovado: objeto de decisão exato (sem campos a mais ou a menos)', () => {
    expect(decideDoctorVerification(base())).toEqual({
      attemptStatus: 'approved', doctorStatus: 'approved', reason: null, nameMatch: true, fraud: false, final: true,
    });
  });
  it('autoApprove desligado NUNCA aprova: caso verde e variantes → needs_admin manual_policy', () => {
    const greens: Partial<DecisionInput>[] = [
      {},
      { cfm: { name: 'MARIA SILVA SOUZA', situation: 'Ativa' } },
      { documentName: '  maria   DA silva souza ' },
      { documentName: null, remote: remote('approved', null, 1) },
    ];
    for (const over of greens) {
      expect(decideDoctorVerification(base({ ...over, autoApprove: false })))
        .toMatchObject({ doctorStatus: 'needs_admin', reason: 'manual_policy', nameMatch: true, final: true });
    }
  });
  it('autoApprove desligado: nenhum status do UaiID produz approved', () => {
    for (const st of ['created', 'consent_pending', 'collecting', 'processing', 'challenge', 'manual_review', 'rejected', 'cancelled', 'expired', 'approved', 'queued']) {
      expect(decideDoctorVerification(base({ autoApprove: false, remote: remote(st) })).doctorStatus, st).not.toBe('approved');
    }
  });
  it('nome do documento (webhook assinado) divergente vence nameRatio=1', () => {
    expect(decideDoctorVerification(base({ documentName: 'Maria Silva Santos', remote: remote('approved', null, 1) })))
      .toMatchObject({ doctorStatus: 'needs_admin', reason: 'name_mismatch', nameMatch: false });
  });
  it('nome vazio ou só de partículas NUNCA casa (nem "vazio = vazio")', () => {
    const cases: Array<[string, string]> = [['de da', 'DA DE'], ['  ', '  '], ["' - '", '...'], ['de e', 'Maria Silva Souza'], ['Maria Silva Souza', '']];
    for (const [documentName, cfmName] of cases) {
      expect(decideDoctorVerification(base({ documentName, cfm: { name: cfmName, situation: 'Ativo' } })), `${documentName} × ${cfmName}`)
        .toMatchObject({ doctorStatus: 'needs_admin', reason: 'name_mismatch', nameMatch: false });
    }
    // sem nome do webhook, o ratio 1 também não vale se o nome do CFM não tem letras
    expect(decideDoctorVerification(base({ documentName: null, remote: remote('approved', null, 1), cfm: { name: 'de da', situation: 'Ativo' } })))
      .toMatchObject({ doctorStatus: 'needs_admin', reason: 'name_mismatch', nameMatch: false });
  });
  it('NFD × NFC do mesmo nome → casa (approved), nos dois sentidos', () => {
    const nfc = 'João da Silva Souza';
    const nfd = nfc.normalize('NFD');
    expect(nfd).not.toBe(nfc);
    expect(decideDoctorVerification(base({ documentName: nfd, cfm: { name: nfc.toUpperCase(), situation: 'Ativo' } })))
      .toMatchObject({ doctorStatus: 'approved', nameMatch: true });
    expect(decideDoctorVerification(base({ documentName: nfc, cfm: { name: nfd.toUpperCase(), situation: 'Ativo' } })))
      .toMatchObject({ doctorStatus: 'approved', nameMatch: true });
  });
  it('nameRatio ausente (undefined, não null) → document_name_unavailable, não name_mismatch', () => {
    const noRatio = { status: 'approved', reasonCode: null } as unknown as DecisionInput['remote'];
    expect(decideDoctorVerification(base({ documentName: null, remote: noRatio })))
      .toMatchObject({ doctorStatus: 'needs_admin', reason: 'document_name_unavailable' });
  });
  it('processing (já enviado ao UaiID) NÃO expira pelo TTL do link; os outros não finais expiram', () => {
    const expiresAt = new Date('2026-10-28T11:00:00Z');
    expect(decideDoctorVerification(base({ remote: remote('processing'), expiresAt })))
      .toMatchObject({ attemptStatus: 'processing', doctorStatus: 'in_progress', final: false });
    for (const st of ['created', 'consent_pending', 'collecting', 'challenge']) {
      expect(decideDoctorVerification(base({ remote: remote(st), expiresAt })), st)
        .toMatchObject({ attemptStatus: 'expired', doctorStatus: 'pending', final: true });
    }
  });
  it('CFM "Ativo" qualificado ("Ativo - Aposentado", "Ativo - Cassação") → needs_admin cfm_situation_unknown, nunca approved', () => {
    for (const situation of ['Ativo - Aposentado', 'Ativo - Cassação', 'Ativo (Provisório)']) {
      expect(decideDoctorVerification(base({ cfm: { name: 'MARIA SILVA SOUZA', situation } })), situation)
        .toMatchObject({ doctorStatus: 'needs_admin', reason: 'cfm_situation_unknown', nameMatch: true, final: true });
    }
  });
});
