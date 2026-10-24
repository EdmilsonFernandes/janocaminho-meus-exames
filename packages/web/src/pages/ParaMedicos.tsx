import { useEffect, useMemo, useState } from 'react';
import { Box, Container, Typography, Button, Card, CardContent, Chip, Stack, Slider, MenuItem, TextField, Avatar, useTheme, alpha } from '@mui/material';
import type { Theme } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import { DrExame } from '../components/DrExame';
import { Reveal } from '../components/Reveal';
import { tealText, copperText, dangerText, COPPER } from '../theme';
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

const TEAL = '#20b2aa';
/** Box com display:grid — substitui MuiGrid (alias local no topo: componente usa em JSX). */
const Grid = Box;

const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

/** Entrada suave do hero — desligada em prefers-reduced-motion. */
const HERO_IN = {
  '@keyframes pmFadeUp': {
    from: { opacity: 0, transform: 'translateY(24px)' },
    to: { opacity: 1, transform: 'translateY(0)' },
  },
  '@media (prefers-reduced-motion: reduce)': { animation: 'none !important' },
} as const;

const Section = ({ children, id, sx }: { children: React.ReactNode; id?: string; sx?: any }) => (
  <Box component="section" id={id} sx={{ py: { xs: 7, sm: 10, md: 12 }, px: 2, scrollMarginTop: 72, ...sx }}>
    <Container maxWidth="lg" sx={{ px: '0 !important' }}>{children}</Container>
  </Box>
);

const SectionTitle = ({ children, sub }: { children: React.ReactNode; sub?: string }) => (
  <Box sx={{ maxWidth: 640, mb: { xs: 4, sm: 5 }, mx: 'auto', textAlign: 'center' }}>
    <Typography variant="h3" component="h2" sx={{ mb: sub ? 1.5 : 0 }}>{children}</Typography>
    {sub && <Typography variant="body1" color="text.secondary">{sub}</Typography>}
  </Box>
);

// ---------------------------------------------------------------------------
// Mockup estático do Brief Clínico (MUI puro, sem imagem) — chips vermelho/azul
// de valores alterados + normais, como o médico vê antes de atender.
// ---------------------------------------------------------------------------
const BriefMock = () => {
  const t = useTheme();
  const dark = t.palette.mode === 'dark';
  const item = (label: string, value: string, dir: 'up' | 'down' | 'ok') => {
    const color = dir === 'ok' ? (dark ? '#94a3b8' : '#64748b') : dir === 'up' ? dangerText(t.palette.mode) : dark ? '#38bdf8' : '#0284c7';
    const bg = dir === 'ok' ? alpha(color, 0.08) : alpha(color, 0.12);
    return (
      <Chip
        size="small"
        sx={{
          m: 0.5, borderRadius: '10px', fontWeight: 600, fontSize: 13,
          color, bgcolor: bg,
          '& .MuiChip-label': { px: 1.25 },
        }}
        label={
          <Stack direction="row" spacing={0.6} alignItems="center">
            <Box component="span">{label}</Box>
            <Box component="span" sx={{ fontWeight: 800 }}>{value}</Box>
            {dir === 'up' && <TrendingUpIcon sx={{ fontSize: 15 }} />}
            {dir === 'down' && <TrendingDownIcon sx={{ fontSize: 15 }} />}
            {dir === 'ok' && <CheckIcon sx={{ fontSize: 14 }} />}
          </Stack>
        }
      />
    );
  };
  return (
    <Card elevation={0} sx={{ borderRadius: '20px', overflow: 'visible', maxWidth: 460, width: '100%', mx: 'auto' }}>
      <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
          <Avatar sx={{ bgcolor: alpha(TEAL, 0.14), color: tealText(t.palette.mode), width: 44, height: 44, fontWeight: 800 }}>AR</Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontFamily: (th: Theme) => th.typography.h6.fontFamily, fontWeight: 700, fontSize: 16 }}>Ana R., 42</Typography>
            <Typography variant="caption" color="text.secondary">Últimos exames: 14/10/2026 · 5 documentos</Typography>
          </Box>
          <Chip
            size="small"
            sx={{ bgcolor: 'linear-gradient(135deg,#20b2aa,#178f89)', color: '#fff', fontWeight: 700, borderRadius: '10px', '& .MuiChip-label': { px: 1.25 } }}
            label={<Stack direction="row" spacing={0.5} alignItems="center"><AutoAwesomeIcon sx={{ fontSize: 15 }} /><Box component="span" sx={{ fontSize: 12 }}>Brief clínico</Box></Stack>}
          />
        </Stack>
        <Box sx={{ mx: -0.5, mb: 1.5 }}>
          {item('Glicose', '118 mg/dL', 'up')}
          {item('TSH', '4,8 µUI/mL', 'up')}
          {item('Vitamina D', '22 ng/mL', 'down')}
          {item('Hemoglobina', '13,9 g/dL', 'ok')}
          {item('Colesterol total', '212 mg/dL', 'up')}
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary">3 alterados · 14 normais</Typography>
          <Chip size="small" variant="outlined" sx={{ borderRadius: '10px', color: copperText(t.palette.mode), borderColor: alpha(COPPER.main, 0.4), fontWeight: 700 }} label="Pronto p/ consulta" />
        </Stack>
      </CardContent>
    </Card>
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

