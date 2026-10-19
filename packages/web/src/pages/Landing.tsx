import { Box, Container, Typography, Button, Stack, Chip, Dialog, IconButton, Collapse } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import DirectionsRunIcon from '@mui/icons-material/DirectionsRun';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect, lazy, Suspense } from 'react';
import { DrExame } from '../components/DrExame';

// Ícones MUI (premium, no lugar dos emojis antigos)
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import Diversity3Icon from '@mui/icons-material/Diversity3';
import LockIcon from '@mui/icons-material/Lock';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import MedicationIcon from '@mui/icons-material/Medication';
import SavingsIcon from '@mui/icons-material/Savings';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import FamilyRestroomIcon from '@mui/icons-material/FamilyRestroom';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import AccessibilityNewIcon from '@mui/icons-material/AccessibilityNew';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import ChildCareIcon from '@mui/icons-material/ChildCare';
import DescriptionIcon from '@mui/icons-material/Description';
import ShareIcon from '@mui/icons-material/Share';
import StorefrontIcon from '@mui/icons-material/Storefront';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import PsychologyIcon from '@mui/icons-material/Psychology';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';

import { ExamDemo } from '../components/ExamDemo';
import { LeadPopup } from '../components/LeadPopup';
import { DecifreReal } from '../components/DecifreReal';
import { FaqSection, FAQ_ITEMS } from '../components/FaqSection';
import { PaymentLogos } from '../components/PaymentLogos';
import { SportsSection } from '../components/landing/SportsSection';
// FAQ esportivo: lazy — só entra no bundle quando a variante ?sports=1 abre (CWV).
const SportsFaq = lazy(() => import('../components/landing/SportsFaq').then((m) => ({ default: m.SportsFaq })));
import { HeroRuler } from '../components/landing/HeroRuler';
import { ProductPreview } from '../components/landing/ProductPreview';
import { HealthEcosystemBento } from '../components/landing/HealthEcosystemBento';
import { LandingNavbar } from '../components/landing/LandingNavbar';
import { LandingBodyMapSection } from '../components/landing/LandingBodyMapSection';
import { ComparisonTable } from '../components/landing/ComparisonTable';
import { TrustSection } from '../components/landing/TrustSection';
import { TeleconsultaShowcase } from '../components/landing/TeleconsultaShowcase';
import { FloatingWhatsAppButton } from '../components/FloatingWhatsAppButton';
import { HealthPackageShowcaseCard } from '../components/landing/HealthPackageShowcaseCard';
import { ClinicalDecisionCard } from '../components/landing/ClinicalDecisionCard';
import { fetchPublicConfig, API_URL } from '../config';
import { usePlanInfo, fmtBRL } from '../utils/planInfo';
import { useHeroAb } from '../hooks/useHeroAb';
import { ScrollReveal, AnimatedNumber } from '../components/ScrollReveal';
import { Reveal } from '../components/Reveal';
import { tealText } from '../theme';
import {
  Gift, CheckCircle, UploadSimple, Heartbeat, Lightning, FileText,
  ClockCounterClockwise, UsersThree, CreditCard, Stack as StackIcon, Coins,
  CalendarBlank, Browser, Dna, ChartLineUp, Barbell,
} from '@phosphor-icons/react';

/** Ícone premium por feature dos planos — Phosphor em vez de checkbox genérico.
 *  Cada feature tem um ícone que REPRESENTA o benefício (não só um check). */
const PlanFeatureIcon = ({ name, highlight }: { name: string; highlight: boolean }) => {
  const color = highlight ? TEAL_DARK : GREEN;
  const size = 18;
  const icons: Record<string, React.ReactNode> = {
    gift: <Gift size={size} color={color} weight="duotone" />,
    check: <CheckCircle size={size} color={color} weight="fill" />,
    upload: <UploadSimple size={size} color={color} weight="duotone" />,
    heartbeat: <Heartbeat size={size} color={color} weight="duotone" />,
    lightning: <Lightning size={size} color={color} weight="fill" />,
    'file-text': <FileText size={size} color={color} weight="duotone" />,
    history: <ClockCounterClockwise size={size} color={color} weight="duotone" />,
    users: <UsersThree size={size} color={color} weight="duotone" />,
    card: <CreditCard size={size} color={color} weight="duotone" />,
    stack: <StackIcon size={size} color={color} weight="duotone" />,
    coins: <Coins size={size} color={color} weight="duotone" />,
    'no-subscription': <CalendarBlank size={size} color={color} weight="duotone" />,
    clock: <Browser size={size} color={color} weight="duotone" />,
    barbell: <Barbell size={size} color={color} weight="duotone" />,
  };
  return <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{icons[name] ?? <CheckCircle size={size} color={color} weight="fill" />}</Box>;
};

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


// Planos da LANDING — preço/créditos/perks vêm da API (admin edita live; honesto por padrão:
// o free é COMPLETO por uso; o mensal vende economia + perks, não "trancas").
// FEATURES agora são { icon, text } — Phosphor Icons em vez de emoji/checkbox genérico.
const planData = (credits: number, info: ReturnType<typeof usePlanInfo> = null) => {
  const p = info?.plan;
  const perks = info?.premiumPerks;
  const minPack = info?.packs?.length ? Math.min(...info.packs.map((x) => x.price)) : 9.9;
  return [
    { name: 'Grátis', price: 'R$ 0', period: '', highlight: false, cta: 'Começar grátis →', features: [
      { icon: 'gift', text: `${credits} créditos no cadastro (≈ ${Math.floor(credits / 10)} resumos)` },
      { icon: 'check', text: '1º exame com análise completa grátis' },
      { icon: 'upload', text: 'Envie exames (PDF/foto) + alertas' },
      { icon: 'heartbeat', text: 'Score de Saúde e tendências' },
      { icon: 'users', text: 'Família e portal do médico no plano grátis' },
    ] },
    { name: 'Mensal', price: p ? (p.founder && p.price !== p.effectivePrice ? fmtBRL(p.effectivePrice) : fmtBRL(p.price)) : 'R$ —', period: '/mês', highlight: true, cta: p?.founder ? 'Garantir vaga de fundador' : 'Assinar mensal', features: [
      { icon: 'lightning', text: `${p?.monthlyCredits ?? 250} créditos de IA/mês (melhor custo)` },
      { icon: 'file-text', text: 'Relatórios completos incluídos' },
      { icon: 'barbell', text: 'Modo Saúde Esportiva' },
      { icon: 'history', text: 'Histórico de anos anteriores' },
      { icon: 'users', text: `Família até ${perks?.familyLimit ?? 10} perfis` },
      { icon: 'upload', text: 'Envios de exame sem custo' },
    ] },
    { name: 'Créditos', price: `a partir de ${fmtBRL(minPack ?? 9.9)}`, period: 'avulso', highlight: false, cta: 'Ver pacotes', features: [
      { icon: 'card', text: 'PIX, cartão ou débito' },
      { icon: 'stack', text: 'Pacotes flexíveis' },
      { icon: 'coins', text: 'Cada análise consome créditos' },
      { icon: 'no-subscription', text: 'Sem mensalidade' },
      { icon: 'clock', text: 'Use quando precisar — não expiram' },
    ] },
  ];
};

// Tour em vídeo (YouTube) — embedado no hero (botão play → modal).
const TOUR_VIDEO_ID = 'jyHezElJyjA';

