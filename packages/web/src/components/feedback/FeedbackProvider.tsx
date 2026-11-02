import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, Typography, Button, IconButton, Paper, useTheme, ListItemButton, ListItemIcon, ListItemText, MenuItem } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import { Capacitor } from '@capacitor/core';
import { DrExame } from '../DrExame';
import { FeedbackSurveyDialog } from './FeedbackSurveyDialog';
import { claimEngagementSlot } from '../../utils/coldDialog';
import { fetchEligibility, markDismissed, markInvited, type FeedbackMode } from '../../utils/feedbackApi';
import { track } from '../../utils/analytics';

/**
 * PROVIDER DE OPINIÕES (02/11/26) — dois pontos de entrada:
 *  1. permanente e discreto ("Dar minha opinião" no Perfil / menu do médico) → openSurvey();
 *  2. convite CONTEXTUAL (cartão não-bloqueante no rodapé) após experiência relevante →
 *     requestInvite(trigger). O servidor decide se convida (idade da conta, versão já
 *     respondida, intervalo após dispensa, máx. de dispensas); aqui só: 1 convite por
 *     sessão, nunca com outro modal aberto, e nunca na mesma sessão do patrocinador.
 * Convite ≠ pesquisa: o cartão não interrompe; a pesquisa (Dialog) só abre se a pessoa tocar.
 */
interface FeedbackCtx {
  openSurvey: (trigger: string) => void;
  requestInvite: (trigger: string) => void;
}
const Ctx = createContext<FeedbackCtx | null>(null);
const noop: FeedbackCtx = { openSurvey: () => {}, requestInvite: () => {} };

export function useFeedback(): FeedbackCtx {
  return useContext(Ctx) ?? noop;
}

const INVITE_DELAY_MS = 9000;
const SESSION_KEY = 'dx.fb.invitedThisSession';

