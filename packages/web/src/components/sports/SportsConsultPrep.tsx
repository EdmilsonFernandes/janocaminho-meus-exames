// SportsConsultPrep (E4.2 §6 + E5 §4) — "Preparação p/ consulta": perguntas PRONTAS
// derivadas dos dados reais do painel (padrão NextStepsCard/DoctorQuestion — leitura,
// sem POST). Determinístico: template + números dos exames; nunca prescreve, nunca
// sugere dose. Máx ~5 perguntas PRIORIZADAS (E5 §4): alterado de topo → conduta Hct
// (zona de atenção + hormônio) → HDL×andrógeno → meta clínica → creatinina×creatina.
import { Box, Stack, Typography } from '@mui/material';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import { AppCard } from '../AppCard';
import { EmptyState } from '../EmptyState';
import { RADIUS, tealText } from '../../theme';
import { priorityOf, PRIORITY_RANK, refScaleSuspect } from '../../utils/alertPriority';
import { goalFor, goalRangeText, withinGoal } from '../../utils/clinicalGoals';
import { androgenDeclared, hormoneDeclared, type QuestionBias } from './sportsDomains';
import type { ClinicalGoalView } from '@meus-exames/shared';
import type { EvolutionAnalyte } from './SportsMarkerCard';

const fmtNum = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
const fmtDay = (d?: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : 's/d');
const MAX_QUESTIONS = 5;

