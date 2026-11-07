import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Container, Typography, Button, Card, CardContent, Chip, Stack, Slider, MenuItem, TextField, Avatar, useTheme, alpha, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import type { Theme } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import { DrExame } from '../components/DrExame';
import { Reveal } from '../components/Reveal';
import { tealText, copperText, COPPER } from '../theme';
import { useMediaQuery } from '@mui/material';

// Ícones Material (zero emoji de UI)
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import EditNoteIcon from '@mui/icons-material/EditNote';
import PixIcon from '@mui/icons-material/Pix';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import GppGoodOutlinedIcon from '@mui/icons-material/GppGoodOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import CheckIcon from '@mui/icons-material/Check';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ShareIcon from '@mui/icons-material/Share';
import TravelExploreRoundedIcon from '@mui/icons-material/TravelExploreRounded';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';

const TEAL = '#20b2aa';
const TEAL_DEEP = '#178f89';
const TEAL_LIGHT = '#5fc9c3';
/** Palavra-magnet editorial — mesma assinatura da home (Instrument Serif itálica). */
const SERIF_I = { fontFamily: "'Instrument Serif', Georgia, serif", fontStyle: 'italic', fontWeight: 400 } as const;

/** Box com display:grid — substitui MuiGrid (alias local no topo: componente usa em JSX). */
const Grid = Box;

const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

/** Entrada suave — desligada em prefers-reduced-motion. */
const HERO_IN = {
  '@keyframes pmFadeUp': {
    from: { opacity: 0, transform: 'translateY(24px)' },
    to: { opacity: 1, transform: 'translateY(0)' },
  },
  '@media (prefers-reduced-motion: reduce)': { animation: 'none !important' },
} as const;

/** Pulso sutil do chip PIX (única animação contínua; some no reduced-motion). */
const PULSE = {
  '@keyframes pmPulse': { '0%,100%': { boxShadow: `0 0 0 0 ${alpha(TEAL, 0.45)}` }, '50%': { boxShadow: `0 0 0 6px ${alpha(TEAL, 0)}` } },
  '@media (prefers-reduced-motion: reduce)': { animation: 'none !important' },
} as const;

const Section = ({ children, id, sx }: { children: React.ReactNode; id?: string; sx?: any }) => (
  <Box component="section" id={id} sx={{ py: { xs: 7, sm: 10, md: 12 }, px: 2, scrollMarginTop: 72, ...sx }}>
    <Container maxWidth="lg" sx={{ px: '0 !important' }}>{children}</Container>
  </Box>
);

const SectionTitle = ({ children, sub, light }: { children: React.ReactNode; sub?: string; light?: boolean }) => (
  <Box sx={{ maxWidth: 680, mb: { xs: 4, sm: 5 }, mx: 'auto', textAlign: 'center' }}>
    <Typography variant="h3" component="h2" sx={{ color: light ? '#fff' : undefined, mb: sub ? 1.5 : 0 }}>{children}</Typography>
    {sub && <Typography variant="body1" sx={{ color: light ? 'rgba(232,238,240,0.72)' : 'text.secondary' }}>{sub}</Typography>}
  </Box>
);

