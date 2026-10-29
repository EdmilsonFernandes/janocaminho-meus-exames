import { Component, type ReactNode } from 'react';
import { Box, Typography, Button } from '@mui/material';

// Auto-recuperação (28/10/26, bug "não carrega o corpo → clica e aparece"): o crash do
// 1º mount era transitório (dado/cache chegando depois) — remonta SOZINHO 1x em 1,2s
// antes de mostrar o botão. Se voltar a lançar, o card de erro aparece como antes.
const AUTO_RETRY_MS = 1200;

/**
 * DashboardErrorBoundary — ErrorBoundary ESCOPADO do dashboard.
 *
 * O boundary global (main.tsx) já evita tela branca, mas derruba o APP inteiro e o
 * botão "Tentar novamente" pode re-crashar no mesmo dado (remonta o mesmo estado).
 * Este é local: se QUALQUER card novo do dashboard explodir (shape de API, cache
 * offline velho, diff de versão no APK…), o usuário vê um fallback curto no lugar
 * do grid e um botão que REMONTA limpo —
 *
 * ⚠️ NUNCA usar location.reload()/navigate(0) aqui: recarregar a WebView CRASHA o
 * APK (gotcha conhecido). O remount é por key interna — WebView intacta.
 */
export class DashboardErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; attempt: number }> {
  state = { error: null as Error | null, attempt: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: any) {
    // Rastro no ring buffer do diag (Perfil → enviar diagnóstico) + console/Sentry.
    console.error('[DashboardErrorBoundary]', error?.message, info?.componentStack);
  }

  componentDidUpdate(_props: unknown, prevState: { error: Error | null; attempt: number }) {
    // 1ª queda → auto-retry 1x (dado transitório chega em ~1s). Re-crash → card normal.
    if (this.state.error && !prevState.error && this.state.attempt === 0) {
      setTimeout(() => {
        this.setState((s) => (s.error ? { error: null, attempt: s.attempt + 1 } : s));
      }, AUTO_RETRY_MS);
    }
  }

  private retry = () => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));

  render() {
    if (this.state.error) {
      return (
        <Box
          role="alert"
          sx={{
            mt: 2, mx: 'auto', maxWidth: 420, p: { xs: 2.5, sm: 3 }, textAlign: 'center',
            borderRadius: '16px',
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: (t) => (t.palette.mode === 'dark' ? '0 8px 28px rgba(0,0,0,.35)' : '0 6px 24px rgba(32,178,170,.10)'),
          }}
        >
          <Box sx={{ fontSize: 40, mb: 1 }} aria-hidden="true">⚠️</Box>
          <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 16, mb: 0.5 }}>
            Erro ao carregar
          </Typography>
          <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.5, mb: 2 }}>
            Seu painel não conseguiu montar desta vez. Seus exames continuam salvos — toque para recarregar.
          </Typography>
          {(() => {
            const msg = this.state.error?.message;
            if (!msg) return null;
            return (
              <Typography noWrap component="div" title={msg} sx={{ fontSize: 11, color: 'text.disabled', mb: 2, fontFamily: 'monospace' }}>
                {msg.slice(0, 120)}
              </Typography>
            );
          })()}
          <Button
            onClick={this.retry}
            variant="contained"
            sx={{
              borderRadius: '999px', textTransform: 'none', fontWeight: 800, px: 3.5, minHeight: 44,
              background: 'linear-gradient(135deg,#20b2aa,#178f89)',
              '&:hover': { background: 'linear-gradient(135deg,#178f89,#178f89)' },
            }}
          >
            Recarregar painel
          </Button>
          <Typography sx={{ fontSize: 11, color: 'text.disabled', mt: 1.5 }}>
            Se persistir: Perfil → enviar diagnóstico
          </Typography>
        </Box>
      );
    }
    // key={attempt} → retry remonta a árvore FILHA do zero (estado novo, sem reload).
    return <div key={this.state.attempt}>{this.props.children}</div>;
  }
}
