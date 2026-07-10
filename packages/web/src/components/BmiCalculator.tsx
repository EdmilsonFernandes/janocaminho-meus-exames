import { Box, Container, Typography, Slider, Stack, Chip } from '@mui/material';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import StraightenIcon from '@mui/icons-material/Straighten';
import MonitorWeightIcon from '@mui/icons-material/MonitorWeight';
import CalculateIcon from '@mui/icons-material/Calculate';
import { Reveal } from './Reveal';

const TEAL = '#20b2aa';
const TEAL_DARK = '#178f89';

// IMC mínimo/máximo do eixo visual (15–40). Marcador é clampado nesse range.
const AX_MIN = 15;
const AX_MAX = 40;
const clampPct = (imc: number) => Math.max(0, Math.min(1, (imc - AX_MIN) / (AX_MAX - AX_MIN))) * 100;

type Cat = { label: string; color: string };
const categorize = (imc: number): Cat => {
  if (imc < 18.5) return { label: 'Abaixo do peso', color: '#0ea5e9' };
  if (imc < 25) return { label: 'Peso adequado', color: '#16a34a' };
  if (imc < 30) return { label: 'Sobrepeso', color: '#ea580c' };
  return { label: 'Obesidade', color: '#dc2626' };
};

// Calculadora de IMC (F4) — ferramenta didática ao vivo na landing.
export const BmiCalculator = () => {
  const navigate = useNavigate();
  const [altura, setAltura] = useState(170); // cm
  const [peso, setPeso] = useState(70); // kg

  const imc = useMemo(() => peso / Math.pow(altura / 100, 2), [altura, peso]);
  const cat = categorize(imc);

  return (
    <Box sx={{ bgcolor: 'background.default', py: { xs: 8, md: 11 } }}>
      <Container maxWidth="sm">
        <Reveal>
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ mb: 1 }}>
              <CalculateIcon sx={{ fontSize: 20, color: TEAL_DARK }} />
              <Typography sx={{ fontSize: 13, fontWeight: 800, color: TEAL_DARK, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Experimente agora · grátis</Typography>
            </Stack>
            <Typography variant="h2" sx={{ fontSize: { xs: '1.9rem', md: '2.6rem' }, fontWeight: 800, color: 'text.primary', mb: 1.5, letterSpacing: '-0.02em' }}>Calcule seu IMC</Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: 17, maxWidth: 520, mx: 'auto' }}>Um índice que o laudo não dá. Arraste e veja na hora — é só uma amostra do que o Dr. Exame calcula pra você.</Typography>
          </Box>
        </Reveal>

        <Reveal delay={80}>
          <Box sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 4, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', boxShadow: '0 20px 44px rgba(15,61,58,.08)' }}>
            {/* Sliders */}
            <Box sx={{ mb: 3 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                <StraightenIcon sx={{ fontSize: 18, color: TEAL_DARK }} />
                <Typography sx={{ fontWeight: 700, fontSize: 14, color: 'text.secondary' }}>Altura</Typography>
                <Typography sx={{ ml: 'auto', fontWeight: 800, fontSize: 16, color: 'text.primary' }}>{altura} cm</Typography>
              </Stack>
              <Slider value={altura} onChange={(_, v) => setAltura(v as number)} min={140} max={210} step={1} color="primary" sx={{ color: TEAL }} />
            </Box>
            <Box sx={{ mb: 3.5 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                <MonitorWeightIcon sx={{ fontSize: 18, color: TEAL_DARK }} />
                <Typography sx={{ fontWeight: 700, fontSize: 14, color: 'text.secondary' }}>Peso</Typography>
                <Typography sx={{ ml: 'auto', fontWeight: 800, fontSize: 16, color: 'text.primary' }}>{peso} kg</Typography>
              </Stack>
              <Slider value={peso} onChange={(_, v) => setPeso(v as number)} min={40} max={150} step={1} color="primary" sx={{ color: TEAL }} />
            </Box>

            {/* Resultado */}
            <Box sx={{ textAlign: 'center', mb: 2.5 }}>
              <Typography sx={{ fontSize: 13, color: 'text.secondary', fontWeight: 700 }}>Seu IMC</Typography>
              <Typography sx={{ fontSize: { xs: '2.8rem', md: '3.2rem' }, fontWeight: 800, color: cat.color, lineHeight: 1, fontFamily: '"Poppins","Inter",sans-serif', letterSpacing: '-0.02em' }}>{imc.toFixed(1)}</Typography>
              <Chip label={cat.label} sx={{ mt: 1, fontWeight: 800, bgcolor: `${cat.color}22`, color: cat.color }} />
            </Box>

            {/* Barra de categorias OMS com marcador */}
            <Box sx={{ position: 'relative', mt: 4, mb: 1 }}>
              <Box sx={{ display: 'flex', height: 10, borderRadius: 99, overflow: 'hidden' }}>
                <Box sx={{ flex: 14, bgcolor: '#0ea5e9' }} />
                <Box sx={{ flex: 26, bgcolor: '#16a34a' }} />
                <Box sx={{ flex: 20, bgcolor: '#ea580c' }} />
                <Box sx={{ flex: 40, bgcolor: '#dc2626' }} />
              </Box>
              {/* marcador */}
              <Box sx={{
                position: 'absolute', top: -5, left: `${clampPct(imc)}%`,
                transform: 'translateX(-50%)', transition: 'left .25s ease',
                width: 20, height: 20, borderRadius: '50%', bgcolor: '#fff',
                border: `3px solid ${cat.color}`, boxShadow: '0 2px 8px rgba(0,0,0,.18)',
              }} />
            </Box>
            <Stack direction="row" justifyContent="space-between" sx={{ fontSize: 11, color: 'text.secondary', fontWeight: 600, px: 0.5 }}>
              <span>15</span><span>18,5</span><span>25</span><span>30</span><span>40</span>
            </Stack>

            {/* Nota didática + CTA */}
            <Box sx={{ mt: 3, borderRadius: 2, p: 1.5, bgcolor: 'rgba(32,178,170,.06)', border: '1px solid', borderColor: 'rgba(32,178,170,.18)' }}>
              <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.55 }}>
                O IMC é só o começo. No app, o Dr. Exame calcula também <b style={{ color: 'text.primary' }}>eGFR (função renal)</b> e <b style={{ color: 'text.primary' }}>HOMA-IR (resistência insulínica)</b> direto dos seus exames — além de mostrar o valor ideal, não só o de referência.
              </Typography>
            </Box>
          </Box>
        </Reveal>
      </Container>
    </Box>
  );
};
