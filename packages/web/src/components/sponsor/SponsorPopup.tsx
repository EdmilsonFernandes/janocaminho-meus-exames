import { useEffect, useRef, useState } from 'react';
import { Dialog, useTheme, useMediaQuery } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { claimColdDialog, claimEngagementSlot, isColdDialogFree, isEngagementSlotFree } from '../../utils/coldDialog';
import { useNudgeQueue } from '../../hooks/useNudgeQueue';
import { fetchEligibleCampaign, newImpressionId, postCampaignEvent, sponsorAssetUrl, type SponsorCampaign, type SponsorMode } from '../../utils/sponsorApi';
import { SponsorCard, glassPaperSx } from './SponsorCard';
import { track } from '../../utils/analytics';

/**
 * POPUP DE PATROCINADOR (02/11/26) — elegível DEPOIS do login, com a tela principal pronta.
 *
 * Regras de abertura (ver spec do dono):
 *  - paciente: só na rota "/" (dashboard) — nunca no meio de upload/pagamento/teleconsulta;
 *  - espera o boot assentar (delay) e nenhum outro Dialog aberto;
 *  - entra na bateria do claimColdDialog (máx 1 modal de boot por sessão: onboarding,
 *    WhatsNew, MOTD… ganham dele) e no slot de engajamento (patrocínio OU pesquisa por sessão);
 *  - abre pela useNudgeQueue com prioridade BAIXA (30) — nunca fura MOTD/WhatsNew;
 *  - servidor decide frequência/dispensa (persistido por usuário; vale em qualquer aparelho);
 *  - qualquer falha = sem popup. O app segue normal.
 * Eventos: impressão ao abrir; clique OU dispensa ao fechar (1 por impressão, idempotente).
 */
const BOOT_DELAY_MS = 3500;
const WAIT_DIALOGS_MS = 30_000;

const onDashboard = () => {
  const hash = window.location.hash ? window.location.hash.replace(/^#/, '') : '';
  const path = (hash || window.location.pathname || '/').split('?')[0];
  return path === '/' || path === '';
};

export const SponsorPopup = ({ mode = 'patient' }: { mode?: SponsorMode }) => {
  const navigate = useNavigate();
  const theme = useTheme();
  const fullWidth = useMediaQuery(theme.breakpoints.down('sm'));
  const { enqueue } = useNudgeQueue();
  const [campaign, setCampaign] = useState<SponsorCampaign | null>(null);
  const [open, setOpen] = useState(false);
  const impressionRef = useRef<string>('');
  const resolvedRef = useRef<'click' | 'dismiss' | null>(null);
  const closeQueueRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let dead = false;
    let iv: number | undefined;
    let kill: number | undefined;
    const t = window.setTimeout(() => {
      if (dead) return;
      if (mode === 'patient' && !onDashboard()) return; // outra rota: não interrompe (sem selar; próximo boot no dashboard)
      // Espera modais abertos fecharem; desiste em silêncio se demorar demais.
      iv = window.setInterval(async () => {
        if (dead) return;
        if (document.querySelector('.MuiDialog-root')) return;
        if (mode === 'patient' && !onDashboard()) { window.clearInterval(iv); return; }
        window.clearInterval(iv); iv = undefined;
        // Espia os slots ANTES da rede e só RESERVA depois de ter campanha: sem campanha
        // elegível a sessão continua livre pro convite de opinião (achado do E2E 02/11).
        if (mode === 'patient' && !isColdDialogFree()) return; // outro diálogo de boot ganhou a sessão
        if (!isEngagementSlotFree('sponsor')) return; // pesquisa de opinião já ocupou a sessão
        const c = await fetchEligibleCampaign(mode);
        if (dead || !c) return;
        if (mode === 'patient' && !claimColdDialog('sponsor')) return;
        if (!claimEngagementSlot('sponsor')) return;
        setCampaign(c);
        enqueue('sponsor', 30, () => new Promise<void>((resolve) => {
          closeQueueRef.current = resolve;
          impressionRef.current = newImpressionId();
          resolvedRef.current = null;
          setOpen(true);
          postCampaignEvent(mode, c.id, 'impression', impressionRef.current);
          track('sponsor_impression', { campaignId: c.id, mode });
        }));
      }, 1200);
      kill = window.setTimeout(() => { if (iv) window.clearInterval(iv); }, WAIT_DIALOGS_MS);
    }, BOOT_DELAY_MS);
    return () => { dead = true; window.clearTimeout(t); if (iv) window.clearInterval(iv); if (kill) window.clearTimeout(kill); };
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = (how: 'click' | 'dismiss') => {
    if (!campaign) return;
    if (!resolvedRef.current) {
      resolvedRef.current = how;
      postCampaignEvent(mode, campaign.id, how, impressionRef.current);
      track(how === 'click' ? 'sponsor_click' : 'sponsor_dismiss', { campaignId: campaign.id, mode });
    }
    setOpen(false);
    closeQueueRef.current?.();
    closeQueueRef.current = null;
  };

  const onPrimary = async () => {
    if (!campaign || !campaign.ctaTarget) { finish('dismiss'); return; }
    const target = campaign.ctaTarget;
    finish('click');
    if (campaign.ctaType === 'internal') { navigate(target); return; }
    // Externa: Custom Tab no APK (nunca navega a WebView); nova aba na web (noopener).
    if (Capacitor.isNativePlatform()) {
      try { const { Browser } = await import('@capacitor/browser'); await Browser.open({ url: target, toolbarColor: '#178f89' }); return; } catch { /* cai no window.open */ }
    }
    window.open(target, '_blank', 'noopener,noreferrer');
  };

  if (!open || !campaign) return null;
  const dark = theme.palette.mode === 'dark';
  const native = Capacitor.isNativePlatform();

  return (
    <Dialog
      open onClose={() => finish('dismiss')} data-testid="sponsor-popup"
      aria-labelledby="sponsor-title"
      transitionDuration={220}
      slotProps={{ backdrop: { sx: { bgcolor: dark ? 'rgba(4,10,10,.55)' : 'rgba(15,40,38,.35)', backdropFilter: native ? 'none' : 'blur(3px)' } } }}
      PaperProps={{
        sx: {
          ...glassPaperSx(dark, native),
          width: fullWidth ? 'calc(100% - 24px)' : '100%', maxWidth: 400, m: fullWidth ? 1.5 : 2,
          // safe areas (APK/PWA): o conteúdo nunca encosta na barra do sistema
          mb: fullWidth ? 'max(12px, env(safe-area-inset-bottom))' : 2,
          maxHeight: 'calc(100dvh - 32px - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
          animation: 'spIn .22s cubic-bezier(.16,1,.3,1) both',
          '@keyframes spIn': { from: { opacity: 0, transform: 'translateY(10px) scale(.97)' }, to: { opacity: 1, transform: 'translateY(0) scale(1)' } },
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        },
      }}
    >
      <SponsorCard
        campaign={campaign}
        logoSrc={sponsorAssetUrl(campaign.sponsor.logoUrl)}
        imageSrc={sponsorAssetUrl(campaign.imageUrl)}
        onPrimary={onPrimary}
        onClose={() => finish('dismiss')}
      />
    </Dialog>
  );
};
