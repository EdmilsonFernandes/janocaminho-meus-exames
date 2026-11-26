import { describe, it, expect } from 'vitest';
import { photoReadNotice } from './photoReadNotice';

describe('photoReadNotice', () => {
  it('sem leitura dupla → sem aviso', () => {
    expect(photoReadNotice(null)).toBeNull();
    expect(photoReadNotice(undefined)).toBeNull();
    expect(photoReadNotice({ unsure: ['PCT'] })).toBeNull();
  });
  it('sempre pede para conferir com o papel, mesmo sem dúvidas', () => {
    const n = photoReadNotice({ by: 'vision', unsure: [], refDropped: [] })!;
    expect(n.title).toBe('Lido de uma foto difícil');
    expect(n.lines[0]).toContain('Confira os valores');
    expect(n.lines).toHaveLength(2);
  });
  it('lista o que ficou de fora e o que ficou sem faixa (singular e plural)', () => {
    const um = photoReadNotice({ by: 'vision', unsure: ['PCT'], refDropped: ['PLT'] })!;
    expect(um.lines[1]).toBe('Não deu para ler com certeza e ficou de fora: PCT.');
    expect(um.lines[2]).toBe('Sem faixa de referência (não deu para ler): PLT.');
    const varios = photoReadNotice({ by: 'vision', unsure: ['PCT', 'MPV', 'PCT', ' '] })!;
    expect(varios.lines[1]).toBe('Não deu para ler com certeza e ficaram de fora: PCT e MPV.');
  });
  it('lista longa é cortada em 8 com "e mais N"', () => {
    const n = photoReadNotice({ by: 'vision', unsure: Array.from({ length: 11 }, (_, i) => `E${i}`) })!;
    expect(n.lines[1]).toContain('E7 e mais 3.');
    expect(n.lines[1]).not.toContain('E8');
  });
});
