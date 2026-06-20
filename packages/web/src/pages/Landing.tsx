import { Box, Container, Typography, Button, Stack, Chip, Divider, Fade } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';

const navigate = useNavigate;

const benefits = [
  { icon: '🤖', title: 'IA que lê seus exames', desc: 'Envie o PDF ou foto. O Dr. Exame extrai todos os valores e explica em português simples — sem jargão.' },
  { icon: '💬', title: 'Chat inteligente (economiza)', desc: 'Perguntas simples ("qual meu último TSH?") são respondidas na hora e de graça. Só as complexas vão pra IA.' },
  { icon: '📊', title: 'Comparativo visual', desc: 'Veja o que mudou entre exames. Hemoglobina subiu? Colesterol caiu? Gráficos claros com faixa de referência.' },
  { icon: '📈', title: 'Evolução + Previsão', desc: 'Acompanhe tendências e saiba quando um valor pode sair da faixa (previsão exclusiva do Premium).' },
  { icon: '🩺', title: 'Telemedicina pelo marcador', desc: 'Valor alterado? Um toque leva ao especialista certo no Doctoralia — endócrino, cardio, hemato e mais.' },
  { icon: '👨‍👩‍👧', title: 'Toda a família', desc: 'Gerencie exames de cada dependente. Score familiar + comparativo entre membros.' },
  { icon: '📋', title: 'Pronto para o médico', desc: 'Relatório de 1 página com valores alterados + perfil clínico. Compartilhe por link seguro com PIN.' },
  { icon: '🔒', title: 'Dados protegidos + Libras', desc: 'Criptografia, PIN de compartilhamento, exclusão a qualquer momento. LGPD completa e VLibras.' },
];

const steps = [
  { n: 1, title: 'Envie o exame', desc: 'PDF ou foto do exame de sangue, imagem ou laudo. A IA extrai todos os valores automaticamente.' },
  { n: 2, title: 'Entenda os resultados', desc: 'O Dr. Exame explica cada valor em linguagem simples, compara com exames anteriores e destaca o que precisa de atenção.' },
  { n: 3, title: 'Leve ao médico', desc: 'Gere um documento pronto ou compartilhe por link seguro. Perguntas prontas pra fazer na consulta.' },
];

const planData = [
  { name: 'Grátis', price: 'R$ 0', period: '', features: ['100 créditos pra testar', 'Envie exames (PDF/foto)', 'Valores + referência', 'Score de Saúde', 'Pergunte ao Dr. Exame'], highlight: false, cta: 'Começar grátis' },
  { name: 'Mensal', price: 'R$ 19,90', period: '/mês', features: ['1.500 créditos de IA/mês', 'Exames + dependentes', 'Comparativo + Tendências', 'Relatório completo + PDF', 'Chat com o Dr. Exame'], highlight: true, cta: 'Assinar mensal' },
  { name: 'Créditos', price: 'a partir de R$ 9,90', period: 'avulso', features: ['PIX, cartão ou débito', 'Pacotes flexíveis', 'Cada análise consome créditos', 'Sem mensalidade', 'Use quando precisar'], highlight: false, cta: 'Ver pacotes' },
];

