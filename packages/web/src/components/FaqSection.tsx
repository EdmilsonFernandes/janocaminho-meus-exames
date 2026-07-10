import { Box, Container, Typography, Accordion, AccordionSummary, AccordionDetails, Stack } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { useNavigate } from 'react-router-dom';
import { Reveal } from './Reveal';

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
    a: 'Não. Os valores vêm direto do seu laudo (extração determinística, com a página de origem). A IA só interpreta o que já está escrito — ela não chuta nem cria números.',
  },
  {
    q: 'Funciona com o exame do meu laboratório?',
    a: 'Sim. Qualquer PDF ou foto de exame de sangue, imagem ou laudo. A IA extrai os valores do texto do documento, independente do laboratório.',
  },
  {
    q: 'Meus dados estão seguros?',
    a: 'Sim. Dados sensíveis (CPF/RG) são criptografados, os PDFs ficam fora do banco, e o compartilhamento com o médico é por link com PIN — que você revoga a qualquer momento. Você pode excluir tudo quando quiser. Conforme a LGPD.',
  },
  {
    q: 'Preciso pagar para testar?',
    a: 'Não. Você começa com 60 créditos grátis, sem cartão. Só assina (R$ 19,90/mês) ou compra créditos avulsos se precisar de mais análises.',
  },
  {
    q: 'Isso é um diagnóstico?',
    a: 'Nunca. O Dr. Exame mostra possíveis riscos e monta um plano de ação educativo. Sempre consulte um médico para qualquer decisão sobre sua saúde.',
  },
];

export const FaqSection = () => {
  const navigate = useNavigate();
  return (
    <Box sx={{ bgcolor: 'background.paper', borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider', py: { xs: 8, md: 11 } }}>
      <Container maxWidth="md">
        <Reveal>
          <Box sx={{ textAlign: 'center', mb: 5 }}>
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ mb: 1 }}>
              <HelpOutlineIcon sx={{ fontSize: 20, color: TEAL_DARK }} />
              <Typography sx={{ fontSize: 13, fontWeight: 800, color: TEAL_DARK, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Dúvidas frequentes</Typography>
            </Stack>
            <Typography variant="h2" sx={{ fontSize: { xs: '1.9rem', md: '2.6rem' }, fontWeight: 800, color: 'text.primary', mb: 1.5, letterSpacing: '-0.02em' }}>Tudo que você quer saber</Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: 17, maxWidth: 560, mx: 'auto' }}>Saúde e IA geram perguntas — e a gente responde na lata.</Typography>
          </Box>
        </Reveal>

        <Reveal delay={80}>
          <Box>
            {FAQ.map((item, i) => (
              <Accordion key={i} disableGutters elevation={0} sx={{
                mb: 1.5, borderRadius: '14px !important', overflow: 'hidden',
                border: '1px solid', borderColor: 'divider',
                '&:before': { display: 'none' },
                '&.Mui-expanded': { boxShadow: '0 10px 30px rgba(32,178,170,.10)', borderColor: TEAL },
              }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: TEAL_DARK }} />} sx={{ px: 2.5, py: 0.5, '& .MuiAccordionSummary-content': { my: 1 } }}>
                  <Typography sx={{ fontWeight: 700, fontSize: { xs: 15, md: 16 }, color: 'text.primary' }}>{item.q}</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 2.5, pb: 2.25, pt: 0 }}>
                  <Typography sx={{ fontSize: 14.5, color: 'text.secondary', lineHeight: 1.65 }}>{item.a}</Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        </Reveal>

        <Reveal delay={120}>
          <Box sx={{ textAlign: 'center', mt: 4 }}>
            <Typography sx={{ color: 'text.secondary', fontSize: 15, mb: 1.5 }}>Ainda com dúvidas? Teste sem compromisso.</Typography>
            <Box component="button" onClick={() => navigate('/registrar')} sx={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: TEAL_DARK, fontWeight: 800, fontSize: 16, textTransform: 'none',
              '&:hover': { textDecoration: 'underline' },
            }}>Criar conta grátis →</Box>
          </Box>
        </Reveal>
      </Container>
    </Box>
  );
};
