/**
 * Painel "Verificação de identidade" do dono (Plano 2 · W2) — topo da aba Médicos & Portais.
 *
 * Decisões do plano: R3 (rótulo sempre "Identidade" — o filtro "✓ Verificados" da aba é de
 * E-MAIL), R4 (o motivo da recusa vai por e-mail ao médico: o campo avisa antes de enviar).
 * Lógica pura (rótulos, comparação de nomes, datas, erros) em doctorVerification.ts.
 *
 * Sem recarregar a página: depois de cada ação o painel refaz o GET e avisa a aba
 * (`onChanged`) — recarregar a WebView crasha o APK.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Avatar, Box, Button, Card, CardContent, Checkbox, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, IconButton, Stack, TextField, Typography, useTheme,
} from '@mui/material';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import { API_URL, token } from '../../config';
import { copyText } from '../../utils/copyText';
import { COPPER, SEM } from '../../tokens';
import { ConfirmDialog, SectionError, TabLoader } from './parts';
import {
  REASON_MAX, REJECT_EMAIL_NOTICE, REJECT_SHORTCUTS, UAIID_DECIDE_NOTICE,
  applyShortcut, compareNames, crmLabel, displayNameWarning, formatDateBR, formatDateTimeBR, formatRatio, formatScore, graceInputToMs,
  graceLabel, identityChip, initialOf, kycErrorMessage, legacyApprovedNotice, msToDateInput, parseQueue,
  priorAttemptsLabel, queueCounts, reasonOk, reviewReason, sortReview,
  type LegacyItem, type ReviewItem, type Tone, type VerificationQueue,
} from './doctorVerification';

const H = () => ({ Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' });
const HEAD = '"Poppins", sans-serif';
const TEAL_GRADIENT = 'linear-gradient(135deg, #20b2aa 0%, #178f89 100%)';

type Mode = 'light' | 'dark';
const useMode = (): Mode => (useTheme().palette.mode === 'dark' ? 'dark' : 'light');
// theme.ts não pode ser importado em teste node (createTheme do react-admin) → tokens puros.
const copperText = (m: Mode) => (m === 'dark' ? COPPER.main : COPPER.textAA);
const tealText = (m: Mode) => SEM.tealDeep[m];

/** Tons semânticos com par claro/escuro (texto AA nas duas superfícies). */
const TONES: Record<Tone, { fg: { light: string; dark: string }; bg: string; bd: string }> = {
  ok: { fg: SEM.ok, bg: 'rgba(16,185,129,.12)', bd: 'rgba(16,185,129,.36)' },
  warn: { fg: SEM.warn, bg: 'rgba(245,158,11,.13)', bd: 'rgba(245,158,11,.42)' },
  bad: { fg: SEM.bad, bg: 'rgba(239,68,68,.10)', bd: 'rgba(239,68,68,.36)' },
  info: { fg: SEM.tealDeep, bg: 'rgba(32,178,170,.10)', bd: 'rgba(32,178,170,.36)' },
  neutral: { fg: { light: '#64748b', dark: '#94a3b8' }, bg: 'rgba(148,163,184,.12)', bd: 'rgba(148,163,184,.36)' },
};
const toneOf = (tone: Tone, mode: Mode) => ({ fg: TONES[tone].fg[mode], bg: TONES[tone].bg, bd: TONES[tone].bd });

const cardPad = { p: { xs: 1.75, sm: 2.5 }, '&:last-child': { pb: { xs: 1.75, sm: 2.5 } } } as const;
const pillBtn = { minHeight: 46, borderRadius: '12px', textTransform: 'none', fontWeight: 800, fontSize: 14.5 } as const;

// ─────────────────────────────── chip da lista ───────────────────────────────
/** Chip "Identidade: …" de cada médico (aba Médicos). Some quando o servidor não manda o status. */
export const IdentityChip = ({ status }: { status?: string | null }) => {
  const mode = useMode();
  const c = identityChip(status);
  if (!c) return null;
  const t = toneOf(c.tone, mode);
  const Icon = c.tone === 'ok' ? VerifiedUserOutlinedIcon : ShieldOutlinedIcon;
  return (
    <Chip
      size="small"
      data-testid="identity-chip"
      data-tone={c.tone}
      icon={<Icon sx={{ fontSize: '14px !important', color: `${t.fg} !important` }} />}
      label={c.label}
      sx={{
        height: 22, fontSize: 11.5, fontWeight: 700, color: t.fg, bgcolor: t.bg, border: '1px solid', borderColor: t.bd,
        '& .MuiChip-label': { px: 0.9 }, '& .MuiChip-icon': { ml: 0.75, mr: -0.25 },
      }}
    />
  );
};

// ─────────────────────────────── contadores ───────────────────────────────
const TILES = [
  { key: 'waiting', label: 'Aguardando você' },
  { key: 'inUaiid', label: 'No painel do UaiID' },
  { key: 'legacy', label: 'Médicos antigos sem verificação' },
] as const;

export const StatTiles = ({ counts }: { counts: { waiting: number; inUaiid: number; legacy: number } }) => {
  const mode = useMode();
  const numColor = {
    waiting: counts.waiting > 0 ? copperText(mode) : 'text.primary',
    inUaiid: counts.inUaiid > 0 ? tealText(mode) : 'text.primary',
    legacy: 'text.primary',
  };
  return (
    <Box data-testid="kyc-counters" sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: { xs: 1, sm: 1.5 }, mb: 2.5 }}>
      {TILES.map((t) => {
        const attention = t.key === 'waiting' && counts.waiting > 0;
        return (
          <Card
            key={t.key}
            variant="outlined"
            sx={{ borderRadius: '16px', p: { xs: 1.25, sm: 2 }, borderColor: attention ? 'rgba(212,165,116,.7)' : 'divider', bgcolor: attention ? COPPER.wash : 'background.paper' }}
          >
            <Typography data-testid={`kyc-count-${t.key}-n`} sx={{ fontFamily: HEAD, fontWeight: 800, fontSize: { xs: 24, sm: 30 }, lineHeight: 1.1, color: numColor[t.key] }}>
              {counts[t.key]}
            </Typography>
            <Typography sx={{ fontSize: { xs: 11, sm: 12.5 }, fontWeight: 600, color: 'text.secondary', mt: 0.5, lineHeight: 1.3 }}>
              {t.label}
            </Typography>
          </Card>
        );
      })}
    </Box>
  );
};

