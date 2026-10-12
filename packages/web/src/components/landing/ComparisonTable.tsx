import { Box, Button, Container, Stack, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

/**
 * ComparisonTable — "Dr. Exame vs IA genérica" (insight AI DiagMe/Kantesti: o
 * visitante está decidindo entre VOCÊ e o ChatGPT — coloque os dois lado a lado).
 * Só afirmações REAIS do produto (régua, histórico, score, portal, fontes, LGPD,
 * app Android). Sem inventar deficiência do concorrente: descreve o genérico.
 */

const TEAL = '#20b2aa';
const TEAL_DARK = '#178f89';
const SERIF_I = { fontFamily: "'Instrument Serif', Georgia, serif", fontStyle: 'italic', fontWeight: 400 } as const;

const ROWS: [string, string][] = [
  ['Especializado em exames laboratoriais brasileiros', 'Resposta genérica, sem contexto'],
  ['Régua visual com a faixa de referência do SEU laboratório', 'Só texto, sem visual'],
  ['Histórico e tendências ao longo do tempo', 'Sem memória entre conversas'],
  ['Score de Saúde + Idade Biológica', 'Não calcula'],
  ['Portal para seu médico acompanhar', 'Não existe'],
  ['Diretrizes médicas citadas (SBEM, SBC, Endocrine Society)', 'Fontes incertas'],
  ['LGPD: dados cifrados, no Brasil, exclua quando quiser', 'Dados vão para servidor externo'],
  ['App Android + família + Health Connect', 'Só web'],
];

export const ComparisonTable = ({ onCta }: { onCta: () => void }) => (
  <Box sx={{ py: { xs: 6, md: 9 }, bgcolor: 'background.paper', borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider' }}>
    <Container maxWidth="md">
      <Box sx={{ textAlign: 'center', mb: { xs: 3, md: 4.5 } }}>
        <Typography variant="h2" sx={{ fontSize: { xs: '1.7rem', md: '2.3rem' }, fontWeight: 800, color: 'text.primary', mb: 1, letterSpacing: '-0.02em' }}>
          Por que não <Box component="span" sx={{ ...SERIF_I, color: TEAL_DARK }}>só usar um chatbot?</Box>
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: 17, maxWidth: 540, mx: 'auto' }}>
          IA geral responde qualquer coisa. O Dr. Exame é feito pra UMA coisa: o seu exame.
        </Typography>
      </Box>

      <Box sx={{ borderRadius: '20px', overflow: 'hidden', border: '1px solid', borderColor: 'divider', boxShadow: '0 12px 36px rgba(15,61,58,.08)' }}>
        {/* Header */}
        <Stack direction="row" sx={{ bgcolor: 'transparent' }}>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flex: 1, px: { xs: 1.25, sm: 2 }, py: 1.25, background: `linear-gradient(135deg,${TEAL},${TEAL_DARK})`, color: '#fff' }}>
            <Typography sx={{ fontSize: 14 }}>🩺</Typography>
            <Typography sx={{ fontWeight: 800, fontSize: { xs: 13, sm: 15 }, fontFamily: '"Poppins",sans-serif' }}>Dr. Exame</Typography>
          </Stack>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flex: 1, px: { xs: 1.25, sm: 2 }, py: 1.25, bgcolor: 'action.hover', color: 'text.secondary' }}>
            <Typography sx={{ fontWeight: 800, fontSize: { xs: 13, sm: 15 }, fontFamily: '"Poppins",sans-serif' }}>IA genérica (ChatGPT)</Typography>
          </Stack>
        </Stack>
        {/* Rows */}
        {ROWS.map(([ours, generic], idx) => (
          <Stack
            key={ours}
            direction="row"
            sx={{
              borderTop: '1px solid', borderColor: 'divider',
              bgcolor: idx % 2 === 0 ? 'background.paper' : 'action.hover',
              '&:last-of-type': { borderBottom: 'none' },
            }}
          >
            <Stack direction="row" spacing={0.75} alignItems="flex-start" sx={{ flex: 1, px: { xs: 1.25, sm: 2 }, py: { xs: 1.25, sm: 1.5 }, minWidth: 0, bgcolor: 'rgba(32,178,170,.05)' }}>
              <CheckCircleIcon sx={{ fontSize: 17, color: TEAL_DARK, mt: '2px', flexShrink: 0 }} />
              <Typography sx={{ fontSize: { xs: 12.5, sm: 14 }, fontWeight: 600, color: 'text.primary', lineHeight: 1.45 }}>{ours}</Typography>
            </Stack>
            <Stack direction="row" spacing={0.75} alignItems="flex-start" sx={{ flex: 1, px: { xs: 1.25, sm: 2 }, py: { xs: 1.25, sm: 1.5 }, minWidth: 0, borderLeft: '1px solid', borderColor: 'divider' }}>
              <CancelIcon sx={{ fontSize: 17, color: 'text.disabled', mt: '2px', flexShrink: 0 }} />
              <Typography sx={{ fontSize: { xs: 12.5, sm: 14 }, color: 'text.secondary', lineHeight: 1.45 }}>{generic}</Typography>
            </Stack>
          </Stack>
        ))}
      </Box>

      <Box sx={{ textAlign: 'center', mt: 3.5 }}>
        <Button
          onClick={onCta}
          endIcon={<ArrowForwardIcon />}
          sx={{
            borderRadius: '999px', px: 4, py: 1.4, textTransform: 'none', fontWeight: 800, fontSize: 16,
            color: '#fff', background: `linear-gradient(135deg,${TEAL},${TEAL_DARK})`,
            boxShadow: '0 8px 24px rgba(32,178,170,.35)',
            '&:hover': { boxShadow: '0 10px 28px rgba(32,178,170,.45)' },
          }}
        >
          Começar grátis
        </Button>
        <Typography sx={{ fontSize: 13, color: 'text.secondary', fontWeight: 600, mt: 1 }}>
          Primeiro exame com análise grátis · sem cartão · cancele quando quiser
        </Typography>
      </Box>
    </Container>
  </Box>
);
