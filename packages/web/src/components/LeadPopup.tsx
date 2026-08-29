import { useEffect, useRef, useState } from 'react';
import { Box, Button, IconButton, Paper, Slide, Stack, TextField, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { API_URL } from '../config';

/**
 * Popup de captura de e-mail da landing (estratégia popup-cro aprovada).
 *
 * Regras anti-irritação (deliberadas):
 *  - Trigger: scroll 55% — só quem engajou; NUNCA no load (Google intrusive
 *    interstitials: bottom-sheet pós-engajamento não penaliza SEO mobile).
 *  - Frequência: 1×/sessão; após dismiss, cooldown de 7 dias; após submit, nunca mais.
 *  - Supressões: logado (token/doctorToken) ou já convertido não veem.
 *  - LGPD: finalidade única declarada + link de termos; nenhum dado de saúde.
 *  - Honeypot `website` (campo oculto) — bots recebem 201 e nada é gravado.
 */

const TEAL = '#20b2aa';
const TEAL_DARK = '#178f89';
const LS_SUBMITTED = 'lead_popup_submitted';
const LS_DISMISSED_AT = 'lead_popup_dismissed_at';
const SS_SEEN_SESSION = 'lead_popup_seen_session';
const COOLDOWN_MS = 7 * 24 * 3600_000;

export const LeadPopup = () => {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [err, setErr] = useState(''); // antes: e-mail inválido/rede falhavam em silêncio total
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const fired = useRef(false);

  useEffect(() => {
    // Supressões — storage bloqueado (private mode) → sem popup, sem erro.
    try {
      if (localStorage.getItem(LS_SUBMITTED)) return;
      if (localStorage.getItem('token') || localStorage.getItem('doctorToken')) return;
      if (sessionStorage.getItem(SS_SEEN_SESSION)) return;
      const dismissedAt = Number(localStorage.getItem(LS_DISMISSED_AT) ?? 0);
      if (dismissedAt && Date.now() - dismissedAt < COOLDOWN_MS) return;
    } catch { return; }

    const onScroll = () => {
      if (fired.current) return;
      const max = Math.max(1, document.body.scrollHeight - window.innerHeight);
      if (window.scrollY / max >= 0.55) {
        fired.current = true;
        window.removeEventListener('scroll', onScroll);
        try { sessionStorage.setItem(SS_SEEN_SESSION, '1'); } catch { /* ok */ }
        setOpen(true);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const close = () => {
    setOpen(false);
    try { localStorage.setItem(LS_DISMISSED_AT, String(Date.now())); } catch { /* ok */ }
  };

  const submit = async () => {
    if (sending) return;
    const mail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) { setErr('Confira o e-mail — parece incompleto.'); return; }
    setSending(true);
    setErr('');
    try {
      const r = await fetch(`${API_URL}/public/lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: mail, website: '' }),
      });
      if (!r.ok) { setErr('Não deu pra enviar agora — tente de novo em instantes.'); setSending(false); return; }
      try { localStorage.setItem(LS_SUBMITTED, '1'); } catch { /* ok */ }
      setDone(true);
      setTimeout(() => setOpen(false), 4500);
    } catch {
      setErr('Sem conexão agora — tente de novo.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Slide direction="up" in={open} mountOnEnter unmountOnExit>
      {/* Bottom-sheet no mobile (centro, ~90% largura, nunca tela cheia — Google-safe);
          card de canto no desktop. */}
      <Paper
        role="dialog"
        aria-label="Receber link do Dr. Exame por e-mail"
        elevation={0}
        sx={{
          position: 'fixed', zIndex: 1400,
          bottom: { xs: 12, sm: 20 },
          left: { xs: 12, sm: 'auto' },
          right: { xs: 12, sm: 20 },
          width: { xs: 'auto', sm: 372 },
          p: 2.5,
          borderRadius: '16px',
          border: '1px solid rgba(32,178,170,.35)',
          boxShadow: '0 24px 56px rgba(15,61,58,.22), 0 8px 20px rgba(15,61,58,.12)',
          background: 'linear-gradient(160deg,#ffffff 0%,#f2fbfa 100%)',
        }}
      >
        <IconButton
          onClick={close}
          aria-label="Fechar"
          size="small"
          sx={{ position: 'absolute', top: 8, right: 8, color: 'text.disabled' }}
        >
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>

        {done ? (
          <Stack spacing={1} sx={{ textAlign: 'center', py: 1.5 }}>
            <AutoAwesomeIcon sx={{ fontSize: 34, color: TEAL, mx: 'auto' }} />
            <Typography sx={{ fontWeight: 800, fontSize: 17, fontFamily: 'Poppins, sans-serif', color: 'text.primary' }}>
              Pronto! Confira seu e-mail 📩
            </Typography>
            <Typography sx={{ fontSize: 13.5, color: 'text.secondary', lineHeight: 1.5 }}>
              O link pra decifrar seu exame de graça já está a caminho.
            </Typography>
          </Stack>
        ) : (
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1.25} alignItems="center">
              <Box component="img" src={`${import.meta.env.BASE_URL}app-icon.png`} alt="Dr. Exame" sx={{ width: 34, height: 34, borderRadius: '16%', flexShrink: 0 }} />
              <Typography sx={{ fontWeight: 800, fontSize: 16.5, fontFamily: 'Poppins, sans-serif', color: 'text.primary', lineHeight: 1.2, pr: 3 }}>
                Seu exame de sangue vira <Box component="span" sx={{ color: TEAL_DARK, fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>português claro</Box>.
              </Typography>
            </Stack>
            <Typography sx={{ fontSize: 13.5, color: 'text.secondary', lineHeight: 1.5 }}>
              Deixe seu e-mail e receba o link pra decifrar seu 1º exame <b>de graça</b> — sem cartão, sem spam.
            </Typography>
            {/* honeypot: oculto pra humanos, irresistível pra bots */}
            <Box component="input" tabIndex={-1} autoComplete="off" aria-hidden="true" value="" onChange={() => {}} name="website" sx={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} />
            <Stack direction="row" spacing={1}>
              <TextField
                size="small"
                type="email"
                placeholder="seu@email.com"
                value={email}
                error={!!err}
                helperText={err || undefined}
                onChange={(e) => { setEmail(e.target.value); setErr(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                fullWidth
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px', bgcolor: '#fff' } }}
              />
              <Button
                onClick={submit}
                disabled={sending || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())}
                disableElevation
                sx={{
                  flexShrink: 0, borderRadius: '12px', textTransform: 'none', fontWeight: 800, fontSize: 14, px: 2.2,
                  color: '#fff', background: `linear-gradient(135deg,${TEAL},${TEAL_DARK})`,
                  '&:hover': { background: `linear-gradient(135deg,#1ca39c,#157a74)` },
                  '&.Mui-disabled': { bgcolor: 'rgba(32,178,170,.35)', color: '#fff' },
                }}
              >
                {sending ? 'Enviando…' : 'Decifrar grátis'}
              </Button>
            </Stack>
            <Stack direction="row" spacing={0.75} justifyContent="space-between" alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
              <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                Só conteúdo do Dr. Exame. <Box component="a" href="#/termos" sx={{ color: TEAL_DARK, textDecoration: 'none', fontWeight: 700 }}>LGPD</Box>. Cancele quando quiser.
              </Typography>
              <Button variant="text" size="small" onClick={close} sx={{ textTransform: 'none', fontSize: 12, color: 'text.secondary', minWidth: 0, px: 0.5, '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' } }}>
                Agora não
              </Button>
            </Stack>
          </Stack>
        )}
      </Paper>
    </Slide>
  );
};
