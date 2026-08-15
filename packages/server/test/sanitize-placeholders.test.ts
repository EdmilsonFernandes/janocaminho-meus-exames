import { describe, it, expect } from 'vitest';
import { sanitizePlaceholders } from '../src/analysis/health-summary';

// Regressão do incidente de produção: a IA copiou o template "exames de [mês/ano mais recente]"
// → "[data não informada no contexto]" para o texto final do relatório do paciente.
describe('sanitizePlaceholders (anti-placeholder do relatório)', () => {
  it('remove placeholder de data vazado no resumoGeral', () => {
    const out = sanitizePlaceholders({
      resumoGeral: 'Ed, esta análise considera principalmente os exames de [data não informada no contexto]. Tudo bem.',
    });
    expect(out.resumoGeral).not.toMatch(/\[/);
    expect(out.resumoGeral).toContain('Tudo bem.');
  });

  it('remove variantes de template (mês/ano, contexto, placeholder)', () => {
    const variants = [
      'exames de [mês/ano mais recente]',
      'valor [não informado pelo laboratório]',
      'dados do [contexto]',
      'campo [TODO preencher]',
    ];
    for (const v of variants) {
      expect(sanitizePlaceholders({ t: `Antes. ${v} Depois.` }).t).not.toContain('[');
    }
  });

  it('preserva texto legítimo com colchetes clínicos', () => {
    const ok = 'Referência [0,4–4,0] µUI/mL e sigla [TSH].';
    expect(sanitizePlaceholders({ t: ok }).t).toBe(ok);
  });

  it('limpa profundo (arrays e objetos aninhados)', () => {
    const out = sanitizePlaceholders({
      pontosAtencao: [{ titulo: 'Testosterona Baixa', detalhe: 'ver [mês/ano mais recente] no laudo' }],
      perguntasParaOMedico: ['Pergunta [indefinida] 1', 'Pergunta ok 2'],
    });
    expect(out.pontosAtencao[0].detalhe).not.toContain('[');
    expect(out.perguntasParaOMedico[0]).not.toContain('[');
    expect(out.perguntasParaOMedico[1]).toBe('Pergunta ok 2');
  });
});