// ---------------------------------------------------------------------------
// CONSOLE DO PORTAL — mock em markup vivo (padrão Limelight/hero-14): frame
// 16:10 escuro, barra de janela, faixa de KPIs e conteúdo que troca por "cue".
// Sem imagem, sem lib — segue o tema do produto (sempre escuro, como o app).
// ---------------------------------------------------------------------------
const ConsoleShell = ({ title, children, kpis }: { title: string; children: React.ReactNode; kpis: { label: string; value: string; tone?: 'teal' | 'copper' | 'ok' }[] }) => (
  <Box sx={{
    borderRadius: '22px', overflow: 'hidden',
    background: 'linear-gradient(180deg, #0e1f1e 0%, #0a1514 100%)',
    border: '1px solid', borderColor: alpha(TEAL, 0.28),
    boxShadow: `0 24px 80px ${alpha('#03110f', 0.55)}, 0 2px 0 ${alpha('#ffffff', 0.04)} inset`,
  }}>
    {/* Barra de janela */}
    <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 2, py: 1.25, borderBottom: '1px solid', borderColor: alpha(TEAL, 0.16) }}>
      <Stack direction="row" spacing={0.5}>
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
          <Box key={c} sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: alpha(c, 0.75) }} />
        ))}
      </Stack>
      <Typography variant="caption" sx={{ mx: 'auto', color: 'rgba(155,196,192,0.55)', fontFamily: "'Inter',sans-serif", letterSpacing: '0.04em' }}>
        {title}
      </Typography>
    </Stack>
    {/* Faixa de KPIs */}
    <Stack direction="row" flexWrap="wrap" useFlexGap sx={{ px: { xs: 1.5, sm: 2.5 }, py: 1.25, gap: 1, borderBottom: '1px solid', borderColor: alpha(TEAL, 0.12), bgcolor: alpha('#ffffff', 0.02) }}>
      {kpis.map((k) => (
        <Stack key={k.label} sx={{ minWidth: 96, flex: { sm: '1 1 0' } }}>
          <Typography variant="caption" sx={{ color: 'rgba(155,196,192,0.6)', fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>
            {k.label}
          </Typography>
          <Typography sx={{ color: k.tone === 'copper' ? '#d4a574' : k.tone === 'ok' ? '#7bd88f' : TEAL_LIGHT, fontFamily: "'Poppins',sans-serif", fontWeight: 800, fontSize: 16, lineHeight: 1.3 }}>
            {k.value}
          </Typography>
        </Stack>
      ))}
    </Stack>
    <Box sx={{ p: { xs: 2, sm: 3 } }}>{children}</Box>
  </Box>
);

/** Linha de item do console (documento, passo, consulta). */
const ConsoleRow = ({ icon, primary, secondary, right }: { icon: React.ReactNode; primary: string; secondary?: string; right?: React.ReactNode }) => (
  <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 1, '& + &': { borderTop: '1px solid', borderColor: alpha('#ffffff', 0.05) } }}>
    <Box sx={{ width: 30, height: 30, borderRadius: '10px', display: 'grid', placeItems: 'center', bgcolor: alpha(TEAL, 0.12), color: TEAL_LIGHT, flexShrink: 0 }}>{icon}</Box>
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography sx={{ color: '#e8eef0', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{primary}</Typography>
      {secondary && <Typography variant="caption" sx={{ color: 'rgba(155,196,192,0.65)', display: 'block' }}>{secondary}</Typography>}
    </Box>
    {right}
  </Stack>
);

// ---------------------------------------------------------------------------
// Hero — campo "spotlit" teal sobre base escura (momento assinatura, os dois
// temas; precedente: seção risco da home). Console do portal em 16:10 abaixo.
// ---------------------------------------------------------------------------
const HeroConsole = () => {
  const item = (label: string, value: string, dir: 'up' | 'down' | 'ok') => {
    const color = dir === 'ok' ? '#94a3b8' : dir === 'up' ? '#ff8a80' : '#38bdf8';
    return (
      <Chip size="small" sx={{
        m: 0.5, borderRadius: '10px', fontWeight: 600, fontSize: 12.5, color, bgcolor: alpha(color, 0.12),
        '& .MuiChip-label': { px: 1.25 },
      }} label={
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Box component="span">{label}</Box>
          <Box component="span" sx={{ fontWeight: 800 }}>{value}</Box>
          {dir === 'up' && <TrendingUpIcon sx={{ fontSize: 13 }} />}
          {dir === 'down' && <TrendingDownIcon sx={{ fontSize: 13 }} />}
          {dir === 'ok' && <CheckIcon sx={{ fontSize: 12 }} />}
        </Stack>
      } />
    );
  };
  return (
    <ConsoleShell
      title="portal · Dr. Exame — consulta de hoje"
      kpis={[
        { label: 'Brief clínico', value: 'Pronto', tone: 'teal' },
        { label: 'Alterados', value: '3 de 17' },
        { label: 'Próxima consulta', value: '15:30' },
        { label: 'PIX desta consulta', value: 'R$ 96', tone: 'ok' },
      ]}
    >
      <Grid sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.15fr 0.85fr' }, gap: 2.5 }}>
        <Box>
          <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.25 }}>
            <Avatar sx={{ bgcolor: alpha(TEAL, 0.18), color: TEAL_LIGHT, width: 38, height: 38, fontWeight: 800, fontSize: 14 }}>CM</Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ color: '#e8eef0', fontWeight: 700, fontSize: 14.5 }}>Carlos M., 51 · videoconsulta 15:30</Typography>
              <Typography variant="caption" sx={{ color: 'rgba(155,196,192,0.65)' }}>Exames 12/10 · 5 documentos · consentimento Art. 15 registrado</Typography>
            </Box>
            <Chip size="small" sx={{ bgcolor: `linear-gradient(135deg,${TEAL},${TEAL_DEEP})`, color: '#fff', fontWeight: 700, borderRadius: '10px', '& .MuiChip-label': { px: 1.25 } }} label={<Stack direction="row" spacing={0.5} alignItems="center"><AutoAwesomeIcon sx={{ fontSize: 13 }} /><Box component="span" sx={{ fontSize: 11.5 }}>Brief</Box></Stack>} />
          </Stack>
          <Box sx={{ mx: -0.5 }}>
            {item('Glicose', '118 mg/dL', 'up')}
            {item('TSH', '4,8 µUI/mL', 'up')}
            {item('Vitamina D', '22 ng/mL', 'down')}
            {item('Hemoglobina', '13,9 g/dL', 'ok')}
            {item('Colesterol', '212 mg/dL', 'up')}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, justifyContent: 'center' }}>
          <ConsoleRow icon={<CalendarMonthIcon sx={{ fontSize: 16 }} />} primary="Agenda · hoje" secondary="4 consultas · 2 por vídeo" />
          <ConsoleRow icon={<EditNoteIcon sx={{ fontSize: 16 }} />} primary="SOAP da 14:00" secondary="rascunho da transcrição aguardando seu ok" />
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, p: 1.25, borderRadius: '14px', border: '1px solid', borderColor: alpha('#7bd88f', 0.3), bgcolor: alpha('#7bd88f', 0.07), ...PULSE, animation: 'pmPulse 2.6s ease-in-out infinite' }}>
            <PixIcon sx={{ fontSize: 18, color: '#7bd88f' }} />
            <Box>
              <Typography sx={{ color: '#e8eef0', fontSize: 13.5, fontWeight: 700 }}>PIX pago · R$ 120</Typography>
              <Typography variant="caption" sx={{ color: 'rgba(155,196,192,0.7)' }}>R$ 96 líquidos · repasse automático</Typography>
            </Box>
          </Stack>
        </Box>
      </Grid>
    </ConsoleShell>
  );
};

// ---------------------------------------------------------------------------
// "Cues" — como funciona com console vivo (padrão Limelight): abas 01/02/03,
// auto-avanço 6s pausando em hover/foco; desligado em prefers-reduced-motion.
// ---------------------------------------------------------------------------
const CUES = [
  {
    n: '01',
    tab: 'CRM validado',
    title: 'Entre com seu CRM',
    desc: 'Conta criada com CRM e registro validado na base do conselho antes de liberar o atendimento — só médico real atende. Enquanto isso, você configura agenda e PIX.',
    kpis: [
      { label: 'Cadastro', value: 'Concluído', tone: 'teal' as const },
      { label: 'CRM', value: 'Válido', tone: 'ok' as const },
      { label: 'Agenda', value: 'Conectada', tone: 'teal' as const },
    ],
    rows: [
      { icon: 'check', primary: 'Dra. Ana Ribeiro · CRM 123.456-SP', secondary: 'conta criada há 2 minutos' },
      { icon: 'shield', primary: 'CRM verificado na base do conselho', secondary: 'KYC aprovado — identidade e registro conferidos' },
      { icon: 'calendar', primary: 'Agenda e PIX configurados', secondary: 'você define valor, duração e horários' },
    ],
  },
  {
    n: '02',
    tab: 'Exames chegam',
    title: 'O paciente compartilha com 1 clique',
    desc: 'Seu convite é um link. Quem recebe entra no app com a conta pronta e o compartilhamento já aceito — o histórico chega organizado no seu painel.',
    kpis: [
      { label: 'Convites', value: '1 link', tone: 'teal' as const },
      { label: 'Documentos', value: '5 PDFs' },
      { label: 'Consentimento', value: 'Art. 15', tone: 'copper' as const },
    ],
    rows: [
      { icon: 'share', primary: 'Carlos M. aceitou o convite', secondary: 'escopos: exames, evolução, alertas · validade 14 dias' },
      { icon: 'check', primary: 'Hemograma + TSH + Vitamina D', secondary: 'coleta 12/10 · extraídos e organizados pela IA' },
      { icon: 'shield', primary: 'Consentimento registrado (LGPD)', secondary: 'compartilhamento revogável pelo paciente a qualquer momento' },
    ],
  },
  {
    n: '03',
    tab: 'Atende e recebe',
    title: 'Chegue sabendo o que importa — e receba no PIX',
    desc: 'Brief pronto antes de entrar, transcrição que vira rascunho de SOAP e cobrança disparada junto do agendamento. Repasse automático, consulta por consulta.',
    kpis: [
      { label: 'Brief', value: 'Pré-consulta', tone: 'teal' as const },
      { label: 'SOAP', value: 'Rascunho' },
      { label: 'PIX R$ 120', value: 'R$ 96 líquidos', tone: 'ok' as const },
    ],
    rows: [
      { icon: 'fact', primary: 'Brief: 3 alterados em destaque', secondary: 'glicose, TSH e colesterol com contexto do histórico' },
      { icon: 'edit', primary: 'Transcrição → SOAP', secondary: 'você revisa, aprova e o carimbo de IA fica registrado (Res. CFM 2.454/2026)' },
      { icon: 'pix', primary: 'PIX pago no agendamento', secondary: 'sem maquininha, sem "depois eu te mando"' },
    ],
  },
];

