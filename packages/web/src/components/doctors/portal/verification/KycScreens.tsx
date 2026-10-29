/**
 * Telas da jornada de verificação de identidade do médico (KYC UaiID).
 *
 * Só apresentação: cada tela recebe dados e callbacks prontos (quem decide QUAL tela é o
 * `resolveKycView`, quem fala com o servidor é o `useDoctorVerification`).
 * Design system do repo: teal #20b2aa + cobre #d4a574, mascote Dr. Exame, Poppins nos títulos,
 * cartão radius 16 com sombra teal (referência: cartão de login do DoctorPortal), uma ação
 * primária por tela, mobile-first (375 px), alvos >= 48 px, claro e escuro,
 * `prefers-reduced-motion` respeitado e nenhum reload (o APK crasha) — "atualizar" é reler o GET.
 */
import { useEffect, useRef, useState, type ChangeEvent, type FocusEvent, type FormEvent, type ReactNode } from 'react';
import { Alert, Box, Button, CircularProgress, GlobalStyles, IconButton, Typography } from '@mui/material';
import { keyframes, useTheme } from '@mui/material/styles';
// Ícones por caminho direto: o barrel '@phosphor-icons/react' tem ~3.000 exports e leva ~90 s só para importar
// em ambiente node (vitest) — o caminho direto carrega só o ícone (0,2 s) e rende o mesmo código no bundle.
import { ArrowClockwise } from '@phosphor-icons/react/dist/csr/ArrowClockwise';
import { ArrowRight } from '@phosphor-icons/react/dist/csr/ArrowRight';
import { Check } from '@phosphor-icons/react/dist/csr/Check';
import { CheckCircle } from '@phosphor-icons/react/dist/csr/CheckCircle';
import { Copy } from '@phosphor-icons/react/dist/csr/Copy';
import { EnvelopeSimple } from '@phosphor-icons/react/dist/csr/EnvelopeSimple';
import { Hourglass } from '@phosphor-icons/react/dist/csr/Hourglass';
import { Info } from '@phosphor-icons/react/dist/csr/Info';
import { IdentificationCard } from '@phosphor-icons/react/dist/csr/IdentificationCard';
import { Lifebuoy } from '@phosphor-icons/react/dist/csr/Lifebuoy';
import { Lightbulb } from '@phosphor-icons/react/dist/csr/Lightbulb';
import { LockKey } from '@phosphor-icons/react/dist/csr/LockKey';
import { Prohibit } from '@phosphor-icons/react/dist/csr/Prohibit';
import { ShieldCheck } from '@phosphor-icons/react/dist/csr/ShieldCheck';
import { ShieldWarning } from '@phosphor-icons/react/dist/csr/ShieldWarning';
import { SignOut } from '@phosphor-icons/react/dist/csr/SignOut';
import { Timer } from '@phosphor-icons/react/dist/csr/Timer';
import { UserFocus } from '@phosphor-icons/react/dist/csr/UserFocus';
import { WarningCircle } from '@phosphor-icons/react/dist/csr/WarningCircle';
import { X } from '@phosphor-icons/react/dist/csr/X';
import { DrExame } from '../../../DrExame';
import { MascotPulse } from '../../../MascotPulse';
import { COPPER, RADIUS } from '../../../../tokens';
import { copperText, dangerText, tealText } from '../../../../theme';
import { formatCpf, normalizeCpf } from '../../../../utils/cpf';
import {
  CHECKING_LINE_MS, KYC_COPY, cpfProblem, formatGraceDate, humanBlockedReason, initials,
  type KycAttempt, type KycDoctorInfo, type KycStartError, type LegacyBannerKind, type StartResult,
} from './kycState';

/* ── base visual ─────────────────────────────────────────────────────────────────── */

const FONT_HEAD = '"Poppins", "Inter", "Segoe UI", Roboto, system-ui, sans-serif';
const TEAL_GRADIENT = 'linear-gradient(135deg, #20b2aa, #178f89)';
const COPPER_GRADIENT = 'linear-gradient(135deg, #d4a574, #b88a54)';

/** Texto só para leitor de tela. */
const srOnly = { position: 'absolute', width: '1px', height: '1px', p: 0, m: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 } as const;

/** Spinner que PARA com prefers-reduced-motion (vira um arco fixo): o texto ao lado já diz o que está acontecendo. */
const Spinner = ({ size = 18, tone }: { size?: number; tone?: string }) => (
  <CircularProgress
    size={size} thickness={4.6} color="inherit" aria-hidden
    sx={{ flexShrink: 0, color: tone, '@media (prefers-reduced-motion: reduce)': { animation: 'none', '& .MuiCircularProgress-circle': { animation: 'none', strokeDasharray: '80px, 200px', strokeDashoffset: 0 } } }}
  />
);

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(3px); }
  to   { opacity: 1; transform: none; }
`;
const nodePulse = keyframes`
  0%   { transform: scale(.85); opacity: .55; }
  70%  { opacity: 0; }
  100% { transform: scale(1.9); opacity: 0; }
