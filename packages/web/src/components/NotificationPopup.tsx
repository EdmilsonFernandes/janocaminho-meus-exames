import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Stack, Box } from '@mui/material';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import { useNavigate } from 'react-router-dom';
import { API_URL, token } from '../config';
import { DrExame } from './DrExame';
import { notifRoute } from '../utils/notifRoute';
import { claimColdDialog } from '../utils/coldDialog';

export const NotificationPopup = () => {
  const [open, setOpen] = useState(false);
  const [notif, setNotif] = useState<{ id?: string; title: string; body: string; data?: any } | null>(null);
  const navigate = useNavigate();

  // ── Ligação recebida (dono 30/10: "não emite som quando liga") ──────────────
  // Push de teleconsulta com o app ABERTO caía no popup genérico, mudo. Agora a
  // variante "ligação" TOCA (Web Audio, mesma dupla 440/480Hz do ringback da sala,
  // cadência Brasília 1s on/3s off) + vibra. Som é cortesia: qualquer falha
  // (autoplay suspenso no navegador, sem vibrador) nunca quebra o popup — o
  // visual de chamada continua. Para sozinho em 45s (ninguém atendeu) ou ao
  // fechar/atender; APK toca sempre (WebView com autoplay liberado).
  const ringCtxRef = useRef<AudioContext | null>(null);
  const ringIvRef = useRef<number | null>(null);
  const ringStopTimerRef = useRef<number | null>(null);

  const stopRing = useCallback(() => {
    if (ringIvRef.current) { clearInterval(ringIvRef.current); ringIvRef.current = null; }
    if (ringStopTimerRef.current) { clearTimeout(ringStopTimerRef.current); ringStopTimerRef.current = null; }
    try { (navigator as any).vibrate?.(0); } catch { /* sem vibrador */ }
    try { void ringCtxRef.current?.close?.(); } catch { /* já fechado */ }
    ringCtxRef.current = null;
  }, []);

  const startRing = useCallback(() => {
    stopRing();
    const burst = () => {
      try {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        if (AC) {
          if (!ringCtxRef.current) ringCtxRef.current = new AC();
          const ctx = ringCtxRef.current!;
          if (ctx.state === 'suspended') ctx.resume().catch(() => {});
          for (const [freq, vol] of [[440, 0.4], [480, 0.22]] as const) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.value = 0;
            const t0 = ctx.currentTime;
            gain.gain.linearRampToValueAtTime(vol, t0 + 0.03);
            gain.gain.linearRampToValueAtTime(0, t0 + 1.0);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t0);
            osc.stop(t0 + 1.05);
          }
        }
      } catch { /* som é cortesia — nunca quebra o popup */ }
      try { (navigator as any).vibrate?.([700, 300, 700]); } catch { /* sem vibrador */ }
    };
    burst();
    ringIvRef.current = window.setInterval(burst, 4000);
    ringStopTimerRef.current = window.setTimeout(() => stopRing(), 45_000);
  }, [stopRing]);

  useEffect(() => () => stopRing(), [stopRing]);

  useEffect(() => {
    const t = token();
    if (!t) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dead = false;
    fetch(`${API_URL}/notifications`, { headers: { Authorization: `Bearer ${t}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (dead) return;
        if (d && d.unread > 0 && d.items && d.items.length > 0) {
          // Não surfar notificação VELHA: nudges de engajamento antigos (ex.: "envie seu 1º exame"
          // numa conta que JÁ tem exames) pipocavam como dialog na entrada, meses depois, em estado
          // mentiroso. Só notificação recente (<7d) e que não seja nudge de 1º exame vira popup.
          const FRESH_MS = 7 * 24 * 60 * 60 * 1000;
          const item = d.items.find((n: any) => n.type !== 'first_exam' && Date.now() - new Date(n.createdAt).getTime() < FRESH_MS);
          if (!item) return;
          // Não reabre notificação já dispensada: o "Depois" persiste o id. Sem isto, todo boot
          // com unread>0 reinterpõe o modal (irritante — sempre há não-lidas no app de saúde).
          let dismissedId: string | null = null;
          try { dismissedId = localStorage.getItem('meDismissedNotif'); } catch { /* ignore */ }
          if (dismissedId != null && String(item.id) === String(dismissedId)) return;
          setNotif({ id: item.id, title: item.title, body: item.body });
          // Só abre se o app tá visível — evita dialog fantasma pipocando depois
          // de voltar do background (parecia "app travado" após ocioso).
          // + Máx 1 diálogo de cold-load por SESSÃO (P1 bateria 2026-09): se WhatsNew/GoalQuiz
          // já abriram nesta sessão, a notificação fica pro badge/bell, não vira modal.
          // + SÓ NA HOME (auditoria UX 29/10/26): em deep link (push → tela específica,
          // /medicamentos, /exams…) o modal cobria o conteúdo que o usuário já estava
          // lendo, ~3s depois do boot. Fora da home a notificação fica no sininho.
          const atHome = () => { try { const h = window.location.hash.replace(/^#/, '').split('?')[0]; return h === '/' || h === ''; } catch { return false; } };
          timer = setTimeout(() => { if (!document.hidden && atHome() && claimColdDialog('notif')) setOpen(true); }, 2500);
        }
      })
      .catch(() => {});
    return () => { dead = true; if (timer) clearTimeout(timer); };
  }, []);

  useEffect(() => {
    const onReceived = (e: any) => {
      const data = (e.detail && e.detail.data) || {};
      setNotif({ title: (e.detail && e.detail.title) || 'Nova notificacao', body: (e.detail && e.detail.body) || '', data });
      setOpen(true);
      // Ligação recebida (médico chamando): toca + vibra até atender/dispensar.
      if (data?.type === 'teleconsulta' && data?.reminderId) startRing();
    };
    // Toque na notificação (tray): leva direto à tela certa (chamada/perguntas/exames/...) — não deixa "morta".
    const onTapped = (e: any) => navigate(notifRoute({ data: e?.detail?.data }) || '/notificacoes');
    window.addEventListener('pushReceived', onReceived);
    window.addEventListener('pushTapped', onTapped);
    return () => {
      window.removeEventListener('pushReceived', onReceived);
      window.removeEventListener('pushTapped', onTapped);
    };
  }, [navigate, startRing]);

  if (!notif) return null;

  const isCall = notif.data?.type === 'teleconsulta' && !!notif.data?.reminderId;
  const callRoute = isCall ? (notifRoute(notif) || `/teleconsulta/${notif.data.reminderId}`) : null;

  const closePopup = () => { stopRing(); setOpen(false); };

  return (
    <Dialog
      open={open}
      onClose={closePopup}
      slotProps={{
        backdrop: {
          sx: {
            backdropFilter: 'blur(10px)',
            backgroundColor: 'rgba(15, 24, 24, 0.45)',
          }
        }
      }}
      PaperProps={{
        sx: {
          borderRadius: '24px',
          maxWidth: 420,
          width: '92%',
          p: { xs: 2.5, sm: 3 },
          position: 'relative',
          overflow: 'hidden',
          background: (t) => t.palette.mode === 'dark'
            ? 'radial-gradient(ellipse at 50% -20%, rgba(32,178,170,0.22), transparent 70%), #131d1d'
            : 'radial-gradient(ellipse at 50% -20%, rgba(32,178,170,0.18), transparent 70%), #ffffff',
          boxShadow: '0 24px 60px -12px rgba(0,0,0,0.35), 0 0 0 1px rgba(32,178,170,0.2)',
        }
      }}
    >
      <DialogTitle sx={{ textAlign: 'center', p: 0, mb: 1.5 }}>
        <Stack alignItems="center" spacing={1.5}>
          <Box sx={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
            {/* Ondas sonar na ligação (mesma linguagem da sala de espera da chamada) */}
            {isCall && (
              <>
                <Box aria-hidden sx={{
                  position: 'absolute', inset: -10, borderRadius: '50%',
                  border: '2px solid rgba(32,178,170,0.45)',
                  animation: 'dxNotifSonar 2.2s infinite cubic-bezier(0.22,1,0.36,1)',
                  '@keyframes dxNotifSonar': {
                    '0%': { transform: 'scale(0.9)', opacity: 0.9 },
                    '100%': { transform: 'scale(1.8)', opacity: 0 },
                  },
                }} />
                <Box aria-hidden sx={{
                  position: 'absolute', inset: -10, borderRadius: '50%',
                  border: '1.5px solid rgba(32,178,170,0.3)',
                  animation: 'dxNotifSonar 2.2s infinite cubic-bezier(0.22,1,0.36,1) 0.8s',
                }} />
              </>
            )}
            <Box sx={{
              p: 0.5,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(32,178,170,0.3), rgba(212,165,116,0.3))',
              boxShadow: '0 8px 24px rgba(32,178,170,0.25)',
            }}>
              <DrExame size={52} sx={{ borderRadius: '50%' }} />
            </Box>
          </Box>
          <Typography sx={{
            fontWeight: 800,
            fontSize: 19,
            fontFamily: '"Poppins",sans-serif',
            color: 'text.primary',
            letterSpacing: '-0.02em',
            lineHeight: 1.25,
          }}>
            {notif.title}
          </Typography>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ p: 0, my: 1 }}>
        <Typography sx={{
          textAlign: 'center',
          lineHeight: 1.6,
          fontSize: 14.5,
          color: 'text.secondary',
          whiteSpace: 'pre-wrap',
        }}>
          {isCall ? 'Chamada de vídeo — toque em atender pra entrar na sala.' : notif.body}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'center', p: 0, mt: 2.5, gap: 1.25, width: '100%' }}>
        <Button
          fullWidth
          variant="outlined"
          onClick={() => {
            try { if (!isCall && notif?.id != null) localStorage.setItem('meDismissedNotif', String(notif.id)); } catch { /* ignore */ }
            closePopup();
          }}
          sx={{
            borderRadius: '999px',
            textTransform: 'none',
            fontWeight: 700,
            fontSize: 14,
            py: 1.2,
            borderColor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
            color: 'text.secondary',
            '&:hover': {
              borderColor: 'primary.main',
              bgcolor: 'action.hover',
            }
          }}
        >
          {isCall ? 'Agora não' : 'Ver depois'}
        </Button>
        <Button
          fullWidth
          variant="contained"
          startIcon={isCall ? <VideocamRoundedIcon /> : undefined}
          onClick={() => {
            if (!isCall && notif?.id) {
              fetch(`${API_URL}/notifications/${notif.id}/read`, { method: 'PATCH', headers: { Authorization: `Bearer ${token()}` } }).catch(() => {});
              window.dispatchEvent(new Event('notificationsRead'));
            }
            closePopup();
            navigate((isCall ? callRoute : notifRoute(notif)) || '/notificacoes');
          }}
          sx={{
            borderRadius: '999px',
            textTransform: 'none',
            fontWeight: 800,
            fontSize: 14,
            py: 1.2,
            background: isCall ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #20b2aa, #178f89)',
            boxShadow: isCall ? '0 6px 18px rgba(16,185,129,0.4)' : '0 6px 18px rgba(32,178,170,0.35)',
            '&:hover': {
              background: isCall ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #1ea39b, #137772)',
              boxShadow: isCall ? '0 8px 24px rgba(16,185,129,0.5)' : '0 8px 24px rgba(32,178,170,0.45)',
            }
          }}
        >
          {isCall ? 'Atender' : (notifRoute(notif) ? 'Ver agora' : 'Ver detalhes')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
