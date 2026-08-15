import { useEffect, useState } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import VisibilityIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOffOutlined';
import { useNavigate } from 'react-router-dom';
import { API_URL, token } from '../config';

const HIDDEN_KEY = 'meus_exames_credits_hidden';

/** Wallet de créditos premium (estilo carteira de banco): pílula gradiente teal + saldo em destaque
 *  + botão de olho p/ ocultar (não é valor financeiro/cripto — o usuário pode querer privacidade só).
 *  Default: VISÍVEL. Toque no olho → oculta/mostra (persiste em localStorage). Toque no corpo → /planos.
 *  Sempre visível no AppBar (mobile + desktop) — preenche o espaço vazio ao lado do Dr. Exame. */
export const CreditsChip = () => {
  const navigate = useNavigate();
  const [credits, setCredits] = useState<number | null>(null);
  const [hidden, setHidden] = useState<boolean>(() => {
    try { return localStorage.getItem(HIDDEN_KEY) === '1'; } catch { return false; }
  });
  const load = () => {
    // Anônimo na landing: NÃO dispara (boot anônimo pedia billing sem sessão — 401 no console)
    if (!token()) return Promise.resolve();
    return fetch(`${API_URL}/billing/status`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCredits(typeof d?.credits === 'number' ? d.credits : null));
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
  const toggleHidden = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !hidden;
    setHidden(next);
    try { localStorage.setItem(HIDDEN_KEY, next ? '1' : '0'); } catch { /* localStorage indisponível */ }
  };
  return (
    <Box
      onClick={() => navigate('/planos')}
      role="button"
      aria-label={`Você tem ${credits} créditos. Toque para comprar mais.`}
      title={`Você tem ${credits} créditos — toque para comprar mais`}
      sx={{
        display: 'flex', alignItems: 'center', gap: 0.4, cursor: 'pointer', userSelect: 'none',
        pl: 1, pr: 0.25, py: 0.3, mr: 0.5, borderRadius: '999px',
        background: 'linear-gradient(135deg,#20b2aa 0%,#178f89 100%)',
        color: '#fff', boxShadow: '0 4px 14px rgba(32,178,170,.32)',
        border: '1px solid rgba(255,255,255,.18)',
        transition: 'transform .12s ease, box-shadow .12s ease',
        '&:active': { transform: 'scale(.96)' },
        '&:hover': { boxShadow: '0 6px 18px rgba(32,178,170,.42)' },
      }}
    >
      <BoltIcon sx={{ fontSize: 16, filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.2))' }} />
      <Typography
        component="span"
        sx={{
          fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: 14, lineHeight: 1,
          letterSpacing: '-0.01em', minWidth: 14, textAlign: 'center',
        }}
      >
        {hidden ? '•••' : credits}
      </Typography>
      {/* Olho: oculta/mostra o saldo (privacidade — não é $$, mas o usuário pode querer esconder) */}
      <IconButton
        onClick={toggleHidden}
        size="small"
        aria-label={hidden ? 'Mostrar créditos' : 'Ocultar créditos'}
        title={hidden ? 'Mostrar' : 'Ocultar'}
        sx={{
          p: 0.3, color: '#fff', ml: 0.1,
          bgcolor: 'rgba(255,255,255,.12)',
          '&:hover': { bgcolor: 'rgba(255,255,255,.22)' },
          '& .MuiSvgIcon-root': { fontSize: 15 },
        }}
      >
        {hidden ? <VisibilityOffIcon /> : <VisibilityIcon />}
      </IconButton>
    </Box>
  );
};
