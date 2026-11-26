import type { Theme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { SEM } from '../../tokens';
import type { Tone } from '../../utils/panoramaPresenter';

/**
 * Tons do Panorama — cor por estado com par light/dark (`SEM` de tokens.ts), nunca um hex solto.
 * Cor nunca trabalha sozinha: toda pílula colorida tem texto, toda linha de exame tem seta.
 */

/** Cor de TEXTO e de traço por tom. `neutral` (dado antigo, lista) segue o texto secundário. */
export const toneColor = (t: Theme, tone: Tone): string => {
  if (tone === 'neutral') return t.palette.text.secondary;
  return SEM[tone][t.palette.mode];
};

/** Lavagem de fundo da pílula por tom — opaca no claro (a linha de tendência passa por trás). */
export const toneWash = (t: Theme, tone: Tone): string => {
  if (tone === 'neutral') return t.palette.mode === 'dark' ? alpha('#ffffff', 0.10) : alpha('#64748b', 0.16);
  return alpha(SEM[tone].light, t.palette.mode === 'dark' ? 0.20 : 0.14);
};

/** Cor de um ponto/ícone de sinal (o "ponto" da pílula): tom cheio, legível nos dois modos. */
export const toneDot = (t: Theme, tone: Tone): string => (tone === 'neutral' ? t.palette.text.secondary : tone === 'warn' && t.palette.mode === 'light' ? '#d97706' : SEM[tone][t.palette.mode]);
