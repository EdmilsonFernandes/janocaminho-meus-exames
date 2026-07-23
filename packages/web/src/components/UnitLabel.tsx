import { useState } from 'react';
import { Box, Popover, IconButton, Typography } from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { explainUnit } from '../data/unitDictionary';

/**
 * UnitLabel — exibe a unidade de medida (mg/dL, µUI/mL...) com um "?" tocável que abre um
 * balão explicando o que ela significa em português simples (determinístico, sem IA).
 *
 * Se a unidade não tiver explicação no dicionário, mostra só o texto (sem "?") — nada quebra.
 * Substitui o `{unit}` cru nas telas: <UnitLabel unit={it.unit} />.
 */
export const UnitLabel = ({ unit, fontSize = '0.85rem' }: { unit: string | null | undefined; fontSize?: string | number }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (!unit) return null;
  const info = explainUnit(unit);
  if (!info) return <Typography component="span" sx={{ color: 'text.secondary', fontSize }}>{unit}</Typography>;
  return (
    <>
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
        <Typography component="span" sx={{ color: 'text.secondary', fontSize }}>{unit}</Typography>
        <IconButton
          size="small"
          onClick={(e) => { e.stopPropagation(); setAnchor(e.currentTarget); }}
          sx={{ p: 0.25, color: 'primary.main' }}
          aria-label={`O que significa ${unit}?`}
          title={`O que significa ${unit}?`}
        >
          <HelpOutlineIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        slotProps={{ paper: { sx: { maxWidth: 330, borderRadius: 3, mt: 0.5 } } }}
      >
        <Box sx={{ p: 2, maxWidth: 330 }}>
          <Typography sx={{ fontWeight: 800, color: 'primary.dark', fontSize: '1.05rem' }}>{info.nome}</Typography>
          <Typography variant="body2" sx={{ mt: 0.5, lineHeight: 1.5 }}>{info.explicacao}</Typography>
          <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'text.secondary' }}>*Educativo. Sempre confirme com seu médico.</Typography>
        </Box>
      </Popover>
    </>
  );
};
