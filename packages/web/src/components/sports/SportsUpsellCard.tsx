import { useEffect, useState } from 'react';
import { Box, Typography, Button, Chip, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useNavigate } from 'react-router-dom';
import { usePremium } from '../PremiumGate';
import { fetchPublicConfig } from '../../config';
import { AppCard } from '../AppCard';

const DISMISS_KEY = 'sportsInviteDismissed';

/**
 * CONVITE Saúde Esportiva (redesenho do dono 07/10 — "nem todo paciente é esportista"):
 * - Descartável 1x por usuário (localStorage) — quem não é público-alvo some pra sempre
 * - Só para quem JÁ TEM exame (tem o que contextualizar; sem exame = sem ganho)
 * - Posição: após os alertas (não disputa atenção com saúde)
 * - Motivador: fala de RESULTADO no contexto do treino + preview dos domínios
 * - CTA leva ao Perfil COM o wizard aberto (?sports=1) — o fluxo provado,
 *   sem diálogo novo (o diálogo inline falhava silenciosamente)
 */
export const SportsUpsellCard = ({ pid, hasExams }: { pid: string | null | undefined; hasExams: boolean }) => {
  const navigate = useNavigate();
  const premium = usePremium();
  const [flagOn, setFlagOn] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(true); // default escondido até ler storage

  useEffect(() => {
    fetchPublicConfig().then((c) => setFlagOn(!!c.sportsMode?.enabled)).catch(() => setFlagOn(false));
    try { setDismissed(localStorage.getItem(DISMISS_KEY) === '1'); } catch { setDismissed(false); }
  }, []);

  if (pid === null || pid === undefined || flagOn !== true || dismissed || !hasExams) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* storage bloqueado */ }
    setDismissed(true);
  };

  return (
    <AppCard kind="tinted" tone="primary" sx={{ p: { xs: 2, sm: 2.5 }, mb: 1.5, position: 'relative' }}>
      <IconButton size="small" onClick={dismiss} aria-label="Não mostrar mais"
        sx={{ position: 'absolute', top: 6, right: 6, color: 'text.disabled' }}>
        <CloseIcon sx={{ fontSize: 18 }} />
      </IconButton>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, pr: 4 }}>
        <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 15 }}>
          🏋️ Pratica esporte ou musculação?
        </Typography>
        {!premium && <Chip size="small" label="Premium" sx={{ height: 20, fontSize: 10, fontWeight: 800, bgcolor: 'rgba(32,178,170,.15)', color: (t) => (t.palette.mode === 'dark' ? '#5fc9c3' : '#0f766e') }} />}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5, mb: 1 }}>
        Seu exame no ritmo do seu treino: hematócrito, CK e hormônios interpretados no contexto
        do SEU esporte — com metas clínicas do seu médico e perguntas prontas pra consulta.
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1.25 }}>
        {['Hormonal', 'Cardio', 'Músculo & Fígado', 'Renal', 'Hemograma'].map((d) => (
          <Chip key={d} size="small" label={d} sx={{ height: 22, fontSize: 11, bgcolor: 'rgba(32,178,170,.10)', color: 'text.secondary', fontWeight: 600 }} />
        ))}
      </Box>
      <Button variant="contained" size="small" onClick={() => navigate('/perfil?sports=1')}
        sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, px: 3, minHeight: 44 }}>
        Ver como fica — 30 segundos
      </Button>
    </AppCard>
  );
};
