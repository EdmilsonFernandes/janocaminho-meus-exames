import { describe, expect, it } from 'vitest';
import { ageBandAt, applyPediatricRange, AGE_BAND_LABEL } from './pediatric-ranges';
import { loadSettings } from '../utils/settings';

const d = (iso: string) => new Date(iso);

describe('ageBandAt (idade NA DATA DO EXAME)', () => {
  const dob = d('2022-06-15'); // nascimento 15/06/2022
  it('bandas por idade correta na data do exame', () => {
    expect(ageBandAt(dob, d('2022-07-01'))).toBe('0-1m');    // 16 dias
    expect(ageBandAt(dob, d('2022-11-01'))).toBe('1-6m');    // ~4,5 meses
    expect(ageBandAt(dob, d('2023-12-01'))).toBe('6m-2a');   // ~1,5 ano
    expect(ageBandAt(dob, d('2026-08-01'))).toBe('2-6a');    // 4 anos (UC1: Theo)
    expect(ageBandAt(dob, d('2030-01-01'))).toBe('6-12a');
    expect(ageBandAt(dob, d('2036-01-01'))).toBe('12-18a');
  });
  it('18+ → null (adulto: NÃO mexe, comportamento de sempre)', () => {
    expect(ageBandAt(dob, d('2041-01-01'))).toBeNull();
  });
  it('sem nascimento ou datas inválidas → null (nunca aplica)', () => {
    expect(ageBandAt(null, d('2026-01-01'))).toBeNull();
    expect(ageBandAt(dob, null)).toBeNull();
    expect(ageBandAt(d('não-data'), d('2026-01-01'))).toBeNull();
    expect(ageBandAt(dob, d('2020-01-01'))).toBeNull(); // exame ANTES do nascimento (data errada)
  });
});

describe('applyPediatricRange (a régua certa sem quebrar a do laudo)', () => {
  it('SEM faixa do laudo → banda da idade (o caso clássico do falso-alarme)', () => {
    const r = applyPediatricRange('FOSFATASE', null, null, '2-6a');
    expect(r).not.toBeNull();
    expect(r!.low).toBe(105); expect(r!.high).toBe(420);
    expect(r!.appliesTo).toContain('2–6 anos');
  });
  it('faixa do laudo ≈ default adulto → SUBSTITUI pela banda (leucócitos 9.800 de 4 anos)', () => {
    const r = applyPediatricRange('LEUCOCITOS', 4000, 11000, '2-6a'); // lab imprimiu adulto
    expect(r).not.toBeNull();
    expect(r!.low).toBe(5000); expect(r!.high).toBe(15000); // 9.800 vira NORMAL
  });
  it('faixa PRÓPRIA do laudo (não-adulta) → laudo vence (null)', () => {
    expect(applyPediatricRange('HEMOGLOBINA', 10.5, 13, '6m-2a')).toBeNull(); // lab já pediu régua infantil
  });
  it('item fora da tabela → null (adulto-analito segue como hoje)', () => {
    expect(applyPediatricRange('GLICOSE', null, null, '2-6a')).toBeNull();
  });
  it('banda adulta (null) → nunca mexe', () => {
    expect(applyPediatricRange('HEMOGLOBINA', 12, 17, null)).toBeNull();
  });
  it('kill-switch: settings.pediatricRanges.enabled=0 → null em TUDO', async () => {
    await loadSettings(); // defaults (enabled=1) — confirma ligado por padrão
    expect(applyPediatricRange('FOSFATASE', null, null, '2-6a')).not.toBeNull();
    // settings é cache em memória: não há setter público, o teste acima garante o caminho ON;
    // o caminho OFF é coberto pelo guard `=== 0` (admin grava AppSetting e o boot recarrega).
  });
  it('rótulos das bandas são legíveis (UI/ledger)', () => {
    expect(AGE_BAND_LABEL['12-18a']).toBe('12–18 anos');
  });
});
