import { Box, Container, Typography, Stack, Chip, Button } from '@mui/material';
import FamilyRestroomIcon from '@mui/icons-material/FamilyRestroom';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import StorefrontIcon from '@mui/icons-material/Storefront';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ChildCareIcon from '@mui/icons-material/ChildCare';
import { Reveal } from '../Reveal';
import { ScrollReveal } from '../ScrollReveal';

const TEAL = '#20b2aa';
const TEAL_DARK = '#178f89';
const SERIF_I = { fontFamily: "'Instrument Serif', Georgia, serif", fontStyle: 'italic', fontWeight: 400 } as const;

interface HealthEcosystemBentoProps {
  onRegister: () => void;
}

export const HealthEcosystemBento = ({ onRegister }: HealthEcosystemBentoProps) => {
  return (
    <Box sx={{ py: { xs: 7, md: 10 }, bgcolor: 'background.paper', borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider' }}>
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: { xs: 4, md: 6 } }}>
          <Chip
            label="Mais que um leitor de PDF"
            size="small"
            sx={{
              bgcolor: 'rgba(32,178,170,.12)',
              color: TEAL_DARK,
              fontWeight: 800,
              fontSize: 12,
              mb: 1.5,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          />
          <Typography
            variant="h2"
            sx={{
              fontSize: { xs: '1.9rem', md: '2.6rem' },
              fontWeight: 800,
              color: 'text.primary',
              mb: 1.5,
              letterSpacing: '-0.02em',
            }}
          >
            Sua saúde completa em <Box component="span" sx={{ ...SERIF_I, color: TEAL_DARK }}>um só lugar.</Box>
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: { xs: 15.5, md: 17 }, maxWidth: 620, mx: 'auto', lineHeight: 1.55 }}>
            Tudo o que você precisa para cuidar de si e de quem ama, com respaldo científico e tecnologia inteligente.
          </Typography>
        </Box>

        {/* BENTO GRID 4 PILARES */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(12, 1fr)' },
            gap: 2.5,
          }}
        >
          {/* Card 1: Família & Pediatria (Col 7) */}
          <Box
            sx={{
              gridColumn: { xs: '1 / -1', md: 'span 7' },
              p: { xs: 3, sm: 3.5 },
              borderRadius: '24px',
              bgcolor: 'background.default',
              border: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: '0 4px 20px rgba(0,0,0,.03)',
              transition: 'transform .2s ease, box-shadow .2s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 12px 30px rgba(32,178,170,.08)',
              },
            }}
          >
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.75 }}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: '12px',
                    bgcolor: 'rgba(32,178,170,.12)',
                    display: 'grid',
                    placeItems: 'center',
                    color: TEAL_DARK,
                  }}
                >
                  <FamilyRestroomIcon sx={{ fontSize: 22 }} />
                </Box>
                <Chip size="small" label="Família & Cuidador" sx={{ fontWeight: 800, bgcolor: 'rgba(32,178,170,.10)', color: TEAL_DARK }} />
              </Stack>
              <Typography sx={{ fontWeight: 800, fontSize: { xs: 18, sm: 20 }, color: 'text.primary', mb: 1 }}>
                Dependentes, filhos e idosos no mesmo app
              </Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: 14.5, lineHeight: 1.6, mb: 2.5 }}>
                Chega de exames perdidos no WhatsApp. Cada familiar tem perfil individual, faixas pediátricas automáticas (Harriet Lane) e curvas de percentil da OMS de 0 a 19 anos.
              </Typography>
            </Box>

            {/* Micro visual: pill de dependente */}
            <Box
              sx={{
                p: 1.75,
                borderRadius: '16px',
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 1,
              }}
            >
              <Stack direction="row" spacing={1.25} alignItems="center">
                <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: 'rgba(32,178,170,.14)', display: 'grid', placeItems: 'center', color: TEAL_DARK, fontWeight: 800, fontSize: 13 }}>
                  T
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: 'text.primary' }}>Theo · Filho (4 anos)</Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Percentil 50 OMS · Faixa pediátrica ativa</Typography>
                </Box>
              </Stack>
              <Chip size="small" icon={<ChildCareIcon sx={{ fontSize: 15 }} />} label="Modo Cuidador" sx={{ height: 22, fontWeight: 700, bgcolor: 'rgba(5,150,105,.12)', color: '#047857' }} />
            </Box>
          </Box>

          {/* Card 2: Wearables & Health Connect (Col 5) */}
          <Box
            sx={{
              gridColumn: { xs: '1 / -1', md: 'span 5' },
              p: { xs: 3, sm: 3.5 },
              borderRadius: '24px',
              bgcolor: 'background.default',
              border: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: '0 4px 20px rgba(0,0,0,.03)',
              transition: 'transform .2s ease, box-shadow .2s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 12px 30px rgba(32,178,170,.08)',
              },
            }}
          >
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.75 }}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: '12px',
                    bgcolor: 'rgba(239,68,68,.10)',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#dc2626',
                  }}
                >
                  <MonitorHeartIcon sx={{ fontSize: 22 }} />
                </Box>
                <Chip size="small" label="Sincronização 24h" sx={{ fontWeight: 800, bgcolor: 'rgba(239,68,68,.10)', color: '#dc2626' }} />
              </Stack>
              <Typography sx={{ fontWeight: 800, fontSize: { xs: 18, sm: 20 }, color: 'text.primary', mb: 1 }}>
                Lê seu relógio e celular
              </Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: 14.5, lineHeight: 1.6, mb: 2.5 }}>
                Integração nativa com <b>Google Health Connect</b> e Apple Health. Cruza colesterol com sedentarismo e sono profundo para cálculo de risco real — e, na teleconsulta, esses dados chegam junto na tela do médico.
              </Typography>
            </Box>

            <Stack direction="row" spacing={1} sx={{ pt: 1 }}>
              {[
                { l: 'Passos', v: '8.430', c: TEAL_DARK },
                { l: 'BPM Repouso', v: '68 bpm', c: '#dc2626' },
                { l: 'Sono', v: '7h 40m', c: '#4f46e5' },
              ].map((m) => (
                <Box key={m.l} sx={{ flex: 1, p: 1.25, borderRadius: '12px', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', textAlign: 'center' }}>
                  <Typography sx={{ fontSize: 11, color: 'text.secondary', fontWeight: 600 }}>{m.l}</Typography>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: m.c, fontVariantNumeric: 'tabular-nums' }}>{m.v}</Typography>
                </Box>
              ))}
            </Stack>
          </Box>

          {/* Card 3: Medicina com Fonte & Diretrizes (Col 5) */}
          <Box
            sx={{
              gridColumn: { xs: '1 / -1', md: 'span 5' },
              p: { xs: 3, sm: 3.5 },
              borderRadius: '24px',
              bgcolor: 'background.default',
              border: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: '0 4px 20px rgba(0,0,0,.03)',
              transition: 'transform .2s ease, box-shadow .2s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 12px 30px rgba(32,178,170,.08)',
              },
            }}
          >
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.75 }}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: '12px',
                    bgcolor: 'rgba(5,150,105,.12)',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#059669',
                  }}
                >
                  <MenuBookIcon sx={{ fontSize: 22 }} />
                </Box>
                <Chip size="small" label="Rigor Científico" sx={{ fontWeight: 800, bgcolor: 'rgba(5,150,105,.10)', color: '#059669' }} />
              </Stack>
              <Typography sx={{ fontWeight: 800, fontSize: { xs: 18, sm: 20 }, color: 'text.primary', mb: 1 }}>
                Respaldo médico e fontes oficiais
              </Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: 14.5, lineHeight: 1.6, mb: 2 }}>
                Nada de respostas vagas. Cada explicação cita diretrizes (SBC, SBD, ADA), rastreamentos validados (PHQ-9/GAD-7) e efeitos de remédios da base mundial FDA.
              </Typography>
            </Box>

            <Box sx={{ p: 1.5, borderRadius: '14px', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: TEAL_DARK, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AutoAwesomeIcon sx={{ fontSize: 15 }} /> Diretrizes clínicas integradas
              </Typography>
              <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.25 }}>
                Sociedade Brasileira de Cardiologia, Diabetes e Endocrinologia.
              </Typography>
            </Box>
          </Box>

          {/* Card 4: Economia de Medicamentos (Col 7) */}
          <Box
            sx={{
              gridColumn: { xs: '1 / -1', md: 'span 7' },
              p: { xs: 3, sm: 3.5 },
              borderRadius: '24px',
              bgcolor: 'background.default',
              border: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: '0 4px 20px rgba(0,0,0,.03)',
              transition: 'transform .2s ease, box-shadow .2s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 12px 30px rgba(32,178,170,.08)',
              },
            }}
          >
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.75 }}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: '12px',
                    bgcolor: 'rgba(212,165,116,.18)',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#b88a54',
                  }}
                >
                  <StorefrontIcon sx={{ fontSize: 22 }} />
                </Box>
                <Chip size="small" label="Economia Real" sx={{ fontWeight: 800, bgcolor: 'rgba(212,165,116,.15)', color: '#b88a54' }} />
              </Stack>
              <Typography sx={{ fontWeight: 800, fontSize: { xs: 18, sm: 20 }, color: 'text.primary', mb: 1 }}>
                Comparador de 9 farmácias online
              </Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: 14.5, lineHeight: 1.6, mb: 2.5 }}>
                O mesmo remédio varia até 2.400% entre farmácias. O Dr. Exame monitora Drogasil, Pacheco, Pague Menos e outras para você comprar pelo menor preço do Brasil.
              </Typography>
            </Box>

            <Box
              sx={{
                p: 1.75,
                borderRadius: '16px',
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Box>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary' }}>Levotiroxina 25mcg (30 un.)</Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Diferença de até R$ 22,00 por caixa</Typography>
              </Box>
              <Button
                size="small"
                onClick={onRegister}
                endIcon={<ArrowForwardIcon sx={{ fontSize: 16 }} />}
                sx={{
                  textTransform: 'none',
                  fontWeight: 800,
                  fontSize: 13,
                  borderRadius: '999px',
                  color: '#b88a54',
                  bgcolor: 'rgba(212,165,116,.12)',
                  '&:hover': { bgcolor: 'rgba(212,165,116,.22)' },
                }}
              >
                Comparar meus remédios
              </Button>
            </Box>
          </Box>
        </Box>
      </Container>
    </Box>
  );
};