const onDashboard = () => {
  const hash = window.location.hash ? window.location.hash.replace(/^#/, '') : '';
  const path = (hash || window.location.pathname || '/').split('?')[0];
  return path === '/' || path === '';
};

export const FeedbackProvider = ({ mode, autoInvite = true, children }: { mode: FeedbackMode; autoInvite?: boolean; children: ReactNode }) => {
  const [dialog, setDialog] = useState<{ open: boolean; trigger: string; fromInvite: boolean }>({ open: false, trigger: 'profile', fromInvite: false });
  const [invite, setInvite] = useState<{ trigger: string; hasExams?: boolean } | null>(null);
  const busyRef = useRef(false);
  const dialogOpenRef = useRef(false);
  dialogOpenRef.current = dialog.open;

  const openSurvey = useCallback((trigger: string) => {
    setInvite(null);
    setDialog({ open: true, trigger, fromInvite: false });
  }, []);

  const requestInvite = useCallback((trigger: string) => {
    if (busyRef.current || dialogOpenRef.current) return;
    try { if (sessionStorage.getItem(SESSION_KEY)) return; } catch { /* storage off */ }
    busyRef.current = true;
    (async () => {
      try {
        if (document.querySelector('.MuiDialog-root')) return; // nunca por cima de outro modal
        const e = await fetchEligibility(mode);
        if (!e.eligible) return;
        if (document.querySelector('.MuiDialog-root')) return;
        if (!claimEngagementSlot('survey')) return; // patrocinador já ocupou a sessão
        try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* storage off */ }
        markInvited(mode);
        setInvite({ trigger, hasExams: e.hasExams });
        track('feedback_invite_shown', { mode, trigger });
      } finally { busyRef.current = false; }
    })();
  }, [mode]);

  // Convite automático: paciente no dashboard (tela principal pronta), médico no portal —
  // sempre com delay (deixa o boot e os modais de boot assentarem).
  useEffect(() => {
    if (!autoInvite) return;
    const t = window.setTimeout(() => {
      if (mode === 'patient' && !onDashboard()) return;
      requestInvite(mode === 'patient' ? 'dashboard' : 'portal');
    }, INVITE_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [autoInvite, mode, requestInvite]);

  const value = useMemo(() => ({ openSurvey, requestInvite }), [openSurvey, requestInvite]);

  const acceptInvite = () => {
    if (!invite) return;
    track('feedback_invite_accepted', { mode, trigger: invite.trigger });
    setDialog({ open: true, trigger: invite.trigger, fromInvite: true });
    setInvite(null);
  };
  const declineInvite = () => {
    if (!invite) return;
    markDismissed(mode);
    track('feedback_invite_dismissed', { mode, trigger: invite.trigger });
    setInvite(null);
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {invite && <InviteCard mode={mode} hasExams={invite.hasExams} onAccept={acceptInvite} onDecline={declineInvite} />}
      <FeedbackSurveyDialog
        mode={mode} open={dialog.open} trigger={dialog.trigger} fromInvite={dialog.fromInvite}
        hasExams={invite?.hasExams}
        onClose={() => setDialog((d) => ({ ...d, open: false }))}
      />
    </Ctx.Provider>
  );
};

/** Cartão de convite — rodapé, não bloqueia nada, 2 ações claras. */
const InviteCard = ({ mode, hasExams, onAccept, onDecline }: { mode: FeedbackMode; hasExams?: boolean; onAccept: () => void; onDecline: () => void }) => {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  const native = Capacitor.isNativePlatform();
  const text = mode === 'doctor'
    ? 'Como está sendo usar o portal? Conte em 1 minuto o que ajuda e o que atrapalha.'
    : hasExams === false
      ? 'Ainda não enviou um exame? Conte o que dificultou começar — leva 1 minuto.'
      : 'Você conseguiu fazer o que precisava? Conte em 1 minuto — ajuda a melhorar o app.';
  return (
    <Paper
      role="dialog" aria-label="Convite para dar opinião" data-testid="feedback-invite" elevation={0}
      sx={{
        position: 'fixed', zIndex: (t) => t.zIndex.snackbar,
        left: { xs: 12, sm: 'auto' }, right: 12,
        bottom: { xs: 'calc(78px + env(safe-area-inset-bottom))', sm: 'calc(20px + env(safe-area-inset-bottom))' },
        width: { xs: 'auto', sm: 360 }, maxWidth: 'calc(100vw - 24px)',
        p: 1.75, borderRadius: '18px',
        bgcolor: dark ? 'rgba(26,36,36,.94)' : 'rgba(255,255,255,.94)',
        backdropFilter: native ? 'none' : 'blur(14px)', WebkitBackdropFilter: native ? 'none' : 'blur(14px)',
        border: '1px solid', borderColor: dark ? 'rgba(255,255,255,.10)' : 'rgba(15,90,86,.14)',
        boxShadow: dark ? '0 16px 40px rgba(0,0,0,.5)' : '0 16px 40px rgba(15,90,86,.18)',
        animation: 'fbInvIn .28s cubic-bezier(.16,1,.3,1) both',
        '@keyframes fbInvIn': { from: { opacity: 0, transform: 'translateY(16px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      }}
    >
      <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
        <DrExame size={36} sx={{ borderRadius: '28%', flexShrink: 0, mt: 0.25 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.4, color: 'text.primary' }}>{text}</Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1.25, flexWrap: 'wrap' }}>
            <Button onClick={onAccept} variant="contained" size="small" data-testid="feedback-invite-accept"
              sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 800, minHeight: 36, background: 'linear-gradient(135deg,#20b2aa,#178f89)' }}>
              Dar minha opinião
            </Button>
            <Button onClick={onDecline} variant="text" size="small" data-testid="feedback-invite-decline" sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 700, color: 'text.secondary', minHeight: 36 }}>
              Agora não
            </Button>
          </Box>
        </Box>
        <IconButton size="small" onClick={onDecline} aria-label="Fechar convite" sx={{ color: 'text.secondary', mt: -0.5, mr: -0.5 }}><CloseIcon fontSize="small" /></IconButton>
      </Box>
    </Paper>
  );
};

/** Item de menu lateral "Dar minha opinião" (portal do médico) — consome o provider. */
export const FeedbackMenuItem = ({ onNav }: { onNav?: () => void }) => {
  const { openSurvey } = useFeedback();
  return (
    <ListItemButton onClick={() => { openSurvey('menu'); onNav?.(); }} data-testid="feedback-menu-item">
      <ListItemIcon sx={{ minWidth: 38 }}><RateReviewOutlinedIcon sx={{ color: 'secondary.dark' }} /></ListItemIcon>
      <ListItemText primary="Dar minha opinião" primaryTypographyProps={{ fontWeight: 600 }} />
    </ListItemButton>
  );
};

/** Item do menu do avatar (MUI Menu) — mesma ação. */
export const FeedbackAvatarMenuItem = ({ onDone }: { onDone?: () => void }) => {
  const { openSurvey } = useFeedback();
  return (
    <MenuItem onClick={() => { onDone?.(); openSurvey('avatar-menu'); }} data-testid="feedback-avatar-item">
      <ListItemIcon><RateReviewOutlinedIcon fontSize="small" /></ListItemIcon>
      <ListItemText>Dar minha opinião</ListItemText>
    </MenuItem>
  );
};
