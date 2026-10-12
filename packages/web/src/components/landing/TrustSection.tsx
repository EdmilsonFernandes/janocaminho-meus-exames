import { Box, Container, Stack, Typography } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import FolderOffIcon from '@mui/icons-material/FolderOff';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';

/**
 * TrustSection — Segurança & LGPD (insight concorrentes: quem trata dado de
 * SAÚDE precisa responder "onde ficam meus dados?" ANTES do preço). 4 blocos,
 * só o que o produto realmente faz: pgcrypto no PII, servidores no Brasil,
 * exclusão/exportação pelo próprio app e PDFs fora do banco.
 */

const TEAL_DARK = '#178f89';
const SERIF_I = { fontFamily: "'Instrument Serif', Georgia, serif", fontStyle: 'italic', fontWeight: 400 } as const;

const BLOCKS = [
  {
    icon: <LockIcon sx={{ fontSize: 24, color: TEAL_DARK }} />,
    t: 'Criptografia onde importa',
    d: 'CPF e dados sensíveis são cifrados no banco (pgcrypto) — nem um vazamento de base expõe sua identidade.',
  },
  {
    icon: <ShieldOutlinedIcon sx={{ fontSize: 24, color: TEAL_DARK }} />,
    t: 'Dados no Brasil 🇧🇷',
    d: 'Servidores em território nacional, sob a LGPD. Seu exame não cruza a fronteira pra ser processado.',
  },
  {
    icon: <DeleteForeverIcon sx={{ fontSize: 24, color: TEAL_DARK }} />,
    t: 'Exclua quando quiser',
    d: 'Seus dados são seus: exporte tudo ou apague a conta pelo próprio app — sem e-mail, sem telefonema.',
  },
  {
    icon: <FolderOffIcon sx={{ fontSize: 24, color: TEAL_DARK }} />,
    t: 'PDFs fora do banco',
    d: 'Os arquivos dos exames ficam em armazenamento separado e seguro — longe da base de dados.',
  },
];

export const TrustSection = () => (
  <Box sx={{ py: { xs: 6, md: 9 }, bgcolor: 'background.default' }}>
    <Container maxWidth="lg">
      <Box sx={{ textAlign: 'center', mb: { xs: 3, md: 4.5 } }}>
        <Typography variant="h2" sx={{ fontSize: { xs: '1.7rem', md: '2.3rem' }, fontWeight: 800, color: 'text.primary', mb: 1, letterSpacing: '-0.02em' }}>
          Seu exame é <Box component="span" sx={{ ...SERIF_I, color: TEAL_DARK }}>dado sensível.</Box> Tratamos como tal.
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: 17, maxWidth: 560, mx: 'auto' }}>
          Saúde merece mais cuidado que um post de rede social. É isso que fazemos por padrão:
        </Typography>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2.5 }}>
        {BLOCKS.map((b) => (
          <Stack key={b.t} spacing={1.25} sx={{
            p: 3, borderRadius: '20px', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
            display: 'flex', flexDirection: 'column',
            transition: 'transform .2s ease, box-shadow .2s ease',
            '&:hover': { transform: 'translateY(-3px)', boxShadow: '0 14px 34px rgba(32,178,170,.12)' },
          }}>
            <Box sx={{ width: 46, height: 46, borderRadius: '14px', display: 'grid', placeItems: 'center', background: 'rgba(32,178,170,.10)' }}>
              {b.icon}
            </Box>
            <Typography sx={{ fontWeight: 800, fontSize: 16, color: 'text.primary' }}>{b.t}</Typography>
            <Typography sx={{ fontSize: 14, color: 'text.secondary', lineHeight: 1.6, flex: 1 }}>{b.d}</Typography>
          </Stack>
        ))}
      </Box>
      <Typography sx={{ textAlign: 'center', color: 'text.secondary', mt: 3.5, fontSize: 13, fontWeight: 600 }}>
        Conforme a Lei Geral de Proteção de Dados (LGPD nº 13.709/2018)
      </Typography>
    </Container>
  </Box>
);
