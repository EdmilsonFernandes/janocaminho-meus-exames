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
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import AccessibilityNewIcon from '@mui/icons-material/AccessibilityNew';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DonutLargeIcon from '@mui/icons-material/DonutLarge';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';

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
  { Icon: MedicalServicesIcon, title: 'Portal do seu médico', desc: 'Indique pelo CRM e seu médico ganha um portal próprio — vê apenas o que você autorizar: exames, alertas e evolução.' },
  { Icon: Diversity3Icon, title: 'Toda a família', desc: 'Gerencie exames de cada dependente. Score familiar + comparativo entre membros.' },
  { Icon: DescriptionIcon, title: 'Pronto para o médico', desc: 'Relatório de 1 página com valores alterados + perfil clínico. Compartilhe por link seguro com PIN.' },
  { Icon: LockIcon, title: 'Dados protegidos + Libras', desc: 'Criptografia, PIN de compartilhamento, exclusão a qualquer momento. LGPD completa e VLibras.' },
];

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

// Moldura de celular premium (bezel escuro + cantos arredondados + sombra teal).
// Usa as screenshots REAIS do app — autêntico vende mais que mockup recriado.
const PhoneFrame = ({ src, alt, label, Icon, caption }: {
  src: string; alt: string; label: string; Icon: any; caption: string;
}) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
    <Box sx={{
      width: '100%', maxWidth: 288, mx: 'auto',
      borderRadius: '38px', p: '8px',
      background: 'linear-gradient(160deg,#16302e,#0c2422)',
      boxShadow: '0 30px 60px rgba(32,178,170,.22), 0 12px 26px rgba(0,0,0,.12)',
      border: '1px solid rgba(255,255,255,.05)',
      transition: 'transform .3s ease, box-shadow .3s ease',
      '&:hover': { transform: 'translateY(-6px)', boxShadow: '0 38px 70px rgba(32,178,170,.28), 0 14px 30px rgba(0,0,0,.14)' },
    }}>
      <Box sx={{ borderRadius: '30px', overflow: 'hidden', bgcolor: 'background.paper' }}>
        <Box component="img" src={`${import.meta.env.BASE_URL}${src}`} alt={alt} sx={{ width: '100%', height: 'auto', display: 'block' }} />
      </Box>
    </Box>
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2.5, mb: 0.5 }}>
      <Icon sx={{ fontSize: 19, color: TEAL }} />
      <Typography variant="h6" sx={{ fontWeight: 800, fontSize: 16.5, color: 'text.primary' }}>{label}</Typography>
    </Stack>
    <Typography sx={{ fontSize: 13.5, color: 'text.secondary', lineHeight: 1.55, maxWidth: 272 }}>{caption}</Typography>
  </Box>
);

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
              <Typography sx={{ fontSize: { xs: 16.5, md: 19 }, color: 'text.secondary', mb: 4, lineHeight: 1.6, maxWidth: 480 }}>
                Envie o exame de sangue, imagem ou laudo. O <b style={{ color: 'text.primary' }}>Dr. Exame</b> lê tudo com IA, explica em português simples e acompanha sua evolução.
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
                {['Sem cartão', '60 créditos grátis', 'LGPD'].map((t) => (
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

      {/* BENEFÍCIOS */}
      <Container maxWidth="lg" id="beneficios" sx={{ py: { xs: 8, md: 11 }, scrollMarginTop: 80 }}>
        <Typography align="center" variant="h2" sx={{ fontSize: { xs: '1.9rem', md: '2.6rem' }, fontWeight: 800, color: 'text.primary', mb: 1.5, letterSpacing: '-0.02em' }}>
          Tudo que você precisa pra dominar sua saúde
        </Typography>
        <Typography align="center" sx={{ color: 'text.secondary', fontSize: 17, mb: 6, maxWidth: 620, mx: 'auto' }}>
          Não é só um leitor de PDF. É um assistente completo que entende, compara e prevê.
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr 1fr' }, gap: 2.5 }}>
          {benefits.map((b, i) => (
            <Fade key={i} in timeout={300 + i * 80}>
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
            Telas reais do app — do painel ao detalhe, tudo pensado pra você entender sua saúde de verdade.
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: { xs: 5, md: 4 }, alignItems: 'start', justifyContent: 'center' }}>
            <PhoneFrame
              Icon={DonutLargeIcon}
              label="Seu painel"
              caption="Score de Saúde, dica do Dr. Exame e relatório num só lugar."
              src="app-dashboard.jpg"
              alt="Painel com score de saúde e dica do Dr. Exame"
            />
            <PhoneFrame
              Icon={TrendingDownIcon}
              label="Evolução das taxas"
              caption="Veja cada valor evoluir — colesterol caindo mês a mês, com tendência."
              src="app-evolucao.jpg"
              alt="Evolução do colesterol ao longo do tempo"
            />
            <PhoneFrame
              Icon={EventAvailableIcon}
              label="Detalhe + Médico"
              caption="Valores com badge verde/vermelho e agende direto com o especialista."
              src="app-detalhe.jpg"
              alt="Detalhe do exame com agendamento médico"
            />
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
