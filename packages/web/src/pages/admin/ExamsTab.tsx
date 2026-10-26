import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Stack,
  Chip,
  Alert,
  TextField,
  InputAdornment,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Avatar,
  Collapse,
  Tooltip,
  Paper,
  Divider,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PersonIcon from '@mui/icons-material/Person';
import BugReportIcon from '@mui/icons-material/BugReport';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ViewListIcon from '@mui/icons-material/ViewList';
import GroupWorkIcon from '@mui/icons-material/GroupWork';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { API_URL, token } from '../../config';
import { TabLoader, SectionError } from './parts';

const initials = (name?: string | null): string => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};


const H = () => ({ Authorization: `Bearer ${token()}` });

const STATUS_COLOR: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default'> = {
  EXTRACTED: 'success',
  FAILED: 'error',
  UPLOADED: 'warning',
  EXTRACTING: 'info',
  DUPLICATE: 'default',
  REJECTED: 'error',
};

const FAILURE_REASONS = [
  { id: 'low_quality', label: 'Foto ilegível, baixa resolução ou tremida' },
  { id: 'cut_off', label: 'Documento cortado ou sem cabeçalho do laboratório' },
  { id: 'not_a_document', label: 'Documento não médico ou foto pessoal' },
  { id: 'complex_table', label: 'Tabela complexa / IA omitiu analitos ou referências' },
  { id: 'ocr_failure', label: 'Falha de OCR / Caracteres ilegíveis ou corrompidos' },
  { id: 'password_protected', label: 'PDF protegido com senha' },
  { id: 'ia_timeout', label: 'Instabilidade ou timeout na conexão com provedor de IA' },
  { id: 'other', label: 'Outro motivo (descrever nas notas)' },
];

interface ExamItemData {
  id: string;
  title: string;
  kind?: string;
  status: string;
  performedAt?: string | null;
  createdAt: string;
  extractionError?: string | null;
  failureKind?: string | null;
  rawExtraction?: any;
  patientId?: string;
  pageCount?: number;
  fileSizeBytes?: number;
  _count?: { items: number };
  patient?: {
    id?: string;
    fullName: string;
    owner?: { id?: string; email?: string; phone?: string } | null;
  } | null;
}

