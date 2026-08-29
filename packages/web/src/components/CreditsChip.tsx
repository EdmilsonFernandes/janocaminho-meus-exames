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
  // Saldo SEMPRE exato e formatado (97.009, nunca "97k"): carteira do usuário não se
  // abrevia — feedback do dono: "tem que fazer jus do que o usuário tem". Chip elástico
  // (pill sem width fixa) acomoda; fonte 13 tabular mantém o alinhamento estável.
  const full = credits.toLocaleString('pt-BR');
  const open = () => navigate('/planos');
  return (
    <Box
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
      role="button"
      tabIndex={0}
      aria-label={`Você tem ${full} créditos. Toque para comprar mais.`}
      title={`Você tem ${full} créditos — toque para comprar mais`}
      sx={(theme) => ({
        display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', userSelect: 'none', flexShrink: 0,
        px: 1.25, minHeight: 40, mr: 0.5, borderRadius: '999px',
        // TONAL (fundo teal translúcido + texto teal): o gradiente/sombra ficam reservados à MARCA.
        // Texto #0f766e (light ~5,5:1) / #5fc9c3 (dark ~5,4:1) — AA nos dois temas.
        background: 'rgba(32,178,170,0.12)',
        border: '1px solid rgba(32,178,170,0.28)',
        color: theme.palette.mode === 'dark' ? '#5fc9c3' : '#0f766e',
        transition: 'background-color .15s ease, transform .12s ease',
        '&:hover': { background: 'rgba(32,178,170,0.20)' },
        '&:active': { transform: 'scale(.96)' },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
      })}
    >
      <BoltIcon sx={{ fontSize: 15 }} />
      <Typography
        component="span"
        sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: 13, lineHeight: 1, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}
      >
        {full}
      </Typography>
    </Box>
  );
};
