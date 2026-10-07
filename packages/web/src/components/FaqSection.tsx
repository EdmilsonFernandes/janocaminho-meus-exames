import { useState, useEffect } from 'react';
import { Box, Container, Typography, Accordion, AccordionSummary, AccordionDetails, Stack, Button } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { useNavigate } from 'react-router-dom';
import { Reveal } from './Reveal';
import { fetchPublicConfig } from '../config';

const TEAL = '#20b2aa';
const TEAL_DARK = '#178f89';

// FAQ (F4) — mata as objeções críticas de um app de IA em saúde.
const FAQ = [
  {
    q: 'A IA do Dr. Exame substitui o médico?',
    a: 'Não. Ela é educativa: explica cada valor em português simples, compara com a faixa de referência e sugere perguntas para levar à consulta. A decisão e o diagnóstico são sempre do seu médico.',
  },
  {
    q: 'A IA inventa os valores do meu exame?',
    a: 'Não. Os valores vêm direto do seu laudo (extração determinística, com a página de origem). A IA só interpreta o que já está escrito: ela não chuta nem cria números.',
  },
  {
    q: 'Funciona com o exame do meu laboratório?',
    a: 'Sim. Qualquer PDF ou foto de exame de sangue, imagem ou laudo. A IA extrai os valores do texto do documento, independente do laboratório.',
  },
  {
    q: 'Meus dados estão seguros?',
    a: 'Sim. Dados sensíveis (CPF/RG) são criptografados, os PDFs ficam fora do banco, e o compartilhamento com o médico é por link com PIN (que você revoga a qualquer momento). Você pode excluir tudo quando quiser. Conforme a LGPD.',
  },
  {
    q: 'Preciso pagar para testar?',
    a: `Não. Envie seu primeiro exame (PDF ou foto) e ganhe créditos grátis, sem cartão. Use para conversar com a IA, gerar relatórios e perguntar ao médico. Só assina ou compra créditos avulsos se precisar de mais.`,
  },
  {
    q: 'Treino pesado ou tomo suplementos. O Dr. Exame entende meus exames esportivos?',
    a: 'Sim! Atletas de alta performance, corredores e praticantes de musculação frequentemente têm CK, TGO e creatinina elevadas sem que haja qualquer doença no fígado ou rins. O Dr. Exame conta com o Modo Saúde Esportiva: ele cruza os dados com o histórico de treinos e suplementação declarada (como creatina), desmistifica falsos positivos e avisa quando marcadores críticos (como hematócrito em reposição hormonal/TRT) pedem atenção clínica.',
  },
  // Leva 2 — saúde mental, fontes da IA, efeitos relatados, voz, pesquisa clínica
  {
    q: 'O questionário de saúde mental é diagnóstico?',
    a: 'Não. O PHQ-9 e o GAD-7 são rastreamentos validados, usados no mundo inteiro: eles medem como você andou se sentindo em 2 minutos. O resultado é educativo e vai junto pro seu médico. Se em algum momento você pensar em se machucar, procure ajuda na hora: CVV, ligação gratuita 188, 24 horas.',
  },
  {
    q: 'De onde vêm as fontes que a IA cita?',
    a: 'Das sociedades médicas de referência: SBC (cardiologia), SBD (diabetes) e ADA, entre outras. Cada resposta traz um rodapé "Fontes" com a diretriz usada — sempre à vista, pra você conferir de onde veio cada orientação.',
  },
  {
    q: 'O que são os "efeitos mais relatados" do meu remédio?',
    a: 'É um painel com os efeitos que mais aparecem nos relatos do mundo inteiro sobre aquele remédio — da base pública da FDA (agência americana), traduzido pra português. Importante: são relatos espontâneos, não uma previsão do que vai acontecer com você. Use pra informar a conversa com seu médico ou farmacêutico.',
  },
  {
    q: 'A voz funciona no meu celular?',
    a: 'No app Android e nos navegadores Chrome você pode ditar a pergunta no chat em vez de digitar — o app entende português. Ele mostra o texto na tela e só envia depois que você confirma, nada vai por acidente.',
  },
  {
    q: 'Tem pesquisa clínica pra minha condição?',
    a: 'Seu médico encontra no portal as pesquisas clínicas recrutando no Brasil relacionadas ao seu perfil — uma via a mais de acesso a tratamento de ponta, indicada por quem acompanha você de perto.',
  },
];

