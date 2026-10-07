import { Box, Container, Typography, Stack, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

const TEAL_DARK = '#178f89';
const SERIF_I = { fontFamily: "'Instrument Serif', Georgia, serif", fontStyle: 'italic', fontWeight: 400 } as const;

/**
 * FAQ esportivo — objeções REAIS de quem treina (tráfego QR de academia).
 * Framing médico-educativo; a palavra "anabolizante" não aparece (política de
 * anúncio): falamos de reposição hormonal com acompanhamento médico.
 * Componente lazy: só entra no bundle quando ?sports=1 abre a variante.
 */
const SPORTS_FAQ = [
  {
    q: 'É pra quem usa hormônio?',
    a: 'É pra quem quer entender os exames com o próprio contexto. Você declara reposição hormonal prescrita, suplementos e pré-treino — registro confidencial e sem julgamento — e a IA passa a interpretar hormônios, hematócrito e enzimas com esse contexto. O app nunca recomenda dose, ciclo ou substância: educa e prepara as perguntas para o seu médico.',
  },
  {
    q: 'Substitui o médico do esporte?',
    a: 'Nunca. O Dr. Exame organiza, explica e contextualiza — diagnóstico e conduta são sempre médicos. Nos itens que pedem pressa (como hematócrito acima de 54% em reposição hormonal, segundo SBEM 2026 e Endocrine Society), o app aponta a conversa com quem prescreveu e prepara as perguntas certas.',
  },
  {
    q: 'Não treino competição (ou nem tenho academia). Serve pra mim?',
    a: 'Sim. O Modo Saúde Esportiva é uma camada opcional do Premium. Sem ativar nada, o app continua completo para qualquer pessoa: leitura de risco, tendências, família, remédios e comparador de preços.',
  },
  {
    q: 'Declarar o que uso é seguro?',
    a: 'Dados de saúde são dados sensíveis: criptografia, sigilo e direito de excluir tudo a qualquer momento, conforme a LGPD. A declaração serve apenas para contextualizar a interpretação — nunca vira julgamento nem recomendação.',
  },
];

export const SportsFaq = () => (
  <Box sx={{ bgcolor: 'background.paper', borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider', py: { xs: 6, md: 8 } }}>
    <Container maxWidth="md">
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ mb: 1 }}>
          <HelpOutlineIcon sx={{ fontSize: 20, color: TEAL_DARK }} />
          <Typography sx={{ fontSize: 13, fontWeight: 800, color: TEAL_DARK, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Dúvidas de quem treina</Typography>
        </Stack>
        <Typography variant="h2" sx={{ fontSize: { xs: '1.7rem', md: '2.2rem' }, fontWeight: 800, color: 'text.primary', mb: 1, letterSpacing: '-0.02em', fontFamily: 'Poppins, sans-serif' }}>
          Perguntas de academia, <Box component="span" sx={SERIF_I}>respondidas direto.</Box>
        </Typography>
      </Box>
      <Stack spacing={1.5}>
        {SPORTS_FAQ.map((f) => (
          <Accordion key={f.q} disableGutters sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '14px !important', boxShadow: 'none', '&:before': { display: 'none' }, bgcolor: 'background.default' }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: TEAL_DARK }} />} sx={{ px: 2.5, minHeight: 56 }}>
              <Typography sx={{ fontWeight: 800, fontSize: 15.5, color: 'text.primary' }}>{f.q}</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 2.5, pb: 2.5 }}>
              <Typography sx={{ fontSize: 14.5, color: 'text.secondary', lineHeight: 1.65 }}>{f.a}</Typography>
            </AccordionDetails>
          </Accordion>
        ))}
      </Stack>
    </Container>
  </Box>
);
