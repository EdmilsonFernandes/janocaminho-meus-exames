import { describe, it, expect } from 'vitest';
import { matchGuidelines, guidelinesBlock, guidelinesContext, extractSources } from './guidelines';

// FEATURE C — diretrizes com citação. Testes PUROS (sem DB/LLM): matcher de marcadores,
// bloco de prompt e o parser determinístico de sources [FONTE ANO].

describe('matchGuidelines', () => {
  it('casa por nameCanonical do exame (mesma chave do normalize.ts)', () => {
    const topics = matchGuidelines(['GLICEMIA', 'HEMOGLOBINA_GLICADA']).map((g) => g.topic);
    expect(topics).toContain('glicemia-hba1c');
  });

  it('casa múltiplos temas de uma vez (LDL + TSH)', () => {
    const topics = matchGuidelines(['LDL', 'TSH']).map((g) => g.topic);
    expect(topics).toEqual(expect.arrayContaining(['colesterol-ldl', 'tsh-tireoide']));
  });

  it('casa por texto livre da pergunta, com acento stripado', () => {
    expect(matchGuidelines([], 'minha pressão está alta').map((g) => g.topic)).toContain('pressao-arterial');
    expect(matchGuidelines([], 'como está minha vitamina D?').map((g) => g.topic)).toContain('vitamina-d');
  });

  it('não casa marcador sem relação (VITAMINA_B12 ≠ vitamina-d)', () => {
    expect(matchGuidelines(['VITAMINA_B12'])).toHaveLength(0);
    expect(matchGuidelines([], 'que horas são?')).toHaveLength(0);
  });

  it('bloco nulo sem match e com bullets quando há match', () => {
    expect(guidelinesBlock(matchGuidelines(['CREATININA']))).toBeNull();
    const block = guidelinesBlock(matchGuidelines(['FERRITINA']));
    expect(block).toMatch(/DIRETRIZES DE SOCIEDADES MÉDICAS/);
    expect(block).toMatch(/ferro-ferritina/);
    expect(block).toMatch(/cite a fonte no formato \[FONTE ANO\]/i);
    expect(block).toMatch(/sem diagnóstico/i);
  });

  it('kill-switch: guidelinesContext desligado não devolve nada', () => {
    const r = guidelinesContext(['GLICEMIA'], 'glicose', false);
    expect(r.block).toBeNull();
    expect(r.topics).toEqual([]);
  });
});

describe('extractSources (parser determinístico)', () => {
  it('extrai, deduplica e preserva ordem de aparição', () => {
    const out = extractSources('Alvo <7% [SBD 2025]. Já o LDL [SBC 2024] ... e de novo [SBD 2025]');
    expect(out).toEqual([
      { label: 'SBD 2025', topic: 'geral' },
      { label: 'SBC 2024', topic: 'geral' },
    ]);
  });

  it('mapeia o tema pela diretriz ativa que cita aquela sociedade', () => {
    const topics = ['glicemia-hba1c', 'colesterol-ldl'];
    const out = extractSources('HbA1c <7% [SBD 2025]; LDL alto [SBC 2024]; alvo <55 [ESC 2021].', topics);
    expect(out.find((s) => s.label === 'SBD 2025')?.topic).toBe('glicemia-hba1c');
    expect(out.find((s) => s.label === 'SBC 2024')?.topic).toBe('colesterol-ldl');
    expect(out.find((s) => s.label === 'ESC 2021')?.topic).toBe('colesterol-ldl');
  });

  it('ignora colchetes de template/markdown sem ano de fonte', () => {
    expect(extractSources('exames de [mês/ano mais recente] e [não informada no contexto]')).toEqual([]);
    expect(extractSources('[número] 123 (ref 70-99)')).toEqual([]);
    expect(extractSources('')).toEqual([]);
  });

  it('ano fora de 19xx/20xx não é fonte', () => {
    expect(extractSources('conforme [SBC 3024] e [SBD 500]')).toEqual([]);
  });

  it('aceita sociedades multi-palavra curtas', () => {
    const out = extractSources('deficiência <20 ng/mL [SBEM 2024] e reservas baixas [SBH 2024].');
    expect(out.map((s) => s.label)).toEqual(['SBEM 2024', 'SBH 2024']);
  });
});
