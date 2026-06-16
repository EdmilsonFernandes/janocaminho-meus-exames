import { Box, Container, Typography, Button, Card, CardContent, Grid, Stack, Chip, Divider } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { DrExame } from '../components/DrExame';

const features = [
  { icon: '📸', title: 'Extração por Visão (IA)', desc: 'Envie o PDF do exame. A IA lê por visão e extrai TODOS os valores com a página de origem. Nada de digitar.' },
  { icon: '📊', title: 'Comparativo Anterior × Atual', desc: 'Veja o que mudou entre exames. "Hemoglobina: 13,8 → 15,4 (Melhorou)". Fácil de entender.' },
  { icon: '🤖', title: 'Dr. Exame — Análise + Voz', desc: 'Resumo em português claro + o Dr. Exame LÊ em voz alta. Comparativo, pontos de atenção e perguntas pro médico.' },
  { icon: '💡', title: 'Cada exame explicado', desc: 'Clique no ❓ e entenda o que é cada analito: "Hemoglobina é a tinta vermelha que leva oxigênio".' },
  { icon: '🎯', title: 'Score de Saúde (0-100)', desc: 'Um número que resume como estão seus exames. Verde, laranja ou vermelho. Acompanhe a evolução.' },
  { icon: '📈', title: 'Tendências + Previsão', desc: 'Gráfico de evolução com faixa de referência destacada. "Neste ritmo, sua glicose sai da faixa em ~4 meses".' },
  { icon: '💊', title: 'Interação Medicamento × Exame', desc: '"Sua hemoglobina subiu — pode ser a testosterona". A IA cruza suas medicações com os valores alterados.' },
  { icon: '📋', title: 'Preparo de Consulta', desc: '1 página pronta para o médico: valores alterados, perfil clínico, comparação. Ele escaneia em 30 segundos.' },
  { icon: '🥗', title: 'Sugestões de Nutrição', desc: '"LDL alto: reduza carnes vermelhas; aumente aveia". Sugestões práticas baseadas nos seus exames.' },
  { icon: '📅', title: 'Linha do Tempo da Saúde', desc: 'Trilha cronológica visual: "Jun/25: triglicérides caiu 40% 🎉" / "Mar/26: TSH subiu ⚠️".' },
  { icon: '👨‍👩‍👧', title: 'Multi-perfil (Dependentes)', desc: 'Gerencie exames de mãe, filho, cônjuge. Cada um com seus dados separados. Parentesco cadastrado.' },
  { icon: '🚨', title: 'Cartão de Emergência', desc: 'Carteirinha digital: tipo sanguíneo, alergias, medicações, contato. Imprima ou mostre no celular.' },
  { icon: '🔔', title: 'Lembretes + E-mail', desc: '"Refazer hemograma em 6 meses". Lembretes inteligentes chegam por e-mail automaticamente.' },
  { icon: '🩺', title: 'Chat com IA de Saúde', desc: 'Converse com a IA sobre seus exames. "Por que minha hemoglobina subiu?" Respostas em streaming.' },
  { icon: '📏', title: 'Medições Manuais', desc: 'Registre pressão, peso, glicose no dia a dia. Acompanhe sua evolução sem precisar de exame.' },
  { icon: '💉', title: 'Carteira de Vacinação', desc: 'Controle de vacinas + lembrete de próxima dose. Nunca mais esqueça um reforço.' },
  { icon: '💰', title: 'Despesas Médicas', desc: 'Controle quanto gasta em saúde. Relatório pronto para declaração de Imposto de Renda.' },
  { icon: '📤', title: 'Compartilhar com Médico', desc: 'Link temporário (expira em 3 dias) com seu resumo. O médico vê sem instalar nada.' },
];

const plans = [
  { name: 'Grátis', price: 'R$ 0', period: '', features: ['2 exames enviados', 'Ver valores + referência', 'Score de Saúde', '1 perfil'], highlight: false },
  { name: 'Premium', price: 'R$ 19,90', period: '/mês', features: ['Exames ilimitados', 'Comparativo + Dr. Exame', 'Chat com IA', 'Tendências + Previsão', 'Preparo de consulta', 'Interação medicação', 'Sugestões de nutrição', 'Metas de saúde'], highlight: true },
  { name: 'Familiar', price: 'R$ 29,90', period: '/mês', features: ['Tudo do Premium', 'Até 5 dependentes', 'Comparação familiar', 'Ranking familiar'], highlight: false },
];

