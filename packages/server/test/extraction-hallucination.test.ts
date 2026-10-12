// ANTI-ALUCINAÇÃO — regressão do caso real: IA citou "Espermatozoide" em exame de URINA
// de paciente feminina (item inexistente no laudo, inventado pelo modelo GLM). Cobertura:
// 1) validação pós-extração descarta item sem respaldo no texto do documento (fuzzy/OCR);
// 2) prompts de extração carregam as regras explícitas anti-alucinação;
// 3) resumo recebe contexto de gênero + regra "só comenta o que foi medido".
import { describe, it, expect, vi, afterEach } from 'vitest';
import { filterUnbackedItems, itemBackedByText } from '../src/extraction/pipeline';
import { LAB_INSTRUCTIONS, LAB_MULTI_INSTRUCTIONS } from '../src/extraction/claude';
import { ANTI_HALLUCINATION_RULES, genderContextText } from '../src/analysis/health-summary';

// Texto real de um exame de urina (EAS) — sem NENHUMA menção a espermatozoide/PSA.
const URINE_TEXT = [
  'LABORATORIO SANTA CASA - EXAME DE URINA TIPO 1',
  'Paciente: Melissa   Data de coleta: 05/10/2026   Posto: Centro',
  'EXAME FISICO-QUIMICO E SEDIMENTO',
  'Aspecto: limpido   Cor: amarelo-ambar   Densidade: 1.015   pH: 6.5',
  'Leucocitos: aumento acentuado (referencia: ausente)',
  'Nitrito: positivo',
  'Proteinas: presentes (cruz)   Glicose: ausente   Corpos cetonicos: ausentes',
  'Sangue oculto: presente   Bilirrubina: ausente   Urobilinogenio: normal',
  'SEDIMENTO: Leucocitos numerosos; Hemacias 2-4 por campo; Bacterias: numerosas',
  'Celulas epiteliais: poucas   Cilindros: ausentes   Muco: presente',
  'CONCLUSAO: quadro compativel com infeccao do trato urinario',
  'Responsavel tecnico: CRBM 12345   Liberado em 06/10/2026 14:20',
].join('\n');

type Row = { name: string; nameCanonical: string | null };
const row = (name: string, nameCanonical: string | null = null): Row => ({ name, nameCanonical });

afterEach(() => vi.restoreAllMocks());

describe('filterUnbackedItems — validação pós-extração (anti-alucinação)', () => {
  it('DESCARTA item alucinado ("Espermatozoide") que não aparece no texto de urina, mantém os reais', () => {
    const rows = [
      row('Leucócitos'),
      row('Nitrito'),
      row('Proteínas'),
      row('Hemácias'),
      row('Bactérias'),
      row('Espermatozoide'), // alucinação do modelo — NÃO está no documento
    ];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = filterUnbackedItems(URINE_TEXT, rows, 'exam-test');
    expect(out.map((r) => r.name)).toEqual(['Leucócitos', 'Nitrito', 'Proteínas', 'Hemácias', 'Bactérias']);
    // log de auditoria nomeia o item descartado
    expect(warn).toHaveBeenCalled();
    const logged = warn.mock.calls.map((c) => c.join(' ')).join(' ');
    expect(logged).toContain('ANTI-ALUCINAÇÃO');
    expect(logged).toContain('Espermatozoide');
  });

  it('descarta alucinação multi-palavra ("Antígeno Prostático Específico" em urina)', () => {
    const out = filterUnbackedItems(URINE_TEXT, [row('Antígeno Prostático Específico')]);
    expect(out).toHaveLength(0);
  });

  it('MANTÉM o item quando o analito REALMENTE consta no documento (caso: urina que traz espermatozoide)', () => {
    const textWith = URINE_TEXT.replace('Muco: presente', 'Muco: presente   Espermatozoideos: raros por campo');
    const out = filterUnbackedItems(textWith, [row('Espermatozoide')]);
    expect(out).toHaveLength(1);
  });

  it('tolera ruído de OCR (1-2 edições): "GLICEM1A" no texto vs item "Glicemia"', () => {
    const text = URINE_TEXT + '\nGLICEM1A: 92 mg/dL (referencia 70-99)';
    expect(filterUnbackedItems(text, [row('Glicemia')])).toHaveLength(1);
  });

  it('sigla curta não validável (Hb, pH) é MANTIDA (conservador — não joga fora o que não dá pra conferir)', () => {
    expect(filterUnbackedItems(URINE_TEXT, [row('Hb'), row('pH')])).toHaveLength(2);
  });

  it('texto insuficiente (OCR falhou / doc ilegível) NÃO filtra — evita descartar itens legítimos', () => {
    const shortText = 'Exame de urina sem texto legível';
    expect(filterUnbackedItems(shortText, [row('Espermatozoide')])).toHaveLength(1);
    expect(filterUnbackedItems('', [row('Espermatozoide')])).toHaveLength(1);
  });

  it('usa nameCanonical como fallback quando o nome impresso não casa direto', () => {
    // nome extraído truncado pelo modelo, mas o canônico bate com o texto
    expect(itemBackedByText('Leucoc', 'LEUCOCITOS', URINE_TEXT)).toBe(true);
    expect(itemBackedByText('Xyzabc', 'Espermatozoide', URINE_TEXT)).toBe(false);
  });

  it('item sem NENHUM token no texto é descartado mesmo com valor plausível (alucinação de valor+nome)', () => {
    const out = filterUnbackedItems(URINE_TEXT, [
      { ...row('Creatinina'), valueNumeric: 0.9 } as any,
    ]);
    expect(out).toHaveLength(0);
  });
});

