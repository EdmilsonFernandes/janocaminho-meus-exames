// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { BodyMap } from './BodyMap';
import { DEMO_BODY_REGIONS } from './dashboard/demoData';

const theme = createTheme();

const renderBodyMap = (props: any) =>
  renderToString(
    <MemoryRouter>
      <ThemeProvider theme={theme}>
        <BodyMap {...props} />
      </ThemeProvider>
    </MemoryRouter>
  );

describe('BodyMap — Mapa Corporal Anatômico (Web & APK)', () => {
  it('renderiza com fallback gracioso quando regions for nulo ou vazio (proteção anti-crash)', () => {
    const htmlNull = renderBodyMap({ regions: null, loaded: false });
    expect(htmlNull).toContain('Mapa do seu Corpo');

    const htmlEmpty = renderBodyMap({ regions: [], loaded: true });
    expect(htmlEmpty).toContain('Mapa do seu Corpo');
  });

  it('renderiza os sistemas e hotspots com dados reais/demo (ex: Coração, Pâncreas, Cérebro)', () => {
    const html = renderBodyMap({ regions: DEMO_BODY_REGIONS, loaded: true });

    // Deve conter os órgãos mapeados
    expect(html).toContain('Coração &amp; vasos');
    expect(html).toContain('Pâncreas &amp; glicemia');
    expect(html).toContain('Cérebro &amp; tireoide');

    // Deve exibir o disclaimer médico explícito
    expect(html).toContain('não representam um diagnóstico clínico');
  });

  it('renderiza ilustração anatômica leve e hotspots percentuais calibrados', () => {
    const html = renderBodyMap({ regions: DEMO_BODY_REGIONS, loaded: true });

    expect(html).toMatch(/body-(organs-glow\.png|xray\.webp)/);
    expect(html).toContain('Coração &amp; vasos: Fora da referência');
  });
});
