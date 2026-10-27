import React, { useEffect, useState } from 'react';
import { Box, Button, Chip, Container, Stack, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ScienceIcon from '@mui/icons-material/Science';
import ShieldIcon from '@mui/icons-material/Shield';
import { useNavigate } from 'react-router-dom';
import { DrExame } from '../DrExame';

/**
 * Landing esportiva ×3 (blueprint AAS §8, 2026-10-26) — variantes A/B/C por query:
 *   A (default, sem ?v=)  → ângulo CARGA
 *   B (?v=b)              → ângulo HISTÓRICO
 *   C (?v=c)              → ângulo CONVERSA MÉDICA
 * UTM first-party: ?utm_landing=a|b|c persiste em localStorage('utm_landing').
 * NENHUM dado de saúde em analytics (regra §10) — só o id da variante.
 *
 * Copy: EXATAMENTE a do blueprint §8. Restrições: linguagem vedada do blueprint
 * (lista exata no lint do CI) + zero marca/promessa de resultado; só anunciar o que EXISTE hoje.
 */

const TEAL = '#20b2aa';
const TEAL_DARK = '#178f89';
const INK = '#0f5f5a';
const COBRE = '#b88a54';
const SERIF_I = { fontFamily: "'Instrument Serif', Georgia, serif", fontStyle: 'italic', fontWeight: 400 } as const;

export type SportsLandingVariantId = 'a' | 'b' | 'c';

/** Lê query da rota: HashRouter mantém o search DENTRO do hash (#/saude-esportiva?v=b);
 *  o shim de cold-start (App.tsx) preserva o search real ao redirecionar p/ hash.
 *  Merge dos dois cobre deep-link direto (?v=b) e navegação SPA (#/...?v=b). */
function readMergedQuery(): URLSearchParams {
  const merged = new URLSearchParams();
  try {
    new URLSearchParams(window.location.search).forEach((v, k) => merged.set(k, v));
    const hash = window.location.hash;
    const qi = hash.indexOf('?');
    if (qi >= 0) new URLSearchParams(hash.slice(qi + 1)).forEach((v, k) => merged.set(k, v));
  } catch { /* URLSearchParams sempre disponível; defesa extra */ }
  return merged;
}

function resolveVariant(v: string | null | undefined): SportsLandingVariantId {
  const s = (v ?? '').toLowerCase();
  return s === 'b' || s === 'c' ? s : 'a';
}

/** Variante ativa + captura UTM first-party. Reage a hashchange (troca de URL sem remontar). */
export const useSportsLandingVariant = (): SportsLandingVariantId => {
  const [variant, setVariant] = useState<SportsLandingVariantId>(() => resolveVariant(readMergedQuery().get('v')));

  useEffect(() => {
    const apply = () => {
      const params = readMergedQuery();
      setVariant(resolveVariant(params.get('v')));
      // UTM first-party (§10): só o id da variante — sem dado de saúde.
      // Só persiste quando o param vem EXPLÍCITO na URL — navegação interna
      // (hashchange sem utm) NÃO sobrescreve a atribuição anterior.
      const utmRaw = (params.get('utm_landing') ?? '').toLowerCase();
      if (utmRaw === 'a' || utmRaw === 'b' || utmRaw === 'c') {
        try { localStorage.setItem('utm_landing', utmRaw); } catch { /* private mode — ok */ }
      }
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, []);

  return variant;
};

type VariantConfig = {
  chip: string;
  titlePrefix: string;
  titleAccent: string;
  sub: string;
  benefits: [string, string, string];
  primaryCta: string;
  secondaryCta: string;
  secondaryGoesToSimulator: boolean;
  visual: React.ReactNode;
};

/* ─────────────── Visuais estáticos (mock leve, dados fictícios do próprio simulador) ─────────────── */

const VisualTimelineA: React.FC = () => (
  <Stack spacing={1.5}>
    <Box sx={{ p: 2, borderRadius: '16px', border: '1px solid rgba(15,95,90,0.12)', bgcolor: '#ffffff', boxShadow: '0 12px 36px rgba(15,95,90,0.10)' }}>
      <Typography sx={{ fontSize: 11, fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1.5 }}>
        Exames × janelas de uso
      </Typography>
      <Stack spacing={1}>
        {[
          { name: 'Hemograma completo', date: '05/08' },
          { name: 'Testosterona total', date: '18/08' },
          { name: 'Hemograma completo', date: '12/11' },
        ].map((row, i) => (
          <Stack key={i} direction="row" spacing={1.25} alignItems="center">
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: TEAL_DARK, flexShrink: 0 }} />
            <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: 'text.primary', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {row.name}
            </Typography>
            <Typography sx={{ fontSize: 11, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{row.date}</Typography>
          </Stack>
        ))}
        {/* janela de uso relatada — barra neutra entre exames */}
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Box sx={{ width: 8, height: 8, borderRadius: 2, bgcolor: COBRE, flexShrink: 0 }} />
          <Box sx={{ flex: 1, height: 6, borderRadius: '999px', background: `linear-gradient(90deg, ${COBRE}, rgba(184,138,84,0.25))` }} />
        </Stack>
        <Typography sx={{ fontSize: 10.5, color: 'text.secondary', textAlign: 'center' }}>uso relatado · declarado por você</Typography>
      </Stack>
    </Box>
    <Box sx={{ p: 2, borderRadius: '16px', border: '1px solid rgba(13,148,136,0.25)', bgcolor: 'rgba(13,148,136,0.06)' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <AutoAwesomeIcon sx={{ fontSize: 16, color: TEAL_DARK }} />
        <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: TEAL_DARK }}>O que levar pro médico</Typography>
      </Stack>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.55 }}>
        Perguntas prontas + histórico compartilhável — gerado a partir dos seus exames.
      </Typography>
    </Box>
  </Stack>
);

const VisualEvolutionB: React.FC = () => (
  <Stack spacing={1.5}>
    <Box sx={{ p: 2, borderRadius: '16px', border: '1px solid rgba(15,95,90,0.12)', bgcolor: '#ffffff', boxShadow: '0 12px 36px rgba(15,95,90,0.10)' }}>
      <Typography sx={{ fontSize: 11, fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1.5 }}>
        Evolução · Ferritina (ng/mL)
      </Typography>
      {/* linha do tempo leve: 4 pontos fictícios com tendência */}
      <Box sx={{ position: 'relative', height: 64, mb: 1 }}>
        <svg viewBox="0 0 260 64" width="100%" height="64" role="img" aria-label="Linha do tempo de marcadores (exemplo)">
          <polyline points="12,50 86,40 160,26 234,12" fill="none" stroke={TEAL} strokeWidth="2.5" strokeLinecap="round" />
          {[[12, 50], [86, 40], [160, 26], [234, 12]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="4" fill="#fff" stroke={TEAL_DARK} strokeWidth="2.5" />
          ))}
        </svg>
      </Box>
      <Stack direction="row" justifyContent="space-between">
        {['mar', 'mai', 'jul', 'set'].map((m) => (
          <Typography key={m} sx={{ fontSize: 10.5, color: 'text.secondary' }}>{m}</Typography>
        ))}
      </Stack>
    </Box>
    <Box sx={{ p: 2, borderRadius: '16px', border: '1px solid rgba(13,148,136,0.25)', bgcolor: 'rgba(13,148,136,0.06)', display: 'flex', gap: 1.5, alignItems: 'center' }}>
      <DrExame size={36} sx={{ borderRadius: '16%', flexShrink: 0 }} />
      <Box>
        <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: TEAL_DARK, mb: 0.25 }}>Resumo do Dr. Exame</Typography>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.5 }}>O que mudou desde o último exame — compartilhável antes da consulta.</Typography>
      </Box>
    </Box>
  </Stack>
);

