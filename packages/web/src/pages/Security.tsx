import { useState } from 'react';
import { Box, Card, Typography, Button, Stack } from '@mui/material';
import { Title, useNotify } from 'react-admin';
import { API_URL, token } from '../config';
import { MfaSetupCard } from '../components/mfa/MfaSetupCard';
import { BiometricService } from '../components/BiometricService';

/** Página de Segurança — MFA (2FA) + Biometria, separada do Perfil. */
export const SecurityPage = () => {
  const notify = useNotify();
  const [bioOn, setBioOn] = useState(BiometricService.hasEnrollment());

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 780, mx: 'auto' }}>
      <Title title="Segurança" />
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>🔐 Segurança</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Proteja sua conta com autenticação em 2 fatores e biometria.</Typography>

      {/* MFA (2FA TOTP) */}
      <MfaSetupCard apiBase={`${API_URL}/auth`} authToken={token() || ''} />

      {/* Biometria */}
      {BiometricService.isSupported() && (
        <Card sx={{ mt: 2, borderRadius: 3 }}>
          <Box sx={{ p: 2.5 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 800, color: 'text.primary', fontSize: 17 }}>🔐 Biometria (face/digital)</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: 13.5, mt: 0.5 }}>Entre sem digitar senha, usando a biometria do aparelho.</Typography>
              </Box>
              {bioOn
                ? <Button variant="outlined" color="error" size="small" sx={{ flexShrink: 0, width: { xs: '100%', sm: 'auto' } }} onClick={() => { BiometricService.forget(); setBioOn(false); notify('Biometria desativada neste aparelho.'); }}>Desativar</Button>
                : <Button variant="contained" size="small" sx={{ flexShrink: 0, width: { xs: '100%', sm: 'auto' } }} onClick={() => { BiometricService.enroll(token() || '', false); setBioOn(true); notify('Biometria ativada! 🎉', { type: 'success' }); }}>Ativar biometria</Button>}
            </Stack>
          </Box>
        </Card>
      )}

      {/* Dica de segurança */}
      <Card sx={{ mt: 2, borderRadius: 3, background: 'background.default', border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ p: 2.5 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 13.5, lineHeight: 1.6 }}>
            💡 <strong>Dica:</strong> Ative ambos pra máxima segurança. A biometria deixa o dia a dia mais rápido (1 toque pra entrar), e o 2FA protege contra acesso não autorizado mesmo se alguém descobrir sua senha.
          </Typography>
        </Box>
      </Card>
    </Box>
  );
};
