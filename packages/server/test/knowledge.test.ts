import { describe, it, expect } from 'vitest';
import { knowledgeFor } from '../src/analysis/knowledge';

// Valida que os cards .md existem e o loader resolve o path (dev e dist).
describe('knowledge (RAG loader)', () => {
  it('lê o card de diabetes', () => {
    const k = knowledgeFor('diabetes');
    expect(k).toBeTruthy();
    expect(k).toContain('Diabetes');
  });

  it('toda condição mapeada tem card .md', () => {
    for (const c of ['diabetes', 'prediabetes', 'hypertension', 'high_cholesterol', 'cardiovascular_risk', 'anemia']) {
      expect(knowledgeFor(c), `card de ${c}`).toBeTruthy();
    }
  });

  it('condição sem card (none) -> null', () => {
    expect(knowledgeFor('none')).toBeNull();
  });
});
