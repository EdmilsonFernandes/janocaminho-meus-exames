import { Box, Button, Card, CardContent, Typography, Chip, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { API_URL, token } from '../../config';
import { useSelectedPatient } from '../../patient-context';
import { useEffect, useState } from 'react';

/**
 * Card "Idade Biológica" — estimativa baseada em marcadores sanguíneos. Wow factor premium.
 * Mostra "🧬 Idade biológica: 47a (cronológica 51a)" + diferença + confiança.
 */
export const BiologicalAgeCard = () => {
  const [pid] = useSelectedPatient();
  const [data, setData] = useState<{ age: number; confidence: string; markersUsed: number } | null>(null);
  const [explain, setExplain] = useState(false);

  useEffect(() => {
    if (!pid) return;
    fetch(`${API_URL}/patients/${pid}/health-summary`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d?.biologicalAge ?? null))
      .catch(() => {});
  }, [pid]);

  if (!data) return null;

  // Precisa da idade cronológica pra comparar — vem do patient context (localStorage)
  const userStr = typeof localStorage !== 'undefined' ? localStorage.getItem('user') : null;
  const chronoAge = userStr ? (() => { try { return JSON.parse(userStr)?.age ?? null; } catch { return null; } })() : null;

  const diff = chronoAge ? data.age - chronoAge : null;
  const younger = diff !== null && diff < 0;
  const older = diff !== null && diff > 0;

  return (
    <>
    <Card sx={{ mt: 2, borderRadius: 4, background: 'linear-gradient(135deg, rgba(99,102,241,.08), rgba(99,102,241,.02))', border: '1px solid', borderColor: 'rgba(99,102,241,.2)' }}>
      <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ fontSize: 40, lineHeight: 1 }}>🧬</Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" sx={{ fontWeight: 800, color: '#6366f1', display: 'block', mb: 0.25 }}>IDADE BIOLÓGICA</Typography>
            <Typography sx={{ fontWeight: 800, fontSize: 22, fontFamily: 'Poppins, sans-serif', lineHeight: 1.2, color: 'text.primary' }}>
              {data.age} anos
              {chronoAge && <Typography component="span" sx={{ fontSize: 14, fontWeight: 600, color: 'text.secondary', ml: 1 }}>(você tem {chronoAge})</Typography>}
            </Typography>
            {diff !== null && diff !== 0 && (
              <Typography variant="caption" sx={{ color: younger ? '#059669' : '#dc2626', fontWeight: 700, display: 'block' }}>
                {younger ? `💚 Seu corpo está ${Math.abs(diff)}a mais jovem que sua idade` : `⚠️ Seu corpo está ${diff}a mais velho que sua idade`}
              </Typography>
            )}
            {diff === 0 && <Typography variant="caption" color="text.secondary">Seu corpo está em equilíbrio com sua idade</Typography>}
          </Box>
          {data.confidence === 'baixa' && <Chip size="small" label="estimativa" sx={{ bgcolor: 'rgba(99,102,241,.12)', color: '#6366f1', fontWeight: 700, fontSize: 10, height: 18 }} />}
        </Box>
        {/* Caminho pra explicação completa (Dialog) — mantém o card compacto no Dashboard. */}
        <Box sx={{ mt: 1 }}>
          <Button size="small" startIcon={<HelpOutlineIcon />} onClick={() => setExplain(true)} sx={{ color: '#6366f1', textTransform: 'none', fontWeight: 700 }}>Saiba o que isso significa</Button>
        </Box>
      </CardContent>
    </Card>

      {/* Dialog: explicação leiga e profunda da idade biológica (pt 4 do pedido). */}
      <Dialog open={explain} onClose={() => setExplain(false)} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: 3 } } }}>
        <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>🧬 O que é a idade biológica?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ lineHeight: 1.6, display: 'block' }}>
            <b style={{ color: '#6366f1' }}>O que é?</b> É a idade estimada do seu <b>corpo</b> com base nos seus exames de sangue — glicose, colesterol, função do rim e do fígado, hormônios e outros marcadores. Pode ser diferente da sua idade de carteira (cronológica).
          </Typography>
          <Typography variant="body2" sx={{ lineHeight: 1.6, display: 'block', mt: 1.5 }}>
            <b style={{ color: '#059669' }}>Mais jovem</b> significa que seus exames estão melhores do que o esperado pra sua idade. <b style={{ color: '#dc2626' }}>Mais velho</b> indica que alguns marcadores merecem atenção.
          </Typography>
          <Typography variant="body2" sx={{ lineHeight: 1.6, display: 'block', mt: 1.5 }}>
            A boa notícia: alimentação equilibrada, exercício regular e sono de qualidade ajudam seu corpo a “rejuvenescer” nos próximos exames. 🔄
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', mt: 2, color: 'text.secondary', fontStyle: 'italic' }}>
            Cálculo baseado em {data.markersUsed} marcadores. Estimativa educativa — não substitui a avaliação de um profissional de saúde.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExplain(false)} variant="contained" sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 800 }}>Entendi</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
