import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Stack, Typography } from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { API_URL, token } from '../../config';
import { useSelectedPatient } from '../../patient-context';
import { AppCard } from '../AppCard';
import { GradientButton } from '../GradientButton';

/**
 * "Próximos passos" — onboarding progressivo do Dashboard p/ usuário novo (ou antigo com perfil
 * incompleto). 2 passos máximos (perfil → 1º exame), UMA ação primária por vez (regra do design
 * system), e o card DESAPARECE quando o básico está pronto — nada de checklist permanente.
 * Completude vem do SERVER (GET /patients/:id → profileCompleteness), não de localStorage:
 * trocar de aparelho não "perde" o progresso.
 */
export const NextStepsCard = ({ exams }: { exams: number }) => {
  const [pid] = useSelectedPatient();
  const navigate = useNavigate();
  const [completeness, setCompleteness] = useState<{ pct: number; missing: string[] } | null>(null);

  const loadCompleteness = () => {
    if (!pid) return;
    fetch(`${API_URL}/patients/${pid}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCompleteness(d?.profileCompleteness ?? { pct: 0, missing: [] }))
      .catch(() => setCompleteness({ pct: 0, missing: [] }));
  };
  useEffect(() => { loadCompleteness(); /* eslint-disable-next-line */ }, [pid]);
  // Reage ao onboarding salvar (e a troca/edição de perfil) sem esperar reload.
  useEffect(() => {
    window.addEventListener('dx-profile-updated', loadCompleteness);
    window.addEventListener('selPatientChanged', loadCompleteness);
    return () => {
      window.removeEventListener('dx-profile-updated', loadCompleteness);
      window.removeEventListener('selPatientChanged', loadCompleteness);
    };
  }, [pid]);

  if (!completeness) return null;
  const profileDone = completeness.missing.length === 0;
  const examsDone = exams > 0;
  if (profileDone && examsDone) return null; // básico pronto → sai da tela (não vira mobília)

  // Microcopy contextual: se só falta o peso, a ação vira "registrar peso" (vai direto pras Medições).
  const onlyWeight = !profileDone && completeness.missing.length === 1 && completeness.missing[0] === 'weight';
  const steps = [
    { key: 'profile', label: onlyWeight ? 'Registrar seu peso' : 'Completar seu perfil', done: profileDone },
    { key: 'exam', label: 'Enviar seu primeiro exame', done: examsDone },
  ];
  const next = steps.find((s) => !s.done)!;
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <AppCard kind="tinted" tone="primary" tone2="secondary" sx={{ mt: 2, p: { xs: 2.25, md: 2.75 } }}>
      <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mb: 0.25 }}>
        <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 18, color: 'text.primary' }}>
          {doneCount === 0 ? 'Vamos preparar o Dr. Exame' : 'Quase lá'}
        </Typography>
        {!profileDone && (
          <Typography component="span" sx={{ fontSize: 12, fontWeight: 700, color: '#178f89' }}>{completeness.pct}% do perfil</Typography>
        )}
      </Stack>
      <Typography sx={{ fontSize: 13.5, color: 'text.secondary', mb: 1.5 }}>
        {doneCount === 0
          ? 'Leva menos de um minuto e destrava análises personalizadas pra você.'
          : 'Um passo pra destravar análises mais precisas.'}
      </Typography>
      <Stack spacing={0.75} sx={{ mb: 1.75 }}>
        {steps.map((s) => (
          <Stack key={s.key} direction="row" spacing={1} alignItems="center">
            <Box sx={{ fontSize: 18, color: s.done ? '#178f89' : 'text.disabled', display: 'flex' }}>
              {s.done ? <CheckCircleRoundedIcon fontSize="inherit" /> : <RadioButtonUncheckedRoundedIcon fontSize="inherit" />}
            </Box>
            <Typography sx={{ fontSize: 14, fontWeight: s.done ? 600 : 700, color: s.done ? 'text.secondary' : 'text.primary', textDecoration: s.done ? 'line-through' : 'none', textDecorationColor: 'rgba(0,0,0,.25)' }}>
              {s.label}
            </Typography>
          </Stack>
        ))}
      </Stack>
      <GradientButton
        onClick={() => navigate(next.key === 'profile' ? (onlyWeight ? '/medicoes' : '/perfil') : '/exams/create')}
        endIcon={<ArrowForwardIcon />}
        sx={{ width: { xs: '100%', sm: 'auto' } }}
      >
        {next.key === 'profile' ? (onlyWeight ? 'Registrar peso' : 'Completar perfil') : 'Enviar primeiro exame'}
      </GradientButton>
    </AppCard>
  );
};