const CueIcon = ({ name }: { name: string }) => {
  const s = { fontSize: 16 };
  switch (name) {
    case 'shield': return <VerifiedUserOutlinedIcon sx={s} />;
    case 'calendar': return <CalendarMonthIcon sx={s} />;
    case 'share': return <ShareIcon sx={s} />;
    case 'fact': return <FactCheckOutlinedIcon sx={s} />;
    case 'edit': return <EditNoteIcon sx={s} />;
    case 'pix': return <PixIcon sx={s} />;
    default: return <CheckIcon sx={s} />;
  }
};

const HowItWorksCues = () => {
  const t = useTheme();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useRef(false);
  useEffect(() => {
    reduced.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }, []);
  useEffect(() => {
    if (paused || reduced.current) return;
    const id = window.setInterval(() => setActive((a) => (a + 1) % CUES.length), 6000);
    return () => window.clearInterval(id);
  }, [paused]);
  const cue = CUES[active];
  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {/* Abas-cue */}
      <Stack
        role="tablist"
        direction={{ xs: 'column', sm: 'row' }}
        spacing={{ xs: 1, sm: 1.5 }}
        justifyContent="center"
        sx={{ mb: 3.5 }}
      >
        {CUES.map((c, i) => {
          const on = i === active;
          return (
            <Button
              key={c.n}
              role="tab"
              aria-selected={on}
              onClick={() => setActive(i)}
              sx={{
                borderRadius: '14px', px: 2.25, py: 1.5, minHeight: 48, textTransform: 'none',
                border: '1px solid', borderColor: on ? alpha(TEAL, 0.55) : 'divider',
                bgcolor: on ? alpha(TEAL, t.palette.mode === 'dark' ? 0.14 : 0.09) : 'transparent',
                color: 'text.primary', transition: 'background-color .2s, border-color .2s',
                '&:hover': { bgcolor: alpha(TEAL, 0.08) },
              }}
            >
              <Stack direction="row" spacing={1.25} alignItems="center">
                <Typography sx={{ fontFamily: "'Poppins',sans-serif", fontWeight: 800, fontSize: 13, color: on ? copperText(t.palette.mode) : 'text.secondary', letterSpacing: '0.06em' }}>
                  {c.n}
                </Typography>
                <Typography sx={{ fontWeight: 700, fontSize: 14.5 }}>{c.tab}</Typography>
              </Stack>
            </Button>
          );
        })}
      </Stack>
      <Grid sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '0.9fr 1.1fr' }, gap: { xs: 3, md: 5 }, alignItems: 'center' }}>
        <Box>
          <Typography sx={{ fontFamily: (th: Theme) => th.typography.h5.fontFamily, fontWeight: 800, fontSize: { xs: 20, sm: 22 }, mb: 1.5 }}>
            {cue.title}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.7, mb: 2 }}>{cue.desc}</Typography>
          <Chip
            size="small"
            sx={{ borderRadius: '10px', fontWeight: 700, color: copperText(t.palette.mode), bgcolor: alpha(COPPER.main, 0.13), '& .MuiChip-label': { px: 1.25 } }}
            label={`${cue.n} / 03 — ${cue.tab}`}
          />
        </Box>
        <Reveal key={active} delay={0}>
          <ConsoleShell title={`portal · Dr. Exame — ${cue.tab.toLowerCase()}`} kpis={cue.kpis}>
            {cue.rows.map((r) => <ConsoleRow key={r.primary} icon={<CueIcon name={r.icon} />} primary={r.primary} secondary={r.secondary} />)}
          </ConsoleShell>
        </Reveal>
      </Grid>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Bento "quatro atos" — card de feature com chip de métrica (padrão Limelight).
// ---------------------------------------------------------------------------
const ActCard = ({ icon, title, metric, metricLabel, strong, soft, delay }: { icon: React.ReactNode; title: string; metric: string; metricLabel: string; strong: string; soft: string; delay: number }) => {
  const t = useTheme();
  return (
    <Reveal delay={delay} sx={{ height: '100%' }}>
      <Card elevation={0} sx={{ height: '100%', borderRadius: '20px', display: 'flex', flexDirection: 'column' }}>
        <CardContent sx={{ p: { xs: 3, sm: 3.5 }, height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 2 }}>
            <Box sx={{ width: 46, height: 46, borderRadius: '14px', display: 'grid', placeItems: 'center', background: `linear-gradient(135deg, ${alpha(TEAL, 0.16)}, ${alpha(COPPER.main, 0.12)})`, color: tealText(t.palette.mode) }}>{icon}</Box>
            <Box sx={{ flex: 1 }} />
            <Stack sx={{ textAlign: 'right' }}>
              <Typography sx={{ fontFamily: "'Poppins',sans-serif", fontWeight: 800, fontSize: 20, lineHeight: 1, color: tealText(t.palette.mode) }}>{metric}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700 }}>{metricLabel}</Typography>
            </Stack>
          </Stack>
          <Typography sx={{ fontFamily: (th: Theme) => th.typography.h6.fontFamily, fontWeight: 700, fontSize: 17, mb: 1 }}>{title}</Typography>
          <Typography sx={{ fontWeight: 600, mb: 0.75, fontSize: 14.5 }}>{strong}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>{soft}</Typography>
        </CardContent>
      </Card>
    </Reveal>
  );
};

