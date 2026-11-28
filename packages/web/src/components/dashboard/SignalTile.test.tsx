// @vitest-environment node
/**
 * Tile "Risco cardíaco" do Início (28/11/26): o nível sai sempre em PALAVRA (não só cor) e o
 * estado sem leitura diz o que falta — nunca "Sem dados" solto nem número inventado.
 */
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CardioRiskTile } from './SignalTile';

const theme = createTheme();
const html = (el: React.ReactElement) => renderToString(<ThemeProvider theme={theme}>{el}</ThemeProvider>).replace(/<!-- -->/g, '');
const noop = () => undefined;

describe('CardioRiskTile', () => {
  it('nível baixo sem fatores: palavra "Baixo" e "nenhum fator de risco"', () => {
    const out = html(<CardioRiskTile risk={{ level: 'baixo', factors: [{ label: 'LDL', risk: false }] }} loaded hasExams onClick={noop} />);
    expect(out).toContain('Baixo');
    expect(out).toContain('nenhum fator de risco');
  });

  it('nível moderado conta os fatores no plural certo', () => {
    const out = html(<CardioRiskTile risk={{ level: 'moderado', factors: [{ label: 'LDL', risk: true }, { label: 'IMC', risk: true }] }} loaded hasExams onClick={noop} />);
    expect(out).toContain('Moderado');
    expect(out).toContain('2 fatores de risco');
  });

  it('sem leitura com exames: diz o que falta', () => {
    const out = html(<CardioRiskTile risk={null} loaded hasExams onClick={noop} />);
    expect(out).toContain('Sem leitura');
    expect(out).toContain('Falta colesterol, peso ou pressão');
    expect(out).not.toContain('Sem dados');
  });

  it('sem exame nenhum: convida a enviar', () => {
    const out = html(<CardioRiskTile risk={null} loaded hasExams={false} onClick={noop} />);
    expect(out).toContain('Envie um exame para calcular');
  });

  it('nível desconhecido do servidor não vira "Baixo" por engano', () => {
    const out = html(<CardioRiskTile risk={{ level: 'xyz', factors: [] }} loaded hasExams onClick={noop} />);
    expect(out).toContain('Sem leitura');
    expect(out).not.toContain('Baixo');
  });
});
