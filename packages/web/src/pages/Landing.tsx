import { Box, Container, Typography, Button, Stack, Chip, Fade, Dialog, IconButton } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
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
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import MonitorWeightIcon from '@mui/icons-material/MonitorWeight';
import TuneIcon from '@mui/icons-material/Tune';
import CalculateIcon from '@mui/icons-material/Calculate';
import ChildCareIcon from '@mui/icons-material/ChildCare';
import MedicationIcon from '@mui/icons-material/Medication';
import FamilyRestroomIcon from '@mui/icons-material/FamilyRestroom';
import ScienceIcon from '@mui/icons-material/Science';

import { ExamDemo } from '../components/ExamDemo';
import { FaqSection } from '../components/FaqSection';
import { fetchPublicConfig } from '../config';
import { usePlanInfo, fmtBRL } from '../utils/planInfo';
import { BmiCalculator, BmiCard } from '../components/BmiCalculator';
import { Reveal } from '../components/Reveal';

// ---- Tokens (espelham theme.ts) ----
const TEAL = '#20b2aa';
const TEAL_DARK = '#178f89';
const INK = '#0f5f5a'; // teal-escuro premium p/ textos de destaque / footer
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.janocaminho.drexame&hl=pt_BR'; // app aprovado na Play Store
const GREEN = '#059669';
/** Ênfase editorial (landing v2): Instrument Serif itálica SÓ nas palavras-magnet dos títulos. */
const SERIF_I = { fontFamily: "'Instrument Serif', Georgia, serif", fontStyle: 'italic', fontWeight: 400 } as const;
/** Vídeo do hero — URL provisória (seed open-design); trocar por footage próprio quando houver. Se 404, hero volta ao estático (fallback silencioso). */
const HERO_VIDEO_URL = 'https://plugin-assets.open-design.ai/plugins/innovation/hf_20260405_074625_a81f018a-956b-43fb-9aee-4d1508e30e6a-6993b9.mp4';

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
  { Icon: DirectionsWalkIcon, title: 'Conecta o Health Connect', desc: 'Passos, calorias e distância do celular (Health Connect do Google) entram JUNTO dos seus exames: o Dr. Exame mostra sua atividade da semana do exame e usa como contexto na leitura — estilo de vida e laboratório na mesma história. Só leitura; você autoriza e pode revogar quando quiser.' },
  { Icon: MedicalServicesIcon, title: 'Portal do seu médico', desc: 'Indique pelo CRM e seu médico ganha um brief de pré-consulta: top 3 mudanças do dia, padrões por sistema (glicêmico, renal, lipídico) e exames de seguimento sugeridos — só o que você autorizar.' },
  { Icon: Diversity3Icon, title: 'Toda a família', desc: 'Cada dependente com histórico e evolução próprios, score familiar e comparativo entre membros — e o modo cuidador: a mãe acompanha filho e avó no mesmo app, com aviso de quem é o perfil ativo.' },
  { Icon: ChildCareIcon, title: 'Faixas pediátricas', desc: 'Exame de criança não se lê com régua de adulto. Quando o laudo não traz a faixa da idade, aplicamos bandas pediátricas por analito (Harriet Lane) e marcamos o item — a fosfatase "alta" que é normal aos 4 anos para de dar susto.' },
  { Icon: MedicationIcon, title: 'Remédios + interações', desc: 'Sua lista de medicamentos conferida contra os exames: interações graves (D/X) avisadas de graça, e o preço REAL de farmácia direto no card do remédio — com foto do produto.' },
  { Icon: DescriptionIcon, title: 'Pronto para o médico', desc: 'Relatório de 1 página com valores alterados + perfil clínico. Compartilhe por link seguro com PIN.' },
  { Icon: LockIcon, title: 'Dados protegidos + Libras', desc: 'Seus valores vêm do laudo — a IA não inventa números (extração determinística). Criptografia, PIN de compartilhamento, exclusão a qualquer momento. LGPD completa e VLibras.' },
];

// F2 — categorias pra filtrar o mural de benefícios (mata o "wall of text" sem deletar conteúdo)
const CATS = ['Todos', 'IA & Análise', 'Acompanhamento', 'Médico & Família', 'Segurança'] as const;
const catOf = (t: string): string => {
  if (/Dados protegidos|Remédios/.test(t)) return 'Segurança';
  if (/Portal do seu médico|Toda a família|Pronto para o médico|Faixas pediátricas/.test(t)) return 'Médico & Família';
  if (/Score de Adesão|Alerta preditivo|Comparativo visual|Evolução|Health Connect/.test(t)) return 'Acompanhamento';
  return 'IA & Análise';
};

// 6 benefícios em destaque por padrão (1 por pilar) — o resto fica sob "Ver todos os 15".
const DEFAULT_BENEFITS = new Set(['IA que lê seus exames', 'Leitura de risco', 'Plano de ação do Dr. Exame', 'Índices que o laudo não dá', 'Portal do seu médico', 'Dados protegidos + Libras']);

// Planos da LANDING — preço/créditos/perks vêm da API (admin edita live; honesto por padrão:
// o free é COMPLETO por uso; o mensal vende economia + perks, não "trancas").
const planData = (credits: number, info: ReturnType<typeof usePlanInfo> = null) => {
  const p = info?.plan;
  const perks = info?.premiumPerks;
  const minPack = info?.packs?.length ? Math.min(...info.packs.map((x) => x.price)) : 9.9;
  return [
    { name: 'Grátis', price: 'R$ 0', period: '', features: [`${credits} créditos de presente (≈ ${Math.floor(credits / 10)} resumos de IA)`, 'Tudo funciona: envios, valores, tendências, família', 'Envie exames (PDF/foto)', 'Score de Saúde'], highlight: false, cta: 'Começar grátis' },
    { name: 'Mensal', price: p ? (p.founder && p.price !== p.effectivePrice ? fmtBRL(p.effectivePrice) : fmtBRL(p.price)) : 'R$ —', period: '/mês',
      features: [
        `${p?.monthlyCredits ?? 250} créditos de IA/mês (melhor custo)`,
        '📄 Relatórios completos incluídos',
        '📅 Histórico de anos anteriores',
        `👨‍👩‍👧 Família até ${perks?.familyLimit ?? 10} perfis`,
        '📤 Envios de exame sem custo',
      ], highlight: true, cta: p?.founder ? 'Garantir vaga de fundador' : 'Assinar mensal' },
    { name: 'Créditos', price: `a partir de ${fmtBRL(minPack ?? 9.9)}`, period: 'avulso', features: ['PIX, cartão ou débito', 'Pacotes flexíveis', 'Cada análise consome créditos', 'Sem mensalidade', 'Use quando precisar'], highlight: false, cta: 'Ver pacotes' },
  ];
};

// Carrossel "Veja na prática" — 15 slides da apresentação (Meus_Exames_AI_Platform) em WebP
// (~0,5 MB total — 60× mais leve que o vídeo de 37 MB). Cross-fade suave, auto-rotação,
// pausa no hover, dots clicáveis, clique no slide avança.
const SHOWCASE_SLIDE_COUNT = 15;

