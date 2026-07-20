import { defaultTheme } from 'react-admin';
import { createTheme, alpha, Theme } from '@mui/material/styles';

// Tema "Dr. Exame" — teal (#20B2AA) + cobre (#D4A574), robô mascote, cards arredondados,
// fontes Poppins (títulos) + Inter (texto). Vibe clínica + amigável + premium.
//
// DARK MODE: buildTheme(mode) gera um tema por modo. O react-admin recebe `theme` (light)
// + `darkTheme` (dark) e troca sozinho conforme a escolha do usuário (persistida em localStorage).
// Cores de MARCA (teal/cobre, gradientes dos botões) são idênticas nos dois modos — são acentos
// e legíveis nos dois. Só as SUPERFÍCIES (bg, texto, bordas) mudam, via tokens da paleta.

const FONT_BODY = '"Inter", "Segoe UI", Roboto, system-ui, -apple-system, sans-serif';
const FONT_HEAD = '"Poppins", "Inter", "Segoe UI", Roboto, system-ui, sans-serif';

// Paletas por modo. primary/secondary (marca) e semânticas iguais; só superfícies mudam.
const LIGHT_PALETTE = {
  background: { default: '#FAFBFC', paper: '#ffffff' },
  text: { primary: '#1a202c', secondary: '#64748b' },
  divider: 'rgba(0,0,0,.06)',
};
const DARK_PALETTE = {
  background: { default: '#0f1818', paper: '#1a2424' },
  text: { primary: '#e8eef0', secondary: '#94a3b8' },
  divider: '#2a3636',
};

const BRAND = {
  primary: { main: '#20b2aa', dark: '#178f89', light: '#5fc9c3', contrastText: '#fff' },
  secondary: { main: '#d4a574', dark: '#b88a54', light: '#e0bc97', contrastText: '#fff' },
  success: { main: '#059669', contrastText: '#fff' },
  warning: { main: '#f59e0b', contrastText: '#fff' },
  error: { main: '#ef4444', contrastText: '#fff' },
  info: { main: '#0ea5e9' },
};

// Sombras com tom teal. No dark, sombras mais profundas/escuras ficam melhor.
const SHADOWS_LIGHT = [
  'none',
  '0 1px 2px rgba(32,178,170,0.05)',
  '0 2px 6px rgba(0,0,0,0.05)',
  '0 4px 10px rgba(0,0,0,0.06)',
  '0 6px 14px rgba(0,0,0,0.07)',
  '0 8px 18px rgba(0,0,0,0.08)',
  '0 12px 24px rgba(0,0,0,0.08)',
  '0 16px 32px rgba(0,0,0,0.09)',
  '0 20px 40px rgba(32,178,170,0.12)',
  ...Array(16).fill('0 20px 40px rgba(32,178,170,0.12)'),
];
const SHADOWS_DARK = [
  'none',
  '0 1px 2px rgba(0,0,0,0.4)',
  '0 2px 6px rgba(0,0,0,0.45)',
  '0 4px 10px rgba(0,0,0,0.5)',
  '0 6px 14px rgba(0,0,0,0.55)',
  '0 8px 18px rgba(0,0,0,0.55)',
  '0 12px 24px rgba(0,0,0,0.6)',
  '0 16px 32px rgba(0,0,0,0.6)',
  '0 20px 40px rgba(0,0,0,0.65)',
  ...Array(16).fill('0 20px 40px rgba(0,0,0,0.65)'),
];

