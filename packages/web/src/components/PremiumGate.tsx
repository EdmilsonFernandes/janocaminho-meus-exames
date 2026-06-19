import { useEffect, useState, type ReactNode } from 'react';
import { Box, Button, Typography } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import { useNavigate } from 'react-router-dom';

/** Lê o user do localStorage e devolve se o plano premium está ativo agora. */
export function usePremium(): boolean {
  const [premium, setPremium] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      if (raw) {
        const u = JSON.parse(raw);
        setPremium(!!u?.planExpiresAt && new Date(u.planExpiresAt) > new Date());
      }
    } catch {
      /* user ausente/malformado → considera não-premium */
    }
  }, []);
  return premium;
}

/**
 * Envolve conteúdo premium: se o usuário NÃO for premium, aplica blur + overlay
 * com CTA de upgrade (linka pra /planos). Premium vê o conteúdo normal.
 */
export const PremiumGate = ({ children }: { children: ReactNode }) => {
  const premium = usePremium();
  const navigate = useNavigate();
  if (premium) return <>{children}</>;
  return (
    <Box sx={{ position: 'relative', borderRadius: 2, overflow: 'hidden' }}>
      <Box sx={{ filter: 'blur(4px)', opacity: 0.55, pointerEvents: 'none', userSelect: 'none' }}>
        {children}
      </Box>
      <Box sx={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 1, textAlign: 'center', p: 2,
      }}>
        <LockIcon sx={{ fontSize: 34, color: 'text.secondary' }} />
        <Typography sx={{ fontWeight: 700, fontSize: 14 }}>Previsão exclusiva do Premium</Typography>
        <Button variant="contained" size="small" onClick={() => navigate('/planos')}
          sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700, boxShadow: 'none' }}>
          Ver planos
        </Button>
      </Box>
    </Box>
  );
};