// Tour em vídeo (YouTube) — embedado no hero (botão play → modal) e na seção "Veja na prática".
const TOUR_VIDEO_ID = 'jyHezElJyjA';
const TOUR_VIDEO_SRC = `https://www.youtube-nocookie.com/embed/${TOUR_VIDEO_ID}?rel=0`;

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
        borderRadius: '12px', overflow: 'hidden', bgcolor: '#0c2422',
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
              width: idx === i ? 22 : 7, height: 7, borderRadius: '999px',
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
  const [showAllBenefits, setShowAllBenefits] = useState(false);
  const [medTab, setMedTab] = useState<'medico' | 'paciente' | 'convite'>('medico');
  const [tourOpen, setTourOpen] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  const [credits, setCredits] = useState(45);
  const [refBonus, setRefBonus] = useState(10);
  useEffect(() => { fetchPublicConfig().then((c) => { setCredits(c.freeSignup); setRefBonus(c.referralBonus); }); }, []);
  // Preço do plano/packs da API pública (admin edita live — landing nunca mais mente sobre preço).
  const planInfo = usePlanInfo();

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
        .hero-float { animation: heroFloat 6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce){ .hero-float{ animation: none !important; } }
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
            <Box component="button" onClick={() => navigate('/faq')} sx={{ ...navBtn(scrolled), display: { xs: 'none', md: 'inline' } }}>Dúvidas</Box>
            <Button onClick={() => navigate('/entrar')} sx={{ color: TEAL_DARK, fontWeight: 700, textTransform: 'none' }}>Entrar</Button>
            <Button variant="contained" color="primary" size="small" onClick={() => navigate('/registrar')} sx={{ borderRadius: '999px', px: 2.5, textTransform: 'none', fontWeight: 700 }}>Criar conta</Button>
          </Stack>
        </Container>
      </Box>

      {/* HERO — claro premium */}
      <Box sx={{
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(180deg, rgba(32,178,170,.12) 0%, rgba(212,165,116,.04) 35%, transparent 75%)',
        pt: { xs: 11, md: 14 }, pb: { xs: 7, md: 10 },
      }}>
        <Box sx={{ position: 'absolute', top: '-10%', right: '-5%', width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle,rgba(32,178,170,.18),transparent 65%)', pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', bottom: '-15%', left: '-8%', width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle,rgba(212,165,116,.12),transparent 65%)', pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', top: '-5%', left: '-3%', width: 340, height: 340, borderRadius: '50%', background: 'radial-gradient(circle,rgba(212,165,116,.18),transparent 65%)', pointerEvents: 'none' }} />
        {/* Vídeo de textura (v2) — sutil por cima do gradiente claro; some no reduced-motion e em erro de rede */}
        <Box
          component="video"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          src={HERO_VIDEO_URL}
          aria-hidden="true"
          sx={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
            opacity: 0.16, pointerEvents: 'none',
            '@media (prefers-reduced-motion: reduce)': { display: 'none' },
          }}
        />
        <Container maxWidth="lg" sx={{ position: 'relative' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.05fr .95fr' }, gap: { xs: 5, md: 6 }, alignItems: 'center' }}>
            {/* Coluna texto */}
            <Box>
              <Chip icon={<AutoAwesomeIcon sx={{ fontSize: 17 }} />} label="IA de Saúde no seu bolso" sx={{ bgcolor: 'rgba(32,178,170,.12)', color: TEAL_DARK, fontWeight: 700, mb: 3, fontSize: 13, pl: 1, '& .MuiChip-icon': { color: TEAL } }} />
              <Typography variant="h1" sx={{ fontSize: { xs: '2.3rem', md: '3.4rem' }, fontWeight: 800, lineHeight: 1.08, mb: 2.5, letterSpacing: '-0.03em', color: 'text.primary' }}>
                <Box component="span" sx={{ display: 'block' }}>Entenda seus exames</Box>como <Box component="span" sx={{ ...SERIF_I, color: TEAL, fontSize: '1.06em' }}>nunca antes.</Box>
              </Typography>
              <Typography sx={{ fontSize: { xs: 16.5, md: 19 }, color: 'text.secondary', mb: 3, lineHeight: 1.6, maxWidth: 500 }}>
                Envie o exame. O <b style={{ color: 'text.primary' }}>Dr. Exame</b> lê com IA, explica em português simples, mostra sua <b style={{ color: 'text.primary' }}>leitura de risco</b> e monta um <b style={{ color: 'text.primary' }}>plano de ação</b> pra levar ao médico.
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 3, rowGap: 1 }}>
                <Chip icon={<LockIcon sx={{ fontSize: 17 }} />} label="A IA não inventa números — vêm do seu laudo" sx={{ bgcolor: 'rgba(5,150,105,.10)', color: '#047857', fontWeight: 700, fontSize: 13, pl: 1, '& .MuiChip-icon': { color: GREEN } }} />
                <Chip icon={<VerifiedUserIcon sx={{ fontSize: 17 }} />} label="Conforme a LGPD" sx={{ bgcolor: 'rgba(32,178,170,.10)', color: TEAL_DARK, fontWeight: 700, fontSize: 13, pl: 1, '& .MuiChip-icon': { color: TEAL } }} />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} useFlexGap sx={{ mb: 1.5 }}>
                <Button variant="contained" color="primary" size="large" onClick={() => navigate('/registrar')} sx={{ borderRadius: '999px', px: 4, py: 1.5, fontSize: 17, textTransform: 'none', fontWeight: 800 }}>
                  Começar grátis →
                </Button>
              </Stack>
              <Button variant="text" size="small" onClick={() => navigate('/entrar')} sx={{ textTransform: 'none', fontWeight: 700, color: TEAL_DARK, fontSize: 13, minWidth: 0, px: 0, justifyContent: { xs: 'center', sm: 'flex-start' }, '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' } }}>
                Já tem conta? Entrar
              </Button>
              <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5 }}>
                ou entre com <b style={{ color: TEAL_DARK }}>Google</b> — 1 toque, sem senha
              </Typography>
              <Stack direction="row" spacing={2.5} useFlexGap sx={{ flexWrap: 'wrap', rowGap: 1, mt: 2 }}>
                {[`${credits} créditos ao enviar seu 1º exame`, 'Leitura de risco'].map((t) => (
                  <Stack key={t} direction="row" spacing={0.5} alignItems="center">
                    <CheckCircleIcon sx={{ fontSize: 17, color: GREEN }} />
                    <Typography sx={{ color: 'text.secondary', fontSize: 14, fontWeight: 600 }}>{t}</Typography>
                  </Stack>
                ))}
              </Stack>
              <Typography sx={{ mt: 2.5, fontSize: 14 }}>
                É médico? <Box component="span" onClick={() => navigate('/doctor')} sx={{ color: TEAL_DARK, fontWeight: 700, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}>Acesse o Portal do Médico →</Box>
              </Typography>
            </Box>

            {/* Coluna visual — capaIA de ponta a ponta, sem matte e sem cards flutuantes => preenche tudo, sem espaço branco. */}
            <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
              <Box className="hero-float" sx={{
                position: 'relative', width: '100%', maxWidth: 560,
                borderRadius: '12px', overflow: 'hidden', p: '6px',
                background: 'linear-gradient(135deg,rgba(32,178,170,.12),rgba(212,165,116,.08))',
                border: '1px solid rgba(32,178,170,.25)',
                boxShadow: '0 30px 60px rgba(32,178,170,.20), 0 10px 24px rgba(0,0,0,.07)',
              }}>
                <Box sx={{ position: 'relative' }}>
                  <Box component="img" src={`${import.meta.env.BASE_URL}capa-ia.png`} alt="Dr. Exame — seus exames com IA" sx={{ width: '100%', height: 'auto', display: 'block', borderRadius: '12px' }} />
                  <IconButton
                    onClick={() => setTourOpen(true)}
                    aria-label="Assistir tour do Dr. Exame"
                    sx={{
                      position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                      bgcolor: 'rgba(32,178,170,.92)', color: '#fff',
                      width: { xs: 64, md: 78 }, height: { xs: 64, md: 78 },
                      boxShadow: '0 12px 30px rgba(32,178,170,.45)',
                      transition: 'transform .2s ease, background-color .2s ease',
                      '&:hover': { bgcolor: '#20b2aa', transform: 'translate(-50%,-50%) scale(1.07)' },
                    }}
                  >
                    <PlayArrowIcon sx={{ fontSize: { xs: 38, md: 46 } }} />
                  </IconButton>
                </Box>
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
            <Typography variant="h2" sx={{ fontSize: { xs: '1.7rem', md: '2.3rem' }, fontWeight: 800, color: 'text.primary', mb: 1, letterSpacing: '-0.02em' }}>Decifre um exame em <Box component="span" sx={{ ...SERIF_I, color: TEAL_DARK }}>5 segundos</Box></Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: 17, maxWidth: 560, mx: 'auto' }}>Toque e veja o Dr. Exame ler o laudo, explicar cada valor e montar sua leitura de risco — sem cadastro.</Typography>
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
              { Icon: MonitorHeartIcon, t: 'Lê o Health Connect do Google' },
            ].map(({ Icon, t }) => (
              <Stack key={t} direction="row" spacing={1} alignItems="center">
                <Icon sx={{ fontSize: 20, color: TEAL }} />
                <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'text.primary' }}>{t}</Typography>
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
                <Typography sx={{ fontSize: 14, color: 'text.secondary', maxWidth: 230, mx: 'auto', lineHeight: 1.45 }}>{m.l}</Typography>
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
                px: 2, py: 0.85, borderRadius: '999px', cursor: 'pointer', fontSize: 14, fontWeight: 700, textTransform: 'none',
                border: '1px solid', borderColor: cat === c ? TEAL : 'divider',
                bgcolor: cat === c ? TEAL : 'background.paper',
                color: cat === c ? '#fff' : 'text.secondary',
                transition: 'all .15s ease',
                '&:hover': { borderColor: TEAL, color: cat === c ? '#fff' : TEAL_DARK },
              }}
            >{c}</Box>
          ))}
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 2.5 }}>
          {benefits.filter((b) => (cat !== 'Todos' ? catOf(b.title) === cat : showAllBenefits || DEFAULT_BENEFITS.has(b.title))).map((b, i) => (
            <Fade key={b.title} in timeout={300 + i * 60}>
              <Box sx={{
                p: 3, borderRadius: '12px', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', height: '100%',
                transition: 'transform .2s ease, box-shadow .2s ease, border-color .2s ease',
                '&:hover': { transform: 'translateY(-4px)', boxShadow: '0 20px 44px rgba(15,61,58,.10)', borderColor: TEAL },
              }}>
                <Box sx={{ width: 48, height: 48, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2, background: 'linear-gradient(135deg,rgba(32,178,170,.14),rgba(32,178,170,.06))' }}>
                  <b.Icon sx={{ fontSize: 26, color: TEAL_DARK }} />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 800, fontSize: 17, color: 'text.primary', mb: 1 }}>{b.title}</Typography>
                <Typography sx={{ fontSize: 14, color: 'text.secondary', lineHeight: 1.6 }}>{b.desc}</Typography>
              </Box>
            </Fade>
          ))}
        </Box>
        {cat === 'Todos' && (
          <Box sx={{ textAlign: 'center', mt: 4 }}>
            <Button variant="outlined" onClick={() => setShowAllBenefits((v) => !v)} sx={{ borderRadius: '999px', px: 3.5, py: 1, textTransform: 'none', fontWeight: 700, borderColor: '#d8f4f2', color: TEAL_DARK, '&:hover': { borderColor: TEAL, bgcolor: 'rgba(32,178,170,.06)' } }}>
              {showAllBenefits ? 'Ver menos' : `Ver todos os ${benefits.length} recursos`}
            </Button>
          </Box>
        )}
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

          {/* Tour em vídeo (YouTube embed) — leitura completa da plataforma */}
          <Box sx={{ maxWidth: 880, mx: 'auto', width: '100%', mb: 6 }}>
            <Box sx={{
              position: 'relative', width: '100%', aspectRatio: '16 / 9',
              borderRadius: '12px', overflow: 'hidden',
              border: '1px solid rgba(32,178,170,.25)',
              boxShadow: '0 30px 60px rgba(32,178,170,.20), 0 12px 26px rgba(0,0,0,.10)',
            }}>
              <Box
                component="iframe"
                src={TOUR_VIDEO_SRC}
                title="Dr. Exame — tour pela plataforma"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                loading="lazy"
                sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
              />
            </Box>
          </Box>
          <SlideCarousel />

        </Container>
      </Box>

      {/* SEÇÃO — Descubra seu risco + plano de ação (NOVO) — momento premium escuro (dark-teal) */}
      <Box sx={{ position: 'relative', overflow: 'hidden', py: { xs: 8, md: 11 }, background: 'linear-gradient(135deg,#0f5f5a 0%,#137a72 55%,#178f89 100%)', color: '#fff' }}>
        <Box sx={{ position: 'absolute', top: '-15%', right: '-5%', width: 460, height: 460, borderRadius: '50%', background: 'radial-gradient(circle,rgba(234,88,12,.18),transparent 65%)', pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', bottom: '-20%', left: '-8%', width: 380, height: 380, borderRadius: '50%', background: 'radial-gradient(circle,rgba(32,178,170,.30),transparent 65%)', pointerEvents: 'none' }} />
        <Container maxWidth="lg" sx={{ position: 'relative' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: { xs: 5, md: 7 }, alignItems: 'center' }}>
            {/* mockup do RiskCard (esquerda) */}
            <Box sx={{ display: 'flex', justifyContent: 'center', order: { xs: 2, md: 1 } }}>
              <Box sx={{ width: '100%', maxWidth: 380, borderRadius: '12px', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', boxShadow: '0 30px 60px rgba(0,0,0,.28), 0 10px 24px rgba(0,0,0,.18)', p: 2.5, background: 'linear-gradient(135deg, rgba(234,88,12,.06), rgba(234,88,12,.02))' }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                  <HealthAndSafetyIcon sx={{ color: '#c2410c' }} />
                  <Typography sx={{ fontWeight: 800, flex: 1 }}>Leitura de risco</Typography>
                  <Chip size="small" label="🟠 Moderado" sx={{ fontWeight: 800, height: 22, bgcolor: 'rgba(234,88,12,.16)', color: '#c2410c' }} />
                </Stack>
                <Stack direction="row" spacing={1} useFlexGap sx={{ mb: 1.5, flexWrap: 'wrap' }}>
                  <Chip size="small" label="↓ Risco caiu desde 11/06" sx={{ fontWeight: 700, height: 22, bgcolor: 'rgba(22,163,74,.14)', color: '#047857' }} />
                </Stack>
                <Typography sx={{ fontWeight: 800, color: '#c2410c', mb: 1.25 }}>Possível risco de colesterol alto</Typography>
                <Stack spacing={0.6} sx={{ mb: 1.5 }}>
                  {[{ n: 'LDL', v: '190 mg/dL' }, { n: 'Triglicerídeos', v: '260 mg/dL' }, { n: 'HDL', v: '35 mg/dL' }].map((f) => (
                    <Box key={f.n} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.3, borderBottom: '1px dashed', borderColor: 'divider' }}>
                      <Chip size="small" label={`🟠 ${f.v}`} sx={{ fontWeight: 700, height: 20, bgcolor: 'rgba(234,88,12,.14)', color: '#c2410c' }} />
                      <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>{f.n}</Typography>
                    </Box>
                  ))}
                </Stack>
                <Box sx={{ borderRadius: '12px', bgcolor: 'action.hover', p: 1.25 }}>
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
              <Chip icon={<MonitorHeartIcon sx={{ fontSize: 17 }} />} label="Leitura de risco + plano de ação" sx={{ bgcolor: 'rgba(255,255,255,.16)', color: '#ffd9b3', fontWeight: 700, mb: 3, fontSize: 13, pl: 1, '& .MuiChip-icon': { color: '#fb923c' } }} />
              <Typography variant="h2" sx={{ fontSize: { xs: '1.8rem', md: '2.4rem' }, fontWeight: 800, color: '#fff', mb: 2, letterSpacing: '-0.02em' }}>Descubra seu risco — e <Box component="span" sx={SERIF_I}>o que fazer</Box></Typography>
              <Typography sx={{ fontSize: 17, color: 'rgba(255,255,255,.82)', mb: 3.5, lineHeight: 1.6 }}>
                A IA cruza seus exames e aponta <b style={{ color: '#fff' }}>possíveis riscos</b> (diabetes, pré-diabetes, anemia, hipertensão, colesterol e cardiovascular) — e monta um <b style={{ color: '#fff' }}>plano de ação</b> personalizado: hábitos, quando refazer e perguntas pra levar ao médico.
              </Typography>
              {[
                'Detecta pré-diabetes — faixa que a maioria ignora e que é reversível.',
                'Plano de ação gerado por IA: o que fazer, quando refazer, o que perguntar.',
                'Tendência de risco: veja se seu risco caiu ou subiu ao longo do tempo.',
                'Sempre educativo: nunca diagnóstico. A decisão é do seu médico.',
              ].map((t) => (
                <Stack key={t} direction="row" spacing={1.25} alignItems="flex-start" sx={{ mb: 1.75 }}>
                  <CheckCircleIcon sx={{ fontSize: 20, color: '#5fc9c3', mt: 0.1, flexShrink: 0 }} />
                  <Typography sx={{ fontSize: 15, color: 'rgba(255,255,255,.82)', lineHeight: 1.5 }}>{t}</Typography>
                </Stack>
              ))}
              <Button onClick={() => navigate('/registrar')} sx={{ mt: 1.5, borderRadius: '999px', px: 4, py: 1.3, textTransform: 'none', fontWeight: 800, bgcolor: '#fff', color: TEAL_DARK, '&:hover': { bgcolor: '#f0fafa', transform: 'translateY(-2px)' }, boxShadow: '0 10px 24px rgba(0,0,0,.18)', transition: 'all .2s ease' }}>Ver minha leitura de risco</Button>
            </Box>
          </Box>
        </Container>
      </Box>

      {/* SEÇÃO — Família de verdade (D1): o diferencial que nenhum app global tem (todos 18+, single-user) */}
      <Box sx={{ bgcolor: 'background.default', py: { xs: 8, md: 11 } }}>
        <Container maxWidth="lg">
          <Reveal>
            <Box sx={{ textAlign: 'center', mb: 5 }}>
              <Chip icon={<FamilyRestroomIcon sx={{ fontSize: 17 }} />} label="Família de verdade" sx={{ bgcolor: 'rgba(32,178,170,.12)', color: TEAL_DARK, fontWeight: 700, mb: 2, fontSize: 13, pl: 1, '& .MuiChip-icon': { color: TEAL_DARK } }} />
              <Typography variant="h2" sx={{ fontSize: { xs: '1.9rem', md: '2.6rem' }, fontWeight: 800, color: 'text.primary', mb: 1.5, letterSpacing: '-0.02em' }}>
                A saúde de quem você ama, <Box component="span" sx={{ ...SERIF_I, color: TEAL_DARK }}>no seu bolso</Box>
              </Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: 17, maxWidth: 640, mx: 'auto' }}>
                Os apps gringos de saúde são 18+ e single-user. Aqui, filho e avó vivem no mesmo lugar que você — cada um com o histórico próprio, e você no controle.
              </Typography>
            </Box>
          </Reveal>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: { xs: 5, md: 8 }, alignItems: 'center' }}>
            {/* mockup: app em modo cuidador (faixa + badge pediátrico + push nominado) */}
            <Box sx={{ display: 'flex', justifyContent: 'center', order: { xs: 2, md: 1 } }}>
              <Box sx={{ width: '100%', maxWidth: 340 }}>
                {/* push nominado */}
                <Box sx={{ borderRadius: '12px', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', boxShadow: '0 16px 36px rgba(15,61,58,.12)', p: 1.5, mb: -1, position: 'relative', zIndex: 2, display: 'flex', gap: 1.25, alignItems: 'center' }}>
                  <Box sx={{ width: 34, height: 34, borderRadius: '50%', background: `linear-gradient(135deg,${TEAL},${TEAL_DARK})`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <AutoAwesomeIcon sx={{ fontSize: 18, color: '#fff' }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: 'text.primary' }}>Theo: exame lido 🧬</Typography>
                    <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary' }}>2 itens estavam fora da faixa — pra idade dele, 1 é normal.</Typography>
                  </Box>
                  <Typography sx={{ fontSize: 10.5, color: 'text.disabled', flexShrink: 0 }}>agora</Typography>
                </Box>
                {/* tela: faixa cuidador + item pediátrico */}
                <Box sx={{ borderRadius: '16px', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', boxShadow: '0 30px 60px rgba(15,61,58,.14)', overflow: 'hidden' }}>
                  <Box sx={{ background: `linear-gradient(135deg,${TEAL},${TEAL_DARK})`, color: '#fff', px: 2, py: 1.25, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <FamilyRestroomIcon sx={{ fontSize: 17 }} /> Você está cuidando de <b>Theo · Filho</b>
                  </Box>
                  <Box sx={{ p: 2.25 }}>
                    <Typography sx={{ fontSize: 11, color: 'text.secondary', mb: 1.25 }}>HEMOGRAMA + BIOQUÍMICA · 01/08</Typography>
                    {[{ n: 'Fosfatase Alcalina', v: '300', ref: '105–420', ok: true, ped: true }, { n: 'Leucócitos', v: '9.800', ref: '5.000–15.000', ok: true, ped: true }, { n: 'Glicose', v: '92', ref: '70–99', ok: true, ped: false }].map((r) => (
                      <Box key={r.n} sx={{ py: 1, borderBottom: '1px dashed', borderColor: 'divider' }}>
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                          <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: 'text.primary', flex: 1 }}>{r.n}</Typography>
                          <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: r.ok ? GREEN : '#c2410c', fontVariantNumeric: 'tabular-nums' }}>{r.v}</Typography>
                          <Chip size="small" label={r.ok ? '✓' : '⚠️'} sx={{ height: 20, minWidth: 24, bgcolor: r.ok ? 'rgba(5,150,105,.12)' : 'rgba(194,65,12,.12)', color: r.ok ? GREEN : '#c2410c', fontWeight: 800 }} />
                        </Stack>
                        <Stack direction="row" alignItems="center" spacing={0.75}>
                          <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>Referência {r.ref}</Typography>
                          {r.ped && <Chip size="small" label="Pediátrico · 2–6 anos" sx={{ height: 18, fontSize: 10, fontWeight: 700, bgcolor: 'rgba(32,178,170,.14)', color: TEAL_DARK }} />}
                        </Stack>
                      </Box>
                    ))}
                    <Typography sx={{ fontSize: 11, color: 'text.disabled', mt: 1.5, textAlign: 'center' }}>Laudo dizia 40–130 (adulto) · régua da idade aplicada, com fonte.</Typography>
                  </Box>
                </Box>
              </Box>
            </Box>
            {/* texto */}
            <Box sx={{ order: { xs: 1, md: 2 } }}>
              <Typography variant="h3" sx={{ fontSize: { xs: '1.4rem', md: '1.8rem' }, fontWeight: 800, color: 'text.primary', mb: 1.5, letterSpacing: '-0.02em' }}>Cuidador, sem confusão de perfil</Typography>
              {[
                { Icon: FamilyRestroomIcon, t: 'Modo cuidador — quando você está no perfil do seu filho, o app avisa: “Você está cuidando de Theo”. Exame e alerta errado de pessoa, nunca mais.' },
                { Icon: ChildCareIcon, t: 'Faixas pediátricas com fonte — criança não é adulto pequeno. Sem faixa da idade no laudo, aplicamos bandas por idade (Harriet Lane, 22ª ed.) e marcamos o item.' },
                { Icon: DescriptionIcon, t: 'Histórico próprio por pessoa — cada dependente tem exames, evolução e score dele. O do filho nunca mistura com o seu.' },
                { Icon: ShareIcon, t: 'O médico de cada um — compartilhe o perfil do dependente com o pediatra, e o seu com seu clínico. Escopos separados, revogáveis.' },
              ].map(({ Icon, t }) => (
                <Stack key={t.slice(0, 24)} direction="row" spacing={1.5} alignItems="flex-start" sx={{ mb: 2.25 }}>
                  <Box sx={{ width: 38, height: 38, borderRadius: '12px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(32,178,170,.10)' }}><Icon sx={{ fontSize: 20, color: TEAL_DARK }} /></Box>
                  <Typography sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.55, pt: 0.6 }}>{t}</Typography>
                </Stack>
              ))}
              <Button variant="contained" color="primary" onClick={() => navigate('/registrar')} sx={{ mt: 1, borderRadius: '999px', px: 4, py: 1.3, textTransform: 'none', fontWeight: 800 }}>Cadastrar minha família →</Button>
            </Box>
          </Box>
        </Container>
      </Box>

      {/* COMO SEUS DADOS FLUEM — mata o ceticismo de IA em saúde (absorve anchor #como-funciona) */}
      <Box id="como-funciona" sx={{ bgcolor: 'background.paper', borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider', py: { xs: 8, md: 11 }, scrollMarginTop: 80 }}>
        <Container maxWidth="lg">
          <Typography align="center" variant="h2" sx={{ fontSize: { xs: '1.9rem', md: '2.6rem' }, fontWeight: 800, color: 'text.primary', mb: 1.5, letterSpacing: '-0.02em' }}>A IA <Box component="span" sx={{ ...SERIF_I, color: TEAL_DARK }}>não inventa</Box> números</Typography>
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
              <Box key={s.t} sx={{ p: 2.5, borderRadius: '12px', border: '1px solid', borderColor: 'divider', bgcolor: 'background.default', height: '100%' }}>
                <Box sx={{ width: 44, height: 44, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1.5, background: 'linear-gradient(135deg,rgba(32,178,170,.14),rgba(32,178,170,.06))' }}>
                  <s.Icon sx={{ fontSize: 24, color: TEAL_DARK }} />
                </Box>
                <Typography sx={{ fontWeight: 800, fontSize: 15, color: 'text.primary', mb: 0.5 }}>{s.t}</Typography>
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

      {/* Dr. EXAME PRO — B2B mega (4 seções médicas fundidas em tabs: médico / compartilhar / convite) */}
      <Box id="portal-medico" sx={{ bgcolor: 'background.default', py: { xs: 8, md: 11 }, scrollMarginTop: 80 }}>
        <Container maxWidth="lg">
          <Reveal>
            <Box sx={{ textAlign: 'center', mb: 4 }}>
              <Chip icon={<MedicalServicesIcon sx={{ fontSize: 17 }} />} label="Dr. Exame Pro" sx={{ bgcolor: 'rgba(212,165,116,.16)', color: '#b88a54', fontWeight: 700, mb: 2, fontSize: 13, pl: 1, '& .MuiChip-icon': { color: '#b88a54' } }} />
              <Typography variant="h2" sx={{ fontSize: { xs: '1.9rem', md: '2.6rem' }, fontWeight: 800, color: 'text.primary', mb: 1.5, letterSpacing: '-0.02em' }}>Médico e paciente, conectados <Box component="span" sx={{ ...SERIF_I, color: TEAL_DARK }}>num clique</Box></Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: 17, maxWidth: 640, mx: 'auto' }}>O paciente chega pronto na consulta. O médico recebe um brief de pré-consulta com tudo que importa — gerado por IA, sob controle total de quem compartilha.</Typography>
            </Box>
          </Reveal>

          {/* Tabs custom (mesmo padrão visual do filtro de categorias) */}
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', justifyContent: 'center', mb: 5, rowGap: 1 }}>
            {([
              { k: 'medico', l: '🩺 Para o médico' },
              { k: 'paciente', l: '💬 Compartilhar' },
              { k: 'convite', l: '✨ Convite pelo médico' },
            ] as const).map((t) => (
              <Box key={t.k} component="button" onClick={() => setMedTab(t.k)} sx={{
                px: 2.5, py: 1, borderRadius: '999px', cursor: 'pointer', fontSize: 14, fontWeight: 700, textTransform: 'none',
                border: '1px solid', borderColor: medTab === t.k ? TEAL : 'divider',
                bgcolor: medTab === t.k ? TEAL : 'background.paper',
                color: medTab === t.k ? '#fff' : 'text.secondary',
                transition: 'all .15s ease',
                '&:hover': { borderColor: TEAL, color: medTab === t.k ? '#fff' : TEAL_DARK },
              }}>{t.l}</Box>
            ))}
          </Stack>

          {/* Tab: médico (brief de pré-consulta) */}
          {medTab === 'medico' && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: { xs: 4, md: 6 }, alignItems: 'center' }}>
              <Box>
                <Typography variant="h3" sx={{ fontSize: { xs: '1.4rem', md: '1.8rem' }, fontWeight: 800, color: 'text.primary', mb: 1.5, letterSpacing: '-0.02em' }}>Resumo clínico automático em 1 minuto</Typography>
                <Typography sx={{ fontSize: 16, color: 'text.secondary', mb: 2.5, lineHeight: 1.6 }}>Use o mesmo CRM do convite e receba um brief de pré-consulta: principais mudanças, risco, o que investigar e as perguntas que o paciente fez no app.</Typography>
                {['🩺 Top 3 mudanças desde a última visita — sem revisar prontuário inteiro.', '🛡️ Risco + tendência + marcadores a investigar — num relance.', '📝 SOAP rascunho gerado por IA (S/O/A/P) — só revisa e edita.', '📄 Brief em PDF de 1 página — imprime ou anexa no prontuário.'].map((t) => (
                  <Stack key={t} direction="row" spacing={1.25} alignItems="flex-start" sx={{ mb: 1.5 }}>
                    <CheckCircleIcon sx={{ fontSize: 20, color: GREEN, mt: 0.1, flexShrink: 0 }} />
                    <Typography sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.5 }}>{t}</Typography>
                  </Stack>
                ))}
                <Button variant="contained" color="primary" onClick={() => navigate('/doctor')} sx={{ mt: 1.5, borderRadius: '999px', px: 4, py: 1.3, textTransform: 'none', fontWeight: 800 }}>Conhecer o Portal do Médico →</Button>
              </Box>
              {/* mockup do brief */}
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <Box sx={{ width: '100%', maxWidth: 380, borderRadius: '12px', bgcolor: 'background.paper', border: '2px solid ' + TEAL, boxShadow: '0 30px 60px rgba(32,178,170,.20), 0 10px 24px rgba(0,0,0,.07)', p: 2.5 }}>
                  <Typography sx={{ fontWeight: 800, color: TEAL_DARK, mb: 1.5, fontSize: 16 }}>🩺 PRÉ-CONSULTA · desde 15/05</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>⚠️ TOP 3 PRA HOJE</Typography>
                  <Stack spacing={0.5} sx={{ mt: 0.5, mb: 1.5 }}>
                    {[{ n: 'Creatinina', d: '↑ 22%' }, { n: 'HDL', d: '↓ 15%' }, { n: 'Testosterona', d: '↑ elevada' }].map((x, i) => (
                      <Stack key={i} direction="row" spacing={0.75} alignItems="center">
                        <Chip size="small" label={i + 1} sx={{ height: 20, width: 20, bgcolor: i === 0 ? '#dc262622' : '#c2410c22', color: i === 0 ? '#dc2626' : '#c2410c', fontWeight: 800, fontSize: 11 }} />
                        <Typography sx={{ fontWeight: 600, fontSize: '0.85rem' }}>{x.n}</Typography>
                        <Chip size="small" label={x.d} sx={{ height: 20, fontSize: 11, bgcolor: x.d.includes('↓') ? '#dbeafe' : '#fef3c7', color: x.d.includes('↓') ? '#1e40af' : '#92400e', fontWeight: 700 }} />
                      </Stack>
                    ))}
                  </Stack>
                  <Typography variant="body2" sx={{ mb: 1 }}><b>Risco:</b> 🟠 Moderado (cardiovascular) · ↓ caiu</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>🔬 INVESTIGAR</Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>• TGO/TGP · Microalbuminúria</Typography>
                  <Box sx={{ borderRadius: '12px', bgcolor: 'action.hover', p: 1.25, mt: 1 }}>
                    <Typography sx={{ fontWeight: 800, fontSize: '0.85rem', mb: 0.25 }}>📝 SOAP (rascunho IA)</Typography>
                    <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', lineHeight: 1.4 }}>S: Uso de Masteron... O: Creatinina 1,4 (↑22%)... A: Risco cardiovascular... P: Solicitar TGO/TGP...</Typography>
                  </Box>
                </Box>
              </Box>
            </Box>
          )}

          {/* Tab: paciente (compartilhar) */}
          {medTab === 'paciente' && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: { xs: 4, md: 6 }, alignItems: 'center' }}>
              <Box>
                <Typography variant="h3" sx={{ fontSize: { xs: '1.4rem', md: '1.8rem' }, fontWeight: 800, color: 'text.primary', mb: 1.5, letterSpacing: '-0.02em' }}>Você no controle do que o médico vê</Typography>
                <Typography sx={{ fontSize: 16, color: 'text.secondary', mb: 2.5, lineHeight: 1.6 }}>Escolha o que enviar, indique pelo CRM e seu médico é cadastrado sozinho. Revoga quando quiser — ele perde o acesso na hora.</Typography>
                {[
                  { Icon: DescriptionIcon, t: 'Você escolhe os escopos: Exames, Evolução, Alertas e Resumos IA.' },
                  { Icon: AssignmentIndIcon, t: 'Indica o médico pelo CRM — ele recebe um aviso por e-mail.' },
                  { Icon: LockIcon, t: 'Revoga o acesso a qualquer momento, com 1 toque.' },
                ].map(({ Icon, t }) => (
                  <Stack key={t} direction="row" spacing={1.5} alignItems="flex-start" sx={{ mb: 2 }}>
                    <Box sx={{ width: 34, height: 34, borderRadius: '12px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(32,178,170,.10)' }}><Icon sx={{ fontSize: 19, color: TEAL_DARK }} /></Box>
                    <Typography sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.5, pt: 0.4 }}>{t}</Typography>
                  </Stack>
                ))}
                <Button variant="contained" color="primary" onClick={() => navigate('/registrar')} sx={{ mt: 1.5, borderRadius: '999px', px: 4, py: 1.3, textTransform: 'none', fontWeight: 800 }}>Começar grátis</Button>
              </Box>
              {/* mockup compartilhar */}
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <Box sx={{ width: '100%', maxWidth: 400, borderRadius: '12px', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', boxShadow: '0 30px 60px rgba(32,178,170,.20), 0 10px 24px rgba(0,0,0,.07)', p: 3 }}>
                  <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 1 }}>O que compartilhar:</Typography>
                  <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', rowGap: 1, mb: 2.5 }}>
                    {([{ Icon: DescriptionIcon, l: 'Exames', on: true }, { Icon: TrendingUpIcon, l: 'Evolução', on: true }, { Icon: WarningAmberIcon, l: 'Alertas', on: true }, { Icon: AutoAwesomeIcon, l: 'Resumos IA', on: false }] as const).map(({ Icon, l, on }) => (
                      <Chip key={l} icon={<Icon sx={{ fontSize: 16 }} />} label={l} size="small" sx={{ bgcolor: on ? 'rgba(16,185,129,.12)' : 'action.hover', color: on ? '#047857' : 'text.secondary', fontWeight: 700, border: on ? '1px solid #6ee7b7' : '1px solid', borderColor: on ? '#6ee7b7' : 'divider', '& .MuiChip-icon': { color: on ? GREEN : 'text.secondary' } }} />
                    ))}
                  </Stack>
                  <Box sx={{ borderRadius: '12px', border: '1px solid', borderColor: 'divider', bgcolor: 'background.default', px: 1.5, py: 1.25, mb: 2.5 }}>
                    <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>CRM do médico</Typography>
                    <Typography sx={{ fontSize: 15, fontWeight: 700, color: 'text.primary' }}>12345-SP • Dra. Helena Costa</Typography>
                  </Box>
                  <Button fullWidth variant="contained" color="primary" sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>Compartilhar dados</Button>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1.5, textAlign: 'center' }}>🔒 Você pode revogar a qualquer momento.</Typography>
                </Box>
              </Box>
            </Box>
          )}

          {/* Tab: convite (seu médico te chama) */}
          {medTab === 'convite' && (
            <Box>
              <Reveal>
                <Stack alignItems="center" spacing={1.5} sx={{ textAlign: 'center', mb: 5 }}>
                  <Chip label="✨ NOVIDADE" sx={{ bgcolor: 'rgba(32,178,170,.12)', color: TEAL_DARK, fontWeight: 800, letterSpacing: 1.5, fontSize: 12 }} />
                  <Typography sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, fontWeight: 800, color: INK, letterSpacing: '-0.02em', maxWidth: 680 }}>Seu médico te chama — sem papel, sem app do consultório</Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: 17, maxWidth: 600, lineHeight: 1.6 }}>Seu médico te manda um link no WhatsApp, você instala e ele <b>já fica conectado</b> aos seus exames — na hora, sem configurar nada.</Typography>
                </Stack>
              </Reveal>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: { xs: 2.5, md: 3.5 }, maxWidth: 940, mx: 'auto' }}>
                {[
                  { Icon: PersonAddAlt1Icon, t: 'Seu médico envia o convite', d: 'No consultório ou no WhatsApp, ele te chama com um link. Você não procura o app — é ele quem te encontra.', color: TEAL },
                  { Icon: SmartphoneIcon, t: 'Você instala em 1 toque', d: 'Abre o link, cria sua conta e sobe o exame que ele pediu. Leva menos de um minuto.', color: '#d4a574' },
                  { Icon: VerifiedUserIcon, t: 'Conexão automática', d: 'O compartilhamento com seu médico já vem ativado. Ele chega à consulta com um resumo do que importa — antes mesmo de você.', color: GREEN },
                ].map((s, i) => (
                  <Reveal key={i} delay={Math.min(i * 60, 240)}>
                    <Box sx={{ textAlign: 'center', bgcolor: 'background.paper', borderRadius: '12px', border: '1px solid', borderColor: 'divider', p: { xs: 2.5, md: 3 }, boxShadow: '0 14px 32px rgba(15,61,58,.07)', position: 'relative', height: '100%', transition: 'all .2s ease', '&:hover': { transform: 'translateY(-4px)', boxShadow: '0 20px 44px rgba(15,61,58,.10)', borderColor: TEAL } }}>
                      <Box sx={{ width: 64, height: 64, mx: 'auto', mb: 2, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, ' + s.color + ',' + s.color + 'cc)', boxShadow: '0 10px 22px ' + s.color + '40' }}>
                        <s.Icon sx={{ fontSize: 30, color: '#fff' }} />
                      </Box>
                      <Typography variant="h6" sx={{ fontWeight: 800, fontSize: 17, color: 'text.primary', mb: 0.75 }}>{s.t}</Typography>
                      <Typography sx={{ color: 'text.secondary', fontSize: 15, lineHeight: 1.6 }}>{s.d}</Typography>
                      {i === 2 && <Chip size="small" label="já vem ativo ✓" sx={{ position: 'absolute', top: 12, right: 12, bgcolor: 'rgba(5,150,105,.12)', color: GREEN, fontWeight: 800, fontSize: 11 }} />}
                    </Box>
                  </Reveal>
                ))}
              </Box>
            </Box>
          )}

          {/* Dual-CTA transversal (paciente + médico) */}
          <Reveal>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center" alignItems="stretch" sx={{ mt: 6, maxWidth: 780, mx: 'auto' }}>
              <Box sx={{ flex: 1, borderRadius: '12px', p: 3, background: 'linear-gradient(135deg,#20b2aa,#178f89)', color: '#fff' }}>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}><MedicalServicesIcon /><Typography sx={{ fontWeight: 800, fontSize: 18 }}>Pra você, paciente</Typography></Stack>
                <Typography sx={{ fontSize: 15, lineHeight: 1.55, opacity: 0.92, mb: 2 }}>Seu médico ainda não te chamou? Crie sua conta e indique-o pelo CRM em segundos.</Typography>
                <Button variant="contained" onClick={() => navigate('/registrar')} sx={{ bgcolor: '#fff', color: TEAL_DARK, borderRadius: '999px', textTransform: 'none', fontWeight: 800, boxShadow: 'none', '&:hover': { bgcolor: '#eefaf9' } }}>Criar conta grátis</Button>
              </Box>
              <Box sx={{ flex: 1, borderRadius: '12px', p: 3, bgcolor: 'background.paper', border: '2px solid ' + TEAL }}>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}><AssignmentIndIcon sx={{ color: TEAL_DARK }} /><Typography sx={{ fontWeight: 800, fontSize: 18, color: INK }}>Pra você, médico</Typography></Stack>
                <Typography sx={{ fontSize: 15, lineHeight: 1.55, color: 'text.secondary', mb: 2 }}>Convide seus pacientes pelo portal e receba um brief de pré-consulta de cada um. Conheça o Dr. Exame Pro.</Typography>
                <Button variant="outlined" onClick={() => navigate('/doctor')} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, borderColor: TEAL, color: TEAL_DARK, '&:hover': { borderColor: TEAL_DARK, bgcolor: 'rgba(32,178,170,.06)' } }}>Portal do médico →</Button>
              </Box>
            </Stack>
          </Reveal>
        </Container>
      </Box>

      {/* ÍNDICES — USP#3 (IMC/eGFR/HOMA-IR) + calculadora interativa (F4) */}
      <Box sx={{ bgcolor: 'background.default', py: { xs: 8, md: 11 } }}>
        <Container maxWidth="lg">
          <Reveal>
            <Box sx={{ textAlign: 'center', mb: { xs: 4, md: 6 } }}>
              <Chip icon={<CalculateIcon sx={{ fontSize: 17 }} />} label="Índices que o laudo não dá" sx={{ bgcolor: 'rgba(32,178,170,.12)', color: TEAL_DARK, fontWeight: 700, mb: 2, fontSize: 13, pl: 1, '& .MuiChip-icon': { color: TEAL } }} />
              <Typography variant="h2" sx={{ fontSize: { xs: '1.9rem', md: '2.6rem' }, fontWeight: 800, color: 'text.primary', mb: 1.5, letterSpacing: '-0.02em' }}>O laboratório <Box component="span" sx={{ ...SERIF_I, color: TEAL_DARK }}>mediu</Box>. Nós <Box component="span" sx={{ ...SERIF_I, color: TEAL_DARK }}>interpretamos</Box>.</Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: 17, maxWidth: 600, mx: 'auto' }}>Seu laudo traz os valores brutos. O Dr. Exame calcula os índices que importam — e mostra o valor <b style={{ color: 'text.primary' }}>ideal</b>, não só o de referência.</Typography>
            </Box>
          </Reveal>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.1fr .9fr' }, gap: { xs: 4, md: 6 }, alignItems: 'center' }}>
            {/* Tiles IMC/eGFR/HOMA-IR */}
            <Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5 }}>
                {[
                  { Icon: MonitorWeightIcon, n: 'IMC', v: '18,5 – 24,9', ideal: 'peso adequado', d: 'Relação peso/altura. Calculamos e dizemos sua faixa (OMS).' },
                  { Icon: MedicalServicesIcon, n: 'eGFR', v: '> 90', ideal: 'função renal ideal', d: 'Filtração renal — a partir de creatinina, idade e sexo.' },
                  { Icon: MonitorHeartIcon, n: 'HOMA-IR', v: '< 2,5', ideal: 'baixa resistência', d: 'Resistência insulínica — sinal precoce de pré-diabetes.' },
                ].map((t, i) => (
                  <Reveal key={t.n} delay={Math.min(i * 60, 240)}>
                    <Box sx={{ p: 2.5, borderRadius: '12px', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', height: '100%', transition: 'all .2s ease', '&:hover': { transform: 'translateY(-4px)', boxShadow: '0 20px 44px rgba(15,61,58,.10)', borderColor: TEAL } }}>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                        <Box sx={{ width: 36, height: 36, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,rgba(32,178,170,.14),rgba(32,178,170,.06))' }}><t.Icon sx={{ fontSize: 20, color: TEAL_DARK }} /></Box>
                        <Typography sx={{ fontWeight: 800, fontSize: 17, color: 'text.primary' }}>{t.n}</Typography>
                      </Stack>
                      <Typography sx={{ fontSize: 22, fontWeight: 800, color: TEAL_DARK, lineHeight: 1, mb: 0.25 }}>{t.v}</Typography>
                      <Typography sx={{ fontSize: 12, fontWeight: 700, color: GREEN, mb: 1 }}>{t.ideal}</Typography>
                      <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.5 }}>{t.d}</Typography>
                    </Box>
                  </Reveal>
                ))}
              </Box>
              <Reveal delay={120}>
                <Typography sx={{ mt: 2, fontSize: 13, color: 'text.secondary' }}>+ Score de Saúde, tendência por marcador e valor ideal de cada item (ex.: LDL ideal &lt; 100, não só &lt; 130).</Typography>
              </Reveal>
            </Box>
            {/* Calculadora IMC ao vivo */}
            <Reveal delay={80}>
              <BmiCard />
            </Reveal>
          </Box>
        </Container>
      </Box>

      {/* COMPARATIVO — posicionamento (Dr. Exame vs alternativas) */}
      <Box sx={{ bgcolor: 'background.paper', borderTop: '1px solid', borderColor: 'divider', py: { xs: 8, md: 11 } }}>
        <Container maxWidth="md">
          <Typography align="center" variant="h2" sx={{ fontSize: { xs: '1.9rem', md: '2.6rem' }, fontWeight: 800, color: 'text.primary', mb: 1.5, letterSpacing: '-0.02em' }}>Por que não basta <Box component="span" sx={{ ...SERIF_I, color: TEAL_DARK }}>ler o papel?</Box></Typography>
          <Typography align="center" sx={{ color: 'text.secondary', fontSize: 17, mb: 5, maxWidth: 600, mx: 'auto' }}>O que o Dr. Exame faz que o laudo, o Google e a espera pela consulta não fazem.</Typography>
          <Box sx={{ borderRadius: '12px', border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
            {/* cabeçalho */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1.6fr 1fr 1fr', md: '1.8fr 1fr 1fr 1fr' }, bgcolor: 'background.default', borderBottom: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ p: 1.75 }} />
              <Box sx={{ p: 1.5, textAlign: 'center', fontWeight: 800, color: TEAL_DARK, fontSize: 14 }}>Dr. Exame</Box>
              <Box sx={{ p: 1.5, textAlign: 'center', fontWeight: 700, color: 'text.secondary', fontSize: 13 }}>Sozinho / Google</Box>
              <Box sx={{ p: 1.5, textAlign: 'center', fontWeight: 700, color: 'text.secondary', fontSize: 13, display: { xs: 'none', md: 'block' } }}>Só na consulta</Box>
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
                <Box sx={{ p: 1.75, fontSize: 14, color: 'text.primary', fontWeight: 600 }}>{r.f}</Box>
                <Box sx={{ p: 1.5, textAlign: 'center' }}>{r.me === true ? <CheckCircleIcon sx={{ fontSize: 20, color: GREEN }} /> : <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>—</Typography>}</Box>
                <Box sx={{ p: 1.5, textAlign: 'center' }}>{r.diy === true ? <CheckCircleIcon sx={{ fontSize: 20, color: GREEN }} /> : r.diy === 'manual' ? <Typography sx={{ fontSize: 12, color: '#b45309', fontWeight: 700 }}>manual</Typography> : <Typography sx={{ fontSize: 16, color: 'text.disabled' }}>✕</Typography>}</Box>
                <Box sx={{ p: 1.5, textAlign: 'center', display: { xs: 'none', md: 'block' } }}>{r.doc === true ? <CheckCircleIcon sx={{ fontSize: 20, color: GREEN }} /> : r.doc === 'limitado' ? <Typography sx={{ fontSize: 12, color: '#b45309', fontWeight: 700 }}>limitado</Typography> : <Typography sx={{ fontSize: 16, color: 'text.disabled' }}>✕</Typography>}</Box>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* SEÇÃO — Ciência sem caixa-preta (D4): as fórmulas e a fonte de cada uma. Anti-claim-vazio. */}
      <Box sx={{ bgcolor: 'background.default', borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider', py: { xs: 8, md: 11 } }}>
        <Container maxWidth="lg">
          <Reveal>
            <Box sx={{ textAlign: 'center', mb: 5 }}>
              <Chip icon={<ScienceIcon sx={{ fontSize: 17 }} />} label="Ciência sem caixa-preta" sx={{ bgcolor: 'rgba(32,178,170,.12)', color: TEAL_DARK, fontWeight: 700, mb: 2, fontSize: 13, pl: 1, '& .MuiChip-icon': { color: TEAL_DARK } }} />
              <Typography variant="h2" sx={{ fontSize: { xs: '1.9rem', md: '2.6rem' }, fontWeight: 800, color: 'text.primary', mb: 1.5, letterSpacing: '-0.02em' }}>
                Nossa análise tem <Box component="span" sx={{ ...SERIF_I, color: TEAL_DARK }}>fórmula e fonte</Box>
              </Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: 17, maxWidth: 640, mx: 'auto' }}>
                Nenhum número aqui é palpite de IA. A checagem é determinística — cada índice abaixo é uma regra com publicação por trás, e a IA só explica o que a régua já decidiu.
              </Typography>
            </Box>
          </Reveal>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' }, gap: 2.5 }}>
            {[
              { Icon: MonitorHeartIcon, t: 'Score de saúde 0–100', f: 'Marcadores fora da faixa − severidade − recência', d: 'Cada item alterado tira pontos conforme a gravidade; exames antigos pesam menos. O número que você acompanha no app é essa conta — aberta, não mágica.', src: [{ l: 'Faixas do seu laboratório + diretrizes ADA/SBC/OMS' }] },
              { Icon: MonitorWeightIcon, t: 'Idade biológica (PhenoAge)', f: 'Levine et al., Aging 2018 — 9 marcadores', d: 'Albumina, creatinina, glicose, PCR e mais nove marcadores do seu exame comum revelam se seu corpo é mais novo (ou velho) que a carteira.', src: [{ l: 'Levine et al., Aging 2018 (PubMed) →', href: 'https://pubmed.ncbi.nlm.nih.gov/29676998/' }] },
              { Icon: CalculateIcon, t: 'eGFR · HOMA-IR · IMC', f: 'CKD-EPI · (glicemia × insulina)/405 · peso/altura²', d: 'Os índices que o laudo não calcula: função renal, resistência à insulina e composição — gerados na hora, com o valor ideal ao lado do de referência.', src: [{ l: 'CKD-EPI: Inker, NEJM 2021 →', href: 'https://pubmed.ncbi.nlm.nih.gov/34554658/' }, { l: 'HOMA-IR: Matthews, 1985 →', href: 'https://pubmed.ncbi.nlm.nih.gov/3899825/' }] },
              { Icon: WarningAmberIcon, t: 'Leitura de risco', f: 'Cada risco cita a diretriz que o define', d: 'Pré-diabetes, anemia, cardiovascular: o limiar vem da ADA, SBC ou OMS — e aparece no card. Seu perfil (sexo, idade, etnia) ajusta a leitura.', src: [{ l: 'ADA · SBC' }, { l: 'OMS (hipertensão) →', href: 'https://www.who.int/news-room/fact-sheets/detail/hypertension' }] },
              { Icon: ChildCareIcon, t: 'Faixas por idade', f: 'Harriet Lane Handbook, 22ª ed. (pediatria)', d: 'Exame de criança lido com régua de criança: quando o laudo não traz a faixa da idade, aplicamos a banda etária e marcamos o item com selo transparente.', src: [{ l: 'The Harriet Lane Handbook, 22ª ed. — Elsevier/Johns Hopkins (sem link: cite completa no app)' }] },
              { Icon: AutoAwesomeIcon, t: 'IA que explica, não inventa', f: 'Valores vêm do laudo · pós-filtro anti-diagnóstico', d: 'A extração lê o texto do PDF, você confere antes de salvar, e um filtro bloqueia linguagem de diagnóstico. A IA contextualiza — a régua decide.', src: [{ l: 'ANVISA, RDC nº 657/2022 (DOU — consulta pública no site da ANVISA)' }] },
            ].map((c) => (
              <Box key={c.t} sx={{ p: 3, borderRadius: '12px', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', height: '100%', display: 'flex', flexDirection: 'column', transition: 'all .2s ease', '&:hover': { transform: 'translateY(-4px)', boxShadow: '0 20px 44px rgba(15,61,58,.10)', borderColor: TEAL } }}>
                <Box sx={{ width: 48, height: 48, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2, background: 'linear-gradient(135deg,rgba(32,178,170,.14),rgba(32,178,170,.06))' }}>
                  <c.Icon sx={{ fontSize: 26, color: TEAL_DARK }} />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 800, fontSize: 16.5, color: 'text.primary', mb: 0.75 }}>{c.t}</Typography>
                <Box sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: TEAL_DARK, bgcolor: 'rgba(32,178,170,.08)', borderRadius: '8px', px: 1.25, py: 0.75, mb: 1.5, fontWeight: 600 }}>{c.f}</Box>
                <Typography sx={{ fontSize: 13.5, color: 'text.secondary', lineHeight: 1.6, flex: 1 }}>{c.d}</Typography>
                <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'text.disabled', fontStyle: 'italic' }}>
                  Fonte: {c.src.map((s: { l: string; href?: string }, i: number) => (
                    <Box key={s.l} component="span">
                      {i > 0 && ' · '}
                      {s.href ? (
                        <Box component="a" href={s.href} target="_blank" rel="noopener noreferrer" sx={{ color: TEAL_DARK, textDecoration: 'none', fontWeight: 700, '&:hover': { textDecoration: 'underline' } }}>{s.l}</Box>
                      ) : s.l}
                    </Box>
                  ))}
                </Typography>
              </Box>
            ))}
          </Box>
          <Box sx={{ textAlign: 'center', mt: 4 }}>
            <Button variant="outlined" onClick={() => navigate('/como-validamos')} sx={{ borderRadius: '999px', px: 4, py: 1.2, textTransform: 'none', fontWeight: 700, borderColor: '#d8f4f2', color: TEAL_DARK, '&:hover': { borderColor: TEAL, bgcolor: 'rgba(32,178,170,.06)' } }}>
              Ver cada regra, com a fonte →
            </Button>
          </Box>
        </Container>
      </Box>

      {/* PLANOS — modelo explicado antes dos preços: "como funciona" mata a confusão
          créditos × avulso × assinatura (feedback do dono: travou 3× lendo os cards). */}
      <Box id="planos" sx={{ bgcolor: 'background.paper', borderTop: '1px solid', borderColor: 'divider', py: { xs: 8, md: 11 }, scrollMarginTop: 80 }}>
        <Container maxWidth="md">
          <Typography align="center" variant="h2" sx={{ fontSize: { xs: '1.9rem', md: '2.6rem' }, fontWeight: 800, color: 'text.primary', mb: 1.5, letterSpacing: '-0.02em' }}>Planos <Box component="span" sx={{ ...SERIF_I, color: TEAL_DARK }}>simples e justos</Box></Typography>
          <Typography align="center" sx={{ color: 'text.secondary', mb: 3, fontSize: 17 }}>Comece grátis. Assine quando precisar — ou pague só pelo que usar.</Typography>

          {/* COMO FUNCIONA (3 passos, 1 linha cada) — antes de qualquer preço */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1.5, sm: 2.5 }} justifyContent="center" sx={{ mb: 4, flexWrap: 'wrap' }}>
            {[
              ['1️⃣', 'Baixe e teste grátis', `${credits} créditos de presente no 1º exame — sem cartão`],
              ['2️⃣', 'A IA usa créditos', '1 resumo = 10 · 1 pergunta no chat = 2 · 1 envio = 1'],
              ['3️⃣', 'Acabou? Você escolhe', 'Assina o mensal (melhor custo + extras) ou compra pacotes'],
            ].map(([n, t, d]) => (
              <Box key={t} sx={{ flex: { sm: '1 1 220px' }, maxWidth: 320, px: 2.2, py: 1.8, borderRadius: '12px', bgcolor: 'background.default', border: '1px solid', borderColor: 'divider', textAlign: 'left' }}>
                <Typography sx={{ fontSize: 13, fontWeight: 800, color: 'text.primary' }}>{n} {t}</Typography>
                <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.3, lineHeight: 1.5 }}>{d}</Typography>
              </Box>
            ))}
          </Stack>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 3, alignItems: 'center' }}>
            {planData(credits, planInfo).map((p) => (
              <Box key={p.name} sx={{
                p: 3, borderRadius: '12px', bgcolor: 'background.paper',
                border: p.highlight ? `2px solid ${TEAL}` : '1px solid',
                borderColor: p.highlight ? TEAL : 'divider',
                boxShadow: p.highlight ? '0 24px 56px rgba(32,178,170,.22)' : '0 2px 8px rgba(0,0,0,.04)',
                position: 'relative', transform: p.highlight ? { xs: 'none', sm: 'scale(1.04)' } : 'none',
                ...(p.highlight ? { bgcolor: 'transparent', background: 'linear-gradient(135deg,rgba(32,178,170,.14),rgba(212,165,116,.10))' } : {}),
                transition: 'transform .2s ease, box-shadow .2s ease',
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
                <Button fullWidth variant={p.highlight ? 'contained' : 'outlined'} color="primary" onClick={() => navigate('/registrar')} sx={{ mt: 2.5, borderRadius: '999px', textTransform: 'none', fontWeight: 700, ...(p.highlight ? {} : { borderColor: '#d8f4f2', color: TEAL_DARK }) }}>{p.cta}</Button>
              </Box>
            ))}
          </Box>

          {/* REGRA DE DECISÃO — a pergunta que todo visitante tem ("qual eu pego?") respondida
              em 1 linha. Sem isto, avulso × assinatura parece enigma. */}
          <Typography align="center" sx={{ color: 'text.secondary', mt: 4, fontSize: 15, maxWidth: 560, mx: 'auto', lineHeight: 1.6 }}>
            <strong>Não sabe qual escolher?</strong> Faz exame todo mês? O plano se paga sozinho (e vem com relatório ilimitado e histórico completo). Só tem exame de vez em quando? Compre créditos avulsos — sem mensalidade, e eles nunca expiram.
          </Typography>
        </Container>
      </Box>

      {/* SEÇÃO — Indique e ganhe (programa de indicação) */}
      <Box sx={{ bgcolor: 'background.default', borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider', py: { xs: 8, md: 10 } }}>
        <Container maxWidth="md">
          <Stack direction={{ xs: 'column', md: 'row' }} alignItems="center" spacing={{ xs: 3, md: 6 }} sx={{ textAlign: { xs: 'center', md: 'left' } }}>
            <Box sx={{ fontSize: { xs: 56, md: 72 }, lineHeight: 1, flexShrink: 0 }}>🎁</Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h2" sx={{ fontSize: { xs: '1.7rem', md: '2.3rem' }, fontWeight: 800, color: 'text.primary', mb: 1, letterSpacing: '-0.02em' }}>Indique e <Box component="span" sx={{ ...SERIF_I, color: TEAL_DARK }}>ganhe créditos</Box></Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: 17, mb: 2.5 }}>Compartilhe seu código com amigos. Quando alguém cria a conta com ele, <b style={{ color: TEAL_DARK }}>vocês dois ganham +{refBonus} créditos</b> — pra usar no Dr. Exame.</Typography>
              <Stack direction="row" spacing={1.5} justifyContent={{ xs: 'center', md: 'flex-start' }} flexWrap="wrap" useFlexGap>
                {[{ n: `+${refBonus}`, l: 'pra você', c: TEAL }, { n: `+${refBonus}`, l: 'pra seu amigo', c: '#0ea5e9' }, { n: '10/mês', l: 'limite anti-abuso', c: 'text.secondary' }].map((x) => (
                  <Box key={x.l} sx={{ px: 2, py: 1, borderRadius: '12px', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', textAlign: 'center', minWidth: 92 }}>
                    <Typography sx={{ fontWeight: 800, fontSize: 20, color: x.c, lineHeight: 1.1 }}>{x.n}</Typography>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{x.l}</Typography>
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
            borderRadius: { xs: 4, md: 6 }, p: { xs: 4, md: 7 }, textAlign: 'center', color: '#fff', position: 'relative', overflow: 'hidden',
            background: 'linear-gradient(135deg,#20b2aa 0%,#178f89 55%,#0f5f5a 100%)',
            boxShadow: '0 24px 60px rgba(32,178,170,.32)',
          }}>
            <Box sx={{ position: 'absolute', top: '-30%', right: '-10%', width: 360, height: 360, borderRadius: '50%', background: 'rgba(255,255,255,.08)' }} />
            <Box sx={{ position: 'relative' }}>
              <Typography variant="h2" sx={{ fontSize: { xs: '1.7rem', md: '2.3rem' }, fontWeight: 800, mb: 2, letterSpacing: '-0.02em' }}>Pronto pra entender <Box component="span" sx={{ ...SERIF_I }}>sua saúde?</Box></Typography>
              <Typography sx={{ color: 'rgba(255,255,255,.9)', mb: 4, fontSize: 17, maxWidth: 480, mx: 'auto' }}>Crie sua conta grátis e envie seu primeiro exame em menos de 1 minuto.</Typography>
              <Button size="large" onClick={() => navigate('/registrar')} sx={{ bgcolor: '#fff', color: TEAL_DARK, fontWeight: 800, fontSize: 17, borderRadius: '999px', px: 5, py: 1.5, textTransform: 'none', '&:hover': { bgcolor: '#f0fafa', transform: 'translateY(-2px)' }, transition: 'all .2s' }}>Começar agora →</Button>
              {/* App na Play Store — QR OFICIAL + badge Google Play no ponto de maior intenção.
                  Substitui o QR genérico antigo: agora aponta pro app APROVADO na loja (confiança + conversão). */}
              <Stack component="a" href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer"
                direction={{ xs: 'column', sm: 'row' }} spacing={2} useFlexGap alignItems="center"
                sx={{ mt: 4, maxWidth: 430, mx: 'auto', textDecoration: 'none', bgcolor: '#fff',
                  borderRadius: '12px', p: 1.5, pr: { xs: 1.5, sm: 2.5 }, color: 'text.primary',
                  boxShadow: '0 10px 28px rgba(0,0,0,.18)',
                  transition: 'transform .18s ease, box-shadow .18s ease',
                  '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 16px 34px rgba(0,0,0,.24)' } }}>
                <Box component="img" src={`${import.meta.env.BASE_URL}playstore-qr.png`} alt="QR code para baixar o Dr. Exame na Play Store"
                  sx={{ width: 116, height: 116, borderRadius: '12px', bgcolor: '#fff', display: 'block', flexShrink: 0 }} />
                <Box sx={{ textAlign: { xs: 'center', sm: 'left' } }}>
                  <Typography sx={{ fontWeight: 800, fontSize: 16, lineHeight: 1.15, color: 'text.primary' }}>Dr. Exame <Box component="span" sx={SERIF_I}>no seu celular</Box> 📱</Typography>
                  <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 1 }}>Aponte a câmera do celular ou toque pra baixar.</Typography>
                  <Box component="img" src={`${import.meta.env.BASE_URL}playstore-badge.png`} alt="Disponível no Google Play"
                    sx={{ height: 46, width: 'auto', display: 'block', mx: { xs: 'auto', sm: 0 } }} />
                </Box>
              </Stack>
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
          {/* Links como <a> de verdade (auditoria a11y: eram divs clicáveis — sem teclado/foco/semântica) */}
          <Stack direction="row" spacing={3} justifyContent="center" useFlexGap sx={{ flexWrap: 'wrap' }}>
            {[{ l: 'Portal do Médico', h: '#/doctor' }, { l: 'Como validamos', h: '#/como-validamos' }, { l: 'Dúvidas frequentes', h: '#/faq' }, { l: 'Termos e LGPD', h: '#/termos' }, { l: 'Criar conta', h: '#/registrar' }, { l: 'Entrar', h: '#/entrar' }].map((x) => (
              <Box key={x.l} component="a" href={x.h} sx={{ color: '#5fc9c3', fontSize: 13, fontWeight: 700, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>{x.l}</Box>
            ))}
          </Stack>
        </Container>
      </Box>

      {/* MODAL — tour em vídeo (aberto pelo botão ▶ do hero). Iframe só monta ao abrir (não pesa o load). */}
      <Dialog
        open={tourOpen}
        onClose={() => setTourOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { bgcolor: '#000', m: { xs: 1, sm: 2 }, overflow: 'hidden' } }}
      >
        <Box sx={{ position: 'relative', width: '100%', aspectRatio: '16 / 9' }}>
          {tourOpen && (
            <Box
              component="iframe"
              src={`https://www.youtube-nocookie.com/embed/${TOUR_VIDEO_ID}?autoplay=1&rel=0`}
              title="Dr. Exame — tour pela plataforma"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
            />
          )}
        </Box>
      </Dialog>
    </Box>
  );
};

// Estilo do botão de nav (texto discreto)
const navBtn = (scrolled: boolean) => ({
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'text.primary', fontWeight: 600, fontSize: 14, textTransform: 'none' as const,
  '&:hover': { color: TEAL_DARK },
});
