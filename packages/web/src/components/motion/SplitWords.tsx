/**
 * SplitWords — revelação de título palavra por palavra (padrão SplitText do react-bits,
 * portado p/ CSS puro: zero dependência de GSAP/motion).
 *
 * Cada palavra entra com opacity + translateY pequeno, escalonadas. Combina com o
 * motion system do projeto (mesma família de curva e duração curtas ~300-600ms).
 *
 * Regras respeitadas:
 *  - prefers-reduced-motion: CSS desliga a animação (palavras nascem visíveis).
 *  - Sem clip/overflow: acentos e descendentes ("É", "ç", "j") nunca são cortados.
 *  - Screen readers leem o texto completo (spans em ordem, nada de aria-hidden).
 *  - Layout: spans inline-block + espaços texto = quebra de linha natural no mobile.
 */
import { type CSSProperties } from 'react';

export interface SplitWordsSegment {
  /** Texto do trecho; é dividido em palavras que animam em sequência. */
  text: string;
  /** Classe aplicada a CADA palavra do trecho (ex.: cor de destaque). */
  className?: string;
  /** Estilo inline aplicado a cada palavra (ex.: SERIF_I da landing). */
  style?: CSSProperties;
  /** Força quebra de linha depois deste trecho. */
  br?: boolean;
}

const CSS_ID = 'dx-splitwords-css';
/** Injeta os keyframes uma única vez por página (idempotente). */
function ensureCss() {
  if (typeof document === 'undefined' || document.getElementById(CSS_ID)) return;
  const style = document.createElement('style');
  style.id = CSS_ID;
  style.textContent = `
@keyframes dxw-in { from { opacity: 0; translate: 0 .45em; } to { opacity: 1; translate: 0 0; } }
.dxw-wi { display: inline-block; animation: dxw-in 420ms cubic-bezier(0.22, 1, 0.36, 1) both; animation-delay: calc(var(--dxw-d) * 1ms); }
@media (prefers-reduced-motion: reduce) { .dxw-wi { animation: none; } }`;
  document.head.appendChild(style);
}
ensureCss();

interface SplitWordsProps {
  segments: SplitWordsSegment[];
  /** Delay inicial (ms) — encaixa na sequência de entrada da página (ex.: dx-rise --i). */
  delay?: number;
  /** Intervalo entre palavras (ms). */
  step?: number;
}

/** Divide "Veja o pico e o vale" em [palavra, espaço, palavra, …] preservando os espaços como texto. */
function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter((t) => t.length > 0);
}

export function SplitWords({ segments, delay = 0, step = 38 }: SplitWordsProps) {
  let index = 0;
  return (
    <>
      {segments.map((seg, si) => {
        const tokens = tokenize(seg.text);
        return (
          <span key={si}>
            {tokens.map((tok, ti) => {
              if (/^\s+$/.test(tok)) return tok; // espaço texto: quebra natural entre palavras
              const d = delay + index * step;
              index += 1;
              return (
                <span key={ti} className={`dxw-wi${seg.className ? ` ${seg.className}` : ''}`} style={{ ...seg.style, '--dxw-d': d } as CSSProperties}>
                  {tok}
                </span>
              );
            })}
            {seg.br ? <br /> : null}
          </span>
        );
      })}
    </>
  );
}