const DiferencialCard = ({ icon, title, strong, soft, delay }: { icon: React.ReactNode; title: string; strong: string; soft: string; delay: number }) => {
  const t = useTheme();
  return (
    <Reveal delay={delay}>
      <Card elevation={0} sx={{ height: '100%', borderRadius: '20px' }}>
        <CardContent sx={{ p: { xs: 3, sm: 3.5 }, height: '100%' }}>
          <Box sx={{
            width: 52, height: 52, borderRadius: '16px', display: 'grid', placeItems: 'center', mb: 2.5,
            background: `linear-gradient(135deg, ${alpha(TEAL, 0.16)}, ${alpha(COPPER.main, 0.12)})`,
            color: tealText(t.palette.mode),
          }}>{icon}</Box>
          <Typography sx={{ fontFamily: (th: Theme) => th.typography.h6.fontFamily, fontWeight: 700, fontSize: 17, mb: 1 }}>{title}</Typography>
          <Typography sx={{ fontWeight: 600, mb: 0.75, fontSize: 15 }}>{strong}</Typography>
          <Typography variant="body2" color="text.secondary">{soft}</Typography>
        </CardContent>
      </Card>
    </Reveal>
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

  // Orbes decorativos do hero (blur teal/cobre) — puro visual, some no reduced-motion? Não: são estáticos, sem animação.
  const orb = (c: string, extra: any): any => ({
    position: 'absolute', width: { xs: 260, md: 420 }, height: { xs: 260, md: 420 }, borderRadius: '50%',
    filter: 'blur(90px)', opacity: dark ? 0.16 : 0.13, pointerEvents: 'none', background: c, ...extra,
  });

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
            onClick={() => navigate('/entrar/medico')}
            sx={{ minHeight: 40, borderRadius: '12px', fontWeight: 700 }}
          >
            Entrar
          </Button>
        </Container>
      </Box>

      {/* ---------- 1. Hero ---------- */}
      <Box sx={{ position: 'relative', px: 2, pt: { xs: 6, sm: 9, md: 11 }, pb: { xs: 7, sm: 9 } }}>
        <Box sx={orb(TEAL, { top: -80, left: -100 })} />
        <Box sx={orb(COPPER.main, { bottom: -140, right: -120 })} />
        <Container maxWidth="lg" sx={{ px: '0 !important', position: 'relative' }}>
          <Grid sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.05fr 0.95fr' }, gap: { xs: 5, md: 7 }, alignItems: 'center' }}>
            <Box sx={{ animation: 'pmFadeUp .7s cubic-bezier(.22,1,.36,1) both', ...HERO_IN, maxWidth: 560, mx: { xs: 'auto', md: 0 }, textAlign: { xs: 'center', md: 'left' } }}>
              <Chip
                size="small"
                sx={{ mb: 2.5, borderRadius: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: 11.5, color: copperText(t.palette.mode), bgcolor: alpha(COPPER.main, dark ? 0.15 : 0.13), '& .MuiChip-label': { px: 1.5, py: 0.25 } }}
                label="Para médicos"
              />
              <Typography variant="h1" sx={{ fontSize: { xs: '2rem', sm: '2.35rem', md: '2.5rem' }, mb: 2.5 }}>
                Sua consulta com <Box component="span" sx={{ color: tealText(t.palette.mode) }}>PIX embutido</Box> e um prontuário que se prepara sozinho
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ fontSize: { xs: 16, sm: 17 }, mb: 3.5, maxWidth: 480, mx: { xs: 'auto', md: 0 } }}>
                O paciente sobe os exames. A IA organiza o que importa. Você atende, cobra e recebe — tudo no Dr. Exame.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent={{ xs: 'center', md: 'flex-start' }} sx={{ mb: 3 }}>
                <Button
                  variant="contained" size="large" endIcon={<ArrowForwardIcon />}
                  onClick={() => navigate('/entrar/medico')}
                  sx={{ minHeight: 48, px: 3, fontSize: 15.5 }}
                >
                  Começar com meu CRM
                </Button>
                <Button
                  variant="outlined" size="large" color="inherit"
                  onClick={scrollTo('como-funciona')}
                  sx={{ minHeight: 48, px: 3, fontSize: 15.5, borderColor: 'divider', color: 'text.primary', '&:hover': { borderColor: alpha(TEAL, 0.5), bgcolor: alpha(TEAL, 0.06) } }}
                >
                  Ver como funciona
                </Button>
              </Stack>
              <Stack direction="row" spacing={1.25} alignItems="center" justifyContent={{ xs: 'center', md: 'flex-start' }}>
                <AutoAwesomeIcon sx={{ fontSize: 18, color: tealText(t.palette.mode) }} />
                <Typography variant="body2" color="text.secondary">Brief clínico gerado pela IA ✨ — você revisa, a IA não decide</Typography>
              </Stack>
            </Box>
            <Reveal delay={120} sx={{ mx: { xs: 'auto', md: 0 }, width: { xs: '100%', md: 'auto' }, maxWidth: 480 }}>
              <BriefMock />
            </Reveal>
          </Grid>
        </Container>
      </Box>

      {/* ---------- 2. Três diferenciais ---------- */}
      <Section>
        <SectionTitle sub="Menos burocracia entre você e o paciente. Só isso — dito assim porque é assim.">
          Três coisas que o Dr. Exame faz por você
        </SectionTitle>
        <Grid sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2.5 }}>
          <DiferencialCard
            delay={0}
            icon={<FactCheckOutlinedIcon sx={{ fontSize: 26 }} />}
            title="Brief clínico"
            strong="Os valores alterados do SEU paciente em destaque antes de você atender."
            soft="Glicose, TSH, colesterol — o que saiu da faixa, organizado por relevância. Trinta segundos de leitura em vez de dez páginas de PDF."
          />
          <DiferencialCard
            delay={90}
            icon={<EditNoteIcon sx={{ fontSize: 26 }} />}
            title="Transcrição + Resumo IA"
            strong="A consulta termina e o rascunho do prontuário está pronto; você revisa e aprova."
            soft="O áudio vira texto e o texto vira SOAP. Nada sai do seu consultório sem o seu ok."
          />
          <DiferencialCard
            delay={180}
            icon={<PixIcon sx={{ fontSize: 26 }} />}
            title="PIX na consulta"
            strong="R$ 120 vira R$ 96 no seu PIX, repasse automático."
            soft="Cobrança disparada junto com o agendamento. Sem maquininha, sem fila, sem 'depois eu te mando'."
          />
        </Grid>
      </Section>

      {/* ---------- 3. Calculadora ---------- */}
      <Section sx={{ bgcolor: dark ? alpha('#ffffff', 0.02) : alpha(TEAL, 0.035) }}>
        <SectionTitle sub="Mova o slider e veja o que muda no seu mês.">
          Quanto você deixa na mesa hoje?
        </SectionTitle>
        <Reveal><Calculator /></Reveal>
      </Section>

      {/* ---------- 4. Seus pacientes continuam seus ---------- */}
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
                O Dr. Exame é sua ferramenta, não concorre com você: não listamos médicos, não direcionamos pacientes.
              </Typography>
              <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" useFlexGap>
                <Chip icon={<GppGoodOutlinedIcon />} label="Não somos marketplace" variant="outlined" sx={{ borderRadius: '10px', fontWeight: 600, borderColor: 'divider', '& .MuiChip-icon': { color: tealText(t.palette.mode) } }} />
                <Chip icon={<CalendarMonthIcon />} label="Agenda é sua" variant="outlined" sx={{ borderRadius: '10px', fontWeight: 600, borderColor: 'divider', '& .MuiChip-icon': { color: tealText(t.palette.mode) } }} />
                <Chip icon={<ShareIcon />} label="Paciente quem convida" variant="outlined" sx={{ borderRadius: '10px', fontWeight: 600, borderColor: 'divider', '& .MuiChip-icon': { color: tealText(t.palette.mode) } }} />
              </Stack>
            </CardContent>
          </Card>
        </Reveal>
      </Section>

      {/* ---------- 5. Como funciona ---------- */}
      <Section id="como-funciona" sx={{ bgcolor: dark ? alpha('#ffffff', 0.02) : alpha(TEAL, 0.035) }}>
        <SectionTitle sub="Do cadastro ao PIX em três passos — sem instalar nada, roda no navegador.">Como funciona</SectionTitle>
        <Grid sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 4 }}>
          <Passo n={1} delay={0} title="Crie a conta com CRM" desc="Validamos seu registro e sua área fica pronta em minutos. Sem contrato, sem fidelidade." />
          <Passo n={2} delay={90} title="Paciente compartilha os exames" desc="Seu paciente sobe PDFs no app dele e compartilha com você — um clique, com consentimento registrado." />
          <Passo n={3} delay={180} title="Atenda com brief, transcrição e PIX" desc="Chegue sabendo o que está alterado, grave com uma permissão e receba no PIX no mesmo fluxo." />
        </Grid>
        <Box sx={{ textAlign: 'center', mt: 5 }}>
          <Button variant="contained" size="large" endIcon={<ArrowForwardIcon />} onClick={() => navigate('/entrar/medico')} sx={{ minHeight: 48, px: 3.5, fontSize: 15.5 }}>
            Começar com meu CRM
          </Button>
        </Box>
      </Section>

      {/* ---------- 6. Confiança ---------- */}
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

      {/* ---------- 7. Pricing ---------- */}
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
                <Button variant="outlined" color="inherit" size="large" onClick={() => navigate('/entrar/medico')} sx={{ minHeight: 46, borderColor: 'divider', color: 'text.primary', '&:hover': { borderColor: alpha(TEAL, 0.5), bgcolor: alpha(TEAL, 0.06) } }}>
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
                <Button variant="contained" size="large" endIcon={<ArrowForwardIcon />} onClick={() => navigate('/entrar/medico')} sx={{ minHeight: 46, fontSize: 15 }}>
                  Testar o Pro
                </Button>
              </CardContent>
            </Card>
          </Reveal>
        </Grid>
      </Section>

      {/* ---------- 8. CTA final + footer ---------- */}
      <Box sx={{ position: 'relative', px: 2, py: { xs: 8, sm: 11 }, overflow: 'hidden' }}>
        <Box sx={orb(TEAL, { top: -160, left: '30%' })} />
        <Container maxWidth="sm" sx={{ px: '0 !important', position: 'relative', textAlign: 'center' }}>
          <DrExame size={64} sx={{ mx: 'auto', mb: 2.5 }} />
          <Typography variant="h3" sx={{ mb: 1.5 }}>Pronto para a próxima consulta?</Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3.5 }}>
            Crie sua conta com CRM em minutos. Seus pacientes já podem estar compartilhando exames hoje.
          </Typography>
          <Button variant="contained" size="large" endIcon={<ArrowForwardIcon />} onClick={() => navigate('/entrar/medico')} sx={{ minHeight: 50, px: 4, fontSize: 16 }}>
            Começar com meu CRM
          </Button>
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
