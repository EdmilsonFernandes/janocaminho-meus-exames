import { defaultTheme } from 'react-admin';
import { createTheme, alpha } from '@mui/material/styles';

// Tema "Dr. Exame" — teal (#20B2AA) + cobre (#D4A574), robô mascote, cards arredondados,
// fontes Poppins (títulos) + Inter (texto). Vibe clínica + amigável + premium.

const FONT_BODY = '"Inter", "Segoe UI", Roboto, system-ui, -apple-system, sans-serif';
const FONT_HEAD = '"Poppins", "Inter", "Segoe UI", Roboto, system-ui, sans-serif';

export const theme = createTheme({
  ...defaultTheme,
  palette: {
    mode: 'light',
    primary: { main: '#20b2aa', dark: '#178f89', light: '#5fc9c3', contrastText: '#fff' },
    secondary: { main: '#d4a574', dark: '#b88a54', light: '#e0bc97', contrastText: '#fff' },
    success: { main: '#10b981', contrastText: '#fff' },
    warning: { main: '#f59e0b', contrastText: '#fff' },
    error: { main: '#ef4444', contrastText: '#fff' },
    info: { main: '#0ea5e9' },
    background: { default: '#eef7f6', paper: '#ffffff' },
    text: { primary: '#2d3748', secondary: '#718096' },
    divider: '#dceaea',
  },
  shape: { borderRadius: 14 },
  typography: {
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
  },
  shadows: [
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
  ] as any,
  components: {
    MuiDrawer: {
      styleOverrides: {
        paper: {
          background: 'linear-gradient(180deg,#ffffff 0%, #f1f9f8 100%)',
          borderRight: '1px solid #dceaea',
          width: 264,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0 2px 6px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)',
          border: '1px solid #e6f1f0',
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
          background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid #dceaea',
          boxShadow: 'none',
          color: '#2d3748',
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          margin: '3px 10px',
          '&:hover': { background: alpha('#20b2aa', 0.07) },
          '&.RaMenuItem-activeMenuItem, &[class*="active"]': {
            background: alpha('#20b2aa', 0.12),
            color: '#178f89',
            fontWeight: 700,
          },
        },
      },
    },
    MuiMenuItem: { styleOverrides: { root: { borderRadius: 10, margin: '2px 8px' } } },
    MuiTableCell: { styleOverrides: { root: { borderBottom: '1px solid #eef3f3' }, head: { fontWeight: 700, color: '#2d3748' } } },
    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 12, fontSize: 15 } } },
    MuiInputLabel: { styleOverrides: { root: { fontSize: 14 } } },
    MuiToolbar: { styleOverrides: { root: { minHeight: '64px !important' } } },
    MuiAvatar: { styleOverrides: { root: { fontFamily: FONT_HEAD, fontWeight: 700 } } },
  },
});