export const ExamsTab = () => {
  const [d, setD] = useState<{ exams: ExamItemData[]; byStatus: { status: string; _count: number }[]; recentFailed: any[] } | null>(null);
  const [err, setErr] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'byPatient' | 'list'>('byPatient');
  const [expandedPatients, setExpandedPatients] = useState<Record<string, boolean>>({});

  // Modal de diagnóstico & feedback de falha
  const [diagExam, setDiagExam] = useState<ExamItemData | null>(null);
  const [failureReason, setFailureReason] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const [reprocessBusy, setReprocessBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [copiedError, setCopiedError] = useState(false);

  const load = () => {
    setErr(false);
    fetch(`${API_URL}/admin/exams`, { headers: H() })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        setD(data);
      })
      .catch(() => setErr(true));
  };

  useEffect(load, []);

  // Filtragem e busca reativa
  const filteredExams = useMemo(() => {
    if (!d?.exams) return [];
    return d.exams.filter((e) => {
      if (statusFilter !== 'ALL' && e.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const matchTitle = (e.title || '').toLowerCase().includes(q);
      const matchPatient = (e.patient?.fullName || '').toLowerCase().includes(q);
      const matchOwner = (e.patient?.owner?.email || '').toLowerCase().includes(q);
      const matchError = (e.extractionError || '').toLowerCase().includes(q);
      return matchTitle || matchPatient || matchOwner || matchError;
    });
  }, [d?.exams, statusFilter, search]);

  // Agrupamento estruturado por paciente
  const patientGroups = useMemo(() => {
    const groups: Record<
      string,
      {
        patientKey: string;
        patientName: string;
        ownerEmail?: string;
        ownerPhone?: string;
        exams: ExamItemData[];
        counts: Record<string, number>;
        latestDate: string;
      }
    > = {};

    for (const e of filteredExams) {
      const key = e.patientId || e.patient?.fullName || 'sem-paciente';
      const name = e.patient?.fullName || 'Paciente Não Identificado';
      if (!groups[key]) {
        groups[key] = {
          patientKey: key,
          patientName: name,
          ownerEmail: e.patient?.owner?.email,
          ownerPhone: e.patient?.owner?.phone,
          exams: [],
          counts: {},
          latestDate: e.createdAt,
        };
      }
      groups[key].exams.push(e);
      groups[key].counts[e.status] = (groups[key].counts[e.status] || 0) + 1;
      if (new Date(e.createdAt) > new Date(groups[key].latestDate)) {
        groups[key].latestDate = e.createdAt;
      }
    }

    return Object.values(groups).sort((a, b) => b.exams.length - a.exams.length);
  }, [filteredExams]);

  const togglePatient = (key: string) => {
    setExpandedPatients((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    patientGroups.forEach((g) => {
      next[g.patientKey] = true;
    });
    setExpandedPatients(next);
  };

  const collapseAll = () => {
    setExpandedPatients({});
  };

  const openDiagnostic = (exam: ExamItemData) => {
    setDiagExam(exam);
    const existingReview = exam.rawExtraction?.adminReview;
    setFailureReason(existingReview?.failureReason || exam.failureKind || 'low_quality');
    setAdminNotes(existingReview?.adminNotes || '');
    setCopiedError(false);
  };

  const saveDiagnostic = async () => {
    if (!diagExam) return;
    setSaveBusy(true);
    try {
      const res = await fetch(`${API_URL}/admin/exams/${diagExam.id}/failure-feedback`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...H() },
        body: JSON.stringify({
          failureKind: failureReason,
          failureReason,
          adminNotes,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        // Atualiza localmente
        setD((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            exams: prev.exams.map((item) =>
              item.id === diagExam.id
                ? {
                    ...item,
                    failureKind: failureReason,
                    rawExtraction: json.exam?.rawExtraction || {
                      ...item.rawExtraction,
                      adminReview: { failureReason, adminNotes, reviewedAt: new Date().toISOString() },
                    },
                  }
                : item
            ),
          };
        });
        setToastMsg('Diagnóstico de erro salvo com sucesso!');
        setTimeout(() => setToastMsg(null), 3500);
        setDiagExam(null);
      } else {
        alert('Erro ao salvar diagnóstico');
      }
    } catch {
      alert('Erro de conexão');
    } finally {
      setSaveBusy(false);
    }
  };

  const reprocessExam = async (id: string) => {
    setReprocessBusy(true);
    try {
      const res = await fetch(`${API_URL}/admin/exams/${id}/reprocess`, {
        method: 'POST',
        headers: H(),
      });
      if (res.ok) {
        setD((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            exams: prev.exams.map((item) => (item.id === id ? { ...item, status: 'EXTRACTING', extractionError: null } : item)),
          };
        });
        setToastMsg('Exame enviado para reprocessamento!');
        setTimeout(() => setToastMsg(null), 3500);
        setDiagExam(null);
      } else {
        alert('Não foi possível reprocessar este exame.');
      }
    } catch {
      alert('Erro de conexão ao reprocessar.');
    } finally {
      setReprocessBusy(false);
    }
  };

  const copyErrorText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedError(true);
    setTimeout(() => setCopiedError(false), 2000);
  };

  if (!d && !err) return <TabLoader />;
  if (err) return <SectionError message="Não foi possível carregar os exames." onRetry={load} />;

  const totalExamsCount = d?.exams.length || 0;
  const failedCount = d?.byStatus.find((s) => s.status === 'FAILED')?._count || 0;

  return (
    <Box sx={{ width: '100%', pb: 4 }}>
      {toastMsg && (
        <Alert severity="success" sx={{ mb: 2, borderRadius: '12px', fontWeight: 700 }}>
          {toastMsg}
        </Alert>
      )}

      {/* Banner de falhas se houver erros recentes */}
      {failedCount > 0 && (
        <Alert
          severity="warning"
          icon={<WarningAmberIcon />}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => setStatusFilter(statusFilter === 'FAILED' ? 'ALL' : 'FAILED')}
              sx={{ fontWeight: 800, textTransform: 'none' }}
            >
              {statusFilter === 'FAILED' ? 'Ver Todos' : 'Ver Apenas com Falha'}
            </Button>
          }
          sx={{ mb: 2.5, borderRadius: '14px', border: '1px solid rgba(245,158,11,0.3)' }}
        >
          <strong>{failedCount} exame(s) com erro de extração</strong> encontrados. Você pode revisar o motivo e ajudar a calibrar os modelos da IA.
        </Alert>
      )}

      {/* Barra de Filtros Interativos por Status */}
      <Paper
        elevation={0}
        sx={{
          p: 1.75,
          borderRadius: '16px',
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#fff'),
          mb: 2.5,
        }}
      >
        <Stack spacing={1.5}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Filtrar por Status da Extração
            </Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
              Mostrando {filteredExams.length} de {totalExamsCount} exames
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Chip
              label={`TODOS (${totalExamsCount})`}
              onClick={() => setStatusFilter('ALL')}
              variant={statusFilter === 'ALL' ? 'filled' : 'outlined'}
              color={statusFilter === 'ALL' ? 'primary' : 'default'}
              sx={{
                fontWeight: 800,
                cursor: 'pointer',
                borderRadius: '8px',
                height: 30,
                fontSize: 12,
              }}
            />
            {d?.byStatus.map((s) => {
              const active = statusFilter === s.status;
              const col = STATUS_COLOR[s.status] ?? 'default';
              return (
                <Chip
                  key={s.status}
                  label={`${s.status}: ${s._count}`}
                  onClick={() => setStatusFilter(active ? 'ALL' : s.status)}
                  variant={active ? 'filled' : 'outlined'}
                  color={col}
                  sx={{
                    fontWeight: 700,
                    cursor: 'pointer',
                    borderRadius: '8px',
                    height: 30,
                    fontSize: 12,
                    boxShadow: active ? '0 0 0 2px rgba(0,0,0,0.1)' : 'none',
                  }}
                />
              );
            })}
          </Stack>
        </Stack>
      </Paper>

      {/* Barra de Controles: Busca + Alternador de Visualização */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="center" justifyContent="space-between" sx={{ mb: 2.5 }}>
        <TextField
          size="small"
          placeholder="Buscar por paciente, exame ou detalhe do erro…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{
            flex: 1,
            width: '100%',
            maxWidth: { xs: '100%', sm: 420 },
            '& .MuiOutlinedInput-root': { borderRadius: '12px' },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
              </InputAdornment>
            ),
          }}
        />

        <Stack direction="row" spacing={1} alignItems="center" sx={{ width: { xs: '100%', sm: 'auto' }, justifyContent: 'flex-end' }}>
          {viewMode === 'byPatient' && (
            <Stack direction="row" spacing={0.5}>
              <Button size="small" variant="text" onClick={expandAll} sx={{ fontSize: 12, textTransform: 'none', fontWeight: 700 }}>
                Expandir Todos
              </Button>
              <Button size="small" variant="text" onClick={collapseAll} sx={{ fontSize: 12, textTransform: 'none', fontWeight: 700 }}>
                Recolher Todos
              </Button>
            </Stack>
          )}

          <Box sx={{ display: 'flex', bgcolor: 'action.hover', p: 0.5, borderRadius: '10px' }}>
            <Tooltip title="Agrupado por Paciente (organizado)">
              <IconButton
                size="small"
                onClick={() => setViewMode('byPatient')}
                sx={{
                  borderRadius: '8px',
                  bgcolor: viewMode === 'byPatient' ? 'background.paper' : 'transparent',
                  color: viewMode === 'byPatient' ? 'primary.main' : 'text.secondary',
                  boxShadow: viewMode === 'byPatient' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                <GroupWorkIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Lista Cronológica Simples">
              <IconButton
                size="small"
                onClick={() => setViewMode('list')}
                sx={{
                  borderRadius: '8px',
                  bgcolor: viewMode === 'list' ? 'background.paper' : 'transparent',
                  color: viewMode === 'list' ? 'primary.main' : 'text.secondary',
                  boxShadow: viewMode === 'list' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                <ViewListIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </Box>
        </Stack>
      </Stack>

      {/* MODO 1: AGRUPADO POR PACIENTE (Organizado) */}
      {viewMode === 'byPatient' ? (
        <Stack spacing={2}>
          {patientGroups.length === 0 ? (
            <Paper sx={{ p: 4, textAlign: 'center', borderRadius: '16px' }}>
              <Typography color="text.secondary">Nenhum exame encontrado com os filtros atuais.</Typography>
            </Paper>
          ) : (
            patientGroups.map((group) => {
              const isExpanded = !!expandedPatients[group.patientKey];
              const extractedCount = group.counts.EXTRACTED || 0;
              const failCount = group.counts.FAILED || 0;

              return (
                <Card
                  key={group.patientKey}
                  variant="outlined"
                  sx={{
                    borderRadius: '16px',
                    borderColor: failCount > 0 ? 'rgba(239,68,68,0.3)' : 'divider',
                    boxShadow: failCount > 0 ? '0 4px 16px rgba(239,68,68,0.04)' : 'none',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    {/* Cabeçalho do Paciente */}
                    <Box
                      onClick={() => togglePatient(group.patientKey)}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0, flex: 1 }}>
                        <Avatar
                          sx={{
                            width: 44,
                            height: 44,
                            fontSize: 16,
                            fontWeight: 800,
                            bgcolor: failCount > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(13,148,136,0.12)',
                            color: failCount > 0 ? '#ef4444' : '#0d9488',
                          }}
                        >
                          {initials(group.patientName)}
                        </Avatar>

                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                            <Typography sx={{ fontWeight: 800, fontSize: 15, color: 'text.primary' }}>
                              {group.patientName}
                            </Typography>
                            {group.ownerEmail && (
                              <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                                ({group.ownerEmail})
                              </Typography>
                            )}
                          </Stack>

                          <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>
                            Último envio: {new Date(group.latestDate).toLocaleDateString('pt-BR')} · {group.exams.length} exame(s)
                          </Typography>
                        </Box>
                      </Stack>

                      {/* Badges de Status do Paciente */}
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ flexShrink: 0, ml: 1 }}>
                        {extractedCount > 0 && (
                          <Chip
                            size="small"
                            color="success"
                            label={`${extractedCount} ok`}
                            sx={{ height: 22, fontSize: 11, fontWeight: 700 }}
                          />
                        )}
                        {failCount > 0 && (
                          <Chip
                            size="small"
                            color="error"
                            label={`${failCount} com falha`}
                            sx={{ height: 22, fontSize: 11, fontWeight: 800 }}
                          />
                        )}
                        <IconButton size="small" sx={{ color: 'text.secondary' }}>
                          {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        </IconButton>
                      </Stack>
                    </Box>

                    {/* Exames do Paciente (Colapsável) */}
                    <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                      <Divider sx={{ my: 1.75 }} />
                      <Stack spacing={1.25} sx={{ pl: { xs: 0, sm: 2 } }}>
                        {group.exams.map((e) => (
                          <Box
                            key={e.id}
                            sx={{
                              p: 1.5,
                              borderRadius: '12px',
                              bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#f8fafc'),
                              border: '1px solid',
                              borderColor: e.status === 'FAILED' ? 'rgba(239,68,68,0.3)' : 'divider',
                            }}
                          >
                            <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" sx={{ mb: 0.5 }}>
                                  <Chip
                                    size="small"
                                    color={STATUS_COLOR[e.status] ?? 'default'}
                                    label={e.status}
                                    sx={{ height: 20, fontSize: 11, fontWeight: 800 }}
                                  />
                                  <Typography sx={{ fontWeight: 700, fontSize: 13.5, color: 'text.primary' }}>
                                    {e.title || 'Sem título'}
                                  </Typography>
                                  <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                                    · {e._count?.items ?? 0} itens extraídos
                                  </Typography>
                                </Stack>

                                <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>
                                  Data do Exame: {e.performedAt ? new Date(e.performedAt).toLocaleDateString('pt-BR') : 'Não informada'} · Cadastrado em: {new Date(e.createdAt).toLocaleDateString('pt-BR')} {new Date(e.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                </Typography>

                                {/* Se houve erro na extração */}
                                {e.status === 'FAILED' && (
                                  <Box sx={{ mt: 1, p: 1, borderRadius: '8px', bgcolor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                                    <Typography sx={{ fontSize: 11.5, color: 'error.main', fontWeight: 600, wordBreak: 'break-word' }}>
                                      ⚠️ {e.extractionError || 'Erro desconhecido durante o processamento do documento.'}
                                    </Typography>
                                    {e.rawExtraction?.adminReview && (
                                      <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 0.5 }}>
                                        🔍 Diagnóstico Salvo: <strong>{e.rawExtraction.adminReview.failureReason}</strong>
                                        {e.rawExtraction.adminReview.adminNotes ? ` — "${e.rawExtraction.adminReview.adminNotes}"` : ''}
                                      </Typography>
                                    )}
                                  </Box>
                                )}
                              </Box>

                              {/* Ações do Exame */}
                              <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                                {e.status === 'FAILED' && (
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    color="error"
                                    startIcon={<BugReportIcon sx={{ fontSize: 15 }} />}
                                    onClick={() => openDiagnostic(e)}
                                    sx={{
                                      fontSize: 11.5,
                                      fontWeight: 800,
                                      textTransform: 'none',
                                      borderRadius: '8px',
                                      height: 30,
                                      px: 1.25,
                                    }}
                                  >
                                    {e.rawExtraction?.adminReview ? 'Ver Diagnóstico' : 'Diagnosticar'}
                                  </Button>
                                )}
                                <Button
                                  size="small"
                                  variant="outlined"
                                  startIcon={<AutorenewIcon sx={{ fontSize: 15 }} />}
                                  onClick={() => reprocessExam(e.id)}
                                  sx={{
                                    fontSize: 11.5,
                                    fontWeight: 700,
                                    textTransform: 'none',
                                    borderRadius: '8px',
                                    height: 30,
                                    px: 1,
                                  }}
                                >
                                  Reprocessar
                                </Button>
                              </Stack>
                            </Stack>
                          </Box>
                        ))}
                      </Stack>
                    </Collapse>
                  </CardContent>
                </Card>
              );
            })
          )}
        </Stack>
      ) : (
        /* MODO 2: LISTA CRONOLÓGICA SIMPLES */
        <Stack spacing={1.25}>
          {filteredExams.map((e) => (
            <Card key={e.id} variant="outlined" sx={{ borderRadius: '12px' }}>
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap" sx={{ mb: 0.5 }}>
                  <Chip
                    size="small"
                    color={STATUS_COLOR[e.status] ?? 'default'}
                    label={e.status}
                    sx={{ height: 22, fontSize: 11.5, fontWeight: 700 }}
                  />
                  <Typography sx={{ fontWeight: 700, flex: 1, minWidth: 0, wordBreak: 'break-word', fontSize: 14 }}>
                    {e.title || 'Sem título'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {e._count?.items ?? 0} itens extraídos
                  </Typography>
                </Stack>

                <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
                  <Typography variant="caption" color="text.secondary">
                    👤 <strong>{e.patient?.fullName ?? 'Paciente Não Identificado'}</strong> · {new Date(e.createdAt).toLocaleDateString('pt-BR')}
                  </Typography>

                  <Stack direction="row" spacing={1}>
                    {e.status === 'FAILED' && (
                      <Button
                        size="small"
                        color="error"
                        variant="outlined"
                        startIcon={<BugReportIcon sx={{ fontSize: 15 }} />}
                        onClick={() => openDiagnostic(e)}
                        sx={{ fontSize: 11, fontWeight: 700, textTransform: 'none', height: 26, borderRadius: '6px' }}
                      >
                        {e.rawExtraction?.adminReview ? 'Ver Diagnóstico' : 'Diagnosticar'}
                      </Button>
                    )}
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<AutorenewIcon sx={{ fontSize: 15 }} />}
                      onClick={() => reprocessExam(e.id)}
                      sx={{ fontSize: 11, fontWeight: 700, textTransform: 'none', height: 26, borderRadius: '6px' }}
                    >
                      Reprocessar
                    </Button>
                  </Stack>
                </Stack>

                {e.extractionError && (
                  <Box sx={{ mt: 1, p: 0.75, borderRadius: '6px', bgcolor: 'rgba(239,68,68,0.06)' }}>
                    <Typography variant="caption" sx={{ color: 'error.main', display: 'block' }}>
                      ⚠️ {e.extractionError}
                    </Typography>
                  </Box>
                )}
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      {/* DIALOG DE DIAGNÓSTICO DE FALHA & MELHORIA DO SISTEMA */}
      <Dialog
        open={Boolean(diagExam)}
        onClose={() => setDiagExam(null)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: '20px' } }}
      >
        <DialogTitle sx={{ fontWeight: 800, fontSize: 18, pb: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <BugReportIcon sx={{ color: 'error.main' }} />
            <span>Diagnóstico de Falha & Aprendizado do Sistema</span>
          </Stack>
        </DialogTitle>

        <DialogContent dividers sx={{ p: 2.5 }}>
          {diagExam && (
            <Stack spacing={2}>
              <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: 'action.hover' }}>
                <Typography sx={{ fontSize: 13, fontWeight: 800 }}>{diagExam.title}</Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>
                  Paciente: <strong>{diagExam.patient?.fullName || '—'}</strong> · ID: {diagExam.id}
                </Typography>
              </Box>

              {/* Log do erro com botão de cópia */}
              <Box>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'error.main' }}>
                    Mensagem de Erro Registrada pela IA:
                  </Typography>
                  <Tooltip title="Copiar log">
                    <Button
                      size="small"
                      startIcon={<ContentCopyIcon sx={{ fontSize: 13 }} />}
                      onClick={() => copyErrorText(diagExam.extractionError || '')}
                      sx={{ fontSize: 11, textTransform: 'none' }}
                    >
                      {copiedError ? 'Copiado!' : 'Copiar'}
                    </Button>
                  </Tooltip>
                </Stack>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 1.25,
                    maxHeight: 120,
                    overflowY: 'auto',
                    fontFamily: 'monospace',
                    fontSize: 11.5,
                    bgcolor: (t) => (t.palette.mode === 'dark' ? '#111' : '#fef2f2'),
                    borderColor: 'rgba(239,68,68,0.3)',
                    color: (t) => (t.palette.mode === 'dark' ? '#fca5a5' : '#b91c1c'),
                    wordBreak: 'break-word',
                  }}
                >
                  {diagExam.extractionError || 'Nenhum log de erro detalhado disponível.'}
                </Paper>
              </Box>

              {/* Classificação do Motivo */}
              <FormControl fullWidth size="small">
                <InputLabel id="failure-reason-label">Causa Principal da Falha</InputLabel>
                <Select
                  labelId="failure-reason-label"
                  label="Causa Principal da Falha"
                  value={failureReason}
                  onChange={(e) => setFailureReason(e.target.value)}
                >
                  {FAILURE_REASONS.map((r) => (
                    <MenuItem key={r.id} value={r.id}>
                      {r.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Notas do Administrador / Engenharia */}
              <TextField
                fullWidth
                multiline
                rows={3}
                size="small"
                label="Como o sistema deve melhorar neste caso? (Notas para engenharia/IA)"
                placeholder="Ex: O laboratório usa fonte muito fina; treinar modelo para esse layout de hemograma; ignorar carimbo médico..."
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
              />

              {/* Informações da última revisão */}
              {diagExam.rawExtraction?.adminReview && (
                <Box sx={{ p: 1, borderRadius: '8px', bgcolor: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <Typography sx={{ fontSize: 11, color: 'success.main', fontWeight: 700 }}>
                    ✓ Já diagnosticado anteriormente por {diagExam.rawExtraction.adminReview.reviewedBy} em{' '}
                    {new Date(diagExam.rawExtraction.adminReview.reviewedAt).toLocaleString('pt-BR')}
                  </Typography>
                </Box>
              )}
            </Stack>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
          <Button
            color="warning"
            variant="text"
            disabled={reprocessBusy}
            startIcon={<AutorenewIcon />}
            onClick={() => diagExam && reprocessExam(diagExam.id)}
            sx={{ fontWeight: 700, textTransform: 'none' }}
          >
            Reprocessar Exame
          </Button>

          <Stack direction="row" spacing={1}>
            <Button onClick={() => setDiagExam(null)} sx={{ textTransform: 'none', fontWeight: 600 }}>
              Cancelar
            </Button>
            <Button
              variant="contained"
              color="primary"
              disabled={saveBusy}
              onClick={saveDiagnostic}
              sx={{ fontWeight: 800, textTransform: 'none', borderRadius: '10px' }}
            >
              Salvar Diagnóstico
            </Button>
          </Stack>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
