/**
 * "O que é isso?" (G4) — explainer amigável ancorado num "?" discreto.
 *
 * IconButton "?" (alvo tátil 44px via ::after — o prop `touch` do ButtonBase saiu
 * dos tipos do MUI v7) + Popover MUI com:
 * título, 2-3 frases em linguagem de gente (copys REVISADAS — não editar à mão),
 * micro-visualização CSS pura que anima ao abrir (respeita prefers-reduced-motion)
 * e link "saiba mais" quando couber. Sem lib nova.
 *
 * Popover mobile-friendly: quase full-width no xs, âncora bottom (não cobre o "?" ).
 * Conteúdo desmonta ao fechar → animação rebobina a cada abertura.
 */
import { useState } from 'react';
import { Box, IconButton, Link, Popover, Stack, Typography, keyframes } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { tealText } from '../theme';

export type WhatIsThisTopic = 'faers' | 'percentis' | 'diretrizes';

/** Desliga animação quando o usuário pediu menos movimento (WCAG 2.3.3). */
const NO_MOTION = { '@media (prefers-reduced-motion: reduce)': { animation: 'none' } } as const;

const barGrow = keyframes`from { transform: scaleY(0); } to { transform: scaleY(1); }`;
const curveDraw = keyframes`from { stroke-dashoffset: 100; } to { stroke-dashoffset: 0; }`;
const sealPop = keyframes`from { transform: scale(.6); opacity: 0; } to { transform: scale(1); opacity: 1; }`;

const CONTENT: Record<WhatIsThisTopic, {
  title: string; aria: string; body: string;
}> = {
  faers: {
    title: 'Efeitos mais relatados',
    aria: 'efeitos mais relatados',
    // Copy revisada (spec G4) — não editar.
    body: 'Como sabemos disso? Médicos, pacientes e fabricantes do mundo inteiro reportam efeitos à FDA — a agência de saúde dos EUA. Somamos esses relatos todos e mostramos os mais comuns. Importante: é o que MAIS APARECE NOS RELATOS — não é o que mais acontece com quem toma (quem teve problema conta mais que quem ficou bem).',
  },
  percentis: {
    title: 'Percentis da OMS',
    aria: 'percentis de crescimento',
    body: 'A linha do meio é a média das crianças da idade (percentil 50). As faixas mostram onde a maioria fica. Perto da linha de cima ou de baixo não é "errado" — cada criança tem sua curva; o pediatra olha se ela CRESCE no ritmo dela, não o ponto exato.',
  },
  diretrizes: {
    title: 'Fontes e diretrizes',
    aria: 'fontes e diretrizes',
    body: 'Quando o Dr. Exame fala de valores, segue as recomendações das sociedades médicas (cardiologia, diabetes, tireoide) — as mesmas que seu médico estuda. A fonte aparece sempre junto, pra você conferir.',
  },
};

/** Barrinhas animadas (FAERS): relatos empilhados, o mais comum em teal. */
const FaersViz = () => {
  const H = [34, 58, 84, 66, 40];
  return (
    <Box sx={{ mt: 1.5, mb: 0.25 }} aria-hidden="true">
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.75, height: 56, px: 0.5 }}>
        {H.map((h, i) => (
          <Box key={i} sx={{
            flex: 1, height: `${h}%`, borderRadius: '4px 4px 2px 2px',
            bgcolor: i === 2 ? '#20b2aa' : 'rgba(148,163,184,.38)',
            transformOrigin: 'bottom',
            animation: `${barGrow} .45s ${i * 0.07}s ease-out both`,
            ...NO_MOTION,
          }} />
        ))}
      </Box>
      <Typography sx={{ fontSize: 11, color: 'text.secondary', textAlign: 'center', mt: 0.25 }}>
        nº de relatos — o mais comum em destaque
      </Typography>
    </Box>
  );
};

