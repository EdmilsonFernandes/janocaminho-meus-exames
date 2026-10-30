import type { ErrorInfo } from 'react';
import { Box, Typography, Button, Stack } from '@mui/material';
import { useResetErrorBoundaryOnLocationChange } from 'ra-core';
import { useNavigate } from 'react-router-dom';

/** Tela de crash amigável (pt-BR, identidade teal) usada nos DOIS error boundaries do react-admin:
 *  `<Admin error={…}>` (global — cobre rotas noLayout como /admin) e `<Layout error={…}>` (telas do shell).
 *  Substitui o `<Error>` padrão do RA ("Something went wrong / A client error occurred…" — técnico e em inglês).
 *  Sem reload: navegar reseta o boundary (hook) — reload recarrega a WebView e crasha o APK. */
export const AppCrashPage = ({ error, resetErrorBoundary }: {
  error: Error;
  errorInfo?: ErrorInfo;
  resetErrorBoundary: (...args: unknown[]) => void;
}) => {
  useResetErrorBoundaryOnLocationChange(resetErrorBoundary);
  const navigate = useNavigate();
  return (
    <Box sx={{ minHeight: '70dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 3, textAlign: 'center' }}>
      <Box aria-hidden="true" sx={{ fontSize: 64, mb: 2 }}>😵‍💫</Box>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 800, color: 'text.primary', mb: 1, fontFamily: '"Poppins", sans-serif' }}>
        Algo deu errado
      </Typography>
      <Typography sx={{ color: 'text.secondary', mb: 3, maxWidth: 360, lineHeight: 1.55 }}>
        Não conseguimos exibir esta tela. Tente de novo — seus dados estão salvos e nada foi perdido.
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ width: { xs: '100%', sm: 'auto' }, maxWidth: 360 }}>
        <Button
          variant="contained"
          size="large"
          onClick={() => resetErrorBoundary()}
          sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, px: 4, minHeight: 48, background: 'linear-gradient(180deg,#20b2aa,#178f89)', '&:hover': { background: 'linear-gradient(180deg,#178f89,#178f89)' } }}
        >
          Tentar novamente
        </Button>
        <Button
          variant="outlined"
          size="large"
          onClick={() => navigate('/')}
          sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, px: 4, minHeight: 48 }}
        >
          Ir para o início
        </Button>
      </Stack>
      {/* Detalhe técnico discreto: o dono/suporte precisa do erro real pra reportar, sem assustar o usuário. */}
      <Box component="details" sx={{ mt: 3, maxWidth: 420, color: 'text.disabled', fontSize: 12, textAlign: 'left' }}>
        <Box component="summary" sx={{ cursor: 'pointer', textAlign: 'center' }}>Detalhes técnicos</Box>
        <Box component="pre" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', m: 0, mt: 1, fontSize: 11, fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}>
          {String(error?.message || error)}
        </Box>
      </Box>
    </Box>
  );
};
