/**
 * Portão entre o login do médico e o dashboard (R1 do plano: tela cheia, não card).
 *
 * Médico aprovado → o dashboard (`children`) e mais nada. Médico antigo (`legacy`) no prazo →
 * dashboard + banner "Verifique sua identidade". Qualquer outro estado → SÓ a jornada de
 * verificação; o dashboard nem monta, então nenhum fetch dele dispara (o servidor responderia
 * 403 VERIFICATION_REQUIRED em todos).
 *
 * `children` é um elemento: React só monta o dashboard se este componente o devolver.
 */
import { useState, type ReactNode } from 'react';
import { useDoctorVerification, type DoctorVerification } from './useDoctorVerification';
import {
  KycApproved, KycBlocked, KycChecking, KycContinue, KycIntro, KycLiveRegion, KycLoadError, KycLoading, KycRejected, KycReview,
  LegacyVerifyBanner, type KycStartControls,
} from './KycScreens';
import { KYC_COPY, attemptPhase, isLegacyExpired, type KycScreen } from './kycState';

/** O que o leitor de tela ouve quando a tela troca. */
const ANNOUNCE: Partial<Record<KycScreen, string>> = {
  intro: KYC_COPY.intro.title,
  continue: KYC_COPY.continue.title,
  checking: KYC_COPY.checking.title,
  review: KYC_COPY.review.title,
  rejected: KYC_COPY.rejected.title,
  blocked: KYC_COPY.blocked.title,
  approved: `${KYC_COPY.approved.title}. ${KYC_COPY.approved.body}`,
  error: KYC_COPY.loadError.title,
};

const KycJourney = ({ kyc, onLogout }: { kyc: DoctorVerification; onLogout: () => void }) => {
  const { view, snapshot, doctor } = kyc;
  const attempt = snapshot?.attempt ?? null;
  const start: KycStartControls = {
    onStart: () => { void kyc.start('open'); },
    onCopyLink: () => { void kyc.start('copy'); },
    starting: kyc.starting,
    error: kyc.startError,
    copied: kyc.copied,
  };

  let screen: ReactNode;
  switch (view.screen) {
    case 'intro':
      screen = <KycIntro doctor={doctor} onLogout={onLogout} start={start} expired={!!snapshot && isLegacyExpired(snapshot, Date.now())} />;
      break;
    case 'continue':
      screen = <KycContinue doctor={doctor} onLogout={onLogout} start={start} />;
      break;
    case 'checking':
      screen = (
        <KycChecking
          doctor={doctor} onLogout={onLogout}
          slow={kyc.checkingSlow} busy={kyc.refreshing} onRefresh={kyc.retryChecking}
          canResume={attemptPhase(attempt) === 'pre'} onResume={kyc.resume}
        />
      );
      break;
    case 'review':
      screen = <KycReview doctor={doctor} onLogout={onLogout} onRefresh={() => { void kyc.refresh(); }} busy={kyc.refreshing} />;
      break;
    case 'rejected':
      screen = <KycRejected doctor={doctor} onLogout={onLogout} attempt={attempt} start={start} />;
      break;
    case 'blocked':
      screen = <KycBlocked doctor={doctor} onLogout={onLogout} reason={kyc.blocked?.reason ?? null} />;
      break;
    case 'approved':
      screen = <KycApproved onContinue={kyc.acknowledgeApproved} />;
      break;
    case 'error':
      screen = <KycLoadError onRetry={() => { void kyc.refresh(); }} busy={kyc.refreshing} onLogout={onLogout} />;
      break;
    default:
      screen = <KycLoading />;
  }
  return (
    <>
      <KycLiveRegion text={ANNOUNCE[view.screen] ?? ''} />
      {screen}
    </>
  );
};

export const DoctorVerificationGate = ({ token, onLogout, children }: { token: string; onLogout: () => void; children: ReactNode }) => {
  const kyc = useDoctorVerification(token, onLogout);
  const [bannerDismissed, setBannerDismissed] = useState(false); // dispensável na sessão (não persiste)

  if (kyc.view.screen === 'dashboard') {
    const { banner } = kyc.view;
    return (
      <>
        {banner && !bannerDismissed ? (
          <LegacyVerifyBanner
            kind={banner}
            graceUntilMs={kyc.snapshot?.legacyGraceUntilMs ?? null}
            onVerify={() => { void kyc.start('open'); }}
            onDismiss={() => setBannerDismissed(true)}
            busy={kyc.starting}
            error={kyc.startError}
          />
        ) : null}
        {children}
      </>
    );
  }
  return <KycJourney kyc={kyc} onLogout={onLogout} />;
};