// ─────────────────────── nome no documento × nome no CFM ───────────────────────
const cellPx = { xs: 1.5, sm: 2 } as const;

/** Rótulo e valor ficam em LINHAS de grid separadas: se um rótulo quebrar em 2 linhas (375px), os dois
 *  nomes continuam começando na mesma altura. */
const NameLabel = ({ children, divided }: { children: ReactNode; divided?: boolean }) => (
  <Box
    aria-hidden="true"
    sx={{ minWidth: 0, px: cellPx, pt: { xs: 1.5, sm: 2 }, pb: 0.75, borderLeft: divided ? '1px solid' : 'none', borderColor: 'divider' }}
  >
    <Typography sx={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: 'text.secondary', lineHeight: 1.35 }}>
      {children}
    </Typography>
  </Box>
);

const NameValue = ({ label, words, empty, testid, divided }: {
  label: string; words: { text: string; diff: boolean }[]; empty: string; testid: string; divided?: boolean;
}) => {
  const mode = useMode();
  const bad = toneOf('bad', mode);
  return (
    <Box
      role="group"
      aria-label={label}
      data-testid={testid}
      sx={{ minWidth: 0, px: cellPx, pb: { xs: 1.5, sm: 2 }, borderLeft: divided ? '1px solid' : 'none', borderColor: 'divider' }}
    >
      {words.length ? (
        <Typography component="p" sx={{ fontSize: { xs: 14.5, sm: 16 }, fontWeight: 700, lineHeight: 1.5, overflowWrap: 'anywhere', color: 'text.primary', m: 0 }}>
          {words.map((w, i) => (
            <Fragment key={i}>
              {i > 0 ? ' ' : null}
              {w.diff ? (
                <Box
                  component="mark"
                  data-diff="true"
                  sx={{
                    color: bad.fg, bgcolor: 'rgba(239,68,68,.20)', borderRadius: '5px', px: '3px', mx: '-1px',
                    textDecoration: 'underline', textDecorationThickness: '2px', textUnderlineOffset: '3px',
                  }}
                >
                  {w.text}
                </Box>
              ) : w.text}
            </Fragment>
          ))}
        </Typography>
      ) : (
        <Typography sx={{ fontSize: 13.5, fontStyle: 'italic', color: 'text.disabled' }}>{empty}</Typography>
      )}
    </Box>
  );
};

/** Os dois nomes LADO A LADO; palavras que divergem ficam marcadas (cor + sublinhado) e o veredito
 *  fecha o bloco. É a base da decisão do dono — não pode haver dúvida de onde os nomes diferem. */
export const NameCompare = ({ documentName, cfmName }: { documentName?: string | null; cfmName?: string | null }) => {
  const mode = useMode();
  const cmp = useMemo(() => compareNames(documentName, cfmName), [documentName, cfmName]);
  const verdict =
    cmp.status === 'match'
      ? { tone: 'ok' as Tone, text: 'Nomes conferem', Icon: CheckCircleOutlineRoundedIcon }
      : cmp.status === 'differ'
        ? { tone: 'bad' as Tone, text: 'Nomes diferentes', Icon: ErrorOutlineRoundedIcon }
        : { tone: 'neutral' as Tone, text: 'Sem como comparar', Icon: HelpOutlineRoundedIcon };
  const t = toneOf(verdict.tone, mode);
  return (
    <Box
      data-testid="kyc-name-compare"
      data-status={cmp.status}
      sx={{ border: '1px solid', borderColor: cmp.status === 'unknown' ? 'divider' : t.bd, borderRadius: '14px', overflow: 'hidden', bgcolor: 'background.paper' }}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
        <NameLabel>Nome no documento</NameLabel>
        <NameLabel divided>Nome no CFM</NameLabel>
        <NameValue label="Nome no documento" words={cmp.doc} empty="Não recebido do UaiID" testid="kyc-name-doc" />
        <NameValue label="Nome no CFM" words={cmp.cfm} empty="Sem consulta ao CFM" testid="kyc-name-cfm" divided />
      </Box>
      <Stack
        direction="row"
        alignItems="center"
        sx={{ gap: 0.75, px: { xs: 1.5, sm: 2 }, py: 0.9, bgcolor: t.bg, borderTop: '1px solid', borderColor: t.bd, color: t.fg }}
      >
        <verdict.Icon sx={{ fontSize: 18 }} />
        <Typography data-testid="kyc-name-verdict" sx={{ fontSize: 12.5, fontWeight: 800 }}>{verdict.text}</Typography>
        {cmp.orderOnly && <Typography sx={{ fontSize: 12, fontWeight: 600 }}>· mesmas palavras, em outra ordem</Typography>}
      </Stack>
    </Box>
  );
};

// ─────────────────────────────── cartão da fila ───────────────────────────────
const ReasonBand = ({ reason }: { reason: { text: string; tone: Tone } }) => {
  const mode = useMode();
  const t = toneOf(reason.tone, mode);
  const Icon =
    reason.tone === 'ok' ? CheckCircleOutlineRoundedIcon
      : reason.tone === 'info' ? InfoOutlinedIcon
        : reason.tone === 'bad' ? ErrorOutlineRoundedIcon
          : WarningAmberRoundedIcon;
  return (
    <Stack
      data-testid="kyc-reason"
      data-tone={reason.tone}
      direction="row"
      alignItems="flex-start"
      sx={{ gap: 1, p: '9px 12px', borderRadius: '12px', bgcolor: t.bg, border: '1px solid', borderColor: t.bd, color: t.fg }}
    >
      <Icon sx={{ fontSize: 19, mt: '1px', flexShrink: 0 }} />
      <Typography sx={{ fontSize: 13, fontWeight: 700, lineHeight: 1.45 }}>{reason.text}</Typography>
    </Stack>
  );
};

