import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, Container, IconButton, Stack, Typography, Chip } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

/**
 * ProductPreview — "Veja o que você recebe" (maior conversor da landing, insight
 * Kantesti/AI DiagMe: mostrar o produto, não só descrever).
 *
 * 5 telas reconstruídas com a LINGUAGEM visual real do app (MUI + tokens — zero
 * lib, zero screenshot pesado): Score+Idade Biológica, régua do resumo IA, chat,
 * Saúde Esportiva e portal médico. Carrossel de 1 código-só: faixa com
 * scroll-snap (swipe nativo no touch), setas prev/next no desktop e dots.
 * SEM auto-play (prefers-reduced-motion respeitado por natureza).
 * Valores dos mocks são EXEMPLOS ilustrativos (rotulados) — nenhum número
 * apresentado como dado de usuário real.
 */

const TEAL = '#20b2aa';
const TEAL_DARK = '#178f89';
const INK = '#0f5f5a';
const COPPER = '#d4a574';
const SERIF_I = { fontFamily: "'Instrument Serif', Georgia, serif", fontStyle: 'italic', fontWeight: 400 } as const;

/** Moldura tipo "janela do app": barra superior + área de conteúdo. */
const Frame = ({ url, children, ariaLabel }: { url: string; children: ReactNode; ariaLabel: string }) => (
  <Box aria-label={ariaLabel} sx={{
    borderRadius: '20px', overflow: 'hidden', bgcolor: 'background.paper',
    border: '1px solid', borderColor: 'divider',
    boxShadow: '0 24px 56px rgba(15,61,58,.14), 0 4px 14px rgba(0,0,0,.05)',
    display: 'flex', flexDirection: 'column', height: '100%',
  }}>
    {/* chrome da janela */}
    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ px: 2, py: 1.1, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'action.hover' }}>
      <Stack direction="row" spacing={0.5}>
        {['#ef4444', '#f59e0b', TEAL].map((c) => (
          <Box key={c} sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: c, opacity: 0.75 }} />
        ))}
      </Stack>
      <Box sx={{ flex: 1, mx: 'auto', maxWidth: 220, textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: 'text.secondary', bgcolor: 'background.paper', borderRadius: '999px', px: 1.5, py: 0.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>
        {url}
      </Box>
      <Box sx={{ width: 26 }} />
    </Stack>
    <Box sx={{ flex: 1, p: { xs: 2, sm: 2.75 } }}>{children}</Box>
  </Box>
);

/** Ring de score (mesma linguagem do DashboardV2). */
const ScoreRing = ({ value }: { value: number }) => {
  const dash = value * 2.64;
  return (
    <Box sx={{ position: 'relative', width: 116, height: 116, flexShrink: 0 }}>
      <Box component="svg" viewBox="0 0 100 100" aria-hidden="true" sx={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id="ppScoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={TEAL} />
            <stop offset="50%" stopColor="#059669" />
            <stop offset="100%" stopColor={TEAL} />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(15,95,90,.10)" strokeWidth="8" />
        <circle cx="50" cy="50" r="42" fill="none" stroke="url(#ppScoreGrad)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${dash} 999`} />
      </Box>
      <Stack sx={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
        <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 30, lineHeight: 1, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
        <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>de 100</Typography>
      </Stack>
    </Box>
  );
};

/** Régua de marcador (assinatura do produto): faixa do lab + valor + meta tracejada. */
const MarkerRuler = () => (
  <Box>
    <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mb: 1 }}>
      <Typography sx={{ fontSize: 14.5, fontWeight: 800, color: 'text.primary' }}>Hematócrito · <Box component="span" sx={{ color: TEAL_DARK }}>47%</Box></Typography>
      <Chip size="small" label="✓ na faixa" sx={{ height: 22, fontWeight: 800, bgcolor: 'rgba(5,150,105,.12)', color: '#047857' }} />
    </Stack>
    <Box component="svg" viewBox="0 0 400 74" role="img" aria-label="Régua do marcador: faixa do laboratório 37 a 47 por cento, seu valor em 47 e a meta do médico até 54" sx={{ width: '100%', height: 'auto', display: 'block' }}>
      {/* trilho */}
      <line x1="8" y1="34" x2="392" y2="34" stroke="rgba(15,95,90,.18)" strokeWidth="1.5" />
      {/* faixa do laboratório (37–47% → 34%..47% da largura útil) */}
      <rect x="136" y="22" width="150" height="24" rx="12" fill="rgba(15,95,90,.12)" />
      {/* meta do médico (até 54% → tracejada teal) */}
      <rect x="246" y="19" width="146" height="30" rx="15" fill="rgba(32,178,170,.10)" stroke={TEAL} strokeWidth="1.5" strokeDasharray="7 6" />
      {/* pin do valor (47%) */}
      <rect x="280" y="14" width="7" height="40" rx="3.5" fill={TEAL} />
      <circle cx="283.5" cy="34" r="5" fill={TEAL} stroke="#fff" strokeWidth="2" />
      {/* labels */}
      <text x="136" y="64" fontSize="11" fill="#b88a54" fontWeight="700" letterSpacing="1" style={{ textTransform: 'uppercase', fontFamily: 'ui-monospace, monospace' }}>FAIXA DO LAB</text>
      <text x="392" y="64" fontSize="11" fill={TEAL_DARK} fontWeight="700" letterSpacing="1" textAnchor="end" style={{ textTransform: 'uppercase', fontFamily: 'ui-monospace, monospace' }}>META DO MÉDICO</text>
      <text x="283.5" y="9" fontSize="11" fill={INK} fontWeight="800" textAnchor="middle">você · 47%</text>
    </Box>
    <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.5, mt: 1 }}>
      Seu valor está <b>na faixa</b> do laboratório — e a régua mostra, no mesmo gráfico, a meta que o seu médico definir.
    </Typography>
  </Box>
);

