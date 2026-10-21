import { useState } from 'react';
import { Box, Card, Typography, Button, Stack, TextField } from '@mui/material';
import { Title, useNotify } from 'react-admin';
import { API_URL, token, apiHeaders } from '../config';
import { MfaSetupCard } from '../components/mfa/MfaSetupCard';
import { BiometricService } from '../components/BiometricService';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import LockIcon from '@mui/icons-material/Lock';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import LightbulbIcon from '@mui/icons-material/Lightbulb';

/** Página de Segurança — senha + MFA (2FA) + Biometria (funções de CONTA; a troca de senha
 *  mudou do Perfil pra cá na re-arquitetura de 2026-08 — cada coisa no seu lugar). */
export const SecurityPage = () => {
  const notify = useNotify();
  const [bioOn, setBioOn] = useState(BiometricService.hasEnrollment());
  const [cur, setCur] = useState(''); const [nw, setNw] = useState(''); const [cf, setCf] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  const changePw = async () => {
    if (nw !== cf) { notify('A nova senha e a confirmação não conferem.', { type: 'error' }); return; }
    if (nw.length < 6) { notify('Nova senha mín. 6 caracteres.', { type: 'error' }); return; }
    setPwLoading(true);
    const r = await fetch(`${API_URL}/auth/change-password`, { method: 'POST', headers: apiHeaders(true), body: JSON.stringify({ currentPassword: cur, newPassword: nw }) });
    setPwLoading(false);
    if (r.ok) { notify('Senha alterada com sucesso!', { type: 'success' }); setCur(''); setNw(''); setCf(''); }
    else { const e = await r.json().catch(() => ({})); notify(e.error || 'Erro ao trocar senha', { type: 'error' }); }
  };

  return (
    <PageContainer width={780}>
      <Title title="Segurança" />
      <PageHeader icon={<LockIcon />} title="Segurança" subtitle="Troque sua senha e proteja sua conta com autenticação em 2 fatores e biometria." />

      {/* Trocar senha (mudou do Perfil p/ cá — função de conta, não dado pessoal) */}
      <Card sx={{ mb: 2, borderRadius: '16px' }}>
        <Box sx={{ p: 2.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, color: 'text.primary', mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}><LockIcon color="action" /> Trocar senha</Typography>
          <Stack spacing={2}>
            <TextField type="password" label="Senha atual" value={cur} onChange={(e) => setCur(e.target.value)} fullWidth size="small" autoComplete="current-password" />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField type="password" label="Nova senha" value={nw} onChange={(e) => setNw(e.target.value)} fullWidth size="small" autoComplete="new-password" />
              <TextField type="password" label="Confirmar nova senha" value={cf} onChange={(e) => setCf(e.target.value)} fullWidth size="small" autoComplete="new-password" />
            </Stack>
          </Stack>
          <Button variant="contained" startIcon={<LockIcon />} onClick={changePw} disabled={pwLoading || !cur || !nw} sx={{ mt: 2, borderRadius: '999px', px: 3.5, py: 1.1, textTransform: 'none', fontWeight: 800, background: 'linear-gradient(135deg,#20b2aa,#178f89)', boxShadow: '0 4px 14px rgba(32,178,170,.3)' }}>
            {pwLoading ? 'Alterando…' : 'Alterar senha'}
          </Button>
        </Box>
      </Card>

      {/* MFA (2FA TOTP) */}
      <MfaSetupCard apiBase={`${API_URL}/auth`} authToken={token() || ''} />

      {/* Biometria */}
      {BiometricService.isSupported() ? (
        <Card sx={{ mt: 2, borderRadius: '16px' }}>
          <Box sx={{ p: 2.5 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="h6" sx={{ fontWeight: 800, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1 }}><FingerprintIcon color="action" /> Biometria (face/digital)</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: 14, mt: 0.5 }}>Entre sem digitar senha, usando a biometria do aparelho.</Typography>
              </Box>
              {bioOn
                ? <Button variant="outlined" color="error" size="small" sx={{ flexShrink: 0, borderRadius: '999px', width: { xs: '100%', sm: 'auto' } }} onClick={() => { BiometricService.forget(); setBioOn(false); notify('Biometria desativada neste aparelho.'); }}>Desativar</Button>
                : <Button variant="outlined" size="small" sx={{ flexShrink: 0, borderRadius: '999px', width: { xs: '100%', sm: 'auto' } }} onClick={() => { BiometricService.enroll(token() || '', false); setBioOn(true); notify('Biometria ativada! 🎉', { type: 'success' }); }}>Ativar biometria</Button>}
            </Stack>
          </Box>
        </Card>
      ) : (
        // No navegador a seção some e a dica citava biometria "fantasma" (auditoria) — explica:
        <Card sx={{ mt: 2, borderRadius: '16px' }}>
          <Box sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1 }}><FingerprintIcon color="action" /> Biometria (face/digital)</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: 14, mt: 0.5 }}>
              Disponível no <strong>app Android</strong> (celular): instale o Dr. Exame pela Play Store e ative o login por digital na tela de entrada.
            </Typography>
          </Box>
        </Card>
      )}

      {/* Dica de segurança */}
      <Card sx={{ mt: 2, borderRadius: '16px', background: 'background.default', border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ p: 2.5 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 14, lineHeight: 1.6, display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <LightbulbIcon sx={{ fontSize: 20, color: '#f59e0b', flexShrink: 0, mt: '2px' }} />
            <Box component="span"><strong>Dica:</strong> Ative ambos pra máxima segurança. A biometria deixa o dia a dia mais rápido (1 toque pra entrar), e o 2FA protege contra acesso não autorizado mesmo se alguém descobrir sua senha.</Box>
          </Typography>
        </Box>
      </Card>
    </PageContainer>
  );
};
