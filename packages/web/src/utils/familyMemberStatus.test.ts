import { describe, it, expect } from 'vitest';
import { familyMemberStatus } from './familyMemberStatus';

/**
 * Família — regressão da falsa calma (bug 27/10/26): perfil SEM exame aparecia com
 * "✓ Todos os marcadores na meta" porque `abnormalCount === 0`.
 */
describe('familyMemberStatus', () => {
  const semExame = { abnormalCount: 0, score: null, examTitle: null, performedAt: null };

  it('sem exame → "sem-exame", nunca "na meta"', () => {
    expect(familyMemberStatus(semExame)).toBe('sem-exame');
  });

  it('com exame e nada alterado → na meta', () => {
    expect(familyMemberStatus({ ...semExame, score: 100, examTitle: 'Hemograma + Bioquímica', performedAt: '2026-07-31' })).toBe('na-meta');
    // qualquer sinal de exame basta (score pode faltar quando o exame não tem itens pontuáveis)
    expect(familyMemberStatus({ ...semExame, performedAt: '2026-07-31' })).toBe('na-meta');
  });

  it('valores alterados → atenção', () => {
    expect(familyMemberStatus({ abnormalCount: 7, score: 53, examTitle: 'Hemograma', performedAt: '2026-10-22' })).toBe('atencao');
  });
});