export const FaqSection = () => {
  const navigate = useNavigate();
  const [credits, setCredits] = useState(60);
  useEffect(() => { fetchPublicConfig().then((c) => setCredits(c.freeSignup)); }, []);
  return (
    <Box sx={{ bgcolor: 'background.paper', borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider', py: { xs: 8, md: 11 } }}>
      <Container maxWidth="md">
        <Reveal>
          <Box sx={{ textAlign: 'center', mb: 5 }}>
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ mb: 1 }}>
              <HelpOutlineIcon sx={{ fontSize: 20, color: TEAL_DARK }} />
              <Typography sx={{ fontSize: 13, fontWeight: 800, color: TEAL_DARK, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Dúvidas frequentes</Typography>
            </Stack>
            <Typography variant="h2" sx={{ fontSize: { xs: '1.9rem', md: '2.6rem' }, fontWeight: 800, color: 'text.primary', mb: 1.5, letterSpacing: '-0.02em', fontFamily: 'Poppins, sans-serif' }}>Tudo o que você precisa saber</Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: 17, maxWidth: 560, mx: 'auto' }}>Saúde e IA geram perguntas: a gente responde direto ao ponto.</Typography>
          </Box>
        </Reveal>

        <Reveal delay={80}>
          <Box>
            {FAQ.map((item, i) => (
              <Accordion key={i} disableGutters elevation={0} sx={{
                mb: 1.75, borderRadius: '18px !important', overflow: 'hidden',
                border: '1px solid', borderColor: 'divider',
                bgcolor: 'background.default',
                transition: 'all .2s ease',
                '&:before': { display: 'none' },
                '&:hover': { borderColor: 'rgba(32,178,170,0.3)', boxShadow: '0 4px 16px rgba(0,0,0,0.03)' },
                '&.Mui-expanded': { boxShadow: '0 10px 30px rgba(32,178,170,.12)', borderColor: TEAL, bgcolor: 'rgba(32,178,170,0.02)' },
              }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: TEAL_DARK }} />} sx={{ px: 2.5, py: 0.75, '& .MuiAccordionSummary-content': { my: 1 } }}>
                  <Typography sx={{ fontWeight: 700, fontSize: { xs: 16, md: 17 }, color: 'text.primary', fontFamily: 'Poppins, sans-serif' }}>{item.q}</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 2.5, pb: 2.5, pt: 0 }}>
                  <Typography sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.65 }}>{item.q === 'Preciso pagar para testar?' ? `Não. Envie seu primeiro exame e ganhe ${credits} créditos grátis, sem cartão. Use para conversar com a IA, gerar relatórios e perguntar ao médico.` : item.a}</Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        </Reveal>

        <Reveal delay={120}>
          <Box sx={{ textAlign: 'center', mt: 4 }}>
            <Typography sx={{ color: 'text.secondary', fontSize: 15, mb: 1.5 }}>Ainda com dúvidas? Teste sem compromisso.</Typography>
            <Button onClick={() => navigate('/registrar')} sx={{
              borderRadius: '999px', px: 3.5, py: 1,
              bgcolor: 'rgba(32,178,170,0.08)', color: TEAL_DARK, fontWeight: 800, fontSize: 15, textTransform: 'none',
              border: '1px solid rgba(32,178,170,0.25)',
              '&:hover': { bgcolor: 'rgba(32,178,170,0.16)', borderColor: TEAL_DARK }
            }}>Começar grátis →</Button>
          </Box>
        </Reveal>
      </Container>
    </Box>
  );
};