/** Slide 1 — Dashboard: Score + Idade Biológica. */
const SlideDashboard = () => (
  <Frame url="app · painel" ariaLabel="Painel com Score de Saúde 72 e idade biológica 34 anos">
    <Stack spacing={2}>
      <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sua saúde hoje</Typography>
      <Stack direction="row" spacing={2.25} alignItems="center">
        <ScoreRing value={72} />
        <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
          <Chip size="small" label="Em boa forma" sx={{ alignSelf: 'flex-start', height: 24, fontWeight: 800, bgcolor: 'rgba(32,178,170,.12)', color: TEAL_DARK }} />
          <Box sx={{ p: 1.25, borderRadius: '12px', bgcolor: 'action.hover' }}>
            <Typography sx={{ fontSize: 11, color: 'text.secondary', fontWeight: 700 }}>🧬 Idade biológica</Typography>
            <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 19, color: 'text.primary', lineHeight: 1.2 }}>
              34 anos <Box component="span" sx={{ fontSize: 11.5, color: 'text.secondary', fontWeight: 600 }}>(cronológica: 41)</Box>
            </Typography>
          </Box>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>● 2 marcadores pedem atenção</Typography>
        </Stack>
      </Stack>
    </Stack>
  </Frame>
);

/** Slide 2 — Resumo IA com a régua. */
const SlideRuler = () => (
  <Frame url="app · resumo com IA" ariaLabel="Resumo da IA explicando o marcador hematócrito com régua visual">
    <Stack spacing={1.5} sx={{ height: '100%' }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <AutoAwesomeIcon sx={{ fontSize: 18, color: TEAL_DARK }} />
        <Typography sx={{ fontSize: 13, fontWeight: 800, color: 'text.primary' }}>Resumo do Dr. Exame</Typography>
        <Chip size="small" label="exemplo" sx={{ height: 20, ml: 'auto', fontSize: 11, fontWeight: 700, bgcolor: 'action.hover', color: 'text.secondary' }} />
      </Stack>
      <Box sx={{ flex: 1, p: 1.5, borderRadius: '14px', bgcolor: 'action.hover' }}>
        <MarkerRuler />
      </Box>
    </Stack>
  </Frame>
);

/** Slide 3 — Chat IA. */
const SlideChat = () => (
  <Frame url="app · chat com IA" ariaLabel="Chat com a IA respondendo pergunta sobre o exame">
    <Stack spacing={1.5}>
      <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary' }}>💬 Tire dúvidas sobre o exame</Typography>
      <Box sx={{ alignSelf: 'flex-end', maxWidth: '82%', bgcolor: TEAL, color: '#fff', px: 1.5, py: 1, borderRadius: '14px 14px 4px 14px', fontSize: 13.5, fontWeight: 600, lineHeight: 1.45 }}>
        Meu LDL veio 148 — é grave?
      </Box>
      <Box sx={{ alignSelf: 'flex-start', maxWidth: '92%', bgcolor: 'action.hover', px: 1.5, py: 1.25, borderRadius: '14px 14px 14px 4px', fontSize: 13, lineHeight: 1.55, color: 'text.primary' }}>
        Acima da referência (&lt; 130 mg/dL), mas um valor só não define nada — o padrão importa.
        <b> Perguntas prontas pro seu médico:</b> “meu risco é individual?”, “devo repetir em jejum?”.
        <Box component="span" sx={{ display: 'block', mt: 0.75, fontSize: 11, fontWeight: 700, color: TEAL_DARK }}>Fontes: SBC · SBD · ADA</Box>
      </Box>
      <Typography sx={{ fontSize: 10.5, color: 'text.disabled', textAlign: 'center' }}>Educativo — nunca diagnóstico. A decisão é do seu médico.</Typography>
    </Stack>
  </Frame>
);

/** Slide 4 — Saúde Esportiva (premium). */
const SlideSports = () => (
  <Frame url="app · saúde esportiva" ariaLabel="Painel de Saúde Esportiva com marcadores por esporte e metas">
    <Box sx={{ borderRadius: '14px', p: { xs: 1.75, sm: 2 }, background: 'linear-gradient(150deg,#093330 0%,#0f5f5a 100%)', color: '#fff' }}>
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.5 }}>
        <Box sx={{ width: 34, height: 34, borderRadius: '10px', bgcolor: 'rgba(255,255,255,.16)', display: 'grid', placeItems: 'center', fontSize: 17 }}>🏋️</Box>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 800, fontFamily: 'Poppins, sans-serif', lineHeight: 1.2 }}>Modo Saúde Esportiva</Typography>
          <Typography sx={{ fontSize: 11, color: '#5fc9c3', fontWeight: 700 }}>marcadores no contexto de quem treina</Typography>
        </Box>
        <Chip size="small" label="PREMIUM" sx={{ height: 20, fontSize: 10, fontWeight: 800, bgcolor: 'rgba(212,165,116,.22)', color: '#d4a574', border: '1px solid rgba(212,165,116,.45)' }} />
      </Stack>
      {[
        { n: 'Hematócrito', v: '47%', pct: 62, note: 'meta do médico: 48–54%' },
        { n: 'CK (pós-treino)', v: '280 U/L', pct: 38, note: 'janela de recuperação' },
        { n: 'Ferritina', v: '88 ng/mL', pct: 55, note: 'acompanhar trimestral' },
      ].map((r) => (
        <Box key={r.n} sx={{ py: 0.75, borderTop: '1px dashed rgba(255,255,255,.14)' }}>
          <Stack direction="row" alignItems="baseline" spacing={1}>
            <Typography sx={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>{r.n}</Typography>
            <Typography sx={{ fontSize: 12.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{r.v}</Typography>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <Box sx={{ flex: 1, height: 5, borderRadius: 3, bgcolor: 'rgba(255,255,255,.14)', overflow: 'hidden' }}>
              <Box sx={{ width: `${r.pct}%`, height: '100%', borderRadius: 3, background: `linear-gradient(90deg,${TEAL},#5fc9c3)` }} />
            </Box>
            <Typography sx={{ fontSize: 10.5, color: 'rgba(255,255,255,.65)', whiteSpace: 'nowrap' }}>{r.note}</Typography>
          </Stack>
        </Box>
      ))}
      <Typography sx={{ fontSize: 10.5, color: 'rgba(255,255,255,.6)', mt: 1 }}>Valores de exemplo · diretrizes SBEM e Endocrine Society citadas</Typography>
    </Box>
  </Frame>
);

/** Slide 5 — Portal médico. */
const SlideDoctor = () => (
  <Frame url="portal do médico" ariaLabel="Portal do médico com meta clínica definida para o paciente">
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1.25} alignItems="center">
        <Box sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: 'rgba(212,165,116,.18)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 14, color: '#b88a54', flexShrink: 0 }}>M</Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: 'text.primary', lineHeight: 1.2 }}>Dra. Marina · Cardiologia</Typography>
          <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>acompanhando 3 exames do paciente</Typography>
        </Box>
        <Chip size="small" label="portal do médico" sx={{ height: 22, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(212,165,116,.14)', color: '#b88a54' }} />
      </Stack>
      <Box sx={{ p: 1.5, borderRadius: '14px', border: `1.5px dashed ${TEAL}`, bgcolor: 'rgba(32,178,170,.06)' }}>
        <Typography sx={{ fontSize: 11, fontWeight: 800, color: TEAL_DARK, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Meta clínica definida pela médica</Typography>
        <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 17, color: 'text.primary', mt: 0.25 }}>
          LDL &lt; 100 mg/dL
        </Typography>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>A meta aparece NA RÉGUA do paciente — os dois veem o mesmo alvo.</Typography>
      </Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 1.25, borderRadius: '12px', bgcolor: 'action.hover' }}>
        <Box component="svg" viewBox="0 0 90 28" aria-hidden="true" sx={{ width: 90, height: 28, flexShrink: 0 }}>
          <path d="M2,6 L22,10 L42,9 L62,17 L88,22" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="88" cy="22" r="3.5" fill="#059669" />
        </Box>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.4 }}>Tendência do LDL caindo exame a exame — <b style={{ color: 'text.primary' }}>com contexto</b>.</Typography>
      </Stack>
    </Stack>
  </Frame>
);

