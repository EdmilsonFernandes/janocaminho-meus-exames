import { defaultTheme } from 'react-admin';
import { createTheme, alpha } from '@mui/material/styles';

// Tema PREMIUM — alinhado com o ecossistema EdEspeto (#336886 teal + #5FD35A verde)
export const theme = createTheme({
  ...defaultTheme,
  palette: {
    mode: 'light',
    primary: { main: '#336886', contrastText: '#fff' },
    secondary: { main: '#0891b2' },
    success: { main: '#10b981', contrastText: '#fff' },
    warning: { main: '#f59e0b', contrastText: '#fff' },
    error: { main: '#ef4444', contrastText: '#fff' },
    info: { main: '#0ea5e9' },
    background: {
      default: '#f8fafc',
      paper: '#ffffff',
    },
    text: { primary: '#0f172a', secondary: '#64748b' },
    divider: '#e2e8f0',
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: '"Inter", "Segoe UI", Roboto, system-ui, -apple-system, sans-serif',
    fontSize: 14,
    h4: { fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em' },
    h5: { fontSize: '1.35rem', fontWeight: 700, letterSpacing: '-0.01em' },
    h6: { fontSize: '1.1rem', fontWeight: 700 },
    body1: { fontSize: '1rem', lineHeight: 1.6 },
    body2: { fontSize: '0.875rem', lineHeight: 1.5 },
    button: { fontSize: '0.875rem', textTransform: 'none', fontWeight: 600 },
    caption: { fontSize: '0.75rem' },
  },
  shadows: [
    'none',
    '0 1px 2px rgba(0,0,0,0.04)',
    '0 2px 4px rgba(0,0,0,0.05)',
    '0 4px 8px rgba(0,0,0,0.06)',
    '0 6px 12px rgba(0,0,0,0.07)',
    '0 8px 16px rgba(0,0,0,0.08)',
    '0 12px 24px rgba(0,0,0,0.08)',
    '0 16px 32px rgba(0,0,0,0.09)',
    '0 20px 40px rgba(0,0,0,0.1)',
    ...Array(16).fill('0 20px 40px rgba(0,0,0,0.1)'),
  ] as any,
  components: {
    MuiDrawer: {
      styleOverrides: {
        paper: {
          background: 'linear-gradient(180deg, #1a2738 0%, #0f1923 100%)',
          borderRight: 'none',
          width: 240,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)',
          border: '1px solid #f1f5f9',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 12, padding: '10px 20px', fontWeight: 600 },
        containedPrimary: {
          background: 'linear-gradient(135deg, #336886, #2a5a73)',
          boxShadow: '0 4px 12px rgba(51,104,134,0.25)',
          '&:hover': { background: 'linear-gradient(135deg, #2a5a73, #1e4258)', boxShadow: '0 6px 16px rgba(51,104,134,0.35)' },
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
          borderBottom: '1px solid #e2e8f0',
          boxShadow: 'none',
          color: '#0f172a',
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          margin: '2px 8px',
          '&.RaMenuItem-activeMenuItem': {
            background: alpha('#5FD35A', 0.15),
            color: '#5FD35A',
            fontWeight: 700,
          },
        },
      },
    },
    MuiTableCell: { styleOverrides: { root: { borderBottom: '1px solid #f1f5f9' }, head: { fontWeight: 700 } } },
    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 12, fontSize: 15 } } },
    MuiInputLabel: { styleOverrides: { root: { fontSize: 14 } } },
    MuiToolbar: { styleOverrides: { root: { minHeight: '64px !important' } } },
  },
});
