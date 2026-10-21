import { useEffect, useRef, useState } from 'react';
import { Stack, Typography, Box, Chip, Button, Tabs, Tab } from '@mui/material';
import { alpha } from '@mui/material/styles';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { AppCard } from '../AppCard';
import { fmtNum } from '../../utils/format';
import { tealText, dangerText } from '../../theme';
import { API_URL, token } from '../../config';
import { SinceExamCard, type SinceExamData } from './SinceExamCard';

/**
 * Marker — recorte mínimo de um marcador vindo do health-summary (topAttention / improving).
 * Mantido aqui (e exportado) pra Dashboard V2 e Meus Exames compartilharem o mesmo shape.
 */
export interface Marker {
  name: string;
  nameCanonical?: string; // chave de agrupamento (guards de dedupe) — opcional: fontes antigas só trazem name
  unit?: string;
  latest?: { valueNumeric?: number | null };
  refHigh?: number | null;
  refLow?: number | null;
  flag?: string;
}

const flagDir = (m: Marker, isImproved = false) => {
  const v = m.latest?.valueNumeric;
  if (v != null && m.refHigh != null && v > m.refHigh) return '↑';
  if (v != null && m.refLow != null && v < m.refLow) return '↓';
  if (isImproved) return '↓';
  return m.flag === 'HIGH' ? '↑' : m.flag === 'LOW' ? '↓' : '•';
};
const fmtMarker = (m: Marker) =>
  m.latest?.valueNumeric != null ? `${fmtNum(m.latest.valueNumeric)}${m.unit ? ' ' + m.unit : ''}` : '—';

/**
 * ChangesSinceExam — "O que mudou": UM card com 2 abas (Exames | Hábitos).
 *
 * Merge (fix F3): antes eram dois cards irmãos contando a mesma história — este
 * ("o que mudou nos seus exames") e o SinceExamCard ("seu dia a dia desde {mês}").
 * Agora a aba Exames traz o que piorou (topAttention) e o que melhorou; a aba
 * Hábitos (conteúdo do antigo SinceExamCard) traz atividade/peso/pressão ENTRE
 * exames — o usuário vê "eu me exercitei mais E meu LDL caiu" lado a lado.
 *
 * Primitiva compartilhada (Dashboard V2 + Meus Exames). Dados vêm do `/patients/:id/health-summary`
 * (campos `topAttention` / `improving`) e do `/measurements/since-exam` (hábitos) — NÃO há
 * cálculo clínico aqui; só apresentação. Sem `lastExamAt` (Meus Exames) a aba Hábitos não existe.
 */
