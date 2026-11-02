import { useState } from 'react';
import { Box, Typography, Card, CardContent, CircularProgress } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import { API_URL } from '../../../config';
import { useReuiThemeSync } from '@/components/reui/useReuiThemeSync';
import {
  Frame,
  FrameHeader,
  FrameTitle,
  FrameDescription,
  FramePanel,
  FrameFooter,
} from '@/components/reui/frame';
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from '@/components/reui/alert';
import {
  FieldLabelWithHint,
  IconTile,
} from '@/components/reui/patterns';
import { PasswordInput } from '@/components/reui/form-controls';

/** Empty state compacto das views do portal. */
export const Empty = ({ label, icon = '📭' }: { label: string; icon?: string }) => (
  <Card
    sx={{
      borderRadius: '20px',
      border: '1px solid',
      borderColor: 'divider',
      boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
    }}
  >
    <CardContent>
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Box sx={{ fontSize: 44, mb: 1 }}>{icon}</Box>
        <Typography color="text.secondary">{label}</Typography>
      </Box>
    </CardContent>
  </Card>
);

/** Trocar senha do médico — ReUI Frame + PasswordInput c-input-group-6. */
export const DoctorChangePasswordForm = ({
  token,
  onBack,
}: {
  token: string;
  onBack: () => void;
}) => {
  const themeClass = useReuiThemeSync();
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [cf, setCf] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  const save = async () => {
    if (nw !== cf) {
      setMsg({
        type: 'err',
        text: 'A nova senha e a confirmação não conferem.',
      });
      return;
    }
    if (nw.length < 6) {
      setMsg({ type: 'err', text: 'Nova senha mín. 6 caracteres.' });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch(`${API_URL}/doctor/me/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword: cur, newPassword: nw }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha');
      setMsg({ type: 'ok', text: 'Senha alterada com sucesso!' });
      setCur('');
      setNw('');
      setCf('');
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`reui-scope ${themeClass} space-y-3`}>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-bold text-primary transition hover:bg-muted cursor-pointer"
      >
        <ArrowBackRoundedIcon sx={{ fontSize: 15 }} />
        Voltar ao perfil médico
      </button>

      <Frame>
        <FrameHeader className="flex flex-row items-center gap-2.5">
          <IconTile tone="primary" size="sm">
            <LockIcon sx={{ fontSize: 18 }} />
          </IconTile>
          <div>
            <FrameTitle>Alterar senha do Portal Médico</FrameTitle>
            <FrameDescription>
              Mantenha sua credencial médica protegida com pelo menos 6 caracteres
            </FrameDescription>
          </div>
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

          {msg && (
            <Alert variant={msg.type === 'ok' ? 'success' : 'destructive'}>
              <AlertTitle>
                {msg.type === 'ok' ? 'Credencial atualizada' : 'Atenção'}
              </AlertTitle>
              <AlertDescription>{msg.text}</AlertDescription>
            </Alert>
          )}
        </FramePanel>

        <FrameFooter className="flex justify-end">
          <button
            type="button"
            onClick={save}
            disabled={saving || !cur || !nw}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-xs font-extrabold text-primary-foreground shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <CircularProgress size={14} color="inherit" />
            ) : (
              <LockIcon sx={{ fontSize: 15 }} />
            )}
            {saving ? 'Alterando…' : 'Alterar senha'}
          </button>
        </FrameFooter>
      </Frame>
    </div>
  );
};
