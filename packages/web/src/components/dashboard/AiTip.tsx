import { Box, Typography } from '@mui/material';
import { DrExame } from '../DrExame';

// Dica contextual da IA (robô DrExame + texto). Lógica de tipMsg/fmtItem movida da Dashboard.
const fmtItem = (x: any) => `${x.value ?? ''}${x.unit ? ' ' + x.unit : ''}`.trim();

export const AiTip = ({ firstName, tipData, fallbackTip }: { firstName?: string; tipData: { abnormal: any; good: any }; fallbackTip: string }) => {
  const tipMsg = tipData.abnormal
    ? `Atenção: seu ${tipData.abnormal.name} está ${tipData.abnormal.flag === 'HIGH' ? 'alto' : 'baixo'}${tipData.abnormal.value ? ` (${fmtItem(tipData.abnormal)})` : ''}. Vale conversar com seu médico.`
    : tipData.good
      ? `${firstName ? firstName + ', s' : 'S'}eu ${tipData.good.name} está ótimo${tipData.good.value ? ` (${fmtItem(tipData.good)})` : ''}! Continue assim.`
      : fallbackTip;
  return (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
      <Box sx={{ flexShrink: 0, width: 44, height: 44, borderRadius: '50%', background: 'radial-gradient(circle, rgba(32,178,170,.16), rgba(32,178,170,.03))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <DrExame size={34} sx={{ borderRadius: '50%' }} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 800, color: '#178f89', fontSize: 13 }}>✨ Dica personalizada (IA)</Typography>
        <Typography sx={{ fontSize: 14, color: 'text.primary', lineHeight: 1.5, mt: 0.25 }}>{tipMsg}</Typography>
      </Box>
    </Box>
  );
};