export const LandingPage = () => {
  const navigate = useNavigate();
  return (
    <Box sx={{ background: '#f8fafc', minHeight: '100vh' }}>
      {/* HERO */}
      <Box sx={{ background: 'linear-gradient(135deg,#336886,#1565c0)', color: '#fff', py: 8, textAlign: 'center' }}>
        <Container maxWidth="md">
          <DrExame size={80} sx={{ mx: 'auto', mb: 2, borderRadius: '20%', border: '3px solid rgba(255,255,255,.3)' }} />
          <Typography variant="h3" sx={{ fontWeight: 900, mb: 1 }}>Meus Exames</Typography>
          <Typography variant="h6" sx={{ opacity: .9, mb: 3, fontWeight: 400 }}>
            Seu assistente de saúde com IA. Envie o exame, entenda tudo, acompanhe a evolução.
          </Typography>
          <Stack direction="row" spacing={2} justifyContent="center">
            <Button variant="contained" size="large" onClick={() => navigate('/registrar')}
              sx={{ bgcolor: '#fff', color: '#336886', fontWeight: 700, px: 4, '&:hover': { bgcolor: '#f0f0f0' } }}>
              Criar conta grátis
            </Button>
            <Button variant="outlined" size="large" onClick={() => navigate('/')}
              sx={{ borderColor: 'rgba(255,255,255,.5)', color: '#fff', px: 4 }}>
              Entrar
            </Button>
          </Stack>
          <Typography sx={{ mt: 2, opacity: .7, fontSize: 13 }}>Análise educativa — não substitui consulta médica.</Typography>
        </Container>
      </Box>

      {/* FEATURES */}
      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Typography variant="h4" align="center" sx={{ fontWeight: 800, mb: 1, color: '#0f172a' }}>Tudo que o app faz por você</Typography>
        <Typography align="center" color="text.secondary" sx={{ mb: 5 }}>18 funcionalidades pra você dominar sua saúde</Typography>
        <Grid container spacing={3}>
          {features.map((f, i) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={i}>
              <Card sx={{ height: '100%', borderRadius: 3, transition: 'transform .2s', '&:hover': { transform: 'translateY(-4px)' } }}>
                <CardContent>
                  <Typography sx={{ fontSize: 32, mb: 1 }}>{f.icon}</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5, color: '#0f172a' }}>{f.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{f.desc}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* DR EXAME SPOTLIGHT */}
      <Box sx={{ background: 'linear-gradient(135deg,#eef5ff,#e0f0ff)', py: 8 }}>
        <Container maxWidth="md">
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={4} alignItems="center">
            <DrExame size={120} sx={{ borderRadius: '24%', flexShrink: 0 }} />
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 800, color: '#336886', mb: 1 }}>Conheça o Dr. Exame 🤖</Typography>
              <Typography color="text.secondary" sx={{ mb: 2, lineHeight: 1.7 }}>
                Seu assistente pessoal de saúde. Ele lê seus exames por visão, explica cada valor em linguagem simples,
                compara com exames anteriores, cruza com suas medicações, sugere alimentação, define metas — e ainda
                <strong> lê o resumo em voz alta</strong> pra você.
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <Chip label="💬 Explica em português simples" sx={{ bgcolor: '#33688615', color: '#336886', fontWeight: 600 }} />
                <Chip label="🔊 Lê em voz alta" sx={{ bgcolor: '#33688615', color: '#336886', fontWeight: 600 }} />
                <Chip label="🎯 Define metas" sx={{ bgcolor: '#33688615', color: '#336886', fontWeight: 600 }} />
                <Chip label="🚫 Nunca diagnostica" sx={{ bgcolor: '#2e7d3215', color: '#2e7d32', fontWeight: 600 }} />
              </Stack>
            </Box>
          </Stack>
        </Container>
      </Box>

      {/* PLANOS */}
      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Typography variant="h4" align="center" sx={{ fontWeight: 800, mb: 5 }}>Planos</Typography>
        <Grid container spacing={3} justifyContent="center">
          {plans.map((p) => (
            <Grid size={{ xs: 12, sm: 4 }} key={p.name}>
              <Card sx={{ height: '100%', borderRadius: 4, border: p.highlight ? '2px solid #336886' : '1px solid #e2e8f0', position: 'relative' }}>
                {p.highlight && <Chip label="MAIS POPULAR" color="primary" size="small" sx={{ position: 'absolute', top: 16, right: 16 }} />}
                <CardContent sx={{ p: 3 }}>
                  <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>{p.name}</Typography>
                  <Typography variant="h3" sx={{ fontWeight: 900, color: '#336886' }}>
                    {p.price}<Typography component="span" variant="body2" color="text.secondary">{p.period}</Typography>
                  </Typography>
                  <Divider sx={{ my: 2 }} />
                  {p.features.map((f, i) => (
                    <Typography key={i} sx={{ py: 0.5, fontSize: '0.9rem' }}>✅ {f}</Typography>
                  ))}
                  <Button fullWidth variant={p.highlight ? 'contained' : 'outlined'} sx={{ mt: 2 }} onClick={() => navigate('/registrar')}>
                    {p.price === 'R$ 0' ? 'Começar grátis' : 'Assinar'}
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* CTA FINAL */}
      <Box sx={{ background: '#0f172a', color: '#fff', py: 6, textAlign: 'center' }}>
        <Container maxWidth="sm">
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>Pronto para entender sua saúde?</Typography>
          <Typography sx={{ opacity: .7, mb: 3 }}>Crie sua conta grátis e envie seu primeiro exame em menos de 1 minuto.</Typography>
          <Button variant="contained" size="large" onClick={() => navigate('/registrar')} sx={{ bgcolor: '#336886', px: 5, py: 1.5, fontSize: 16 }}>
            Começar agora →
          </Button>
          <Typography sx={{ mt: 3, opacity: .5, fontSize: 12 }}>
            🔒 Seus dados são criptografados. Análise educativa — não substitui consulta médica.
          </Typography>
        </Container>
      </Box>
    </Box>
  );
};
