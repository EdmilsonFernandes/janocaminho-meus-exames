import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import { useNavigate } from 'react-router-dom';
import { API_URL, token } from '../config';

/** Saldo de créditos no AppBar — chip TONAL discreto (o gradiente/sombra são assinatura da MARCA,
 *  não da carteira): ⚡ 97,2k compacto, toque → /planos. Número completo no aria-label/tooltip;
 *  saldo detalhado segue no drawer e no card do Dashboard. Sem olho (privacidade de banco não se
 *  aplica a non-dinheiro e criava botão aninhado — alvo colado + inválido p/ leitores de tela). */
export const CreditsChip = () => {
  const navigate = useNavigate();
  const [credits, setCredits] = useState<number | null>(null);
  const load = () => {
    // Anônimo na landing: NÃO dispara (boot anônimo pedia billing sem sessão — 401 no console)
    if (!token()) return Promise.resolve();
    return fetch(`${API_URL}/billing/status`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCredits(typeof d?.credits === 'number' ? d?.credits : null));
  };
  useEffect(() => {
    load();
    const h = () => load();
    window.addEventListener('selPatientChanged', h);
    window.addEventListener('creditsChanged', h);
    document.addEventListener('visibilitychange', h);   // rede de segurança: ao voltar pra aba/app refaz o saldo
    window.addEventListener('focus', h);
    return () => {
      window.removeEventListener('selPatientChanged', h);
      window.removeEventListener('creditsChanged', h);
      document.removeEventListener('visibilitychange', h);
      window.removeEventListener('focus', h);
    };
  }, []);
  if (credits == null) return null;
  // Saldo exato até 999.999 (feedback do dono: "tem que fazer jus do que o usuário tem" —
  // "999.999" ainda cabe no chip). ≥1 milhão vira compacto pt-BR ("1,2 mi"): 7+ dígitos
  // estouravam qualquer header ≤430px e empurravam sino/avatar pra fora da tela. O número
  // COMPLETO segue sempre no aria-label/tooltip (e no drawer + card do Dashboard).
  const full = credits.toLocaleString('pt-BR');
  const shown = credits >= 1_000_000
    ? new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(credits)
    : full;
  const open = () => navigate('/carteira');
  return (
    <Box
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
      role="button"
      tabIndex={0}
      aria-label={`Você tem ${full} créditos. Toque para ver a carteira.`}
      title={`Você tem ${full} créditos — toque para ver a carteira`}
      sx={(theme) => ({
        display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', userSelect: 'none', flexShrink: 0,
        px: 1.25, minHeight: 40, mr: 0.5, borderRadius: '999px',
        // Cap de largura (P0 header): chip nunca cresce além disso nem empurra os irmãos;
        // texto interno ellipsiza como última rede (não deveria ocorrer <1M).
        maxWidth: { xs: 108, sm: 160 }, overflow: 'hidden',
        // TONAL (fundo teal translúcido + texto teal): o gradiente/sombra ficam reservados à MARCA.
        // Texto #0f766e (light ~5,5:1) / #5fc9c3 (dark ~5,4:1) — AA nos dois temas.
        background: theme.palette.mode === 'dark' ? 'rgba(32,178,170,0.14)' : 'rgba(32,178,170,0.10)',
        border: theme.palette.mode === 'dark' ? '1px solid rgba(32,178,170,0.32)' : '1px solid rgba(32,178,170,0.25)',
        boxShadow: theme.palette.mode === 'dark' ? '0 1px 4px rgba(0,0,0,0.25)' : '0 1px 3px rgba(32,178,170,0.08)',
        color: theme.palette.mode === 'dark' ? '#5fc9c3' : '#0f766e',
        transition: 'all .15s ease',
        '&:hover': {
          background: theme.palette.mode === 'dark' ? 'rgba(32,178,170,0.22)' : 'rgba(32,178,170,0.18)',
          boxShadow: '0 2px 8px rgba(32,178,170,0.18)',
          transform: 'translateY(-0.5px)',
        },
        '&:active': { transform: 'scale(.96)' },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
      })}
    >
      <BoltIcon sx={{ fontSize: 16, color: '#f59e0b', filter: 'drop-shadow(0 1px 2px rgba(245,158,11,0.35))' }} />
      <Typography
        component="span"
        sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: 13, lineHeight: 1, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {shown}
      </Typography>
    </Box>
  );
};
