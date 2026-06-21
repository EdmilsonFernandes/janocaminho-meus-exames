import { Box, Container, Typography, Button, Stack, Chip, Fade, CircularProgress } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { AreaChart, Area, ResponsiveContainer, YAxis, ReferenceArea } from 'recharts';
import { DrExame } from '../components/DrExame';

// Ícones MUI (premium, no lugar dos emojis antigos)
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ChatIcon from '@mui/icons-material/Chat';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import Diversity3Icon from '@mui/icons-material/Diversity3';
import DescriptionIcon from '@mui/icons-material/Description';
import LockIcon from '@mui/icons-material/Lock';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ShareIcon from '@mui/icons-material/Share';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import AccessibilityNewIcon from '@mui/icons-material/AccessibilityNew';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

// ---- Tokens (espelham theme.ts) ----
const TEAL = '#20b2aa';
const TEAL_DARK = '#178f89';
const INK = '#0f3d3a'; // teal-escuro premium p/ textos de destaque / footer
const GREEN = '#10b981';

const benefits = [
  { Icon: AutoAwesomeIcon, title: 'IA que lê seus exames', desc: 'Envie o PDF ou foto. O Dr. Exame extrai todos os valores e explica em português simples — sem jargão.' },
  { Icon: ChatIcon, title: 'Chat inteligente (economiza)', desc: 'Perguntas simples ("qual meu último TSH?") são respondidas na hora e de graça. Só as complexas vão pra IA.' },
  { Icon: CompareArrowsIcon, title: 'Comparativo visual', desc: 'Veja o que mudou entre exames. Hemoglobina subiu? Colesterol caiu? Gráficos claros com faixa de referência.' },
  { Icon: TrendingUpIcon, title: 'Evolução + Previsão', desc: 'Acompanhe tendências e saiba quando um valor pode sair da faixa (previsão exclusiva do Premium).' },
  { Icon: MedicalServicesIcon, title: 'Telemedicina pelo marcador', desc: 'Valor alterado? Um toque leva ao especialista certo no Doctoralia — endócrino, cardio, hemato e mais.' },
  { Icon: Diversity3Icon, title: 'Toda a família', desc: 'Gerencie exames de cada dependente. Score familiar + comparativo entre membros.' },
  { Icon: DescriptionIcon, title: 'Pronto para o médico', desc: 'Relatório de 1 página com valores alterados + perfil clínico. Compartilhe por link seguro com PIN.' },
  { Icon: LockIcon, title: 'Dados protegidos + Libras', desc: 'Criptografia, PIN de compartilhamento, exclusão a qualquer momento. LGPD completa e VLibras.' },
];

const steps = [
  { n: 1, Icon: UploadFileIcon, title: 'Envie o exame', desc: 'PDF ou foto do exame de sangue, imagem ou laudo. A IA extrai todos os valores automaticamente.' },
  { n: 2, Icon: AutoAwesomeIcon, title: 'Entenda os resultados', desc: 'O Dr. Exame explica cada valor em linguagem simples, compara com exames anteriores e destaca o que precisa de atenção.' },
  { n: 3, Icon: ShareIcon, title: 'Leve ao médico', desc: 'Gere um documento pronto ou compartilhe por link seguro. Perguntas prontas pra fazer na consulta.' },
];

const planData = [
  { name: 'Grátis', price: 'R$ 0', period: '', features: ['100 créditos pra testar', 'Envie exames (PDF/foto)', 'Valores + referência', 'Score de Saúde', 'Pergunte ao Dr. Exame'], highlight: false, cta: 'Começar grátis' },
  { name: 'Mensal', price: 'R$ 19,90', period: '/mês', features: ['1.500 créditos de IA/mês', 'Exames + dependentes', 'Comparativo + Tendências', 'Relatório completo + PDF', 'Chat com o Dr. Exame'], highlight: true, cta: 'Assinar mensal' },
  { name: 'Créditos', price: 'a partir de R$ 9,90', period: 'avulso', features: ['PIX, cartão ou débito', 'Pacotes flexíveis', 'Cada análise consome créditos', 'Sem mensalidade', 'Use quando precisar'], highlight: false, cta: 'Ver pacotes' },
];

