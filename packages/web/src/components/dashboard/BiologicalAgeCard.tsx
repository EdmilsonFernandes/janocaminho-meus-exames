import { Box, Typography, Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import { API_URL, token } from '../../config';
import { useSelectedPatient } from '../../patient-context';
import { useEffect, useState } from 'react';
import { AppCard } from '../AppCard';
import { Dna } from '@phosphor-icons/react';

const PREMIUM = '#6366f1';

/**
 * Tile "Idade Biológica" — estimativa (PhenoAge) baseada em marcadores sanguíneos.
 *
 * NUNCA retorna null: mantém a grade 2×2 do Dashboard sempre completa. Sem estimativa, o tile
 * diz POR QUE não calculou (availability do server): falta perfil (nascimento) → CTA perfil;
 * falta exame → CTA 1º exame; faltam marcadores específicos → lista. "Em breve" genérico nunca
 * mais (ausência de dado não é um prazo). A explicação rica fica num Dialog (toque no tile).
 */
export const BiologicalAgeCard = () => {
  const [pid] = useSelectedPatient();
  const navigate = useNavigate();
  const [data, setData] = useState<{ age: number; confidence: string; markersUsed: number; missing?: string[] | null; method?: string; assumptions?: string[] } | null>(null);
  const [avail, setAvail] = useState<{ status: string; missing: string[] } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [explain, setExplain] = useState(false);

  const loadBio = () => {
    if (!pid) return;
    setLoaded(false);
    fetch(`${API_URL}/patients/${pid}/health-summary`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { setData(d?.biologicalAge ?? null); setAvail(d?.availability?.biologicalAge ?? null); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  };
  useEffect(() => { loadBio(); /* eslint-disable-next-line */ }, [pid]);
  // Reage ao onboarding salvar (idade biológica depende de nascimento/sexo) sem reload.
  useEffect(() => {
    window.addEventListener('dx-profile-updated', loadBio);
    return () => { window.removeEventListener('dx-profile-updated', loadBio); };
  }, [pid]);

  const userStr = typeof localStorage !== 'undefined' ? localStorage.getItem('user') : null;
  const chronoAge = userStr ? (() => { try { return JSON.parse(userStr)?.age ?? null; } catch { return null; } })() : null;
  const diff = chronoAge && data ? data.age - chronoAge : null;

  // Estado vazio HONESTO: o tile explica o que falta em vez de prometer um "Em breve" sem prazo.
  const missingProfile = avail?.status === 'missing_profile';
  const noExams = avail?.status === 'no_data';
  const value = data ? `${data.age}a` : loaded ? '—' : '…';
  const sub = data
    ? (diff === null ? 'estimativa corporal' : diff === 0 ? 'em equilíbrio' : diff < 0 ? `${Math.abs(diff)}a mais jovem` : `${diff}a mais velho`)
    : missingProfile ? 'complete seu perfil'
    : noExams ? 'após o 1º exame'
    : loaded ? 'precisa de mais marcadores'
    : '';
  const subColor = diff !== null && diff < 0 ? '#059669' : diff !== null && diff > 0 ? '#dc2626' : 'text.secondary';

  return (
    <>
      <AppCard kind="interactive" onClick={() => setExplain(true)} sx={{ p: 1.75, height: '100%' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, width: '100%' }}>
          <Box sx={{ width: 38, height: 38, borderRadius: '11px', display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: alpha(PREMIUM, 0.14), color: PREMIUM }}><Dna size={22} weight="duotone" color={PREMIUM} /></Box>
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
              {chronoAge == null && (
                <Typography variant="body2" sx={{ mt: 1.5, color: PREMIUM, fontWeight: 700 }}>
                  Cadastre sua data de nascimento no perfil para compararmos com sua idade real.
                </Typography>
              )}
              {data.assumptions?.includes('sexoNaoInformado') && (
                <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'text.secondary' }}>
                  ℹ️ Sexo não informado no perfil — os intervalos de referência usados assumem valores masculinos. Informe o sexo no perfil para uma estimativa mais precisa.
                </Typography>
              )}
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
            <>
              <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
                A idade biológica é uma estimativa de como o seu <b>corpo</b> está envelhecendo, calculada a partir de exames de sangue (hemograma, glicose, colesterol, função renal/hepática, inflamação e outros).
              </Typography>
              {missingProfile ? (
                <Typography variant="body2" sx={{ mt: 1.5 }}>
                  Pra calcular a sua, primeiro precisamos da sua <b>data de nascimento</b> no perfil — ela entra direto na fórmula.
                </Typography>
              ) : (
                <Typography variant="body2" sx={{ mt: 1.5 }}>
                  Pra calcular a sua, envie um <b>exame completo</b> com esses marcadores. 🔄
                </Typography>
              )}
              {!!avail?.missing?.length && !missingProfile && avail.status === 'insufficient_data' && (
                <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'text.secondary' }}>
                  Ainda sem: <b>{avail.missing.join(', ')}</b>.
                </Typography>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          {!data && (
            <Button onClick={() => { setExplain(false); navigate(missingProfile ? '/perfil' : '/exams/create'); }} variant="contained" sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 800 }}>
              {missingProfile ? 'Completar perfil' : 'Enviar exame'}
            </Button>
          )}
          <Button onClick={() => setExplain(false)} variant={data ? 'contained' : 'text'} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 800 }}>Entendi</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