export const ChangesSinceExam = ({
  worsened,
  improved,
  onView,
  loaded,
  lastExamAt,
  title = 'O que mudou',
  ctaLabel = 'Ver análise completa',
}: {
  worsened: Marker[];
  improved: Marker[];
  onView: () => void;
  loaded: boolean;
  /** Data do último exame — habilita a aba Hábitos (fetch /measurements/since-exam). */
  lastExamAt?: string | null;
  title?: string;
  ctaLabel?: string;
}) => {
  const hasExamChanges = worsened.length > 0 || improved.length > 0;
  const showTabs = !!lastExamAt;

  // ── Aba Hábitos: mesmo fetch do antigo SinceExamCard (hoisted pro card-pai) ──
  const [habits, setHabits] = useState<SinceExamData | null>(null);
  const [habitsLoading, setHabitsLoading] = useState(!!lastExamAt);
  useEffect(() => {
    if (!lastExamAt) { setHabits(null); setHabitsLoading(false); return; }
    setHabitsLoading(true);
    fetch(`${API_URL}/measurements/since-exam`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setHabits(d))
      .catch(() => setHabits(null))
      .finally(() => setHabitsLoading(false));
  }, [lastExamAt]);
  const hasHabits = !!habits?.hasData && !!habits.habitChanges?.length;

  // Aba inicial: Exames (primária do produto). Se os exames carregarem sem nenhuma
  // mudança e houver hábitos, começa direto na aba que tem conteúdo (1x, sem override
  // de escolha do usuário — guarda por ref).
  const [tab, setTab] = useState<'exames' | 'habitos'>('exames');
  const tabAutoPicked = useRef(false);
  useEffect(() => {
    if (tabAutoPicked.current || !loaded) return;
    tabAutoPicked.current = true;
    if (!hasExamChanges && hasHabits) setTab('habitos');
  }, [loaded, hasExamChanges, hasHabits]);

  // Visibilidade (herdada do card original): nada de exames E nada de hábitos → card não existe.
  if (loaded && !hasExamChanges && !habitsLoading && !hasHabits) return null;

  const worsenedNames = new Set(worsened.map((m) => (m.nameCanonical || m.name).toUpperCase()));
  const improvedUnique = improved.filter((m) => !worsenedNames.has((m.nameCanonical || m.name).toUpperCase()));

  const examsTab = (
    <>
      <Stack direction="row" spacing={1.5} sx={{ mt: 1, mb: 1.5, flexWrap: 'wrap', rowGap: 0.5 }}>
        {worsened.length > 0 && (
          <Chip
            size="small"
            icon={<TrendingUpIcon />}
            label={`${worsened.length} ${worsened.length === 1 ? 'piorou' : 'pioraram'}`}
            sx={{
              bgcolor: alpha('#dc2626', 0.12),
              color: '#b91c1c',
              fontWeight: 800,
              borderRadius: '8px',
              animation: 'dxSpringChip 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
              '@keyframes dxSpringChip': {
                '0%': { transform: 'scale(0.8)', opacity: 0 },
                '100%': { transform: 'scale(1)', opacity: 1 },
              },
            }}
          />
        )}
        {improvedUnique.length > 0 && (
          <Chip
            size="small"
            icon={<TrendingDownIcon />}
            label={`${improvedUnique.length} ${improvedUnique.length === 1 ? 'melhorou' : 'melhoraram'}`}
            sx={{
              bgcolor: alpha('#047857', 0.12),
              color: '#047857',
              fontWeight: 800,
              borderRadius: '8px',
              animation: 'dxSpringChip 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both',
            }}
          />
        )}
        {!loaded && worsened.length === 0 && improved.length === 0 && (
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Carregando…</Typography>
        )}
      </Stack>
      <Stack spacing={1.2}>
        {worsened.slice(0, 3).map((m, i) => (
          <Box
            key={`w${i}`}
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              p: '6px 10px',
              borderRadius: '10px',
              bgcolor: alpha('#dc2626', 0.04),
              borderLeft: '3px solid #dc2626',
              animation: `dxMarkerIn .3s ease ${i * 0.06}s both`,
              '@keyframes dxMarkerIn': { from: { opacity: 0, transform: 'translateX(-8px)' }, to: { opacity: 1, transform: 'none' } },
            }}
          >
            <Typography sx={{ fontSize: 13.5, color: 'text.primary', fontWeight: 600 }}>
              <Box component="span" sx={{ color: (t) => dangerText(t.palette.mode), mr: 0.75, fontWeight: 800 }}>{flagDir(m, false)}</Box>
              {m.name}
            </Typography>
            <Typography sx={{ fontSize: 13, color: 'text.secondary', fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', ml: 1 }}>{fmtMarker(m)}</Typography>
          </Box>
        ))}

        {worsened.length > 0 && improvedUnique.length > 0 && (
          <Box sx={{ borderBottom: '1px dashed', borderColor: 'divider', my: 0.5 }} />
        )}

        {improvedUnique.slice(0, 3).map((m, i) => (
          <Box
            key={`i${i}`}
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              p: '6px 10px',
              borderRadius: '10px',
              bgcolor: alpha('#047857', 0.04),
              borderLeft: '3px solid #047857',
              animation: `dxMarkerIn .3s ease ${(worsened.length + i) * 0.06}s both`,
            }}
          >
            <Typography sx={{ fontSize: 13.5, color: 'text.primary', fontWeight: 600 }}>
              <Box component="span" sx={{ color: '#047857', mr: 0.75, fontWeight: 800 }}>{flagDir(m, true)}</Box>
              {m.name}
            </Typography>
            <Typography sx={{ fontSize: 13, color: 'text.secondary', fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', ml: 1 }}>{fmtMarker(m)}</Typography>
          </Box>
        ))}

        {loaded && !hasExamChanges && (
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
            Nenhuma mudança nos marcadores desde o último exame.
          </Typography>
        )}
      </Stack>
    </>
  );

  const habitsTab = habitsLoading ? (
    <Typography sx={{ fontSize: 13, color: 'text.secondary', py: 0.5 }}>Carregando…</Typography>
  ) : hasHabits ? (
    <SinceExamCard data={habits} />
  ) : (
    <Typography sx={{ fontSize: 13, color: 'text.secondary', py: 0.5 }}>
      Sem mudanças de hábitos (atividade, peso, pressão) no período.
    </Typography>
  );

  return (
    <AppCard kind="default" sx={{ p: { xs: 2, md: 2.5 }, height: '100%' }}>
      <Typography component="h2" sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</Typography>
      {showTabs ? (
        <Tabs
          value={tab}
          onChange={(_, v: 'exames' | 'habitos') => setTab(v)}
          variant="fullWidth"
          sx={{
            mt: 0.5, minHeight: 40,
            '& .MuiTab-root': { minHeight: 40, fontSize: 13, fontWeight: 700, textTransform: 'none', borderRadius: '10px' },
          }}
        >
          <Tab value="exames" label="Exames" disableRipple />
          <Tab value="habitos" label="Hábitos" disableRipple />
        </Tabs>
      ) : null}
      {tab === 'exames' || !showTabs ? examsTab : habitsTab}
      <Box sx={{ mt: 1.5 }}>
        <Button variant="text" onClick={onView} endIcon={<ArrowForwardIcon />} sx={{ p: 0, px: 0.5, minHeight: 44, alignSelf: 'flex-start', textTransform: 'none', fontWeight: 800, color: (th) => tealText(th.palette.mode), '&:hover': { bgcolor: 'rgba(32,178,170,.08)' } }}>{ctaLabel}</Button>
      </Box>
    </AppCard>
  );
};
