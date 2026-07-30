import { Box, Typography } from '@mui/material';
import { matchLab, labColor, labInitial, labUnit } from '../utils/labRegistry';

/** Badge de laboratório com identidade de marca: círculo colorido (inicial) + nome da rede.
 *  Casa o sourceLab cru (unidade/posto, ex.: "SJC - Bacabal") com a MARCA (ex.: "Sabin").
 *  `raw` = exam.sourceLab. `size` = 'sm' | 'md'. `showUnit` = mostra a unidade como secundário. */
export const LabBadge = ({ raw, size = 'sm', showUnit = false }: { raw?: string | null; size?: 'sm' | 'md'; showUnit?: boolean }) => {
  if (!raw) return null;
  const brand = matchLab(raw);
  const color = labColor(raw);
  const name = brand?.name ?? raw;
  const unit = brand ? labUnit(raw) : null;
  const initial = brand ? labInitial(brand.name) : labInitial(raw);
  const dim = size === 'md' ? 26 : 20;
  const fs = size === 'md' ? 12 : 10;
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, verticalAlign: 'middle' }} title={`Laboratório: ${name}${unit ? ` · unidade ${unit}` : ''}`}>
      <Box sx={{
        width: dim, height: dim, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
        background: color, color: '#fff', fontWeight: 800, fontSize: fs * 0.85, lineHeight: 1,
        boxShadow: `0 1px 3px ${color}55`,
      }}>{initial}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography component="span" sx={{ fontSize: fs, fontWeight: 800, color: brand ? color : 'text.primary', lineHeight: 1.1, whiteSpace: 'nowrap' }}>{name}</Typography>
        {showUnit && unit && <Typography component="span" sx={{ fontSize: fs * 0.85, color: 'text.secondary', ml: 0.5 }}>: {unit}</Typography>}
      </Box>
    </Box>
  );
};
