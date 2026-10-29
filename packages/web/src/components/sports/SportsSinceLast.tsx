// SportsSinceLast (blueprint AAS §4) — "o que mudou desde o exame anterior" +
// "o que levar ao médico" num card compacto. Delta é FATO do laudo (flag/régua do
// laboratório de origem) — sem limiar novo, sem score, sem causalidade: mudança
// depois de X não significa "por causa de X" (§5). CTAs: prep de consulta (aba
// existente) e relatório completo (share com o médico).
import { Box, Stack, Typography, Chip, Button, useTheme } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import MedicalInformationIcon from '@mui/icons-material/MedicalInformation';
import { AppCard } from '../AppCard';
import { RADIUS, tealText } from '../../theme';
import { plural } from '../../utils/format';
import type { EvolutionAnalyte } from './SportsMarkerCard';

const fmtDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—');
const fmtVal = (a: EvolutionAnalyte) => `${a.lastValue ?? '—'}${a.unit ? ` ${a.unit}` : ''}`;

/** Delta desde a coleta anterior — top N por recência. Sem pctChange/datas = fora. */
const changedSinceLast = (items: EvolutionAnalyte[], n: number): EvolutionAnalyte[] =>
  items
    .filter((a) => a.pctChange != null && a.firstValue != null && a.lastValue != null && a.firstDate && a.lastDate && a.firstDate !== a.lastDate)
    .sort((x, y) => new Date(y.lastDate!).getTime() - new Date(x.lastDate!).getTime())
    .slice(0, n);

export const SportsSinceLast = ({ items, abnormalCount, substancesCount, onPrep, onReport }: {
  items: EvolutionAnalyte[];
  abnormalCount: number;
  substancesCount: number;
  onPrep: () => void;
  onReport: () => void;
}) => {
  const theme = useTheme();
  const changed = changedSinceLast(items, 5);

  if (!items.length || !changed.length) return null; // 1º exame: sem anterior p/ comparar — honesto

  return (
    <AppCard sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: RADIUS.card, mb: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <TrendingUpIcon sx={{ fontSize: 19, color: (t) => tealText(t.palette.mode) }} />
        <Typography component="h2" sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: { xs: 15, sm: 16 }, flex: 1 }}>
          O que mudou desde o exame anterior
        </Typography>
      </Stack>
      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontSize: 12, mb: 1.5 }}>
        Comparação com a coleta anterior de cada marcador · régua do laboratório de origem.
      </Typography>

      <Stack spacing={0.75}>
        {changed.map((a) => {
          const up = a.direction === 'up';
          const neutral = a.direction === 'stable';
          const tone = a.abnormal ? '#d4a574' : theme.palette.success.main;
          return (
            <Stack key={a.nameCanonical} direction="row" alignItems="center" spacing={1} sx={{ minHeight: 40 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 700 }}>{a.nameCanonical}</Typography>
                <Typography noWrap sx={{ fontSize: 11.5, color: 'text.secondary' }}>
                  {fmtVal(a)} · {fmtDay(a.firstDate)} → {fmtDay(a.lastDate)}
                </Typography>
              </Box>
              <Chip
                size="small"
                icon={neutral ? undefined : up ? <TrendingUpIcon sx={{ fontSize: 14 }} /> : <TrendingDownIcon sx={{ fontSize: 14 }} />}
                label={neutral ? 'estável' : `${up ? '+' : ''}${a.pctChange!.toFixed(0)}%`}
                sx={{ height: 26, fontSize: 12.5, fontWeight: 800, flexShrink: 0, borderRadius: '8px', bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.04)'), color: neutral ? 'text.secondary' : tone, '& .MuiChip-icon': { color: neutral ? undefined : tone } }}
                variant="outlined"
              />
              <Chip
                size="small"
                label={a.abnormal ? 'fora da faixa' : 'na faixa'}
                sx={{ height: 26, fontSize: 12, fontWeight: 800, flexShrink: 0, borderRadius: '8px', bgcolor: (t) => (a.abnormal ? 'rgba(212,165,116,.16)' : 'rgba(25,135,84,.12)'), color: a.abnormal ? '#d4a574' : theme.palette.success.main }}
              />
            </Stack>
          );
        })}
      </Stack>

      {/* LEVAR AO MÉDICO — recap factual + CTAs do que JÁ existe (prep + relatório share) */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        alignItems={{ xs: 'stretch', sm: 'center' }}
        sx={{ mt: 2, pt: 1.75, borderTop: '1px solid', borderColor: 'divider' }}
      >
        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ flex: 1, minWidth: 0 }}>
          <MedicalInformationIcon sx={{ fontSize: 17, color: '#d4a574' }} />
          <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
            {abnormalCount > 0
              ? `${plural(abnormalCount, 'valor')} fora da faixa${substancesCount > 0 ? ` · ${plural(substancesCount, 'substância declarada', 'substâncias declaradas')}` : ''} — perguntas prontas pro médico`
              : 'Tudo dentro da faixa' + (substancesCount > 0 ? ` · ${plural(substancesCount, 'substância declarada', 'substâncias declaradas')}` : '') + ' — perguntas prontas pro médico'}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" onClick={onReport} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, fontSize: 12.5 }}>
            Relatório
          </Button>
          <Button size="small" variant="contained" onClick={onPrep} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, fontSize: 12.5 }}>
            Preparar consulta
          </Button>
        </Stack>
      </Stack>
      <Typography sx={{ fontSize: 11, color: 'text.secondary', fontStyle: 'italic', mt: 1 }}>
        Mudança após começar algo não prova causa — o contexto completo é avaliação médica.
      </Typography>
    </AppCard>
  );
};
