import { Box, Container, Typography, Button, Stack, Chip, Fade } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';

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
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import SmartphoneIcon from '@mui/icons-material/Smartphone';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import AccessibilityNewIcon from '@mui/icons-material/AccessibilityNew';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import TuneIcon from '@mui/icons-material/Tune';
import CalculateIcon from '@mui/icons-material/Calculate';

import { ExamDemo } from '../components/ExamDemo';
import { FaqSection } from '../components/FaqSection';
import { BmiCalculator } from '../components/BmiCalculator';
import { Reveal } from '../components/Reveal';

// ---- Tokens (espelham theme.ts) ----
const TEAL = '#20b2aa';
const TEAL_DARK = '#178f89';
const INK = '#0f3d3a'; // teal-escuro premium p/ textos de destaque / footer
const GREEN = '#059669';

const benefits = [
  { Icon: HealthAndSafetyIcon, title: 'Leitura de risco', desc: 'Veja possíveis riscos (diabetes, anemia, hipertensão, colesterol, cardiovascular, renal, obesidade) a partir dos seus exames — sempre como "possível", e cada faixa cita a diretriz (ADA/SBC/OMS).' },
  { Icon: TuneIcon, title: 'Leitura personalizada', desc: 'Complete seu perfil (sexo, altura, etnia) e a interpretação se ajusta a você — ex.: as faixas de anemia passam a usar o limiar certo pra homem ou mulher. Sem perfil, usa faixa conservadora.' },
  { Icon: CalculateIcon, title: 'Índices que o laudo não dá', desc: 'Calcula IMC, função renal (eGFR) e resistência insulínica (HOMA-IR) automaticamente. E mostra o valor IDEAL — não só o de referência (ex.: LDL ideal <100, não só <130).' },
  { Icon: AutoStoriesIcon, title: 'Plano de ação do Dr. Exame', desc: 'A IA monta um plano personalizado: o que fazer, quando refazer os exames e perguntas pra levar ao médico. Educativo, nunca diagnóstico.' },
  { Icon: MonitorHeartIcon, title: 'Score de Adesão', desc: 'Gamificação: pontue por enviar exames no prazo, medir pressão e dar feedback. Suba de Bronze a Diamante e mantenha sua saúde em dia.' },
  { Icon: TrendingUpIcon, title: 'Alerta preditivo', desc: 'A IA projeta a tendência dos seus marcadores e alerta ANTES que saiam da faixa — "seu LDL pode ultrapassar 100 em ~3 meses".' },
  { Icon: AutoAwesomeIcon, title: 'IA que lê seus exames', desc: 'Envie o PDF ou foto. O Dr. Exame extrai todos os valores e explica em português simples — sem jargão.' },
  { Icon: ChatIcon, title: 'Chat inteligente (economiza)', desc: 'Perguntas simples ("qual meu último TSH?") são respondidas na hora e de graça. Só as complexas vão pra IA.' },
  { Icon: CompareArrowsIcon, title: 'Comparativo visual', desc: 'Veja o que mudou entre exames. Hemoglobina subiu? Colesterol caiu? Gráficos claros com faixa de referência.' },
  { Icon: TrendingUpIcon, title: 'Evolução + Previsão', desc: 'Acompanhe tendências e saiba quando um valor pode sair da faixa (previsão exclusiva do Premium).' },
  { Icon: MedicalServicesIcon, title: 'Portal do seu médico', desc: 'Indique pelo CRM e seu médico ganha um brief de pré-consulta: top 3 mudanças do dia, padrões por sistema (glicêmico, renal, lipídico) e exames de seguimento sugeridos — só o que você autorizar.' },
  { Icon: Diversity3Icon, title: 'Toda a família', desc: 'Gerencie exames de cada dependente. Score familiar + comparativo entre membros.' },
  { Icon: DescriptionIcon, title: 'Pronto para o médico', desc: 'Relatório de 1 página com valores alterados + perfil clínico. Compartilhe por link seguro com PIN.' },
  { Icon: LockIcon, title: 'Dados protegidos + Libras', desc: 'Seus valores vêm do laudo — a IA não inventa números (extração determinística). Criptografia, PIN de compartilhamento, exclusão a qualquer momento. LGPD completa e VLibras.' },
];

// F2 — categorias pra filtrar o mural de benefícios (mata o "wall of text" sem deletar conteúdo)
const CATS = ['Todos', 'IA & Análise', 'Acompanhamento', 'Médico & Família', 'Segurança'] as const;
const catOf = (t: string): string => {
  if (/Dados protegidos/.test(t)) return 'Segurança';
  if (/Portal do seu médico|Toda a família|Pronto para o médico/.test(t)) return 'Médico & Família';
  if (/Score de Adesão|Alerta preditivo|Comparativo visual|Evolução/.test(t)) return 'Acompanhamento';
  return 'IA & Análise';
};

const steps = [
  { n: 1, Icon: UploadFileIcon, title: 'Envie o exame', desc: 'PDF ou foto do exame de sangue, imagem ou laudo. A IA extrai todos os valores automaticamente.' },
  { n: 2, Icon: AutoAwesomeIcon, title: 'A IA lê e explica', desc: 'O Dr. Exame explica cada valor em linguagem simples, compara com exames anteriores e destaca o que precisa de atenção.' },
  { n: 3, Icon: AssignmentIndIcon, title: 'Indique seu médico', desc: 'Informe o CRM. Seu médico é pré-cadastrado sozinho e recebe um aviso pra ativar o acesso.' },
  { n: 4, Icon: MedicalServicesIcon, title: 'O médico vê tudo', desc: 'Ele finaliza o cadastro com o mesmo CRM e você aparece no portal dele — só o que você autorizou.' },
];

const planData = [
  { name: 'Grátis', price: 'R$ 0', period: '', features: ['60 créditos pra testar', 'Envie exames (PDF/foto)', 'Valores + referência', 'Score de Saúde', 'Pergunte ao Dr. Exame'], highlight: false, cta: 'Começar grátis' },
  { name: 'Mensal', price: 'R$ 19,90', period: '/mês', features: ['250 créditos de IA/mês', 'Exames + dependentes', 'Comparativo + Tendências', 'Relatório completo + PDF', 'Chat com o Dr. Exame'], highlight: true, cta: 'Assinar mensal' },
  { name: 'Créditos', price: 'a partir de R$ 9,90', period: 'avulso', features: ['PIX, cartão ou débito', 'Pacotes flexíveis', 'Cada análise consome créditos', 'Sem mensalidade', 'Use quando precisar'], highlight: false, cta: 'Ver pacotes' },
];

// Carrossel "Veja na prática" — 15 slides da apresentação (Meus_Exames_AI_Platform) em WebP
// (~0,5 MB total — 60× mais leve que o vídeo de 37 MB). Cross-fade suave, auto-rotação,
// pausa no hover, dots clicáveis, clique no slide avança.
const SHOWCASE_SLIDE_COUNT = 15;

const SlideCarousel = () => {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setI((p) => (p + 1) % SHOWCASE_SLIDE_COUNT), 3200);
    return () => clearInterval(t);
  }, [paused]);
  return (
    <Box onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} sx={{ maxWidth: 880, mx: 'auto', width: '100%' }}>
      <Box sx={{
        position: 'relative', width: '100%', aspectRatio: '16 / 9',
        borderRadius: 3, overflow: 'hidden', bgcolor: '#0c2422',
        boxShadow: '0 30px 60px rgba(32,178,170,.20), 0 12px 26px rgba(0,0,0,.10)',
        border: '1px solid rgba(255,255,255,.06)',
      }}>
        {Array.from({ length: SHOWCASE_SLIDE_COUNT }).map((_, idx) => (
          <Box
            key={idx}
            component="img"
            src={`${import.meta.env.BASE_URL}showcase/slide-${idx + 1}.webp`}
            alt={`Meus Exames — slide ${idx + 1}`}
            loading={idx === 0 ? 'eager' : 'lazy'}
            onClick={() => setI((idx + 1) % SHOWCASE_SLIDE_COUNT)}
            sx={{
              position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain',
              opacity: idx === i ? 1 : 0, transition: 'opacity .6s ease', cursor: 'pointer',
            }}
          />
        ))}
      </Box>
      <Stack direction="row" spacing={0.7} useFlexGap sx={{ mt: 2.5, justifyContent: 'center', flexWrap: 'wrap' }}>
        {Array.from({ length: SHOWCASE_SLIDE_COUNT }).map((_, idx) => (
          <Box
            key={idx}
            onClick={() => setI(idx)}
            sx={{
              width: idx === i ? 22 : 7, height: 7, borderRadius: 99,
              bgcolor: idx === i ? TEAL : 'rgba(15,61,58,.22)',
              cursor: 'pointer', transition: 'width .3s ease, background-color .3s ease',
            }}
          />
        ))}
      </Stack>
    </Box>
  );
};

