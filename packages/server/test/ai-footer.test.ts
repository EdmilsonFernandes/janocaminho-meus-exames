import { describe, it, expect } from 'vitest';
import { appendAiFooter, AI_DISCLOSURE_MARK } from '../src/utils/aiFooter';

// CFM 2.454/2026: registro do uso de IA como apoio em todo documento clínico gerado
// pela plataforma — carimbo fixo (não gerado pela IA), idempotente p/ edições do médico.
describe('appendAiFooter (Res. CFM 2.454/2026)', () => {
  it('anexa o disclosure com a marca da resolução', () => {
    const out = appendAiFooter('## A (Avaliação)\n- Nota clínica');
    expect(out).toContain(AI_DISCLOSURE_MARK);
    expect(out).toContain('médico responsável');
    expect(out.startsWith('## A (Avaliação)')).toBe(true); // conteúdo preservado
    expect(out).toMatch(/---\n> 📋/); // formato markdown de citação
  });

  it('é idempotente: texto já carimbado não recebe 2ª cópia', () => {
    const once = appendAiFooter('Resumo');
    expect(appendAiFooter(once)).toBe(once);
  });

  it('não carimba string vazia/whitespace', () => {
    expect(appendAiFooter('')).toBe('');
    expect(appendAiFooter('   ')).toBe('   ');
  });

  it('edita preservando marca que o médico manteve (ex.: corte do fim)', () => {
    const once = appendAiFooter('Resumo');
    const edited = once.replace('A decisão clínica é do médico.', ''); // médico editou o fim
    if (edited.includes(AI_DISCLOSURE_MARK)) expect(appendAiFooter(edited)).toBe(edited);
  });
});