const MetaChip = ({ label, value }: { label: string; value: string }) => (
  <Box sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 0.75, px: 1.1, py: 0.5, borderRadius: '10px', border: '1px solid', borderColor: 'divider', bgcolor: 'action.hover' }}>
    <Typography component="span" sx={{ fontSize: 11.5, fontWeight: 600, color: 'text.secondary' }}>{label}</Typography>
    <Typography component="span" sx={{ fontSize: 13, fontWeight: 800, color: 'text.primary' }}>{value}</Typography>
  </Box>
);

/** ID da verificação no UaiID, com cópia — é o que o dono procura no painel do UaiID. */
const CopyId = ({ value }: { value: string }) => {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Stack direction="row" alignItems="center" sx={{ gap: 0.5, mt: 0.5, minWidth: 0, flexWrap: 'wrap' }}>
      <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>ID da verificação:</Typography>
      <Typography component="code" sx={{ fontSize: 11.5, fontFamily: 'ui-monospace, Menlo, Consolas, monospace', color: 'text.primary', overflowWrap: 'anywhere' }}>
        {value}
      </Typography>
      <IconButton
        size="small"
        aria-label={copied ? 'ID copiado' : 'Copiar ID da verificação'}
        onClick={async () => {
          if (await copyText(value)) {
            setCopied(true);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 2000);
          }
        }}
        sx={{ width: 40, height: 40, color: 'text.secondary' }}
      >
        {copied ? <CheckRoundedIcon sx={{ fontSize: 17 }} /> : <ContentCopyRoundedIcon sx={{ fontSize: 17 }} />}
      </IconButton>
    </Stack>
  );
};