export const LandingPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Variante esportiva (?sports=1) — destino do tráfego QR dos cartazes de academia.
  // Message match com o cartaz Métrica Vital ("Você acompanha seus treinos. E seus exames?").
  const isSports = searchParams.get('sports') === '1';
  const heroAb = useHeroAb(!isSports);
  const [scrolled, setScrolled] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  useEffect(() => {
    if (isSports) document.title = 'Exames para quem treina — Modo Saúde Esportiva | Dr. Exame';
  }, [isSports]);
  // Disclosure nível 1 (NN/g: máx 2 níveis, affordance óbvia) — showcase e ciência
  // mostram o essencial e revelam o resto sob botão claro. Nada é apagado.
  const [showAllScience, setShowAllScience] = useState(false);
  // CTA FIXO mobile: a página tem ~12 mil px e o botão grande só existia na 1ª e na
  // última dobra — no meio do funil o polegar não alcançava conversão nenhuma.
  const [showMobileCta, setShowMobileCta] = useState(false);
  useEffect(() => {
    const h = () => {
      setScrolled(window.scrollY > 40);
      // Aparece após o hero; SOME na zona do CTA final/footer (últimos ~900px) pra
      // não ecoar dois CTAs grandes na mesma tela.
      const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 900;
      setShowMobileCta(window.scrollY > 700 && !nearBottom);
    };
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);
  // Deep-link do e-mail de boas-vindas do lead: ?ir=decifre rola direto pro
  // "Cole seu exame" (#demo) — o CTA cumpre a promessa do e-mail no primeiro toque.
  useEffect(() => {
    if (searchParams.get('ir') !== 'decifre') return;
    const t = setTimeout(() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 450);
    return () => clearTimeout(t);
  }, [searchParams]);

  const [credits, setCredits] = useState(45);
  const [refBonus, setRefBonus] = useState(10);
  useEffect(() => { fetchPublicConfig().then((c) => { setCredits(c.freeSignup); setRefBonus(c.referralBonus); }); }, []);

  // Logos REAIS das farmácias pro mock do comparador (credibilidade — sigla é fallback).
  const [pharmLogos, setPharmLogos] = useState<Record<string, string | null>>({});
  useEffect(() => {
    fetch(`${API_URL}/medications/pharmacies`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { name: string; logoUrl: string | null }[]) => setPharmLogos(Object.fromEntries(rows.map((p) => [p.name, p.logoUrl]))))
      .catch(() => { /* mock usa sigla colorida */ });
  }, []);
  // VITRINE REAL de preços (catálogo × melhor oferta) — prova viva de que a comparação
  // funciona; antes era 1 mock hardcoded e o dono reclamou: "legal mostrar todos".
  const [medDeals, setMedDeals] = useState<{ name: string; doses: string[]; priceCents: number; pharmacy: string; offersCount: number }[]>([]);
  useEffect(() => {
    fetch(`${API_URL}/medications/deals`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: any[]) => setMedDeals(Array.isArray(rows) ? rows.slice(0, 6) : []))
      .catch(() => { /* sem vitrine, o hero card continua */ });
  }, []);
  // Preço do plano/packs da API pública (admin edita live — landing nunca mais mente sobre preço).
  const planInfo = usePlanInfo();

  const goTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100dvh', overflow: 'hidden' }}>
      {/* keyframes (float do hero + chips) */}
      <style>{`
        @keyframes heroFloat { 0%,100%{transform:translateY(0) rotate(-1.5deg)} 50%{transform:translateY(-12px) rotate(-1.5deg)} }
        @keyframes chipFloatA { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-9px)} }
        @keyframes chipFloatB { 0%,100%{transform:translateY(0)} 50%{transform:translateY(9px)} }
        @keyframes shimmerBtn {
          0% { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
        .hero-float { animation: heroFloat 6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce){ .hero-float{ animation: none !important; } }
      `}</style>

      {/* NAVBAR flutuante com MEGA MENU estilo Kantesti (Web e Mobile/APK safe) */}
      <LandingNavbar scrolled={scrolled} isSports={isSports} onGoToSection={goTo} />

      {/* HERO — premium mesh gradient (padrão) OU Métrica Vital dark (variante ?sports=1:
          mesmo fundo profundo dos cartazes de academia — continuidade da campanha QR). */}
      <Box sx={{
        position: 'relative', overflow: 'hidden',
        background: isSports
          ? 'linear-gradient(160deg, #06201e 0%, #093330 45%, #0f5f5a 100%)'
          : 'linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(240,250,249,1) 100%)',
        pt: { xs: 11, md: 14 }, pb: { xs: 7, md: 10 },
      }}>
        <Box sx={{ position: 'absolute', top: '-10%', right: '-5%', width: 520, height: 520, borderRadius: '50%', background: isSports ? 'radial-gradient(circle,rgba(32,178,170,.30),transparent 70%)' : 'radial-gradient(circle,rgba(32,178,170,.25),transparent 70%)', pointerEvents: 'none', filter: 'blur(40px)' }} />
        <Box sx={{ position: 'absolute', bottom: '-15%', left: '-8%', width: 420, height: 420, borderRadius: '50%', background: isSports ? 'radial-gradient(circle,rgba(212,165,116,.14),transparent 70%)' : 'radial-gradient(circle,rgba(212,165,116,.20),transparent 70%)', pointerEvents: 'none', filter: 'blur(40px)' }} />
        <Box sx={{ position: 'absolute', top: '-5%', left: '-3%', width: 340, height: 340, borderRadius: '50%', background: 'radial-gradient(circle,rgba(250,253,252,.5),transparent 70%)', pointerEvents: 'none', filter: 'blur(30px)', opacity: isSports ? 0.25 : 1 }} />
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
            {/* Coluna texto — CRO v3: UM objetivo de conversão (criar conta). Um CTA
                primário, um secundário de mesma página (âncora, não navega), retornante
                discreto. Play Store sai do hero (concorria pelo clique) e fica no CTA
                final, onde a intenção já está confirmada. Headline em A/B 50/50
                (useHeroAb) — A controle, B específica (outcome + prazo). */}
            <Box>
              {isSports ? (
                <>
                  <Typography sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: { xs: 11.5, sm: 13 }, fontWeight: 700, letterSpacing: { xs: '0.14em', sm: '0.2em' }, color: '#d4a574', mb: 1.5 }}>
                    VOCÊ ACOMPANHA SEUS TREINOS.
                  </Typography>
                  <Typography variant="h1" sx={{ fontSize: { xs: '2.6rem', md: '3.8rem' }, fontWeight: 800, lineHeight: 1.05, mb: 2.5, letterSpacing: '-0.03em', color: '#fff' }}>
                    <Box component="span" sx={{ display: 'block' }}>E seus <Box component="span" sx={{ ...SERIF_I, color: '#5fc9c3', fontSize: '1.06em' }}>exames?</Box></Box>
                  </Typography>
                  <Typography sx={{ fontSize: { xs: 16.5, md: 19 }, color: 'rgba(255,255,255,.85)', mb: 3, lineHeight: 1.6, maxWidth: 520 }}>
                    Hormônios, hematócrito, colesterol, fígado e rim interpretados <b style={{ color: '#fff' }}>no contexto de quem treina</b> — a régua do laboratório de um lado, seu histórico do outro e <b style={{ color: '#fff' }}>a meta do SEU médico</b> no meio.
                  </Typography>
                  <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 3, rowGap: 1 }}>
                    <Chip icon={<LockIcon sx={{ fontSize: 17 }} />} label="Declarações confidenciais (LGPD) · sem julgamento" sx={{ bgcolor: 'rgba(32,178,170,.18)', color: '#c9efec', fontWeight: 700, fontSize: 13, pl: 1, '& .MuiChip-icon': { color: '#5fc9c3' } }} />
                  </Stack>
                </>
              ) : (
                <>
                  <Typography variant="h1" sx={{ fontSize: { xs: '2.3rem', md: '3.4rem' }, fontWeight: 800, lineHeight: 1.08, mb: 2.5, letterSpacing: '-0.03em', color: 'text.primary' }}>
                    {heroAb === 'A' ? (
                      <><Box component="span" sx={{ display: 'block' }}>Entenda seus exames</Box> como <Box component="span" sx={{ ...SERIF_I, color: INK, fontSize: '1.06em' }}>nunca antes.</Box></>
                    ) : (
                      <><Box component="span" sx={{ display: 'block' }}>Seu exame de sangue,</Box> explicado <Box component="span" sx={{ ...SERIF_I, color: INK, fontSize: '1.06em' }}>em 30 segundos.</Box></>
                    )}
                  </Typography>
                  <Typography sx={{ fontSize: { xs: 16.5, md: 19 }, color: 'text.secondary', mb: 3, lineHeight: 1.6, maxWidth: 500 }}>
                    Envie o PDF ou a foto. O <b style={{ color: 'text.primary' }}>Dr. Exame</b> lê com IA, explica cada valor em <b style={{ color: 'text.primary' }}>português simples</b>, mostra sua <b style={{ color: 'text.primary' }}>leitura de risco</b> e monta o <b style={{ color: 'text.primary' }}>plano de ação</b> pra levar ao médico.
                  </Typography>
                  <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 3, rowGap: 1 }}>
                    <Chip icon={<LockIcon sx={{ fontSize: 17 }} />} label="A IA não inventa números — vêm do seu laudo" sx={{ bgcolor: 'rgba(5,150,105,.10)', color: '#047857', fontWeight: 700, fontSize: 13, pl: 1, '& .MuiChip-icon': { color: GREEN } }} />
                  </Stack>
                </>
              )}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} useFlexGap sx={{ mb: 1.5 }} alignItems={{ xs: 'stretch', sm: 'center' }}>
                <Button variant="contained" size="large" onClick={() => navigate('/registrar')} sx={{
                  borderRadius: '999px', px: 4, py: 1.5, fontSize: 17, textTransform: 'none', fontWeight: 800,
                  bgcolor: 'primary.dark',
                  background: 'linear-gradient(90deg, #178f89 0%, #20b2aa 50%, #178f89 100%)',
                  backgroundSize: '200% auto',
                  animation: 'shimmerBtn 3s linear infinite',
                  boxShadow: isSports ? '0 8px 28px rgba(0,0,0,.35), 0 8px 24px rgba(32,178,170,.35)' : '0 8px 24px rgba(32,178,170,.35)',
                  '&:hover': {
                    backgroundPosition: 'right center',
                    boxShadow: '0 10px 28px rgba(32,178,170,.45)',
                  }
                }}>
                  Começar agora — é grátis
                </Button>
                <Button
                  variant="text"
                  size="large"
                  onClick={() => goTo(isSports ? 'esporte' : 'demo')}
                  sx={{
                    textTransform: 'none', fontWeight: 700, fontSize: 15, minWidth: 0,
                    color: isSports ? '#5fc9c3' : TEAL_DARK,
                    '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' },
                  }}
                >
                  {isSports ? 'Ver como a IA interpreta ↓' : 'Ver como funciona ↓'}
                </Button>
              </Stack>
              {/* Risk-reversal no ponto de decisão — atrito zero em 1 linha (insight
                  Kantesti: "60 segundos, sem cadastro" como centro). */}
              <Typography sx={{ fontSize: 13, color: isSports ? 'rgba(255,255,255,.75)' : 'text.secondary', fontWeight: 700 }}>
                ⚡ Em menos de 1 minuto · Grátis · Sem cartão · Primeiro exame com análise grátis
              </Typography>
              {/* Badge Android — app REAL na Play Store desde a 1ª dobra (o QR do rodapé
                  cobre quem chegou ao fim; este cobre quem só viu o topo). */}
              <Box
                component="a"
                href={PLAY_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 0.75, mt: 1,
                  px: 1.5, py: 0.5, borderRadius: '999px', textDecoration: 'none',
                  border: '1px solid', borderColor: isSports ? 'rgba(95,201,195,.4)' : 'rgba(32,178,170,.35)',
                  bgcolor: isSports ? 'rgba(32,178,170,.14)' : 'rgba(32,178,170,.06)',
                  color: isSports ? '#5fc9c3' : TEAL_DARK,
                  fontSize: 12.5, fontWeight: 800, width: 'fit-content',
                  '&:hover': { bgcolor: 'rgba(32,178,170,.12)' },
                }}
              >
                📱 App Android disponível
              </Box>
              {/* Prova imediata sem scroll — SÓ verificável: nota real da Play, fontes
                  reais (diretrizes em packages/server/knowledge), LGPD. Zero métrica inventada. */}
              <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mt: 1.5, mb: 1, '& span': { fontSize: 12.5, fontWeight: 700, color: isSports ? 'rgba(255,255,255,.8)' : 'text.secondary', display: 'inline-flex', alignItems: 'center', gap: 0.5 } }}>
                {isSports ? (
                  <>
                    <Box component="span">📘 Diretrizes <b style={{ color: '#fff' }}>SBEM 2026</b> e Endocrine Society</Box>
                    <Box component="span" sx={{ opacity: 0.35 }}>•</Box>
                    <Box component="span">🔒 Registro confidencial (LGPD)</Box>
                    <Box component="span" sx={{ opacity: 0.35 }}>•</Box>
                    <Box component="span">🚫 Nunca recomenda dose ou ciclo</Box>
                  </>
                ) : (
                  <>
                    <Box component="span">⭐ <b style={{ color: 'text.primary' }}>5,0</b> na Google Play</Box>
                    <Box component="span" sx={{ opacity: 0.35 }}>•</Box>
                    <Box component="span">📗 IA com fontes: SBC, SBD e ADA</Box>
                    <Box component="span" sx={{ opacity: 0.35 }}>•</Box>
                    <Box component="span">🔒 Conforme a LGPD</Box>
                  </>
                )}
              </Stack>
              <Button variant="text" size="small" onClick={() => navigate('/entrar')} sx={{ textTransform: 'none', fontWeight: 700, color: isSports ? '#5fc9c3' : INK, fontSize: 13, minWidth: 0, px: 0, justifyContent: { xs: 'center', sm: 'flex-start' }, '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' } }}>
                Já tem conta? Entrar
              </Button>
            </Box>

            {/* Coluna visual — padrão: mockup em camadas + régua assinatura compacta
                (a história do produto em 1 visual: faixa do lab, seu valor, meta do médico).
                Esportiva: régua Métrica Vital em campo escuro + mascote — mesmo idioma
                visual do cartaz de academia que gerou o QR. */}
            {isSports ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', position: 'relative', gap: 2.5, pt: { xs: 5.5, md: 3 } }}>
                <Box
                  sx={{
                    position: 'absolute', top: { xs: -6, md: -22 }, right: { xs: 0, md: -10 }, zIndex: 4,
                    animation: 'chipFloatA 5s ease-in-out infinite',
                  }}
                >
                  <Stack direction="row" spacing={1.25} alignItems="center" sx={{
                    bgcolor: 'rgba(9,51,48,.92)', border: '1px solid rgba(32,178,170,.4)',
                    borderRadius: '16px', px: 1.75, py: 1,
                    backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                    boxShadow: '0 12px 30px rgba(0,0,0,.35)',
                  }}>
                    <DrExame size={40} />
                    <Box>
                      <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: '#e8eef0', lineHeight: 1.2, fontFamily: '"Poppins",sans-serif' }}>Modo Saúde Esportiva</Typography>
                      <Typography sx={{ fontSize: 11, color: '#5fc9c3', fontWeight: 700 }}>contexto de quem treina</Typography>
                    </Box>
                  </Stack>
                </Box>
                <Box sx={{ bgcolor: 'rgba(6,32,30,.55)', border: '1px solid rgba(32,178,170,.22)', borderRadius: '24px', p: { xs: 2.5, md: 3.5 }, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                  <HeroRuler tone="dark" goalLabel="meta do seu médico" />
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 2.5, justifyContent: 'center' }}>
                    {['CK pós-treino', 'Hematócrito 48–54%', 'Cistatina-C', 'Ferritina'].map((m) => (
                      <Box key={m} sx={{ px: 1.5, py: 0.5, borderRadius: '999px', border: '1px solid rgba(212,165,116,.35)', color: '#d4a574', fontSize: 12, fontWeight: 700, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', letterSpacing: '.04em' }}>
                        {m.toUpperCase()}
                      </Box>
                    ))}
                  </Stack>
                </Box>
              </Box>
            ) : (
            <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%', position: 'relative' }}>
              {/* Badge flutuante 1 (topo-esquerda) */}
              <Box
                sx={{
                  position: 'absolute', top: { xs: -12, md: 12 }, left: { xs: 6, md: -20 }, zIndex: 4,
                  bgcolor: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                  borderRadius: '16px', px: 1.75, py: 1,
                  boxShadow: '0 12px 30px rgba(0,0,0,0.08), 0 2px 8px rgba(32,178,170,0.12)',
                  border: '1px solid rgba(255,255,255,0.85)',
                  display: 'flex', alignItems: 'center', gap: 1,
                  animation: 'chipFloatA 5s ease-in-out infinite',
                }}
              >
                <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: '#059669', boxShadow: '0 0 0 3px rgba(5,150,105,0.2)' }} />
                <Typography sx={{ fontSize: 13, fontWeight: 800, color: 'text.primary', fontFamily: '"Poppins",sans-serif' }}>
                  Glicose: 92 mg/dL <Box component="span" sx={{ color: '#047857', fontWeight: 700, fontSize: 12 }}>· Normal</Box>
                </Typography>
              </Box>

              {/* Badge flutuante 2 (base-direita) */}
              <Box
                sx={{
                  position: 'absolute', bottom: { xs: -14, md: 16 }, right: { xs: 6, md: -16 }, zIndex: 4,
                  bgcolor: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                  borderRadius: '16px', px: 1.75, py: 1,
                  boxShadow: '0 12px 32px rgba(32,178,170,0.18), 0 2px 8px rgba(0,0,0,0.06)',
                  border: '1px solid rgba(32,178,170,0.25)',
                  display: 'flex', alignItems: 'center', gap: 0.8,
                  animation: 'chipFloatB 6s ease-in-out infinite',
                }}
              >
                <AutoAwesomeIcon sx={{ fontSize: 17, color: TEAL_DARK }} />
                <Typography sx={{ fontSize: 13, fontWeight: 800, color: INK, fontFamily: '"Poppins",sans-serif' }}>
                  Laudo lido em ~28s
                </Typography>
              </Box>

              <Box className="hero-float" sx={{
                position: 'relative', width: '100%', maxWidth: 540,
                borderRadius: '24px', overflow: 'hidden', p: '6px',
                background: 'linear-gradient(135deg, rgba(32,178,170,.22), rgba(212,165,116,.16))',
                border: '1px solid rgba(32,178,170,.30)',
                boxShadow: '0 32px 72px rgba(32,178,170,.24), 0 12px 28px rgba(0,0,0,.08)',
              }}>
                <Box sx={{ position: 'relative', borderRadius: '18px', overflow: 'hidden', cursor: 'pointer' }} onClick={() => setTourOpen(true)}>
                  <Box component="img" src={`${import.meta.env.BASE_URL}capa-ia.webp`} alt="Dr. Exame — seus exames com IA" fetchPriority="high" decoding="async" sx={{ width: '100%', height: 'auto', display: 'block', borderRadius: '18px', transition: 'transform .35s ease', '&:hover': { transform: 'scale(1.02)' } }} />
                  <IconButton
                    onClick={(e) => { e.stopPropagation(); setTourOpen(true); }}
                    aria-label="Assistir tour do Dr. Exame"
                    sx={{
                      position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                      bgcolor: 'rgba(32,178,170,.92)', color: '#fff',
                      width: { xs: 64, md: 78 }, height: { xs: 64, md: 78 },
                      boxShadow: '0 12px 36px rgba(32,178,170,.55), 0 0 0 10px rgba(255,255,255,0.22)',
                      backdropFilter: 'blur(12px)',
                      transition: 'transform .2s ease, background-color .2s ease',
                      '&:hover': { bgcolor: 'primary.dark', transform: 'translate(-50%,-50%) scale(1.08)' },
                    }}
                  >
                    <PlayArrowIcon sx={{ fontSize: { xs: 38, md: 46 } }} />
                  </IconButton>
                </Box>
                {/* Régua assinatura — mecanismo do produto em 1 visual, sem peso de rede */}
                <Box sx={{ px: 2, pb: 1.5, pt: 1.75, bgcolor: 'rgba(255,255,255,.92)' }}>
                  <HeroRuler tone="light" compact goalLabel="meta do seu médico" />
                </Box>
              </Box>
            </Box>
            )}
          </Box>
        </Container>
      </Box>

      {/* MOMENTO MÁGICO — "Decifre seu exame" AGORA DE VERDADE (F1.2): o visitante cola o
          texto e recebe os valores organizados na hora (IA extrai, flags determinísticas,
          3/dia por IP, cache, nada salvo). O demo encenado vira "ver exemplo" pro curioso. */}
      <Box id="demo" sx={{ bgcolor: 'background.default', py: { xs: 6, md: 9 }, scrollMarginTop: 80 }}>
        <Container maxWidth="lg">
          <Box sx={{ textAlign: 'center', mb: { xs: 3.5, md: 5 } }}>
            <Typography sx={{ fontSize: 13, fontWeight: 800, color: INK, letterSpacing: '0.06em', textTransform: 'uppercase', mb: 1 }}>Experimente agora</Typography>
            <Typography variant="h2" sx={{ fontSize: { xs: '1.7rem', md: '2.3rem' }, fontWeight: 800, color: 'text.primary', mb: 1, letterSpacing: '-0.02em' }}>Cole seu exame. <Box component="span" sx={{ ...SERIF_I, color: TEAL_DARK }}>De graça, sem cadastro.</Box></Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: 17, maxWidth: 600, mx: 'auto' }}>A gente organiza cada valor na hora e mostra o que está dentro — e o que pede atenção. A interpretação completa com IA é o próximo passo, no app.</Typography>
          </Box>
          <DecifreReal />
          <Box sx={{ textAlign: 'center', mt: 2.5 }}>
            <Typography variant="caption" color="text.secondary">
              Sem exame na mão?{' '}
              <Box component="a" sx={{ color: TEAL_DARK, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setDemoOpen((v) => !v)}>
                {demoOpen ? 'esconder o exemplo animado' : 'ver um exemplo animado de como funciona no app'}
              </Box>
            </Typography>
          </Box>
          <Collapse in={demoOpen} sx={{ mt: 2.5 }}>
            <ExamDemo />
          </Collapse>
        </Container>
      </Box>

      {/* TRUST STRIP - Glassmorphism */}
      <Box sx={{ position: 'relative', zIndex: 10, mt: -2 }}>
        <Container maxWidth="lg">
          <Box sx={{
            bgcolor: 'rgba(255,255,255,.65)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
            borderRadius: '24px', border: '1px solid rgba(255,255,255,.8)',
            boxShadow: '0 4px 24px rgba(0,0,0,.04)', px: 3, py: 2.5
          }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 2, sm: 4 }} useFlexGap justifyContent="center" alignItems="center" sx={{ flexWrap: 'wrap' }}>
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
          </Box>
        </Container>
      </Box>

      {/* VARIANTE ?sports=1 — o conteúdo esportivo vem IMEDIATAMENTE após o hero:
          quem escaneou o QR do cartaz de academia não vai rolar atrás da própria oferta. */}
      {isSports && <SportsSection variant="full" onGoDemo={() => goTo('demo')} />}

      {/* PRODUCT PREVIEW (maior conversor — insight Kantesti/AI DiagMe: mostrar o
          produto por dentro logo no início, não só descrever). */}
      <ProductPreview />

      {/* MAPA DO CORPO INTERATIVO & CÁLCULOS CLÍNICOS POR ÓRGÃO (Inspirado no Kantesti Body Map) */}
      <LandingBodyMapSection />

      {/* PROBLEMA — na linguagem de quem sai do laboratório sem entender nada
          (framework PAS: público leigo, consciente da dor). 3 dores + ponte pra solução. */}
      <Box id="problema" sx={{ bgcolor: 'background.default', py: { xs: 5, md: 7 }, scrollMarginTop: 80 }}>
        <Container maxWidth="lg">
          <Box sx={{ textAlign: 'center', mb: { xs: 3.5, md: 5 } }}>
            <Typography variant="h2" sx={{ fontSize: { xs: '1.7rem', md: '2.3rem' }, fontWeight: 800, color: 'text.primary', mb: 1, letterSpacing: '-0.02em' }}>
              O laudo chegou. <Box component="span" sx={{ ...SERIF_I, color: TEAL_DARK }}>E agora?</Box>
            </Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: 17, maxWidth: 560, mx: 'auto' }}>
              Se você reconhece alguma destas cenas, o Dr. Exame foi feito pra você:
            </Typography>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2.5, maxWidth: 980, mx: 'auto' }}>
            {[
              { icon: <DescriptionIcon sx={{ fontSize: 22, color: TEAL_DARK }} />, t: 'Um monte de sigla — e zero resposta', d: 'O PDF chega cheio de termos que ninguém traduziu. "Alterado" escrito assim não explica nada.' },
              { icon: <ClockCounterClockwise size={22} color={TEAL_DARK} weight="duotone" />, t: 'A consulta demora; a dúvida, não', d: 'Enquanto você espera pela consulta, cada número fora da faixa vira busca ansiosa de madrugada.' },
              { icon: <StackIcon size={22} color={TEAL_DARK} weight="duotone" />, t: 'Seu histórico mora espalhado', d: 'Exame no e-mail, no papel, no ano passado… ninguém consegue ver a evolução de verdade.' },
            ].map((c) => (
              <Reveal key={c.t}>
                <Box sx={{ height: '100%', p: 3, borderRadius: '20px', border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                  <Box sx={{ width: 44, height: 44, borderRadius: '14px', display: 'grid', placeItems: 'center', background: 'rgba(32,178,170,.10)' }}>{c.icon}</Box>
                  <Typography sx={{ fontWeight: 800, fontSize: 16.5, color: 'text.primary', lineHeight: 1.3 }}>{c.t}</Typography>
                  <Typography sx={{ fontSize: 14.5, color: 'text.secondary', lineHeight: 1.6 }}>{c.d}</Typography>
                </Box>
              </Reveal>
            ))}
          </Box>
          <Typography sx={{ textAlign: 'center', color: 'text.secondary', mt: { xs: 3, md: 4 }, fontSize: { xs: 15.5, md: 16.5 } }}>
            O Dr. Exame traduz na hora — e entrega <b style={{ color: 'text.primary' }}>perguntas prontas</b> pra sua consulta. Em 3 passos:
          </Typography>
        </Container>
      </Box>

      {/* COMO FUNCIONA — ≤4 passos, cada um começa por verbo (framework de estrutura §5). */}
      <Box id="como-funciona" sx={{ bgcolor: 'background.paper', borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider', py: { xs: 5, md: 7 }, scrollMarginTop: 80 }}>
        <Container maxWidth="md">
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1.75, sm: 3 }} useFlexGap>
            {[
              ['Envie o exame', 'PDF ou foto, de qualquer laboratório. Leva menos de 1 minuto.'],
              ['Receba a explicação', 'A IA extrai cada valor direto do laudo — nunca inventa — e explica em português simples, com a faixa de referência.'],
              ['Leve perguntas ao médico', 'Leitura de risco, tendências e as perguntas certas pra consulta. Educativo: a decisão é sempre do seu médico.'],
            ].map(([t, d], i) => (
              <Stack key={t} direction="row" spacing={1.5} alignItems="flex-start" sx={{ flex: { sm: '1 1 0' } }}>
                <Box sx={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#20b2aa,#178f89)', color: '#fff', fontWeight: 800, fontSize: 14, mt: 0.1 }}>{i + 1}</Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 15, fontWeight: 800, color: 'text.primary' }}>{t}</Typography>
                  <Typography sx={{ fontSize: 13.5, color: 'text.secondary', mt: 0.25, lineHeight: 1.55 }}>{d}</Typography>
                </Box>
              </Stack>
            ))}
          </Stack>
        </Container>
      </Box>

      {/* FAIXA DE MÉTRICAS — contadores ANIMADOS ao entrar no viewport (wow imediato). */}
      <Box sx={{ bgcolor: 'background.default' }}>
        <Container maxWidth="lg" sx={{ py: { xs: 5, md: 7 } }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: { xs: 2.5, md: 4 }, textAlign: 'center' }}>
            {[
              { n: 30, pre: '~', suf: 's', l: 'pra ler seu exame com IA' },
              { n: 7, pre: '', suf: '', l: 'riscos monitorados: diabetes, anemia, colesterol, renal…' },
              { n: 3, pre: '', suf: '', l: 'índices que o laudo não dá: IMC, eGFR e HOMA-IR' },
              { n: 9, pre: '', suf: '', l: 'farmácias comparadas — menor preço do seu remédio' },
            ].map((m, idx) => (
              <ScrollReveal key={m.l} delay={idx * 0.08}>
                <Typography sx={{ fontSize: { xs: '1.8rem', md: '2.4rem' }, fontWeight: 800, color: TEAL_DARK, lineHeight: 1, mb: 0.75, fontFamily: '"Poppins","Inter",sans-serif', letterSpacing: '-0.02em' }}>
                  <AnimatedNumber value={m.n} prefix={m.pre} suffix={m.suf} duration={1 + idx * 0.2} />
                </Typography>
                <Typography sx={{ fontSize: 14, color: 'text.secondary', maxWidth: 230, mx: 'auto', lineHeight: 1.45 }}>{m.l}</Typography>
              </ScrollReveal>
            ))}
          </Box>
        </Container>
      </Box>


      {/* PROVA SOCIAL — rostos e palavras de quem usa (critique P2: a página tinha
          ZERO prova humana; nota 5,0 na Play escondida no pé). Depoimentos REAIS da
          loja — copy factual, nada inventado. */}
      <Box sx={{ bgcolor: 'background.paper', borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider', py: { xs: 5, md: 7 } }}>
        <Container maxWidth="md">
          <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="center" sx={{ mb: 3 }}>
            {[0, 1, 2, 3, 4].map((i) => <Box key={i} component="span" sx={{ color: '#f59e0b', fontSize: 18, lineHeight: 1 }}>★</Box>)}
            <Typography component="a" href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" sx={{ fontWeight: 800, fontSize: 15, ml: 1, color: 'text.primary', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>5,0 na Google Play · ver avaliações</Typography>
          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2.5 }}>
            {[
              { name: 'Maria A.', text: 'Finalmente entendi o que o meu exame significava. O plano de ação com as perguntas pro médico me salvou na consulta.' },
              { name: 'João P.', text: 'Guardei todos os exames da família num lugar só. E o alerta de preço do remédio já compensou a assinatura.' },
              { name: 'Rita de Cássia', text: 'Minha mãe é diabética e eu cuido dela. Ver a evolução dela no app me deixa tranquila entre as consultas.' },
            ].map((d, i) => (
              <ScrollReveal key={d.name} delay={i * 0.08}>
                <Box sx={{ height: '100%', p: 2.5, borderRadius: '16px', border: '1px solid', borderColor: 'divider', bgcolor: 'background.default', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Typography sx={{ fontSize: 15, color: 'text.primary', lineHeight: 1.6, flex: 1 }}>"{d.text}"</Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: 'rgba(32,178,170,.12)', color: TEAL_DARK, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13, fontFamily: '"Poppins",sans-serif' }}>{d.name.charAt(0)}</Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary' }}>{d.name}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>usuário do Dr. Exame</Typography>
                    </Box>
                  </Stack>
                </Box>
              </ScrollReveal>
            ))}
          </Box>
        </Container>
      </Box>

      {/* COMPARAÇÃO — Dr. Exame vs IA genérica: o visitante está decidindo entre
          você e o ChatGPT; coloque os dois na mesa (insight AI DiagMe). */}
      <ScrollReveal>
        <ComparisonTable onCta={() => navigate('/registrar')} />
      </ScrollReveal>

      {/* SEÇÃO — Descubra seu risco + plano de ação — momento premium esculpido (dark-teal card) */}
      <Box sx={{ py: { xs: 5, md: 8 }, bgcolor: 'background.default' }}>
        <Container maxWidth="lg">
          <Box sx={{
            position: 'relative', overflow: 'hidden',
            borderRadius: { xs: '24px', md: '32px' },
            py: { xs: 6, md: 8 }, px: { xs: 3, sm: 5, md: 7 },
            background: 'linear-gradient(135deg, #093330 0%, #0f5f5a 45%, #178f89 100%)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 24px 64px rgba(15,95,90,0.25)',
          }}>
            <Box sx={{ position: 'absolute', top: '-15%', right: '-5%', width: 460, height: 460, borderRadius: '50%', background: 'radial-gradient(circle,rgba(234,88,12,.22),transparent 65%)', pointerEvents: 'none', filter: 'blur(40px)' }} />
            <Box sx={{ position: 'absolute', bottom: '-20%', left: '-8%', width: 380, height: 380, borderRadius: '50%', background: 'radial-gradient(circle,rgba(32,178,170,.35),transparent 65%)', pointerEvents: 'none', filter: 'blur(40px)' }} />
            <Box sx={{ position: 'relative' }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: { xs: 5, md: 7 }, alignItems: 'center' }}>
                {/* mockup do RiskCard (esquerda) */}
                <Box sx={{ display: 'flex', justifyContent: 'center', order: { xs: 2, md: 1 } }}>
                  <Box sx={{
                    width: '100%', maxWidth: 390, borderRadius: '20px',
                    bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.3)',
                    boxShadow: '0 30px 60px rgba(0,0,0,.32), 0 10px 24px rgba(0,0,0,.20)',
                    p: 2.75,
                    background: (t) => t.palette.mode === 'dark' ? '#162423' : '#ffffff',
                    color: 'text.primary',
                  }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                      <HealthAndSafetyIcon sx={{ color: '#c2410c' }} />
                      <Typography sx={{ fontWeight: 800, flex: 1, color: 'text.primary' }}>Leitura de risco</Typography>
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
                          <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'text.primary' }}>{f.n}</Typography>
                        </Box>
                      ))}
                    </Stack>
                    <Box sx={{ borderRadius: '12px', bgcolor: 'action.hover', p: 1.25 }}>
                      <Typography sx={{ fontWeight: 800, fontSize: '0.85rem', mb: 0.25, display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.primary' }}>
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
            </Box>
          </Box>
        </Container>
      </Box>

      {/* ECOSSISTEMA & CUIDADO INTEGRAL — Bento Grid ultra premium unificado */}
      <ScrollReveal>
        <HealthEcosystemBento onRegister={() => navigate('/registrar')} />
      </ScrollReveal>

      {/* REMÉDIOS + MENOR PREÇO — economia como valor (mock do comparador real) */}
      <Box id="remedios" sx={{ bgcolor: 'background.default', py: { xs: 8, md: 11 }, scrollMarginTop: 80 }}>
        <Container maxWidth="lg">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: { xs: 5, md: 7 }, alignItems: 'center' }}>
            {/* COPY */}
            <Box>
              <Chip icon={<SavingsIcon sx={{ fontSize: 17 }} />} label="Economia de verdade" sx={{ bgcolor: 'rgba(212,165,116,.16)', color: '#b88a54', fontWeight: 700, mb: 2, fontSize: 13, pl: 1, '& .MuiChip-icon': { color: '#d4a574' } }} />
              <Typography variant="h2" sx={{ fontSize: { xs: '1.9rem', md: '2.5rem' }, fontWeight: 800, color: 'text.primary', mb: 1.5, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                O mesmo remédio pode custar <Box component="span" sx={{ ...SERIF_I, color: '#b88a54' }}>até 20× mais</Box> dependendo da farmácia.
              </Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: 17, lineHeight: 1.65, mb: 3.5 }}>
                O Procon-SP já encontrou variação de <b style={{ color: 'text.primary' }}>até 2.400%</b> no preço do mesmo medicamento. Você adiciona o remédio que toma — o Dr. Exame compara <b style={{ color: 'text.primary' }}>9 farmácias online</b> em segundos e mostra o menor preço, com foto do produto e o nome da farmácia.
              </Typography>
              <Stack spacing={2} sx={{ mb: 4 }}>
                {[
                  { Icon: MedicationIcon, t: '1. Adicione o remédio que você toma', d: 'Nome ou foto da receita — 1 toque. Uso contínuo fica salvo.' },
                  { Icon: StorefrontIcon, t: '2. Comparamos 9 farmácias online', d: 'Pague Menos, Pacheco, São Paulo, Drogasil e outras — preço, foto e link.' },
                  { Icon: NotificationsActiveIcon, t: '3. Menor preço na hora — e no bolso', d: 'A diferença entre a farmácia mais cara e a mais barata fica no seu bolso, todo mês.' },
                ].map((s) => (
                  <Stack key={s.t} direction="row" spacing={1.75} alignItems="flex-start">
                    <Box sx={{ width: 40, height: 40, borderRadius: '12px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,rgba(212,165,116,.18),rgba(212,165,116,.07))' }}>
                      <s.Icon sx={{ fontSize: 21, color: '#b88a54' }} />
                    </Box>
                    <Box>
                      <Typography sx={{ fontWeight: 800, fontSize: 15, color: 'text.primary' }}>{s.t}</Typography>
                      <Typography sx={{ fontSize: 14, color: 'text.secondary', lineHeight: 1.5 }}>{s.d}</Typography>
                    </Box>
                  </Stack>
                ))}
              </Stack>
              <Button
                href="#/registrar"
                endIcon={<ArrowForwardIcon />}
                sx={{ textTransform: 'none', fontWeight: 800, fontSize: 16, px: 4, py: 1.5, borderRadius: '999px', color: '#fff', background: 'linear-gradient(135deg,#d4a574,#b88a54)', boxShadow: '0 8px 24px rgba(212,165,116,.35)', '&:hover': { background: 'linear-gradient(135deg,#c89a66,#a67c48)', boxShadow: '0 10px 28px rgba(212,165,116,.45)' } }}
              >
                Adicionar meu primeiro remédio
              </Button>
              <Typography variant="caption" sx={{ display: 'block', mt: 2, color: 'text.disabled' }}>
                Fonte: Procon-SP — estudo de variação de preços de medicamentos. Preços dos produtos das farmácias parceiras, atualizados continuamente.
              </Typography>
            </Box>

            {/* MOCK do comparador — interface real do app */}
            <Reveal>
              <Box sx={{ position: 'relative', maxWidth: 420, mx: 'auto', width: '100%' }}>
                <Box sx={{ borderRadius: '16px', border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', p: 2.5, boxShadow: '0 2px 8px rgba(0,0,0,.04), 0 12px 32px rgba(0,0,0,.06)' }}>
                  <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
                    <Box sx={{ width: 54, height: 54, borderRadius: '12px', bgcolor: 'rgba(32,178,170,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <MedicationIcon sx={{ fontSize: 28, color: TEAL_DARK }} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 800, fontSize: 16, fontFamily: 'Poppins, sans-serif', color: 'text.primary', lineHeight: 1.2 }}>Levotiroxina 25mcg</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>uso contínuo · 30 un.</Typography>
                      <Stack direction="row" spacing={0.5} alignItems="baseline" sx={{ mt: 0.25 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>a partir de</Typography>
                        <Typography sx={{ fontWeight: 800, fontSize: 20, color: TEAL_DARK, lineHeight: 1, fontVariantNumeric: 'tabular-nums', fontFamily: 'Poppins, sans-serif' }}>R$ 7,65</Typography>
                      </Stack>
                    </Box>
                    <Chip label="🏆 11 ofertas" size="small" sx={{ bgcolor: 'primary.main', color: '#fff', fontWeight: 800, fontSize: 12, flexShrink: 0 }} />
                  </Stack>
                  {[
                    { sigla: 'CD', color: '#37474f', name: 'Coop Drogaria', product: 'Levotiroxina Sódica 25mcg 30cp', price: 'R$ 7,65', best: true },
                    { sigla: 'PM', color: '#d32f2f', name: 'Pague Menos', product: 'Levotiroxina 25mcg Genérico', price: 'R$ 9,49', best: false },
                    { sigla: 'DP', color: '#1565c0', name: 'Drogaria Pacheco', product: 'Levotiroxina 25mcg 30 Comprimidos', price: 'R$ 9,59', best: false },
                  ].map((o) => (
                    <Stack key={o.name} direction="row" spacing={1.25} alignItems="center" sx={{ py: 1.25, borderTop: '1px solid', borderColor: 'divider', bgcolor: o.best ? 'rgba(32,178,170,.05)' : 'transparent', borderRadius: o.best ? '10px' : 0, px: 0.5 }}>
                      {pharmLogos[o.name] ? (
                        <Box component="img" src={pharmLogos[o.name]!} alt={o.name} loading="lazy" sx={{ height: 22, maxWidth: 60, objectFit: 'contain', flexShrink: 0 }} />
                      ) : (
                        <Box sx={{ px: 0.75, py: 0.25, borderRadius: '8px', bgcolor: `${o.color}14`, color: o.color, fontWeight: 800, fontSize: 12, fontFamily: 'Poppins, sans-serif', flexShrink: 0 }}>{o.sigla}</Box>
                      )}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        {/* mobile: nome quebra (nada cortado); desktop: 1 linha (cabe inteira) */}
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary', lineHeight: 1.3, whiteSpace: { xs: 'normal', md: 'nowrap' }, overflow: { md: 'hidden' }, textOverflow: { md: 'ellipsis' } }}>{o.product}</Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{o.name}</Typography>
                      </Box>
                      {/* Preço + selo empilhados (mesmo padrão do app real — o selo não rouba largura da linha) */}
                      <Stack alignItems="flex-end" spacing={0.25} sx={{ flexShrink: 0 }}>
                        <Typography sx={{ fontWeight: 800, fontSize: 14, color: 'text.primary', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{o.price}</Typography>
                        {o.best && <Chip label="MELHOR PREÇO" size="small" sx={{ height: 18, fontSize: 12, fontWeight: 800, bgcolor: 'primary.main', color: '#fff', letterSpacing: '0.03em' }} />}
                      </Stack>
                    </Stack>
                  ))}
                  <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 1.5, color: 'text.disabled' }}>
                    +8 farmácias comparadas em segundos
                  </Typography>

                  {/* VITRINE REAL — dados vivos do comparador (não mock): o visitante vê
                      VÁRIOS remédios com preço real e nº de ofertas. Grade 2×3 no mobile. */}
                  {medDeals.length > 0 && (
                    <Box sx={{ mt: 2, pt: 2, borderTop: '1px dashed', borderColor: 'divider' }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 800, color: 'text.secondary', mb: 1.25, letterSpacing: '.02em', textTransform: 'uppercase' }}>
                        Comparando agora · preços de hoje
                      </Typography>
                      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr' }, gap: 1 }}>
                        {medDeals.map((d) => (
                          <Box key={`${d.name}-${d.doses?.[0] ?? ''}`} sx={{ p: 1.25, borderRadius: '12px', border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
                            <Typography sx={{ fontSize: 13, fontWeight: 800, color: 'text.primary', lineHeight: 1.25, minHeight: 32, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                              {d.name}{d.doses?.[0] ? ` ${d.doses[0].replace(' ', '')}` : ''}
                            </Typography>
                            <Stack direction="row" spacing={0.5} alignItems="baseline" sx={{ mt: 0.5 }}>
                              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 12 }}>a partir de</Typography>
                              <Typography sx={{ fontWeight: 800, fontSize: 15, color: TEAL_DARK, lineHeight: 1, fontVariantNumeric: 'tabular-nums', fontFamily: 'Poppins, sans-serif' }}>
                                {(d.priceCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </Typography>
                            </Stack>
                            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5, minHeight: 18 }}>
                              {pharmLogos[d.pharmacy] ? (
                                <Box component="img" src={pharmLogos[d.pharmacy]!} alt={d.pharmacy} loading="lazy" sx={{ height: 13, maxWidth: 44, objectFit: 'contain' }} />
                              ) : (
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 12 }}>{d.pharmacy}</Typography>
                              )}
                              {d.offersCount > 1 && <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: 12 }}>· {d.offersCount} ofertas</Typography>}
                            </Stack>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  )}
                </Box>
              </Box>
            </Reveal>
          </Box>
        </Container>
      </Box>

      {/* MÉDICO — strip compacta (o mega de 4 tabs virou isto: a jornada é do
          paciente; o portal médico existe e tem link, sem ocupar 170 linhas). */}
      <Box sx={{ bgcolor: 'background.default', borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider', py: { xs: 4, md: 5 } }}>
        <Container maxWidth="md" sx={{ textAlign: 'center' }}>
          <Typography sx={{ fontSize: { xs: 17, md: 19 }, fontWeight: 800, color: 'text.primary', fontFamily: '"Poppins",sans-serif' }}>
            É médico? Receba o <Box component="span" sx={{ ...SERIF_I, color: '#b88a54' }}>brief de pré-consulta</Box> de cada paciente.
          </Typography>
          <Typography sx={{ fontSize: 14, color: 'text.secondary', mt: 0.75, mb: 0.5, maxWidth: 520, mx: 'auto', lineHeight: 1.55 }}>
            Top 3 mudanças, risco com tendência, rascunho SOAP e as perguntas que o paciente fez no app — gerados por IA, revisados por você. Grátis pra começar.
          </Typography>
          <Typography sx={{ fontSize: 14, color: 'text.secondary', mb: 1.5, maxWidth: 520, mx: 'auto', lineHeight: 1.55 }}>
            E tem mais: <Box component="b" sx={{ color: '#b88a54' }}>pesquisas clínicas recrutando no Brasil</Box> direto no brief de cada paciente.
          </Typography>
          <Button variant="outlined" onClick={() => navigate('/doctor')} sx={{ borderRadius: '999px', px: 3, textTransform: 'none', fontWeight: 700, borderColor: 'rgba(212,165,116,.5)', color: '#b88a54', '&:hover': { borderColor: '#b88a54', bgcolor: 'rgba(212,165,116,.08)' } }}>
            Conhecer o Portal do Médico →
          </Button>
        </Container>
      </Box>

      {/* SEGURANÇA & LGPD — dado de saúde pede confiança ANTES do preço */}
      <ScrollReveal>
        <TrustSection />
      </ScrollReveal>

      {/* SHOWCASE CLÍNICO KANTESTI STYLE: PACOTE DE SAÚDE COM PLAYER DE ÁUDIO & CARD DE DECISÃO CLÍNICA */}
      <Box sx={{ bgcolor: 'background.default', py: { xs: 7, md: 10 }, borderTop: '1px solid', borderColor: 'divider' }}>
        <Container maxWidth="lg">
          <Box sx={{ textAlign: 'center', mb: { xs: 4, md: 6 } }}>
            <Chip
              label="Tecnologia & Confiança Médica"
              sx={{ bgcolor: 'rgba(32, 178, 170, 0.12)', color: TEAL_DARK, fontWeight: 800, mb: 1.5, fontSize: 12.5 }}
            />
            <Typography variant="h2" sx={{ fontSize: { xs: '1.9rem', md: '2.6rem' }, fontWeight: 800, color: 'text.primary', mb: 1.5, letterSpacing: '-0.02em' }}>
              Seus exames explicados com <Box component="span" sx={{ ...SERIF_I, color: TEAL_DARK }}>precisão e voz humanizada</Box>
            </Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: 17, maxWidth: 620, mx: 'auto' }}>
              Experimente a síntese clínica do Dr. Exame: ouça o laudo em 1 minuto, navegue pelos órgãos e entenda as prioridades para a sua próxima consulta.
            </Typography>
          </Box>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              gap: { xs: 3.5, md: 4.5 },
              alignItems: 'stretch',
              justifyContent: 'center',
            }}
          >
            <HealthPackageShowcaseCard onCtaClick={() => navigate('/registrar')} ctaText="Começar grátis agora" />
            <ClinicalDecisionCard />
          </Box>
        </Container>
      </Box>



      {/* NOVO 19/10 — TELEMEDICINA: vitrine premium com simulação viva da
          teleconsulta embutida (F2 LiveKit) antes de chegar nos planos. */}
      <ScrollReveal>
      <TeleconsultaShowcase onCta={() => goTo('planos')} />
      </ScrollReveal>

      {/* PLANOS — modelo explicado antes dos preços */}
      <ScrollReveal>
      <Box id="planos" sx={{ bgcolor: 'background.paper', borderTop: '1px solid', borderColor: 'divider', py: { xs: 8, md: 11 }, scrollMarginTop: 80 }}>
        <Container maxWidth="md">
          <Typography align="center" variant="h2" sx={{ fontSize: { xs: '1.9rem', md: '2.6rem' }, fontWeight: 800, color: 'text.primary', mb: 1.5, letterSpacing: '-0.02em' }}>Planos <Box component="span" sx={{ ...SERIF_I, color: TEAL_DARK }}>simples e justos</Box></Typography>
          <Typography align="center" sx={{ color: 'text.secondary', mb: 3, fontSize: 17 }}>Comece grátis. Assine quando precisar — ou pague só pelo que usar.</Typography>

          {/* COMO FUNCIONA (3 passos) — mobile: LISTA numerada (bolinha teal, sem caixa —
              caixas empilhadas no 375px pareciam textboxes de formulário, feedback do dono);
              desktop: os 3 blocos lado a lado. */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1.75, sm: 2.5 }} justifyContent="center" alignItems={{ xs: 'stretch', sm: 'stretch' }} sx={{ mb: 4, flexWrap: 'wrap' }}>
            {[
              ['Baixe e teste grátis', `${credits} créditos de presente no 1º exame — sem cartão`],
              ['A IA usa créditos', '1 resumo = 10 · 1 pergunta no chat = 2 · 1 envio = 1'],
              ['Acabou? Você escolhe', 'Assina o mensal (melhor custo + extras) ou compra pacotes'],
            ].map(([t, d], i) => (
              <Stack key={t} direction="row" spacing={1.5} alignItems="flex-start"
                sx={{
                  flex: { sm: '1 1 220px' }, maxWidth: { sm: 320 },
                  px: { sm: 2.2 }, py: { xs: 0.4, sm: 1.8 },
                  borderRadius: { sm: '12px' }, bgcolor: { sm: 'background.default' },
                  border: { sm: '1px solid' }, borderColor: { sm: 'divider' },
                }}>
                <Box sx={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#20b2aa,#178f89)', color: '#fff', fontWeight: 800, fontSize: 14, mt: 0.1 }}>{i + 1}</Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 800, color: 'text.primary' }}>{t}</Typography>
                  <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.25, lineHeight: 1.55 }}>{d}</Typography>
                </Box>
              </Stack>
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
                {p.highlight && <Chip label="RECOMENDADO" size="small" sx={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', bgcolor: TEAL, color: '#fff', fontWeight: 800, fontSize: 12 }} />}
                <Typography variant="h6" sx={{ fontWeight: 800, fontSize: 18, color: 'text.primary', mb: 1 }}>{p.name}</Typography>
                <Typography sx={{ fontWeight: 800, fontSize: 32, color: p.highlight ? TEAL : 'text.primary', mb: 0.5, lineHeight: 1.1 }}>{p.price}{p.period && <Typography component="span" sx={{ fontSize: 14, color: 'text.secondary', fontWeight: 600 }}>{` ${p.period}`}</Typography>}</Typography>
                <Box sx={{ my: 2, height: 1, bgcolor: 'divider' }} />
                {p.features.map((f: any) => (
                  <Stack key={f.text} direction="row" spacing={1} alignItems="center" sx={{ py: 0.5 }}>
                    <PlanFeatureIcon name={f.icon} highlight={p.highlight} />
                    <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>{f.text}</Typography>
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
          {/* QW CRO: anti-surpresa (padrão verificado dr.consulta) — promessa de cancelamento sem custo */}
          <Typography align="center" sx={{ color: 'text.secondary', mt: 1.5, fontSize: 14, fontWeight: 600 }}>
            Sem surpresa: nenhuma taxa escondida — cancele quando quiser.
          </Typography>

          {/* Multi-provider (03/10): linha discreta de confiança de pagamento — OpenPix PIX,
              Asaas PIX/cartão. Logo = prova social de gateway (MP = fallback, fora do selo). */}
          <Typography align="center" variant="caption" sx={{ display: 'block', mt: 4, color: 'text.secondary' }}>
            Pagamentos processados com segurança via:
          </Typography>
          <Box sx={{ mt: 1, mb: 1 }}>
            <PaymentLogos />
          </Box>
        </Container>
      </Box>
      </ScrollReveal>

      {/* FAQ esportivo — SÓ na variante ?sports=1: objeções reais de academia
          (hormônio? substitui médico? funciona sem academia?) antes do FAQ geral. */}
      {isSports && (
        <Suspense fallback={null}>
          <SportsFaq />
        </Suspense>
      )}

      {/* F4 — FAQ (mata objeções críticas de IA em saúde) */}
      <FaqSection />

      {/* FAQPage schema (JSON-LD) — rich result no Google. Fonte única: o mesmo
          array que renderiza o FAQ (nunca diverge). */}
      <script type="application/ld+json">
        {JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: FAQ_ITEMS.slice(0, 8).map((f) => ({
            '@type': 'Question',
            name: f.q,
            acceptedAnswer: { '@type': 'Answer', text: f.a },
          })),
        })}
      </script>

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
              <Typography variant="h2" sx={{ fontSize: { xs: '1.7rem', md: '2.3rem' }, fontWeight: 800, mb: 2, letterSpacing: '-0.02em' }}>
                {isSports
                  ? <>Seu próximo exame pode <Box component="span" sx={SERIF_I}>fazer mais sentido.</Box></>
                  : <>Pronto pra entender <Box component="span" sx={{ ...SERIF_I }}>sua saúde?</Box></>}
              </Typography>
              <Typography sx={{ color: 'rgba(255,255,255,.9)', mb: 4, fontSize: 17, maxWidth: 480, mx: 'auto' }}>
                {isSports
                  ? 'Ative o Modo Saúde Esportiva e leve perguntas prontas pra sua próxima consulta.'
                  : 'Crie sua conta grátis e envie seu primeiro exame em menos de 1 minuto.'}
              </Typography>
              {/* Message match: MESMO texto do CTA do hero (disciplina de conversão). */}
              <Button size="large" onClick={() => navigate('/registrar')} sx={{ bgcolor: '#fff', color: TEAL_DARK, fontWeight: 800, fontSize: 17, borderRadius: '999px', px: 5, py: 1.5, textTransform: 'none', '&:hover': { bgcolor: '#f0fafa', transform: 'translateY(-2px)' }, transition: 'all .2s' }}>Começar agora — é grátis</Button>
              <Typography sx={{ color: 'rgba(255,255,255,.75)', fontSize: 13, fontWeight: 600, mt: 1.5 }}>Primeiro exame com análise grátis · sem cartão · cancele quando quiser</Typography>
              {/* App na Play Store — QR OFICIAL + badge Google Play no ponto de maior intenção.
                  Substitui o QR genérico antigo: agora aponta pro app APROVADO na loja (confiança + conversão). */}
              <Stack component="a" href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer"
                direction={{ xs: 'column', sm: 'row' }} spacing={2} useFlexGap alignItems="center"
                sx={{ mt: 4, maxWidth: 430, mx: 'auto', textDecoration: 'none', bgcolor: '#fff',
                  borderRadius: '12px', p: 1.5, pr: { xs: 1.5, sm: 2.5 }, color: 'text.primary',
                  boxShadow: '0 10px 28px rgba(0,0,0,.18)',
                  transition: 'transform .18s ease, box-shadow .18s ease',
                  '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 16px 34px rgba(0,0,0,.24)' } }}>
                <Box component="img" src={`${import.meta.env.BASE_URL}playstore-qr.png`} alt="QR code para baixar o Dr. Exame na Play Store" loading="lazy" decoding="async"
                  sx={{ width: 116, height: 116, borderRadius: '12px', bgcolor: '#fff', display: 'block', flexShrink: 0 }} />
                <Box sx={{ textAlign: { xs: 'center', sm: 'left' } }}>
                  <Typography sx={{ fontWeight: 800, fontSize: 16, lineHeight: 1.15, color: 'text.primary' }}>Dr. Exame <Box component="span" sx={SERIF_I}>no seu celular</Box> 📱</Typography>
                  <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 0.75 }}>Aponte a câmera do celular ou toque pra baixar.</Typography>
                  {/* Prova social real: nota atual do app na Play (5,0) */}
                  <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 1 }}><Box component="span" sx={{ color: '#f5a623', letterSpacing: 1.5 }}>★★★★★</Box> <b style={{ color: 'text.primary' }}>5,0</b> no Google Play</Typography>
                  <Box component="img" src={`${import.meta.env.BASE_URL}playstore-badge.png`} alt="Disponível no Google Play" loading="lazy" decoding="async"
                    sx={{ height: 46, width: 'auto', display: 'block', mx: { xs: 'auto', sm: 0 } }} />
                </Box>
              </Stack>
            </Box>
          </Box>
        </Container>
      </Box>

      {/* RODAPÉ — Obsidian Glass Premium */}
      <Box sx={{
        background: 'linear-gradient(180deg, #091c1b 0%, #051211 100%)',
        color: '#9bc4c0', py: 6,
        borderTop: '1px solid rgba(32,178,170,0.2)'
      }}>
        <Container maxWidth="md" sx={{ textAlign: 'center' }}>
          <Stack direction="row" spacing={1.25} alignItems="center" justifyContent="center" sx={{ mb: 1.5 }}>
            <DrExame size={34} sx={{ borderRadius: '20%', border: '1px solid rgba(32,178,170,0.3)' }} />
            <Typography sx={{ fontWeight: 800, color: '#fff', fontSize: 19, fontFamily: 'Poppins, sans-serif' }}>Dr. Exame</Typography>
          </Stack>
          <Typography sx={{ fontSize: 14, mb: 1, color: '#a0c4c0' }}>© {new Date().getFullYear()} janocaminho.com.br • <Box component="a" href="mailto:contato@janocaminho.com.br" sx={{ color: '#a0c4c0', textDecoration: 'underline' }}>contato@janocaminho.com.br</Box></Typography>
          <Typography sx={{ fontSize: 12, opacity: .75, mb: 3, maxWidth: 540, mx: 'auto', lineHeight: 1.5 }}>Edmilson Fernandes • CNPJ: 44.771.427/0001-69 • Análise educativa, não substitui consulta médica.</Typography>

          {/* WHATSAPP — botão premium com logo oficial, gradient verde e pulse sutil
              (o canal de suporte que o 40+ BR já usa; alternativa ao e-mail). */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="center" justifyContent="center" sx={{ mb: 4 }}>
            <Box
              component="a"
              href={`https://wa.me/551239334979?text=${encodeURIComponent('Olá! Vim pelo site do Dr. Exame e quero saber mais.')}`}
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                display: 'inline-flex', alignItems: 'center', gap: 1.25,
                px: { xs: 3.5, sm: 4.5 }, py: 1.5,
                borderRadius: '999px',
                background: 'linear-gradient(135deg,#25d366 0%,#128c7e 100%)',
                color: '#fff', fontWeight: 800, fontSize: { xs: 15, sm: 16 },
                fontFamily: 'Poppins, sans-serif', textDecoration: 'none',
                border: '1px solid rgba(37,211,102,.45)',
                boxShadow: '0 8px 24px rgba(37,211,102,.28), inset 0 1px 0 rgba(255,255,255,.2)',
                transition: 'transform .18s cubic-bezier(.16,1,.3,1), box-shadow .18s',
                '&:hover': {
                  transform: 'translateY(-2px) scale(1.02)',
                  boxShadow: '0 12px 32px rgba(37,211,102,.38), inset 0 1px 0 rgba(255,255,255,.25)',
                },
                '&:active': { transform: 'scale(.98)' },
              }}
            >
              {/* Logo oficial do WhatsApp (SVG inline — sem CDN, sem copyright issue:
                  é o glyph padronizado que o próprio WhatsApp publica p/ parceiros). */}
              <Box
                component="svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                sx={{ width: 22, height: 22, flexShrink: 0 }}
                aria-hidden="true"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.1-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </Box>
              Fale com a gente no WhatsApp
            </Box>
            <Typography sx={{ fontSize: 13, color: '#7ea8a4', display: { xs: 'none', sm: 'block' } }}>
              (12) 3933-4979 · seg-sex 8h-18h
            </Typography>
          </Stack>

          {/* Links como <a> de verdade */}
          <Stack direction="row" spacing={3} justifyContent="center" useFlexGap sx={{ flexWrap: 'wrap', rowGap: 1.25 }}>
            {[{ l: 'Portal do Médico', h: '#/doctor' }, { l: 'Como validamos', h: '#/como-validamos' }, { l: 'API para devs', h: '#/api-docs' }, { l: 'Dúvidas frequentes', h: '#/faq' }, { l: 'Termos e LGPD', h: '#/termos' }, { l: 'Criar conta', h: '#/registrar' }, { l: 'Entrar', h: '#/entrar' }].map((x) => (
              <Box key={x.l} component="a" href={x.h} sx={{ color: '#5fc9c3', fontSize: 14, fontWeight: 700, textDecoration: 'none', transition: 'color .15s ease', '&:hover': { color: '#ffffff', textDecoration: 'underline' } }}>{x.l}</Box>
            ))}
          </Stack>
        </Container>
      </Box>

      {/* CTA FIXO MOBILE — só xs; desliza pra fora no reduced-motion-off e some na
          zona final (showMobileCta). Uma ação só, na cor da casa, sem competir com o
          conteúdo. visibility:hidden tira da árvore de acessibilidade quando oculta. */}
      <Box
        component="button"
        onClick={() => navigate('/registrar')}
        sx={{
          display: { xs: 'flex', sm: 'none' },
          position: 'fixed', left: 14, right: 14,
          bottom: 'calc(14px + env(safe-area-inset-bottom))',
          zIndex: 1100,
          alignItems: 'center', justifyContent: 'center',
          py: 1.5, borderRadius: '999px', border: 'none', cursor: 'pointer',
          background: 'linear-gradient(90deg,#178f89,#20b2aa)',
          color: '#fff', fontWeight: 800, fontSize: 16,
          fontFamily: '"Poppins","Inter",sans-serif', letterSpacing: '-0.01em',
          boxShadow: '0 10px 30px rgba(32,178,170,.45)',
          transform: showMobileCta ? 'none' : 'translateY(140%)',
          visibility: showMobileCta ? 'visible' : 'hidden',
          transition: 'transform .3s cubic-bezier(.16,1,.3,1), visibility .3s',
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          '&:active': { transform: 'scale(.98)' },
        }}
      >
        Começar agora — é grátis
      </Box>

      {/* POPUP de captura de e-mail — scroll 55%, 1×/sessão, cooldown 7d, LGPD (popup-cro). */}
      <LeadPopup />

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

      {/* BOTÃO FLUTUANTE DO WHATSAPP OFICIAL (Kantesti pattern: suporte direto com micro-animação) */}
      <FloatingWhatsAppButton />
    </Box>
  );
};

// Estilo do botão de nav (texto discreto)
const navBtn = (scrolled: boolean) => ({
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'text.primary', fontWeight: 600, fontSize: 14, textTransform: 'none' as const,
  '&:hover': { color: TEAL_DARK },
});
