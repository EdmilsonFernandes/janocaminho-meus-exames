import { Box, Typography, Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { API_URL, token } from '../../config';
import { useSelectedPatient } from '../../patient-context';
import { useEffect, useState } from 'react';
import { AppCard } from '../AppCard';

const PREMIUM = '#6366f1';

/**
 * Tile "Idade Biológica" — estimativa (PhenoAge) baseada em marcadores sanguíneos.
 *
 * NUNCA retorna null: quando não há estimativa (faltam marcadores do PhenoAge — caso comum),
 * mostra um tile "Em breve" no MESMO formato dos outros indicadores. Antes retornava null e
 * deixava uma célula vazia na grade 2×2 do Dashboard (parecia que faltava algo).
 * A explicação rica fica num Dialog (toque no tile) — mantém o card compacto e alinhado.
 */
export const BiologicalAgeCard = () => {
  const [pid] = useSelectedPatient();
  const [data, setData] = useState<{ age: number; confidence: string; markersUsed: number; missing?: string[] | null; method?: string } | null>(null);
  const [explain, setExplain] = useState(false);

  useEffect(() => {
    if (!pid) return;
    fetch(`${API_URL}/patients/${pid}/health-summary`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d?.biologicalAge ?? null))
      .catch(() => {});
  }, [pid]);

  const userStr = typeof localStorage !== 'undefined' ? localStorage.getItem('user') : null;
  const chronoAge = userStr ? (() => { try { return JSON.parse(userStr)?.age ?? null; } catch { return null; } })() : null;
  const diff = chronoAge && data ? data.age - chronoAge : null;

  const value = data ? `${data.age}a` : 'Em breve';
  const sub = data
    ? (diff === null ? 's/ idade cadastrada' : diff === 0 ? 'em equilíbrio' : diff < 0 ? `${Math.abs(diff)}a mais jovem` : `${diff}a mais velho`)
    : 'estimativa c/ +exames';
  const subColor = diff !== null && diff < 0 ? '#059669' : diff !== null && diff > 0 ? '#dc2626' : 'text.disabled';

  return (
    <>
      <AppCard kind="interactive" onClick={() => setExplain(true)} sx={{ p: 1.75, height: '100%' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, width: '100%' }}>
          <Box sx={{ width: 38, height: 38, borderRadius: '11px', display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: alpha(PREMIUM, 0.14), color: PREMIUM, fontSize: 20 }}>🧬</Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 11, color: 'text.secondary', lineHeight: 1.1 }}>Idade biológica</Typography>
            <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 16, color: 'text.primary', lineHeight: 1.2, mt: 0.15 }}>{value}</Typography>
            <Typography sx={{ fontSize: 11, color: subColor, lineHeight: 1.1 }}>{sub}</Typography>
          </Box>
        </Box>
      </AppCard>

      <Dialog open={explain} onClose={() => setExplain(false)} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: '12px' } } }}>
        <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>🧬 Idade biológica</DialogTitle>
        <DialogContent>
          {data ? (
            <>
              <Typography variant="h6" sx={{ fontWeight: 800, color: PREMIUM }}>{data.age} anos{chronoAge ? ` (você tem ${chronoAge})` : ''}</Typography>
              {diff !== null && diff !== 0 && (
                <Typography variant="body2" sx={{ mt: 0.5, color: diff < 0 ? '#059669' : '#dc2626', fontWeight: 700 }}>
                  {diff < 0 ? `💚 Seu corpo está ${Math.abs(diff)}a mais jovem que sua idade` : `⚠️ Seu corpo está ${diff}a mais velho que sua idade`}
                </Typography>
              )}
              {diff === 0 && <Typography variant="body2" sx={{ mt: 0.5 }} color="text.secondary">Seu corpo está em equilíbrio com sua idade.</Typography>}
              <Typography variant="body2" sx={{ lineHeight: 1.6, display: 'block', mt: 1.5 }}>
                É a idade estimada do seu <b>corpo</b> a partir de exames de sangue — glicose, colesterol, função do rim e do fígado, hormônios e outros marcadores. Pode diferir da sua idade de carteira (cronológica).
              </Typography>
              {data.missing && data.missing.length > 0 && (
                <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'text.secondary' }}>
                  📊 Estimativa parcial — pra ficar mais precisa, ajudaria ter: <b>{data.missing.join(', ')}</b> num próximo exame.
                </Typography>
              )}
              <Typography variant="caption" sx={{ display: 'block', mt: 2, color: 'text.secondary', fontStyle: 'italic' }}>
                Cálculo baseado em {data.markersUsed} marcadores. Estimativa educativa — não substitui a avaliação de um profissional de saúde.
              </Typography>
            </>
          ) : (
            <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
              A idade biológica é uma estimativa de como o seu <b>corpo</b> está envelhecendo, calculada a partir de exames de sangue (hemograma, glicose, colesterol, função renal/hepática, inflamação e outros). Para calcularmos a sua, envie um <b>exame completo</b> com esses marcadores. 🔄
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExplain(false)} variant="contained" sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 800 }}>Entendi</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
