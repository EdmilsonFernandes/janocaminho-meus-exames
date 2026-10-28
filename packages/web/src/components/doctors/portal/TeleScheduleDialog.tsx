import { forwardRef, useEffect, useMemo, useRef, useState, type Dispatch, type ReactElement, type ReactNode, type Ref, type SetStateAction } from 'react';
import {
  Alert, Avatar, Box, Button, ButtonBase, CircularProgress, Collapse, Dialog, DialogContent, FormControlLabel, IconButton,
  InputAdornment, MenuItem, Slide, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import type { Theme } from '@mui/material/styles';
import type { TransitionProps } from '@mui/material/transitions';
import CloseIcon from '@mui/icons-material/Close';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import VideoCallOutlinedIcon from '@mui/icons-material/VideoCallOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { COPPER, copperText, SEM } from '../../../theme';
import { usePrefersReducedMotion } from '../../useCardPress';
import {
  buildTeleShortcuts, callOptions, centsToPriceField, chargeIssue, DEFAULT_PRICE_MIN_CENTS, formatBRL, localYmd, maskReaisInput,
  MODE_LABEL, parseReaisToCents, priceFieldToCents, PRICE_MAX_CENTS, resolveCallMode, teleBlockingReason, teleDue, teleSummary,
  LINK_RE, type CallCaps, type CallMode, type TeleForm,
} from '../../../utils/teleSchedule';

/**
 * Agendar teleconsulta (portal do médico) — redesenho 27/10/26 ("fica feio demais", dono).
 *
 * Celular/app: tela cheia que sobe de baixo, cabeçalho e rodapé fixos, CTA de largura
 * total numa linha. Desktop: diálogo sm com a mesma estrutura. Seções Quando / Como /
 * Detalhes / Cobrança; o rodapé sempre diz O QUE vai ser agendado ou POR QUE ainda não
 * dá (botão desabilitado em silêncio parecia "morto").
 *
 * Acento = COBRE (assinatura do modo médico — memória portal-medico-cobre-trends);
 * teal fica só na marca. O CTA usa cobre PROFUNDO: branco sobre o cobre claro
 * (#d4a574→#b88a54) dava 2,2–3,1:1 e reprovava AA.
 *
 * Só apresentação: o envio (POST, conflito de agenda, duplicata do dia) continua no
 * `scheduleTele` do DoctorPortal.
 */

export interface TeleSchedulePatient { id: string; name: string; photo?: string }

export interface TeleScheduleDialogProps {
  open: boolean;
  onClose: () => void;
  /** Paciente da consulta (cabeçalho). */
  patient: TeleSchedulePatient | null;
  /** Aberto pela Agenda (sem paciente fixo): lista para escolher. */
  patientOptions?: TeleSchedulePatient[];
  onPatientChange?: (id: string) => void;
  tele: TeleForm;
  setTele: Dispatch<SetStateAction<TeleForm>>;
  /** GET /doctor/google/status — livekit/Meet + mínimo de cobrança. */
  caps: CallCaps | null;
  /** Toggle "sala automática" do portal (`createMeet`): app/Meet ligado; desligado = link. */
  autoRoom: boolean;
  setAutoRoom: (v: boolean) => void;
  onConnectGoogle: () => void;
  /** Valor padrão do médico (perfil) — usado ao ligar a cobrança com o campo vazio. */
  defaultPriceCents?: number | null;
  doctorFirstName?: string;
  busy: boolean;
  /** Erro do servidor (conflito, validação) — inline: o toast global fica ATRÁS do diálogo. */
  error?: string;
  onSubmit: () => void;
}

const SheetUp = forwardRef(function SheetUp(props: TransitionProps & { children: ReactElement }, ref: Ref<unknown>) {
  return <Slide direction="up" ref={ref} {...props} />;
});

const COPPER_BORDER = 'rgba(212,165,116,.6)';
/** Lavagem cobre: .18 no escuro mantém o texto cobre ≥4,5:1 (a .26 do segmented antigo dava 4,4). */
const copperWash = (t: Theme) => (t.palette.mode === 'dark' ? 'rgba(212,165,116,.18)' : COPPER.wash);
/** Topo do gradiente do CTA: #996a35 = 4,7:1 com branco (o fim, COPPER.textAA, 5,6:1). */
const CTA_TOP = '#996a35';
const PRESETS = [120, 150, 170, 190];
const RECURRENCES: [string, string][] = [['', 'Não repete'], ['semanal', 'Semanal'], ['mensal', 'Mensal'], ['semestral', 'Semestral'], ['anual', 'Anual']];
const MODE_ICON: Record<CallMode, ReactNode> = {
  app: <VideocamOutlinedIcon sx={{ fontSize: 20 }} />,
  meet: <VideoCallOutlinedIcon sx={{ fontSize: 20 }} />,
  link: <LinkOutlinedIcon sx={{ fontSize: 20 }} />,
};

/** Pílula selecionável (atalho/preço): borda+lavagem cobre quando ativa, nunca só cor. */
const pillSx = (active: boolean) => (t: Theme) => ({
  minHeight: 44, px: 1.75, borderRadius: '999px', flexShrink: 0, whiteSpace: 'nowrap' as const,
  fontFamily: 'inherit', fontSize: 14, fontWeight: active ? 700 : 600,
  border: '1px solid', borderColor: active ? COPPER_BORDER : t.palette.divider,
  bgcolor: active ? copperWash(t) : 'transparent',
  color: active ? copperText(t.palette.mode) : t.palette.text.primary,
  transition: 'background-color .15s ease, border-color .15s ease, color .15s ease',
  '@media (hover: hover)': { '&:hover': { borderColor: COPPER_BORDER } },
});

const Section = ({ id, title, children }: { id: string; title: string; children: ReactNode }) => (
  <Box component="section" aria-labelledby={id} sx={{ '& + &': { mt: 3 } }}>
    <Typography id={id} component="h3" sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 15, lineHeight: 1.3, color: 'text.primary', mb: 1.25 }}>
      {title}
    </Typography>
    {children}
  </Box>
);

