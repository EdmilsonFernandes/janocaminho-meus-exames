// SportsConsultPrep (E4.2 §6) — "Preparação p/ consulta": perguntas PRONTAS derivadas
// dos dados reais do painel (padrão NextStepsCard/DoctorQuestion — leitura, sem POST).
// Determinístico: template + números dos exames; nunca prescreve, nunca sugere dose.
import { Box, Stack, Typography } from '@mui/material';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import { AppCard } from '../AppCard';
import { EmptyState } from '../EmptyState';
import { tealText } from '../../theme';
import { priorityOf, PRIORITY_RANK, refScaleSuspect } from '../../utils/alertPriority';
import { goalFor, goalRangeText, withinGoal } from '../../utils/clinicalGoals';
import type { ClinicalGoalView } from '@meus-exames/shared';
import type { EvolutionAnalyte } from './SportsMarkerCard';

const fmtNum = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
const fmtDay = (d?: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : 's/d');

export const SportsConsultPrep = ({ items, goals, patientId, substances, lastExamAt }: {
  items: EvolutionAnalyte[];
  goals: ClinicalGoalView[];
  patientId?: string | null;
  substances: { name: string; dosage?: string | null }[];
  lastExamAt?: string | null;
}) => {
  // Perguntas derivadas — SEMPRE com o número real + a referência (educativo, CFM-safe).
  const questions: { title: string; body: string }[] = [];

  // 1) Marcador alterado de maior prioridade (mesma régua de prioridade do app).
  const asAlert = (it: EvolutionAnalyte) => ({
    name: it.nameCanonical, nameCanonical: it.nameCanonical,
    valueNumeric: it.lastValue, refLow: it.refLow, refHigh: it.refHigh,
    flag: it.points[it.points.length - 1]?.flag ?? null,
  });
  const abnormal = items
    .filter((it) => it.abnormal && it.lastValue != null && !refScaleSuspect(asAlert(it)))
    .sort((a, b) => PRIORITY_RANK[priorityOf(asAlert(b))] - PRIORITY_RANK[priorityOf(asAlert(a))]);
  const top = abnormal[0];
  const titleCase = (s: string) => (s || '').toLowerCase().replace(/(^|\s)\w/g, (m) => m.toUpperCase());
  if (top) {
    const hasRef = top.refLow != null && top.refHigh != null;
    const refTxt = hasRef
      ? ` (referência ${fmtNum(top.refLow)}–${fmtNum(top.refHigh)}${top.unit ? ` ${top.unit}` : ''})`
      : ' — o laudo não traz a faixa de referência';
    questions.push({
      title: `${titleCase(top.nameCanonical)} fora da referência`,
      body: `"Doutor, meu ${top.nameCanonical.toLowerCase()} está em ${fmtNum(top.lastValue)}${top.unit ? ` ${top.unit}` : ''}${refTxt} no contexto do meu treino. O que isso significa pra minha rotina?"`,
    });
  }

  // 2) Meta clínica vigente fora do alvo (camada 2 — pergunta com a autoria da meta).
  const outGoal = items.find((it) => {
    const g = goalFor(goals, it.nameCanonical, patientId);
    return g && withinGoal(it.lastValue, g) === false;
  });
  if (outGoal) {
    const g = goalFor(goals, outGoal.nameCanonical, patientId)!;
    questions.push({
      title: 'Meta clínica não atingida',
      body: `"A meta definida pelo(a) ${g.setBy} para ${outGoal.nameCanonical.toLowerCase()} é ${goalRangeText(g)} e meu valor está em ${fmtNum(outGoal.lastValue)}${outGoal.unit ? ` ${outGoal.unit}` : ''}. Como ajustar?"`,
    });
  }

  // 3) Criatina declarada × creatinina alta (interferência clássica — knowledge esportivo).
  const hasCreatine = substances.some((s) => /creatina/i.test(s.name) && !/creatinina/i.test(s.name));
  const creatHigh = items.find((it) => /creatinina/i.test(it.nameCanonical) && it.abnormal && it.lastValue != null && (it.refHigh == null || it.lastValue > it.refHigh));
  if (hasCreatine && creatHigh) {
    questions.push({
      title: 'Creatina × creatinina',
      body: `"Uso creatina declarada e minha creatinina veio em ${fmtNum(creatHigh.lastValue)}${creatHigh.unit ? ` ${creatHigh.unit}` : ''}. Vale dosar cistatina C pra confirmar a função renal sem a interferência do suplemento?"`,
    });
  }

  // Fallback: primeira consulta com painel — pergunta de AGENDA (quando repetir).
  if (questions.length === 0 && items.length > 0) {
    questions.push({
      title: 'Plano de monitoramento',
      body: `"Com base no meu último exame (${fmtDay(lastExamAt)}), quais desses marcadores devo repetir e em quanto tempo, considerando minha rotina de treino?"`,
    });
  }

  return (
    <AppCard kind="tinted" tone="primary" tone2="secondary" sx={{ p: { xs: 2, sm: 2.5 } }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
        <MedicalServicesIcon sx={{ fontSize: 19, color: (t) => tealText(t.palette.mode) }} />
        <Typography component="h2" sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 15 }}>
          Perguntas para levar ao médico
        </Typography>
      </Stack>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>
        Geradas pelo Dr. Exame a partir dos seus exames e declarações — educativas, não substituem consulta.
      </Typography>

      {questions.length === 0 ? (
        <EmptyState emoji="🩺" title="Sem exames ainda"
          desc="Envie um exame para o Dr. Exame preparar perguntas de consulta contextualizadas ao seu treino." />
      ) : (
        <Stack spacing={1.25}>
          {questions.map((q, i) => (
            <Box key={i} sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
              <Box sx={{
                flexShrink: 0, width: 26, height: 26, borderRadius: '999px', mt: 0.25,
                display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13,
                bgcolor: 'rgba(32,178,170,.14)', color: (t) => tealText(t.palette.mode),
              }}>{i + 1}</Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 800, fontSize: 13.5, lineHeight: 1.25 }}>{q.title}</Typography>
                <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.5, mt: 0.25 }}>{q.body}</Typography>
              </Box>
            </Box>
          ))}
        </Stack>
      )}
    </AppCard>
  );
};