export const SportsConsultPrep = ({ items, goals, patientId, substances, lastExamAt, bias }: {
  items: EvolutionAnalyte[];
  goals: ClinicalGoalView[];
  patientId?: string | null;
  substances: { name: string; dosage?: string | null }[];
  lastExamAt?: string | null;
  /** Viés da LENTE por arquétipo (E5): prioriza a pergunta típica do perfil. */
  bias?: QuestionBias;
}) => {
  // Perguntas derivadas — SEMPRE com o número real + a referência (educativo, CFM-safe).
  const questions: { title: string; body: string }[] = [];

  // (a) HEMATÓCRITO em zona de atenção + hormônio declarado (E5 §4a — linguagem de
  // diretriz; pergunta de CONDUTA, nunca de ajuste de dose).
  const hct = items.find((it) => /hematocrito/i.test(it.nameCanonical) && it.lastValue != null);
  const hctZone = hct && hct.lastValue != null && hct.lastValue >= 48 ? hct : null;

  // 1) Marcador alterado de maior prioridade (mesma régua de prioridade do app).
  // Se for o próprio hematócrito em zona de atenção COM hormônio declarado, a pergunta
  // (a) abaixo é mais específica — não duplica.
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
  const topIsHctCovered = !!(hctZone && hormoneDeclared(substances) && top && /hematocrito/i.test(top.nameCanonical));
  if (top && !topIsHctCovered) {
    const hasRef = top.refLow != null && top.refHigh != null;
    const refTxt = hasRef
      ? ` (referência ${fmtNum(top.refLow)}–${fmtNum(top.refHigh)}${top.unit ? ` ${top.unit}` : ''})`
      : ' — o laudo não traz a faixa de referência';
    questions.push({
      title: `${titleCase(top.nameCanonical)} fora da referência`,
      body: `"Doutor, meu ${top.nameCanonical.toLowerCase()} está em ${fmtNum(top.lastValue)}${top.unit ? ` ${top.unit}` : ''}${refTxt} no contexto do meu treino. O que isso significa pra minha rotina?"`,
    });
  }

  // (lens) VIÉS DA LENTE por arquétipo (E5): pergunta típica do perfil logo após o topo —
  // sempre com o número real e linguagem educativa (nunca intervenção específica).
  if (bias === 'ferro_endurance') {
    const ferr = items.find((it) => /ferritina/i.test(it.nameCanonical) && it.lastValue != null);
    if (ferr) {
      const refTxt = ferr.refLow != null ? ` (referência a partir de ${fmtNum(ferr.refLow)}${ferr.unit ? ` ${ferr.unit}` : ''})` : '';
      questions.push({
        title: 'Estoque de ferro no endurance',
        body: `"Minha ferritina está em ${fmtNum(ferr.lastValue)}${ferr.unit ? ` ${ferr.unit}` : ''}${refTxt}. Pra minha rotina de resistência, como acompanhar o estoque de ferro antes que vire anemia?"`,
      });
    }
  } else if (bias === 'ck_intensa') {
    const ck = items.find((it) => /creatino quinase|creatina quinase|ck total/i.test(it.nameCanonical) && it.lastValue != null);
    if (ck && ck.abnormal && (ck.refHigh == null || ck.lastValue! > ck.refHigh)) {
      questions.push({
        title: 'CK após treino intenso',
        body: `"Meu CK total está em ${fmtNum(ck.lastValue)}${ck.unit ? ` ${ck.unit}` : ''}${ck.refHigh != null ? ` (referência até ${fmtNum(ck.refHigh)})` : ''} treinando em alta intensidade — é recuperação esperada ou devo investigar?"`,
      });
    }
  } else if (bias === 'monitoramento_trt' && items.length > 0) {
    questions.push({
      title: 'Cadência de monitoramento (TRT)',
      body: '"Estou em reposição com prescrição. As diretrizes citam reavaliação de testosterona e hematócrito em 3, 6 e 12 meses e depois anualmente — qual cadência recomenda pro meu caso?"',
    });
  }

  // (a) Conduta no hematócrito ≥48% com hormônio declarado (E5 §4a).
  if (hctZone && hormoneDeclared(substances)) {
    const refTxt = hctZone.refLow != null && hctZone.refHigh != null
      ? ` (referência ${fmtNum(hctZone.refLow)}–${fmtNum(hctZone.refHigh)}${hctZone.unit ? ` ${hctZone.unit}` : ''})` : '';
    questions.push({
      title: `Conduta no hematócrito (${fmtNum(hctZone.lastValue)}${hctZone.unit === '%' || !hctZone.unit ? '%' : ''})`,
      body: `"Doutor, com hematócrito de ${fmtNum(hctZone.lastValue)}%${refTxt} e meu uso hormonal declarado, qual conduta recomenda — reavaliar em quanto tempo?"`,
    });
  }

  // (b) HDL baixo com andrógeno declarado (E5 §4b — cardioproteção SEM citar intervenções).
  const hdl = items.find((it) => /hdl/i.test(it.nameCanonical) && it.lastValue != null
    && ((it.refLow != null && it.lastValue < it.refLow) || (it.abnormal && it.refLow == null && it.refHigh != null && it.lastValue < it.refHigh)));
  if (hdl && androgenDeclared(substances)) {
    const refTxt = hdl.refLow != null ? ` (referência a partir de ${fmtNum(hdl.refLow)}${hdl.unit ? ` ${hdl.unit}` : ''})` : '';
    questions.push({
      title: 'HDL e cardioproteção',
      body: `"Com andrógeno declarado, meu HDL veio em ${fmtNum(hdl.lastValue)}${hdl.unit ? ` ${hdl.unit}` : ''}${refTxt}. Quais medidas de cardioproteção devo adotar nessa fase?"`,
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
  const shown = questions.slice(0, MAX_QUESTIONS);

  return (
    <AppCard
      kind="tinted"
      tone="primary"
      tone2="secondary"
      sx={{
        p: { xs: 2, sm: 2.5 },
        borderRadius: RADIUS.card,
        border: (t) => `1px solid ${t.palette.mode === 'dark' ? 'rgba(32,178,170,0.22)' : 'rgba(32,178,170,0.18)'}`,
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
        <MedicalServicesIcon sx={{ fontSize: 20, color: (t) => tealText(t.palette.mode) }} />
        <Typography component="h2" sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: { xs: 15, sm: 16 } }}>
          Perguntas para a sua consulta médica
        </Typography>
      </Stack>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.75, fontSize: 12 }}>
        Perguntas clínicas geradas pelo Dr. Exame com base nos seus dados e treinos — copie ou mostre na consulta.
      </Typography>

      {shown.length === 0 ? (
        <EmptyState
          emoji="🩺"
          title="Sem exames para análise"
          desc="Envie um exame para o Dr. Exame estruturar as principais dúvidas clínicas para você levar ao médico."
        />
      ) : (
        <Stack spacing={1.25}>
          {shown.map((q, i) => (
            <Box
              key={i}
              sx={{
                p: 1.5,
                borderRadius: '14px',
                bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.7)'),
                border: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                gap: 1.25,
                alignItems: 'flex-start',
              }}
            >
              <Box
                sx={{
                  flexShrink: 0,
                  width: 26,
                  height: 26,
                  borderRadius: '8px',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 800,
                  fontSize: 12.5,
                  bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(32,178,170,0.22)' : 'rgba(32,178,170,0.14)'),
                  color: (t) => tealText(t.palette.mode),
                }}
              >
                {i + 1}
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontWeight: 800, fontSize: 13.5, lineHeight: 1.3, color: 'text.primary' }}>
                  {q.title}
                </Typography>
                <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.45, mt: 0.35 }}>
                  {q.body}
                </Typography>
              </Box>
            </Box>
          ))}
        </Stack>
      )}
    </AppCard>
  );
};
