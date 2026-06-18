import { Box, Container, Typography, Button, Card, CardContent, Grid, Stack, Chip, Divider } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { DrExame } from '../components/DrExame';

const features = [
  { icon: '📸', title: 'Extração por Visão (IA)', desc: 'Envie o PDF ou a FOTO do exame. A IA lê por visão e extrai TODOS os valores com a página de origem. Nada de digitar.' },
  { icon: '📊', title: 'Comparativo Anterior × Atual', desc: 'Veja o que mudou entre exames. "Hemoglobina: 13,8 → 15,4 (Melhorou)". Fácil de entender.' },
  { icon: '🤖', title: 'Dr. Exame — Análise', desc: 'Resumo em português claro: comparativo, pontos de atenção e perguntas pra levar ao médico.' },
  { icon: '💡', title: 'Cada exame explicado', desc: 'Clique no ❓ e entenda o que é cada analito: "Hemoglobina é a tinta vermelha que leva oxigênio".' },
  { icon: '🎯', title: 'Score de Saúde (0-100)', desc: 'Um número que resume como estão seus exames + gráfico de distribuição (bons/alerta/alterados).' },
  { icon: '📈', title: 'Tendências + Previsão', desc: 'Gráfico de evolução com faixa de referência destacada. "Neste ritmo, sua glicose sai da faixa em ~4 meses".' },
  { icon: '💊', title: 'Interação Medicamento × Exame', desc: '"Sua hemoglobina subiu — pode ser a testosterona". A IA cruza suas medicações com os valores alterados.' },
  { icon: '📋', title: 'Preparo de Consulta', desc: '1 página pronta para o médico: valores alterados, perfil clínico, comparação. Ele escaneia em 30 segundos.' },
  { icon: '🥗', title: 'Sugestões de Nutrição', desc: '"LDL alto: reduza carnes vermelhas; aumente aveia". Sugestões práticas baseadas nos seus exames.' },
  { icon: '🛡️', title: 'Anti-fraude inteligente', desc: 'Confere se o nome no documento bate com o perfil e avisa se for de outra pessoa. Rejeita documento que não é exame.' },
  { icon: '🔁', title: 'Sem duplicidade', desc: 'Manda o mesmo exame 2x? O sistema reconhece pelo código do arquivo e avisa — você não desperdiça créditos.' },
  { icon: '📅', title: 'Linha do Tempo da Saúde', desc: 'Trilha cronológica visual: "Jun/25: triglicérides caiu 40% 🎉" / "Mar/26: TSH subiu ⚠️".' },
  { icon: '👨‍👩‍👧', title: 'Multi-perfil (Dependentes)', desc: 'Gerencie exames de mãe, filho, cônjuge. Cada um com seus dados separados + score familiar.' },
  { icon: '🚨', title: 'Cartão de Emergência', desc: 'Carteirinha digital: tipo sanguíneo, alergias, medicações, contato. Imprima ou mostre no celular.' },
  { icon: '🔔', title: 'Lembretes + E-mail', desc: '"Refazer hemograma em 6 meses". Lembretes inteligentes chegam por e-mail automaticamente.' },
  { icon: '🩺', title: 'Chat com IA de Saúde', desc: 'Converse com a IA sobre seus exames. "Por que minha hemoglobina subiu?" Respostas em streaming.' },
  { icon: '📏', title: 'Medições Manuais', desc: 'Registre pressão, peso, glicose no dia a dia. Acompanhe sua evolução sem precisar de exame.' },
  { icon: '💉', title: 'Carteira de Vacinação', desc: 'Controle de vacinas + lembrete de próxima dose. Nunca mais esqueça um reforço.' },
  { icon: '📤', title: 'Compartilhar com Médico', desc: 'Link temporário (expira) com seu resumo + senha. O médico vê sem instalar nada.' },
];

const plans = [
  { name: 'Grátis', price: 'R$ 0', period: '', badge: '', features: ['100 créditos pra testar', 'Envie exames (PDF/foto)', 'Valores + referência', 'Score de Saúde', 'Pergunte ao Dr. Exame'], highlight: false, cta: 'Começar grátis' },
  { name: 'Mensal', price: 'R$ 19,90', period: '/mês', badge: 'MAIS POPULAR', features: ['1.500 créditos de IA por mês', 'Exames + dependentes', 'Comparativo + Tendências', 'Relatório completo + impressão', 'Chat com o Dr. Exame'], highlight: true, cta: 'Assinar mensal' },
  { name: 'Créditos', price: 'a partir de R$ 9,90', period: 'avulso', badge: 'PAGUE SÓ O QUE USAR', features: ['PIX, cartão ou débito', 'PIX instantâneo (QR) ou checkout', 'Cada análise consome créditos', 'Sem mensalidade', 'Use quando precisar'], highlight: false, cta: 'Ver pacotes' },
];

