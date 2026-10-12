// @vitest-environment node
/**
 * ProductPreview — contrato de render via renderToString (SSR puro, mesma
 * convenção do Celebration.test): as 5 telas, captions e a11y de carrossel.
 * (Interação de scroll/setas fica pro QA visual — aqui é o contrato estático.)
 */
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import { ProductPreview } from './ProductPreview';

const html = () => renderToString(
  <ThemeProvider theme={createTheme()}>
    <ProductPreview />
  </ThemeProvider>,
);

describe('ProductPreview — vitrine do produto', () => {
  it('renderiza header e as 5 telas com tag de benefício', () => {
    const h = html();
    expect(h).toContain('Veja o que você recebe');
    for (const tag of ['Score + Idade Biológica', 'Resumo com IA', 'Chat com IA', 'Saúde Esportiva', 'Portal do Médico']) {
      expect(h).toContain(tag);
    }
  });

  it('carrossel acessível: region/roledescription e slides rotulados', () => {
    const h = html();
    expect(h).toContain('aria-roledescription="carrossel"');
    expect(h).toContain('aria-roledescription="slide"');
    expect(h).toContain('1 de 5');
  });

  it('sem autoplay no markup (reduced-motion safe por natureza)', () => {
    const h = html();
    expect(h).not.toContain('setInterval');
    expect(h).not.toContain('autoplay');
  });

  it('valores ilustrativos rotulados (honestidade: nada passa por dado real)', () => {
    const h = html();
    expect(h).toContain('exemplo');
  });
});
