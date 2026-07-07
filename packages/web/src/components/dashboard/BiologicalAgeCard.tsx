import { Box, Card, CardContent, Typography, Chip } from '@mui/material';
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
        {/* Explicação simples — o paciente precisa entender o que isso significa */}
        <Box sx={{ mt: 1.25, p: 1.25, borderRadius: 2, bgcolor: 'rgba(99,102,241,.04)', border: '1px solid', borderColor: 'rgba(99,102,241,.10)' }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.5, display: 'block', fontSize: 11.5 }}>
            <b style={{ color: '#6366f1' }}>O que é?</b> É a idade estimada do seu <b>corpo</b> baseada nos seus exames de sangue (glicose, colesterol, rim, fígado, hormônios). Pode ser diferente da sua idade real no RG.
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.5, display: 'block', fontSize: 11.5, mt: 0.5 }}>
            <b style={{ color: '#059669' }}>Mais jovem</b> = seus exames estão melhores que o esperado pra sua idade. <b style={{ color: '#dc2626' }}>Mais velho</b> = alguns marcadores precisam de atenção. Boa alimentação, exercício e sono ajudam a rejuvenescer. 🔄
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10, display: 'block', mt: 0.5, fontStyle: 'italic' }}>
            Baseado em {data.markersUsed} marcadores. Estimativa educativa — não substitui avaliação médica.
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};
