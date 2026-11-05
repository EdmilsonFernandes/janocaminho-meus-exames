import { Box, Stack, Typography, Chip, Divider, Avatar, CircularProgress, Alert } from '@mui/material';
import {
  Assignment as AssignmentIcon,
  Medication as MedicationIcon,
  Warning as WarningIcon,
  Videocam as VideocamIcon,
  Notes as NotesIcon,
  Science as ScienceIcon,
} from '@mui/icons-material';
import { Frame, FramePanel, FrameHeader, FrameTitle, FrameDescription } from '@/components/reui/frame';
import { Badge } from '@/components/reui/badge';
import { IconTile } from '@/components/reui/patterns';

/**
 * PRONTUÁRIO DO PACIENTE — documento clínico consolidado no portal do médico.
 * Reúne numa visualização única o que hoje está espalhado em abas: identificação,
 * medições em uso, valores alterados por prioridade, últimos exames com marcadores,
 * consultas com diagnósticos CID-10, notas do médico e perguntas pendentes.
 *
 * Tudo já vem carregado no DoctorPortal — este componente só apresenta.
 * Não inventa dado: sem informação, o bloco some silenciosamente.
 */

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '') : '—';

const fmtList = (v: any): any[] => (Array.isArray(v) ? v : []);

interface ProntuarioTabProps {
  patient: any;
  abnormalItems: any[];
  abnormalStats: { total: number; importante: number; moderada: number; leve: number };
  exams: any[];
  medsInfo: any;
  notes: any[];
  teleconsultas: any[];
  questions: any[];
  loading?: boolean;
}