export const ReviewCard = ({ item, onApprove, onReject, disabled }: {
  item: ReviewItem; onApprove: (i: ReviewItem) => void; onReject: (i: ReviewItem) => void; disabled?: boolean;
}) => {
  const mode = useMode();
  const mine = item.decideIn === 'drexame';
  const reason = reviewReason(item.reasonCode, item.decideIn);
  const ratio = formatRatio(item.nameRatio);
  const score = formatScore(item.score);
  const prior = priorAttemptsLabel(item.priorAttempts);
  const displayWarn = displayNameWarning(item);
  const started = formatDateTimeBR(item.createdAt);
  const amber = toneOf('warn', mode);
  const info = toneOf('info', mode);
  return (
    <Card
      variant="outlined"
      data-testid="kyc-review-card"
      data-decide-in={item.decideIn}
      sx={{ borderRadius: '16px', borderColor: mine ? 'rgba(212,165,116,.6)' : 'divider', bgcolor: 'background.paper', boxShadow: '0 1px 2px rgba(0,0,0,.03), 0 2px 8px rgba(0,0,0,.04)' }}
    >
      <CardContent sx={cardPad}>
        <Stack spacing={1.75}>
          <Stack direction="row" spacing={1.5} alignItems="flex-start">
            <Avatar
              aria-hidden="true"
              sx={{ width: 46, height: 46, borderRadius: '14px', bgcolor: 'rgba(32,178,170,.12)', color: '#178f89', fontWeight: 800, fontSize: 18, fontFamily: HEAD, flexShrink: 0, border: '2px solid rgba(32,178,170,.25)' }}
            >
              {initialOf(item.doctor.name)}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" alignItems="center" sx={{ gap: 0.75, flexWrap: 'wrap' }}>
                <Typography sx={{ fontWeight: 800, fontSize: 16, fontFamily: HEAD, lineHeight: 1.3, overflowWrap: 'anywhere' }}>
                  {item.doctor.name}
                </Typography>
                <Chip
                  size="small"
                  label={mine ? 'Aguardando você' : 'No painel do UaiID'}
                  sx={{
                    height: 22, fontSize: 11.5, fontWeight: 800, border: '1px solid',
                    ...(mine
                      ? { color: copperText(mode), bgcolor: COPPER.wash, borderColor: 'rgba(212,165,116,.55)' }
                      : { color: info.fg, bgcolor: info.bg, borderColor: info.bd }),
                  }}
                />
              </Stack>
              <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: 'text.secondary', mt: 0.25 }}>
                {crmLabel(item.doctor.crm || item.crm, item.doctor.crmUf)}
              </Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', overflowWrap: 'anywhere' }}>{item.doctor.email}</Typography>
              {started && <Typography sx={{ fontSize: 11.5, color: 'text.disabled', mt: 0.25 }}>Verificação iniciada em {started}</Typography>}
            </Box>
          </Stack>

          <ReasonBand reason={reason} />
          <NameCompare documentName={item.documentName} cfmName={item.cfmName} />

          {(ratio || score) && (
            <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }}>
              {ratio && <MetaChip label="Semelhança dos nomes" value={ratio} />}
              {score && <MetaChip label="Score do UaiID" value={score} />}
            </Stack>
          )}

          {prior && (
            <Stack
              data-testid="kyc-prior"
              direction="row"
              alignItems="center"
              sx={{ gap: 1, p: '9px 12px', borderRadius: '12px', bgcolor: amber.bg, border: '1px solid', borderColor: amber.bd, color: amber.fg }}
            >
              <WarningAmberRoundedIcon sx={{ fontSize: 19, flexShrink: 0 }} />
              <Typography sx={{ fontSize: 13, fontWeight: 800 }}>{prior}</Typography>
            </Stack>
          )}

          {mine && displayWarn && (
            <Stack
              data-testid="kyc-display-name"
              direction="row"
              alignItems="flex-start"
              sx={{ gap: 1, p: '9px 12px', borderRadius: '12px', bgcolor: amber.bg, border: '1px solid', borderColor: amber.bd, color: amber.fg }}
            >
              <WarningAmberRoundedIcon sx={{ fontSize: 19, mt: '1px', flexShrink: 0 }} />
              <Typography sx={{ fontSize: 13, fontWeight: 800, lineHeight: 1.45 }}>{displayWarn}</Typography>
            </Stack>
          )}

          {mine ? (
            <Stack direction="row" sx={{ gap: 1, justifyContent: { sm: 'flex-end' } }}>
              <Button
                variant="outlined"
                color="error"
                disabled={disabled}
                startIcon={<CloseRoundedIcon />}
                onClick={() => onReject(item)}
                sx={{ ...pillBtn, flex: { xs: 1, sm: '0 0 auto' }, px: 3, borderColor: 'rgba(239,68,68,.55)', '&:hover': { bgcolor: 'rgba(239,68,68,.06)', borderColor: '#ef4444' } }}
              >
                Recusar
              </Button>
              <Button
                variant="contained"
                disabled={disabled}
                startIcon={<CheckRoundedIcon />}
                onClick={() => onApprove(item)}
                sx={{
                  ...pillBtn, flex: { xs: 1, sm: '0 0 auto' }, px: 4, color: '#fff', background: TEAL_GRADIENT, boxShadow: '0 4px 14px rgba(32,178,170,.35)',
                  '&:hover': { background: 'linear-gradient(135deg, #1aa39c 0%, #14807b 100%)' },
                  '&.Mui-disabled': { background: 'rgba(32,178,170,.35)', color: '#fff' },
                }}
              >
                Aprovar
              </Button>
            </Stack>
          ) : (
            <Box data-testid="kyc-uaiid-notice" sx={{ p: '10px 12px', borderRadius: '12px', bgcolor: info.bg, border: '1px solid', borderColor: info.bd }}>
              <Stack direction="row" alignItems="flex-start" sx={{ gap: 1, color: info.fg }}>
                <InfoOutlinedIcon sx={{ fontSize: 19, mt: '1px', flexShrink: 0 }} />
                <Typography sx={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.45 }}>{UAIID_DECIDE_NOTICE}</Typography>
              </Stack>
              {item.providerId && <Box sx={{ pl: 3.5 }}><CopyId value={item.providerId} /></Box>}
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────── formulários dos diálogos ───────────────────────────
const WarnRow = ({ children }: { children: ReactNode }) => {
  const mode = useMode();
  const t = toneOf('warn', mode);
  return (
    <Stack direction="row" alignItems="flex-start" sx={{ gap: 1, p: '9px 12px', borderRadius: '12px', bgcolor: t.bg, border: '1px solid', borderColor: t.bd, color: t.fg }}>
      <WarningAmberRoundedIcon sx={{ fontSize: 19, mt: '1px', flexShrink: 0 }} />
      <Typography sx={{ fontSize: 13, fontWeight: 700, lineHeight: 1.45 }}>{children}</Typography>
    </Stack>
  );
};

const FormError = ({ text }: { text: string }) => {
  const mode = useMode();
  return <Typography role="alert" sx={{ fontSize: 13, fontWeight: 700, color: toneOf('bad', mode).fg }}>{text}</Typography>;
};

const DoctorLine = ({ item }: { item: ReviewItem }) => (
  <Typography sx={{ fontSize: 14.5, lineHeight: 1.5 }}>
    <b>{item.doctor.name}</b> · {crmLabel(item.doctor.crm || item.crm, item.doctor.crmUf)}
  </Typography>
);

export const ApproveForm = ({ item, note, onNote, error, busy }: {
  item: ReviewItem; note: string; onNote: (v: string) => void; error?: string | null; busy?: boolean;
}) => {
  const cmp = compareNames(item.documentName, item.cfmName);
  const prior = priorAttemptsLabel(item.priorAttempts);
  return (
    <Stack spacing={1.75}>
      <DoctorLine item={item} />
      <Typography sx={{ fontSize: 13.5, color: 'text.secondary', lineHeight: 1.55 }}>
        Depois de aprovar, o médico passa a poder atender pacientes e recebe um e-mail avisando.
      </Typography>
      {cmp.status === 'differ' && (
        <WarnRow>
          O nome do documento ({item.documentName}) é diferente do nome no CFM ({item.cfmName}). Aprove só se tiver certeza de que é a mesma pessoa.
        </WarnRow>
      )}
      {displayNameWarning(item) && <WarnRow>{displayNameWarning(item)}</WarnRow>}
      {prior && <WarnRow>{prior}.</WarnRow>}
      <TextField
        label="Observação (opcional)"
        helperText="Fica só no registro de auditoria — o médico não vê."
        value={note}
        onChange={(e) => onNote(e.target.value)}
        disabled={busy}
        multiline
        minRows={2}
        fullWidth
        slotProps={{ htmlInput: { maxLength: REASON_MAX } }}
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
      />
      {error ? <FormError text={error} /> : null}
    </Stack>
  );
};

export const RejectForm = ({ item, reason, onReason, error, busy }: {
  item: ReviewItem; reason: string; onReason: (v: string) => void; error?: string | null; busy?: boolean;
}) => {
  const mode = useMode();
  return (
    <Stack spacing={1.75}>
      <DoctorLine item={item} />
      {/* R4: o motivo vai por e-mail — o aviso vem ANTES do campo */}
      <Stack
        id="kyc-reject-notice"
        data-testid="kyc-reject-notice"
        direction="row"
        alignItems="center"
        sx={{ gap: 1, p: '10px 12px', borderRadius: '12px', bgcolor: COPPER.wash, border: '1px solid rgba(212,165,116,.55)', color: copperText(mode) }}
      >
        <MailOutlineRoundedIcon sx={{ fontSize: 20, flexShrink: 0 }} />
        <Typography sx={{ fontSize: 13.5, fontWeight: 800, lineHeight: 1.4 }}>{REJECT_EMAIL_NOTICE}</Typography>
      </Stack>
      <Box>
        <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: 'text.secondary', mb: 0.75 }}>Atalhos de motivo</Typography>
        <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }}>
          {REJECT_SHORTCUTS.map((s) => (
            <Chip
              key={s}
              clickable
              disabled={busy}
              label={s}
              onClick={() => onReason(applyShortcut(reason, s))}
              sx={{ height: 'auto', minHeight: 34, borderRadius: '10px', fontSize: 12.5, fontWeight: 600, '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5, lineHeight: 1.3 } }}
            />
          ))}
        </Stack>
      </Box>
      <TextField
        label="Motivo da recusa"
        required
        autoFocus
        value={reason}
        onChange={(e) => onReason(e.target.value.slice(0, REASON_MAX))}
        disabled={busy}
        multiline
        minRows={3}
        fullWidth
        helperText={`${reason.length}/${REASON_MAX}`}
        slotProps={{ htmlInput: { maxLength: REASON_MAX, 'aria-describedby': 'kyc-reject-notice' } }}
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' }, '& .MuiFormHelperText-root': { textAlign: 'right' } }}
      />
      {error ? <FormError text={error} /> : null}
    </Stack>
  );
};

