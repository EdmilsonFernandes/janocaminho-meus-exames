import { Component, type ReactNode } from 'react';
import { Box, Typography, Button } from '@mui/material';

/** Error Boundary — previne TELA BRANCA em erros React não tratados.
 *  Mostra uma tela amigável (identidade teal) + botão recarregar. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error?: Error }> {
  state: { hasError: boolean; error?: Error } = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('[ErrorBoundary]', error?.message, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 3, background: 'linear-gradient(135deg,#e6f7f5,#d4f0ec)', textAlign: 'center' }}>
          <Box sx={{ fontSize: 64, mb: 2 }}>😵‍💫</Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f3d3a', mb: 1, fontFamily: 'Poppins, sans-serif' }}>Algo deu errado</Typography>
          <Typography sx={{ color: '#4a6b66', mb: 3, maxWidth: 340 }}>Ocorreu um erro inesperado. Tente recarregar — seus dados estão salvos.</Typography>
          <Button variant="contained" size="large" onClick={() => window.location.reload()} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 800, px: 4, background: 'linear-gradient(180deg,#20b2aa,#009688)', '&:hover': { background: 'linear-gradient(180deg,#1ca39e,#00897b)' } }}>🔄 Recarregar</Button>
        </Box>
      );
    }
    return this.props.children;
  }
}