`;

/** Cores e superfícies por modo — marca (teal/cobre) idêntica nos dois, só as superfícies mudam. */
const useTone = () => {
  const t = useTheme();
  const mode = t.palette.mode;
  const dark = mode === 'dark';
  return {
    dark,
    teal: tealText(mode),
    copper: copperText(mode),
    danger: dangerText(mode),
    line: dark ? '#2a3636' : '#d8ece9',
    tealWash: dark ? 'rgba(32,178,170,.14)' : 'rgba(32,178,170,.09)',
    tealLine: dark ? 'rgba(32,178,170,.34)' : 'rgba(32,178,170,.26)',
    dangerWash: dark ? 'rgba(248,113,113,.12)' : 'rgba(220,38,38,.06)',
    shadow: dark ? '0 14px 44px rgba(0,0,0,.5)' : '0 10px 40px rgba(0,80,70,.12)',
    panelShadow: dark ? '0 -6px 28px rgba(0,0,0,.55), 0 2px 8px rgba(0,0,0,.4)' : '0 -6px 28px rgba(0,70,64,.14), 0 2px 8px rgba(0,70,64,.08)',
    pageGlow: dark
      ? 'radial-gradient(900px 440px at 50% -140px, rgba(32,178,170,.17), transparent 70%)'
      : 'radial-gradient(900px 440px at 50% -140px, rgba(32,178,170,.16), transparent 70%), linear-gradient(135deg, rgba(32,178,170,.07), transparent 55%)',
  };
};

/** Controles do início da verificação (CTA + "copiar link") compartilhados por Intro/Continuar/Recusado. */
export interface KycStartControls {
  /** `cpf` (só dígitos) vai no POST quando o campo de CPF está na tela. */
  onStart: (cpf?: string) => Promise<StartResult>;
  onCopyLink: (cpf?: string) => Promise<StartResult>;
  starting: boolean;
  error: KycStartError | null;
  copied: { url: string; ok: boolean } | null;
  /** O cadastro não tem CPF: a Intro mostra o campo. */
  needsCpf: boolean;
  /** Some com o aviso do último POST (o médico editou o CPF). */
  clearError: () => void;
}

const ctaSx = {
  minHeight: 52, borderRadius: RADIUS.button, fontSize: 16, fontWeight: 700, textTransform: 'none', letterSpacing: 0,
} as const;

/* ── casca ───────────────────────────────────────────────────────────────────────── */

const Who = ({ doctor }: { doctor: KycDoctorInfo | null | undefined }) => {
  const k = useTone();
  if (!doctor) return null;
  const crmLabel = doctor.crm ? `CRM ${doctor.crm}` : null;
  return (
    <Box sx={{ display: 'flex', mb: 1.5 }}>
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, maxWidth: '100%', minHeight: 40, pl: 0.75, pr: 1.75, borderRadius: RADIUS.pill, bgcolor: 'background.paper', border: '1px solid', borderColor: k.line }}>
        {doctor.name && (
          <Box aria-hidden sx={{ width: 28, height: 28, flexShrink: 0, borderRadius: '50%', background: TEAL_GRADIENT, color: '#fff', fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 11.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials(doctor.name)}</Box>
        )}
        <Typography noWrap sx={{ minWidth: 0, fontSize: 13, fontWeight: 600, color: 'text.primary' }}>
          {doctor.name}
          {crmLabel && <Box component="span" sx={{ fontWeight: 500, color: 'text.secondary' }}>{doctor.name ? ` · ${crmLabel}` : crmLabel}</Box>}
        </Typography>
      </Box>
    </Box>
  );
};

const Footer = ({ onLogout, hideSupport = false }: { onLogout: () => void; hideSupport?: boolean }) => {
  const k = useTone();
  return (
    <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 1 }}>
      <Button variant="text" onClick={onLogout} startIcon={<SignOut size={18} aria-hidden />} sx={{ minHeight: 48, px: 1.5, color: 'text.secondary', fontWeight: 600, fontSize: 14 }}>{KYC_COPY.common.logout}</Button>
      {!hideSupport && (
        <>
          <Box component="span" aria-hidden sx={{ color: k.line }}>·</Box>
          <Button variant="text" href={KYC_COPY.supportMailto} startIcon={<Lifebuoy size={18} aria-hidden />} sx={{ minHeight: 48, px: 1.5, color: 'text.secondary', fontWeight: 600, fontSize: 14 }}>{KYC_COPY.common.support}</Button>
        </>
      )}
    </Box>
  );
};

const Shell = ({ doctor, onLogout, children, hideSupport, footer = true }: {
  doctor?: KycDoctorInfo | null; onLogout?: () => void; children: ReactNode; hideSupport?: boolean; footer?: boolean;
}) => {
  const k = useTone();
  return (
    // O index.html zera o padding-top de TODO <main> (`main { padding-top: 0 !important }`): o respiro mora no wrapper interno.
    <Box component="main" sx={{
      minHeight: '100dvh', boxSizing: 'border-box', display: 'flex', justifyContent: 'center', alignItems: 'center',
      bgcolor: 'background.default', backgroundImage: k.pageGlow,
    }}>
      {/* O index.html põe `html, body { overflow-x: hidden !important }` (num <style> DEPOIS do head), que faz do body um scroll
          container e impede o `position: sticky` (painel de ação do celular) de grudar na TELA. `clip` corta do mesmo jeito sem
          virar container de rolagem; `html body` ganha por especificidade, o html segue com `hidden` (sem rolagem lateral)
          e o efeito acaba junto com esta tela. */}
      <GlobalStyles styles={{ 'html body': { overflowX: 'clip !important' } }} />
      <Box sx={{ width: '100%', maxWidth: 592, boxSizing: 'border-box', px: 2, pt: { xs: 'calc(env(safe-area-inset-top) + 16px)', md: 6 }, pb: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
        <Who doctor={doctor} />
        <Box sx={{ position: 'relative', bgcolor: 'background.paper', borderRadius: RADIUS.card, border: '1px solid', borderColor: k.line, boxShadow: k.shadow, p: { xs: 2.5, sm: 4 } }}>
          {/* filete teal → cobre (mesma assinatura dos e-mails do portal) */}
          <Box aria-hidden sx={{ position: 'absolute', top: -1, left: -1, right: -1, height: 4, borderTopLeftRadius: RADIUS.card, borderTopRightRadius: RADIUS.card, background: 'linear-gradient(90deg, #20b2aa, #5fc9c3 55%, #d4a574)' }} />
          {children}
        </Box>
        {footer && onLogout && <Footer onLogout={onLogout} hideSupport={hideSupport} />}
      </Box>
    </Box>
  );
};

const Center = ({ children }: { children: ReactNode }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>{children}</Box>
);

type HeroBadge = 'shield' | 'check' | 'block' | 'hourglass';

/** Mascote Dr. Exame (nunca sai) no círculo teal do login + selo de contexto no canto. */
const Hero = ({ badge, size = 88 }: { badge?: HeroBadge; size?: number }) => {
  const k = useTone();
  const bg = badge === 'check' ? '#059669' : badge === 'block' ? '#dc2626' : badge === 'hourglass' ? COPPER_GRADIENT : TEAL_GRADIENT;
  return (
    <Box sx={{ position: 'relative', width: size, height: size }}>
      <Box sx={{ width: size, height: size, borderRadius: '50%', bgcolor: k.tealWash, boxShadow: 'inset 0 0 0 1px rgba(32,178,170,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <DrExame size={Math.round(size * 0.73)} sx={{ borderRadius: '50%' }} />
      </Box>
      {badge && (
        <Box aria-hidden sx={{ position: 'absolute', right: -3, bottom: -3, width: 30, height: 30, borderRadius: '50%', background: bg, color: '#fff', border: '3px solid', borderColor: 'background.paper', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {badge === 'shield' && <ShieldCheck size={15} weight="fill" />}
          {badge === 'check' && <Check size={15} weight="bold" />}
          {badge === 'block' && <Prohibit size={15} weight="bold" />}
          {badge === 'hourglass' && <Hourglass size={14} weight="fill" />}
        </Box>
      )}
    </Box>
  );
};

/** Chip de contexto — "Passo 2 de 3", "EM ANÁLISE", "NÃO APROVADO". */
const Pill = ({ children, tone = 'teal', dots }: { children: ReactNode; tone?: 'teal' | 'copper' | 'danger'; dots?: 1 | 2 | 3 }) => {
  const k = useTone();
  const filled = dots ?? 0;
  const c = tone === 'copper' ? { fg: k.copper, bg: COPPER.wash } : tone === 'danger' ? { fg: k.danger, bg: k.dangerWash } : { fg: k.teal, bg: k.tealWash };
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5, minHeight: 28, borderRadius: RADIUS.pill, bgcolor: c.bg, color: c.fg, fontSize: 12.5, fontWeight: 700, letterSpacing: '.02em', lineHeight: 1.25, textAlign: 'center' }}>
      {dots && (
        <Box component="span" aria-hidden sx={{ display: { xs: 'none', sm: 'inline-flex' }, gap: '3px' }}>
          {[1, 2, 3].map((n) => (
            <Box key={n} component="span" sx={{ width: 6, height: 6, boxSizing: 'border-box', borderRadius: '50%', border: '1.5px solid currentColor', bgcolor: n <= filled ? 'currentColor' : 'transparent' }} />
          ))}
        </Box>
      )}
      {children}
    </Box>
  );
};

/** Caixa com barra lateral de cor. A barra é um pseudo-elemento recortado pelo raio: com `border-left` ela curva nos cantos. */
const AccentBox = ({ children }: { children: ReactNode }) => {
  const k = useTone();
  return (
    <Box sx={{ position: 'relative', overflow: 'hidden', mt: 2.5, py: 2, pr: 2, pl: 2.5, borderRadius: RADIUS.md, bgcolor: k.dangerWash, '&::before': { content: '""', position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, bgcolor: k.danger } }}>
      {children}
    </Box>
  );
};

const Title = ({ children }: { children: ReactNode }) => (
  <Typography component="h1" sx={{ mt: 1.75, fontFamily: FONT_HEAD, fontWeight: 800, fontSize: { xs: 24, sm: 28 }, lineHeight: 1.2, letterSpacing: '-0.02em', color: 'text.primary', textWrap: 'balance' }}>{children}</Typography>
);
const Lead = ({ children }: { children: ReactNode }) => (
  <Typography sx={{ mt: 1.25, fontSize: 15.5, lineHeight: 1.6, color: 'text.secondary', textWrap: 'pretty' }}>{children}</Typography>
);

/* ── início da verificação (CTA + copiar link) ───────────────────────────────────── */

const StartAlert = ({ error }: { error: KycStartError }) => {
  const info = error.code === 'IN_REVIEW' || error.code === 'ALREADY_APPROVED';
  return (
  <Alert
    severity={error.code === 'KYC_ATTEMPT_LIMIT' ? 'warning' : info ? 'info' : 'error'}
    icon={info ? <Info size={20} weight="fill" aria-hidden /> : <WarningCircle size={20} weight="fill" aria-hidden />}
    sx={{ mb: 1.75, borderRadius: RADIUS.md, alignItems: 'flex-start', '& .MuiAlert-message': { fontSize: 14, lineHeight: 1.5, width: '100%' } }}
  >
    {error.message}
    {error.supportOnly && (
      <Box sx={{ mt: 1 }}>
        <Button variant="outlined" color="inherit" size="small" href={KYC_COPY.supportMailto} startIcon={<EnvelopeSimple size={16} aria-hidden />} sx={{ minHeight: 48, borderRadius: RADIUS.button, fontWeight: 700, textTransform: 'none' }}>{KYC_COPY.common.support}</Button>
      </Box>
    )}
  </Alert>
  );
};

/* ── CPF (o médico que entrou pelo convite não tem CPF no cadastro) ───────────────── */

/** Estado do campo de CPF — só em memória, no componente: nunca vai para storage, URL nem log. */
const useCpfInput = (active: boolean, serverError: KycStartError | null, clearError: () => void) => {
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const problem = active ? cpfProblem(value) : null;
  const serverCpfError = active && serverError && (serverError.code === 'CPF_INVALID' || serverError.code === 'CPF_IN_USE') ? serverError : null;
  // "CPF inválido" assim que completa os 11 números; "faltam números" só depois de tentar enviar
  const localError = problem === 'invalid' ? KYC_COPY.cpf.invalid : problem === 'short' && touched ? KYC_COPY.cpf.short : null;
  return {
    value,
    error: serverCpfError ? serverCpfError.message : localError,
    serverCpfError,
    inputRef,
    onChange: (v: string) => { setValue(formatCpf(v)); if (serverCpfError) clearError(); },
    /** Valida antes de enviar: devolve os dígitos, ou foca o campo e barra o envio. */
    prepare: (): { proceed: boolean; cpf?: string } => {
      if (!active) return { proceed: true };
      setTouched(true);
      if (problem) { inputRef.current?.focus(); return { proceed: false }; }
      return { proceed: true, cpf: normalizeCpf(value) };
    },
    reset: () => { setValue(''); setTouched(false); },
  };
};

const CpfField = ({ id, input, lead, disabled, compact = false }: {
  id: string; input: ReturnType<typeof useCpfInput>; lead?: string | null; disabled: boolean; compact?: boolean;
}) => {
  const k = useTone();
  const helpId = `${id}-help`;
  const { error } = input;
  return (
    <Box sx={{ mb: compact ? 1 : 1.75, maxWidth: compact ? 360 : 'none', textAlign: 'left' }}>
      {lead && <Typography sx={{ mb: 0.75, fontSize: 13.5, lineHeight: 1.45, color: 'text.primary' }}>{lead}</Typography>}
      <Box component="label" htmlFor={id} sx={{ display: 'block', mb: 0.75, fontSize: 13, fontWeight: 700, color: 'text.primary' }}>{KYC_COPY.cpf.label}</Box>
      <Box
        component="input" ref={input.inputRef} id={id} type="text" inputMode="numeric" autoComplete="off" autoCorrect="off" spellCheck={false}
        maxLength={14} placeholder={KYC_COPY.cpf.placeholder} value={input.value} disabled={disabled}
        onChange={(e: ChangeEvent<HTMLInputElement>) => input.onChange(e.target.value)}
        aria-invalid={error ? true : undefined} aria-describedby={helpId}
        sx={{
          width: '100%', boxSizing: 'border-box', minHeight: 52, px: 1.75, borderRadius: RADIUS.button,
          border: '1px solid', borderColor: error ? k.danger : k.tealLine, bgcolor: 'background.paper', color: 'text.primary',
          fontFamily: 'inherit', fontSize: 17, fontWeight: 600, letterSpacing: '.05em', outline: 'none',
          '&::placeholder': { color: 'text.disabled', fontWeight: 500, letterSpacing: '.02em' },
          '&:focus': { borderColor: error ? k.danger : k.teal, boxShadow: `0 0 0 3px ${error ? k.dangerWash : k.tealWash}` },
          '&:disabled': { opacity: 0.6 },
        }}
      />
      <Typography id={helpId} role={error ? 'alert' : undefined} sx={{ mt: 0.75, fontSize: 13, lineHeight: 1.45, color: error ? k.danger : 'text.secondary' }}>
        {error ?? KYC_COPY.cpf.helper}
      </Typography>
      {input.serverCpfError?.supportOnly && (
        <Button variant="outlined" color="inherit" size="small" href={KYC_COPY.supportMailto} startIcon={<EnvelopeSimple size={16} aria-hidden />} sx={{ mt: 1, minHeight: 48, borderRadius: RADIUS.button, fontWeight: 700, textTransform: 'none' }}>{KYC_COPY.common.support}</Button>
      )}
    </Box>
  );
};

const CopiedNote = ({ copied }: { copied: { url: string; ok: boolean } }) => {
  const k = useTone();
  return (
    <Box role="status" sx={{ mt: 1, p: 1.5, borderRadius: RADIUS.md, bgcolor: k.tealWash, border: '1px solid', borderColor: k.tealLine, textAlign: 'left' }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <Box component="span" sx={{ display: 'inline-flex', mt: '2px', color: k.teal }}><CheckCircle size={20} weight="fill" aria-hidden /></Box>
        <Typography sx={{ fontSize: 13.5, lineHeight: 1.5, color: 'text.primary' }}>{copied.ok ? KYC_COPY.copied.ok : KYC_COPY.copied.manual}</Typography>
      </Box>
      {!copied.ok && (
        <Box
          component="input"
          readOnly
          value={copied.url}
          aria-label={KYC_COPY.copied.fieldLabel}
          onFocus={(e: FocusEvent<HTMLInputElement>) => e.currentTarget.select()}
          sx={{ mt: 1, width: '100%', boxSizing: 'border-box', minHeight: 44, px: 1.25, borderRadius: RADIUS.sm, border: '1px solid', borderColor: k.tealLine, bgcolor: 'background.paper', color: 'text.primary', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 }}
        />
      )}
    </Box>
  );
};

const StartActions = ({ cta, start, copyRow = true, panel = true, cpfField = false }: {
  cta: string; start: KycStartControls; copyRow?: boolean;
  /** Painel fixo no rodapé da tela (telas longas, como a Intro). Nas curtas é só um bloco no fim do card. */
  panel?: boolean;
  /** A tela pode pedir o CPF (só a Intro): o campo aparece quando o cadastro não tem CPF. */
  cpfField?: boolean;
}) => {
  const k = useTone();
  const { error, copied } = start;
  const blocked = !!error?.blocksStart;
  const cpfShown = cpfField && start.needsCpf;
  const cpf = useCpfInput(cpfShown, error, start.clearError);
  const fieldHandled = cpfShown && !!error && error.needsCpf; // o erro é do campo de CPF: aparece embaixo dele, não no aviso
  const run = async (kind: 'open' | 'copy') => {
    const prep = cpf.prepare();
    if (!prep.proceed) return;
    const r = await (kind === 'open' ? start.onStart(prep.cpf) : start.onCopyLink(prep.cpf));
    if (r === 'opened' || r === 'copied') cpf.reset(); // o CPF não fica na tela nem na memória depois de enviado
  };
  return (
    <Box
      component="form" noValidate
      onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); void run('open'); }}
      data-kyc={panel ? 'actions' : undefined}
      sx={{
        mt: 3,
        // Painel de ação: acompanha a rolagem e fica colado no rodapé da tela (notebook de 700 px de altura e celular),
        // então a ação primária nunca cai abaixo da dobra. No fim do card ele só assenta no lugar.
        ...(panel ? {
          position: 'sticky', bottom: 'calc(env(safe-area-inset-bottom) + 12px)', zIndex: 2,
          mx: -1.5, p: 1.5, borderRadius: RADIUS.card,
          bgcolor: 'background.paper', border: `1px solid ${k.tealLine}`, boxShadow: k.panelShadow,
        } as const : {}),
      }}
    >
      {error && !fieldHandled && <StartAlert error={error} />}
      {cpfShown && <CpfField id="kyc-cpf" input={cpf} lead={error?.code === 'CPF_REQUIRED' ? error.message : null} disabled={start.starting} />}
      <Button
        type="submit" variant="contained" color="primary" size="large" fullWidth
        disabled={start.starting || blocked} aria-busy={start.starting}
        startIcon={start.starting ? <Spinner /> : undefined}
        endIcon={start.starting ? undefined : <ArrowRight size={18} weight="bold" aria-hidden />}
        sx={{ ...ctaSx, '&.Mui-disabled': { background: k.dark ? '#243030' : '#e5ecec', color: k.dark ? '#6b7c80' : '#94a3a8', boxShadow: 'none' } }}
      >
        {cta}
      </Button>
      {copyRow && (
        <Box sx={{ mt: 1.25 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 0.5 }}>
            <Typography component="span" sx={{ fontSize: 14, color: 'text.secondary' }}>{KYC_COPY.intro.phonePrompt}</Typography>
            <Button type="button" variant="text" onClick={() => { void run('copy'); }} disabled={start.starting || blocked} startIcon={<Copy size={18} weight="bold" aria-hidden />} sx={{ minHeight: 48, px: 1.25, color: k.teal, fontWeight: 700, fontSize: 14.5, textTransform: 'none' }}>{KYC_COPY.intro.copyLink}</Button>
          </Box>
          {copied && <CopiedNote copied={copied} />}
        </Box>
      )}
    </Box>
  );
};

/* ── Intro ───────────────────────────────────────────────────────────────────────── */

const NEED_ICONS = { doc: IdentificationCard, selfie: UserFocus, time: Timer } as const;

const NeedsList = () => {
  const k = useTone();
  return (
    <Box sx={{ mt: 3.5 }}>
      <Typography component="h2" sx={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: 'text.secondary' }}>{KYC_COPY.intro.needsTitle}</Typography>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, mt: 0.5, p: 0 }}>
        {KYC_COPY.intro.needs.map((n, i) => {
          const Icon = NEED_ICONS[n.key];
          return (
            <Box key={n.key} component="li" sx={{ display: 'flex', alignItems: 'center', gap: 1.75, py: 1.5, borderTop: i === 0 ? 'none' : '1px solid', borderColor: k.line }}>
              <Box aria-hidden sx={{ width: 44, height: 44, flexShrink: 0, borderRadius: RADIUS.md, bgcolor: k.tealWash, color: k.teal, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={24} weight="duotone" />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3, color: 'text.primary' }}>{n.title}</Typography>
                <Typography sx={{ mt: 0.25, fontSize: 13.5, lineHeight: 1.45, color: 'text.secondary', '&::first-letter': { textTransform: 'uppercase' } }}>{n.body}</Typography>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

const PrivacyCard = () => {
  const k = useTone();
  return (
    <Box sx={{ mt: 2, p: 2, display: 'flex', gap: 1.5, alignItems: 'flex-start', borderRadius: RADIUS.md, bgcolor: k.tealWash, border: '1px solid', borderColor: k.tealLine }}>
      <Box aria-hidden sx={{ flexShrink: 0, mt: '1px', color: k.teal, display: 'inline-flex' }}><LockKey size={22} weight="duotone" /></Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography component="h2" sx={{ fontSize: 14.5, fontWeight: 700, color: 'text.primary' }}>{KYC_COPY.intro.privacyTitle}</Typography>
        <Typography sx={{ mt: 0.5, fontSize: 13.5, lineHeight: 1.55, color: 'text.secondary' }}>{KYC_COPY.intro.privacyBody}</Typography>
      </Box>
    </Box>
  );
};

export const KycIntro = ({ doctor, onLogout, start, expired = false }: {
  doctor: KycDoctorInfo | null; onLogout: () => void; start: KycStartControls;
  /** Médico antigo cujo prazo venceu: mesma jornada, sem o "Passo 2 de 3" do cadastro novo. */
  expired?: boolean;
}) => (
  <Shell doctor={doctor} onLogout={onLogout}>
    <Center>
      <Hero badge="shield" />
      <Box sx={{ mt: 2.25 }}><Pill dots={expired ? undefined : 2}>{expired ? KYC_COPY.intro.chipExpired : KYC_COPY.intro.chip}</Pill></Box>
      <Title>{KYC_COPY.intro.title}</Title>
      <Lead>{KYC_COPY.intro.lead}</Lead>
    </Center>
    <NeedsList />
    <PrivacyCard />
    <StartActions cta={KYC_COPY.intro.cta} start={start} cpfField />
  </Shell>
);

/* ── Continuar ───────────────────────────────────────────────────────────────────── */

export const KycContinue = ({ doctor, onLogout, start }: { doctor: KycDoctorInfo | null; onLogout: () => void; start: KycStartControls }) => (
  <Shell doctor={doctor} onLogout={onLogout}>
    <Center>
      <Hero badge="shield" />
      <Box sx={{ mt: 2.25 }}><Pill dots={2}>{KYC_COPY.intro.chip}</Pill></Box>
      <Title>{KYC_COPY.continue.title}</Title>
      <Lead>{KYC_COPY.continue.lead}</Lead>
    </Center>
    <StartActions cta={KYC_COPY.continue.cta} start={start} panel={false} />
  </Shell>
);

/* ── Conferindo ──────────────────────────────────────────────────────────────────── */

/** A linha que alterna: "Comparando…" → "Conferindo seu CRM…" → "Quase lá" (a última fica). */
const CheckingLine = () => {
  const k = useTone();
  const [i, setI] = useState(0);
  const last = KYC_COPY.checking.lines.length - 1;
  useEffect(() => {
    if (i >= last) return undefined;
    const id = window.setTimeout(() => setI((n) => Math.min(n + 1, last)), CHECKING_LINE_MS);
    return () => window.clearTimeout(id);
  }, [i, last]);
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25, maxWidth: '100%', px: 2, py: 1.25, minHeight: 44, borderRadius: RADIUS.md, bgcolor: k.tealWash, border: '1px solid', borderColor: k.tealLine, color: 'text.primary', fontSize: 14.5, fontWeight: 600, textAlign: 'left' }}>
      <Spinner size={16} tone={k.teal} />
      <Box component="span" key={i} sx={{ minWidth: 0, animation: `${fadeIn} .45s ease both`, '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }}>{KYC_COPY.checking.lines[i]}</Box>
    </Box>
  );
};

export const KycChecking = ({ doctor, onLogout, slow, busy, onRefresh, canResume, onResume }: {
  doctor: KycDoctorInfo | null; onLogout: () => void;
  /** Passou de 90 s sem resposta. */
  slow: boolean; busy: boolean; onRefresh: () => void;
  /** A tentativa ainda não foi enviada: oferecer voltar ao UaiID. */
  canResume: boolean; onResume: () => void;
}) => {
  const k = useTone();
  return (
    <Shell doctor={doctor} onLogout={onLogout}>
      <Center>
        {/* os anéis crescem ~40 px além do círculo: a margem os mantém dentro do card */}
        <Box sx={{ mt: 3, mb: 1.5 }}>
          <MascotPulse size={96} ringColor="rgba(32,178,170,.4)">
            <Box sx={{ width: 96, height: 96, borderRadius: '50%', bgcolor: k.tealWash, boxShadow: 'inset 0 0 0 1px rgba(32,178,170,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DrExame size={70} sx={{ borderRadius: '50%' }} />
            </Box>
          </MascotPulse>
        </Box>
        <Title>{KYC_COPY.checking.title}</Title>
        <Lead>{KYC_COPY.checking.lead}</Lead>
        {/* região viva única: a linha que alterna e, depois de 90 s, o aviso de demora */}
        <Box role="status" aria-live="polite" aria-atomic="true" sx={{ mt: 3, width: '100%', display: 'flex', justifyContent: 'center' }}>
          {slow ? (
            <Typography sx={{ p: 2, borderRadius: RADIUS.md, bgcolor: k.tealWash, border: '1px solid', borderColor: k.tealLine, fontSize: 14, lineHeight: 1.55, color: 'text.primary', textAlign: 'left' }}>{KYC_COPY.checking.slow}</Typography>
          ) : (
            <CheckingLine />
          )}
        </Box>
      </Center>
      {slow && (
        <Box sx={{ mt: 2.5 }}>
          <Button
            variant="contained" color="primary" size="large" fullWidth onClick={onRefresh} disabled={busy} aria-busy={busy}
            startIcon={busy ? <Spinner /> : <ArrowClockwise size={18} weight="bold" aria-hidden />}
            sx={ctaSx}
          >
            {KYC_COPY.checking.refresh}
          </Button>
          {canResume && (
            <Box sx={{ mt: 1.25, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 0.5 }}>
              <Typography component="span" sx={{ fontSize: 14, color: 'text.secondary' }}>{KYC_COPY.checking.notFinished}</Typography>
              <Button variant="text" onClick={onResume} sx={{ minHeight: 48, px: 1.25, color: k.teal, fontWeight: 700, fontSize: 14.5, textTransform: 'none' }}>{KYC_COPY.checking.resume}</Button>
            </Box>
          )}
        </Box>
      )}
    </Shell>
  );
};

/* ── Em análise ──────────────────────────────────────────────────────────────────── */

type TrailState = 'done' | 'now' | 'next';
const TRAIL_STATES: readonly TrailState[] = ['done', 'done', 'now', 'next'];

const TrailNode = ({ state }: { state: TrailState }) => {
  const k = useTone();
  if (state === 'done') {
    return (
      <Box aria-hidden sx={{ width: 28, height: 28, flexShrink: 0, borderRadius: '50%', background: TEAL_GRADIENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Check size={15} weight="bold" />
      </Box>
    );
  }
  if (state === 'now') {
    return (
      <Box aria-hidden sx={{ position: 'relative', width: 28, height: 28, flexShrink: 0, boxSizing: 'border-box', borderRadius: '50%', border: '2px solid', borderColor: COPPER.main, bgcolor: COPPER.wash, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Box sx={{ position: 'absolute', inset: -2, borderRadius: '50%', border: '2px solid', borderColor: COPPER.main, animation: `${nodePulse} 2.4s ease-out infinite`, '@media (prefers-reduced-motion: reduce)': { animation: 'none', opacity: 0 } }} />
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: k.dark ? COPPER.main : COPPER.deep }} />
      </Box>
    );
  }
  return <Box aria-hidden sx={{ width: 28, height: 28, flexShrink: 0, boxSizing: 'border-box', borderRadius: '50%', border: '2px solid', borderColor: k.line }} />;
};

export const KycReview = ({ doctor, onLogout, onRefresh, busy }: { doctor: KycDoctorInfo | null; onLogout: () => void; onRefresh: () => void; busy: boolean }) => {
  const k = useTone();
  const steps = KYC_COPY.review.steps;
  const stateLabel: Record<TrailState, string> = { done: KYC_COPY.review.stateDone, now: KYC_COPY.review.stateNow, next: KYC_COPY.review.stateNext };
  return (
    <Shell doctor={doctor} onLogout={onLogout}>
      <Center>
        <Hero badge="hourglass" />
        <Box sx={{ mt: 2.25 }}><Pill tone="copper">{KYC_COPY.review.chip}</Pill></Box>
        <Title>{KYC_COPY.review.title}</Title>
        <Lead>{KYC_COPY.review.lead}</Lead>
      </Center>

      <Box component="ol" aria-label={KYC_COPY.review.trailLabel} sx={{ listStyle: 'none', m: 0, mt: 3.5, p: 0 }}>
        {steps.map((s, idx) => {
          const state = TRAIL_STATES[idx] ?? 'next';
          const last = idx === steps.length - 1;
          const body = state === 'now' ? KYC_COPY.review.reviewBody(doctor?.crm ?? null) : s.body;
          return (
            <Box key={s.key} component="li" sx={{ display: 'flex', gap: 1.75 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <TrailNode state={state} />
                {!last && <Box aria-hidden sx={{ width: 2, flex: 1, minHeight: 18, my: 0.5, borderRadius: 1, bgcolor: state === 'done' ? k.teal : k.line }} />}
              </Box>
              <Box sx={{ minWidth: 0, pb: last ? 0 : 2.25, pt: '3px' }}>
                <Typography sx={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3, color: state === 'next' ? 'text.secondary' : 'text.primary' }}>
                  {s.title}
                  <Box component="span" sx={srOnly}>{` — ${stateLabel[state]}`}</Box>
                </Typography>
                <Typography sx={{ mt: 0.25, fontSize: 13.5, lineHeight: 1.45, color: 'text.secondary' }}>{body}</Typography>
              </Box>
            </Box>
          );
        })}
      </Box>

      <Typography sx={{ mt: 3, p: 1.75, borderRadius: RADIUS.md, bgcolor: k.tealWash, border: '1px solid', borderColor: k.tealLine, fontSize: 14, lineHeight: 1.55, color: 'text.primary' }}>{KYC_COPY.review.note}</Typography>

      <Button
        variant="outlined" fullWidth onClick={onRefresh} disabled={busy} aria-busy={busy}
        startIcon={busy ? <Spinner /> : <ArrowClockwise size={18} weight="bold" aria-hidden />}
        sx={{ ...ctaSx, mt: 2.5, color: k.teal, borderColor: k.tealLine, '&:hover': { borderColor: k.teal, bgcolor: k.tealWash } }}
      >
        {KYC_COPY.review.refresh}
      </Button>
    </Shell>
  );
};

/* ── Recusado ────────────────────────────────────────────────────────────────────── */

export const KycRejected = ({ doctor, onLogout, attempt, start }: { doctor: KycDoctorInfo | null; onLogout: () => void; attempt: KycAttempt | null; start: KycStartControls }) => {
  const k = useTone();
  const copy = KYC_COPY.rejected;
  const reason = attempt?.message ?? copy.reasonFallback;
  const byOwner = attempt?.reasonCode === 'admin_rejected';
  return (
    <Shell doctor={doctor} onLogout={onLogout}>
      <Center>
        <Hero />
        <Box sx={{ mt: 2.25 }}><Pill tone="danger">{copy.chip}</Pill></Box>
        <Title>{copy.title}</Title>
      </Center>

      <AccentBox>
        <Typography sx={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: k.danger }}>{copy.reasonLabel}</Typography>
        <Typography sx={{ mt: 0.5, fontSize: 15, lineHeight: 1.55, color: 'text.primary' }}>{reason}</Typography>
        {byOwner && <Typography sx={{ mt: 1, fontSize: 14, lineHeight: 1.5, color: 'text.secondary' }}>{copy.adminNote}</Typography>}
      </AccentBox>

      {attempt?.captureIssue ? (
        <Box sx={{ mt: 2, p: 2, borderRadius: RADIUS.md, bgcolor: k.tealWash, border: '1px solid', borderColor: k.tealLine }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box aria-hidden sx={{ display: 'inline-flex', color: k.teal }}><Lightbulb size={20} weight="duotone" /></Box>
            <Typography component="h2" sx={{ fontSize: 14.5, fontWeight: 700, color: 'text.primary' }}>{copy.howTitle}</Typography>
          </Box>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, mt: 1, p: 0, display: 'grid', gap: 1 }}>
            {copy.tips.map((tip) => (
              <Box key={tip} component="li" sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
                <Box aria-hidden sx={{ display: 'inline-flex', mt: '3px', color: k.teal }}><Check size={16} weight="bold" /></Box>
                <Typography sx={{ fontSize: 14, lineHeight: 1.5, color: 'text.primary' }}>{tip}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      ) : (
        <Box sx={{ mt: 2, p: 2, borderRadius: RADIUS.md, border: '1px solid', borderColor: k.line }}>
          <Typography component="h2" sx={{ fontSize: 14.5, fontWeight: 700, color: 'text.primary' }}>{copy.nextTitle}</Typography>
          <Typography sx={{ mt: 0.5, fontSize: 14, lineHeight: 1.55, color: 'text.secondary' }}>
            {copy.nextBefore}
            <Box component="a" href={KYC_COPY.supportMailto} sx={{ color: k.teal, fontWeight: 600 }}>{KYC_COPY.supportEmail}</Box>
            {copy.nextAfter}
          </Typography>
        </Box>
      )}

      <StartActions cta={copy.cta} start={start} copyRow={false} />
    </Shell>
  );
};

/* ── Suspensa ────────────────────────────────────────────────────────────────────── */

export const KycBlocked = ({ doctor, onLogout, reason }: { doctor: KycDoctorInfo | null; onLogout: () => void; reason: string | null }) => {
  const why = humanBlockedReason(reason);
  return (
    <Shell doctor={doctor} onLogout={onLogout} hideSupport>
      <Center>
        <Hero badge="block" />
        <Title>{KYC_COPY.blocked.title}</Title>
        <Lead>{KYC_COPY.blocked.body}</Lead>
      </Center>
      {why && (
        <AccentBox>
          <Typography sx={{ fontSize: 15, lineHeight: 1.55, color: 'text.primary' }}>{why}</Typography>
        </AccentBox>
      )}
      <Typography sx={{ mt: 2.5, fontSize: 14, lineHeight: 1.55, color: 'text.secondary', textAlign: 'center' }}>{KYC_COPY.blocked.contact}</Typography>
      <Button
        variant="contained" color="primary" size="large" fullWidth href={KYC_COPY.supportMailto}
        startIcon={<EnvelopeSimple size={18} weight="bold" aria-hidden />}
        sx={{ ...ctaSx, mt: 1.5 }}
      >
        {KYC_COPY.common.support}
      </Button>
      <Typography sx={{ mt: 1, fontSize: 13, color: 'text.secondary', textAlign: 'center' }}>{KYC_COPY.supportEmail}</Typography>
    </Shell>
  );
};

/* ── Aprovada (transição) ────────────────────────────────────────────────────────── */

export const KycApproved = ({ onContinue }: { onContinue: () => void }) => (
  <Shell footer={false}>
    <Center>
      <Hero badge="check" />
      <Title>
        {KYC_COPY.approved.title}
        <Box component="span" aria-hidden>{` ${KYC_COPY.approved.emoji}`}</Box>
      </Title>
      <Lead>{KYC_COPY.approved.body}</Lead>
    </Center>
    <Button variant="contained" color="primary" size="large" fullWidth onClick={onContinue} endIcon={<ArrowRight size={18} weight="bold" aria-hidden />} sx={{ ...ctaSx, mt: 3 }}>
      {KYC_COPY.approved.cta}
    </Button>
  </Shell>
);

/* ── carregando / erro / região viva ─────────────────────────────────────────────── */

export const KycLoading = () => {
  const k = useTone();
  return (
    <Box component="main" role="status" aria-live="polite" aria-busy="true" sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', backgroundImage: k.pageGlow }}>
      <MascotPulse size={88} ringColor="rgba(32,178,170,.35)">
        <Box sx={{ width: 88, height: 88, borderRadius: '50%', bgcolor: k.tealWash, boxShadow: 'inset 0 0 0 1px rgba(32,178,170,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <DrExame size={64} sx={{ borderRadius: '50%' }} />
        </Box>
      </MascotPulse>
      <Box component="span" sx={srOnly}>{KYC_COPY.loading}</Box>
    </Box>
  );
};

export const KycLoadError = ({ onRetry, busy, onLogout }: { onRetry: () => void; busy: boolean; onLogout: () => void }) => (
  <Shell onLogout={onLogout}>
    <Center>
      <Hero />
      <Title>{KYC_COPY.loadError.title}</Title>
      <Lead>{KYC_COPY.loadError.body}</Lead>
    </Center>
    <Button
      variant="contained" color="primary" size="large" fullWidth onClick={onRetry} disabled={busy} aria-busy={busy}
      startIcon={busy ? <Spinner /> : <ArrowClockwise size={18} weight="bold" aria-hidden />}
      sx={{ ...ctaSx, mt: 3 }}
    >
      {KYC_COPY.loadError.retry}
    </Button>
  </Shell>
);

/** Anuncia a troca de tela para leitor de tela (região viva persistente, fora das telas). */
export const KycLiveRegion = ({ text }: { text: string }) => (
  <Box role="status" aria-live="polite" aria-atomic="true" sx={srOnly}>{text}</Box>
);

/* ── banner do médico antigo (legacy) ────────────────────────────────────────────── */

export const LegacyVerifyBanner = ({ kind, graceUntilMs, onVerify, onDismiss, busy, error, needsCpf = false, clearError = () => undefined }: {
  kind: LegacyBannerKind; graceUntilMs: number | null; onVerify: (cpf?: string) => Promise<StartResult>; onDismiss: () => void; busy: boolean; error: KycStartError | null;
  /** O cadastro não tem CPF (o POST respondeu CPF_REQUIRED): o campo aparece no próprio banner. */
  needsCpf?: boolean; clearError?: () => void;
}) => {
  const k = useTone();
  const review = kind === 'review';
  const cpfShown = !review && needsCpf;
  const cpf = useCpfInput(cpfShown, error, clearError);
  const fieldHandled = cpfShown && !!error && error.needsCpf;
  const verify = async () => {
    const prep = cpf.prepare();
    if (!prep.proceed) return;
    const r = await onVerify(prep.cpf);
    if (r === 'opened') cpf.reset();
  };
  const title = review
    ? KYC_COPY.banner.reviewTitle
    : `${KYC_COPY.banner.title}${graceUntilMs ? KYC_COPY.banner.until(formatGraceDate(graceUntilMs)) : ''}`;
  return (
    <Box
      role="region" aria-label={title} data-kyc="banner"
      sx={{ bgcolor: k.dark ? 'rgba(212,165,116,.12)' : '#fbf3ea', borderBottom: '1px solid', borderColor: k.dark ? 'rgba(212,165,116,.38)' : 'rgba(212,165,116,.6)', px: 2, pt: 'calc(env(safe-area-inset-top) + 10px)', pb: 1.25 }}
    >
      <Box sx={{ maxWidth: 1180, mx: 'auto', display: 'grid', gridTemplateColumns: { xs: 'auto 1fr auto', md: 'auto 1fr auto auto' }, columnGap: 1.5, rowGap: 1, alignItems: 'center' }}>
        <Box aria-hidden sx={{ width: 36, height: 36, borderRadius: RADIUS.md, bgcolor: COPPER.wash, color: k.copper, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {review ? <Hourglass size={20} weight="duotone" /> : <ShieldWarning size={20} weight="duotone" />}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.3, color: 'text.primary' }}>{title}</Typography>
          <Typography sx={{ mt: 0.25, fontSize: 13.5, lineHeight: 1.45, color: 'text.secondary' }}>{review ? KYC_COPY.banner.reviewBody : KYC_COPY.banner.body}</Typography>
          {error && !fieldHandled && <Typography role="alert" sx={{ mt: 0.5, fontSize: 13, lineHeight: 1.4, color: k.danger }}>{error.message}</Typography>}
          {cpfShown && (
            <Box sx={{ mt: 1.25 }}>
              <CpfField id="kyc-cpf-banner" input={cpf} lead={error?.code === 'CPF_REQUIRED' ? error.message : null} disabled={busy} compact />
            </Box>
          )}
        </Box>
        {!review && (
          <Button
            variant="contained" color="primary" onClick={() => { void verify(); }} disabled={busy || !!error?.blocksStart} aria-busy={busy}
            startIcon={busy ? <Spinner size={16} /> : undefined}
            sx={{ minHeight: 48, borderRadius: RADIUS.button, textTransform: 'none', whiteSpace: 'nowrap', gridColumn: { xs: '1 / -1', md: 3 }, gridRow: { xs: 2, md: 1 } }}
          >
            {KYC_COPY.banner.cta}
          </Button>
        )}
        <IconButton aria-label={KYC_COPY.banner.dismiss} onClick={onDismiss} sx={{ width: 48, height: 48, color: 'text.secondary', gridColumn: { xs: 3, md: 4 }, gridRow: 1 }}>
          <X size={18} aria-hidden />
        </IconButton>
      </Box>
    </Box>
  );
};
