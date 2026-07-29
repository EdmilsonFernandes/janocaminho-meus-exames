import { describe, it, expect } from 'vitest';
import { computeIdentityMatch } from '../src/extraction/pipeline';
import { cpfFingerprint } from '../src/utils/cpf';

const CPF_A = '123.456.789-09';
const CPF_B = '987.654.321-00';

describe('computeIdentityMatch — gate de identidade (bloqueia bônus de 1º exame se CPF diverge)', () => {
  it('CPF do doc = CPF do perfil → cpfMatch true (identidade OK → ganha bônus)', () => {
    const m = computeIdentityMatch({ patientCpf: CPF_A }, { cpfHash: cpfFingerprint(CPF_A) });
    expect(m.method).toBe('cpf');
    expect(m.cpfMatch).toBe(true);
    expect(m.mismatch).toBe(false);
  });

  it('CPF do doc ≠ CPF do perfil → cpfMatch false (hard_block → BLOQUEIA bônus, anti-farm)', () => {
    const m = computeIdentityMatch({ patientCpf: CPF_A }, { cpfHash: cpfFingerprint(CPF_B) });
    expect(m.method).toBe('cpf');
    expect(m.cpfMatch).toBe(false);
    expect(m.mismatch).toBe(true);
    expect(m.severity).toBe('hard_block');
  });

  it('doc sem CPF → name_fallback (não invalida → concede, não há como comparar)', () => {
    const m = computeIdentityMatch({}, { cpfHash: cpfFingerprint(CPF_A) });
    expect(m.method).toBe('name_fallback');
    expect(m.cpfMatch).toBeNull();
    expect(m.mismatch).toBe(false);
  });

  it('perfil sem cpfHash → name_fallback (usuário sem CPF cadastrado)', () => {
    const m = computeIdentityMatch({ patientCpf: CPF_A }, { cpfHash: null });
    expect(m.method).toBe('name_fallback');
    expect(m.cpfMatch).toBeNull();
  });

  it('aceita CPF em chaves alternativas (cpf / patientCPF)', () => {
    expect(computeIdentityMatch({ cpf: CPF_A }, { cpfHash: cpfFingerprint(CPF_A) }).cpfMatch).toBe(true);
    expect(computeIdentityMatch({ patientCPF: CPF_A }, { cpfHash: cpfFingerprint(CPF_A) }).cpfMatch).toBe(true);
  });
});