// ---------------------------------------------------------------------------
// Contadores animados (padrão Overture) — só números REAIS do sistema.
// ---------------------------------------------------------------------------
const StatCounter = ({ value, decimals = 0, prefix = '', label, sub }: { value: number; decimals?: number; prefix?: string; label: string; sub: string }) => {
  const t = useTheme();
  const ref = useRef<HTMLDivElement | null>(null);
  const [display, setDisplay] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting || started.current) return;
      started.current = true;
      if (reduced) { setDisplay(value); return; }
      const t0 = performance.now();
      const dur = 1100;
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        setDisplay(value * eased);
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [value]);
  const fmt = display.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (
    <Stack ref={ref} sx={{ textAlign: 'center', px: 1.5, flex: '1 1 150px' }}>
      <Typography sx={{ fontFamily: "'Poppins',sans-serif", fontWeight: 800, fontSize: { xs: '2.1rem', sm: '2.5rem' }, letterSpacing: '-0.03em', lineHeight: 1.15, color: tealText(t.palette.mode) }}>
        {prefix}{fmt}
      </Typography>
      <Typography sx={{ fontWeight: 700, fontSize: 14.5, mt: 0.5 }}>{label}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.5 }}>{sub}</Typography>
    </Stack>
  );
};

// ---------------------------------------------------------------------------
// Calculadora de ganho — slider consultas/semana × valor médio → PIX/mês
// ---------------------------------------------------------------------------
const Calculator = () => {
  const t = useTheme();
  const [consultas, setConsultas] = useState(12);
  const [valor, setValor] = useState(150);
  const ganho = useMemo(() => Math.round(consultas * 4.33 * valor * 0.8), [consultas, valor]);
  return (
    <Card elevation={0} sx={{ borderRadius: '20px', maxWidth: 640, mx: 'auto' }}>
      <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
        <Stack spacing={{ xs: 3, sm: 4 }}>
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.5 }}>
              <Typography sx={{ fontFamily: (th: Theme) => th.typography.subtitle1.fontFamily, fontWeight: 600 }}>Consultas por semana</Typography>
              <Typography sx={{ fontFamily: (th: Theme) => th.typography.h6.fontFamily, fontWeight: 800, color: tealText(t.palette.mode), fontSize: 18 }}>{consultas}</Typography>
            </Stack>
            <Slider
              value={consultas}
              onChange={(_, v) => setConsultas(v as number)}
              min={1} max={20} step={1}
              marks={[{ value: 1, label: '1' }, { value: 20, label: '20' }]}
              valueLabelDisplay="auto"
              aria-label="Consultas por semana"
              sx={{
                '& .MuiSlider-thumb': { boxShadow: `0 2px 10px ${alpha(TEAL, 0.45)}` },
                '& .MuiSlider-markLabel': { fontSize: 12 },
                '& .MuiSlider-valueLabel': { fontWeight: 700, borderRadius: '10px' },
              }}
            />
          </Box>
          <TextField
            select
            label="Valor médio da consulta"
            value={valor}
            onChange={(e) => setValor(Number(e.target.value))}
            fullWidth
            sx={{ maxWidth: 300 }}
          >
            {[120, 150, 190].map((v) => (
              <MenuItem key={v} value={v} sx={{ fontWeight: 600 }}>{fmtBRL(v)}</MenuItem>
            ))}
          </TextField>
          <Box sx={{ textAlign: 'center', py: 1 }}>
            <Typography variant="caption" sx={{ letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: 'text.secondary' }}>
              + no seu PIX, por mês
            </Typography>
            <Typography sx={{
              fontFamily: (th: Theme) => th.typography.h1.fontFamily, fontWeight: 800, fontSize: { xs: '2.6rem', sm: '3.4rem' },
              letterSpacing: '-0.03em', lineHeight: 1.1,
              background: `linear-gradient(135deg, ${tealText(t.palette.mode)}, ${copperText(t.palette.mode)})`,
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', my: 0.5,
            }}>
              {fmtBRL(ganho)}
            </Typography>
            <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="center">
              <PixIcon sx={{ fontSize: 16, color: tealText(t.palette.mode) }} />
              <Typography variant="caption" color="text.secondary">(80% após taxa de plataforma de 20%)</Typography>
            </Stack>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
};

const Passo = ({ n, title, desc, delay }: { n: number; title: string; desc: string; delay: number }) => {
  const t = useTheme();
  return (
    <Reveal delay={delay}>
      <Box sx={{ textAlign: { xs: 'center', sm: 'left' } }}>
        <Box sx={{
          width: 44, height: 44, borderRadius: '50%', display: 'grid', placeItems: 'center',
          mx: { xs: 'auto', sm: 0 }, mb: 2,
          bgcolor: alpha(TEAL, 0.14), color: tealText(t.palette.mode),
        fontFamily: (th: Theme) => th.typography.h5.fontFamily, fontWeight: 800, fontSize: 18,
      }}>{n}</Box>
      <Typography sx={{ fontFamily: (th: Theme) => th.typography.subtitle1.fontFamily, fontWeight: 700, fontSize: 16, mb: 0.75 }}>{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 300, mx: { xs: 'auto', sm: 0 } }}>{desc}</Typography>
    </Box>
  </Reveal>
  );
};

const ConfiancaItem = ({ icon, title, desc, delay }: { icon: React.ReactNode; title: string; desc: string; delay: number }) => {
  const t = useTheme();
  return (
    <Reveal delay={delay}>
      <Card elevation={0} sx={{ height: '100%', borderRadius: '20px' }}>
        <CardContent sx={{ p: { xs: 2.75, sm: 3 }, height: '100%' }}>
          <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.25 }}>
            <Box sx={{ color: copperText(t.palette.mode) }}>{icon}</Box>
            <Typography sx={{ fontFamily: (th: Theme) => th.typography.subtitle1.fontFamily, fontWeight: 700, fontSize: 15 }}>{title}</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary">{desc}</Typography>
        </CardContent>
      </Card>
    </Reveal>
  );
};

const FAQ_ITEMS = [
  {
    q: 'Preciso validar meu CRM?',
    a: 'Sim. A conta é criada com CRM e validamos o registro antes de liberar o atendimento — só médico real atende. Sua área fica pronta em minutos; a validação roda enquanto você configura agenda e PIX.',
  },
  {
    q: 'Quanto custa, na prática?',
    a: 'Comece grátis: agenda, brief clínico e cobrança por PIX — a plataforma retém 20% só quando você recebe (R$ 120 vira R$ 96). O Pro (R$ 29,90/mês) soma pré-consulta ilimitada, SOAP da transcrição e export em PDF. Sem taxa de instalação, sem fidelidade.',
  },
  {
    q: 'Quando o PIX cai na minha conta?',
    a: 'O pagamento é processado pelo Asaas — instituição de pagamento regulada pelo Banco Central — com repasse automático para a sua conta. Cada repasse aparece no seu portal, consulta por consulta.',
  },
  {
    q: 'Quem são os pacientes que vou atender?',
    a: 'Primeiro, os seus: você envia um convite por link e o paciente entra no app já compartilhando os exames com você. Além disso, médicos com portal ativo aparecem na busca Encontrar especialistas — um canal a mais para quem ainda não tem médico.',
  },
  {
    q: 'A IA substitui o médico?',
    a: 'Não. A IA organiza os exames, monta o brief e rascunha o prontuário; diagnóstico e conduta são seus. O uso de IA como apoio fica registrado no documento, conforme a Res. CFM 2.454/2026 — você já entra regularizado.',
  },
];