// ─────────────────────────── médicos antigos + prazo ───────────────────────────
export const LegacySection = ({
  legacy, selected, onToggle, onToggleAll, onApproveSelected, graceMs, graceDraft, onGraceDraft, onGraceSave, onGraceClear,
  graceError, busy, now,
}: {
  legacy: LegacyItem[]; selected: ReadonlySet<string>; onToggle: (id: string) => void; onToggleAll: () => void; onApproveSelected: () => void;
  graceMs: number | null; graceDraft: string | null; onGraceDraft: (v: string) => void; onGraceSave: () => void; onGraceClear: () => void;
  graceError: string | null; busy: boolean; now?: number;
}) => {
  const mode = useMode();
  const saved = msToDateInput(graceMs);
  const value = graceDraft ?? saved;
  const dirty = graceMs !== null && value !== saved;
  const n = selected.size;
  const all = legacy.length > 0 && n === legacy.length;
  const min = msToDateInput(now ?? Date.now());
  return (
    <Card variant="outlined" data-testid="kyc-legacy" sx={{ borderRadius: '16px', mt: 2.5 }}>
      <CardContent sx={cardPad}>
        <Stack direction="row" alignItems="center" sx={{ gap: 1, flexWrap: 'wrap' }}>
          <Typography component="h3" sx={{ fontFamily: HEAD, fontWeight: 800, fontSize: 16 }}>Médicos antigos</Typography>
          <Chip size="small" label={legacy.length} sx={{ height: 22, fontWeight: 800, fontSize: 12 }} />
        </Stack>
        <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.25, lineHeight: 1.5 }}>
          Cadastrados antes da verificação de identidade. Continuam atendendo até o prazo abaixo.
        </Typography>

        {/* Prazo — config doctorKyc.legacyGraceUntilMs (0 = sem prazo) */}
        <Box sx={{ mt: 2, p: { xs: 1.5, sm: 2 }, borderRadius: '14px', border: '1px solid', borderColor: 'divider', bgcolor: mode === 'dark' ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.02)' }}>
          <Typography component="label" htmlFor="kyc-grace-date" sx={{ display: 'block', fontSize: 13.5, fontWeight: 800, mb: 1 }}>
            Prazo para médicos antigos
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1, alignItems: { xs: 'stretch', sm: 'flex-start' } }}>
            <TextField
              id="kyc-grace-date"
              type="date"
              size="small"
              value={value}
              disabled={graceMs === null || busy}
              onChange={(e) => onGraceDraft(e.target.value)}
              error={!!graceError}
              helperText={graceError ?? 'Depois desta data, médicos antigos sem identidade verificada deixam de atender. Em branco = sem prazo.'}
              slotProps={{ htmlInput: { min, 'aria-label': 'Prazo para médicos antigos' } }}
              sx={{ minWidth: { sm: 190 }, maxWidth: { sm: 360 }, '& .MuiOutlinedInput-root': { borderRadius: '12px', bgcolor: 'background.paper' } }}
            />
            <Button
              variant="contained"
              disabled={busy || !dirty}
              onClick={onGraceSave}
              sx={{ ...pillBtn, minHeight: 40, px: 2.5, color: '#fff', background: TEAL_GRADIENT, '&.Mui-disabled': { background: 'rgba(32,178,170,.30)', color: 'rgba(255,255,255,.85)' } }}
            >
              Salvar prazo
            </Button>
            {graceMs ? (
              <Button variant="text" disabled={busy} onClick={onGraceClear} sx={{ minHeight: 40, textTransform: 'none', fontWeight: 700, color: 'text.secondary' }}>
                Remover prazo
              </Button>
            ) : null}
          </Stack>
          <Typography data-testid="kyc-grace-current" sx={{ mt: 1, fontSize: 12.5, fontWeight: 700, color: 'text.secondary' }}>
            {graceMs === null ? 'Prazo atual: indisponível — toque em atualizar no topo do painel.' : `Prazo atual: ${graceLabel(graceMs)}`}
          </Typography>
        </Box>

        {/* Lista + aprovação em lote (só mexe em quem ainda é legado) */}
        {legacy.length === 0 ? (
          <Stack direction="row" alignItems="center" sx={{ gap: 1, mt: 2, color: 'text.secondary' }}>
            <CheckCircleOutlineRoundedIcon sx={{ fontSize: 20, color: toneOf('ok', mode).fg }} />
            <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>Nenhum médico antigo sem verificação.</Typography>
          </Stack>
        ) : (
          <Box sx={{ mt: 2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ gap: 1, flexWrap: 'wrap', mb: 1 }}>
              <FormControlLabel
                sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: 13.5, fontWeight: 700 } }}
                control={<Checkbox checked={all} indeterminate={n > 0 && !all} onChange={onToggleAll} disabled={busy} />}
                label="Selecionar todos"
              />
              <Button
                variant="contained"
                disabled={busy || n === 0}
                onClick={onApproveSelected}
                sx={{ ...pillBtn, minHeight: 42, px: 2.5, color: '#fff', background: TEAL_GRADIENT, '&.Mui-disabled': { background: 'rgba(32,178,170,.30)', color: 'rgba(255,255,255,.85)' } }}
              >
                {n > 0 ? `Aprovar selecionados (${n})` : 'Aprovar selecionados'}
              </Button>
            </Stack>
            <Box sx={{ maxHeight: 360, overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: '14px' }}>
              {legacy.map((l, i) => (
                <Box
                  key={l.id}
                  component="label"
                  data-testid="kyc-legacy-row"
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pl: 0.5, pr: 1.5, py: 0.5, minHeight: 56, cursor: 'pointer', borderTop: i ? '1px solid' : 'none', borderColor: 'divider', '&:hover': { bgcolor: 'action.hover' } }}
                >
                  <Checkbox checked={selected.has(l.id)} onChange={() => onToggle(l.id)} disabled={busy} slotProps={{ input: { 'aria-label': `Selecionar ${l.name}` } }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography noWrap sx={{ fontSize: 14, fontWeight: 700 }}>{l.name}</Typography>
                    <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary' }}>
                      {crmLabel(l.crm, l.crmUf)} · {l.email}
                    </Typography>
                  </Box>
                  {Number.isFinite(Date.parse(l.createdAt)) && (
                    <Typography sx={{ fontSize: 11.5, color: 'text.disabled', flexShrink: 0, display: { xs: 'none', sm: 'block' } }}>
                      {`Cadastro em ${formatDateBR(Date.parse(l.createdAt))}`}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────── painel (container) ───────────────────────────────
type Notice = { kind: 'ok' | 'error'; text: string };
type Phase = 'loading' | 'error' | 'ready';
type DialogState = { kind: 'approve' | 'reject'; item: ReviewItem } | null;
type CallResult = { ok: boolean; status: number; data: any };

/** fetch com token admin; rede/JSON quebrados viram resultado (nunca exceção). */
const call = async (path: string, init: RequestInit): Promise<CallResult> => {
  try {
    const res = await fetch(`${API_URL}${path}`, { ...init, headers: H() });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { code: 'NETWORK' } };
  }
};
/** O wrapper offline-first do fetch devolve 200 + {items:[],…} quando a rede cai — não é "fila vazia". */
const offlineEmpty = (res: Response) => res.headers.get('X-Offline-Empty') === 'true';

/** Aviso do resultado da ação. FIXO no rodapé da tela (acima da barra do mobile): quem decide um caso
 *  está no meio da fila, e a lista se reorganiza — um aviso no topo do painel ficaria fora de vista.
 *  (Não dá para usar `position: sticky`: o shell zera o overflow de html/body e o sticky não prende.) */
const NoticeBar = ({ notice, onClose }: { notice: Notice; onClose: () => void }) => {
  const mode = useMode();
  const isOk = notice.kind === 'ok';
  const t = toneOf(isOk ? 'ok' : 'bad', mode);
  const Icon = isOk ? CheckCircleOutlineRoundedIcon : ErrorOutlineRoundedIcon;
  // fundo OPACO (o aviso flutua sobre os cartões)
  const solid = isOk ? { light: '#e6f6ef', dark: '#123329' } : { light: '#fdeceb', dark: '#3b1b1b' };
  return (
    <Box
      role={isOk ? 'status' : 'alert'}
      aria-live={isOk ? 'polite' : 'assertive'}
      data-testid="kyc-notice"
      data-kind={notice.kind}
      sx={{
        position: 'fixed', zIndex: 1400, left: '50%', width: 'min(560px, calc(100vw - 24px))',
        bottom: { xs: 'calc(env(safe-area-inset-bottom, 0px) + 72px)', md: 28 },
        transform: 'translateX(-50%)',
        animation: 'kycToastIn .22s ease-out both',
        '@keyframes kycToastIn': { from: { opacity: 0, transform: 'translate(-50%, 10px)' }, to: { opacity: 1, transform: 'translate(-50%, 0)' } },
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        sx={{ gap: 1, p: '8px 8px 8px 14px', borderRadius: '14px', border: '1px solid', borderColor: t.bd, bgcolor: solid[mode], color: t.fg, boxShadow: '0 10px 30px rgba(0,0,0,.22)' }}
      >
        <Icon sx={{ fontSize: 20, flexShrink: 0 }} />
        <Typography sx={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, lineHeight: 1.4 }}>{notice.text}</Typography>
        <Button size="small" onClick={onClose} sx={{ textTransform: 'none', fontWeight: 700, minHeight: 40, color: 'inherit', flexShrink: 0 }}>Fechar</Button>
      </Stack>
    </Box>
  );
};

const EmptyQueue = () => {
  const mode = useMode();
  return (
    <Card variant="outlined" data-testid="kyc-empty" sx={{ borderRadius: '16px', py: { xs: 3.5, sm: 4.5 }, px: 2, textAlign: 'center' }}>
      <Box sx={{ width: 48, height: 48, mx: 'auto', mb: 1.25, borderRadius: '16px', display: 'grid', placeItems: 'center', bgcolor: 'rgba(32,178,170,.12)', color: tealText(mode) }}>
        <VerifiedUserOutlinedIcon />
      </Box>
      <Typography sx={{ fontFamily: HEAD, fontWeight: 800, fontSize: 16 }}>Nenhum médico aguardando análise</Typography>
      <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5, lineHeight: 1.5 }}>
        Quando alguém terminar a verificação, o caso aparece aqui.
      </Typography>
    </Card>
  );
};

/** Painel do dono: fila de verificação de identidade, médicos antigos e prazo. */
export const DoctorVerificationPanel = ({ onChanged }: { onChanged?: () => void }) => {
  const mode = useMode();
  const [phase, setPhase] = useState<Phase>('loading');
  const [queue, setQueue] = useState<VerificationQueue>({ review: [], legacy: [] });
  const [graceMs, setGraceMs] = useState<number | null>(null);
  const [graceDraft, setGraceDraft] = useState<string | null>(null);
  const [graceError, setGraceError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set<string>());
  const [notice, setNotice] = useState<Notice | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  // `dialog` guarda o caso e FICA depois de fechar: o conteúdo não pisca durante a animação de saída
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [confirmLegacy, setConfirmLegacy] = useState(false);
  const [confirmCount, setConfirmCount] = useState(0);
  const seq = useRef(0);

  /** GET da fila + config. `silent` = recarga depois de uma ação (mantém a tela, sem spinner). */
  const load = useCallback(async (silent = false) => {
    const mine = ++seq.current;
    setRefreshing(true);
    try {
      const [qRes, cRes] = await Promise.all([
        fetch(`${API_URL}/admin/doctors/verification-queue`, { headers: H() }),
        fetch(`${API_URL}/admin/config`, { headers: H() }).catch(() => null),
      ]);
      if (mine !== seq.current) return;
      if (!qRes.ok || offlineEmpty(qRes)) throw new Error('queue');
      const q = parseQueue(await qRes.json());
      if (mine !== seq.current) return;
      setQueue(q);
      setSelected((prev) => new Set([...prev].filter((id) => q.legacy.some((l) => l.id === id))));
      if (cRes && cRes.ok && !offlineEmpty(cRes)) {
        const cfg = await cRes.json().catch(() => ({}));
        const ms = Number(cfg?.doctorKyc?.legacyGraceUntilMs);
        setGraceMs(Number.isFinite(ms) && ms > 0 ? ms : 0);
      } else {
        setGraceMs(null);
      }
      setPhase('ready');
    } catch {
      if (mine !== seq.current) return;
      if (silent) setNotice({ kind: 'error', text: kycErrorMessage('NETWORK') });
      else setPhase((p) => (p === 'ready' ? p : 'error'));
    } finally {
      if (mine === seq.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // sucesso some sozinho; erro fica até o dono fechar (ele precisa ler)
  useEffect(() => {
    if (notice?.kind !== 'ok') return;
    const id = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(id);
  }, [notice]);

  const counts = useMemo(() => queueCounts(queue), [queue]);
  const cards = useMemo(() => sortReview(queue.review), [queue.review]);

  const ok = (text: string) => setNotice({ kind: 'ok', text });
  const fail = (text: string) => setNotice({ kind: 'error', text });
  /** Depois de qualquer ação: refaz o GET (sem reload) e avisa a aba para atualizar a lista de médicos. */
  const refreshAfter = async () => { await load(true); onChanged?.(); };

  const openDialog = (kind: 'approve' | 'reject', item: ReviewItem) => {
    setNotice(null); setNote(''); setReason(''); setDialogError(null); setDialog({ kind, item }); setDialogOpen(true);
  };
  const closeDialog = () => { if (!busy) setDialogOpen(false); };

  const decide = async () => {
    if (!dialog) return;
    const { kind, item } = dialog;
    if (kind === 'reject' && !reasonOk(reason)) { setDialogError(kycErrorMessage('REASON_REQUIRED')); return; }
    setBusy(true);
    setDialogError(null);
    const base = `/admin/doctors/${encodeURIComponent(item.doctor.id)}/verification`;
    const r = kind === 'approve'
      ? await call(`${base}/approve`, { method: 'POST', body: JSON.stringify(note.trim() ? { note: note.trim() } : {}) })
      : await call(`${base}/reject`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) });
    setBusy(false);
    // `unchanged` (2º clique / outro admin) volta como 200 → é sucesso, sem erro.
    if (r.ok) {
      setDialogOpen(false);
      ok(kind === 'approve'
        ? `Aprovado: ${item.doctor.name} já pode atender.`
        : `Verificação de ${item.doctor.name} recusada. O motivo segue por e-mail ao médico.`);
      await refreshAfter();
      return;
    }
    const msg = kycErrorMessage(r.data?.code, { status: r.data?.status, httpStatus: r.status });
    if (r.data?.code === 'INVALID_STATE' || r.data?.code === 'NOT_FOUND') {
      setDialogOpen(false); // o caso mudou de mãos: fecha, avisa e atualiza a fila
      fail(msg);
      await refreshAfter();
    } else {
      setDialogError(msg); // REASON_REQUIRED, rede…: o diálogo fica aberto com o texto digitado
    }
  };

  const approveSelected = async () => {
    const ids = [...selected];
    if (!ids.length) { setConfirmLegacy(false); fail(kycErrorMessage('IDS_REQUIRED')); return; }
    setNotice(null);
    setBusy(true);
    const r = await call('/admin/doctors/verification/approve-legacy', { method: 'POST', body: JSON.stringify({ ids }) });
    setBusy(false);
    setConfirmLegacy(false);
    if (r.ok) {
      setSelected(new Set<string>());
      ok(legacyApprovedNotice(Number(r.data?.approved) || 0, ids.length, Array.isArray(r.data?.skipped) ? r.data.skipped.length : 0));
      await refreshAfter();
    } else {
      fail(kycErrorMessage(r.data?.code, { httpStatus: r.status }));
    }
  };

  /** Salva o prazo dos médicos antigos. `forceMs` (0) = "Remover prazo". Nunca envia outro campo. */
  const saveGrace = async (forceMs?: number) => {
    const parsed = forceMs !== undefined ? { ok: true as const, ms: forceMs } : graceInputToMs(graceDraft ?? '');
    if (!parsed.ok) { setGraceError(parsed.error); return; }
    setGraceError(null);
    setNotice(null);
    setBusy(true);
    const r = await call('/admin/config/costs', { method: 'PATCH', body: JSON.stringify({ category: 'doctorKyc', legacyGraceUntilMs: parsed.ms }) });
    setBusy(false);
    if (r.ok) {
      setGraceMs(parsed.ms);
      setGraceDraft(null);
      ok(parsed.ms > 0
        ? `Prazo salvo: médicos antigos atendem ${graceLabel(parsed.ms)}.`
        : 'Prazo removido: médicos antigos seguem atendendo sem data limite.');
    } else {
      setGraceError(kycErrorMessage(r.data?.code, { httpStatus: r.status }));
    }
  };

  const toggleLegacy = (id: string) =>
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleAllLegacy = () =>
    setSelected((prev) => (prev.size === queue.legacy.length ? new Set<string>() : new Set(queue.legacy.map((l) => l.id))));

  const isReject = dialog?.kind === 'reject';
  return (
    <Box component="section" aria-labelledby="kyc-panel-title" data-testid="kyc-panel" sx={{ mb: 3.5 }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
        <Box sx={{ width: 42, height: 42, borderRadius: '13px', flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: 'rgba(32,178,170,.12)', color: tealText(mode) }}>
          <VerifiedUserOutlinedIcon />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography id="kyc-panel-title" component="h2" sx={{ fontFamily: HEAD, fontWeight: 800, fontSize: { xs: 17, sm: 19 }, lineHeight: 1.25 }}>
            Verificação de identidade
          </Typography>
          <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.45 }}>
            Confira quem pediu para atender pelo Dr. Exame antes de liberar.
          </Typography>
        </Box>
        <IconButton
          aria-label="Atualizar verificação de identidade"
          onClick={() => void load(true)}
          disabled={refreshing}
          sx={{
            width: 44, height: 44, border: '1px solid', borderColor: 'divider',
            '@keyframes kycSpin': { to: { transform: 'rotate(360deg)' } },
            '& svg': { animation: refreshing ? 'kycSpin 1s linear infinite' : 'none', '@media (prefers-reduced-motion: reduce)': { animation: 'none' } },
          }}
        >
          <RefreshRoundedIcon />
        </IconButton>
      </Stack>

      {phase === 'loading' && <TabLoader />}
      {phase === 'error' && <SectionError message="Não foi possível carregar a verificação de identidade." onRetry={() => void load()} />}
      {phase === 'ready' && (
        <>
          <StatTiles counts={counts} />

          <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'text.secondary', mb: 1 }}>
            Fila de análise
          </Typography>
          {cards.length ? (
            <Stack spacing={1.5}>
              {cards.map((item) => (
                <ReviewCard key={item.id} item={item} disabled={busy} onApprove={(i) => openDialog('approve', i)} onReject={(i) => openDialog('reject', i)} />
              ))}
            </Stack>
          ) : (
            <EmptyQueue />
          )}

          <LegacySection
            legacy={queue.legacy}
            selected={selected}
            onToggle={toggleLegacy}
            onToggleAll={toggleAllLegacy}
            onApproveSelected={() => { setConfirmCount(selected.size); setConfirmLegacy(true); }}
            graceMs={graceMs}
            graceDraft={graceDraft}
            onGraceDraft={(v) => { setGraceDraft(v); setGraceError(null); }}
            onGraceSave={() => void saveGrace()}
            onGraceClear={() => void saveGrace(0)}
            graceError={graceError}
            busy={busy}
          />
        </>
      )}

      {/* Aprovar (nota opcional) / Recusar (motivo obrigatório → e-mail ao médico) */}
      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        fullWidth
        maxWidth="xs"
        aria-labelledby="kyc-dialog-title"
        slotProps={{ paper: { sx: { borderRadius: '16px', m: 2, width: 'calc(100% - 32px)', maxWidth: 480 } } }}
      >
        <DialogTitle id="kyc-dialog-title" sx={{ fontFamily: HEAD, fontWeight: 800, fontSize: 18, pt: 2.5, pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          {isReject ? <MailOutlineRoundedIcon sx={{ color: toneOf('bad', mode).fg }} /> : <VerifiedUserOutlinedIcon sx={{ color: tealText(mode) }} />}
          {isReject ? 'Recusar verificação' : 'Aprovar este médico?'}
        </DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          {dialog && (isReject
            ? <RejectForm item={dialog.item} reason={reason} onReason={setReason} error={dialogError} busy={busy} />
            : <ApproveForm item={dialog.item} note={note} onNote={setNote} error={dialogError} busy={busy} />)}
        </DialogContent>
        {/* mobile: botão principal em cima, largura total (alvo de toque ≥ 44px); desktop: lado a lado à direita */}
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1, flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: 'stretch', '& > :not(style) ~ :not(style)': { ml: 0 } }}>
          <Button onClick={closeDialog} disabled={busy} sx={{ borderRadius: '999px', px: 2.5, minHeight: 44, textTransform: 'none', fontWeight: 700, color: 'text.secondary' }}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            color={isReject ? 'error' : 'primary'}
            disabled={busy || (isReject && !reasonOk(reason))}
            onClick={() => void decide()}
            sx={{ borderRadius: '999px', px: 3, minHeight: 46, textTransform: 'none', fontWeight: 800, ...(isReject ? {} : { color: '#fff', background: TEAL_GRADIENT }) }}
          >
            {busy ? (isReject ? 'Recusando…' : 'Aprovando…') : (isReject ? 'Recusar e avisar o médico' : 'Aprovar')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Lote de médicos antigos — confirmação explícita */}
      <ConfirmDialog
        open={confirmLegacy}
        onClose={() => { if (!busy) setConfirmLegacy(false); }}
        onConfirm={() => void approveSelected()}
        title={`Aprovar ${confirmCount} ${confirmCount === 1 ? 'médico antigo' : 'médicos antigos'}?`}
        desc={`${confirmCount === 1 ? 'Ele passa' : 'Eles passam'} a constar como identidade verificada sem passar pela verificação do UaiID. Aprove só quem você já conhece e confia.\n\nA ação mexe apenas em médicos antigos.`}
        confirmLabel="Aprovar"
        tone="primary"
        loading={busy}
      />

      {notice && <NoticeBar notice={notice} onClose={() => setNotice(null)} />}
    </Box>
  );
};
