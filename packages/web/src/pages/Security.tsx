import { useState } from 'react';
import { Title, useNotify } from 'react-admin';
import LockIcon from '@mui/icons-material/Lock';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import { API_URL, token, apiHeaders } from '../config';
import { MfaSetupCard } from '../components/mfa/MfaSetupCard';
import { BiometricService } from '../components/BiometricService';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { useReuiThemeSync } from '@/components/reui/useReuiThemeSync';
import {
  Frame,
  FrameHeader,
  FrameTitle,
  FrameDescription,
  FramePanel,
  FrameFooter,
} from '@/components/reui/frame';
import { Badge as ReuiBadge } from '@/components/reui/badge';
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from '@/components/reui/alert';
import {
  FieldLabelWithHint,
  SettingRow,
} from '@/components/reui/patterns';
import { PasswordInput } from '@/components/reui/form-controls';
import { ShieldRoundIcon } from '@/components/reui/icons';

/** Página de Segurança — senha + MFA (2FA) + Biometria (funções de CONTA; a troca de senha
 *  mudou do Perfil pra cá na re-arquitetura de 2026-08 — cada coisa no seu lugar). */
export const SecurityPage = () => {
  const notify = useNotify();
  const themeClass = useReuiThemeSync();
  const [bioOn, setBioOn] = useState(BiometricService.hasEnrollment());
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [cf, setCf] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  const changePw = async () => {
    if (nw !== cf) {
      notify('A nova senha e a confirmação não conferem.', { type: 'error' });
      return;
    }
    if (nw.length < 6) {
      notify('Nova senha mín. 6 caracteres.', { type: 'error' });
      return;
    }
    setPwLoading(true);
    const r = await fetch(`${API_URL}/auth/change-password`, {
      method: 'POST',
      headers: apiHeaders(true),
      body: JSON.stringify({ currentPassword: cur, newPassword: nw }),
    });
    setPwLoading(false);
    if (r.ok) {
      notify('Senha alterada com sucesso!', { type: 'success' });
      setCur('');
      setNw('');
      setCf('');
    } else {
      const e = await r.json().catch(() => ({}));
      notify(e.error || 'Erro ao trocar senha', { type: 'error' });
    }
  };

  const bioSupported = BiometricService.isSupported();

  return (
    <PageContainer width={780}>
      <Title title="Segurança" />
      <div className={`reui-scope ${themeClass} space-y-4`}>
        <PageHeader
          icon={<ShieldRoundIcon size={24} />}
          title="Segurança"
          subtitle="Troque sua senha e proteja sua conta com autenticação em 2 fatores e biometria."
        />

        {/* Trocar senha — ReUI Frame + PasswordInput c-input-group-6 */}
        <Frame>
          <FrameHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <FrameTitle className="flex items-center gap-2">
                <LockIcon sx={{ fontSize: 18 }} className="text-primary" />
                Trocar senha de acesso
              </FrameTitle>
              <FrameDescription>
                Use pelo menos 6 caracteres combinando letras e números
              </FrameDescription>
            </div>
            <ReuiBadge variant="primary-light" size="sm">
              Credencial
            </ReuiBadge>
          </FrameHeader>

          <FramePanel className="space-y-3.5">
            <FieldLabelWithHint label="Senha atual" required>
              <PasswordInput
                value={cur}
                onChange={(e) => setCur(e.target.value)}
                placeholder="Digite sua senha atual"
                autoComplete="current-password"
              />
            </FieldLabelWithHint>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <FieldLabelWithHint
                label="Nova senha"
                hint="Mín. 6 caracteres"
                required
              >
                <PasswordInput
                  value={nw}
                  onChange={(e) => setNw(e.target.value)}
                  placeholder="Nova senha"
                  autoComplete="new-password"
                />
              </FieldLabelWithHint>

              <FieldLabelWithHint label="Confirmar nova senha" required>
                <PasswordInput
                  value={cf}
                  onChange={(e) => setCf(e.target.value)}
                  placeholder="Repita a nova senha"
                  autoComplete="new-password"
                />
              </FieldLabelWithHint>
            </div>
          </FramePanel>

          <FrameFooter className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              Ao alterar a senha, sua sessão atual permanecerá ativa neste dispositivo.
            </span>
            <button
              type="button"
              onClick={changePw}
              disabled={pwLoading || !cur || !nw}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-xs font-extrabold text-primary-foreground shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              <LockIcon sx={{ fontSize: 15 }} />
              {pwLoading ? 'Alterando…' : 'Alterar senha'}
            </button>
          </FrameFooter>
        </Frame>

        {/* MFA (2FA TOTP) */}
        <MfaSetupCard apiBase={`${API_URL}/auth`} authToken={token() || ''} />

        {/* Biometria */}
        <Frame>
          <FrameHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <FrameTitle className="flex items-center gap-2">
                <FingerprintIcon sx={{ fontSize: 19 }} className="text-primary" />
                Acesso biométrico
              </FrameTitle>
              <FrameDescription>
                Reconhecimento facial ou impressão digital do seu aparelho
              </FrameDescription>
            </div>
            <ReuiBadge variant={bioOn ? 'success' : 'outline'} size="sm">
              {bioOn ? 'Ativada' : bioSupported ? 'Desativada' : 'App Android'}
            </ReuiBadge>
          </FrameHeader>

          <FramePanel>
            {bioSupported ? (
              <SettingRow
                icon={<FingerprintIcon sx={{ fontSize: 20 }} />}
                tone={bioOn ? 'success' : 'primary'}
                title="Biometria (Face / Digital)"
                description="Entre sem digitar senha, usando o sensor biométrico do aparelho."
                action={
                  bioOn ? (
                    <button
                      type="button"
                      onClick={() => {
                        BiometricService.forget();
                        setBioOn(false);
                        notify('Biometria desativada neste aparelho.');
                      }}
                      className="inline-flex items-center rounded-full border border-destructive/30 bg-destructive/10 px-3.5 py-1.5 text-xs font-bold text-destructive transition hover:bg-destructive/20 cursor-pointer"
                    >
                      Desativar
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        BiometricService.enroll(token() || '', false);
                        setBioOn(true);
                        notify('Biometria ativada! 🎉', { type: 'success' });
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground shadow-sm transition hover:opacity-95 cursor-pointer"
                    >
                      <VerifiedUserOutlinedIcon sx={{ fontSize: 15 }} />
                      Ativar biometria
                    </button>
                  )
                }
              />
            ) : (
              <SettingRow
                icon={<FingerprintIcon sx={{ fontSize: 20 }} />}
                tone="muted"
                title="Biometria disponível no aplicativo móvel"
                description="Instale o aplicativo Dr. Exame no celular Android para ativar o login instantâneo por impressão digital ou reconhecimento facial."
              />
            )}
          </FramePanel>
        </Frame>

        {/* Dica de segurança com ReUI Alert */}
        <Alert variant="info">
          <LightbulbOutlinedIcon sx={{ fontSize: 18 }} />
          <AlertTitle>Proteção máxima recomendada</AlertTitle>
          <AlertDescription>
            Ative a biometria e o 2FA juntos. A biometria deixa o dia a dia mais rápido (1 toque para entrar), e o 2FA protege seus exames mesmo que alguém descubra sua senha.
          </AlertDescription>
        </Alert>
      </div>
    </PageContainer>
  );
};
