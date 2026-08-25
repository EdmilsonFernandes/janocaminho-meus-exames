import { useState, type ReactNode } from 'react';
import { Avatar, Box, Button, Card, Dialog, DialogContent, Stack, Typography, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import MedicationIcon from '@mui/icons-material/Medication';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import EditNoteIcon from '@mui/icons-material/EditNote';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { photoUrlFor } from '../../config';
import { copperText } from '../../theme';
import { DoctorPatientSwitcher } from './DoctorPatientSwitcher';

/** Formata dd/mm (curto) p/ exibição compacta. */
const fmtDateShort = (d?: string): string => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';

/** Tempo relativo apertado (há X dias / meses). */
const timeAgo = (d?: string): string => {
  if (!d) return '';
  const ms = Date.now() - new Date(d).getTime();
  if (ms < 0) return '';
  const days = Math.floor(ms / 86400000);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'há 1 dia';
  if (days < 30) return `há ${days} dias`;
  const months = Math.floor(days / 30);
  if (months === 1) return 'há 1 mês';
  if (months < 12) return `há ${months} meses`;
  const years = Math.floor(months / 12);
  return years === 1 ? 'há 1 ano' : `há ${years} anos`;
};

const sexLabel = (s?: string): string | null => (s === 'female' ? 'Feminino' : s === 'male' ? 'Masculino' : null);

export interface PatientSummaryProps {
  patient: any;
  exams: any[];
  /** Alterações REAIS estratificadas (endpoint /items/abnormal — mesma régua da aba Alterados). */
  abnormal: { total: number; importante: number; moderada: number; leve: number };
  questions: any[];
  notes: any[];
  patients: any[];
  onSwitchPatient: (pid: string) => void;
  onOpenExam?: (examId: string) => void;
  /** Click nas tecla "Alterações" — opcional (abre a aba Alterados se o pai ligar). */
  onAlterados?: () => void;
  /** Tiles viram NAVEGAÇÃO (2026-08-19): Perguntas/Anotações saíram da barra de abas —
   *  o resumo do paciente é quem leva até eles (e Último exame → aba Exames). */
  onOpenExams?: () => void;
  onOpenQuestions?: () => void;
  onOpenNotes?: () => void;
  /** Atividade 30d (Health Connect do paciente) — null quando não sincroniza; tile some. */
  activity?: { days: number; avgSteps: number; avgKcal: number; avgKm: number } | null;
  /** Remédios ativos + interações críticas (tile 5 — contexto farmacológico da consulta). */
  medsCount?: number;
  criticalMeds?: number;
  onOpenMeds?: () => void;
}

interface Tile {
  key: string;
  label: string;
  icon: ReactNode;
  value: string;
  sub?: string;
  color: string;
  onClick?: () => void;
}

/**
 * PatientSummary — cabeçalho clínico "hero" do detalhe do paciente.
 * Apresenta avatar (com anel de alerta se hasAlerts), nome, legenda demográfica,
 * botão "Trocar" (Dialog reusando DoctorPatientSwitcher) e 4 teclas clínicas.
 * Cores via theme.palette.primary + alpha (sem hex cru).
 */
export const PatientSummary = ({ patient, exams, abnormal, questions, notes, patients, onSwitchPatient, onAlterados, onOpenExams, onOpenQuestions, onOpenNotes, activity, medsCount, criticalMeds, onOpenMeds }: PatientSummaryProps) => {
  const theme = useTheme();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const primary = theme.palette.primary.main;

  const pid: string = patient?.patient?.id ?? patient?.id ?? '';
  const fullName: string = patient?.patient?.fullName ?? 'Paciente';
  const photo: string | undefined = pid ? photoUrlFor(pid, 0) : undefined;

  const pendingQs = questions.filter((q) => q?.status !== 'answered').length;
  const examDates = exams.map((e) => e?.performedAt).filter(Boolean).sort() as string[];
  const lastExamAt: string | undefined = patient?.lastExamAt ?? examDates[examDates.length - 1];

  const caption = [
    patient?.age != null ? `${patient.age} anos` : null,
    sexLabel(patient?.sex),
    patient?.patient?.relationship || patient?.relationship,
    patient?.convenio || 'Particular',
    patient?.latestWeight?.value ? `${patient.latestWeight.value} kg` : null,
  ].filter(Boolean).join(' • ');

  const ringColor = patient?.hasAlerts ? theme.palette.error.main : primary;

  const tiles: Tile[] = [
    {
      key: 'last',
      label: 'Último exame',
      icon: <CalendarMonthOutlinedIcon sx={{ fontSize: 18, color: primary }} />,
      value: lastExamAt ? fmtDateShort(lastExamAt) : 'Sem exames',
      sub: lastExamAt ? timeAgo(lastExamAt) : '',
      color: 'text.primary',
      onClick: onOpenExams,
    },
    // ATIVIDADE (Health Connect): contexto de estilo de vida p/ ler glicose/lipídios/PA.
    // Tile só existe com dados — sem sincronização, nada de caixa vazia.
    ...(activity && activity.days > 0 ? [{
      key: 'activity',
      label: 'Atividade (30d)',
      icon: <DirectionsWalkIcon sx={{ fontSize: 18, color: primary }} />,
      value: `${activity.avgSteps.toLocaleString('pt-BR')} passos/dia`,
      sub: `${activity.avgKm.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} km · ${activity.avgKcal.toLocaleString('pt-BR')} kcal/dia`,
      color: 'text.primary',
    }] : []),
    {
      key: 'alt',
      label: 'Alterações',
      icon: <WarningAmberIcon sx={{ fontSize: 18, color: abnormal.total > 0 ? theme.palette.error.main : theme.palette.success.main }} />,
      value: String(abnormal.total),
      // Severidade guiando a triagem: mostra a pior faixa (régua da aba Alterados).
      sub: abnormal.total === 0 ? undefined
        : abnormal.importante > 0 ? `${abnormal.importante} ${abnormal.importante === 1 ? 'importante' : 'importantes'}`
        : abnormal.moderada > 0 ? `${abnormal.moderada} ${abnormal.moderada === 1 ? 'moderada' : 'moderadas'}`
        : `${abnormal.leve} ${abnormal.leve === 1 ? 'leve' : 'leves'}`,
      color: abnormal.total > 0 ? 'error.main' : 'success.main',
      onClick: onAlterados,
    },
    {
      key: 'pend',
      label: 'Perguntas',
      icon: <QuestionAnswerIcon sx={{ fontSize: 18, color: pendingQs > 0 ? theme.palette.warning.main : primary }} />,
      value: String(pendingQs),
      sub: pendingQs > 0 ? 'aguardando' : undefined,
      color: pendingQs > 0 ? 'warning.main' : 'text.primary',
      onClick: onOpenQuestions,
    },
    {
      key: 'notes',
      label: 'Anotações',
      icon: <EditNoteIcon sx={{ fontSize: 18, color: primary }} />,
      value: String(notes.length),
      color: 'text.primary',
      onClick: onOpenNotes,
    },
    {
      key: 'meds',
      label: 'Remédios',
      icon: <MedicationIcon sx={{ fontSize: 18, color: (criticalMeds ?? 0) > 0 ? theme.palette.error.main : primary }} />,
      value: String(medsCount ?? 0),
      sub: (criticalMeds ?? 0) > 0 ? `${criticalMeds} interação${criticalMeds === 1 ? '' : 'ões'} crítica${criticalMeds === 1 ? '' : 's'}` : 'ativos',
      color: (criticalMeds ?? 0) > 0 ? 'error.main' : 'text.primary',
      onClick: onOpenMeds,
    },
  ];

  return (
    <Card elevation={0} sx={{ p: 2, borderRadius: '12px', border: '1px solid', borderColor: 'divider', bgcolor: (t) => (t.palette.mode === 'dark' ? alpha(primary, 0.05) : alpha(primary, 0.03)) }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
        <Box sx={{ position: 'relative', flexShrink: 0 }}>
          <Box sx={{ position: 'absolute', inset: -3, borderRadius: '50%', border: `2px solid ${ringColor}`, opacity: patient?.hasAlerts ? 1 : 0.35 }} />
          <Avatar src={photo} sx={{ width: 56, height: 56, fontWeight: 800, bgcolor: alpha(primary, 0.14), color: primary, fontSize: 20 }}>{fullName?.charAt(0)}</Avatar>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Kicker de papel (aprovado pelo dono 2026-08-19): desambigua MÉDICO (chip cobre
              no header) × PACIENTE (este hero) sem custo de altura — tipográfico, na voz
              cobre do modo médico. */}
          <Typography component="div" sx={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.09em', lineHeight: 1.4, color: (t) => copperText(t.palette.mode) }}>PACIENTE · PRONTUÁRIO COMPARTILHADO</Typography>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 20, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'text.primary' }}>{fullName}</Typography>
            <Button size="small" onClick={() => setSwitcherOpen(true)} startIcon={<SwapHorizIcon />} aria-label="Trocar paciente" sx={{ flexShrink: 0, minWidth: 0, textTransform: 'none', fontWeight: 700, color: primary, borderRadius: '999px', py: 0.25, px: 1, '&:hover': { bgcolor: alpha(primary, 0.08) } }}>Trocar</Button>
          </Stack>
          {caption && <Typography sx={{ color: 'text.primary', opacity: 0.72, display: 'block', mt: 0.5, fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{caption}</Typography>}
        </Box>
      </Stack>

      {/* 6 colunas só em tela LARGA (lg+): em ~960px a coluna do detalhe tem ~640px e
          6 tiles de ~93px cortavam o conteúdo (valor/label vazavam à direita). */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)', lg: 'repeat(6, 1fr)' }, gap: 1, mt: 2 }}>
        {tiles.map((t) => (
          <Box
            key={t.key}
            onClick={t.onClick}
            onKeyDown={(e) => { if (t.onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); t.onClick(); } }}
            role={t.onClick ? 'button' : undefined}
            tabIndex={t.onClick ? 0 : undefined}
            aria-label={t.onClick ? `Abrir ${t.label}` : undefined}
            sx={{
              p: 1.25, borderRadius: '12px', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
              cursor: t.onClick ? 'pointer' : 'default',
              transition: 'border-color .15s, box-shadow .15s',
              '&:hover': t.onClick ? { borderColor: primary, boxShadow: `0 2px 8px ${alpha(primary, 0.15)}` } : {},
              '&:active': t.onClick ? { transform: 'scale(.98)' } : {},
            }}
          >
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.25, minWidth: 0 }}>
              {t.icon}
              <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontWeight: 700, flex: 1, minWidth: 0 }}>{t.label}</Typography>
              {t.onClick && <ChevronRightIcon sx={{ fontSize: 15, color: 'text.disabled' }} />}
            </Stack>
            <Typography sx={{ fontWeight: 800, color: t.color as never, fontSize: 16, lineHeight: 1.2 }}>{t.value}</Typography>
            {t.sub && <Typography variant="caption" noWrap sx={{ color: 'text.secondary' }}>{t.sub}</Typography>}
          </Box>
        ))}
      </Box>

      <Dialog open={switcherOpen} onClose={() => setSwitcherOpen(false)} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: '12px' } }}>
        <DialogContent sx={{ pt: 3 }}>
          <Stack spacing={1.5}>
            <Typography sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif' }}>Selecionar paciente</Typography>
            <DoctorPatientSwitcher patients={patients} value={pid} onSelect={(id) => { onSwitchPatient(id); setSwitcherOpen(false); }} />
            <Button onClick={() => setSwitcherOpen(false)} sx={{ alignSelf: 'flex-end', textTransform: 'none', borderRadius: '999px' }}>Fechar</Button>
          </Stack>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
