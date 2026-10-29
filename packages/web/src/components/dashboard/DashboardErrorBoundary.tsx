// Lucian UX/UI Prompt #090 (adaptado) · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#090
import { Component, type ReactNode } from 'react';
import { Box, Typography, Button } from '@mui/material';

// Auto-recuperação (28/10/26, bug "não carrega o corpo → clica e aparece"): o crash do
// 1º mount era transitório (dado/cache chegando depois) — remonta SOZINHO 1x em 1,2s
// antes de mostrar o botão. Se voltar a lançar, o card de erro aparece como antes.
const AUTO_RETRY_MS = 1200;

/** Metáfora do #090 (error widget that plugs back in): plug fora + LED vermelho
 *  enquanto quebrado; enquanto o auto-retry é iminente o LED pisca âmbar e o plug
 *  "tremula" pra entrar. Sucesso = boundary desmonta este card (plug entra e some). */
const PlugSvg = ({ trying }: { trying: boolean }) => (
  <Box
    aria-hidden="true"
    component="svg"
    viewBox="0 0 120 64"
    sx={{
      width: 132, height: 70, mb: 1.5, overflow: 'visible', color: 'text.primary',
      '& .plug-cord': { fill: 'none', stroke: 'text.disabled', strokeWidth: 4, strokeLinecap: 'round' },
      '& .plug-prong': { stroke: 'text.secondary', strokeWidth: 4.5, strokeLinecap: 'round', transition: 'transform .55s cubic-bezier(.34,1.56,.64,1)' },
      '& .plug-l': { transform: trying ? 'translateX(7px)' : 'translateX(-8px)' },
      '& .plug-r': { transform: trying ? 'translateX(-2px)' : 'translateX(6px)' },
      ...(trying ? { '& .plug-l': { transform: 'translateX(7px)', animation: 'plugJig .3s .4s ease-in-out infinite' } } : {}),
      '& .plug-led': {
        fill: trying ? 'warning.main' : 'error.main', transition: 'fill .3s',
        ...(trying ? { animation: 'plugBlink .5s steps(1) infinite' } : {}),
      },
      '@keyframes plugJig': { '50%': { transform: 'translateX(12px)' } },
      '@keyframes plugBlink': { '50%': { opacity: 0.25 } },
      '@media (prefers-reduced-motion: reduce)': {
        '& .plug-l, & .plug-r, & .plug-led': { animation: 'none !important' },
      },
    }}
  >
    <path className="plug-cord" d="M8 32 C 26 32, 30 14, 46 14" />
    <g className="plug-l"><path className="plug-prong" d="M62 22 h16" /></g>
    <g className="plug-r"><path className="plug-prong" d="M62 42 h16" /></g>
    <rect x="52" y="14" width="10" height="36" rx="5" fill="currentColor" />
    <circle className="plug-led" cx="86" cy="32" r="5" />
  </Box>
);

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
      const autoPending = this.state.attempt === 0; // auto-retry a caminho (LED âmbar)
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
          <PlugSvg trying={autoPending} />
          <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 16, mb: 0.5 }}>
            Erro ao carregar
          </Typography>
          <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.5, mb: 2 }}>
            {autoPending
              ? 'Reconectando sozinho…'
              : 'Seu painel não conseguiu montar desta vez. Seus exames continuam salvos — toque para recarregar.'}
          </Typography>
          {(() => {
            const msg = this.state.error?.message;
            if (!msg || autoPending) return null;
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
