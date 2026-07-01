import { Component, type ReactNode } from 'react';
import { Box, Typography, Button } from '@mui/material';

/** Error Boundary — previne TELA BRANCA em erros React não tratados.
 *  Mostra uma tela amigável (identidade teal) + tentativa de remontar sem recarregar o WebView. */
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
        <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 3, background: 'background.default', textAlign: 'center' }}>
          <Box sx={{ fontSize: 64, mb: 2 }}>😵‍💫</Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: 'text.primary', mb: 1, fontFamily: 'Poppins, sans-serif' }}>Algo deu errado</Typography>
          <Typography sx={{ color: 'text.secondary', mb: 3, maxWidth: 340 }}>Ocorreu um erro inesperado. Tente novamente — seus dados estão salvos.</Typography>
          <Button variant="contained" size="large" onClick={() => this.setState({ hasError: false, error: undefined })} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 800, px: 4, background: 'linear-gradient(180deg,#20b2aa,#009688)', '&:hover': { background: 'linear-gradient(180deg,#1ca39e,#00897b)' } }}>Tentar novamente</Button>
        </Box>
      );
    }
    return this.props.children;
  }
}