export const LandingPage = () => {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [cat, setCat] = useState<(typeof CATS)[number]>('Todos');
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
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh', overflow: 'hidden' }}>
      {/* keyframes (float do hero + chips) */}
      <style>{`
        @keyframes heroFloat { 0%,100%{transform:translateY(0) rotate(-1.5deg)} 50%{transform:translateY(-12px) rotate(-1.5deg)} }
        @keyframes chipFloatA { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-9px)} }
        @keyframes chipFloatB { 0%,100%{transform:translateY(0)} 50%{transform:translateY(9px)} }
      `}</style>

      {/* NAVBAR flutuante (claro/glassy) */}
      <Box sx={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000, transition: 'all .3s',
        paddingTop: 'env(safe-area-inset-top)',
        bgcolor: scrolled ? 'rgba(255,255,255,.92)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid' : '1px solid transparent',
        borderColor: scrolled ? 'divider' : 'transparent',
      }}>
        <Container maxWidth="lg" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5 }}>
          <Stack direction="row" alignItems="center" spacing={1.25} sx={{ cursor: 'pointer' }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <Box component="img" src={`${import.meta.env.BASE_URL}app-icon.png`} alt="Dr. Exame" sx={{ width: 38, height: 38, borderRadius: '16%', objectFit: 'cover' }} />
            <Typography variant="h6" sx={{ color: 'text.primary', fontWeight: 800, fontSize: 19, letterSpacing: '-0.01em' }}>Meus Exames</Typography>
          </Stack>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box component="button" onClick={() => goTo('beneficios')} sx={{ ...navBtn(scrolled), display: { xs: 'none', sm: 'inline' } }}>Recursos</Box>
            <Box component="button" onClick={() => goTo('planos')} sx={{ ...navBtn(scrolled), display: { xs: 'none', md: 'inline' } }}>Planos</Box>
            <Box component="button" onClick={() => goTo('portal-medico')} sx={{ ...navBtn(scrolled), color: TEAL_DARK, fontWeight: 700, display: { xs: 'none', md: 'inline' } }}>🩺 Sou médico</Box>
            <Button onClick={() => navigate('/entrar')} sx={{ color: TEAL_DARK, fontWeight: 700, textTransform: 'none' }}>Entrar</Button>
            <Button variant="contained" color="primary" size="small" onClick={() => navigate('/registrar')} sx={{ borderRadius: 99, px: 2.5, textTransform: 'none', fontWeight: 700 }}>Criar conta</Button>
          </Stack>
        </Container>
      </Box>

      {/* HERO — claro premium */}
      <Box sx={{
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(180deg, rgba(32,178,170,.08) 0%, transparent 70%)',
        pt: { xs: 11, md: 14 }, pb: { xs: 7, md: 10 },
      }}>
        <Box sx={{ position: 'absolute', top: '-10%', right: '-5%', width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle,rgba(32,178,170,.18),transparent 65%)', pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', bottom: '-15%', left: '-8%', width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle,rgba(212,165,116,.12),transparent 65%)', pointerEvents: 'none' }} />
        <Container maxWidth="lg" sx={{ position: 'relative' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.05fr .95fr' }, gap: { xs: 5, md: 6 }, alignItems: 'center' }}>
            {/* Coluna texto */}
            <Box>
              <Chip icon={<AutoAwesomeIcon sx={{ fontSize: 17 }} />} label="IA de Saúde no seu bolso" sx={{ bgcolor: 'rgba(32,178,170,.12)', color: TEAL_DARK, fontWeight: 700, mb: 3, fontSize: 13, pl: 1, '& .MuiChip-icon': { color: TEAL } }} />
              <Typography variant="h1" sx={{ fontSize: { xs: '2.3rem', md: '3.4rem' }, fontWeight: 800, lineHeight: 1.08, mb: 2.5, letterSpacing: '-0.03em', color: 'text.primary' }}>
                Entenda seus exames<br />como <Box component="span" sx={{ color: TEAL }}>nunca antes.</Box>
              </Typography>
              <Typography sx={{ fontSize: { xs: 16.5, md: 19 }, color: 'text.secondary', mb: 4, lineHeight: 1.6, maxWidth: 500 }}>
                Envie o exame. O <b style={{ color: 'text.primary' }}>Dr. Exame</b> lê com IA, explica em português simples, mostra sua <b style={{ color: 'text.primary' }}>leitura de risco</b> e monta um <b style={{ color: 'text.primary' }}>plano de ação</b> pra levar ao médico.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} useFlexGap sx={{ mb: 3 }}>
                <Button variant="contained" color="primary" size="large" onClick={() => navigate('/registrar')} sx={{ borderRadius: 99, px: 4, py: 1.5, fontSize: 16.5, textTransform: 'none', fontWeight: 800 }}>
                  Começar grátis →
                </Button>
                <Button size="large" onClick={() => navigate('/entrar')} sx={{ borderRadius: 99, px: 4, py: 1.5, fontSize: 16.5, textTransform: 'none', fontWeight: 700, color: TEAL_DARK, border: '1px solid #bfe7e3', '&:hover': { bgcolor: 'rgba(32,178,170,.06)', borderColor: TEAL } }}>
                  Já tenho conta
                </Button>
              </Stack>
              <Stack direction="row" spacing={2.5} useFlexGap sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                {['Sem cartão', '60 créditos grátis', 'Leitura de risco', 'LGPD'].map((t) => (
                  <Stack key={t} direction="row" spacing={0.5} alignItems="center">
                    <CheckCircleIcon sx={{ fontSize: 17, color: GREEN }} />
                    <Typography sx={{ color: 'text.secondary', fontSize: 13.5, fontWeight: 600 }}>{t}</Typography>
                  </Stack>
                ))}
              </Stack>
              <Typography sx={{ mt: 2.5, fontSize: 14 }}>
                É médico? <Box component="span" onClick={() => navigate('/doctor')} sx={{ color: TEAL_DARK, fontWeight: 700, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}>Acesse o Portal do Médico →</Box>
              </Typography>
            </Box>

            {/* Coluna visual — capaIA de ponta a ponta, sem matte e sem cards flutuantes => preenche tudo, sem espaço branco. */}
            <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
              <Box sx={{
                position: 'relative', width: '100%', maxWidth: 560,
                borderRadius: 5, overflow: 'hidden',
                boxShadow: '0 30px 60px rgba(32,178,170,.20), 0 10px 24px rgba(0,0,0,.07)',
              }}>
                <Box component="img" src={`${import.meta.env.BASE_URL}capa-ia.png`} alt="Dr. Exame — seus exames com IA" sx={{ width: '100%', height: 'auto', display: 'block' }} />
              </Box>
            </Box>
          </Box>
        </Container>
      </Box>

      {/* MOMENTO MÁGICO — demo interativo "Decifre seu exame" (F1) */}
      <Box sx={{ bgcolor: 'background.default', py: { xs: 6, md: 9 } }}>
        <Container maxWidth="lg">
          <Box sx={{ textAlign: 'center', mb: { xs: 3.5, md: 5 } }}>
            <Typography sx={{ fontSize: 13, fontWeight: 800, color: TEAL_DARK, letterSpacing: '0.06em', textTransform: 'uppercase', mb: 1 }}>Veja acontecer</Typography>
            <Typography variant="h2" sx={{ fontSize: { xs: '1.7rem', md: '2.3rem' }, fontWeight: 800, color: 'text.primary', mb: 1, letterSpacing: '-0.02em' }}>Decifre um exame em 5 segundos</Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: 16.5, maxWidth: 560, mx: 'auto' }}>Toque e veja o Dr. Exame ler o laudo, explicar cada valor e montar sua leitura de risco — sem cadastro.</Typography>
          </Box>
          <ExamDemo />
        </Container>
      </Box>

      {/* TRUST STRIP */}
      <Box sx={{ bgcolor: 'background.paper', borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Container maxWidth="lg">
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 2, sm: 4 }} useFlexGap justifyContent="center" alignItems="center" sx={{ py: 2.5, flexWrap: 'wrap' }}>
            {[
              { Icon: VerifiedUserIcon, t: 'Conforme a LGPD' },
              { Icon: AccessibilityNewIcon, t: 'Acessível em Libras' },
              { Icon: MedicalServicesIcon, t: 'Portal do Médico' },
              { Icon: CreditCardIcon, t: 'Sem cartão pra começar' },
            ].map(({ Icon, t }) => (
              <Stack key={t} direction="row" spacing={1} alignItems="center">
                <Icon sx={{ fontSize: 20, color: TEAL }} />
                <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: 'text.primary' }}>{t}</Typography>
              </Stack>
            ))}
          </Stack>
        </Container>
      </Box>

      {/* FAIXA DE MÉTRICAS — valor concreto, sempre verdadeiro (não depende de volume) */}
      <Box sx={{ bgcolor: 'background.default' }}>
        <Container maxWidth="lg" sx={{ py: { xs: 5, md: 7 } }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: { xs: 2.5, md: 4 }, textAlign: 'center' }}>
            {[
              { n: '< 30s', l: 'pra ler seu exame com IA' },
              { n: '7', l: 'riscos monitorados: diabetes, anemia, colesterol, renal…' },
              { n: '3', l: 'índices que o laudo não dá: IMC, eGFR e HOMA-IR' },
              { n: '100%', l: 'educativo · LGPD · nunca um diagnóstico' },
            ].map((m) => (
              <Box key={m.l}>
                <Typography sx={{ fontSize: { xs: '1.8rem', md: '2.4rem' }, fontWeight: 800, color: TEAL_DARK, lineHeight: 1, mb: 0.75, fontFamily: '"Poppins","Inter",sans-serif', letterSpacing: '-0.02em' }}>{m.n}</Typography>
                <Typography sx={{ fontSize: 13.5, color: 'text.secondary', maxWidth: 230, mx: 'auto', lineHeight: 1.45 }}>{m.l}</Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* BENEFÍCIOS */}
      <Container maxWidth="lg" id="beneficios" sx={{ py: { xs: 8, md: 11 }, scrollMarginTop: 80 }}>
        <Reveal>
          <Typography align="center" variant="h2" sx={{ fontSize: { xs: '1.9rem', md: '2.6rem' }, fontWeight: 800, color: 'text.primary', mb: 1.5, letterSpacing: '-0.02em' }}>
            Tudo que você precisa pra dominar sua saúde
          </Typography>
          <Typography align="center" sx={{ color: 'text.secondary', fontSize: 17, mb: 3, maxWidth: 620, mx: 'auto' }}>
            Não é só um leitor de PDF. É um assistente completo que entende, compara e prevê.
          </Typography>
        </Reveal>
        {/* F2 — filtro por categoria (mata o "wall of text" sem deletar conteúdo) */}
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', justifyContent: 'center', mb: 4, rowGap: 1 }}>
          {CATS.map((c) => (
            <Box
              key={c}
              component="button"
              onClick={() => setCat(c)}
              sx={{
                px: 2, py: 0.85, borderRadius: 99, cursor: 'pointer', fontSize: 13.5, fontWeight: 700, textTransform: 'none',
                border: '1px solid', borderColor: cat === c ? TEAL : 'divider',
                bgcolor: cat === c ? TEAL : 'background.paper',
                color: cat === c ? '#fff' : 'text.secondary',
                transition: 'all .15s ease',
                '&:hover': { borderColor: TEAL, color: cat === c ? '#fff' : TEAL_DARK },
              }}
            >{c}</Box>
          ))}
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr 1fr' }, gap: 2.5 }}>
          {benefits.filter((b) => cat === 'Todos' || catOf(b.title) === cat).map((b, i) => (
            <Fade key={b.title} in timeout={300 + i * 60}>
              <Box sx={{
                p: 3, borderRadius: 4, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', height: '100%',
                transition: 'all .2s ease',
                '&:hover': { boxShadow: '0 16px 36px rgba(32,178,170,.12)', transform: 'translateY(-5px)', borderColor: TEAL },
              }}>
                <Box sx={{ width: 48, height: 48, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2, background: 'linear-gradient(135deg,rgba(32,178,170,.14),rgba(32,178,170,.06))' }}>
                  <b.Icon sx={{ fontSize: 26, color: TEAL_DARK }} />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 800, fontSize: 16.5, color: 'text.primary', mb: 1 }}>{b.title}</Typography>
                <Typography sx={{ fontSize: 14, color: 'text.secondary', lineHeight: 1.6 }}>{b.desc}</Typography>
              </Box>
            </Fade>
          ))}
        </Box>
      </Container>

      {/* SHOWCASE — Veja na prática (mockups reais) */}
      <Box sx={{ bgcolor: 'background.paper', borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider', py: { xs: 8, md: 11 } }}>
        <Container maxWidth="lg">
          <Typography align="center" variant="h2" sx={{ fontSize: { xs: '1.9rem', md: '2.6rem' }, fontWeight: 800, color: 'text.primary', mb: 1.5, letterSpacing: '-0.02em' }}>
            Veja na prática
          </Typography>
          <Typography align="center" sx={{ color: 'text.secondary', fontSize: 17, mb: 6, maxWidth: 600, mx: 'auto' }}>
            Um passeio pela plataforma — do upload do exame ao relatório com IA. Passe o mouse pra pausar.
          </Typography>
          <SlideCarousel />

        </Container>
      </Box>

      {/* SEÇÃO — Descubra seu risco + plano de ação (NOVO) */}
      <Box sx={{ bgcolor: 'background.default', py: { xs: 8, md: 11 } }}>
        <Container maxWidth="lg">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: { xs: 5, md: 7 }, alignItems: 'center' }}>
            {/* mockup do RiskCard (esquerda) */}
            <Box sx={{ display: 'flex', justifyContent: 'center', order: { xs: 2, md: 1 } }}>
              <Box sx={{ width: '100%', maxWidth: 380, borderRadius: 4, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', boxShadow: '0 20px 44px rgba(15,61,58,.10)', p: 2.5, background: 'linear-gradient(135deg, rgba(234,88,12,.06), rgba(234,88,12,.02))' }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                  <HealthAndSafetyIcon sx={{ color: '#ea580c' }} />
                  <Typography sx={{ fontWeight: 800, flex: 1 }}>Leitura de risco</Typography>
                  <Chip size="small" label="🟠 Moderado" sx={{ fontWeight: 800, height: 22, bgcolor: 'rgba(234,88,12,.16)', color: '#ea580c' }} />
                </Stack>
                <Stack direction="row" spacing={1} useFlexGap sx={{ mb: 1.5, flexWrap: 'wrap' }}>
                  <Chip size="small" label="↓ Risco caiu desde 11/06" sx={{ fontWeight: 700, height: 22, bgcolor: 'rgba(22,163,74,.14)', color: '#16a34a' }} />
                </Stack>
                <Typography sx={{ fontWeight: 800, color: '#ea580c', mb: 1.25 }}>Possível risco de colesterol alto</Typography>
                <Stack spacing={0.6} sx={{ mb: 1.5 }}>
                  {[{ n: 'LDL', v: '190 mg/dL' }, { n: 'Triglicerídeos', v: '260 mg/dL' }, { n: 'HDL', v: '35 mg/dL' }].map((f) => (
                    <Box key={f.n} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.3, borderBottom: '1px dashed', borderColor: 'divider' }}>
                      <Chip size="small" label={`🟠 ${f.v}`} sx={{ fontWeight: 700, height: 20, bgcolor: 'rgba(234,88,12,.14)', color: '#ea580c' }} />
                      <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>{f.n}</Typography>
                    </Box>
                  ))}
                </Stack>
                <Box sx={{ borderRadius: 2, bgcolor: 'action.hover', p: 1.25 }}>
                  <Typography sx={{ fontWeight: 800, fontSize: '0.85rem', mb: 0.25, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <AutoStoriesIcon sx={{ fontSize: 16 }} /> Plano de ação do Dr. Exame
                  </Typography>
                  <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', lineHeight: 1.4 }}>
                    Reduza carnes vermelhas e frituras; mais aveia e azeite. Refazer perfil lipídico em 3 meses.
                  </Typography>
                </Box>
                <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 1, color: 'text.secondary' }}>*Educativo. Não substitui consulta médica.</Typography>
              </Box>
            </Box>
            {/* texto (direita) */}
            <Box sx={{ order: { xs: 1, md: 2 } }}>
              <Chip icon={<MonitorHeartIcon sx={{ fontSize: 17 }} />} label="Leitura de risco + plano de ação" sx={{ bgcolor: 'rgba(234,88,12,.12)', color: '#c2410c', fontWeight: 700, mb: 3, fontSize: 13, pl: 1, '& .MuiChip-icon': { color: '#ea580c' } }} />
              <Typography variant="h2" sx={{ fontSize: { xs: '1.8rem', md: '2.4rem' }, fontWeight: 800, color: 'text.primary', mb: 2, letterSpacing: '-0.02em' }}>Descubra seu risco — e o que fazer</Typography>
              <Typography sx={{ fontSize: 17, color: 'text.secondary', mb: 3.5, lineHeight: 1.6 }}>
                A IA cruza seus exames e aponta <b style={{ color: 'text.primary' }}>possíveis riscos</b> (diabetes, pré-diabetes, anemia, hipertensão, colesterol e cardiovascular) — e monta um <b style={{ color: 'text.primary' }}>plano de ação</b> personalizado: hábitos, quando refazer e perguntas pra levar ao médico.
              </Typography>
              {[
                'Detecta pré-diabetes — faixa que a maioria ignora e que é reversível.',
                'Plano de ação gerado por IA: o que fazer, quando refazer, o que perguntar.',
                'Tendência de risco: veja se seu risco caiu ou subiu ao longo do tempo.',
                'Sempre educativo: nunca diagnóstico. A decisão é do seu médico.',
              ].map((t) => (
                <Stack key={t} direction="row" spacing={1.25} alignItems="flex-start" sx={{ mb: 1.75 }}>
                  <CheckCircleIcon sx={{ fontSize: 20, color: GREEN, mt: 0.1, flexShrink: 0 }} />
                  <Typography sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.5 }}>{t}</Typography>
                </Stack>
              ))}
              <Button variant="contained" color="primary" onClick={() => navigate('/registrar')} sx={{ mt: 1.5, borderRadius: 99, px: 4, py: 1.3, textTransform: 'none', fontWeight: 800 }}>Ver minha leitura de risco</Button>
            </Box>
          </Box>
        </Container>
      </Box>

      {/* COMO SEUS DADOS FLUEM — mata o ceticismo de IA em saúde */}
      <Box sx={{ bgcolor: 'background.paper', borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider', py: { xs: 8, md: 11 } }}>
        <Container maxWidth="lg">
          <Typography align="center" variant="h2" sx={{ fontSize: { xs: '1.9rem', md: '2.6rem' }, fontWeight: 800, color: 'text.primary', mb: 1.5, letterSpacing: '-0.02em' }}>A IA não inventa números</Typography>
          <Typography align="center" sx={{ color: 'text.secondary', fontSize: 17, mb: 6, maxWidth: 660, mx: 'auto', lineHeight: 1.6 }}>
            Seus valores saem <b style={{ color: 'text.primary' }}>direto do laudo</b>. A IA só explica o que já está escrito — com criptografia e no seu controle do começo ao fim.
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(5, 1fr)' }, gap: { xs: 2, md: 1.5 } }}>
            {[
              { Icon: UploadFileIcon, t: '1. Você envia', d: 'PDF ou foto do exame. O arquivo fica fora do banco — só o caminho é guardado.' },
              { Icon: DescriptionIcon, t: '2. Leitura do laudo', d: 'Cada valor é extraído do documento, com a página de origem. Nada é chutado.' },
              { Icon: LockIcon, t: '3. Criptografia', d: 'Dados sensíveis (CPF/RG) cifrados com pgcrypto. PDFs nunca vão pro banco.' },
              { Icon: AutoAwesomeIcon, t: '4. A IA explica', d: 'Compara com a referência, calcula índices e monta o plano — sem inventar.' },
              { Icon: VerifiedUserIcon, t: '5. Só você vê', d: 'Compartilha por link com PIN e revoga quando quiser. Exclusão total a qualquer momento.' },
            ].map((s) => (
              <Box key={s.t} sx={{ p: 2.5, borderRadius: 4, border: '1px solid', borderColor: 'divider', bgcolor: 'background.default', height: '100%' }}>
                <Box sx={{ width: 44, height: 44, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1.5, background: 'linear-gradient(135deg,rgba(32,178,170,.14),rgba(32,178,170,.06))' }}>
                  <s.Icon sx={{ fontSize: 24, color: TEAL_DARK }} />
                </Box>
                <Typography sx={{ fontWeight: 800, fontSize: 14.5, color: 'text.primary', mb: 0.5 }}>{s.t}</Typography>
                <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.5 }}>{s.d}</Typography>
              </Box>
            ))}
          </Box>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ mt: 4 }}>
            <LockIcon sx={{ fontSize: 18, color: GREEN }} />
            <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>Conforme a LGPD · Análise educativa, nunca um diagnóstico.</Typography>
          </Stack>
        </Container>
      </Box>

      {/* SEÇÃO — Pré-Consulta Dr. Exame (médico) */}
      <Box sx={{ bgcolor: 'background.default', py: { xs: 8, md: 11 } }}>
        <Container maxWidth="lg">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: { xs: 5, md: 7 }, alignItems: 'center' }}>
            {/* texto */}
            <Box>
              <Chip icon={<MedicalServicesIcon sx={{ fontSize: 17 }} />} label="Dr. Exame Pro (médico)" sx={{ bgcolor: 'rgba(212,165,116,.16)', color: '#b88a54', fontWeight: 700, mb: 3, fontSize: 13, pl: 1, '& .MuiChip-icon': { color: '#b88a54' } }} />
              <Typography variant="h2" sx={{ fontSize: { xs: '1.8rem', md: '2.4rem' }, fontWeight: 800, color: 'text.primary', mb: 2, letterSpacing: '-0.02em' }}>O médico acessa o prontuário e tem tudo pronto em 1 minuto</Typography>
              <Typography sx={{ fontSize: 17, color: 'text.secondary', mb: 3.5, lineHeight: 1.6 }}>
                Quando o paciente compartilha, o médico recebe um <b style={{ color: 'text.primary' }}>resumo clínico automático</b>: principais mudanças, risco, o que investigar, e até as perguntas que o paciente fez no app. Economiza tempo de revisão de cada prontuário.
              </Typography>
              {[
                '🩺 Top 3 mudanças desde a última visita — sem revisar prontuário inteiro.',
                '🛡️ Risco + tendência + marcadores a investigar — num relance.',
                '📝 SOAP rascunho gerado por IA (S/O/A/P) — o médico só revisa e edita.',
                '💬 Perguntas que o paciente fez no app — leve direto pra consulta.',
                '🏥 Exportar PES com CID-10 sugerido — copie direto pro prontuário.',
              ].map((t) => (
                <Stack key={t} direction="row" spacing={1.25} alignItems="flex-start" sx={{ mb: 1.75 }}>
                  <CheckCircleIcon sx={{ fontSize: 20, color: GREEN, mt: 0.1, flexShrink: 0 }} />
                  <Typography sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.5 }}>{t}</Typography>
                </Stack>
              ))}
              <Button variant="contained" color="primary" onClick={() => navigate('/doctor')} sx={{ mt: 1.5, borderRadius: 99, px: 4, py: 1.3, textTransform: 'none', fontWeight: 800 }}>Conhecer o Portal do Médico →</Button>
            </Box>
            {/* mockup do brief */}
            <Box sx={{ display: 'flex', justifyContent: 'center', order: { xs: 2, md: 1 } }}>
              <Box sx={{ width: '100%', maxWidth: 380, borderRadius: 4, bgcolor: 'background.paper', border: `2px solid ${TEAL}`, boxShadow: '0 20px 44px rgba(15,61,58,.10)', p: 2.5 }}>
                <Typography sx={{ fontWeight: 800, color: TEAL_DARK, mb: 1.5, fontSize: 16 }}>🩺 PRÉ-CONSULTA · desde 15/05</Typography>
                <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>⚠️ TOP 3 PRA HOJE</Typography>
                <Stack spacing={0.5} sx={{ mt: 0.5, mb: 1.5 }}>
                  {[{ n: 'Creatinina', d: '↑ 22%' }, { n: 'HDL', d: '↓ 15%' }, { n: 'Testosterona', d: '↑ elevada' }].map((x, i) => (
                    <Stack key={i} direction="row" spacing={0.75} alignItems="center">
                      <Chip size="small" label={i + 1} sx={{ height: 20, width: 20, bgcolor: i === 0 ? '#dc262622' : '#ea580c22', color: i === 0 ? '#dc2626' : '#ea580c', fontWeight: 800, fontSize: 11 }} />
                      <Typography sx={{ fontWeight: 600, fontSize: '0.85rem' }}>{x.n}</Typography>
                      <Chip size="small" label={x.d} sx={{ height: 20, fontSize: 11, bgcolor: x.d.includes('↓') ? '#dbeafe' : '#fef3c7', color: x.d.includes('↓') ? '#1e40af' : '#92400e', fontWeight: 700 }} />
                    </Stack>
                  ))}
                </Stack>
                <Typography variant="body2" sx={{ mb: 1 }}><b>Risco:</b> 🟠 Moderado (cardiovascular) · ↓ caiu</Typography>
                <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>🔬 INVESTIGAR</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>• TGO/TGP · Microalbuminúria</Typography>
                <Box sx={{ borderRadius: 2, bgcolor: 'action.hover', p: 1.25, mt: 1 }}>
                  <Typography sx={{ fontWeight: 800, fontSize: '0.85rem', mb: 0.25 }}>📝 SOAP (rascunho IA)</Typography>
                  <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', lineHeight: 1.4 }}>S: Uso de Masteron... O: Creatinina 1,4 (↑22%)... A: Risco cardiovascular... P: Solicitar TGO/TGP...</Typography>
                </Box>
              </Box>
            </Box>
          </Box>
        </Container>
      </Box>

      {/* SEÇÃO — Compartilhe com seu médico (paciente) */}
      <Box sx={{ bgcolor: 'background.paper', borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider', py: { xs: 8, md: 11 } }}>
        <Container maxWidth="lg">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: { xs: 5, md: 7 }, alignItems: 'center' }}>
            {/* texto */}
            <Box>
              <Chip icon={<ShareIcon sx={{ fontSize: 17 }} />} label="Compartilhamento" sx={{ bgcolor: 'rgba(32,178,170,.12)', color: TEAL_DARK, fontWeight: 700, mb: 3, fontSize: 13, pl: 1, '& .MuiChip-icon': { color: TEAL } }} />
              <Typography variant="h2" sx={{ fontSize: { xs: '1.8rem', md: '2.4rem' }, fontWeight: 800, color: 'text.primary', mb: 2, letterSpacing: '-0.02em' }}>Compartilhe com seu médico — você no controle</Typography>
              <Typography sx={{ fontSize: 17, color: 'text.secondary', mb: 3.5, lineHeight: 1.6 }}>
                Escolha o que enviar, indique pelo CRM e seu médico é cadastrado sozinho. Revoga quando quiser — ele perde o acesso na hora.
              </Typography>
              {[
                { Icon: DescriptionIcon, t: 'Você escolhe os escopos: Exames, Evolução, Alertas e Resumos IA.' },
                { Icon: AssignmentIndIcon, t: 'Indica o médico pelo CRM — ele recebe um aviso por e-mail.' },
                { Icon: LockIcon, t: 'Revoga o acesso a qualquer momento, com 1 toque.' },
              ].map(({ Icon, t }) => (
                <Stack key={t} direction="row" spacing={1.5} alignItems="flex-start" sx={{ mb: 2 }}>
                  <Box sx={{ width: 34, height: 34, borderRadius: 2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(32,178,170,.10)' }}><Icon sx={{ fontSize: 19, color: TEAL_DARK }} /></Box>
                  <Typography sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.5, pt: 0.4 }}>{t}</Typography>
                </Stack>
              ))}
              <Button variant="contained" color="primary" onClick={() => navigate('/registrar')} sx={{ mt: 1.5, borderRadius: 99, px: 4, py: 1.3, textTransform: 'none', fontWeight: 800 }}>Começar grátis</Button>
            </Box>
            {/* mockup */}
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <Box sx={{ width: '100%', maxWidth: 400, borderRadius: 5, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', boxShadow: '0 20px 44px rgba(15,61,58,.10)', p: 3 }}>
                <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 1 }}>O que compartilhar:</Typography>
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', rowGap: 1, mb: 2.5 }}>
                  {([{ Icon: DescriptionIcon, l: 'Exames', on: true }, { Icon: TrendingUpIcon, l: 'Evolução', on: true }, { Icon: WarningAmberIcon, l: 'Alertas', on: true }, { Icon: AutoAwesomeIcon, l: 'Resumos IA', on: false }] as const).map(({ Icon, l, on }) => (
                    <Chip key={l} icon={<Icon sx={{ fontSize: 16 }} />} label={l} size="small" sx={{ bgcolor: on ? 'rgba(16,185,129,.12)' : 'action.hover', color: on ? '#047857' : 'text.secondary', fontWeight: 700, border: on ? '1px solid #6ee7b7' : '1px solid', borderColor: on ? '#6ee7b7' : 'divider', '& .MuiChip-icon': { color: on ? GREEN : 'text.secondary' } }} />
                  ))}
                </Stack>
                <Box sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'background.default', px: 1.5, py: 1.25, mb: 2.5 }}>
                  <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>CRM do médico</Typography>
                  <Typography sx={{ fontSize: 15, fontWeight: 700, color: 'text.primary' }}>12345-SP • Dra. Helena Costa</Typography>
                </Box>
                <Button fullWidth variant="contained" color="primary" sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700 }}>Compartilhar dados</Button>
                <Typography sx={{ fontSize: 11.5, color: 'text.secondary', mt: 1.5, textAlign: 'center' }}>🔒 Você pode revogar a qualquer momento.</Typography>
              </Box>
            </Box>
          </Box>
        </Container>
      </Box>

      {/* SEÇÃO — Portal do Médico */}
      <Box id="portal-medico" sx={{ bgcolor: 'background.default', py: { xs: 8, md: 11 }, scrollMarginTop: 80 }}>
        <Container maxWidth="lg">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: { xs: 5, md: 7 }, alignItems: 'center' }}>
            {/* mockup (esquerda) */}
            <Box sx={{ display: 'flex', justifyContent: 'center', order: { xs: 2, md: 1 } }}>
              <Box sx={{ width: '100%', maxWidth: 400, borderRadius: 5, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', boxShadow: '0 20px 44px rgba(15,61,58,.10)', p: 3 }}>
                <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 2 }}>
                  <Box sx={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#20b2aa,#178f89)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MedicalServicesIcon sx={{ color: '#fff', fontSize: 22 }} /></Box>
                  <Box><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Portal do Médico</Typography><Typography sx={{ fontSize: 15, fontWeight: 800, color: 'text.primary' }}>Pacientes que compartilharam (3)</Typography></Box>
                </Stack>
                <Box sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', p: 2, mb: 1.5 }}>
                  <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.25 }}>
                    <Box sx={{ width: 38, height: 38, borderRadius: '50%', bgcolor: '#d4a574' }} />
                    <Box sx={{ flex: 1 }}><Typography sx={{ fontSize: 14, fontWeight: 800, color: 'text.primary' }}>Heloísa Santos</Typography><Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>Particular • desde jan/2026</Typography></Box>
                    <Chip label="2 alterados" size="small" sx={{ bgcolor: 'rgba(239,68,68,.12)', color: '#ef4444', fontWeight: 700, fontSize: 11 }} />
                  </Stack>
                  <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
                    {([{ Icon: DescriptionIcon, l: 'Exames' }, { Icon: TrendingUpIcon, l: 'Evolução' }, { Icon: WarningAmberIcon, l: 'Alertas' }] as const).map(({ Icon, l }) => (
                      <Chip key={l} icon={<Icon sx={{ fontSize: 15 }} />} label={l} size="small" sx={{ bgcolor: 'rgba(32,178,170,.10)', color: TEAL_DARK, fontWeight: 600, fontSize: 11, '& .MuiChip-icon': { color: TEAL } }} />
                    ))}
                  </Stack>
                </Box>
                <Box sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', p: 2, opacity: .6 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary' }}>José Lima</Typography>
                  <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>Unimed • 📋 Exames, 🤖 Resumos IA</Typography>
                </Box>
              </Box>
            </Box>
            {/* texto (direita) */}
            <Box sx={{ order: { xs: 1, md: 2 } }}>
              <Chip icon={<MedicalServicesIcon sx={{ fontSize: 17 }} />} label="Para profissionais de saúde" sx={{ bgcolor: 'rgba(212,165,116,.16)', color: '#b88a54', fontWeight: 700, mb: 3, fontSize: 13, pl: 1, '& .MuiChip-icon': { color: '#b88a54' } }} />
              <Typography variant="h2" sx={{ fontSize: { xs: '1.8rem', md: '2.4rem' }, fontWeight: 800, color: 'text.primary', mb: 2, letterSpacing: '-0.02em' }}>O paciente chega pronto no seu consultório</Typography>
              <Typography sx={{ fontSize: 17, color: 'text.secondary', mb: 3.5, lineHeight: 1.6 }}>
                Use o <Box component="span" sx={{ color: 'text.primary', fontWeight: 800 }}>mesmo CRM</Box> que seu paciente informou no convite. Ele aparece automaticamente no seu painel — com exames, valores alterados, evolução e o PDF original.
              </Typography>
              {[
                'Pré-cadastro automático quando o paciente indica pelo CRM.',
                'Exames, Alertas, Evolução e Resumos IA — só o que o paciente autorizou.',
                'Valores alterados em destaque + PDF original do laboratório.',
              ].map((t) => (
                <Stack key={t} direction="row" spacing={1.25} alignItems="flex-start" sx={{ mb: 1.75 }}>
                  <CheckCircleIcon sx={{ fontSize: 20, color: GREEN, mt: 0.1, flexShrink: 0 }} />
                  <Typography sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.5 }}>{t}</Typography>
                </Stack>
              ))}
              <Button variant="contained" color="primary" onClick={() => navigate('/doctor')} sx={{ mt: 1.5, borderRadius: 99, px: 4, py: 1.3, textTransform: 'none', fontWeight: 800 }}>Acessar o Portal do Médico →</Button>
            </Box>
          </Box>
        </Container>
      </Box>

      {/* COMO FUNCIONA */}
      <Box id="como-funciona" sx={{ bgcolor: 'background.default', py: { xs: 8, md: 11 }, scrollMarginTop: 80 }}>
        <Container maxWidth="lg">
          <Typography align="center" variant="h2" sx={{ fontSize: { xs: '1.9rem', md: '2.6rem' }, fontWeight: 800, color: 'text.primary', mb: 1.5, letterSpacing: '-0.02em' }}>
            Como funciona
          </Typography>
          <Typography align="center" sx={{ color: 'text.secondary', fontSize: 17, mb: 6 }}>4 passos. Do exame ao médico.</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr 1fr' }, gap: 4 }}>
            {steps.map((s) => (
              <Box key={s.n} sx={{ textAlign: 'center' }}>
                <Box sx={{ position: 'relative', width: 76, height: 76, mx: 'auto', mb: 2.5 }}>
                  <Box sx={{ width: 76, height: 76, borderRadius: '50%', background: 'linear-gradient(135deg,#20b2aa,#178f89)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 26px rgba(32,178,170,.35)' }}>
                    <s.Icon sx={{ fontSize: 34, color: '#fff' }} />
                  </Box>
                  <Box sx={{ position: 'absolute', top: -6, right: -6, width: 26, height: 26, borderRadius: '50%', bgcolor: 'background.paper', border: '2px solid #20b2aa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: TEAL_DARK }}>{s.n}</Box>
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 800, fontSize: 18, color: 'text.primary', mb: 1 }}>{s.title}</Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: 15, lineHeight: 1.6, maxWidth: 290, mx: 'auto' }}>{s.desc}</Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* NOVO — Seu médico te chama (funil de aquisição via médico) */}
      <Box sx={{ py: { xs: 8, md: 11 }, background: 'linear-gradient(180deg, rgba(32,178,170,.06), transparent 45%)' }}>
        <Container maxWidth="lg">
          <Reveal>
            <Stack alignItems="center" spacing={1.5} sx={{ textAlign: 'center', mb: 6 }}>
              <Chip label="✨ NOVIDADE" sx={{ bgcolor: 'rgba(32,178,170,.12)', color: TEAL_DARK, fontWeight: 800, letterSpacing: 1.5, fontSize: 12 }} />
              <Typography variant="h2" sx={{ fontSize: { xs: '1.9rem', md: '2.6rem' }, fontWeight: 800, color: INK, letterSpacing: '-0.02em', maxWidth: 760 }}>
                Seu médico te chama pro Dr. Exame
              </Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: 17, maxWidth: 640, lineHeight: 1.6 }}>
                Sem papel, sem app do consultório. Seu médico te manda um link no WhatsApp, você instala e ele <b>já fica conectado</b> aos seus exames — na hora, sem configurar nada.
              </Typography>
            </Stack>
          </Reveal>

          <Reveal>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: { xs: 2.5, md: 3.5 }, maxWidth: 940, mx: 'auto' }}>
              {[
                { Icon: PersonAddAlt1Icon, t: 'Seu médico envia o convite', d: 'No consultório ou no WhatsApp, ele te chama com um link. Você não procura o app — é ele quem te encontra.', color: TEAL },
                { Icon: SmartphoneIcon, t: 'Você instala em 1 toque', d: 'Abre o link, cria sua conta e sobe o exame que ele pediu. Leva menos de um minuto.', color: '#d4a574' },
                { Icon: VerifiedUserIcon, t: 'Conexão automática', d: 'O compartilhamento com seu médico já vem ativado. Ele chega à consulta com um resumo do que importa — antes mesmo de você.', color: GREEN },
              ].map((s, i) => (
                <Box key={i} sx={{ textAlign: 'center', bgcolor: 'background.paper', borderRadius: 4, border: '1px solid', borderColor: 'divider', p: { xs: 2.5, md: 3 }, boxShadow: '0 14px 32px rgba(15,61,58,.07)', position: 'relative', height: '100%' }}>
                  <Box sx={{ width: 64, height: 64, mx: 'auto', mb: 2, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${s.color}, ${s.color}cc)`, boxShadow: `0 10px 22px ${s.color}40` }}>
                    <s.Icon sx={{ fontSize: 30, color: '#fff' }} />
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 800, fontSize: 17, color: 'text.primary', mb: 0.75 }}>{s.t}</Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: 14.5, lineHeight: 1.6 }}>{s.d}</Typography>
                  {i === 2 && <Chip size="small" label="já vem ativo ✓" sx={{ position: 'absolute', top: 12, right: 12, bgcolor: 'rgba(5,150,105,.12)', color: GREEN, fontWeight: 800, fontSize: 11 }} />}
                </Box>
              ))}
            </Box>
          </Reveal>

          <Reveal>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center" alignItems="stretch" sx={{ mt: 6, maxWidth: 780, mx: 'auto' }}>
              <Box sx={{ flex: 1, borderRadius: 4, p: 3, background: 'linear-gradient(135deg,#20b2aa,#178f89)', color: '#fff' }}>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}><MedicalServicesIcon /><Typography sx={{ fontWeight: 800, fontSize: 18 }}>Pra você, paciente</Typography></Stack>
                <Typography sx={{ fontSize: 14.5, lineHeight: 1.55, opacity: 0.92, mb: 2 }}>Seu médico ainda não te chamou? Crie sua conta e indique-o pelo CRM em segundos.</Typography>
                <Button variant="contained" onClick={() => navigate('/registrar')} sx={{ bgcolor: '#fff', color: TEAL_DARK, borderRadius: 99, textTransform: 'none', fontWeight: 800, boxShadow: 'none', '&:hover': { bgcolor: '#eefaf9' } }}>Criar conta grátis</Button>
              </Box>
              <Box sx={{ flex: 1, borderRadius: 4, p: 3, bgcolor: 'background.paper', border: `2px solid ${TEAL}` }}>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}><AssignmentIndIcon sx={{ color: TEAL_DARK }} /><Typography sx={{ fontWeight: 800, fontSize: 18, color: INK }}>Pra você, médico</Typography></Stack>
                <Typography sx={{ fontSize: 14.5, lineHeight: 1.55, color: 'text.secondary', mb: 2 }}>Convide seus pacientes pelo portal e receba um brief de pré-consulta de cada um. Conheça o Dr. Exame Pro.</Typography>
                <Button variant="outlined" onClick={() => navigate('/doctor')} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 800, borderColor: TEAL, color: TEAL_DARK, '&:hover': { borderColor: TEAL_DARK, bgcolor: 'rgba(32,178,170,.06)' } }}>Portal do médico →</Button>
              </Box>
            </Stack>
          </Reveal>
        </Container>
      </Box>

      {/* F4 — calculadora de IMC (ferramenta didática ao vivo, sem cadastro) */}
      <BmiCalculator />

      {/* DEPOIMENTOS — prova social (trocar por reais com permissão quando tiver) */}
      <Box sx={{ bgcolor: 'background.default', py: { xs: 8, md: 11 } }}>
        <Container maxWidth="lg">
          <Typography align="center" variant="h2" sx={{ fontSize: { xs: '1.9rem', md: '2.6rem' }, fontWeight: 800, color: 'text.primary', mb: 1.5, letterSpacing: '-0.02em' }}>Quem usa, entende a diferença</Typography>
          <Typography align="center" sx={{ color: 'text.secondary', fontSize: 17, mb: 6, maxWidth: 600, mx: 'auto' }}>Histórias de quem parou de guardar o exame sem entender.</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 3 }}>
            {[
              { i: 'E', n: 'Edna Aparecida', c: 'Hipotireoidismo controlado', q: 'Tinha uma pilha de exames na gaveta. O Dr. Exame explicou cada valor da tireoide antes da consulta — cheguei sabendo o que perguntar.', color: '#d4a574' },
              { i: 'H', n: 'Heloisa Cristina', c: 'Pré-diabetes revertido', q: 'Vi que a glicose estava subindo a cada exame. Mudei a alimentação e, na consulta seguinte, já tinha normalizado.', color: TEAL },
              { i: 'M', n: 'Melissa Fernandes', c: 'Acompanha com o cardiologista', q: 'Gero o relatório e mando pro meu médico antes da consulta. Ele já chega sabendo o que mudou — a consulta rende muito mais.', color: '#0ea5e9' },
              { i: 'T', n: 'Thomé Eduardo', c: 'Colesterol em queda', q: 'O comparativo mostrou o colesterol caindo exame após exame. Ver o gráfico fez toda a diferença pra eu manter o tratamento.', color: '#16a34a' },
              { i: 'Q', n: 'Quenaz Silva', c: 'Cuida da mãe e dos filhos', q: 'Guardo os exames da minha mãe e das crianças no app. Quando o pediatra ou o geriatra pede, está tudo lá, organizado.', color: '#d4a574' },
              { i: 'L', n: 'Leandro Porto', c: 'Anemia tratada', q: 'Tava cansado pra tudo. O app flagrou a ferro baixa, levei ao médico, recebi a reposição e voltou ao normal.', color: TEAL },
              { i: 'D', n: 'Daniel Oliveira', c: 'Check-up em dia', q: 'Faço exame de rotina todo ano. O score de saúde me dá a visão geral em segundos — sei o que está em dia e o que refazer.', color: '#0ea5e9' },
              { i: 'N', n: 'Natália Fernandes', c: 'Saiu da ansiedade com o laudo', q: 'Antes eu googlava cada valor e ficava mais confusa. Agora a IA explica na hora, sem jargão — saí daquele ciclo de ansiedade.', color: '#16a34a' },
            ].map((t) => (
              <Box key={t.n} sx={{ p: 3.5, borderRadius: 4, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Typography sx={{ fontSize: 56, lineHeight: 0.5, color: TEAL, fontFamily: 'Georgia, serif', mb: 1.5 }}>“</Typography>
                <Typography sx={{ fontSize: 15, color: 'text.primary', lineHeight: 1.6, mb: 2.5, flex: 1 }}>{t.q}</Typography>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Box sx={{ width: 42, height: 42, borderRadius: '50%', bgcolor: t.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 17, fontFamily: '"Poppins","Inter",sans-serif' }}>{t.i}</Box>
                  <Box>
                    <Typography sx={{ fontWeight: 800, fontSize: 14.5, color: 'text.primary' }}>{t.n}</Typography>
                    <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>{t.c}</Typography>
                  </Box>
                </Stack>
              </Box>
            ))}
          </Box>
          <Typography align="center" sx={{ mt: 3, fontSize: 12, color: 'text.secondary', opacity: 0.7 }}>Quem já usa o Dr. Exame no dia a dia.</Typography>
        </Container>
      </Box>

      {/* COMPARATIVO — posicionamento (Dr. Exame vs alternativas) */}
      <Box sx={{ bgcolor: 'background.paper', borderTop: '1px solid', borderColor: 'divider', py: { xs: 8, md: 11 } }}>
        <Container maxWidth="md">
          <Typography align="center" variant="h2" sx={{ fontSize: { xs: '1.9rem', md: '2.6rem' }, fontWeight: 800, color: 'text.primary', mb: 1.5, letterSpacing: '-0.02em' }}>Por que não basta ler o papel?</Typography>
          <Typography align="center" sx={{ color: 'text.secondary', fontSize: 17, mb: 5, maxWidth: 600, mx: 'auto' }}>O que o Dr. Exame faz que o laudo, o Google e a espera pela consulta não fazem.</Typography>
          <Box sx={{ borderRadius: 4, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
            {/* cabeçalho */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1.6fr 1fr 1fr', md: '1.8fr 1fr 1fr 1fr' }, bgcolor: 'background.default', borderBottom: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ p: 1.75 }} />
              <Box sx={{ p: 1.5, textAlign: 'center', fontWeight: 800, color: TEAL_DARK, fontSize: 13.5 }}>Dr. Exame</Box>
              <Box sx={{ p: 1.5, textAlign: 'center', fontWeight: 700, color: 'text.secondary', fontSize: 12.5 }}>Sozinho / Google</Box>
              <Box sx={{ p: 1.5, textAlign: 'center', fontWeight: 700, color: 'text.secondary', fontSize: 12.5, display: { xs: 'none', md: 'block' } }}>Só na consulta</Box>
            </Box>
            {/* linhas */}
            {[
              { f: 'Explica cada valor em português simples', me: true, diy: false, doc: 'limitado' },
              { f: 'Mostra seu risco (diabetes, colesterol, renal…)', me: true, diy: false, doc: 'limitado' },
              { f: 'Calcula IMC, eGFR e HOMA-IR', me: true, diy: false, doc: false },
              { f: 'Compara com exames anteriores', me: true, diy: 'manual', doc: true },
              { f: 'Disponível agora, a qualquer hora', me: true, diy: true, doc: false },
              { f: 'Plano de ação + perguntas pro médico', me: true, diy: false, doc: 'limitado' },
            ].map((r, idx) => (
              <Box key={r.f} sx={{ display: 'grid', gridTemplateColumns: { xs: '1.6fr 1fr 1fr', md: '1.8fr 1fr 1fr 1fr' }, alignItems: 'center', borderBottom: idx === 5 ? 'none' : '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
                <Box sx={{ p: 1.75, fontSize: 13.5, color: 'text.primary', fontWeight: 600 }}>{r.f}</Box>
                <Box sx={{ p: 1.5, textAlign: 'center' }}>{r.me === true ? <CheckCircleIcon sx={{ fontSize: 20, color: GREEN }} /> : <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>—</Typography>}</Box>
                <Box sx={{ p: 1.5, textAlign: 'center' }}>{r.diy === true ? <CheckCircleIcon sx={{ fontSize: 20, color: GREEN }} /> : r.diy === 'manual' ? <Typography sx={{ fontSize: 11.5, color: '#b45309', fontWeight: 700 }}>manual</Typography> : <Typography sx={{ fontSize: 16, color: 'text.disabled' }}>✕</Typography>}</Box>
                <Box sx={{ p: 1.5, textAlign: 'center', display: { xs: 'none', md: 'block' } }}>{r.doc === true ? <CheckCircleIcon sx={{ fontSize: 20, color: GREEN }} /> : r.doc === 'limitado' ? <Typography sx={{ fontSize: 11.5, color: '#b45309', fontWeight: 700 }}>limitado</Typography> : <Typography sx={{ fontSize: 16, color: 'text.disabled' }}>✕</Typography>}</Box>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* PLANOS */}
      <Box id="planos" sx={{ bgcolor: 'background.paper', borderTop: '1px solid', borderColor: 'divider', py: { xs: 8, md: 11 }, scrollMarginTop: 80 }}>
        <Container maxWidth="md">
          <Typography align="center" variant="h2" sx={{ fontSize: { xs: '1.9rem', md: '2.6rem' }, fontWeight: 800, color: 'text.primary', mb: 1.5, letterSpacing: '-0.02em' }}>Planos simples e justos</Typography>
          <Typography align="center" sx={{ color: 'text.secondary', mb: 6, fontSize: 17 }}>Comece grátis. Assine quando precisar — ou pague só pelo que usar.</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 3, alignItems: 'center' }}>
            {planData.map((p) => (
              <Box key={p.name} sx={{
                p: 3, borderRadius: 5, bgcolor: 'background.paper',
                border: p.highlight ? `2px solid ${TEAL}` : '1px solid',
                borderColor: p.highlight ? TEAL : 'divider',
                boxShadow: p.highlight ? '0 18px 44px rgba(32,178,170,.16)' : '0 2px 8px rgba(0,0,0,.04)',
                position: 'relative', transform: p.highlight ? { xs: 'none', sm: 'scale(1.04)' } : 'none',
              }}>
                {p.highlight && <Chip label="RECOMENDADO" size="small" sx={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', bgcolor: TEAL, color: '#fff', fontWeight: 800, fontSize: 11 }} />}
                <Typography variant="h6" sx={{ fontWeight: 800, fontSize: 18, color: 'text.primary', mb: 1 }}>{p.name}</Typography>
                <Typography sx={{ fontWeight: 800, fontSize: 32, color: p.highlight ? TEAL : 'text.primary', mb: 0.5, lineHeight: 1.1 }}>{p.price}<Typography component="span" sx={{ fontSize: 14, color: 'text.secondary', fontWeight: 600 }}>{p.period}</Typography></Typography>
                <Box sx={{ my: 2, height: 1, bgcolor: 'divider' }} />
                {p.features.map((f) => (
                  <Stack key={f} direction="row" spacing={1} alignItems="center" sx={{ py: 0.5 }}>
                    <CheckCircleIcon sx={{ fontSize: 17, color: GREEN, flexShrink: 0 }} />
                    <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>{f}</Typography>
                  </Stack>
                ))}
                <Button fullWidth variant={p.highlight ? 'contained' : 'outlined'} color="primary" onClick={() => navigate('/registrar')} sx={{ mt: 2.5, borderRadius: 99, textTransform: 'none', fontWeight: 700, ...(p.highlight ? {} : { borderColor: '#bfe7e3', color: TEAL_DARK }) }}>{p.cta}</Button>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* SEÇÃO — Indique e ganhe (programa de indicação) */}
      <Box sx={{ bgcolor: 'background.default', borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider', py: { xs: 8, md: 10 } }}>
        <Container maxWidth="md">
          <Stack direction={{ xs: 'column', md: 'row' }} alignItems="center" spacing={{ xs: 3, md: 6 }} sx={{ textAlign: { xs: 'center', md: 'left' } }}>
            <Box sx={{ fontSize: { xs: 56, md: 72 }, lineHeight: 1, flexShrink: 0 }}>🎁</Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h2" sx={{ fontSize: { xs: '1.7rem', md: '2.3rem' }, fontWeight: 800, color: 'text.primary', mb: 1, letterSpacing: '-0.02em' }}>Indique e ganhe créditos</Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: 17, mb: 2.5 }}>Compartilhe seu código com amigos. Quando alguém cria a conta com ele, <b style={{ color: TEAL_DARK }}>vocês dois ganham +30 créditos</b> — pra usar no Dr. Exame.</Typography>
              <Stack direction="row" spacing={1.5} justifyContent={{ xs: 'center', md: 'flex-start' }} flexWrap="wrap" useFlexGap>
                {[{ n: '+30', l: 'pra você', c: TEAL }, { n: '+30', l: 'pra seu amigo', c: '#0ea5e9' }, { n: '10/mês', l: 'limite anti-abuso', c: 'text.secondary' }].map((x) => (
                  <Box key={x.l} sx={{ px: 2, py: 1, borderRadius: 3, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', textAlign: 'center', minWidth: 92 }}>
                    <Typography sx={{ fontWeight: 800, fontSize: 20, color: x.c, lineHeight: 1.1 }}>{x.n}</Typography>
                    <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>{x.l}</Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
          </Stack>
        </Container>
      </Box>

      {/* F4 — FAQ (mata objeções críticas de IA em saúde) */}
      <FaqSection />

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
                <Box component="img" src={`${import.meta.env.BASE_URL}qr-minhasaude.png`} alt="QR Code - Meus Exames" sx={{ borderRadius: 3, p: 1.5, bgcolor: '#fff', width: 150, height: 150, objectFit: 'contain' }} />
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
            <Box component="img" src={`${import.meta.env.BASE_URL}app-icon.png`} alt="Dr. Exame" sx={{ width: 30, height: 30, borderRadius: '16%' }} />
            <Typography sx={{ fontWeight: 800, color: '#fff', fontSize: 18 }}>Meus Exames</Typography>
          </Stack>
          <Typography sx={{ fontSize: 13, mb: 1 }}>© {new Date().getFullYear()} janocaminho.com.br • contato@janocaminho.com.br</Typography>
          <Typography sx={{ fontSize: 12, opacity: .8, mb: 2 }}>Edmilson Fernandes • CNPJ: 44.771.427/0001-69 • Análise educativa, não substitui consulta médica.</Typography>
          <Stack direction="row" spacing={3} justifyContent="center" useFlexGap sx={{ flexWrap: 'wrap' }}>
            <Box component="span" sx={{ color: '#5fc9c3', cursor: 'pointer', fontSize: 13, fontWeight: 700, '&:hover': { textDecoration: 'underline' } }} onClick={() => navigate('/doctor')}>Portal do Médico</Box>
            <Box component="span" sx={{ color: '#5fc9c3', cursor: 'pointer', fontSize: 13, fontWeight: 700, '&:hover': { textDecoration: 'underline' } }} onClick={() => navigate('/termos')}>Termos e LGPD</Box>
            <Box component="span" sx={{ color: '#5fc9c3', cursor: 'pointer', fontSize: 13, fontWeight: 700, '&:hover': { textDecoration: 'underline' } }} onClick={() => navigate('/registrar')}>Criar conta</Box>
            <Box component="span" sx={{ color: '#5fc9c3', cursor: 'pointer', fontSize: 13, fontWeight: 700, '&:hover': { textDecoration: 'underline' } }} onClick={() => navigate('/entrar')}>Entrar</Box>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
};

// Estilo do botão de nav (texto discreto)
const navBtn = (scrolled: boolean) => ({
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'text.primary', fontWeight: 600, fontSize: 14, textTransform: 'none' as const,
  '&:hover': { color: TEAL_DARK },
});
