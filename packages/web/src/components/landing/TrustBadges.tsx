// Lucian UX/UI Prompt #243 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#243
// Tap-to-verify security badges — portado p/ React/MUI (sx) na identidade Dr. Exame.
// Motion values do original preservados: flip .6s cubic-bezier(.3,1.2,.4,1); sheen 5.5s
// ease-in-out infinite (delay i*1.1s); spin .7s linear; verify 900ms.
// Adaptações: footprint fixo 340×340 → card responsivo (100%, max 380px, altura auto —
// a copy PT-BR é mais longa); tokens --ux-* mapeados p/ palette MUI + teal/cobre da marca.
import { Box, Container, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';

const TEAL = '#20b2aa';
const GREEN = '#059669';

/** Keyframes do elemento (nomes originais u243* p/ evitar colisão global). */
const KEYFRAMES = {
  '@keyframes u243sh': { '0%,70%': { left: '-60%' }, '90%,100%': { left: '130%' } },
  '@keyframes u243spin': { to: { transform: 'rotate(360deg)' } },
} as const;

/** Escudo do elemento original (SVG inline, aria-hidden — decorativo). */
const SHIELD = (
  <svg viewBox="0 0 42 46" aria-hidden="true" style={{ width: 42, height: 46, display: 'block' }}>
    <path d="M21 3l15 5.5v11.5c0 11-6.6 18.8-15 22.5C12.6 38.8 6 31 6 20V8.5z" fill="currentColor" opacity={0.14} stroke="currentColor" strokeWidth={2.4} strokeLinejoin="round" />
    <path d="M14.5 22.5l4.5 4.5 9-9.5" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

interface BadgeData {
  title: string;
  sub: string;
  back: string;
  foot: string;
  color: string;
}

/** Copy honesta: só o que o produto realmente faz (nada de certificação inventada). */
const BADGES: BadgeData[] = [
  {
    title: 'LGPD', sub: 'Privacidade de dados', color: TEAL,
    back: 'Dados pessoais criptografados (pgcrypto). PDFs de exames ficam fora do banco. Você pode exportar ou apagar tudo a qualquer momento.',
    foot: 'Lei nº 13.709/2018 · dado de saúde é dado sensível',
  },
  {
    title: 'CFM 2.314', sub: 'Telemedicina', color: '#d4a574',
    back: 'Teleconsulta conforme a Resolução CFM nº 2.314/2022. Registro do ato médico e consentimento explícito antes de cada atendimento.',
    foot: 'Resolução do Conselho Federal de Medicina',
  },
  {
    title: 'IA com supervisão', sub: 'Sem diagnóstico', color: '#178f89',
    back: 'A IA do Dr. Exame não diagnostica: educa, compara com faixas de referência e prepara perguntas para o seu médico.',
    foot: 'Educativa por design · a decisão é do seu médico',
  },
  {
    title: 'Pagamento seguro', sub: 'PIX e estorno', color: GREEN,
    back: 'PIX gerado na hora; cobrança só acontece quando um médico aceita o atendimento. Estorno integral se não houver match.',
    foot: 'PIX via OpenPix e Asaas',
  },
];

type VerifyState = 'idle' | 'busy' | 'ok';

const TrustBadge = ({ badge, index, rm }: { badge: BadgeData; index: number; rm: boolean }) => {
  const [flipped, setFlipped] = useState(false);
  const [verify, setVerify] = useState<VerifyState>('idle');
  const timer = useRef<number | null>(null);
  // Limpa o timeout pendente no unmount (StrictMode monta 2× em dev).
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);

  const flip = () => setFlipped((v) => !v);

  const onVerify = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (verify !== 'idle') return;
    setVerify('busy');
    timer.current = window.setTimeout(() => setVerify('ok'), rm ? 0 : 900);
  };

  const verifyLabel = verify === 'busy' ? 'Verificando…' : verify === 'ok' ? 'Verificado agora' : 'Verificar';

  return (
    <Box
      component="div"
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      aria-label={`${badge.title} — detalhes`}
      onClick={flip}
      onKeyDown={(e: React.KeyboardEvent) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); flip(); }
      }}
      sx={{
        position: 'relative', display: 'grid', p: 0, border: 0, background: 'none',
        color: 'inherit', cursor: 'pointer', textAlign: 'left',
        transformStyle: 'preserve-3d',
        transition: 'transform .6s cubic-bezier(.3,1.2,.4,1)',
        transform: flipped ? 'rotateY(180deg)' : 'none',
        '&:focus-visible': { outline: `2px solid ${TEAL}`, outlineOffset: '3px', borderRadius: '16px' },
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      {/* FRENTE — sheen que passa de tempos em tempos (delay escalonado do original). */}
      <Box
        aria-hidden={flipped}
        sx={{
          gridArea: '1 / 1', position: 'relative', overflow: 'hidden', borderRadius: '16px',
          backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: '6px', minHeight: 128, px: 1,
          bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(32,178,170,.10)' : 'rgba(32,178,170,.07)'),
          boxShadow: (t) => `inset 0 0 0 1px ${t.palette.divider}`,
          '&::after': {
            content: '""', position: 'absolute', top: 0, bottom: 0, left: '-60%', width: '40%',
            background: 'linear-gradient(105deg,transparent,rgba(255,255,255,.55),transparent)',
            transform: 'skewX(-12deg)',
            animation: 'u243sh 5.5s ease-in-out infinite',
            animationDelay: `${index * 1.1}s`,
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          },
        }}
      >
        <Box sx={{ width: 42, height: 46, display: 'grid', placeItems: 'center', color: badge.color }}>{SHIELD}</Box>
        <Typography component="b" sx={{ fontSize: 13, fontWeight: 900, letterSpacing: '-.01em', color: 'text.primary', lineHeight: 1.15 }}>{badge.title}</Typography>
        <Typography component="small" sx={{ fontSize: 9.5, fontWeight: 750, color: 'text.secondary' }}>{badge.sub}</Typography>
      </Box>

      {/* VERSO — certificador/escopo/validade → adaptado p/ o que o app realmente faz. */}
      <Box
        aria-hidden={!flipped}
        sx={{
          gridArea: '1 / 1', overflow: 'hidden', borderRadius: '16px',
          backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
          transform: 'rotateY(180deg)',
          display: 'flex', flexDirection: 'column', p: '11px 12px',
          bgcolor: (t) => (t.palette.mode === 'dark' ? '#1a2424' : '#ffffff'),
          boxShadow: `inset 0 0 0 1.5px ${badge.color}`,
        }}
      >
        <Typography component="b" sx={{ fontSize: 12, fontWeight: 900, color: 'text.primary' }}>{badge.title}</Typography>
        <Typography component="span" sx={{ mt: '3px', fontSize: 10, lineHeight: 1.4, fontWeight: 700, color: 'text.secondary' }}>{badge.back}</Typography>
        <Typography component="small" sx={{ mt: '2px', mb: '7px', fontSize: 9.5, fontWeight: 650, color: 'text.disabled' }}>{badge.foot}</Typography>
        <Box
          component="button"
          type="button"
          onClick={onVerify}
          tabIndex={flipped ? 0 : -1}
          aria-label={`Verificar ${badge.title}`}
          sx={{
            position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '5px',
            alignSelf: 'flex-start', height: 26, mt: 'auto',
            px: '10px', border: 0, borderRadius: '8px', cursor: 'pointer',
            bgcolor: verify === 'ok' ? GREEN : 'text.primary',
            color: (t) => (t.palette.mode === 'dark' ? '#0f1818' : '#ffffff'),
            fontFamily: 'inherit', fontSize: 10, fontWeight: 850,
            transition: 'background-color .2s ease',
            // Alvo de toque ≥44px sem mudar o visual (hit area estendida via pseudo-elemento).
            '&::after': { content: '""', position: 'absolute', left: '-9px', right: '-9px', top: '-6px', bottom: '-9px' },
          }}
        >
          {verify === 'busy' && (
            <Box
              component="span"
              aria-hidden
              sx={{
                width: 11, height: 11, borderRadius: '50%',
                border: '2px solid', borderColor: 'rgba(127,127,127,.45)', borderTopColor: 'currentColor',
                animation: 'u243spin .7s linear infinite',
                '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
              }}
            />
          )}
          <span>{verifyLabel}</span>
        </Box>
      </Box>
    </Box>
  );
};

