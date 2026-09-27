import type { KeyboardEvent } from 'react';

/**
 * chipA11y — Chip clicável acessível por TECLADO (F3 do audit 27/09): MUI Chip com
 * onClick não recebe role/foco por padrão — leitor de tela anuncia "texto" e Tab pula.
 * Uso: <Chip onClick={...} {...chipA11y(ativo)} /> (ativo → aria-pressed p/ toggle).
 */
export const chipA11y = (pressed?: boolean) => ({
  role: 'button' as const,
  tabIndex: 0,
  ...(pressed !== undefined ? { 'aria-pressed': pressed } : {}),
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      (e.currentTarget as HTMLElement).click();
    }
  },
});