// Mock de evolução (Hemoglobina subindo dentro da faixa)
const trendData = [
  { m: 'Jan', v: 13.1 }, { m: 'Fev', v: 13.4 }, { m: 'Mar', v: 13.7 },
  { m: 'Abr', v: 14.1 }, { m: 'Mai', v: 14.6 }, { m: 'Jun', v: 15.3 },
];

export const LandingPage = () => {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  const goTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <Box sx={{ bgcolor: '#eef7f6', minHeight: '100vh', overflow: 'hidden' }}>
      {/* keyframes (float do hero + chips) */}
      <style>{`
        @keyframes heroFloat { 0%,100%{transform:translateY(0) rotate(-1.5deg)} 50%{transform:translateY(-12px) rotate(-1.5deg)} }
        @keyframes chipFloatA { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-9px)} }
        @keyframes chipFloatB { 0%,100%{transform:translateY(0)} 50%{transform:translateY(9px)} }
      `}</style>

      {/* NAVBAR flutuante (claro/glassy) */}
      <Box sx={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000, transition: 'all .3s',
        bgcolor: scrolled ? 'rgba(255,255,255,.92)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid #dceaea' : '1px solid transparent',
      }}>
        <Container maxWidth="lg" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5 }}>
          <Stack direction="row" alignItems="center" spacing={1.25} sx={{ cursor: 'pointer' }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <Box component="img" src={`${import.meta.env.BASE_URL}brand.png`} alt="Dr. Exame" sx={{ width: 38, height: 38, borderRadius: '16%', objectFit: 'cover' }} />
            <Typography variant="h6" sx={{ color: scrolled ? INK : INK, fontWeight: 800, fontSize: 19, letterSpacing: '-0.01em' }}>Meus Exames</Typography>
          </Stack>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box component="button" onClick={() => goTo('beneficios')} sx={{ ...navBtn(scrolled), display: { xs: 'none', sm: 'inline' } }}>Recursos</Box>
            <Box component="button" onClick={() => goTo('planos')} sx={{ ...navBtn(scrolled), display: { xs: 'none', md: 'inline' } }}>Planos</Box>
            <Button onClick={() => navigate('/login?login=1')} sx={{ color: TEAL_DARK, fontWeight: 700, textTransform: 'none' }}>Entrar</Button>
            <Button variant="contained" color="primary" size="small" onClick={() => navigate('/registrar')} sx={{ borderRadius: 99, px: 2.5, textTransform: 'none', fontWeight: 700 }}>Criar conta</Button>
          </Stack>
        </Container>
      </Box>

      {/* HERO — claro premium */}
      <Box sx={{
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(180deg,#eef7f6 0%,#ffffff 70%)',
        pt: { xs: 11, md: 14 }, pb: { xs: 7, md: 10 },
      }}>
        <Box sx={{ position: 'absolute', top: '-10%', right: '-5%', width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle,rgba(32,178,170,.18),transparent 65%)', pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', bottom: '-15%', left: '-8%', width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle,rgba(212,165,116,.12),transparent 65%)', pointerEvents: 'none' }} />
        <Container maxWidth="lg" sx={{ position: 'relative' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.05fr .95fr' }, gap: { xs: 5, md: 6 }, alignItems: 'center' }}>
            {/* Coluna texto */}
            <Box>
              <Chip icon={<AutoAwesomeIcon sx={{ fontSize: 17 }} />} label="IA de Saúde no seu bolso" sx={{ bgcolor: 'rgba(32,178,170,.12)', color: TEAL_DARK, fontWeight: 700, mb: 3, fontSize: 13, pl: 1, '& .MuiChip-icon': { color: TEAL } }} />
              <Typography variant="h1" sx={{ fontSize: { xs: '2.3rem', md: '3.4rem' }, fontWeight: 800, lineHeight: 1.08, mb: 2.5, letterSpacing: '-0.03em', color: INK }}>
                Entenda seus exames<br />como <Box component="span" sx={{ color: TEAL }}>nunca antes.</Box>
              </Typography>
              <Typography sx={{ fontSize: { xs: 16.5, md: 19 }, color: 'text.secondary', mb: 4, lineHeight: 1.6, maxWidth: 480 }}>
                Envie o exame de sangue, imagem ou laudo. O <b style={{ color: INK }}>Dr. Exame</b> lê tudo com IA, explica em português simples e acompanha sua evolução.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} useFlexGap sx={{ mb: 3 }}>
                <Button variant="contained" color="primary" size="large" onClick={() => navigate('/registrar')} sx={{ borderRadius: 99, px: 4, py: 1.5, fontSize: 16.5, textTransform: 'none', fontWeight: 800 }}>
                  Começar grátis →
                </Button>
                <Button size="large" onClick={() => navigate('/login?login=1')} sx={{ borderRadius: 99, px: 4, py: 1.5, fontSize: 16.5, textTransform: 'none', fontWeight: 700, color: TEAL_DARK, border: '1px solid #bfe7e3', '&:hover': { bgcolor: 'rgba(32,178,170,.06)', borderColor: TEAL } }}>
                  Já tenho conta
                </Button>
              </Stack>
              <Stack direction="row" spacing={2.5} useFlexGap sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                {['Sem cartão', '100 créditos grátis', 'LGPD'].map((t) => (
                  <Stack key={t} direction="row" spacing={0.5} alignItems="center">
                    <CheckCircleIcon sx={{ fontSize: 17, color: GREEN }} />
                    <Typography sx={{ color: 'text.secondary', fontSize: 13.5, fontWeight: 600 }}>{t}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>

            {/* Coluna visual — capaIA em card premium + chips flutuantes */}
            <Box sx={{ display: 'flex', justifyContent: 'center', position: 'relative', minHeight: { xs: 280, md: 380 } }}>
              <Box sx={{
                position: 'relative', width: '100%', maxWidth: 520,
                borderRadius: 5, overflow: 'hidden', bgcolor: '#fff',
                border: '1px solid #e6f1f0', p: 1.2,
                boxShadow: '0 30px 60px rgba(32,178,170,.18), 0 8px 20px rgba(0,0,0,.06)',
                animation: 'heroFloat 6s ease-in-out infinite',
              }}>
                <Box component="img" src={`${import.meta.env.BASE_URL}capa-ia.png`} alt="Dr. Exame — seus exames com IA" sx={{ width: '100%', height: 'auto', display: 'block', borderRadius: 4 }} />
              </Box>

              {/* Chip flutuante — Score (verde) */}
              <Box sx={{
                position: 'absolute', top: { xs: 6, md: 0 }, left: { xs: 0, md: -28 }, bgcolor: '#fff', borderRadius: 3, p: 1.5, pr: 2,
                display: 'flex', alignItems: 'center', gap: 1, boxShadow: '0 12px 30px rgba(0,0,0,.12)', border: '1px solid #e6f1f0',
                animation: 'chipFloatA 5s ease-in-out infinite',
              }}>
                <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                  <CircularProgress variant="determinate" value={100} size={42} thickness={5} sx={{ color: '#e6f1f0' }} />
                  <CircularProgress variant="determinate" value={92} size={42} thickness={5} sx={{ color: GREEN, position: 'absolute', left: 0, '& .MuiCircularProgress-circle': { strokeLinecap: 'round' } }} />
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 10, color: 'text.secondary', lineHeight: 1 }}>Score</Typography>
                  <Typography sx={{ fontSize: 17, fontWeight: 800, color: INK, lineHeight: 1.1 }}>92/100</Typography>
                </Box>
              </Box>

              {/* Chip flutuante — valor normal */}
              <Box sx={{
                position: 'absolute', bottom: { xs: 10, md: 24 }, right: { xs: 0, md: -24 }, bgcolor: '#fff', borderRadius: 3, p: 1.5,
                boxShadow: '0 12px 30px rgba(0,0,0,.12)', border: '1px solid #e6f1f0', maxWidth: 170,
                display: { xs: 'none', sm: 'block' },
                animation: 'chipFloatB 5.5s ease-in-out infinite',
              }}>
                <Typography sx={{ fontSize: 11, color: 'text.secondary', mb: 0.25 }}>Hemoglobina</Typography>
                <Typography sx={{ fontSize: 19, fontWeight: 800, color: GREEN, lineHeight: 1.1 }}>15,3 <Box component="span" sx={{ fontSize: 11, color: GREEN, fontWeight: 700 }}>✓ Normal</Box></Typography>
              </Box>

              {/* Chip flutuante — Dica IA */}
              <Box sx={{
                position: 'absolute', top: { xs: 'auto', md: -16 }, bottom: { xs: -14, md: 'auto' }, right: { xs: 8, md: 40 }, bgcolor: 'rgba(255,255,255,.96)', borderRadius: 3, p: 1, pl: 1.25,
                display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 1, boxShadow: '0 12px 30px rgba(0,0,0,.12)', border: '1px solid #d1fae5',
                animation: 'chipFloatA 6s ease-in-out infinite',
              }}>
                <DrExame size={26} sx={{ borderRadius: '50%' }} />
                <Typography sx={{ fontSize: 11.5, color: INK, fontWeight: 600 }}>Dica da IA ✨</Typography>
              </Box>
            </Box>
          </Box>
        </Container>
      </Box>

      {/* TRUST STRIP */}
      <Box sx={{ bgcolor: '#fff', borderTop: '1px solid #e6f1f0', borderBottom: '1px solid #e6f1f0' }}>
        <Container maxWidth="lg">
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 2, sm: 4 }} useFlexGap justifyContent="center" alignItems="center" sx={{ py: 2.5, flexWrap: 'wrap' }}>
            {[
              { Icon: VerifiedUserIcon, t: 'Conforme a LGPD' },
              { Icon: AccessibilityNewIcon, t: 'Acessível em Libras' },
              { Icon: MedicalServicesIcon, t: 'Telemedicina (Doctoralia)' },
              { Icon: CreditCardIcon, t: 'Sem cartão pra começar' },
            ].map(({ Icon, t }) => (
              <Stack key={t} direction="row" spacing={1} alignItems="center">
                <Icon sx={{ fontSize: 20, color: TEAL }} />
                <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: INK }}>{t}</Typography>
              </Stack>
            ))}
          </Stack>
        </Container>
      </Box>

      {/* BENEFÍCIOS */}
      <Container maxWidth="lg" id="beneficios" sx={{ py: { xs: 8, md: 11 }, scrollMarginTop: 80 }}>
        <Typography align="center" variant="h2" sx={{ fontSize: { xs: '1.9rem', md: '2.6rem' }, fontWeight: 800, color: INK, mb: 1.5, letterSpacing: '-0.02em' }}>
          Tudo que você precisa pra dominar sua saúde
        </Typography>
        <Typography align="center" sx={{ color: 'text.secondary', fontSize: 17, mb: 6, maxWidth: 620, mx: 'auto' }}>
          Não é só um leitor de PDF. É um assistente completo que entende, compara e prevê.
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr 1fr' }, gap: 2.5 }}>
          {benefits.map((b, i) => (
            <Fade key={i} in timeout={300 + i * 80}>
              <Box sx={{
                p: 3, borderRadius: 4, bgcolor: '#fff', border: '1px solid #e6f1f0', height: '100%',
                transition: 'all .2s ease',
                '&:hover': { boxShadow: '0 16px 36px rgba(32,178,170,.12)', transform: 'translateY(-5px)', borderColor: TEAL },
              }}>
                <Box sx={{ width: 48, height: 48, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2, background: 'linear-gradient(135deg,rgba(32,178,170,.14),rgba(32,178,170,.06))' }}>
                  <b.Icon sx={{ fontSize: 26, color: TEAL_DARK }} />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 800, fontSize: 16.5, color: INK, mb: 1 }}>{b.title}</Typography>
                <Typography sx={{ fontSize: 14, color: 'text.secondary', lineHeight: 1.6 }}>{b.desc}</Typography>
              </Box>
            </Fade>
          ))}
        </Box>
      </Container>

      {/* SHOWCASE — Veja na prática (mockups reais) */}
      <Box sx={{ bgcolor: '#fff', borderTop: '1px solid #e6f1f0', borderBottom: '1px solid #e6f1f0', py: { xs: 8, md: 11 } }}>
        <Container maxWidth="lg">
          <Typography align="center" variant="h2" sx={{ fontSize: { xs: '1.9rem', md: '2.6rem' }, fontWeight: 800, color: INK, mb: 1.5, letterSpacing: '-0.02em' }}>
            Veja na prática
          </Typography>
          <Typography align="center" sx={{ color: 'text.secondary', fontSize: 17, mb: 6, maxWidth: 600, mx: 'auto' }}>
            O Dr. Exame transforma seus exames em clareza — score, dicas e evolução num só lugar.
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 3, alignItems: 'stretch' }}>
            {/* Mock A — Score */}
            <Box sx={{ p: 3.5, borderRadius: 5, background: 'linear-gradient(135deg,#ffffff,#e6f7f6)', border: '1px solid #e6f1f0', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <Typography variant="h6" sx={{ fontWeight: 800, color: INK, mb: 2 }}>Score de Saúde</Typography>
              <Box sx={{ position: 'relative', display: 'inline-flex', my: 1 }}>
                <CircularProgress variant="determinate" value={100} size={128} thickness={6} sx={{ color: '#e6f1f0' }} />
                <CircularProgress variant="determinate" value={92} size={128} thickness={6} sx={{ color: GREEN, position: 'absolute', left: 0, '& .MuiCircularProgress-circle': { strokeLinecap: 'round' } }} />
                <Box sx={{ top: 0, left: 0, bottom: 0, right: 0, position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography sx={{ fontSize: 34, fontWeight: 800, color: INK, lineHeight: 1 }}>92</Typography>
                  <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>/ 100</Typography>
                </Box>
              </Box>
              <Typography sx={{ fontSize: 14, color: 'text.secondary', mt: 2 }}>Tudo bem! A maioria dos seus valores está dentro da faixa.</Typography>
            </Box>

            {/* Mock B — Dica IA */}
            <Box sx={{ p: 3.5, borderRadius: 5, background: 'linear-gradient(135deg,#ecfdf5,#d1fae5)', border: '1px solid #6ee7b7', display: 'flex', flexDirection: 'column' }}>
              <Typography variant="h6" sx={{ fontWeight: 800, color: INK, mb: 2 }}>Dica personalizada (IA)</Typography>
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flex: 1 }}>
                <DrExame size={42} sx={{ borderRadius: '50%', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,.1)' }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 14.5, color: '#0f3d3a', lineHeight: 1.55 }}>
                    <b>Heloísa, seu score está excelente!</b> Continue assim — mantenha a hidratação e fique de olho na ingestão de sódio. 🥗
                  </Typography>
                </Box>
              </Box>
              <Typography sx={{ fontSize: 12, color: '#0f766e', mt: 2, fontStyle: 'italic' }}>Educativo, não substitui consulta médica.</Typography>
            </Box>

            {/* Mock C — Evolução */}
            <Box sx={{ p: 3.5, borderRadius: 5, background: 'linear-gradient(135deg,#ffffff,#f0f9ff)', border: '1px solid #e6f1f0', display: 'flex', flexDirection: 'column' }}>
              <Typography variant="h6" sx={{ fontWeight: 800, color: INK, mb: 0.5 }}>Evolução</Typography>
              <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 2 }}>Hemoglobina — 6 meses</Typography>
              <Box sx={{ width: '100%', height: 130, mt: 'auto' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 5, right: 5, bottom: 0, left: 5 }}>
                    <defs>
                      <linearGradient id="gHero" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={TEAL} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={TEAL} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <ReferenceArea y1={13.5} y2={17.5} fill={GREEN} fillOpacity={0.06} />
                    <YAxis domain={[12, 16]} hide />
                    <Area type="monotone" dataKey="v" stroke={TEAL_DARK} strokeWidth={3} fill="url(#gHero)" dot={{ r: 3, fill: TEAL_DARK }} />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
              <Typography sx={{ fontSize: 14, color: 'text.secondary', mt: 1.5 }}>
                Subindo <b style={{ color: GREEN }}>+2,2</b> e dentro da faixa de referência. 📈
              </Typography>
            </Box>
          </Box>
        </Container>
      </Box>

      {/* COMO FUNCIONA */}
      <Box id="como-funciona" sx={{ bgcolor: '#eef7f6', py: { xs: 8, md: 11 }, scrollMarginTop: 80 }}>
        <Container maxWidth="lg">
          <Typography align="center" variant="h2" sx={{ fontSize: { xs: '1.9rem', md: '2.6rem' }, fontWeight: 800, color: INK, mb: 1.5, letterSpacing: '-0.02em' }}>
            Como funciona
          </Typography>
          <Typography align="center" sx={{ color: 'text.secondary', fontSize: 17, mb: 6 }}>3 passos. Menos de 1 minuto.</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 4 }}>
            {steps.map((s) => (
              <Box key={s.n} sx={{ textAlign: 'center' }}>
                <Box sx={{ position: 'relative', width: 76, height: 76, mx: 'auto', mb: 2.5 }}>
                  <Box sx={{ width: 76, height: 76, borderRadius: '50%', background: 'linear-gradient(135deg,#20b2aa,#178f89)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 26px rgba(32,178,170,.35)' }}>
                    <s.Icon sx={{ fontSize: 34, color: '#fff' }} />
                  </Box>
                  <Box sx={{ position: 'absolute', top: -6, right: -6, width: 26, height: 26, borderRadius: '50%', bgcolor: '#fff', border: '2px solid #20b2aa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: TEAL_DARK }}>{s.n}</Box>
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 800, fontSize: 18, color: INK, mb: 1 }}>{s.title}</Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: 15, lineHeight: 1.6, maxWidth: 290, mx: 'auto' }}>{s.desc}</Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* PLANOS */}
      <Box id="planos" sx={{ bgcolor: '#fff', borderTop: '1px solid #e6f1f0', py: { xs: 8, md: 11 }, scrollMarginTop: 80 }}>
        <Container maxWidth="md">
          <Typography align="center" variant="h2" sx={{ fontSize: { xs: '1.9rem', md: '2.6rem' }, fontWeight: 800, color: INK, mb: 1.5, letterSpacing: '-0.02em' }}>Planos simples e justos</Typography>
          <Typography align="center" sx={{ color: 'text.secondary', mb: 6, fontSize: 17 }}>Comece grátis. Assine quando precisar — ou pague só pelo que usar.</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 3, alignItems: 'center' }}>
            {planData.map((p) => (
              <Box key={p.name} sx={{
                p: 3, borderRadius: 5, bgcolor: '#fff',
                border: p.highlight ? `2px solid ${TEAL}` : '1px solid #e6f1f0',
                boxShadow: p.highlight ? '0 18px 44px rgba(32,178,170,.16)' : '0 2px 8px rgba(0,0,0,.04)',
                position: 'relative', transform: p.highlight ? { xs: 'none', sm: 'scale(1.04)' } : 'none',
              }}>
                {p.highlight && <Chip label="RECOMENDADO" size="small" sx={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', bgcolor: TEAL, color: '#fff', fontWeight: 800, fontSize: 11 }} />}
                <Typography variant="h6" sx={{ fontWeight: 800, fontSize: 18, color: INK, mb: 1 }}>{p.name}</Typography>
                <Typography sx={{ fontWeight: 800, fontSize: 32, color: p.highlight ? TEAL : INK, mb: 0.5, lineHeight: 1.1 }}>{p.price}<Typography component="span" sx={{ fontSize: 14, color: 'text.secondary', fontWeight: 600 }}>{p.period}</Typography></Typography>
                <Box sx={{ my: 2, height: 1, background: '#e6f1f0' }} />
                {p.features.map((f) => (
                  <Stack key={f} direction="row" spacing={1} alignItems="center" sx={{ py: 0.5 }}>
                    <CheckCircleIcon sx={{ fontSize: 17, color: GREEN, flexShrink: 0 }} />
                    <Typography sx={{ fontSize: 14, color: '#334155' }}>{f}</Typography>
                  </Stack>
                ))}
                <Button fullWidth variant={p.highlight ? 'contained' : 'outlined'} color="primary" onClick={() => navigate('/registrar')} sx={{ mt: 2.5, borderRadius: 99, textTransform: 'none', fontWeight: 700, ...(p.highlight ? {} : { borderColor: '#bfe7e3', color: TEAL_DARK }) }}>{p.cta}</Button>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* CTA FINAL — painel gradiente */}
      <Box sx={{ py: { xs: 8, md: 11 } }}>
        <Container maxWidth="lg">
          <Box sx={{
            borderRadius: 6, p: { xs: 4, md: 7 }, textAlign: 'center', color: '#fff', position: 'relative', overflow: 'hidden',
            background: 'linear-gradient(135deg,#20b2aa,#178f89)',
            boxShadow: '0 24px 60px rgba(32,178,170,.32)',
          }}>
            <Box sx={{ position: 'absolute', top: '-30%', right: '-10%', width: 360, height: 360, borderRadius: '50%', background: 'rgba(255,255,255,.08)' }} />
            <Box sx={{ position: 'relative' }}>
              <Typography variant="h2" sx={{ fontSize: { xs: '1.7rem', md: '2.3rem' }, fontWeight: 800, mb: 2, letterSpacing: '-0.02em' }}>Pronto pra entender sua saúde?</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,.9)', mb: 4, fontSize: 17, maxWidth: 480, mx: 'auto' }}>Crie sua conta grátis e envie seu primeiro exame em menos de 1 minuto.</Typography>
              <Button size="large" onClick={() => navigate('/registrar')} sx={{ bgcolor: '#fff', color: TEAL_DARK, fontWeight: 800, fontSize: 17, borderRadius: 99, px: 5, py: 1.5, textTransform: 'none', '&:hover': { bgcolor: '#f0fafa', transform: 'translateY(-2px)' }, transition: 'all .2s' }}>Começar agora →</Button>
              {/* QR Code */}
              <Box sx={{ mt: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                <Box component="img" src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://janocaminho.com.br/minhasaude/&color=178f89&bgcolor=ffffff&margin=0" alt="QR Code - Meus Exames" sx={{ borderRadius: 3, p: 1.5, bgcolor: '#fff', width: 150, height: 150 }} />
                <Typography sx={{ color: 'rgba(255,255,255,.85)', fontSize: 13 }}>📱 Escaneie com a câmera do celular</Typography>
              </Box>
            </Box>
          </Box>
        </Container>
      </Box>

      {/* RODAPÉ */}
      <Box sx={{ bgcolor: INK, color: '#9bc4c0', py: 5 }}>
        <Container maxWidth="md" sx={{ textAlign: 'center' }}>
          <Stack direction="row" spacing={1.25} alignItems="center" justifyContent="center" sx={{ mb: 1 }}>
            <Box component="img" src={`${import.meta.env.BASE_URL}brand.png`} alt="Dr. Exame" sx={{ width: 30, height: 30, borderRadius: '16%' }} />
            <Typography sx={{ fontWeight: 800, color: '#fff', fontSize: 18 }}>Meus Exames</Typography>
          </Stack>
          <Typography sx={{ fontSize: 13, mb: 1 }}>© {new Date().getFullYear()} janocaminho.com.br • contato@janocaminho.com.br</Typography>
          <Typography sx={{ fontSize: 12, opacity: .8, mb: 2 }}>Edmilson Fernandes • CNPJ: 44.771.427/0001-69 • Análise educativa, não substitui consulta médica.</Typography>
          <Stack direction="row" spacing={3} justifyContent="center" useFlexGap sx={{ flexWrap: 'wrap' }}>
            <Box component="span" sx={{ color: '#5fc9c3', cursor: 'pointer', fontSize: 13, fontWeight: 700, '&:hover': { textDecoration: 'underline' } }} onClick={() => navigate('/termos')}>Termos e LGPD</Box>
            <Box component="span" sx={{ color: '#5fc9c3', cursor: 'pointer', fontSize: 13, fontWeight: 700, '&:hover': { textDecoration: 'underline' } }} onClick={() => navigate('/registrar')}>Criar conta</Box>
            <Box component="span" sx={{ color: '#5fc9c3', cursor: 'pointer', fontSize: 13, fontWeight: 700, '&:hover': { textDecoration: 'underline' } }} onClick={() => navigate('/login?login=1')}>Entrar</Box>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
};

// Estilo do botão de nav (texto discreto)
const navBtn = (scrolled: boolean) => ({
  background: 'none', border: 'none', cursor: 'pointer',
  color: '#2d3748', fontWeight: 600, fontSize: 14, textTransform: 'none' as const,
  '&:hover': { color: TEAL_DARK },
});
