import { useEffect, useState } from 'react';
import { Box, Typography, Button, Chip } from '@mui/material';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import { useNavigate, useTranslate } from 'react-admin';
import { usePremium } from '../PremiumGate';
import { fetchPublicConfig } from '../../config';
import { AppCard } from '../AppCard';
import { SportsProfileWizard } from './SportsProfileWizard';

/**
 * DESCOBERTA (fix do dono 07/10): o modo Saúde Esportiva vivia escondido no fundo do
 * Perfil (~8 taps de distância). Este card entra no TOPO do dashboard quando a flag
 * global está ligada e o modo NÃO está ativo — 1 clique do "Início" até declarar o
 * esporte. Premium → abre o wizard aqui mesmo; FREE → CTA pro plano (vitrine).
 * Depois de ativado o card some (o painel esportivo assume); gestão segue no Perfil.
 */
export const SportsUpsellCard = ({ pid }: { pid: string | null | undefined }) => {
  const translate = useTranslate();
  const navigate = useNavigate();
  const premium = usePremium();
  const [flagOn, setFlagOn] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => { fetchPublicConfig().then((c) => setFlagOn(!!c.sportsMode?.enabled)).catch(() => setFlagOn(false)); }, []);
  if (pid === null || pid === undefined || flagOn === false || flagOn === null) return null;

  return (
    <>
      <AppCard kind="tinted" tone="primary" sx={{ p: { xs: 2, sm: 2.5 }, mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Box sx={{ flex: 1, minWidth: { xs: '100%', sm: 220 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 15 }}>
                🏋️ Novo: Saúde Esportiva
              </Typography>
              {!premium && (
                <Chip size="small" label="Premium" sx={{ height: 20, fontSize: 10, fontWeight: 800, bgcolor: 'rgba(32,178,170,.15)', color: (t) => (t.palette.mode === 'dark' ? '#5fc9c3' : '#0f766e') }} />
              )}
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.45 }}>
              Seu painel pelo seu esporte: marcadores por domínio (hormonal, cardio, renal…),
              impacto das substâncias que você declara e metas clínicas do seu médico.
            </Typography>
          </Box>
          {premium ? (
            <Button variant="contained" size="small" onClick={() => setOpen(true)}
              sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, px: 3, minHeight: 44, flexShrink: 0 }}>
              Ativar — 30 segundos
            </Button>
          ) : (
            <Button variant="outlined" size="small" onClick={() => navigate('/planos')}
              sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, px: 3, minHeight: 44, flexShrink: 0 }}>
              Ver planos
            </Button>
          )}
        </Box>
      </AppCard>

      {/* wizard direto do dashboard — mesma tela única do Perfil */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: '16px' } }}>
        <IconButton onClick={() => setOpen(false)} aria-label={translate('ra.action.close')} sx={{ position: 'absolute', right: 8, top: 8, zIndex: 1 }}>
          <CloseIcon />
        </IconButton>
        <DialogContent sx={{ pt: 3 }}>
          <SportsProfileWizard pid={pid} />
        </DialogContent>
      </Dialog>
    </>
  );
};
