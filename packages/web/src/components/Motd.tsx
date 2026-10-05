import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, IconButton, Fade,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { DrExame } from './DrExame';
import { claimColdDialog } from '../utils/coldDialog';
import { fetchPublicConfig, token } from '../config';
import { useNudgeQueue } from '../hooks/useNudgeQueue';

/** MOTD — Mensagem do Dia (padrão de apps maduros): dialog de boas-vindas controlado pelo
 *  ADMIN (AppSetting `motd`), sem deploy. Anuncia feature, promo, novidade.
 *  Frequência: 1x por CONTEÚDO (hash do título+mensagem) — mudou o texto = mostra de novo.
 *  Guarda anti-cascata: entra na bateria do claimColdDialog (máx 1 diálogo de cold-load por
 *  sessão, junto de WhatsNew/GoalQuiz/NotificationPopup) e abre com delay (deixa o boot assentar).
 *  FILA DE NUDGES (05/10): a abertura passa pela useNudgeQueue — um modal por vez, com
 *  prioridade (MOTD=80: broadcast do admin ganha da maioria). O close resolve a espera. */
export const Motd = () => {
  const navigate = useNavigate();
  const { enqueue } = useNudgeQueue();
  const [open, setOpen] = useState(false);
  const [motd, setMotd] = useState<{ title: string; message: string; ctaLabel: string; ctaRoute: string } | null>(null);
  const closeQueueRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!token()) return; // só usuário autenticado
    let cancelled = false;
    // Delay de boot: não compete com splash/carregamento — e o claimColdDialog decide a vez.
    const t = setTimeout(() => {
      fetchPublicConfig().then((c) => {
        if (cancelled || !c.motd.enabled || !c.motd.title || !c.motd.message) return;
        const hash = String(c.motd.title + '|' + c.motd.message).slice(0, 120); // id do conteúdo
        let shown = '';
        try { shown = localStorage.getItem('motdShown') ?? ''; } catch { /* storage off */ }
        if (shown === hash) return; // já viu ESTE conteúdo
        if (!claimColdDialog('motd')) return; // outro diálogo ganhou a sessão
        setMotd({ title: c.motd.title, message: c.motd.message, ctaLabel: c.motd.ctaLabel, ctaRoute: c.motd.ctaRoute });
        // Enfileira em vez de abrir direto: se outro nudge estiver na tela, espera a vez.
        enqueue('motd', 80, () => new Promise<void>((resolve) => {
          closeQueueRef.current = resolve;
          setOpen(true);
        }));
      }).catch(() => { /* config fora — silencioso */ });
    }, 2600);
    return () => { cancelled = true; clearTimeout(t); };
  }, []);

  const dismiss = (goRoute?: string) => {
    setOpen(false);
    try { localStorage.setItem('motdShown', String(motd ? motd.title + '|' + motd.message : '').slice(0, 120)); } catch { /* ignore */ }
    if (goRoute) navigate(goRoute);
    closeQueueRef.current?.(); // libera a fila pro próximo nudge
    closeQueueRef.current = null;
  };

  if (!open || !motd) return null;

  return (
    <Fade in timeout={250}>
      <Dialog open onClose={() => dismiss()} PaperProps={{ sx: { borderRadius: '18px', maxWidth: 420, width: '100%' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pr: 1, pb: 1 }}>
          <DrExame size={44} sx={{ borderRadius: '28%' }} />
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 17, color: 'text.primary', lineHeight: 1.2 }}>
              {motd.title}
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => dismiss()} aria-label="Fechar"><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14.5, color: 'text.secondary', whiteSpace: 'pre-line', lineHeight: 1.55 }}>
            {motd.message}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          {motd.ctaLabel && motd.ctaRoute ? (
            <Button
              onClick={() => dismiss(motd.ctaRoute)}
              variant="contained" endIcon={<AutoAwesomeIcon />}
              sx={{
                borderRadius: '12px', textTransform: 'none', fontWeight: 800,
                background: 'linear-gradient(135deg,#20b2aa,#178f89)',
                '&:hover': { background: 'linear-gradient(135deg,#178f89,#14655f)' },
              }}
            >
              {motd.ctaLabel}
            </Button>
          ) : (
            <Button onClick={() => dismiss()} variant="text" sx={{ textTransform: 'none', fontWeight: 700 }}>
              Entendi
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Fade>
  );
};
