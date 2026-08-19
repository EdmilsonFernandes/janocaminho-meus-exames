import { Box, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { priorityOf, PRIORITY_META } from '../utils/alertPriority';
import { refLabel } from '../utils/medicalData';
import { fmtVal, unitSuffix } from '../utils/format';
import { RADIUS } from '../theme';
import { SeverityBadge } from './SeverityBadge';
import { ExplainButton } from './ExplainItem';
import { UnitLabel } from './UnitLabel';
import { ValueBar } from './ValueBar';

/**
 * ExamMarker — UMA linha de marcador alterado (primitiva compartilhada do design-system).
 *
 * Dedup do item que era copy-paste entre ValoresAlterados (paciente) e
 * DoctorValoresAlterados (médico) — ~85% do JSX era idêntico. Ambos consomem isto agora.
 *
 * Estrutura: acento esquerdo (borderLeft) + severidade (SeverityBadge, acessível) +
 * referência + valor grande + status em TEXTO (↑ Acima/↓ Abaixo/Conferir) + ValueBar.
 * Cor = sinal (borderLeft + valor + status), NUNCA cromagem de fundo pesada.
 *
 * `it` = examItem (name, nameCanonical, valueNumeric, valueText, refLow, refHigh, flag).
 * `suspect` = faixa de referência possivelmente em escala errada (mostra "conferir", sem barra).
 */
export const ExamMarker = ({ it, suspect }: { it: any; suspect: boolean }) => {
  const theme = useTheme();
  const p = priorityOf(it);
  const col = suspect ? theme.palette.text.secondary : PRIORITY_META[p].color;

  return (
    <Box sx={{ borderRadius: RADIUS.tile, bgcolor: alpha(col, 0.08), border: `1px solid ${alpha(col, 0.25)}`, px: 1.5, py: 1.25 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Box sx={{ flex: '1 1 55%', minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, flexWrap: 'wrap' }}>
            <Typography sx={{ fontWeight: 700, wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.2 }}>{it.name}</Typography>
            <SeverityBadge severity={suspect ? undefined : p} state={suspect ? 'check' : undefined} />
            <ExplainButton name={it.name} nameCanonical={it.nameCanonical} />
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{suspect ? '⚠️ Faixa possivelmente incorreta — confirme no documento. ' : ''}{refLabel(it)}</Typography>
        </Box>
        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
          <Box sx={{ lineHeight: 1.1 }}>
            <Typography component="span" sx={{ fontSize: '1.35rem', fontWeight: 800, color: col }}>{fmtVal(it)}</Typography>
            {unitSuffix(it) ? <Typography component="span" sx={{ ml: 0.5 }}><UnitLabel unit={unitSuffix(it)} fontSize="0.8rem" /></Typography> : null}
          </Box>
          {/* Status explícito em TEXTO (não só cor) — acessível + claro.
              NUMÉRICO PRIMEIRO: rótulo deriva do valor × faixa DESENHADA na barra ao lado
              (guard de escala via `suspect`); flag armazenado é só fallback. Texto e barra
              nunca se contradizem (mandato 2026-08-17). */}
          <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: suspect ? 'text.secondary' : col, lineHeight: 1.2 }}>
            {suspect ? 'Conferir faixa'
              : it.valueNumeric != null && it.refLow != null && it.refHigh != null
                ? (it.valueNumeric > it.refHigh ? '↑ Acima da ref.' : it.valueNumeric < it.refLow ? '↓ Abaixo da ref.' : 'Na referência')
                : it.flag === 'HIGH' ? '↑ Acima da ref.' : it.flag === 'LOW' ? '↓ Abaixo da ref.' : 'Na referência'}
          </Typography>
        </Box>
        {/* Barra visual só p/ faixa CONFIÁVEL (suspeito não ganha barra — desenho enganoso). */}
        {!suspect && it.valueNumeric != null && it.refLow != null && it.refHigh != null && (
          <Box sx={{ flexBasis: '100%' }}>
            <ValueBar value={it.valueNumeric} low={it.refLow} high={it.refHigh} />
          </Box>
        )}
      </Box>
    </Box>
  );
};