/** Curvinha SVG (percentis): faixa OMS, linha do meio tracejada e a curva da criança desenhando. */
const PercentisViz = () => (
  <Box sx={{ mt: 1.5 }} aria-hidden="true">
    <Box component="svg" viewBox="0 0 160 52" sx={{ width: '100%', height: 52, display: 'block' }}>
      {/* Faixa onde a maioria fica (P15-P85) */}
      <Box component="path" d="M2 12 C 50 10, 110 16, 158 24 L 158 44 C 110 36, 50 30, 2 32 Z" sx={{ fill: 'rgba(32,178,170,.10)', stroke: 'none' }} />
      {/* Linha do meio (percentil 50) */}
      <Box component="path" d="M2 22 C 50 20, 110 26, 158 34" sx={{ fill: 'none', stroke: '#64748b', strokeWidth: 1.4, strokeDasharray: '5 4' }} />
      {/* Curva da criança (teal) — desenha ao abrir */}
      <Box component="path" pathLength={100} d="M2 40 C 40 38, 90 32, 158 26"
        sx={{
          fill: 'none', stroke: '#20b2aa', strokeWidth: 2.6, strokeLinecap: 'round',
          strokeDasharray: 100, strokeDashoffset: 0,
          animation: `${curveDraw} .7s ease-out both`,
          ...NO_MOTION,
        }} />
      <Box component="circle" cx={158} cy={26} r={3.2} sx={{ fill: '#20b2aa' }} />
      <Box component="text" x={4} y={9} sx={{ fontSize: 8, fill: 'rgba(100,116,139,.9)' }}>P85</Box>
      <Box component="text" x={4} y={49} sx={{ fontSize: 8, fill: 'rgba(100,116,139,.9)' }}>P15</Box>
    </Box>
  </Box>
);

/** Selo/citação (diretrizes): carimbo "diretriz oficial" + citações em miniatura. */
const DiretrizesViz = () => (
  <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mt: 1.5 }} aria-hidden="true">
    <Box sx={{
      width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: '2px solid #20b2aa', color: '#20b2aa', fontWeight: 800, fontSize: 18,
      animation: `${sealPop} .4s ease-out both`,
      ...NO_MOTION,
    }}>✓</Box>
    <Stack spacing={0.4}>
      {['Sociedade Brasileira de Cardiologia', 'Sociedade Brasileira de Diabetes'].map((s) => (
        <Box key={s} sx={{ fontSize: 11, color: 'text.secondary', px: 1, py: 0.3, borderRadius: '8px', bgcolor: 'rgba(32,178,170,.08)', border: '1px solid rgba(32,178,170,.18)' }}>
          📖 {s}
        </Box>
      ))}
    </Stack>
  </Stack>
);

/** "Saiba mais" — externo (FAERS/OMS) ou interno (como validamos). */
const LearnMore = ({ topic }: { topic: WhatIsThisTopic }) => {
  if (topic === 'diretrizes') {
    return (
      <Link component={RouterLink} to="/como-validamos" sx={{ fontSize: 12, fontWeight: 700, textDecoration: 'underline' }}>
        Saiba mais: como validamos
      </Link>
    );
  }
  const href = topic === 'faers' ? 'https://open.fda.gov' : 'https://www.who.int/tools/child-growth-standards';
  const label = topic === 'faers' ? 'Saiba mais: open.fda.gov' : 'Saiba mais: padrões da OMS';
  return (
    <Link href={href} target="_blank" rel="noopener noreferrer" sx={{ fontSize: 12, fontWeight: 700, textDecoration: 'underline' }}>
      {label}
    </Link>
  );
};

export const WhatIsThis = ({ topic }: { topic: WhatIsThisTopic }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const c = CONTENT[topic];
  const open = Boolean(anchor);

  return (
    <>
      <IconButton
        size="small"
        aria-label={`O que é isso? — ${c.aria}`}
        aria-haspopup="dialog"
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{
          color: 'text.secondary', p: { xs: 0.75, sm: 0.5 },
          '&:hover': { color: '#20b2aa', bgcolor: 'rgba(32,178,170,.08)' },
          // Alvo tátil 44px sem inchar o visual: pseudo-elemento estende a área
          // clicável (hit-test conta o ::after como parte do botão).
          '&::after': { content: '""', position: 'absolute', inset: { xs: '-7px', sm: '-4px' } },
          position: 'relative',
        }}
      >
        <HelpOutlineIcon sx={{ fontSize: 17 }} />
      </IconButton>
      <Popover
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        marginThreshold={10}
        slotProps={{
          paper: {
            sx: {
              borderRadius: '14px', p: 2,
              width: { xs: 'min(88vw, 340px)', sm: 320 },
              border: '1px solid', borderColor: 'divider',
            },
          },
        }}
      >
        <Typography sx={{ fontWeight: 800, fontSize: 14, fontFamily: '"Poppins",sans-serif' }}>
          {c.title}
        </Typography>
        <Typography sx={{ fontSize: 12.5, lineHeight: 1.6, color: 'text.secondary', mt: 0.5 }}>
          {c.body}
        </Typography>
        {topic === 'faers' && <FaersViz />}
        {topic === 'percentis' && <PercentisViz />}
        {topic === 'diretrizes' && <DiretrizesViz />}
        <Box sx={{ mt: 1.25, textAlign: 'right' }}>
          <LearnMore topic={topic} />
        </Box>
      </Popover>
    </>
  );
};