describe('LAB_INSTRUCTIONS / LAB_MULTI_INSTRUCTIONS — regras anti-alucinação no prompt', () => {
  it('prompt de extração SINGLE contém as regras críticas', () => {
    expect(LAB_INSTRUCTIONS).toContain('REGRAS CRÍTICAS');
    expect(LAB_INSTRUCTIONS).toContain('EXTRAIA APENAS o que está ESCRITO no documento');
    expect(LAB_INSTRUCTIONS).toContain('NUNCA adicione, infira ou complete analitos');
    expect(LAB_INSTRUCTIONS).toContain('NÃO invente unidades, valores de referência ou nomes de analitos');
  });

  it('prompt MULTI (caminho primário do pipeline) contém as mesmas regras', () => {
    expect(LAB_MULTI_INSTRUCTIONS).toContain('REGRAS CRÍTICAS');
    expect(LAB_MULTI_INSTRUCTIONS).toContain('EXTRAIA APENAS o que está ESCRITO no documento');
    expect(LAB_MULTI_INSTRUCTIONS).toContain('NUNCA adicione, infira ou complete analitos');
  });

  it('ambos proíbem completar painéis com analitos típicos (caso espermatozoide/urina)', () => {
    for (const p of [LAB_INSTRUCTIONS, LAB_MULTI_INSTRUCTIONS]) {
      expect(p).toContain('NUNCA complete painéis');
      expect(p.toLowerCase()).toContain('espermatozoide');
    }
  });
});

describe('health-summary — contexto de gênero + regra anti-alucinação', () => {
  it('paciente feminino recebe contexto de gênero que veta achados exclusivos do sexo masculino', () => {
    const txt = genderContextText('female');
    expect(txt).toContain('sexo feminino');
    expect(txt).toContain('não cite achados exclusivos do sexo masculino');
    expect(txt).toContain('espermatozoide');
  });

  it('paciente masculino recebe o espelho (veta achados exclusivos do sexo feminino)', () => {
    const txt = genderContextText('male');
    expect(txt).toContain('sexo masculino');
    expect(txt).toContain('não cite achados exclusivos do sexo feminino');
  });

  it('sexo não informado → sem bloco de gênero (prompt não trava)', () => {
    expect(genderContextText(null)).toBe('');
    expect(genderContextText(undefined)).toBe('');
    expect(genderContextText('')).toBe('');
  });

  it('ANTI_HALLUCINATION_RULES proíbe comentar o que não foi medido', () => {
    expect(ANTI_HALLUCINATION_RULES).toContain('EXPLICITAMENTE');
    expect(ANTI_HALLUCINATION_RULES).toContain('NÃO comente sobre ele');
  });
});