export const LandingPage = () => {
  const navigate = useNavigate();
  return (
    <Box sx={{ background: '#eef7f6', minHeight: '100vh' }}>
      {/* HERO */}
      <Box sx={{ background: 'linear-gradient(135deg,#20b2aa,#178f89)', color: '#fff', py: { xs: 5, md: 8 }, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <Box sx={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 0%, rgba(255,255,255,.12), transparent 60%)' }} />
        <Container maxWidth="md" sx={{ position: 'relative' }}>
          {/* Robô INTEIRO (height auto, não força quadrado que cortava só a cabeça) */}
          <Box component="img" src={`${import.meta.env.BASE_URL}brand.png`} alt="Dr. Exame — seu assistente de saúde com IA"
            sx={{ width: { xs: 140, md: 180 }, height: 'auto', mx: 'auto', mb: 1, display: 'block', filter: 'drop-shadow(0 12px 26px rgba(0,0,0,.30))' }} />
          <Typography variant="h3" sx={{ fontWeight: 900, mb: 1, textShadow: '0 2px 12px rgba(0,0,0,.2)' }}>Meus Exames</Typography>
          <Typography variant="h6" sx={{ opacity: .95, mb: 3, fontWeight: 400, maxWidth: 540, mx: 'auto' }}>
            Seu assistente de saúde com IA. Envie o exame (PDF ou foto), entenda tudo e acompanhe a evolução.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="center" useFlexGap alignItems="center">
            <Button size="large" onClick={() => navigate('/registrar')}
              sx={{ bgcolor: '#d4a574', color: '#fff', fontWeight: 800, fontSize: 17, px: 5, py: 1.5, borderRadius: 99, boxShadow: '0 8px 24px rgba(212,165,116,.5)', '&:hover': { bgcolor: '#c89863', transform: 'translateY(-2px)', boxShadow: '0 10px 28px rgba(212,165,116,.6)' }, transition: 'all .15s' }}>
              Criar conta grátis →
            </Button>
            <Button size="large" onClick={() => navigate('/')}
              sx={{ color: '#fff', fontWeight: 700, px: 3, '&:hover': { bgcolor: 'rgba(255,255,255,.14)' } }}>
              Já tenho conta
            </Button>
          </Stack>
          <Typography sx={{ mt: 2.5, opacity: .8, fontSize: 13 }}>Análise educativa — não substitui consulta médica.</Typography>
        </Container>
      </Box>

      {/* FEATURES */}
      <Container maxWidth="lg" sx={{ py: { xs: 5, md: 8 } }}>
        <Typography variant="h4" align="center" sx={{ fontWeight: 800, mb: 1, color: '#2d3748' }}>Tudo que o app faz por você</Typography>
        <Typography align="center" color="text.secondary" sx={{ mb: 5 }}>19 funcionalidades pra você dominar sua saúde</Typography>
        <Grid container spacing={3}>
          {features.map((f, i) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={i}>
              <Card sx={{ height: '100%', borderRadius: 3, transition: 'transform .2s, box-shadow .2s', '&:hover': { transform: 'translateY(-4px)', boxShadow: 6 } }}>
                <CardContent>
                  <Typography sx={{ fontSize: 32, mb: 1 }}>{f.icon}</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5, color: '#2d3748' }}>{f.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{f.desc}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* DR EXAME SPOTLIGHT */}
      <Box sx={{ background: 'linear-gradient(135deg,#e6f7f6,#d4a57414)', py: { xs: 5, md: 8 } }}>
        <Container maxWidth="md">
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={4} alignItems="center">
            <Box component="img" src={`${import.meta.env.BASE_URL}brand.png`} alt="Dr. Exame"
              sx={{ width: { xs: 140, md: 180 }, height: 'auto', flexShrink: 0, filter: 'drop-shadow(0 10px 22px rgba(0,0,0,.22))' }} />
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 800, color: '#178f89', mb: 1 }}>Conheça o Dr. Exame 🤖</Typography>
              <Typography color="text.secondary" sx={{ mb: 2, lineHeight: 1.7 }}>
                Seu assistente pessoal de saúde. Ele lê seus exames por visão, explica cada valor em linguagem simples,
                compara com exames anteriores, cruza com suas medicações, sugere alimentação, define metas — e ainda
                <strong> guarda tudo na memória</strong> pra nunca perder o contexto.
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <Chip label="💬 Explica em português simples" sx={{ bgcolor: 'rgba(32,178,170,.12)', color: '#178f89', fontWeight: 600 }} />
                <Chip label="🧠 Memória de longo prazo" sx={{ bgcolor: 'rgba(32,178,170,.12)', color: '#178f89', fontWeight: 600 }} />
                <Chip label="🎯 Define metas" sx={{ bgcolor: 'rgba(32,178,170,.12)', color: '#178f89', fontWeight: 600 }} />
                <Chip label="🚫 Nunca diagnostica" sx={{ bgcolor: 'rgba(46,125,50,.12)', color: '#2e7d32', fontWeight: 600 }} />
              </Stack>
            </Box>
          </Stack>
        </Container>
      </Box>

      {/* PLANOS */}
      <Container maxWidth="lg" sx={{ py: { xs: 5, md: 8 } }}>
        <Typography variant="h4" align="center" sx={{ fontWeight: 800, mb: 1 }}>Planos simples e justos</Typography>
        <Typography align="center" color="text.secondary" sx={{ mb: 5 }}>Comece grátis. Assine o mensal ou pague só pelo que usar (créditos via PIX).</Typography>
        <Grid container spacing={3} justifyContent="center">
          {plans.map((p) => (
            <Grid size={{ xs: 12, sm: 4 }} key={p.name}>
              <Card sx={{ height: '100%', borderRadius: 4, border: p.highlight ? '2px solid #20b2aa' : '1px solid #e2e8f0', position: 'relative' }}>
                {p.badge && <Chip label={p.badge} color={p.highlight ? 'primary' : 'default'} size="small" sx={{ position: 'absolute', top: 16, right: 16, fontWeight: 700 }} />}
                <CardContent sx={{ p: 3 }}>
                  <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>{p.name}</Typography>
                  <Typography variant="h3" sx={{ fontWeight: 900, color: '#178f89' }}>
                    {p.price}<Typography component="span" variant="body2" color="text.secondary"> {p.period}</Typography>
                  </Typography>
                  <Divider sx={{ my: 2 }} />
                  {p.features.map((f, i) => (
                    <Typography key={i} sx={{ py: 0.5, fontSize: '0.9rem' }}>✅ {f}</Typography>
                  ))}
                  <Button fullWidth variant={p.highlight ? 'contained' : 'outlined'} sx={{ mt: 2 }} onClick={() => navigate('/registrar')}>
                    {p.cta}
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* CTA FINAL */}
      <Box sx={{ background: '#2d3748', color: '#fff', py: { xs: 5, md: 6 }, textAlign: 'center' }}>
        <Container maxWidth="sm">
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>Pronto para entender sua saúde?</Typography>
          <Typography sx={{ opacity: .7, mb: 3 }}>Crie sua conta grátis e envie seu primeiro exame em menos de 1 minuto.</Typography>
          <Button variant="contained" size="large" onClick={() => navigate('/registrar')} sx={{ bgcolor: '#20b2aa', px: 5, py: 1.5, fontSize: 16, '&:hover': { bgcolor: '#178f89' } }}>
            Começar agora →
          </Button>
          <Typography sx={{ mt: 3, opacity: .55, fontSize: 12 }}>
            🔒 Seus dados são criptografados. Análise educativa — não substitui consulta médica.
          </Typography>
          <Box component="span" sx={{ display: 'inline-block', mt: 1.5, color: '#20b2aa', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }} onClick={() => navigate('/termos')}>
            Termos de uso e LGPD
          </Box>
        </Container>
      </Box>

      {/* RODAPÉ */}
      <Box sx={{ background: '#1a202c', color: '#cbd5e0', py: 4, textAlign: 'center' }}>
        <Container maxWidth="md">
          <Typography sx={{ fontWeight: 800, color: '#fff', mb: 0.5, fontFamily: 'Poppins, sans-serif' }}>Meus Exames</Typography>
          <Typography variant="body2" sx={{ opacity: .8, mb: 1 }}>
            © {new Date().getFullYear()} janocaminho.com.br • contato@janocaminho.com.br
          </Typography>
          <Typography variant="caption" sx={{ opacity: .65, display: 'block' }}>
            Edmilson Fernandes • CNPJ: 44.771.427/0001-69 • Análise educativa, não substitui consulta médica.
          </Typography>
          <Box sx={{ mt: 1.5, display: 'flex', gap: 3, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Box component="span" sx={{ color: '#5fc9c3', fontWeight: 700, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }} onClick={() => navigate('/termos')}>Termos e LGPD</Box>
            <Box component="span" sx={{ color: '#5fc9c3', fontWeight: 700, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }} onClick={() => navigate('/registrar')}>Criar conta</Box>
            <Box component="span" sx={{ color: '#5fc9c3', fontWeight: 700, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }} onClick={() => navigate('/')}>Entrar</Box>
          </Box>
        </Container>
      </Box>
    </Box>
  );
};