export const ParaMedicosPage: React.FC = () => {
  const t = useTheme();
  const navigate = useNavigate();
  const dark = t.palette.mode === 'dark';
  const isMobile = useMediaQuery(t.breakpoints.down('sm'));

  // Preserva o callback OAuth do Meet: o server volta em #/para-medicos?meet=ok|erro
  // (DoctorPortal.tsx trata + limpa o hash). Repassa pro portal ANTES de vender nada.
  // OAuth = full page load (mount); hashchange cobre o caso raro de troca de rota in-app.
  useEffect(() => {
    const pass = () => {
      const m = window.location.hash.match(/[?&]meet=(ok|erro)/);
      if (m) navigate(`/doctor?meet=${m[1]}`, { replace: true });
    };
    pass();
    window.addEventListener('hashchange', pass);
    return () => window.removeEventListener('hashchange', pass);
  }, [navigate]);

  const scrollTo = (id: string) => () => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };

  // Base "spotlit": campo teal radial sobre escuro — momento assinatura nos 2 temas.
  const spotlit = {
    background: `radial-gradient(ellipse 90% 65% at 50% -12%, ${alpha(TEAL, 0.3)}, transparent 62%), linear-gradient(180deg, #0c1d1c 0%, #0f1818 100%)`,
  } as const;

  const trustChip = (label: string, key: string) => (
    <Chip
      key={key}
      size="small"
      variant="outlined"
      sx={{ borderRadius: '10px', fontWeight: 600, borderColor: alpha('#ffffff', 0.22), color: 'rgba(232,238,240,0.82)', '& .MuiChip-icon': { color: TEAL_LIGHT } }}
      icon={<LockOutlinedIcon sx={{ fontSize: 15 }} />}
      label={label}
    />
  );

  return (
    <Box sx={{ overflowX: 'hidden', width: '100%', minHeight: '100dvh', bgcolor: 'background.default' }}>
      {/* ---------- Navbar mínima ---------- */}
      <Box component="header" sx={{
        position: 'sticky', top: 0, zIndex: 20, px: 2, py: 1.25,
        bgcolor: dark ? 'rgba(15,24,24,0.72)' : 'rgba(255,255,255,0.75)',
        backdropFilter: 'blur(16px) saturate(160%)', WebkitBackdropFilter: 'blur(16px) saturate(160%)',
        borderBottom: '1px solid', borderColor: 'divider',
      }}>
        <Container maxWidth="lg" sx={{ px: '0 !important', display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <DrExame size={isMobile ? 30 : 34} />
          <Typography sx={{ fontFamily: (th: Theme) => th.typography.h6.fontFamily, fontWeight: 800, fontSize: { xs: 16, sm: 17 } }}>
            Dr. Exame
          </Typography>
          <Chip
            size="small"
            sx={{ borderRadius: '10px', fontWeight: 700, color: tealText(t.palette.mode), bgcolor: alpha(TEAL, dark ? 0.14 : 0.1), '& .MuiChip-label': { px: 1.25 } }}
            label="Para médicos"
          />
          <Box sx={{ flex: 1 }} />
          <Button
            size="small"
            onClick={scrollTo('planos')}
            sx={{ minHeight: 40, borderRadius: '12px', fontWeight: 700, color: 'text.primary' }}
          >
            Planos
          </Button>
          <Button
            size="small"
            onClick={() => navigate('/entrar/medico')}
            sx={{ minHeight: 40, borderRadius: '12px', fontWeight: 700 }}
          >
            Entrar
          </Button>
        </Container>
      </Box>

      {/* ---------- 1. HERO SPOTLIT + CONSOLE DO PORTAL ---------- */}
      <Box sx={{ ...spotlit, color: '#e8eef0', px: 2, pt: { xs: 7, sm: 10, md: 12 }, pb: { xs: 8, sm: 10 } }}>
        <Container maxWidth="lg" sx={{ px: '0 !important' }}>
          <Box sx={{ maxWidth: 760, mx: 'auto', textAlign: 'center', animation: 'pmFadeUp .7s cubic-bezier(.22,1,.36,1) both', ...HERO_IN }}>
            <Chip
              size="small"
              sx={{ mb: 3, borderRadius: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: 11.5, color: '#d4a574', bgcolor: alpha(COPPER.main, 0.16), border: `1px solid ${alpha(COPPER.main, 0.35)}`, '& .MuiChip-label': { px: 1.5, py: 0.25 } }}
              label="Consulta online · PIX embutido"
            />
            <Typography variant="h1" sx={{ fontSize: { xs: '2.15rem', sm: '2.9rem', md: '3.4rem' }, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.08, mb: 2.5, color: '#fff', fontFamily: "'Poppins',sans-serif" }}>
              A consulta termina,{' '}
              <Box component="span" sx={{ color: TEAL_LIGHT }}>o PIX já chegou.</Box>{' '}
              <Box component="span" sx={{ ...SERIF_I, color: '#d4a574', fontSize: '1.06em' }}>E o prontuário se escreveu.</Box>
            </Typography>
            <Typography variant="body1" sx={{ fontSize: { xs: 16, sm: 17.5 }, lineHeight: 1.7, mb: 3.5, maxWidth: 620, mx: 'auto', color: 'rgba(232,238,240,0.78)' }}>
              O paciente sobe os exames, a IA organiza o que importa e o portal prepara tudo antes de você
              atender: <b style={{ color: '#fff' }}>brief clínico</b>, agenda, cobrança e repasse —{' '}
              <Box component="span" sx={{ ...SERIF_I, fontSize: '1.08em' }}>um console só.</Box>
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="center" sx={{ mb: 3 }}>
              <Button
                variant="contained" size="large" endIcon={<ArrowForwardIcon />}
                onClick={() => navigate('/doctor?mode=register')}
                sx={{ minHeight: 50, px: 3.5, fontSize: 15.5, borderRadius: '14px', background: `linear-gradient(135deg,${TEAL},${TEAL_DEEP})`, boxShadow: `0 12px 32px ${alpha(TEAL, 0.35)}` }}
              >
                Começar com meu CRM
              </Button>
              <Button
                variant="outlined" size="large"
                onClick={scrollTo('como-funciona')}
                endIcon={<ArrowDownwardIcon />}
                sx={{ minHeight: 50, px: 3, fontSize: 15.5, borderRadius: '14px', borderColor: alpha('#ffffff', 0.3), color: '#fff', '&:hover': { borderColor: TEAL_LIGHT, bgcolor: alpha(TEAL, 0.1) } }}
              >
                Ver o portal funcionando
              </Button>
            </Stack>
            <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" useFlexGap>
              {trustChip('CRM validado antes de atender', 't1')}
              {trustChip('Repasse automático · Asaas', 't2')}
              {trustChip('Res. CFM 2.454/2026', 't3')}
            </Stack>
          </Box>
          <Reveal delay={150}>
            <Box sx={{ maxWidth: 940, mx: 'auto', mt: { xs: 5, md: 6 } }}>
              <HeroConsole />
            </Box>
          </Reveal>
        </Container>
      </Box>

      {/* ---------- 2. Selos — quem sustenta a operação ---------- */}
      <Box sx={{ py: { xs: 4, sm: 5 }, px: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Container maxWidth="lg" sx={{ px: '0 !important' }}>
          <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mb: 2, color: 'text.secondary', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>
            Pagamento e prática regulados
          </Typography>
          <Stack direction="row" justifyContent="center" flexWrap="wrap" useFlexGap spacing={{ xs: 1.5, sm: 3 }}>
            {['PIX via Asaas · Banco Central', 'Telemedicina · CFM 2.314/2022', 'IA registrada · CFM 2.454/2026', 'LGPD por padrão'].map((s) => (
              <Stack key={s} direction="row" spacing={0.75} alignItems="center">
                <WorkspacePremiumOutlinedIcon sx={{ fontSize: 17, color: copperText(t.palette.mode) }} />
                <Typography sx={{ fontWeight: 700, fontSize: 14, color: 'text.secondary' }}>{s}</Typography>
              </Stack>
            ))}
          </Stack>
        </Container>
      </Box>

      {/* ---------- 3. Como funciona — console vivo por cue ---------- */}
      <Section id="como-funciona">
        <SectionTitle sub="Cada aba abaixo é o portal de verdade — não é print. O caminho inteiro cabe num intervalo de café.">
          Do CRM ao PIX em <Box component="span" sx={{ ...SERIF_I, color: tealText(t.palette.mode) }}>três deixa</Box>
        </SectionTitle>
        <HowItWorksCues />
      </Section>

      {/* ---------- 4. Bento — quatro atos, um portal ---------- */}
      <Section sx={{ bgcolor: dark ? alpha('#ffffff', 0.02) : alpha(TEAL, 0.035) }}>
        <SectionTitle sub="Tudo no mesmo lugar que o paciente já usa — sem planilha, sem maquininha, sem pilha de PDF.">
          Quatro atos, <Box component="span" sx={{ ...SERIF_I, color: tealText(t.palette.mode) }}>um portal</Box>
        </SectionTitle>
        <Grid sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2.5 }}>
          <ActCard
            delay={0}
            icon={<FactCheckOutlinedIcon sx={{ fontSize: 24 }} />}
            title="Brief clínico antes de entrar"
            metric="~30s"
            metricLabel="de leitura"
            strong="Os valores alterados do SEU paciente em destaque, com o contexto do histórico."
            soft="Glicose, TSH, colesterol — o que saiu da faixa, organizado por relevância. Trinta segundos em vez de dez páginas de PDF."
          />
          <ActCard
            delay={90}
            icon={<EditNoteIcon sx={{ fontSize: 24 }} />}
            title="Transcrição + SOAP com carimbo de IA"
            metric="12.451"
            metricLabel="códigos CID-10"
            strong="A consulta termina e o rascunho do prontuário está pronto; você revisa e aprova."
            soft="O áudio vira texto, o texto vira SOAP e o uso de IA como apoio fica registrado no documento (Res. CFM 2.454/2026) — na base oficial DATASUS."
          />
          <ActCard
            delay={180}
            icon={<PixIcon sx={{ fontSize: 24 }} />}
            title="PIX embutido na consulta"
            metric="R$ 96"
            metricLabel="por consulta de R$ 120"
            strong="Cobrança disparada junto com o agendamento, repasse automático."
            soft="Sem maquininha, sem fila, sem «depois eu te mando». Você define o valor; o paciente paga no card da consulta."
          />
          <ActCard
            delay={270}
            icon={<TravelExploreRoundedIcon sx={{ fontSize: 24 }} />}
            title="Pacientes te encontram"
            metric="CNES"
            metricLabel="base oficial"
            strong="Médicos com portal ativo aparecem na busca Encontrar especialistas do app."
            soft="Para o paciente que ainda não tem um médico — descoberta, não marketplace: ninguém compra posição, quem te escolhe é o paciente."
          />
        </Grid>
      </Section>

      {/* ---------- 5. Calculadora ---------- */}
      <Section>
        <SectionTitle sub="Mova o slider e veja o que muda no seu mês.">
          Quanto você <Box component="span" sx={{ ...SERIF_I, color: copperText(t.palette.mode) }}>deixa na mesa</Box> hoje?
        </SectionTitle>
        <Reveal><Calculator /></Reveal>
      </Section>

      {/* ---------- 6. Números do sistema (todos reais e verificáveis) ---------- */}
      <Box sx={{ py: { xs: 6, sm: 8 }, px: 2, bgcolor: dark ? alpha('#ffffff', 0.02) : alpha(TEAL, 0.035), borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Container maxWidth="lg" sx={{ px: '0 !important' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="center" alignItems={{ sm: 'stretch' }} spacing={{ xs: 3.5, sm: 2 }} flexWrap="wrap" useFlexGap>
            <StatCounter value={12451} label="códigos CID-10" sub="base oficial DATASUS no prontuário" />
            <StatCounter value={96} prefix="R$ " label="líquidos por consulta" sub="em R$ 120 cobrados — taxa de 20% só quando você recebe" />
            <StatCounter value={5} decimals={1} label="na Google Play" sub="o app que seus pacientes já usam" />
          </Stack>
        </Container>
      </Box>

      {/* ---------- 7. Seus pacientes continuam seus ---------- */}
      <Section>
        <Reveal>
          <Card elevation={0} sx={{
            borderRadius: '20px', position: 'relative', overflow: 'hidden',
            background: dark
              ? `linear-gradient(135deg, ${alpha('#0f3d3a', 0.55)}, ${alpha('#1a2424', 0.9)})`
              : `linear-gradient(135deg, ${alpha(TEAL, 0.08)}, ${alpha(COPPER.main, 0.07)})`,
            border: '1px solid', borderColor: dark ? '#2a3636' : alpha(TEAL, 0.18),
          }}>
            <CardContent sx={{ p: { xs: 3.5, sm: 6 }, textAlign: 'center', maxWidth: 720, mx: 'auto' }}>
              <VerifiedUserOutlinedIcon sx={{ fontSize: 40, color: tealText(t.palette.mode), mb: 1.5 }} />
              <Typography variant="h3" sx={{ fontSize: { xs: '1.5rem', sm: '1.75rem' }, mb: 1.5 }}>
                Seus pacientes continuam seus
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 560, mx: 'auto', mb: 3 }}>
                O Dr. Exame é sua ferramenta, não concorre com você: quem chega até você vem por convite.
                E médicos com portal ativo aparecem na busca <b>Encontrar especialistas</b> do app —
                para o paciente que ainda não tem um médico.
              </Typography>
              <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" useFlexGap>
                <Chip icon={<GppGoodOutlinedIcon />} label="Não somos marketplace" variant="outlined" sx={{ borderRadius: '10px', fontWeight: 600, borderColor: 'divider', '& .MuiChip-icon': { color: tealText(t.palette.mode) } }} />
                <Chip icon={<CalendarMonthIcon />} label="Agenda é sua" variant="outlined" sx={{ borderRadius: '10px', fontWeight: 600, borderColor: 'divider', '& .MuiChip-icon': { color: tealText(t.palette.mode) } }} />
                <Chip icon={<ShareIcon />} label="Paciente quem convida" variant="outlined" sx={{ borderRadius: '10px', fontWeight: 600, borderColor: 'divider', '& .MuiChip-icon': { color: tealText(t.palette.mode) } }} />
                <Chip icon={<TravelExploreRoundedIcon />} label="Você aparece na busca do app" variant="outlined" sx={{ borderRadius: '10px', fontWeight: 600, borderColor: 'divider', '& .MuiChip-icon': { color: tealText(t.palette.mode) } }} />
              </Stack>
            </CardContent>
          </Card>
        </Reveal>
      </Section>

      {/* ---------- 8. Convide seus pacientes com 1 link ---------- */}
      <Section id="convite">
        <SectionTitle sub="Seu paciente recebe o convite, cria a conta e já entra compartilhando os exames com você. Zero atrito.">
          Convide seus pacientes com <Box component="span" sx={{ ...SERIF_I, color: tealText(t.palette.mode) }}>1 link</Box>
        </SectionTitle>
        <Grid sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 4 }}>
          <Passo n={1} delay={0} title="Gere o convite no portal" desc="Um link por paciente, com escopos claros (exames, evolução, alertas) e validade de 14 dias." />
          <Passo n={2} delay={90} title="Paciente cria a conta" desc="Quem recebe o convite entra com a conta pronta e o compartilhamento já aceito — sem pendência, sem impresso." />
          <Passo n={3} delay={180} title="Exames já na sua tela" desc="O histórico chega organizado no seu painel, com o brief clínico pronto antes da consulta." />
        </Grid>
      </Section>

      {/* ---------- 9. Confiança ---------- */}
      <Section>
        <SectionTitle sub="Saúde é dado sensível. A arquitetura inteira foi desenhada por aí.">Compliance e confiança</SectionTitle>
        <Grid sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2.5 }}>
          <ConfiancaItem
            delay={0}
            icon={<GppGoodOutlinedIcon sx={{ fontSize: 22 }} />}
            title="CFM 2.314/2022"
            desc="Telemedicina conforme a resolução vigente. Consentimento explícito do paciente registrado no Art. 15 antes de qualquer consulta."
          />
          <ConfiancaItem
            delay={90}
            icon={<LockOutlinedIcon sx={{ fontSize: 22 }} />}
            title="LGPD por padrão"
            desc="Dado sensível cifrado em repouso (pgcrypto). Áudio efêmero: apagado assim que a transcrição termina."
          />
          <ConfiancaItem
            delay={180}
            icon={<PixIcon sx={{ fontSize: 22 }} />}
            title="PIX via Asaas"
            desc="Cobrança e repasse processados por instituição de pagamento regulada pelo Banco Central."
          />
        </Grid>
      </Section>

      {/* ---------- 10. Pricing ---------- */}
      <Section id="planos" sx={{ bgcolor: dark ? alpha('#ffffff', 0.02) : alpha(TEAL, 0.035) }}>
        <SectionTitle sub="Comece grátis. Assine só quando o PIX compensar sozinho.">Planos simples</SectionTitle>
        <Grid sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2.5, maxWidth: 820, mx: 'auto' }}>
          {/* Grátis */}
          <Reveal delay={0} sx={{ height: '100%' }}>
            <Card elevation={0} sx={{ height: '100%', borderRadius: '20px', display: 'flex', flexDirection: 'column' }}>
              <CardContent sx={{ p: { xs: 3, sm: 4 }, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <Typography sx={{ fontFamily: (th: Theme) => th.typography.h6.fontFamily, fontWeight: 700, mb: 0.5 }}>Grátis</Typography>
                <Box sx={{ mb: 2.5 }}>
                  <Box component="span" sx={{ fontFamily: (th: Theme) => th.typography.h4.fontFamily, fontWeight: 800, fontSize: '2rem' }}>R$ 0</Box>
                </Box>
                <Stack spacing={1.25} sx={{ mb: 3.5, flex: 1 }}>
                  {['Brief clínico dos exames compartilhados', 'Agenda de consultas', 'Cobrança PIX por consulta (taxa 20%)', 'Perguntas dos pacientes'].map((f) => (
                    <Stack key={f} direction="row" spacing={1} alignItems="flex-start">
                      <CheckIcon sx={{ fontSize: 18, mt: 0.25, color: tealText(t.palette.mode) }} />
                      <Typography variant="body2">{f}</Typography>
                    </Stack>
                  ))}
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>brief, agenda, cobrança — comece hoje</Typography>
                <Button variant="outlined" color="inherit" size="large" onClick={() => navigate('/doctor?mode=register')} sx={{ minHeight: 46, borderColor: 'divider', color: 'text.primary', '&:hover': { borderColor: alpha(TEAL, 0.5), bgcolor: alpha(TEAL, 0.06) } }}>
                  Criar conta grátis
                </Button>
              </CardContent>
            </Card>
          </Reveal>
          {/* Pro */}
          <Reveal delay={90} sx={{ height: '100%' }}>
            <Card elevation={0} sx={{
              height: '100%', borderRadius: '20px', position: 'relative', display: 'flex', flexDirection: 'column',
              border: `1.5px solid ${COPPER.main}`,
              boxShadow: dark
                ? `0 2px 10px rgba(0,0,0,.35), 0 10px 30px ${alpha(COPPER.main, 0.08)}`
                : `0 2px 8px rgba(15,61,58,.04), 0 12px 32px ${alpha(COPPER.main, 0.14)}`,
            }}>
              <Chip
                size="small"
                sx={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', bgcolor: `linear-gradient(135deg, ${COPPER.main}, ${COPPER.deep})`, color: '#fff', fontWeight: 700, borderRadius: '10px', boxShadow: `0 4px 12px ${alpha(COPPER.main, 0.4)}` }}
                label="Recomendado"
              />
              <CardContent sx={{ p: { xs: 3, sm: 4 }, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }}>
                  <Typography sx={{ fontFamily: (th: Theme) => th.typography.h6.fontFamily, fontWeight: 700 }}>Dr. Exame Pro</Typography>
                  <AutoAwesomeIcon sx={{ fontSize: 17, color: copperText(t.palette.mode) }} />
                </Stack>
                <Box sx={{ mb: 2.5 }}>
                  <Box component="span" sx={{ fontFamily: (th: Theme) => th.typography.h4.fontFamily, fontWeight: 800, fontSize: '2rem' }}>R$ 29,90</Box>
                  <Box component="span" color="text.secondary" sx={{ fontSize: 15 }}>/mês</Box>
                </Box>
                <Stack spacing={1.25} sx={{ mb: 3.5, flex: 1 }}>
                  {['Tudo do plano Grátis', 'Pré-consulta ilimitada (brief + histórico)', 'SOAP da transcrição com revisão', 'Export do prontuário (PDF)'].map((f) => (
                    <Stack key={f} direction="row" spacing={1} alignItems="flex-start">
                      <CheckIcon sx={{ fontSize: 18, mt: 0.25, color: copperText(t.palette.mode) }} />
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{f}</Typography>
                    </Stack>
                  ))}
                </Stack>
                <Button variant="contained" size="large" endIcon={<ArrowForwardIcon />} onClick={() => navigate('/doctor?mode=register')} sx={{ minHeight: 46, fontSize: 15 }}>
                  Testar o Pro
                </Button>
              </CardContent>
            </Card>
          </Reveal>
        </Grid>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', maxWidth: 640, mx: 'auto', mt: 3, lineHeight: 1.65 }}>
          Como a cobrança funciona: você define o valor da consulta e o paciente paga por PIX —
          no Grátis a plataforma retém <b>20% só quando você recebe</b> (R$ 120 vira R$ 96, repasse
          automático via Asaas). O Pro soma as ferramentas de prontuário por R$ 29,90/mês.
          Regra prática: comece grátis hoje; quando o brief e o SOAP estiverem devolvendo tempo
          entre consultas, o Pro se paga sozinho.
        </Typography>
        <Stack direction="row" spacing={1.5} justifyContent="center" flexWrap="wrap" useFlexGap sx={{ mt: 2.5 }}>
          {['Comece grátis', 'Sem cartão', 'Sem fidelidade', 'Cancele quando quiser'].map((s) => (
            <Stack key={s} direction="row" spacing={0.6} alignItems="center">
              <CheckIcon sx={{ fontSize: 15, color: tealText(t.palette.mode) }} />
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>{s}</Typography>
            </Stack>
          ))}
        </Stack>
      </Section>

      {/* ---------- 11. FAQ médico ---------- */}
      <Section id="faq">
        <SectionTitle sub="O que médico pergunta antes de entrar — respondido sem rodeio.">
          Perguntas frequentes de <Box component="span" sx={{ ...SERIF_I, color: tealText(t.palette.mode) }}>médicos</Box>
        </SectionTitle>
        <Box sx={{ maxWidth: 720, mx: 'auto' }}>
          {FAQ_ITEMS.map((f, i) => (
            <Accordion key={f.q} defaultExpanded={i === 0} elevation={0} disableGutters sx={{
              mb: 1.25, borderRadius: '16px !important', overflow: 'hidden',
              border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper',
              '&:before': { display: 'none' },
            }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: { xs: 2, sm: 2.5 }, minHeight: 56, '& .MuiAccordionSummary-content': { my: 1 } }}>
                <Typography sx={{ fontWeight: 700, fontSize: 15.5 }}>{f.q}</Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ px: { xs: 2, sm: 2.5 }, pb: 2.5, pt: 0 }}>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>{f.a}</Typography>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      </Section>

      {/* ---------- 12. CTA final — spotlit ---------- */}
      <Box sx={{ ...spotlit, color: '#e8eef0', px: 2, py: { xs: 8, sm: 11 }, overflow: 'hidden' }}>
        <Container maxWidth="sm" sx={{ px: '0 !important', textAlign: 'center' }}>
          <DrExame size={64} sx={{ mx: 'auto', mb: 2.5 }} />
          <Typography variant="h3" sx={{ mb: 1.5, color: '#fff', fontFamily: "'Poppins',sans-serif", fontWeight: 800, letterSpacing: '-0.02em' }}>
            Traga a próxima consulta <Box component="span" sx={{ ...SERIF_I, color: TEAL_LIGHT, fontSize: '1.08em' }}>pra cá.</Box>
          </Typography>
          <Typography variant="body1" sx={{ mb: 3.5, color: 'rgba(232,238,240,0.78)' }}>
            Crie sua conta com CRM em minutos. Seus pacientes já podem estar compartilhando exames hoje.
          </Typography>
          <Button variant="contained" size="large" endIcon={<ArrowForwardIcon />} onClick={() => navigate('/doctor?mode=register')} sx={{ minHeight: 50, px: 4, fontSize: 16, borderRadius: '14px', background: `linear-gradient(135deg,${TEAL},${TEAL_DEEP})`, boxShadow: `0 12px 32px ${alpha(TEAL, 0.35)}` }}>
            Começar com meu CRM
          </Button>
          <Typography variant="caption" sx={{ display: 'block', mt: 2, color: 'rgba(232,238,240,0.6)' }}>
            Comece grátis · Sem cartão · Sem fidelidade
          </Typography>
        </Container>
      </Box>

      <Box component="footer" sx={{ px: 2, py: 3.5, borderTop: '1px solid', borderColor: 'divider' }}>
        <Container maxWidth="lg" sx={{ px: '0 !important', display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center', justifyContent: 'space-between' }}>
          <Stack direction="row" spacing={1.25} alignItems="center">
            <DrExame size={22} />
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>© 2026 Dr. Exame · sua ferramenta clínica, não seu concorrente</Typography>
          </Stack>
          <Stack direction="row" spacing={2.5}>
            <Typography
              component="a" variant="caption" color="text.secondary" href="#/termos"
              sx={{ fontWeight: 600, textDecoration: 'none', '&:hover': { color: tealText(t.palette.mode) } }}
            >
              Termos
            </Typography>
            <Typography
              component="a" variant="caption" color="text.secondary" href="#/faq"
              sx={{ fontWeight: 600, textDecoration: 'none', '&:hover': { color: tealText(t.palette.mode) } }}
            >
              Dúvidas
            </Typography>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
};
