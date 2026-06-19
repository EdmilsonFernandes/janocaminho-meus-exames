import { useEffect, useState, type ReactNode } from 'react';
import { Box, Button, Typography } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import { useNavigate } from 'react-router-dom';
import { API_URL, token } from '../config';

/**
 * Devolve se o plano premium está ativo. Fast-path pelo localStorage('user')
 * (que agora inclui planExpiresAt no login) + correção autoritativa via /billing/status.
 */
export function usePremium(): boolean {
  const [premium, setPremium] = useState<boolean>(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      if (raw) {
        const u = JSON.parse(raw);
        if (u?.planExpiresAt && new Date(u.planExpiresAt) > new Date()) setPremium(true);
      }
    } catch {
      /* user ausente */
    }
    fetch(`${API_URL}/billing/status`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setPremium(!!d.active); })
      .catch(() => {});
  }, []);
  return premium;
}

/**
 * Envolve conteúdo premium. Premium vê o conteúdo. Não-premium vê um card de
 * upgrade limpo (sem blur → nada cortado) com CTA "Ver planos".
 */
export const PremiumGate = ({ children }: { children: ReactNode }) => {
  const premium = usePremium();
  const navigate = useNavigate();
  if (premium) return <>{children}</>;
  return (
    <Box sx={{
      mt: 2, p: 2.5, borderRadius: 2, textAlign: 'center',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
      background: 'linear-gradient(135deg, rgba(32,178,170,.10), rgba(32,178,170,.02))',
      border: '1px dashed rgba(32,178,170,.45)',
    }}>
      <LockIcon sx={{ fontSize: 30, color: '#178f89' }} />
      <Typography sx={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>Previsão exclusiva do Premium</Typography>
      <Typography variant="caption" color="text.secondary">Assine pra ver quando seu marcador deve sair da faixa de referência.</Typography>
      <Button variant="contained" size="small" onClick={() => navigate('/planos')}
        sx={{ mt: 0.5, borderRadius: 2, textTransform: 'none', fontWeight: 700, bgcolor: '#20b2aa', boxShadow: 'none', '&:hover': { bgcolor: '#178f89' } }}>
        Ver planos
      </Button>
    </Box>
  );
};