const SLIDES: { key: string; tag: string; caption: string; node: ReactNode }[] = [
  {
    key: 'dashboard', tag: 'Score + Idade Biológica',
    caption: 'Um número que resume sua saúde — e a idade que seu sangue conta (PhenoAge, 9 marcadores).',
    node: <SlideDashboard />,
  },
  {
    key: 'ruler', tag: 'Resumo com IA',
    caption: 'Cada marcador na régua: a faixa do SEU laboratório, seu valor e a meta do seu médico no mesmo gráfico.',
    node: <SlideRuler />,
  },
  {
    key: 'chat', tag: 'Chat com IA',
    caption: 'Pergunte o que quiser sobre o laudo — respostas com fonte e perguntas prontas pra consulta.',
    node: <SlideChat />,
  },
  {
    key: 'sports', tag: 'Saúde Esportiva · Premium',
    caption: 'Pra quem treina: marcadores por esporte, meta do médico e impacto de substâncias — sem palpite de dose.',
    node: <SlideSports />,
  },
  {
    key: 'doctor', tag: 'Portal do Médico',
    caption: 'Seu médico define metas clínicas e acompanha sua evolução pelo portal dele — grátis pra começar.',
    node: <SlideDoctor />,
  },
];

export const ProductPreview = () => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [i, setI] = useState(0);
  const scrollRaf = useRef(0);

  // Índice acompanha o scroll (swipe nativo / trackpad) — throttled por rAF.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onScroll = () => {
      cancelAnimationFrame(scrollRaf.current);
      scrollRaf.current = requestAnimationFrame(() => {
        const w = el.scrollWidth / SLIDES.length;
        const idx = Math.round(el.scrollLeft / w);
        setI((prev) => (idx >= 0 && idx < SLIDES.length && idx !== prev ? idx : prev));
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { el.removeEventListener('scroll', onScroll); cancelAnimationFrame(scrollRaf.current); };
  }, []);

  const go = (idx: number) => {
    const el = trackRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(SLIDES.length - 1, idx));
    const w = el.scrollWidth / SLIDES.length;
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: clamped * w, behavior: reduced ? 'auto' : 'smooth' });
    setI(clamped);
  };

  return (
    <Box sx={{ py: { xs: 6, md: 9 } }}>
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: { xs: 3, md: 4.5 } }}>
          <Typography sx={{ fontSize: 13, fontWeight: 800, color: INK, letterSpacing: '0.06em', textTransform: 'uppercase', mb: 1 }}>Veja o que você recebe</Typography>
          <Typography variant="h2" sx={{ fontSize: { xs: '1.7rem', md: '2.3rem' }, fontWeight: 800, color: 'text.primary', mb: 1, letterSpacing: '-0.02em' }}>
            O produto, <Box component="span" sx={{ ...SERIF_I, color: TEAL_DARK }}>por dentro.</Box>
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 17, maxWidth: 560, mx: 'auto' }}>
            As telas do app, uma a uma — interface real, valores de exemplo.
          </Typography>
        </Box>

        <Box
          role="region"
          aria-roledescription="carrossel"
          aria-label="Telas do Dr. Exame"
          sx={{ position: 'relative', maxWidth: 860, mx: 'auto', width: '100%' }}
        >
          {/* Faixa scroll-snap: swipe nativo no touch; setas no desktop. */}
          <Stack
            ref={trackRef}
            direction="row"
            sx={{
              display: 'flex', gap: 2.5, overflowX: 'auto', overflowY: 'hidden',
              scrollSnapType: 'x mandatory', scrollbarWidth: 'none',
              '&::-webkit-scrollbar': { display: 'none' },
              px: { xs: 0.25, sm: 4 }, // padding no desktop pra setas não cobrirem
              pb: 0.5,
            }}
          >
            {SLIDES.map((s, idx) => (
              <Box
                key={s.key}
                role="group"
                aria-roledescription="slide"
                aria-label={`${idx + 1} de ${SLIDES.length}: ${s.tag}`}
                sx={{
                  flex: { xs: '0 0 88%', sm: '0 0 100%' },
                  scrollSnapAlign: 'center',
                  display: 'flex', flexDirection: 'column', gap: 1.75,
                  minWidth: 0,
                }}
              >
                <Box sx={{ flex: 1, display: 'flex', minHeight: { xs: 260, sm: 290 } }}>{s.node}</Box>
                <Box sx={{ textAlign: 'center', px: { xs: 1, sm: 5 } }}>
                  <Chip size="small" label={s.tag} sx={{ height: 24, mb: 0.75, fontWeight: 800, fontSize: 12, bgcolor: 'rgba(32,178,170,.12)', color: TEAL_DARK }} />
                  <Typography sx={{ fontSize: { xs: 14, sm: 15 }, color: 'text.secondary', lineHeight: 1.55 }}>{s.caption}</Typography>
                </Box>
              </Box>
            ))}
          </Stack>

          {/* Setas (desktop) — 44px de alvo, fora do conteúdo. */}
          <IconButton
            aria-label="Slide anterior"
            onClick={() => go(i - 1)}
            disabled={i === 0}
            sx={{
              position: 'absolute', top: '38%', left: { xs: 2, sm: -8 }, zIndex: 2,
              bgcolor: 'background.paper', boxShadow: '0 6px 18px rgba(15,61,58,.18)',
              border: '1px solid', borderColor: 'divider',
              '&:hover': { bgcolor: 'action.hover' },
              display: i === 0 ? 'none' : 'inline-flex',
            }}
          >
            <ChevronLeftIcon />
          </IconButton>
          <IconButton
            aria-label="Próximo slide"
            onClick={() => go(i + 1)}
            disabled={i === SLIDES.length - 1}
            sx={{
              position: 'absolute', top: '38%', right: { xs: 2, sm: -8 }, zIndex: 2,
              bgcolor: 'background.paper', boxShadow: '0 6px 18px rgba(15,61,58,.18)',
              border: '1px solid', borderColor: 'divider',
              '&:hover': { bgcolor: 'action.hover' },
              display: i === SLIDES.length - 1 ? 'none' : 'inline-flex',
            }}
          >
            <ChevronRightIcon />
          </IconButton>

          {/* Dots — estado do slide, atalho de navegação. */}
          <Stack direction="row" spacing={1} justifyContent="center" useFlexGap sx={{ mt: 2.5 }}>
            {SLIDES.map((s, idx) => (
              <Box
                key={s.key}
                component="button"
                onClick={() => go(idx)}
                aria-label={`Ir para o slide ${idx + 1}: ${s.tag}`}
                aria-current={idx === i}
                sx={{
                  width: idx === i ? 26 : 9, height: 9, p: 0, border: 'none', cursor: 'pointer',
                  borderRadius: '999px',
                  bgcolor: idx === i ? TEAL : 'rgba(15,61,58,.22)',
                  transition: 'width .25s ease, background-color .25s ease',
                }}
              />
            ))}
          </Stack>
        </Box>
      </Container>
    </Box>
  );
};