export const LandingPage = () => {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const h = () => setScrolled(window.scrollY > 40); window.addEventListener('scroll', h, { passive: true }); return () => window.removeEventListener('scroll', h); }, []);

  return (
    <Box sx={{ bgcolor: '#fff', minHeight: '100vh' }}>
      {/* NAVBAR flutuante */}
      <Box sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000, transition: 'all .3s', bgcolor: scrolled ? 'rgba(15,23,42,.95)' : 'transparent', backdropFilter: scrolled ? 'blur(12px)' : 'none' }}>
        <Container maxWidth="lg" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Box component="img" src={`${import.meta.env.BASE_URL}brand.png`} alt="Dr. Exame" sx={{ width: 34, height: 'auto', borderRadius: '8px' }} />
            <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: 18, fontFamily: 'Poppins, sans-serif' }}>Meus Exames</Typography>
          </Stack>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Button onClick={() => navigate('/')} sx={{ color: scrolled ? '#fff' : '#fff', fontWeight: 600, textTransform: 'none', '&:hover': { bgcolor: 'rgba(255,255,255,.1)' } }}>Entrar</Button>
            <Button variant="contained" size="small" onClick={() => navigate('/registrar')} sx={{ bgcolor: '#20b2aa', color: '#fff', fontWeight: 700, textTransform: 'none', borderRadius: 99, px: 2.5, '&:hover': { bgcolor: '#178f89' } }}>Criar conta</Button>
          </Stack>
        </Container>
      </Box>

      {/* HERO — fundo escuro premium */}
      <Box sx={{ bgcolor: '#0f172a', color: '#fff', position: 'relative', overflow: 'hidden', pt: { xs: 10, md: 14 }, pb: { xs: 8, md: 12 } }}>
        <Box sx={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 70% 30%, rgba(32,178,170,.15), transparent 60%)' }} />
        <Container maxWidth="lg" sx={{ position: 'relative' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.1fr .9fr' }, gap: { xs: 4, md: 8 }, alignItems: 'center' }}>
            {/* Coluna texto */}
            <Box>
              <Chip label="🤖 IA de Saúde no seu bolso" sx={{ bgcolor: 'rgba(32,178,170,.15)', color: '#5fc9c3', fontWeight: 700, mb: 3, fontSize: 13 }} />
              <Typography variant="h1" sx={{ fontSize: { xs: '2.2rem', md: '3.5rem' }, fontWeight: 900, lineHeight: 1.1, mb: 3, fontFamily: 'Poppins, sans-serif', letterSpacing: '-0.03em' }}>
                Entenda seus<br />exames como<br /><Box component="span" sx={{ color: '#20b2aa' }}>nunca antes.</Box>
              </Typography>
              <Typography sx={{ fontSize: { xs: 17, md: 20 }, color: 'rgba(255,255,255,.7)', mb: 4, lineHeight: 1.6, maxWidth: 480 }}>
                Envie o exame de sangue, imagem ou laudo. O Dr. Exame lê tudo com IA, explica em português simples e acompanha sua evolução.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} useFlexGap>
                <Button size="large" onClick={() => navigate('/registrar')} sx={{ bgcolor: '#20b2aa', color: '#fff', fontWeight: 800, fontSize: 17, borderRadius: 99, px: 4, py: 1.5, textTransform: 'none', boxShadow: '0 8px 30px rgba(32,178,170,.4)', '&:hover': { bgcolor: '#178f89', transform: 'translateY(-2px)' }, transition: 'all .2s' }}>
                  Começar grátis →
                </Button>
                <Button size="large" onClick={() => navigate('/')} sx={{ color: '#fff', fontWeight: 700, fontSize: 17, borderRadius: 99, px: 4, py: 1.5, border: '1px solid rgba(255,255,255,.2)', textTransform: 'none', '&:hover': { bgcolor: 'rgba(255,255,255,.08)' } }}>
                  Já tenho conta
                </Button>
              </Stack>
              <Stack direction="row" spacing={3} sx={{ mt: 4 }}>
                {['Sem cartão', '100 créditos grátis', 'LGPD'].map((t) => (
                  <Typography key={t} sx={{ color: 'rgba(255,255,255,.5)', fontSize: 13 }}>✓ {t}</Typography>
                ))}
              </Stack>
            </Box>
            {/* Coluna visual — robô + "mockup" */}
            <Box sx={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
              <Box sx={{ position: 'relative' }}>
                <Box component="img" src={`${import.meta.env.BASE_URL}brand.png`} alt="Dr. Exame" sx={{ width: { xs: 200, md: 300 }, height: 'auto', filter: 'drop-shadow(0 20px 40px rgba(32,178,170,.3))' }} />
                {/* Cards flutuantes */}
                <Box sx={{ position: 'absolute', top: { xs: -10, md: -20 }, left: { xs: -30, md: -60 }, bgcolor: '#fff', borderRadius: 3, p: 1.5, boxShadow: '0 8px 30px rgba(0,0,0,.15)', maxWidth: 180 }}>
                  <Typography sx={{ fontSize: 11, color: '#64748b', mb: 0.5 }}>Hemoglobina</Typography>
                  <Typography sx={{ fontSize: 22, fontWeight: 800, color: '#10b981' }}>15,3 <Box component="span" sx={{ fontSize: 12, color: '#10b981' }}>✓ Normal</Box></Typography>
                </Box>
                <Box sx={{ position: 'absolute', bottom: { xs: -10, md: -20 }, right: { xs: -20, md: -50 }, bgcolor: '#fff', borderRadius: 3, p: 1.5, boxShadow: '0 8px 30px rgba(0,0,0,.15)', maxWidth: 180 }}>
                  <Typography sx={{ fontSize: 11, color: '#64748b', mb: 0.5 }}>Score de Saúde</Typography>
                  <Typography sx={{ fontSize: 22, fontWeight: 800, color: '#20b2aa' }}>87/100 🎯</Typography>
                </Box>
              </Box>
            </Box>
          </Box>
        </Container>
      </Box>

      {/* BENEFÍCIOS — fundo branco */}
      <Container maxWidth="lg" sx={{ py: { xs: 8, md: 12 } }}>
        <Typography align="center" sx={{ fontSize: { xs: '1.8rem', md: '2.5rem' }, fontWeight: 900, color: '#0f172a', mb: 1, fontFamily: 'Poppins, sans-serif', letterSpacing: '-0.02em' }}>
          Tudo que você precisa pra dominar sua saúde
        </Typography>
        <Typography align="center" sx={{ color: '#64748b', fontSize: 17, mb: 6, maxWidth: 600, mx: 'auto' }}>
          Não é só um leitor de PDF. É um assistente completo que entende, compara e prevê.
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr 1fr' }, gap: 3 }}>
          {benefits.map((b, i) => (
            <Fade key={i} in timeout={400 + i * 100}>
              <Box sx={{ p: 3, borderRadius: 3, bgcolor: '#fff', border: '1px solid #f1f5f9', transition: 'all .2s', '&:hover': { boxShadow: '0 8px 30px rgba(0,0,0,.06)', transform: 'translateY(-4px)', borderColor: '#20b2aa' } }}>
                <Typography sx={{ fontSize: 32, mb: 1.5 }}>{b.icon}</Typography>
                <Typography sx={{ fontWeight: 800, fontSize: 16, color: '#0f172a', mb: 1, fontFamily: 'Poppins, sans-serif' }}>{b.title}</Typography>
                <Typography sx={{ fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>{b.desc}</Typography>
              </Box>
            </Fade>
          ))}
        </Box>
      </Container>

      {/* COMO FUNCIONA — fundo escuro */}
      <Box sx={{ bgcolor: '#0f172a', color: '#fff', py: { xs: 8, md: 12 } }}>
        <Container maxWidth="lg">
          <Typography align="center" sx={{ fontSize: { xs: '1.8rem', md: '2.5rem' }, fontWeight: 900, mb: 1, fontFamily: 'Poppins, sans-serif' }}>
            Como funciona
          </Typography>
          <Typography align="center" sx={{ color: 'rgba(255,255,255,.6)', mb: 6, fontSize: 17 }}>3 passos. Menos de 1 minuto.</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 4 }}>
            {steps.map((s) => (
              <Box key={s.n} sx={{ textAlign: 'center' }}>
                <Box sx={{ width: 64, height: 64, borderRadius: '50%', bgcolor: '#20b2aa', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2, fontSize: 28, fontWeight: 900, fontFamily: 'Poppins, sans-serif' }}>{s.n}</Box>
                <Typography sx={{ fontWeight: 800, fontSize: 18, mb: 1, fontFamily: 'Poppins, sans-serif' }}>{s.title}</Typography>
                <Typography sx={{ color: 'rgba(255,255,255,.6)', fontSize: 15, lineHeight: 1.6, maxWidth: 280, mx: 'auto' }}>{s.desc}</Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* PLANOS — fundo claro */}
      <Box sx={{ bgcolor: '#f8fafc', py: { xs: 8, md: 12 } }}>
        <Container maxWidth="md">
          <Typography align="center" sx={{ fontSize: { xs: '1.8rem', md: '2.5rem' }, fontWeight: 900, color: '#0f172a', mb: 1, fontFamily: 'Poppins, sans-serif' }}>Planos simples e justos</Typography>
          <Typography align="center" sx={{ color: '#64748b', mb: 6, fontSize: 17 }}>Comece grátis. Assine quando precisar — ou pague só pelo que usar.</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 3, alignItems: 'center' }}>
            {planData.map((p) => (
              <Box key={p.name} sx={{
                p: 3, borderRadius: 4, bgcolor: '#fff',
                border: p.highlight ? '2px solid #20b2aa' : '1px solid #e2e8f0',
                boxShadow: p.highlight ? '0 12px 40px rgba(32,178,170,.12)' : '0 2px 8px rgba(0,0,0,.04)',
                position: 'relative', transform: p.highlight ? 'scale(1.03)' : 'none',
              }}>
                {p.highlight && <Chip label="RECOMENDADO" size="small" sx={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', bgcolor: '#20b2aa', color: '#fff', fontWeight: 800, fontSize: 11 }} />}
                <Typography sx={{ fontWeight: 800, fontSize: 18, color: '#0f172a', mb: 1, fontFamily: 'Poppins, sans-serif' }}>{p.name}</Typography>
                <Typography sx={{ fontWeight: 900, fontSize: 32, color: p.highlight ? '#20b2aa' : '#0f172a', mb: 0.5 }}>{p.price}<Typography component="span" sx={{ fontSize: 14, color: '#64748b' }}>{p.period}</Typography></Typography>
                <Divider sx={{ my: 2 }} />
                {p.features.map((f) => <Typography key={f} sx={{ py: 0.5, fontSize: 14, color: '#334155' }}>✓ {f}</Typography>)}
                <Button fullWidth variant={p.highlight ? 'contained' : 'outlined'} onClick={() => navigate('/registrar')} sx={{ mt: 2.5, textTransform: 'none', fontWeight: 700, borderRadius: 99, ...(p.highlight ? { bgcolor: '#20b2aa', '&:hover': { bgcolor: '#178f89' } } : { borderColor: '#cbd5e1', color: '#334155' }) }}>{p.cta}</Button>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* CTA FINAL — escuro */}
      <Box sx={{ bgcolor: '#0f172a', color: '#fff', textAlign: 'center', py: { xs: 8, md: 12 } }}>
        <Container maxWidth="sm">
          <Typography sx={{ fontSize: { xs: '1.6rem', md: '2.2rem' }, fontWeight: 900, mb: 2, fontFamily: 'Poppins, sans-serif' }}>Pronto pra entender sua saúde?</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,.6)', mb: 4, fontSize: 17 }}>Crie sua conta grátis e envie seu primeiro exame em menos de 1 minuto.</Typography>
          <Button size="large" onClick={() => navigate('/registrar')} sx={{ bgcolor: '#20b2aa', color: '#fff', fontWeight: 800, fontSize: 18, borderRadius: 99, px: 5, py: 1.5, textTransform: 'none', boxShadow: '0 8px 30px rgba(32,178,170,.4)', '&:hover': { bgcolor: '#178f89' } }}>Começar agora →</Button>
          {/* QR Code — escaneie pra acessar */}
          <Box sx={{ mt: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <Box component="img" src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://janocaminho.com.br/minhasaude/&color=20b2aa&bgcolor=ffffff&margin=0" alt="QR Code - Meus Exames" sx={{ borderRadius: 3, p: 1.5, bgcolor: '#fff', width: 160, height: 160 }} />
            <Typography sx={{ color: 'rgba(255,255,255,.5)', fontSize: 13 }}>📱 Escaneie com a camera do celular</Typography>
          </Box>
        </Container>
      </Box>

      {/* RODAPÉ */}
      <Box sx={{ bgcolor: '#020617', color: '#475569', py: 5, textAlign: 'center' }}>
        <Container maxWidth="md">
          <Typography sx={{ fontWeight: 800, color: '#fff', mb: 0.5, fontFamily: 'Poppins, sans-serif' }}>Meus Exames</Typography>
          <Typography sx={{ fontSize: 13, mb: 1 }}>© {new Date().getFullYear()} janocaminho.com.br • contato@janocaminho.com.br</Typography>
          <Typography sx={{ fontSize: 12, opacity: .7 }}>Edmilson Fernandes • CNPJ: 44.771.427/0001-69 • Análise educativa, não substitui consulta médica.</Typography>
          <Stack direction="row" spacing={3} justifyContent="center" sx={{ mt: 2 }}>
            <Box component="span" sx={{ color: '#20b2aa', cursor: 'pointer', fontSize: 13, fontWeight: 700, '&:hover': { textDecoration: 'underline' } }} onClick={() => navigate('/termos')}>Termos e LGPD</Box>
            <Box component="span" sx={{ color: '#20b2aa', cursor: 'pointer', fontSize: 13, fontWeight: 700, '&:hover': { textDecoration: 'underline' } }} onClick={() => navigate('/registrar')}>Criar conta</Box>
            <Box component="span" sx={{ color: '#20b2aa', cursor: 'pointer', fontSize: 13, fontWeight: 700, '&:hover': { textDecoration: 'underline' } }} onClick={() => navigate('/')}>Entrar</Box>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
};
