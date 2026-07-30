import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { API_URL } from '../config';
import { matchLab, labColor, labInitial, labUnit, fetchLabs } from '../utils/labRegistry';

/** Badge de laboratório com identidade de marca:
 *  - se a marca tem LOGO (admin subiu): mostra a imagem (estilo app de saúde);
 *  - senão: círculo colorido com a inicial da marca;
 *  - casa o sourceLab cru (unidade, ex.: "SJC - Bacabal") com a MARCA (ex.: "Sabin").
 *  Dispara fetchLabs() no mount (1x/sessão, cache em memória) → re-render quando os labs do banco chegam. */
export const LabBadge = ({ raw, size = 'sm', showUnit = false }: { raw?: string | null; size?: 'sm' | 'md'; showUnit?: boolean }) => {
  // força re-render quando os labs do banco chegam (matchLab usa cache síncrono)
  const [, bump] = useState(0);
  useEffect(() => { let m = true; fetchLabs().then(() => { if (m) bump((n) => n + 1); }); return () => { m = false; }; }, []);
  if (!raw) return null;
  const brand = matchLab(raw);
  const color = labColor(raw);
  const name = brand?.name ?? raw;
  const unit = brand ? labUnit(raw) : null;
  const dim = size === 'md' ? 28 : 20;
  const fs = size === 'md' ? 12.5 : 10.5;
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, verticalAlign: 'middle' }} title={`Laboratório: ${name}${unit ? ` · unidade ${unit}` : ''}`}>
      {brand?.hasLogo && brand.id ? (
        <Box component="img" src={`${API_URL}/labs/${brand.id}/logo`} alt={name} sx={{ width: dim, height: dim, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, bgcolor: '#fff', boxShadow: `0 1px 3px ${color}33` }} />
      ) : (
        <Box sx={{ width: dim, height: dim, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', background: color, color: '#fff', fontWeight: 800, fontSize: fs * 0.85, lineHeight: 1, boxShadow: `0 1px 3px ${color}55` }}>{labInitial(name)}</Box>
      )}
      <Box sx={{ minWidth: 0 }}>
        <Typography component="span" sx={{ fontSize: fs, fontWeight: 800, color: brand ? color : 'text.primary', lineHeight: 1.1, whiteSpace: 'nowrap' }}>{name}</Typography>
        {showUnit && unit && <Typography component="span" sx={{ fontSize: fs * 0.85, color: 'text.secondary', ml: 0.5 }}>: {unit}</Typography>}
      </Box>
    </Box>
  );
};