const Hint = ({ children }: { children: ReactNode }) => (
  <Typography sx={{ fontSize: 13, lineHeight: 1.5, color: 'text.secondary', mt: 1 }}>{children}</Typography>
);

export const TeleScheduleDialog = ({
  open, onClose, patient, patientOptions, onPatientChange, tele, setTele, caps, autoRoom, setAutoRoom,
  onConnectGoogle, defaultPriceCents, doctorFirstName, busy, error, onSubmit,
}: TeleScheduleDialogProps) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const reduced = usePrefersReducedMotion();
  const fieldSize = fullScreen ? 'medium' : 'small';
  const minCents = caps?.priceMinCents && caps.priceMinCents >= 100 ? caps.priceMinCents : DEFAULT_PRICE_MIN_CENTS;

  // Cobrança: switch próprio (vazio ≠ "esqueci o valor"). Texto do campo é local — o
  // `tele.price` recebe sempre o valor normalizado "N,NN" (o envio só remove não-dígitos).
  const [charge, setCharge] = useState(false);
  const [priceText, setPriceText] = useState('');
  const priceRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    setCharge(!!tele.price);
    setPriceText(tele.price);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const setPriceCents = (cents: number | null) => setTele((t) => ({ ...t, price: cents ? centsToPriceField(cents) : '' }));
  const toggleCharge = (on: boolean) => {
    setCharge(on);
    if (!on) { setPriceText(''); setPriceCents(null); return; }
    if (!priceFieldToCents(tele.price) && defaultPriceCents && defaultPriceCents >= minCents) {
      setPriceText(centsToPriceField(defaultPriceCents));
      setPriceCents(defaultPriceCents);
    } else if (!priceFieldToCents(tele.price)) {
      setTimeout(() => priceRef.current?.focus(), 220); // depois do Collapse abrir
    }
  };

  const now = new Date();
  const shortcuts = useMemo(() => buildTeleShortcuts(new Date()), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const options = callOptions(caps);
  const mode = resolveCallMode(caps, autoRoom);
  const due = teleDue(tele.date, tele.time);
  const isPast = !!due && due.getTime() <= now.getTime();
  const linkInvalid = mode === 'link' && tele.link.trim() !== '' && !LINK_RE.test(tele.link.trim());
  const issue = charge ? chargeIssue(tele.price, minCents) : null;
  const priceCents = priceFieldToCents(tele.price);
  const reason = teleBlockingReason({
    hasPatient: !!patient, date: tele.date, time: tele.time, now, mode, link: tele.link, charge, price: tele.price, minCents,
  });
  const summary = teleSummary({ date: tele.date, time: tele.time, mode, charge, price: tele.price });
  const initial = (patient?.name || '?').trim().charAt(0).toUpperCase();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="sm"
      aria-labelledby="tele-schedule-title"
      transitionDuration={reduced ? 0 : undefined}
      slots={fullScreen ? { transition: SheetUp } : undefined}
      slotProps={{
        paper: {
          sx: {
            borderRadius: fullScreen ? 0 : '20px',
            backgroundImage: 'none',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          },
        },
      }}
    >
      {/* CABEÇALHO — quem é o paciente, sempre visível */}
      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0,
          px: { xs: 2, sm: 3 }, pb: 1.5, pt: fullScreen ? 'max(12px, env(safe-area-inset-top))' : 2.5,
          borderBottom: '1px solid', borderColor: 'divider',
        }}
      >
        <Avatar
          src={patient?.photo}
          alt=""
          sx={{ width: 44, height: 44, fontWeight: 800, fontFamily: 'Poppins, sans-serif', bgcolor: copperWash, color: (t) => copperText(t.palette.mode) }}
        >
          {initial}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography id="tele-schedule-title" component="h2" noWrap sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 18, lineHeight: 1.25, color: 'text.primary' }}>
            Nova teleconsulta
          </Typography>
          <Typography noWrap sx={{ fontSize: 13.5, color: 'text.secondary' }}>
            {patient ? `com ${patient.name}` : 'Escolha o paciente'}
          </Typography>
        </Box>
        <IconButton aria-label="Fechar" onClick={onClose} sx={{ width: 44, height: 44, color: 'text.secondary', flexShrink: 0 }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <DialogContent
        sx={{
          px: { xs: 2, sm: 3 }, pt: '20px !important', pb: 3,
          // Piso de 12px (público 40+): o rótulo encolhido é escala .75 do tamanho-base —
          // 14px do tema virava ~10,5px. Base 16 → 12px visível; a legenda (fenda do
          // contorno) acompanha para o rótulo não cortar a borda.
          '& .MuiInputLabel-root': { fontSize: 16 },
          '& .MuiOutlinedInput-notchedOutline legend': { fontSize: 12 },
        }}
      >
        {patientOptions && patientOptions.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <TextField
              select
              fullWidth
              size={fieldSize}
              label="Paciente"
              value={patient?.id ?? ''}
              onChange={(e) => onPatientChange?.(e.target.value)}
            >
              {patientOptions.map((p) => (
                <MenuItem key={p.id} value={p.id} sx={{ minHeight: 48 }}>
                  <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
                    <Avatar src={p.photo} alt="" sx={{ width: 28, height: 28, fontSize: 12, fontWeight: 800, bgcolor: copperWash, color: (t) => copperText(t.palette.mode) }}>
                      {p.name.charAt(0).toUpperCase()}
                    </Avatar>
                    <Typography noWrap sx={{ fontSize: 14, fontWeight: 600 }}>{p.name}</Typography>
                  </Stack>
                </MenuItem>
              ))}
            </TextField>
          </Box>
        )}

        <Section id="tele-sec-quando" title="Quando">
          {/* Atalhos: uma linha com rolagem no celular (sangra até a borda); quebra no desktop */}
          <Box
            role="group"
            aria-label="Atalhos de horário"
            sx={{
              display: 'flex', gap: 1, mb: 2,
              flexWrap: { xs: 'nowrap', sm: 'wrap' },
              overflowX: { xs: 'auto', sm: 'visible' },
              mx: { xs: -2, sm: 0 }, px: { xs: 2, sm: 0 },
              scrollSnapType: { xs: 'x proximity', sm: 'none' },
              scrollPaddingInline: '16px',
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': { display: 'none' },
            }}
          >
            {shortcuts.map((s) => {
              const active = tele.date === s.date && tele.time === s.time;
              return (
                <ButtonBase
                  key={s.key}
                  aria-pressed={active}
                  onClick={() => setTele((t) => ({ ...t, date: s.date, time: s.time }))}
                  sx={[pillSx(active), { scrollSnapAlign: 'start' }]}
                >
                  {s.label}
                </ButtonBase>
              );
            })}
          </Box>
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)' }}>
            <TextField
              type="date"
              label="Data"
              value={tele.date}
              onChange={(e) => setTele((t) => ({ ...t, date: e.target.value }))}
              size={fieldSize}
              fullWidth
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: localYmd(now) } }}
            />
            <TextField
              type="time"
              label="Horário"
              value={tele.time}
              onChange={(e) => setTele((t) => ({ ...t, time: e.target.value }))}
              size={fieldSize}
              fullWidth
              error={isPast}
              helperText={isPast ? 'Esse horário já passou' : undefined}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Box>
        </Section>

        <Section id="tele-sec-como" title="Como">
          {options.length > 1 && (
            <ToggleButtonGroup
              exclusive
              fullWidth
              value={mode}
              onChange={(_, v: CallMode | null) => { if (v) setAutoRoom(v !== 'link'); }}
              aria-label="Tipo de chamada"
              sx={(t) => ({
                '& .MuiToggleButton-root': {
                  minHeight: 44, gap: 0.75, textTransform: 'none', fontWeight: 700, fontSize: 14,
                  color: 'text.secondary', borderColor: 'divider',
                  '&.Mui-selected, &.Mui-selected:hover': { bgcolor: copperWash(t), color: copperText(t.palette.mode), borderColor: COPPER_BORDER },
                },
                '& .MuiToggleButton-root:first-of-type': { borderRadius: '12px 0 0 12px' },
                '& .MuiToggleButton-root:last-of-type': { borderRadius: '0 12px 12px 0' },
              })}
            >
              {options.map((m) => (
                <ToggleButton key={m} value={m}>
                  {MODE_ICON[m]}
                  {MODE_LABEL[m]}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          )}
          {mode === 'app' && <Hint>Recomendado — vídeo seguro dentro do Dr. Exame; o paciente entra pelo app, sem link.</Hint>}
          {mode === 'meet' && <Hint>A sala do Google Meet é criada e enviada ao paciente automaticamente.</Hint>}
          {mode === 'link' && (
            <TextField
              label="Link da chamada"
              placeholder="https://meet.google.com/…"
              value={tele.link}
              onChange={(e) => setTele((t) => ({ ...t, link: e.target.value }))}
              size={fieldSize}
              fullWidth
              error={linkInvalid}
              helperText={linkInvalid ? 'O link precisa começar com https://' : 'Meet, Teams ou WhatsApp — o paciente recebe no app.'}
              slotProps={{ htmlInput: { inputMode: 'url', autoCapitalize: 'none', autoCorrect: 'off' } }}
              sx={{ mt: options.length > 1 ? 1.5 : 0 }}
            />
          )}
          {mode === 'link' && caps?.configured && !caps.connected && !caps.livekit && (
            <Button
              onClick={onConnectGoogle}
              startIcon={<VideoCallOutlinedIcon />}
              sx={{ mt: 1, minHeight: 44, textTransform: 'none', fontWeight: 700, borderRadius: '12px', color: (t) => copperText(t.palette.mode) }}
            >
              Conectar Google Meet para gerar a sala sozinho
            </Button>
          )}
        </Section>

        <Section id="tele-sec-detalhes" title="Detalhes">
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1.5fr) minmax(0, 1fr)' } }}>
            <TextField
              label="Motivo (opcional)"
              placeholder={`Teleconsulta com Dr(a). ${doctorFirstName ?? ''}`.trim()}
              value={tele.title}
              onChange={(e) => setTele((t) => ({ ...t, title: e.target.value }))}
              size={fieldSize}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              select
              label="Repetir"
              value={tele.recurrence || ''}
              onChange={(e) => setTele((t) => ({ ...t, recurrence: e.target.value }))}
              size={fieldSize}
              fullWidth
              slotProps={{
                inputLabel: { shrink: true },
                select: { displayEmpty: true, renderValue: (v) => RECURRENCES.find(([k]) => k === v)?.[1] ?? 'Não repete' },
              }}
            >
              {RECURRENCES.map(([v, l]) => <MenuItem key={v} value={v} sx={{ minHeight: 44 }}>{l}</MenuItem>)}
            </TextField>
          </Box>
        </Section>

        <Section id="tele-sec-cobranca" title="Cobrança">
          <FormControlLabel
            labelPlacement="start"
            disableTypography
            control={(
              <Switch
                checked={charge}
                onChange={(e) => toggleCharge(e.target.checked)}
                slotProps={{ input: { 'aria-describedby': 'tele-charge-desc' } }}
                sx={{
                  // Desligado legível (o padrão sumia no papel branco): trilho ≥3:1 nos dois temas.
                  '& .MuiSwitch-track': { opacity: 1, bgcolor: (t: Theme) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,.38)' : 'rgba(15,23,42,.45)') },
                  '& .MuiSwitch-switchBase.Mui-checked': { color: COPPER.deep },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: COPPER.main, opacity: 0.6 },
                }}
              />
            )}
            label={(
              <Box sx={{ minWidth: 0 }}>
                <Typography component="span" sx={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'text.primary' }}>Cobrar do paciente</Typography>
                <Typography component="span" id="tele-charge-desc" sx={{ display: 'block', fontSize: 13, lineHeight: 1.45, color: 'text.secondary' }}>
                  Pago no app via PIX; o valor fica fixo no agendamento.
                </Typography>
              </Box>
            )}
            sx={{ m: 0, width: '100%', minHeight: 48, justifyContent: 'space-between', gap: 2 }}
          />
          <Collapse in={charge} unmountOnExit>
            <TextField
              inputRef={priceRef}
              label="Valor da consulta"
              value={priceText}
              onChange={(e) => {
                const masked = maskReaisInput(e.target.value);
                setPriceText(masked);
                setPriceCents(parseReaisToCents(masked));
              }}
              onBlur={() => { if (priceCents) setPriceText(centsToPriceField(priceCents)); }}
              size={fieldSize}
              fullWidth
              error={issue === 'min' || issue === 'max'}
              helperText={
                issue === 'min' ? `Mínimo ${formatBRL(minCents)} — garante o estorno integral ao paciente.`
                  : issue === 'max' ? `Máximo ${formatBRL(PRICE_MAX_CENTS)}.`
                  : `Mínimo ${formatBRL(minCents)}.`
              }
              slotProps={{
                input: { startAdornment: <InputAdornment position="start">R$</InputAdornment> },
                htmlInput: { inputMode: 'decimal', placeholder: '150,00' },
              }}
              sx={{ mt: 1.5 }}
            />
            <Box role="group" aria-label="Valores sugeridos" sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 1, mt: 1.5 }}>
              {PRESETS.map((v) => {
                const active = priceCents === v * 100;
                return (
                  <ButtonBase
                    key={v}
                    aria-pressed={active}
                    onClick={() => { setPriceText(centsToPriceField(v * 100)); setPriceCents(v * 100); }}
                    sx={[pillSx(active), { px: 0.5, borderRadius: '12px', fontVariantNumeric: 'tabular-nums' }]}
                  >
                    R$ {v}
                  </ButtonBase>
                );
              })}
            </Box>
          </Collapse>
        </Section>

        <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mt: 3 }}>
          <VerifiedUserOutlinedIcon sx={{ fontSize: 18, mt: '1px', color: (t) => copperText(t.palette.mode) }} />
          <Typography sx={{ fontSize: 12.5, lineHeight: 1.5, color: 'text.secondary' }}>
            O paciente recebe push agora e lembretes antes, e assina o termo de consentimento (Art. 15 CFM) no app antes de entrar.
          </Typography>
        </Stack>
      </DialogContent>

      {/* RODAPÉ — resumo do que vai ser agendado (ou o motivo do bloqueio) + CTA */}
      <Box
        sx={{
          flexShrink: 0, px: { xs: 2, sm: 3 }, pt: 1.5, pb: fullScreen ? 'max(16px, env(safe-area-inset-bottom))' : 2.5,
          borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper',
        }}
      >
        {error && <Alert severity="error" sx={{ mb: 1.25, borderRadius: '12px', fontSize: 13.5 }}>{error}</Alert>}
        <Stack direction="row" spacing={1} alignItems="center" role="status" aria-live="polite" sx={{ mb: 1.25, minWidth: 0 }}>
          {reason
            ? <ErrorOutlineIcon sx={{ fontSize: 18, flexShrink: 0, color: (t) => SEM.warn[t.palette.mode] }} />
            : <EventAvailableOutlinedIcon sx={{ fontSize: 18, flexShrink: 0, color: (t) => copperText(t.palette.mode) }} />}
          <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: (t) => (reason ? SEM.warn[t.palette.mode] : t.palette.text.primary) }}>
            {reason ?? summary}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1.25} justifyContent="flex-end">
          {!fullScreen && (
            <Button onClick={onClose} sx={{ minHeight: 48, px: 2.25, textTransform: 'none', fontWeight: 700, borderRadius: '14px', color: 'text.secondary' }}>
              Cancelar
            </Button>
          )}
          <Button
            variant="contained"
            disableElevation
            fullWidth={fullScreen}
            disabled={!!reason || busy}
            onClick={onSubmit}
            sx={{
              minHeight: 48, px: 3, borderRadius: '14px', whiteSpace: 'nowrap', textTransform: 'none',
              fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 15, color: '#fff',
              background: `linear-gradient(135deg, ${CTA_TOP} 0%, ${COPPER.textAA} 100%)`,
              boxShadow: '0 6px 16px rgba(138,95,46,.32), inset 0 1px 0 rgba(255,255,255,.16)',
              transition: 'box-shadow .2s ease, transform .12s ease',
              '@media (hover: hover)': {
                '&:hover': { background: `linear-gradient(135deg, #8d612f 0%, #7a5226 100%)`, boxShadow: '0 8px 20px rgba(138,95,46,.40), inset 0 1px 0 rgba(255,255,255,.16)' },
              },
              '&:active': { transform: 'scale(.985)' },
              '&.Mui-disabled': { background: 'none', bgcolor: 'action.disabledBackground', color: 'text.disabled', boxShadow: 'none' },
            }}
          >
            {busy ? (<><CircularProgress size={18} sx={{ color: 'inherit', mr: 1 }} />Agendando…</>) : 'Agendar e avisar paciente'}
          </Button>
        </Stack>
      </Box>
    </Dialog>
  );
};
