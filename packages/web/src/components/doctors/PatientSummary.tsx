import { useState, type ReactNode } from 'react';
import { Avatar, Box, Button, Card, Dialog, DialogContent, Skeleton, Stack, Typography, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import MedicationIcon from '@mui/icons-material/Medication';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import EditNoteIcon from '@mui/icons-material/EditNote';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import VideocamIcon from '@mui/icons-material/Videocam';
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

/** 142300 → "142 mil" · 9250 → "9.250" — números grandes do tile de atividade sem estourar. */
const fmtCompact = (n: number): string =>
  n >= 100000 ? `${Math.round(n / 1000)} mil`
  : n >= 10000 ? `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  : n.toLocaleString('pt-BR');

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
  onOpenActivity?: () => void;
  /** Atividade 30d (Health Connect do paciente) — null quando não sincroniza; tile some.
   *  Totais do período em destaque (pedido do dono); médias seguem como contexto. */
  activity?: { days: number; avgSteps: number; avgKcal: number; avgKm: number; totalSteps?: number; totalKcal?: number; totalKm?: number } | null;
  /** Remédios ativos + interações críticas (tile 5 — contexto farmacológico da consulta). */
  medsCount?: number;
  criticalMeds?: number;
  onOpenMeds?: () => void;
  /** Agendamento de teleconsulta diretamente pelo cabeçalho do paciente. */
  onScheduleTele?: () => void;
  /** TRUE enquanto o fetch do paciente corre (critique P1 26/08: sem isto os tiles
   *  mostram '0' verde ANTES do dado chegar — falso 'tudo normal' numa ferramenta
   *  de triagem clínica. Com loading → skeleton em cada tile, NUNCA 0 falso). */
  loading?: boolean;
}

interface Tile {
  key: string;
  label: string;
  icon: ReactNode;
  value: string;
  /** string[] = 1 linha por item (quebras EXPLÍCITAS — wrap aleatório corta frases no meio). */
  sub?: string | string[];
  color: string;
  onClick?: () => void;
}

/**
 * PatientSummary — cabeçalho clínico "hero" do detalhe do paciente.
 * Apresenta avatar (com anel de alerta se hasAlerts), nome, legenda demográfica,
 * botão "Trocar" (Dialog reusando DoctorPatientSwitcher) e 4 teclas clínicas.
 * Cores via theme.palette.primary + alpha (sem hex cru).
 */
export const PatientSummary = ({ patient, exams, abnormal, questions, notes, patients, onSwitchPatient, onAlterados, onOpenExams, onOpenQuestions, onOpenNotes, onOpenActivity, activity, medsCount, criticalMeds, onOpenMeds, onScheduleTele, loading }: PatientSummaryProps) => {
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
    // TOTAIS do período em destaque + média/dia como contexto (pedido do dono: "soma tudo
    // e é dos 30 dias" — a média sozinha escondia o volume). Guard: server sem totais
    // (deploy cruzado) deriva da média × dias.
    ...(activity && activity.days > 0 ? [{
      key: 'activity',
      label: 'Atividade · 30d',
      icon: <DirectionsWalkIcon sx={{ fontSize: 18, color: primary }} />,
      // "30d" já está no label — o value fica curto (1 linha) e o sub quebra em 2
      // linhas EXPLÍCITAS (antes o wrap aleatório derrubava "dias"/"kcal" sozinhos).
      value: `${fmtCompact(activity.totalSteps ?? Math.round(activity.avgSteps * activity.days))} passos`,
      sub: [
        `média ${fmtCompact(activity.avgSteps)}/dia`,
        `${(activity.totalKm ?? activity.avgKm).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km · ${fmtCompact(activity.totalKcal ?? Math.round(activity.avgKcal * activity.days))} kcal`,
      ],
      color: 'text.primary',
      onClick: onOpenActivity,
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
    <Card
      elevation={0}
      sx={{
        p: { xs: 2, md: 2.5 },
        borderRadius: '20px',
        border: '1px solid',
        borderColor: (t) => (t.palette.mode === 'dark' ? 'rgba(32,178,170,0.2)' : '#e2e8f0'),
        background: (t) =>
          t.palette.mode === 'dark'
            ? 'radial-gradient(ellipse 90% 70% at 10% 0%, rgba(32,178,170,0.12), transparent 70%), #152223'
            : '#ffffff',
        boxShadow: (t) =>
          t.palette.mode === 'dark'
            ? '0 10px 30px rgba(0,0,0,0.4)'
            : '0 4px 20px rgba(15,23,42,0.05)',
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
        <Box sx={{ position: 'relative', flexShrink: 0 }}>
          <Box
            sx={{
              position: 'absolute',
              inset: -3,
              borderRadius: '50%',
              border: `2px solid ${ringColor}`,
              opacity: patient?.hasAlerts ? 0.9 : 0.3,
              boxShadow: patient?.hasAlerts ? `0 0 10px ${alpha(ringColor, 0.4)}` : undefined,
              transition: 'box-shadow 0.3s ease',
            }}
          />
          <Avatar
            src={photo}
            sx={{
              width: 54,
              height: 54,
              fontWeight: 800,
              bgcolor: alpha(primary, 0.12),
              color: primary,
              fontSize: 19,
              border: '2px solid #ffffff',
            }}
          >
            {fullName?.charAt(0)}
          </Avatar>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Kicker de papel: desambigua MÉDICO × PACIENTE */}
          <Typography component="div" sx={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', lineHeight: 1.4, color: (t) => copperText(t.palette.mode) }}>
            PACIENTE · PRONTUÁRIO COMPARTILHADO
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ minWidth: 0, mt: 0.25 }}>
            <Typography title={fullName} sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: { xs: 18, md: 20 }, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto', minWidth: 0, color: 'text.primary' }}>
              {fullName}
            </Typography>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0 }}>
              {onScheduleTele && (
                <Button
                  size="small"
                  onClick={onScheduleTele}
                  startIcon={<VideocamIcon sx={{ fontSize: 16 }} />}
                  aria-label="Agendar teleconsulta"
                  sx={{
                    flexShrink: 0,
                    minWidth: 0,
                    textTransform: 'none',
                    fontWeight: 700,
                    fontSize: 12,
                    color: '#0d9488',
                    borderRadius: '999px',
                    py: 0.35,
                    px: 1.25,
                    border: '1px solid',
                    borderColor: 'rgba(13,148,136,0.3)',
                    bgcolor: 'rgba(13,148,136,0.06)',
                    '&:hover': { bgcolor: 'rgba(13,148,136,0.14)', borderColor: '#0d9488' },
                  }}
                >
                  Teleconsulta
                </Button>
              )}
              <Button
                size="small"
                onClick={() => setSwitcherOpen(true)}
                startIcon={<SwapHorizIcon sx={{ fontSize: 16 }} />}
                aria-label="Trocar paciente"
                sx={{
                  flexShrink: 0,
                  minWidth: 0,
                  textTransform: 'none',
                  fontWeight: 700,
                  fontSize: 12,
                  color: 'text.secondary',
                  borderRadius: '999px',
                  py: 0.35,
                  px: 1.25,
                  border: '1px solid',
                  borderColor: '#e2e8f0',
                  bgcolor: '#f8fafc',
                  '&:hover': { bgcolor: '#f1f5f9', borderColor: '#cbd5e1' },
                }}
              >
                Trocar
              </Button>
            </Stack>
          </Stack>
          {caption && <Typography sx={{ color: 'text.secondary', display: 'block', mt: 0.4, fontSize: 12.5, fontWeight: 500, lineHeight: 1.3 }}>{caption}</Typography>}
        </Box>
      </Stack>

      {/* Bento Grid de Resumo Clínico — Destaque absoluto ao card de Alterações */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)', lg: 'repeat(6, 1fr)' }, gap: { xs: 1, sm: 1.25 }, mt: 2, minWidth: 0 }}>
        {tiles.map((t) => {
          const isCritical = t.key === 'alt' && abnormal.total > 0;
          return (
            <Box
              key={t.key}
              onClick={t.onClick}
              onKeyDown={(e) => { if (t.onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); t.onClick(); } }}
              role={t.onClick ? 'button' : undefined}
              tabIndex={t.onClick ? 0 : undefined}
              aria-label={t.onClick ? `Abrir ${t.label}` : undefined}
              sx={{
                p: { xs: 1.25, sm: 1.4 },
                borderRadius: '14px',
                bgcolor: (theme) => {
                  if (isCritical) {
                    return theme.palette.mode === 'dark' ? 'rgba(239, 68, 68, 0.1)' : '#fff8f8';
                  }
                  return theme.palette.mode === 'dark' ? 'background.paper' : '#f8fafc';
                },
                border: '1px solid',
                borderColor: (theme) => {
                  if (isCritical) {
                    return theme.palette.mode === 'dark' ? 'rgba(239, 68, 68, 0.45)' : 'rgba(239, 68, 68, 0.35)';
                  }
                  return theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : '#e2e8f0';
                },
                cursor: t.onClick ? 'pointer' : 'default',
                minWidth: 0,
                overflow: 'hidden',
                boxShadow: (theme) => {
                  if (isCritical) {
                    return theme.palette.mode === 'dark' ? '0 4px 14px rgba(239, 68, 68, 0.15)' : '0 2px 8px rgba(239, 68, 68, 0.08)';
                  }
                  return theme.palette.mode === 'dark' ? '0 2px 8px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.02)';
                },
                transition: 'transform 0.18s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.18s, box-shadow 0.18s',
                '&:hover': t.onClick
                  ? {
                      transform: 'translateY(-2px)',
                      borderColor: isCritical ? 'error.main' : primary,
                      boxShadow: isCritical
                        ? '0 6px 18px rgba(239, 68, 68, 0.18)'
                        : `0 6px 16px ${alpha(primary, 0.16)}`,
                    }
                  : {},
                '&:active': t.onClick ? { transform: 'scale(.98)' } : {},
              }}
            >
              <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5, minWidth: 0 }}>
                {t.icon}
                <Typography variant="caption" noWrap sx={{ color: isCritical ? 'error.main' : 'text.secondary', fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.label}
                </Typography>
                {t.onClick && !loading && <ChevronRightIcon sx={{ fontSize: 15, color: isCritical ? 'error.light' : 'text.disabled' }} />}
              </Stack>
              {loading ? (
                <Skeleton variant="rounded" width={44} height={22} sx={{ mt: 0.5, borderRadius: '6px' }} />
              ) : (
                <Typography sx={{ fontWeight: 800, color: t.color as never, fontSize: isCritical ? 19 : 17, lineHeight: 1.2, overflowWrap: 'anywhere' }}>
                  {t.value}
                </Typography>
              )}
              {!loading && t.sub && (Array.isArray(t.sub)
                ? t.sub.map((line) => <Typography key={line} variant="caption" sx={{ color: isCritical ? 'error.dark' : 'text.secondary', display: 'block', lineHeight: 1.3, fontSize: 11.5 }}>{line}</Typography>)
                : (
                  <Typography
                    variant="caption"
                    noWrap
                    sx={{
                      color: isCritical ? 'error.dark' : 'text.secondary',
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      lineHeight: 1.3,
                      fontSize: 11.5,
                      fontWeight: isCritical ? 700 : 500,
                    }}
                  >
                    {t.sub}
                  </Typography>
                ))}
            </Box>
          );
        })}
      </Box>

      <Dialog open={switcherOpen} onClose={() => setSwitcherOpen(false)} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: '20px', p: 1 } }}>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={1.5}>
            <Typography sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif', fontSize: 18 }}>Selecionar paciente</Typography>
            <DoctorPatientSwitcher patients={patients} value={pid} onSelect={(id) => { onSwitchPatient(id); setSwitcherOpen(false); }} />
            <Button onClick={() => setSwitcherOpen(false)} sx={{ alignSelf: 'flex-end', textTransform: 'none', borderRadius: '999px', fontWeight: 700 }}>Fechar</Button>
          </Stack>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
