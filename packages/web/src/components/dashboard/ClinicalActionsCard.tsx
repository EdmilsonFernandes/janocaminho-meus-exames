import { useState } from 'react';
import { Stack, Typography, Box, Chip, Collapse } from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { AppCard } from '../AppCard';

/**
 * Perguntas pra levar ao médico — cumprimento da promessa da landing ("Avaliação de
 * Risco Clínico / ações sugeridas") SEM cruzar a fronteira SaMD: são PERGUNTAS graduadas
 * com fonte de diretriz BR, nunca prescrição/diagnóstico. Zero IA (determinístico).
 */

export interface ClinicalActionView {
  domain: string;
  emoji: string;
  title: string;
  question: string;
  rationale: string;
  source: string;
  timeframe: 'agora' | 'semanas' | 'rotina';
}

const TF_META: Record<ClinicalActionView['timeframe'], { label: string; color: 'error' | 'warning' | 'default' }> = {
  agora: { label: 'Conversar logo', color: 'error' },
  semanas: { label: 'Próximas semanas', color: 'warning' },
  rotina: { label: 'Próxima consulta', color: 'default' },
};

export const ClinicalActionsCard = ({ actions, loaded }: { actions: ClinicalActionView[] | null; loaded: boolean }) => {
  const [open, setOpen] = useState(false);
  // Normalização defensiva (padrão ClinicalIndicesCard): shape cru jamais vaza pro render.
  const list = (Array.isArray(actions) ? actions : []).filter(
    (a) => a && typeof a === 'object' && typeof a.question === 'string' && a.question.length > 0,
  );
  if (loaded && list.length === 0) return null; // nada a perguntar → sem card (empty state já existe)

  const nUrgent = list.filter((a) => a.timeframe === 'agora').length;

  return (
    <AppCard>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        onClick={() => setOpen((o) => !o)}
        sx={{ cursor: 'pointer', userSelect: 'none', py: 0.25, '&:focus-visible': { outline: '2px solid rgba(32,178,170,.7)', outlineOffset: 4 }, borderRadius: '8px' }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((o) => !o); } }}
        aria-expanded={open}
      >
        <Typography sx={{ fontWeight: 800, fontSize: 15, flex: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          💬 Perguntas pro médico
          <Box component="span" sx={{ fontWeight: 700, fontSize: 12.5, color: 'text.secondary' }}>
            ({loaded ? `${list.length} sugerida${list.length === 1 ? '' : 's'}` : '…'})
          </Box>
        </Typography>
        {nUrgent > 0 && <Chip size="small" color="error" label={`${nUrgent} prioridade`} sx={{ height: 20, fontSize: 11, fontWeight: 800 }} />}
        <KeyboardArrowDownIcon sx={{ color: 'text.secondary', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </Stack>

      <Collapse in={open} timeout="auto" unmountOnExit>
        <Stack spacing={1.25} sx={{ pt: 1.25 }}>
          {list.map((a, i) => (
            <Box key={`${a.domain}-${i}`} sx={{ p: 1.5, borderRadius: '12px', bgcolor: 'rgba(32,178,170,.06)', border: '1px solid rgba(32,178,170,.18)' }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                <Typography sx={{ fontWeight: 800, fontSize: 13.5, flex: 1, minWidth: 140 }}>{a.emoji} {a.title}</Typography>
                <Chip size="small" label={TF_META[a.timeframe]?.label ?? a.timeframe} color={TF_META[a.timeframe]?.color ?? 'default'} variant={a.timeframe === 'rotina' ? 'outlined' : 'filled'} sx={{ height: 20, fontSize: 10.5, fontWeight: 700 }} />
              </Stack>
              <Typography sx={{ fontSize: 13, lineHeight: 1.55, mt: 0.75, fontStyle: 'italic', color: 'text.primary' }}>
                “{a.question}”
              </Typography>
              <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5, lineHeight: 1.4 }}>
                Baseado em: {a.rationale}
              </Typography>
              <Typography variant="caption" sx={{ display: 'block', color: 'text.disabled', mt: 0.25 }}>
                📚 {a.source}
              </Typography>
            </Box>
          ))}
        </Stack>
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1.25, lineHeight: 1.5 }}>
          Conteúdo educativo gerado automaticamente a partir dos seus exames (sem IA) — perguntas pra facilitar a consulta. <b>Não substitui avaliação médica, diagnóstico ou tratamento.</b>
        </Typography>
      </Collapse>
    </AppCard>
  );
};
