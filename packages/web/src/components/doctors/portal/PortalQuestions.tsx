import { useState } from 'react';
import {
  Box, Stack, Typography, Button, Avatar, Chip, TextField,
  Accordion, AccordionSummary, AccordionDetails, CircularProgress, IconButton,
  InputAdornment, Tooltip,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import ChatBubbleOutlineOutlinedIcon from '@mui/icons-material/ChatBubbleOutlineOutlined';
import DoneAllRoundedIcon from '@mui/icons-material/DoneAllRounded';
import MedicalServicesOutlinedIcon from '@mui/icons-material/MedicalServicesOutlined';
import { AppCard } from '../../AppCard';
import { photoUrlFor } from '../../../config';
import { a11yClick, focusRingSx } from './shared';
import { tealText } from '../../../theme';

/** Respostas prontas pro médico (chips de 1 clique) — frases de triagem clínica neutras. */
export const QUICK_REPLIES = [
  'Recebido! Vou analisar seus exames com atenção e já te respondo.',
  'Vamos conversar sobre isso na sua próxima consulta.',
  'Por favor, marque uma consulta para avaliarmos juntos.',
  'Preciso do exame completo/atual para concluir a análise.',
  'Seus resultados estão dentro da normalidade — mantenha o acompanhamento de rotina.',
  'Está tudo estável, sem alterações relevantes. Continue assim!',
];

/**
 * View PERGUNTAS (Inbox global do médico).
 * Organização clínica premium com KPIs de triagem, filtros por status (Pendentes / Respondidas),
 * busca em tempo real e visualização inequívoca de confirmação de resposta médica.
 */
export const PortalQuestions = ({
  allQ,
  allQLoading,
  patients,
  qText,
  setQText,
  qSending,
  replyOpen,
  setReplyOpen,
  onAnswer,
  onRefresh,
  onGoToPatient,
}: {
  allQ: any[];
  allQLoading: boolean;
  patients: any[];
  qText: Record<string, string>;
  setQText: (fn: (t: Record<string, string>) => Record<string, string>) => void;
  qSending: string | null;
  replyOpen: string | null;
  setReplyOpen: (id: string | null) => void;
  onAnswer: (id: string) => void;
  onRefresh: () => void;
  onGoToPatient: (patientId: string) => void;
}) => {
  const [tabFilter, setTabFilter] = useState<'pending' | 'answered' | 'all'>('pending');
  const [search, setSearch] = useState('');

  const openQ = allQ.filter((q: any) => q.status !== 'answered');
  const answeredQ = allQ.filter((q: any) => q.status === 'answered');

  const relDate = (d?: string) => {
    if (!d) return '';
    const days = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 86400000));
    return days === 0 ? 'hoje' : days === 1 ? 'ontem' : `há ${days} dias`;
  };

  // Filtragem combinada por aba e texto de busca
  const filteredQ = allQ.filter((q: any) => {
    const isAnswered = q.status === 'answered';
    if (tabFilter === 'pending' && isAnswered) return false;
    if (tabFilter === 'answered' && !isAnswered) return false;

    if (search.trim()) {
      const term = search.toLowerCase();
      const patientName = String(q.patient?.fullName ?? '').toLowerCase();
      const subject = String(q.subject ?? '').toLowerCase();
      const msgText = (q.messages ?? []).map((m: any) => String(m.body ?? '').toLowerCase()).join(' ');
      if (!patientName.includes(term) && !subject.includes(term) && !msgText.includes(term)) {
        return false;
      }
    }
    return true;
  });

  // Render do Card individual de cada dúvida
  const renderQuestionCard = (q: any) => {
    const answered = q.status === 'answered';
    const patientMsg = (q.messages ?? []).find((m: any) => m.authorRole === 'patient')?.body;
    const questionBody = patientMsg || q.subject || 'Dúvida clínica enviada pelo paciente';
    const lastDoctor = (q.messages ?? []).filter((m: any) => m.authorRole === 'doctor').slice(-1)[0];
    const qp = patients.find((pp: any) => pp.patient?.id === q.patientId);
    const isOpen = replyOpen === q.id;

    return (
      <AppCard
        key={q.id}
        sx={{
          mb: 1.5,
          border: '1px solid',
          borderColor: answered
            ? (t) => t.palette.mode === 'dark' ? 'rgba(16,185,129,0.22)' : 'rgba(16,185,129,0.25)'
            : (t) => t.palette.mode === 'dark' ? 'rgba(245,158,11,0.25)' : 'rgba(245,158,11,0.3)',
          borderRadius: '16px',
          boxShadow: (t) => t.palette.mode === 'dark' ? '0 2px 10px rgba(0,0,0,0.2)' : '0 2px 8px rgba(0,0,0,0.03)',
          transition: 'all .15s ease',
        }}
      >
        <Box sx={{ p: { xs: 1.75, md: 2 } }}>
          {/* Topo do Card: Informações do Paciente + Status da Questão */}
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.25} sx={{ mb: 1.25 }}>
            <Box
              role="button"
              tabIndex={0}
              {...a11yClick(() => onGoToPatient(q.patientId))}
              title="Abrir prontuário e exames do paciente"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
                flex: 1,
                minWidth: 0,
                cursor: 'pointer',
                borderRadius: '12px',
                p: 0.5,
                transition: 'background .15s',
                '&:hover': { bgcolor: 'rgba(32,178,170,.06)' },
                ...focusRingSx,
              }}
            >
              <Avatar
                src={q.patient?.id ? photoUrlFor(q.patient.id) : undefined}
                sx={{
                  bgcolor: 'primary.dark',
                  fontWeight: 800,
                  width: 40,
                  height: 40,
                  flexShrink: 0,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                }}
              >
                {q.patient?.fullName?.charAt(0) || 'P'}
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <Typography sx={{ fontWeight: 800, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 0.5, lineHeight: 1.2 }}>
                    {q.patient?.fullName || 'Paciente'}
                    <OpenInNewIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
                  </Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.2 }}>
                  {relDate(q.createdAt)} · {new Date(q.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  {qp?.age != null ? ` · ${qp.age}a${qp.sex === 'female' ? ' · F' : qp.sex === 'male' ? ' · M' : ''}` : ''}
                </Typography>
              </Box>
            </Box>

            {/* Badge de Status / Ação de Responder */}
            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
              {answered ? (
                <Chip
                  size="small"
                  icon={<CheckCircleOutlinedIcon sx={{ fontSize: '15px !important' }} />}
                  label="Respondida · OK"
                  sx={{
                    bgcolor: 'rgba(16,185,129,0.12)',
                    color: '#059669',
                    fontWeight: 700,
                    borderRadius: '999px',
                    height: 24,
                    fontSize: 11,
                  }}
                />
              ) : (
                <Button
                  size="small"
                  variant={isOpen ? 'outlined' : 'contained'}
                  onClick={() => setReplyOpen(isOpen ? null : q.id)}
                  sx={{
                    borderRadius: '999px',
                    textTransform: 'none',
                    fontWeight: 700,
                    fontSize: 12,
                    px: 1.75,
                    bgcolor: isOpen ? undefined : 'primary.main',
                    color: isOpen ? 'primary.main' : '#fff',
                    boxShadow: 'none',
                    '&:hover': { bgcolor: isOpen ? undefined : 'primary.dark' },
                  }}
                >
                  {isOpen ? 'Fechar' : 'Responder'}
                </Button>
              )}
            </Stack>
          </Stack>

          {/* Dúvida do Paciente (destaque clínico nítido) */}
          <Box
            sx={{
              p: 1.5,
              borderRadius: '12px',
              bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : '#f8fafc',
              borderLeft: '4px solid',
              borderColor: answered ? '#0d9488' : '#f59e0b',
              mt: 1,
            }}
          >
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }}>
              <ChatBubbleOutlineOutlinedIcon sx={{ fontSize: 15, color: answered ? '#0d9488' : '#d97706' }} />
              <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: answered ? '#0d9488' : '#d97706' }}>
                Pergunta do Paciente:
              </Typography>
            </Stack>
            <Typography
              variant="body2"
              sx={{
                color: 'text.primary',
                fontWeight: 500,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              "{questionBody}"
            </Typography>
          </Box>

          {/* Área de Resposta INLINE */}
          {isOpen && !answered && (
            <Box
              sx={{
                mt: 2,
                p: 2,
                borderRadius: '16px',
                bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(32,178,170,0.06)' : 'rgba(32,178,170,0.04)',
                border: '1px solid',
                borderColor: 'rgba(32,178,170,0.25)',
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 700, color: (t) => tealText(t.palette.mode), display: 'block', mb: 1 }}>
                ⚡ Respostas rápidas recomendadas:
              </Typography>
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
                {QUICK_REPLIES.map((t) => (
                  <Chip
                    key={t}
                    size="small"
                    variant="outlined"
                    label={t}
                    onClick={() => setQText((prev) => ({ ...prev, [q.id]: t }))}
                    sx={{
                      fontWeight: 600,
                      height: 'auto',
                      borderRadius: '999px',
                      py: 0.5,
                      borderColor: 'rgba(32,178,170,.35)',
                      color: (t) => tealText(t.palette.mode),
                      '& .MuiChip-label': { whiteSpace: 'normal', lineHeight: 1.3, fontSize: 12 },
                      '&:hover': { bgcolor: 'rgba(32,178,170,.1)' },
                    }}
                  />
                ))}
              </Stack>
              <TextField
                multiline
                minRows={3}
                size="small"
                fullWidth
                placeholder="Escreva sua conduta ou orientação clínica para o paciente..."
                value={qText[q.id] ?? ''}
                onChange={(e) => setQText((t) => ({ ...t, [q.id]: e.target.value }))}
                sx={{
                  bgcolor: (t) => t.palette.mode === 'dark' ? 'background.paper' : '#ffffff',
                  '& .MuiOutlinedInput-root': { borderRadius: '12px' },
                }}
              />
              <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} justifyContent="flex-end">
                <Button
                  size="small"
                  onClick={() => {
                    setQText((t) => ({ ...t, [q.id]: '' }));
                    setReplyOpen(null);
                  }}
                  sx={{ textTransform: 'none', fontWeight: 700, color: 'text.secondary', borderRadius: '999px' }}
                >
                  Cancelar
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  disabled={qSending === q.id || !(qText[q.id]?.trim())}
                  onClick={() => onAnswer(q.id)}
                  startIcon={qSending === q.id ? <CircularProgress size={14} color="inherit" /> : <MedicalServicesOutlinedIcon sx={{ fontSize: 16 }} />}
                  sx={{
                    borderRadius: '999px',
                    textTransform: 'none',
                    fontWeight: 700,
                    px: 2,
                    bgcolor: 'primary.main',
                    boxShadow: 'none',
                    '&:hover': { bgcolor: 'primary.dark' },
                  }}
                >
                  {qSending === q.id ? 'Enviando conduta…' : 'Enviar conduta médica'}
                </Button>
              </Stack>
            </Box>
          )}

          {/* Questão Respondida: Confirmação & Resposta do Médico */}
          {answered && lastDoctor && (
            <Box
              sx={{
                mt: 1.5,
                p: 1.5,
                px: 2,
                borderRadius: '12px',
                bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(16,185,129,0.08)' : 'rgba(240,253,244,0.95)',
                border: '1px solid',
                borderColor: (t) => t.palette.mode === 'dark' ? 'rgba(16,185,129,0.25)' : 'rgba(16,185,129,0.3)',
              }}
            >
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: '#059669', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <DoneAllRoundedIcon sx={{ fontSize: 16 }} />
                  Sua orientação médica enviada
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {new Date(lastDoctor.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </Typography>
              </Stack>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', color: 'text.primary', lineHeight: 1.5 }}>
                {String(lastDoctor.body)}
              </Typography>
            </Box>
          )}
        </Box>
      </AppCard>
    );
  };

  // Agrupamento dos itens filtrados por paciente
  const groupedPatients = (() => {
    const map = new Map<string, { patient: any; qs: any[]; last: number; pendingCount: number; answeredCount: number }>();
    for (const q of filteredQ) {
      const pid = q.patientId || '_unknown';
      const g = map.get(pid) ?? { patient: q.patient, qs: [], last: 0, pendingCount: 0, answeredCount: 0 };
      g.qs.push(q);
      g.last = Math.max(g.last, new Date(q.createdAt).getTime());
      if (q.status === 'answered') g.answeredCount++;
      else g.pendingCount++;
      map.set(pid, g);
    }
    return [...map.values()].sort((a, b) => b.last - a.last);
  })();

  return (
    <>
      {/* Top Header & Métricas de Triagem */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 2.5 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif' }}>
            Perguntas dos Pacientes
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Triagem clínica e respostas às dúvidas dos seus pacientes em acompanhamento.
          </Typography>
        </Box>
        <Tooltip title="Atualizar perguntas">
          <IconButton onClick={onRefresh} disabled={allQLoading} sx={{ color: (t) => tealText(t.palette.mode) }}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {/* KPI Cards Superiores */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2.5 }}>
        <AppCard
          sx={{
            flex: 1,
            borderRadius: '16px',
            bgcolor: tabFilter === 'pending' ? 'rgba(245,158,11,0.08)' : undefined,
            border: '1px solid',
            borderColor: tabFilter === 'pending' ? 'rgba(245,158,11,0.4)' : 'divider',
            cursor: 'pointer',
          }}
          onClick={() => setTabFilter('pending')}
        >
          <Box sx={{ p: 1.75, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 42,
                height: 42,
                borderRadius: '12px',
                display: 'grid',
                placeItems: 'center',
                bgcolor: 'rgba(245,158,11,0.15)',
                color: '#d97706',
              }}
            >
              <ScheduleOutlinedIcon fontSize="small" />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: 20, lineHeight: 1 }}>{openQ.length}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Aguardando sua resposta
              </Typography>
            </Box>
          </Box>
        </AppCard>

        <AppCard
          sx={{
            flex: 1,
            borderRadius: '16px',
            bgcolor: tabFilter === 'answered' ? 'rgba(16,185,129,0.08)' : undefined,
            border: '1px solid',
            borderColor: tabFilter === 'answered' ? 'rgba(16,185,129,0.4)' : 'divider',
            cursor: 'pointer',
          }}
          onClick={() => setTabFilter('answered')}
        >
          <Box sx={{ p: 1.75, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 42,
                height: 42,
                borderRadius: '12px',
                display: 'grid',
                placeItems: 'center',
                bgcolor: 'rgba(16,185,129,0.15)',
                color: '#059669',
              }}
            >
              <CheckCircleOutlinedIcon fontSize="small" />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: 20, lineHeight: 1 }}>{answeredQ.length}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Respondidas e concluídas
              </Typography>
            </Box>
          </Box>
        </AppCard>

        <AppCard
          sx={{
            flex: 1,
            borderRadius: '16px',
            bgcolor: tabFilter === 'all' ? 'rgba(32,178,170,0.08)' : undefined,
            border: '1px solid',
            borderColor: tabFilter === 'all' ? 'rgba(32,178,170,0.4)' : 'divider',
            cursor: 'pointer',
          }}
          onClick={() => setTabFilter('all')}
        >
          <Box sx={{ p: 1.75, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 42,
                height: 42,
                borderRadius: '12px',
                display: 'grid',
                placeItems: 'center',
                bgcolor: 'rgba(32,178,170,0.15)',
                color: (t) => tealText(t.palette.mode),
              }}
            >
              <ChatBubbleOutlineOutlinedIcon fontSize="small" />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: 20, lineHeight: 1 }}>{allQ.length}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Total de dúvidas
              </Typography>
            </Box>
          </Box>
        </AppCard>
      </Stack>

      {/* Barra de Filtros e Busca Rápida */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between" sx={{ mb: 2.5 }}>
        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
          <Chip
            size="medium"
            label={`Pendentes (${openQ.length})`}
            color={tabFilter === 'pending' ? 'warning' : 'default'}
            variant={tabFilter === 'pending' ? 'filled' : 'outlined'}
            onClick={() => setTabFilter('pending')}
            sx={{ fontWeight: 700, borderRadius: '999px' }}
          />
          <Chip
            size="medium"
            label={`Respondidas (${answeredQ.length})`}
            color={tabFilter === 'answered' ? 'success' : 'default'}
            variant={tabFilter === 'answered' ? 'filled' : 'outlined'}
            onClick={() => setTabFilter('answered')}
            sx={{ fontWeight: 700, borderRadius: '999px' }}
          />
          <Chip
            size="medium"
            label={`Todas (${allQ.length})`}
            color={tabFilter === 'all' ? 'primary' : 'default'}
            variant={tabFilter === 'all' ? 'filled' : 'outlined'}
            onClick={() => setTabFilter('all')}
            sx={{ fontWeight: 700, borderRadius: '999px' }}
          />
        </Stack>

        <TextField
          size="small"
          placeholder="Buscar paciente ou dúvida..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
              </InputAdornment>
            ),
          }}
          sx={{
            minWidth: { xs: '100%', sm: 260 },
            '& .MuiOutlinedInput-root': { borderRadius: '999px' },
          }}
        />
      </Stack>

      {/* Loading state */}
      {allQLoading && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <CircularProgress sx={{ color: (t) => tealText(t.palette.mode) }} />
        </Box>
      )}

      {/* Empty State */}
      {!allQLoading && filteredQ.length === 0 && (
        <AppCard sx={{ borderRadius: '20px', border: '1px dashed', borderColor: 'divider' }}>
          <Box sx={{ textAlign: 'center', py: 6, px: 3 }}>
            <Box sx={{ fontSize: 48, mb: 1.5, opacity: 0.6 }}>💬</Box>
            <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 17, mb: 0.5 }}>
              {search ? 'Nenhuma dúvida encontrada' : tabFilter === 'pending' ? 'Todas as dúvidas estão respondidas!' : 'Nenhuma pergunta nesta categoria'}
            </Typography>
            <Typography color="text.secondary" variant="body2">
              {search ? 'Tente buscar por outro termo ou nome de paciente.' : 'Quando os pacientes enviarem perguntas, elas aparecerão organizadas aqui.'}
            </Typography>
          </Box>
        </AppCard>
      )}

      {/* Lista de Pacientes & Perguntas */}
      {!allQLoading && groupedPatients.length > 0 && (
        <Stack spacing={2}>
          {groupedPatients.map((g) => {
            const hasPending = g.pendingCount > 0;
            return (
              <Accordion
                key={g.patient?.id ?? Math.random()}
                defaultExpanded
                elevation={0}
                sx={{
                  '&:before': { display: 'none' },
                  border: '1px solid',
                  borderColor: hasPending
                    ? (t) => t.palette.mode === 'dark' ? 'rgba(245,158,11,0.3)' : 'rgba(245,158,11,0.35)'
                    : 'divider',
                  borderRadius: '16px !important',
                  overflow: 'hidden',
                  boxShadow: (t) => t.palette.mode === 'dark' ? '0 4px 14px rgba(0,0,0,0.2)' : '0 2px 8px rgba(0,0,0,0.03)',
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  sx={{
                    minHeight: '56px !important',
                    bgcolor: (t) => t.palette.mode === 'dark'
                      ? (hasPending ? 'rgba(245,158,11,0.04)' : 'rgba(255,255,255,0.02)')
                      : (hasPending ? 'rgba(245,158,11,0.03)' : '#fcfcfc'),
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    '& .MuiAccordionSummary-content': { my: 0.75 },
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flex: 1, minWidth: 0, pr: 1 }}>
                    <Avatar
                      src={g.patient?.id ? photoUrlFor(g.patient.id) : undefined}
                      sx={{
                        width: 42,
                        height: 42,
                        bgcolor: 'primary.dark',
                        fontSize: 15,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {(g.patient?.fullName || 'P').charAt(0)}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 800, fontSize: 14.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {g.patient?.fullName || 'Paciente'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {g.qs.length} pergunta(s) · última {new Date(g.last).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </Typography>
                    </Box>

                    {/* Badge Organizacional de Estado da Pasta */}
                    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0 }}>
                      {hasPending ? (
                        <Chip
                          size="small"
                          label={`${g.pendingCount} pendente(s)`}
                          sx={{
                            height: 22,
                            fontWeight: 700,
                            fontSize: 11,
                            bgcolor: 'rgba(245,158,11,0.15)',
                            color: '#b45309',
                          }}
                        />
                      ) : (
                        <Chip
                          size="small"
                          label="✓ Todas respondidas"
                          sx={{
                            height: 22,
                            fontWeight: 700,
                            fontSize: 11,
                            bgcolor: 'rgba(16,185,129,0.12)',
                            color: '#059669',
                          }}
                        />
                      )}
                    </Stack>
                  </Stack>
                </AccordionSummary>

                <AccordionDetails sx={{ p: { xs: 1.5, sm: 2 }, bgcolor: (t) => t.palette.mode === 'dark' ? 'transparent' : '#f8fafc' }}>
                  <Stack spacing={1.25}>
                    {g.qs.map(renderQuestionCard)}
                  </Stack>
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Stack>
      )}
    </>
  );
};