export const ProntuarioTab = ({
  patient,
  abnormalItems = [],
  abnormalStats,
  exams = [],
  medsInfo,
  notes = [],
  teleconsultas = [],
  questions = [],
  loading,
}: ProntuarioTabProps) => {
  if (loading) return <Stack alignItems="center" sx={{ py: 6 }}><CircularProgress /></Stack>;

  const fullName = patient?.patient?.fullName ?? patient?.fullName ?? 'Paciente';
  const age = patient?.patient?.dateOfBirth
    ? Math.floor((Date.now() - new Date(patient.patient.dateOfBirth).getTime()) / (365.25 * 86400e3))
    : patient?.age;
  const sex = patient?.patient?.gender === 'female' ? 'F' : patient?.patient?.gender === 'male' ? 'M' : null;

  const activeMeds = (medsInfo?.medications ?? []).filter((m: any) => m?.active);
  const criticalMeds = (medsInfo?.critical ?? []);
  const lastExam = exams[0];
  const lastTeleWithCid = teleconsultas.find((t: any) => t?.cid10Code);
  const openQuestions = questions.filter((q: any) => q?.status !== 'answered');

  const latestItems = (() => {
    if (!abnormalItems.length) return [];
    const times = abnormalItems.map((it: any) => new Date(it.examDate || it.performedAt || it.createdAt || 0).getTime());
    const latest = Math.max(...times);
    return abnormalItems.filter((it: any) => new Date(it.examDate || it.performedAt || it.createdAt || 0).getTime() === latest);
  })();

  return (
    <Stack spacing={2.5}>
      {/* CABEÇALHO — identificação */}
      <Frame>
        <FramePanel className="p-5">
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.5} alignItems={{ sm: 'center' }}>
            <Avatar
              src={patient?.patient?.photoUrl || patient?.patientId ? undefined : undefined}
              sx={{ width: 64, height: 64, fontSize: 24, fontWeight: 800, bgcolor: 'rgba(32,178,170,.12)', color: '#0f766e', borderRadius: '16px' }}
            >
              {fullName.charAt(0).toUpperCase()}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: { xs: 18, sm: 22 }, color: 'text.primary' }}>
                {fullName}
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
                {age != null && <Chip size="small" label={`${age} anos`} sx={{ height: 22, fontWeight: 700 }} />}
                {sex && <Chip size="small" label={sex === 'F' ? 'Feminino' : 'Masculino'} sx={{ height: 22, fontWeight: 700 }} />}
                {patient?.relationship && patient.relationship !== 'self' && <Chip size="small" label={patient.relationship} sx={{ height: 22, fontWeight: 700 }} />}
                {lastExam && <Chip size="small" label={`último exame: ${fmtDate(lastExam.performedAt)}`} sx={{ height: 22, fontWeight: 700, bgcolor: 'rgba(15,118,110,.1)', color: '#178f89' }} />}
              </Stack>
            </Box>
            {/* Score de risco resumido */}
            {abnormalStats.total > 0 && (
              <Stack direction="row" spacing={1.5}>
                {abnormalStats.importante > 0 && (
                  <Stack alignItems="center" sx={{ px: 2, py: 1.25, borderRadius: '14px', bgcolor: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)' }}>
                    <Typography sx={{ fontWeight: 800, fontSize: 24, color: '#ef4444', lineHeight: 1 }}>{abnormalStats.importante}</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: '#ef4444' }}>alta</Typography>
                  </Stack>
                )}
                {abnormalStats.moderada > 0 && (
                  <Stack alignItems="center" sx={{ px: 2, py: 1.25, borderRadius: '14px', bgcolor: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)' }}>
                    <Typography sx={{ fontWeight: 800, fontSize: 24, color: '#f59e0b', lineHeight: 1 }}>{abnormalStats.moderada}</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: '#f59e0b' }}>moderada</Typography>
                  </Stack>
                )}
                {abnormalStats.leve > 0 && (
                  <Stack alignItems="center" sx={{ px: 2, py: 1.25, borderRadius: '14px', bgcolor: 'rgba(100,116,139,.08)', border: '1px solid rgba(100,116,139,.15)' }}>
                    <Typography sx={{ fontWeight: 800, fontSize: 24, color: 'text.secondary', lineHeight: 1 }}>{abnormalStats.leve}</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>leve</Typography>
                  </Stack>
                )}
              </Stack>
            )}
          </Stack>
        </FramePanel>
      </Frame>

      {/* MEDICAÇÕES EM USO */}
      {activeMeds.length > 0 && (
        <Frame>
          <FrameHeader className="pb-2">
            <div className="flex items-center gap-2.5">
              <IconTile tone="primary" size="sm"><MedicationIcon sx={{ fontSize: 16 }} /></IconTile>
              <div>
                <FrameTitle className="text-sm font-extrabold">Medicações em uso ({activeMeds.length})</FrameTitle>
                <FrameDescription className="text-xs">{criticalMeds.length > 0 ? `⚠️ ${criticalMeds.length} com interação crítica` : 'Sem interações críticas detectadas'}</FrameDescription>
              </div>
            </div>
          </FrameHeader>
          <FramePanel className="p-0">
            {activeMeds.slice(0, 8).map((m: any, i: number) => (
              <Box key={m.id ?? i} sx={{ px: 2.5, py: 1.5, borderBottom: i < activeMeds.slice(0, 8).length - 1 ? '1px solid' : 'none', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography sx={{ flex: 1, fontSize: 14, fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.name || m.medication || 'Medicamento'}
                </Typography>
                {m.dose && <Typography variant="caption" color="text.secondary">{m.dose}</Typography>}
                {m.frequency && <Typography variant="caption" color="text.secondary">{m.frequency}</Typography>}
                {criticalMeds.some((c: any) => c.name === m.name) && <Badge variant="destructive-light" size="xs">crítica</Badge>}
              </Box>
            ))}
          </FramePanel>
        </Frame>
      )}

      {/* ÚLTIMO EXAME — valores alterados (prioridade clínica) */}
      {latestItems.length > 0 && (
        <Frame>
          <FrameHeader className="pb-2">
            <div className="flex items-center gap-2.5">
              <IconTile tone="warning" size="sm"><WarningIcon sx={{ fontSize: 16 }} /></IconTile>
              <div>
                <FrameTitle className="text-sm font-extrabold">Último exame — {latestItems.length} valor(es) alterado(s)</FrameTitle>
                <FrameDescription className="text-xs">{fmtDate(latestItems[0]?.examDate || latestItems[0]?.performedAt)}</FrameDescription>
              </div>
            </div>
          </FrameHeader>
          <FramePanel className="p-0">
            {latestItems.slice(0, 10).map((it: any, i: number) => {
              const val = it.valueNumeric ?? it.value;
              const ref = it.refLow != null && it.refHigh != null ? `${it.refLow}–${it.refHigh}` : it.refRange || '';
              const isHigh = it.refHigh != null && Number(val) > Number(it.refHigh);
              const isLow = it.refLow != null && Number(val) < Number(it.refLow);
              const sev = it.severity || it.priority;
              return (
                <Box key={it.id ?? i} sx={{ px: 2.5, py: 1.25, borderBottom: i < Math.min(latestItems.length, 10) - 1 ? '1px solid' : 'none', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Typography sx={{ flex: 1, fontSize: 13.5, fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.nameDisplay || it.nameCanonical || it.name || 'Marcador'}
                  </Typography>
                  <Typography sx={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: isHigh ? '#ef4444' : isLow ? '#3b82f6' : 'text.primary' }}>
                    {val} {it.unit || ''}
                  </Typography>
                  {ref && <Typography variant="caption" color="text.secondary">ref: {ref}</Typography>}
                  {sev === 'importante' && <Badge variant="destructive-light" size="xs">alta</Badge>}
                  {sev === 'moderada' && <Badge variant="warning-light" size="xs">moderada</Badge>}
                </Box>
              );
            })}
          </FramePanel>
        </Frame>
      )}

      {/* DIAGNÓSTICO CID-10 da última consulta */}
      {lastTeleWithCid?.cid10Code && (
        <Frame>
          <FramePanel className="p-4">
            <Stack direction="row" spacing={2} alignItems="center">
              <IconTile tone="info" size="sm"><ScienceIcon sx={{ fontSize: 16 }} /></IconTile>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 800, fontSize: 14 }}>
                  CID-10: <span style={{ fontFamily: 'monospace' }}>{lastTeleWithCid.cid10Code}</span>
                </Typography>
                <Typography variant="body2" color="text.secondary">{lastTeleWithCid.cid10Desc}</Typography>
              </Box>
              <Chip size="small" label={fmtDate(lastTeleWithCid.dueDate)} sx={{ height: 22, fontWeight: 700 }} />
            </Stack>
          </FramePanel>
        </Frame>
      )}

      {/* HISTÓRICO DE CONSULTAS (com laudos) */}
      {teleconsultas.length > 0 && (
        <Frame>
          <FrameHeader className="pb-2">
            <div className="flex items-center gap-2.5">
              <IconTile tone="primary" size="sm"><VideocamIcon sx={{ fontSize: 16 }} /></IconTile>
              <FrameTitle className="text-sm font-extrabold">Consultas ({teleconsultas.length})</FrameTitle>
            </div>
          </FrameHeader>
          <FramePanel className="p-0">
            {teleconsultas.slice(0, 5).map((t: any, i: number) => (
              <Box key={t.id ?? i} sx={{ px: 2.5, py: 1.5, borderBottom: i < Math.min(teleconsultas.length, 5) - 1 ? '1px solid' : 'none', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', minWidth: 90, flexShrink: 0 }}>{fmtDate(t.dueDate)}</Typography>
                <Typography sx={{ flex: 1, fontSize: 13.5, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.title || 'Teleconsulta'}
                </Typography>
                {t.cid10Code && <Chip size="small" label={t.cid10Code} sx={{ height: 20, fontSize: 10.5, fontWeight: 700, fontFamily: 'monospace', bgcolor: 'action.hover' }} />}
                {t.consultSummaryApproved && <Badge variant="success-light" size="xs">laudo ✓</Badge>}
                {t.endedAt && !t.consultSummaryApproved && <Badge variant="outline" size="xs">sem laudo</Badge>}
              </Box>
            ))}
          </FramePanel>
        </Frame>
      )}

      {/* NOTAS DO MÉDICO */}
      {notes.length > 0 && (
        <Frame>
          <FrameHeader className="pb-2">
            <div className="flex items-center gap-2.5">
              <IconTile tone="muted" size="sm"><NotesIcon sx={{ fontSize: 16 }} /></IconTile>
              <FrameTitle className="text-sm font-extrabold">Anotações ({notes.length})</FrameTitle>
            </div>
          </FrameHeader>
          <FramePanel className="p-0">
            {notes.slice(0, 3).map((n: any, i: number) => (
              <Box key={n.id ?? i} sx={{ px: 2.5, py: 1.5, borderBottom: i < Math.min(notes.length, 3) - 1 ? '1px solid' : 'none', borderColor: 'divider' }}>
                <Stack direction="row" alignItems="baseline" gap={1}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtDate(n.createdAt)}</Typography>
                </Stack>
                <Typography sx={{ fontSize: 13.5, mt: 0.25, lineHeight: 1.5 }}>{n.content}</Typography>
              </Box>
            ))}
          </FramePanel>
        </Frame>
      )}

      {/* PERGUNTAS PENDENTES */}
      {openQuestions.length > 0 && (
        <Alert severity="warning" icon={false} sx={{ borderRadius: '16px', border: '1px solid rgba(245,158,11,.25)' }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <AssignmentIcon sx={{ color: '#f59e0b', fontSize: 20 }} />
            <Typography sx={{ fontWeight: 700, fontSize: 13.5 }}>
              {openQuestions.length} {openQuestions.length === 1 ? 'pergunta aguardando resposta' : 'perguntas aguardando resposta'}
            </Typography>
          </Stack>
        </Alert>
      )}

      {/* Empty state completo */}
      {exams.length === 0 && activeMeds.length === 0 && teleconsultas.length === 0 && notes.length === 0 && (
        <Frame>
          <FramePanel className="p-6 text-center">
            <AssignmentIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1.5 }} />
            <Typography sx={{ fontWeight: 800, fontSize: 16, mb: 0.5 }}>Prontuário vazio</Typography>
            <Typography variant="body2" color="text.secondary">
              Quando o paciente compartilhar exames ou você registrar consultas, tudo aparece aqui consolidado.
            </Typography>
          </FramePanel>
        </Frame>
      )}
    </Stack>
  );
};
