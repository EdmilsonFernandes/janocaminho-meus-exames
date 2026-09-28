import { describe, expect, it } from 'vitest';
import { appendTranscript } from './append-transcript';

describe('appendTranscript (ditado por voz)', () => {
  it('input vazio + final → só o final', () => {
    expect(appendTranscript('', '', 'o que significa TSH alto')).toBe('o que significa TSH alto');
  });

  it('input vazio + parcial → mostra o parcial (feedback ao vivo)', () => {
    expect(appendTranscript('', 'o que signif', '')).toBe('o que signif');
  });

  it('já havia texto + final → anexa com espaço (nunca colado)', () => {
    expect(appendTranscript('Doutor,', '', 'o que significa TSH alto?')).toBe('Doutor, o que significa TSH alto?');
  });

  it('já havia texto com espaço sobrando → não duplica o espaço', () => {
    expect(appendTranscript('Doutor, ', '', 'TSH alto?')).toBe('Doutor, TSH alto?');
  });

  it('final tem prioridade sobre o parcial (mesma frase consolidada)', () => {
    expect(appendTranscript('pergunta', 'o que signif', 'o que significa ferritina baixa?'))
      .toBe('pergunta o que significa ferritina baixa?');
  });

  it('nada novo (parcial e final vazios/só espaço) → devolve o current INTACTO', () => {
    expect(appendTranscript('texto do usuário', '   ', '')).toBe('texto do usuário');
  });

  it('parcial com espaços nas pontas → trim antes de anexar', () => {
    expect(appendTranscript('base', '  parcial  ', '')).toBe('base parcial');
  });

  it('current só com espaços + final → vira só o final', () => {
    expect(appendTranscript('   ', '', 'vitamina D')).toBe('vitamina D');
  });
});