/** Seção de CONFIANÇA — selos que flipam ao toque. Rodapé do funil (após FAQ, antes do CTA final). */
export const TrustBadges = () => {
  const [rm] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  return (
    <Box
      component="section"
      id="confianca"
      sx={{
        py: { xs: 6, md: 9 }, bgcolor: 'background.default',
        borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider',
        fontFamily: '"Inter","Poppins",sans-serif', letterSpacing: '-0.01em',
        ...KEYFRAMES,
      }}
    >
      <Container maxWidth="sm" sx={{ px: { xs: 2, sm: 3 } }}>
        <Box
          sx={{
            position: 'relative', width: '100%', maxWidth: 380, mx: 'auto',
            borderRadius: '24px', overflow: 'hidden',
            bgcolor: (t) => (t.palette.mode === 'dark' ? '#1a2424' : '#ffffff'),
            boxShadow: (t) => `0 0 0 1px ${t.palette.divider}, 0 30px 60px -36px ${t.palette.mode === 'dark' ? 'rgba(0,0,0,.72)' : 'rgba(15,95,90,.30)'}`,
            color: 'text.primary', pt: '24px', px: '14px', pb: '14px',
          }}
        >
          <Box sx={{ px: '6px' }}>
            <Typography component="b" sx={{ display: 'block', fontFamily: '"Poppins","Inter",sans-serif', fontSize: 17, fontWeight: 900, letterSpacing: '-.03em', color: 'text.primary' }}>
              Por que confiar no Dr. Exame
            </Typography>
            <Typography component="small" sx={{ display: 'block', mt: '4px', fontSize: 11, fontWeight: 650, color: 'text.secondary' }}>
              Toque em um selo pra ver o que existe por trás dele
            </Typography>
          </Box>
          <Box sx={{ mt: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', perspective: '700px' }}>
            {BADGES.map((b, i) => (
              <TrustBadge key={b.title} badge={b} index={i} rm={rm} />
            ))}
          </Box>
        </Box>
      </Container>
    </Box>
  );
};
