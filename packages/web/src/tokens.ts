/**
 * tokens — constantes PURAS do design system (zero import do MUI/tema → sem efeitos
 * colaterais em módulo; carregável em qualquer ambiente, inclusive testes node).
 * theme.ts RE-EXPORTA estes tokens (compat: imports existentes continuam funcionando).
 */

/** Raios consolidados (auditoria DS 04/09: 401 literais → escala de 4 valores).
 * ⚠️ DEVEM SER STRING (com px): o sx do MUI multiplica borderRadius NUMÉRICO por
 * theme.shape.borderRadius (14) — ex.: 12 vira 168px. String não é multiplicada. */
export const RADIUS = { sm: '8px', md: '12px', card: '16px', pill: '999px', button: '12px', tile: '12px', sectionCard: '12px' } as const;

/** Cobre premium — assinatura do portal do médico (modo "viewer clínico"); no app do
 *  paciente o ativo continua teal. Espelha palette.secondary (D4A574/B88A54). */
export const COPPER = { main: '#d4a574', deep: '#b88a54', textAA: '#8a5f2e', wash: 'rgba(212,165,116,.16)' } as const;

/** Estados SEMÂNTICOS com par DARK (auditoria DS P2): hex fixo foi a causa raiz dos
 *  surtos de contraste. Uso: sx={{ color: (t) => SEM.bad[t.palette.mode] }}.
 *  Light = hex históricos (modo claro não muda); dark = pares calibrados p/ as
 *  superfícies escuras (bg #0f1818 / paper #1a2424). */
export const SEM = {
  ok:      { light: '#047857', dark: '#34d399' },
  warn:    { light: '#b45309', dark: '#fbbf24' },
  bad:     { light: '#b91c1c', dark: '#f87171' },
  info:    { light: '#0369a1', dark: '#38bdf8' },
  premium: { light: '#6366f1', dark: '#a5b4fc' },
  tealDeep:{ light: '#0f6e68', dark: '#5fc9c3' },
} as const;
export type SemKey = keyof typeof SEM;