const TYPOGRAPHY = {
  fontFamily: FONT_BODY,
  h1: { fontFamily: FONT_HEAD, fontWeight: 800 },
  h2: { fontFamily: FONT_HEAD, fontWeight: 800 },
  h3: { fontFamily: FONT_HEAD, fontWeight: 800 },
  h4: { fontFamily: FONT_HEAD, fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em' },
  h5: { fontFamily: FONT_HEAD, fontSize: '1.35rem', fontWeight: 700, letterSpacing: '-0.01em' },
  h6: { fontFamily: FONT_HEAD, fontSize: '1.1rem', fontWeight: 700 },
  subtitle1: { fontFamily: FONT_HEAD, fontWeight: 600 },
  subtitle2: { fontFamily: FONT_HEAD, fontWeight: 600 },
  fontSize: 14,
  body1: { fontSize: '1rem', lineHeight: 1.6 },
  body2: { fontSize: '0.875rem', lineHeight: 1.5 },
  button: { fontFamily: FONT_HEAD, fontSize: '0.875rem', textTransform: 'none', fontWeight: 700 },
  caption: { fontSize: '0.75rem' },
};

/**
 * Tokens de LAYOUT (single source of truth p/ maxWidth/padding das páginas).
 * Usar via <PageContainer>. Elimina os maxWidth inventados tela-a-tela
 * (400/480/520/.../1080). ADITIVO — não altera nada existente, só centraliza.
 */
export const LAYOUT = {
  content: 720,  // páginas de conteúdo/config/listas (ExamList, Profile, Plans, Medicos…)
  wide: 1440,    // data-heavy (Dashboard, Trends, ValoresAlterados, ExamShow) — preenche a área de conteúdo no desktop (shell centrado em 1728 → área ~1488px). Mobile continua 100%.
  narrow: 480,   // cartão único (EmergencyCard)
  // OBS: o padding inferior (clearance da MobileBottomNav) é responsabilidade do SHELL
  // (AppLayout → .RaLayout-content usa calc(var(--me-bottom-nav-h) + 14px)). Páginas NÃO
  // devem somar o próprio pb p/ o rodapé — dobra o espaço (ex.: ExamList tinha +84px).
} as const;

/** Raios consolidados (theme já define shape 14 / Card 16 / Button 12 / Chip 8). */
export const RADIUS = { card: 16, sectionCard: 14, button: 12, pill: 99, tile: 12 } as const;

export type ThemeMode = 'light' | 'dark';

export const buildTheme = (mode: ThemeMode): Theme => {
  const isDark = mode === 'dark';
  const surfaces = isDark ? DARK_PALETTE : LIGHT_PALETTE;
  const hoverAlpha = alpha('#20b2aa', isDark ? 0.12 : 0.07);
  const activeAlpha = alpha('#20b2aa', isDark ? 0.20 : 0.12);
  const activeColor = isDark ? '#5fc9c3' : '#178f89';

  return createTheme({
    ...defaultTheme,
    palette: {
      mode,
      ...BRAND,
      ...surfaces,
    },
    shape: { borderRadius: 14 },
    typography: TYPOGRAPHY,
    shadows: (isDark ? SHADOWS_DARK : SHADOWS_LIGHT) as any,
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          // Transição suave ao trocar de modo (apenas cores — sem afetar layout/scroll).
          '*': { transition: 'background-color 180ms ease, border-color 180ms ease, color 120ms ease' },
          // Focus ring teal global (a11y WCAG 2.4.7) — antes: zero focus rings visíveis (MUI default é azul).
          '*:focus-visible': { outline: `2px solid ${isDark ? '#5fc9c3' : '#178f89'}`, outlineOffset: 2 },
          'button:focus-visible, a:focus-visible, [role="button"]:focus-visible': { outlineOffset: 3 },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            background: isDark
              ? 'linear-gradient(180deg,#1a2424 0%, #121818 100%)'
              : 'linear-gradient(180deg,#ffffff 0%, #f1f9f8 100%)',
            borderRight: `1px solid ${surfaces.divider}`,
            width: 264,
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 16,
            boxShadow: isDark
              ? '0 2px 8px rgba(0,0,0,0.4)'
              : '0 2px 6px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)',
            border: `1px solid ${isDark ? '#2a3636' : '#e6f1f0'}`,
            // Press state (feel nativo): card 'respira' leve ao toque. Sutil p/ não estranhar em cards estáticos.
            transition: 'transform .12s ease, box-shadow .2s ease',
            '&:active': { transform: 'scale(0.985)' },
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: { borderRadius: 12, padding: '10px 20px', fontWeight: 700, fontFamily: FONT_HEAD },
          containedPrimary: {
            background: 'linear-gradient(135deg, #20b2aa, #178f89)',
            boxShadow: '0 4px 12px rgba(32,178,170,0.30)',
            '&:hover': { background: 'linear-gradient(135deg, #1ba39c, #137a74)', boxShadow: '0 6px 16px rgba(32,178,170,0.40)' },
          },
          containedSecondary: {
            background: 'linear-gradient(135deg, #d4a574, #b88a54)',
            boxShadow: '0 4px 12px rgba(212,165,116,0.30)',
            '&:hover': { background: 'linear-gradient(135deg, #c89863, #a87a4a)' },
          },
        },
      },
      MuiChip: { styleOverrides: { root: { fontWeight: 600, borderRadius: 8 } } },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiAppBar: {
        styleOverrides: {
          root: {
            position: 'sticky',
            top: 0,
            paddingTop: 'env(safe-area-inset-top)',
            background: isDark ? 'rgba(18,24,24,0.92)' : 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(12px)',
            borderBottom: `1px solid ${surfaces.divider}`,
            boxShadow: 'none',
            color: surfaces.text.primary,
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            margin: '3px 10px',
            transition: 'transform .1s ease, background-color .15s ease',
            '&:hover': { background: hoverAlpha },
            '&:active': { transform: 'scale(0.97)' },
            '&.RaMenuItem-activeMenuItem, &[class*="active"]': {
              background: activeAlpha,
              color: activeColor,
              fontWeight: 700,
            },
          },
        },
      },
      MuiMenuItem: { styleOverrides: { root: { borderRadius: 10, margin: '2px 8px' } } },
      MuiTableCell: {
        styleOverrides: {
          root: { borderBottom: `1px solid ${isDark ? '#243030' : '#eef3f3'}` },
          head: { fontWeight: 700, color: surfaces.text.primary },
        },
      },
      MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 12, fontSize: 15 } } },
      MuiInputLabel: { styleOverrides: { root: { fontSize: 14 } } },
      MuiToolbar: { styleOverrides: { root: { minHeight: '64px !important' } } },
      MuiAvatar: { styleOverrides: { root: { fontFamily: FONT_HEAD, fontWeight: 700 } } },
    },
  });
};

export const lightTheme = buildTheme('light');
export const darkTheme = buildTheme('dark');

// Retrocompatibilidade: imports existentes de { theme } continuam funcionando (modo claro).
export const theme = lightTheme;
