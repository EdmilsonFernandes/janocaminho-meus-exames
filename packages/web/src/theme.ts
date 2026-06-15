import { defaultTheme } from 'react-admin';
import { createTheme } from '@mui/material/styles';

// Tema com foco em ACESSIBILIDADE e clareza: fontes maiores, contraste alto, cores "semáforo".
export const theme = createTheme({
  ...defaultTheme,
  palette: {
    mode: 'light',
    primary: { main: '#0b5cab', contrastText: '#fff' },
    secondary: { main: '#00897b' },
    success: { main: '#2e7d32', contrastText: '#fff' },   // verde = normal
    warning: { main: '#e65100', contrastText: '#fff' },   // laranja = atenção
    error: { main: '#c62828', contrastText: '#fff' },     // vermelho = alterado
    info: { main: '#0277bd' },
    background: { default: '#f3f6fb', paper: '#ffffff' },
    text: { primary: '#15233b', secondary: '#51607a' },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: '"Segoe UI", Roboto, system-ui, Arial, sans-serif',
    fontSize: 15,
    h4: { fontSize: '2rem', fontWeight: 700 },
    h5: { fontSize: '1.5rem', fontWeight: 700 },
    h6: { fontSize: '1.2rem', fontWeight: 700 },
    body1: { fontSize: '1.05rem', lineHeight: 1.5 },
    body2: { fontSize: '0.95rem' },
    button: { fontSize: '0.95rem', textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiButton: { styleOverrides: { root: { padding: '8px 18px', borderRadius: 10 } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
    MuiCard: { styleOverrides: { root: { boxShadow: '0 1px 3px rgba(16,40,80,.08)' } } },
    MuiOutlinedInput: { styleOverrides: { root: { fontSize: 16 } } },
    MuiInputLabel: { styleOverrides: { root: { fontSize: 15 } } },
  },
});