const VisualSplitC: React.FC = () => (
  <Stack spacing={1.5}>
    <Box sx={{ p: 2, borderRadius: '16px', border: '1px solid rgba(15,95,90,0.12)', bgcolor: '#ffffff', boxShadow: '0 12px 36px rgba(15,95,90,0.10)' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <DrExame size={28} sx={{ borderRadius: '16%' }} />
        <Typography sx={{ fontSize: 12, fontWeight: 800, color: 'text.primary' }}>Seu app · exames + uso relatado</Typography>
      </Stack>
      <Stack spacing={0.75}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Typography sx={{ fontSize: 12, color: 'text.primary' }}>Testosterona total · 18/08</Typography>
          <Box sx={{ px: 1, py: 0.25, borderRadius: '6px', bgcolor: 'rgba(184,138,84,0.14)', color: COBRE, fontSize: 9.5, fontWeight: 800, whiteSpace: 'nowrap' }}>
            DECLARADO — NÃO VERIFICADO
          </Box>
        </Stack>
        <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Hematócrito · 12/11 · zona de atenção contextualizada</Typography>
      </Stack>
    </Box>
    <Box sx={{ p: 2, borderRadius: '16px', border: '1px solid rgba(184,138,84,0.3)', bgcolor: 'rgba(212,165,116,0.07)' }}>
      <Typography sx={{ fontSize: 12, fontWeight: 800, color: INK, mb: 1 }}>Portal do seu médico</Typography>
      <Stack spacing={0.75}>
        <Typography sx={{ fontSize: 11.5, color: 'text.secondary', lineHeight: 1.5 }}>
          Meta clínica: <strong style={{ color: INK }}>faixa de testosterona definida pelo seu médico</strong>
        </Typography>
        <Typography sx={{ fontSize: 11.5, color: 'text.secondary', lineHeight: 1.5 }}>Brief completo da consulta — teleconsulta ou presencial</Typography>
      </Stack>
    </Box>
  </Stack>
);

/* ─────────────────────────────────────── Config ×3 (copy EXATA do blueprint §8) ─────────────────────────────────────── */

const scrollToInterview = () => {
  document.getElementById('simulador')?.scrollIntoView({ behavior: 'smooth' });
};

const VARIANTS: Record<SportsLandingVariantId, VariantConfig> = {
  a: {
    chip: 'Para quem acompanha carga',
    titlePrefix: 'Você acompanha suas cargas. ',
    titleAccent: 'E seus exames?',
    sub: 'O Dr. Exame organiza seus exames e o que você usa — declarado por você, lido com contexto — para a próxima conversa com seu médico render mais.',
    benefits: [
      'Importe o PDF do laboratório e veja o que mudou desde o último',
      'Registre suplementos e medicamentos (inclusive hormonais) — você decide o que declara',
      'Saia da consulta com perguntas prontas e histórico compartilhável',
    ],
    primaryCta: 'Criar minha conta grátis',
    secondaryCta: 'Ver como funciona',
    secondaryGoesToSimulator: true,
    visual: <VisualTimelineA />,
  },
  b: {
    chip: 'Consistência também no exame',
    titlePrefix: 'Seu histórico de exames também ',
    titleAccent: 'faz parte do treino.',
    sub: 'Consistência constrói músculo — e exame. Centralize laudos, acompanhe marcadores ao longo do tempo e chegue à consulta com o histórico completo.',
    benefits: [
      'Todos os laudos num só lugar, com o PDF original sempre à mão',
      'Linha do tempo de marcadores mostrando o que mudou',
      'Resumo compartilhável antes da consulta ou teleconsulta',
    ],
    primaryCta: 'Começar agora — grátis',
    secondaryCta: 'Ver exemplo real',
    secondaryGoesToSimulator: true, // modo exemplo é interno (pós-login) — âncora pública = simulador
    visual: <VisualEvolutionB />,
  },
  c: {
    chip: 'Você + seu médico',
    titlePrefix: 'Seus exames, seu médico, ',
    titleAccent: 'na mesma página.',
    sub: 'Faz TRT ou outro tratamento hormonal? O Dr. Exame organiza exames e uso relatado — com metas definidas pelo SEU médico — para a consulta ser sobre você, não sobre papéis.',
    benefits: [
      'Contexto hormonal nos seus marcadores (educativo, nunca diagnóstico)',
      'Metas clínicas definidas pelo seu médico (ex.: faixa de testosterona)',
      'Brief completo para teleconsulta ou presencial',
    ],
    primaryCta: 'Organizar meus exames',
    secondaryCta: 'Indicar ao meu médico',
    secondaryGoesToSimulator: false, // → /para-medicos (funil médico existente)
    visual: <VisualSplitC />,
  },
};

/* ─────────────────────────────────────── HERO (substitui o hero da SportsLandingPage) ─────────────────────────────────────── */

export const SportsLandingHero: React.FC<{ variant: SportsLandingVariantId }> = ({ variant }) => {
  const navigate = useNavigate();
  const cfg = VARIANTS[variant];

  return (
    <Box sx={{
      position: 'relative', overflow: 'hidden',
      background: 'linear-gradient(180deg, rgba(240,250,249,0.8) 0%, #f8fafc 100%)',
      pt: { xs: 6, md: 10 }, pb: { xs: 7, md: 10 },
      borderBottom: '1px solid rgba(15,95,90,0.08)'
    }}>
      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.15fr) minmax(0, 0.85fr)' },
          gap: { xs: 5, md: 7 },
          alignItems: 'center',
          textAlign: { xs: 'center', md: 'left' },
        }}>
          {/* Coluna texto */}
          <Box>
            <Chip
              label={cfg.chip}
              sx={{
                bgcolor: 'rgba(13,148,136,0.12)',
                color: TEAL_DARK,
                fontWeight: 800,
                fontSize: 13,
                mb: 2.5,
                pl: 1,
              }}
            />
            <Typography variant="h1" sx={{
              fontSize: { xs: '2.1rem', sm: '3rem', md: '3.3rem' },
              fontWeight: 900,
              color: 'text.primary',
              letterSpacing: '-0.025em',
              lineHeight: 1.15,
              mb: 2.5
            }}>
              {cfg.titlePrefix}
              <Box component="span" sx={{ ...SERIF_I, color: TEAL_DARK }}>{cfg.titleAccent}</Box>
            </Typography>
            <Typography sx={{
              fontSize: { xs: 16, sm: 18 },
              color: 'text.secondary',
              maxWidth: 620,
              mx: { xs: 'auto', md: 0 },
              lineHeight: 1.6,
              mb: 3.5
            }}>
              {cfg.sub}
            </Typography>

            {/* 3 benefícios */}
            <Stack spacing={1.25} sx={{ mb: 4, maxWidth: 620, mx: { xs: 'auto', md: 0 } }}>
              {cfg.benefits.map((b, i) => (
                <Stack key={i} direction="row" spacing={1.25} alignItems="flex-start" sx={{ textAlign: 'left' }}>
                  <CheckCircleIcon sx={{ fontSize: 20, color: TEAL_DARK, flexShrink: 0, mt: 0.15 }} />
                  <Typography sx={{ fontSize: 15, color: 'text.primary', lineHeight: 1.5 }}>{b}</Typography>
                </Stack>
              ))}
            </Stack>

            {/* CTAs */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent={{ xs: 'center', md: 'flex-start' }} sx={{ mb: 4 }}>
              <Button
                variant="contained"
                size="large"
                onClick={() => navigate('/registrar')}
                endIcon={<ArrowForwardIcon />}
                sx={{
                  bgcolor: TEAL_DARK,
                  borderRadius: '999px',
                  px: 4, py: 1.6,
                  fontSize: 16, fontWeight: 800,
                  textTransform: 'none',
                  boxShadow: '0 8px 24px rgba(23,143,137,0.3)',
                  '&:hover': { bgcolor: INK }
                }}
              >
                {cfg.primaryCta}
              </Button>
              <Button
                variant="outlined"
                size="large"
                onClick={() => {
                  if (cfg.secondaryGoesToSimulator) scrollToInterview();
                  else navigate('/para-medicos');
                }}
                sx={{
                  borderRadius: '999px',
                  px: 3.5, py: 1.6,
                  fontSize: 15, fontWeight: 700,
                  borderColor: 'rgba(15,95,90,0.25)',
                  color: INK,
                  textTransform: 'none'
                }}
              >
                {cfg.secondaryCta}
              </Button>
            </Stack>

            {/* Selos de confiança (inalterados) */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.5} justifyContent={{ xs: 'center', md: 'flex-start' }} alignItems="center" sx={{ fontSize: 13, color: 'text.secondary' }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <CheckCircleIcon sx={{ fontSize: 18, color: '#10b981' }} />
                <span>Sem cartão de crédito no cadastro</span>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <ShieldIcon sx={{ fontSize: 18, color: TEAL_DARK }} />
                <span>Privacidade LGPD · Zero julgamento clínico</span>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ display: { xs: 'none', md: 'flex' } }}>
                <ScienceIcon sx={{ fontSize: 18, color: '#6366f1' }} />
                <span>Baseado em diretrizes SBEM 2026 e Endocrine Society</span>
              </Stack>
            </Stack>
          </Box>

          {/* Coluna visual: robô mascote + mock da variante */}
          <Stack spacing={2.5} alignItems="center" sx={{ justifySelf: { xs: 'center', md: 'end' }, width: '100%', maxWidth: 380, mx: 'auto' }}>
            <Box sx={{ position: 'relative', lineHeight: 0 }}>
              <Box sx={{
                position: 'absolute', inset: -14, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(32,178,170,0.18) 0%, rgba(32,178,170,0) 70%)'
              }} />
              <DrExame size={88} sx={{ borderRadius: '22%', position: 'relative', boxShadow: '0 10px 30px rgba(15,95,90,0.18)' }} />
            </Box>
            {cfg.visual}
          </Stack>
        </Box>
      </Container>
    </Box>
  );
};
