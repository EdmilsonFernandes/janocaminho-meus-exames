import { useEffect, useState } from 'react';
import { useTranslate } from 'react-admin';
import {
  Box, Typography, Card, CardContent, Stack, Chip, Avatar, CircularProgress,
  Dialog, IconButton, Select, MenuItem, TextField, FormControl,
  Accordion, AccordionSummary, AccordionDetails, Button, Tooltip,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CloseIcon from '@mui/icons-material/Close';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import ChatBubbleOutlineOutlinedIcon from '@mui/icons-material/ChatBubbleOutlineOutlined';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import HourglassEmptyRoundedIcon from '@mui/icons-material/HourglassEmptyRounded';
import MedicalServicesOutlinedIcon from '@mui/icons-material/MedicalServicesOutlined';
import { API_URL, token, photoUrlFor, doctorPhotoUrl } from '../config';
import { QuestionStatusBadge } from '../components/QuestionStatusBadge';
import { useSelectedPatient } from '../patient-context';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { PageSkeleton } from '../components/PageSkeleton';

const H = () => ({ Authorization: `Bearer ${token()}` });
const TEAL = '#178f89';

/**
 * "Minhas perguntas" — tela de acompanhamento das dúvidas enviadas aos médicos.
 * Apresentação clínica premium com cards destacados para a pergunta do paciente e
 * a orientação enviada pelo médico, com thread completa em modal.
 */
export const QuestionsPage = () => {
  const translate = useTranslate();
  const [pid] = useSelectedPatient();
  const [items, setItems] = useState<any[]>([]);
  const [shares, setShares] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<any | null>(null);
  const [thread, setThread] = useState<any[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [qFilter, setQFilter] = useState<'all' | 'pending' | 'answered'>('all');
  const [doctorFilter, setDoctorFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [qr, sr] = await Promise.all([
        fetch(`${API_URL}/doctor-questions${pid ? `?patientId=${pid}` : ''}`, { headers: H() }),
        fetch(`${API_URL}/doctor-shares`, { headers: H() }),
      ]);
      if (qr.ok) { const d = await qr.json(); setItems(d.items ?? []); }
      if (sr.ok) { const d = await sr.json(); setShares((d.items ?? []).filter((x: any) => x.active !== false)); }
    } catch {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [pid]);

  const openThread = async (q: any) => {
    setOpen(q); setThreadLoading(true); setThread([]);
    try {
      const r = await fetch(`${API_URL}/doctor-questions/${q.id}`, { headers: H() });
      if (r.ok) { const d = await r.json(); setThread(d.item?.messages ?? []); }
    } catch {} finally { setThreadLoading(false); }
  };

  if (loading) return <PageSkeleton />;

  const doctors = Array.from(new Map(items.map((q: any) => [q.doctor?.id, q.doctor])).values());
  const pendingCount = items.filter((q: any) => q.status !== 'answered').length;
  const answeredCount = items.filter((q: any) => q.status === 'answered').length;

  const filtered = items.filter((q: any) => {
    if (qFilter === 'pending' && q.status === 'answered') return false;
    if (qFilter === 'answered' && q.status !== 'answered') return false;
    if (doctorFilter && q.doctor?.id !== doctorFilter) return false;
    const d = new Date(q.createdAt).getTime();
    if (dateFrom && d < new Date(dateFrom + 'T00:00:00').getTime()) return false;
    if (dateTo && d > new Date(dateTo + 'T23:59:59').getTime()) return false;
    return true;
  });

  // Agrupa por médico (cada médico reúne o histórico de perguntas)
  const grouped = (() => {
    const map = new Map<string, { doctor: any; items: any[]; lastDate: number; pendingCount: number; answeredCount: number }>();
    for (const q of filtered) {
      const did = q.doctor?.id ?? '_unknown';
      const g = map.get(did) ?? { doctor: q.doctor, items: [], lastDate: 0, pendingCount: 0, answeredCount: 0 };
      g.items.push(q);
      g.lastDate = Math.max(g.lastDate, new Date(q.createdAt).getTime());
      if (q.status === 'answered') g.answeredCount++;
      else g.pendingCount++;
      map.set(did, g);
    }
    return [...map.values()].sort((a, b) => b.lastDate - a.lastDate);
  })();

  const userName = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}')?.name || 'Paciente'; } catch { return 'Paciente'; } })();

  return (
    <PageContainer width="content">
      <PageHeader icon={<QuestionAnswerIcon />} title={translate('page.questions')} />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Suas dúvidas enviadas aos médicos e as orientações clínicas recebidas — tudo reunido e organizado.
      </Typography>

      {/* Barra de Filtros e Status */}
      {items.length > 0 && (
        <Stack spacing={1.5} sx={{ mb: 3 }}>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
            <Chip
              size="medium"
              label={`Todas (${items.length})`}
              color={qFilter === 'all' ? 'primary' : 'default'}
              variant={qFilter === 'all' ? 'filled' : 'outlined'}
              onClick={() => setQFilter('all')}
              sx={{ fontWeight: 700, borderRadius: '999px', px: 0.5 }}
            />
            <Chip
              size="medium"
              icon={<HourglassEmptyRoundedIcon sx={{ fontSize: 16 }} />}
              label={`Aguardando (${pendingCount})`}
              color={qFilter === 'pending' ? 'warning' : 'default'}
              variant={qFilter === 'pending' ? 'filled' : 'outlined'}
              onClick={() => setQFilter('pending')}
              sx={{ fontWeight: 700, borderRadius: '999px', px: 0.5 }}
            />
            <Chip
              size="medium"
              icon={<CheckCircleOutlineRoundedIcon sx={{ fontSize: 16 }} />}
              label={`Respondidas (${answeredCount})`}
              color={qFilter === 'answered' ? 'success' : 'default'}
              variant={qFilter === 'answered' ? 'filled' : 'outlined'}
              onClick={() => setQFilter('answered')}
              sx={{ fontWeight: 700, borderRadius: '999px', px: 0.5 }}
            />
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap flexWrap="wrap" alignItems={{ xs: 'stretch', sm: 'center' }}>
            <FormControl size="small" sx={{ minWidth: { xs: 0, sm: 180 }, flex: { sm: 1 } }}>
              <Select value={doctorFilter} displayEmpty onChange={(e) => setDoctorFilter(String(e.target.value))}>
                <MenuItem value="">Todos os médicos</MenuItem>
                {doctors.map((d: any) => <MenuItem key={d?.id} value={d?.id}>{d?.name}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField type="date" size="small" label="De" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ minWidth: { xs: 0, sm: 140 } }} />
            <TextField type="date" size="small" label="Até" value={dateTo} onChange={(e) => setDateTo(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ minWidth: { xs: 0, sm: 140 } }} />
          </Stack>
        </Stack>
      )}

      {filtered.length === 0 ? (
        <Card variant="outlined" sx={{ borderRadius: '16px', textAlign: 'center', py: 6, px: 3, border: '1px dashed', borderColor: 'divider' }}>
          <Box sx={{ fontSize: 48, mb: 1.5 }}>💬</Box>
          <Typography sx={{ fontWeight: 800, fontSize: 17, mb: 0.5 }}>{translate('q.empty')}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 440, mx: 'auto' }}>
            Envie dúvidas clínicas pelo relatório inteligente de exames ou direto na página do médico em "Meus Médicos".
          </Typography>
        </Card>
      ) : (
        <Stack spacing={2.5}>
          {grouped.map((g: any) => {
            const doc = g.doctor;
            const share = shares.find((s: any) => s.doctorId === doc?.id || s.doctor?.id === doc?.id);
            const openQ = Number(share?.openQuestions ?? 0);
            const maxQ = Number(share?.questionLimit ?? 5);

            return (
              <Accordion
                key={doc?.id ?? '_'}
                defaultExpanded
                elevation={0}
                sx={{
                  '&:before': { display: 'none' },
                  border: '1px solid',
                  borderColor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                  borderRadius: '16px !important',
                  overflow: 'hidden',
                  boxShadow: (t) => t.palette.mode === 'dark' ? '0 4px 14px rgba(0,0,0,0.25)' : '0 2px 10px rgba(0,0,0,0.03)',
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  sx={{
                    minHeight: '60px !important',
                    bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(32,178,170,0.03)',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    '& .MuiAccordionSummary-content': { my: 1 },
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flex: 1, minWidth: 0, pr: 1 }}>
                    <Avatar
                      src={doc?.photoUrl ? doctorPhotoUrl(doc.id, 0) : undefined}
                      sx={{
                        width: 44,
                        height: 44,
                        bgcolor: TEAL,
                        fontSize: 16,
                        fontWeight: 700,
                        flexShrink: 0,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                      }}
                    >
                      {(doc?.name || 'M').charAt(0)}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 800, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc?.name || 'Médico'}{doc?.specialty ? ` · ${doc.specialty}` : ''}
                      </Typography>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                        <Typography variant="caption" color="text.secondary">
                          {g.items.length} pergunta(s) · última {new Date(g.lastDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        </Typography>
                        {g.pendingCount > 0 && (
                          <Chip size="small" label={`${g.pendingCount} pendente(s)`} sx={{ height: 18, fontSize: 10, fontWeight: 700, bgcolor: 'rgba(245,158,11,0.15)', color: '#b45309' }} />
                        )}
                        {g.answeredCount > 0 && (
                          <Chip size="small" label={`${g.answeredCount} respondida(s)`} sx={{ height: 18, fontSize: 10, fontWeight: 700, bgcolor: 'rgba(16,185,129,0.12)', color: '#059669' }} />
                        )}
                      </Stack>
                    </Box>
                    <Tooltip title="Cota de perguntas abertas / limite com o médico">
                      <Chip
                        size="small"
                        label={`Cota: ${openQ}/${maxQ}`}
                        sx={{
                          height: 24,
                          fontWeight: 700,
                          fontSize: 11,
                          bgcolor: openQ >= maxQ ? 'rgba(239,68,68,.12)' : 'rgba(32,178,170,.10)',
                          color: openQ >= maxQ ? '#ef4444' : TEAL,
                          flexShrink: 0,
                        }}
                      />
                    </Tooltip>
                  </Stack>
                </AccordionSummary>

                <AccordionDetails sx={{ p: { xs: 1.5, sm: 2 }, bgcolor: (t) => t.palette.mode === 'dark' ? 'transparent' : '#fafafa' }}>
                  <Stack spacing={1.5}>
                    {g.items.map((q: any) => {
                      const answered = q.status === 'answered';
                      // Extrai o texto da dúvida do paciente com robustez total
                      const patientMsg = (q.messages ?? []).find((m: any) => m.authorRole === 'patient')?.body;
                      const questionText = patientMsg || q.subject || 'Dúvida clínica enviada';
                      // Extrai a resposta médica
                      const doctorMsg = (q.messages ?? []).filter((m: any) => m.authorRole === 'doctor').slice(-1)[0]?.body;

                      return (
                        <Card
                          key={q.id}
                          variant="outlined"
                          onClick={() => openThread(q)}
                          sx={{
                            borderRadius: '16px',
                            cursor: 'pointer',
                            bgcolor: (t) => t.palette.mode === 'dark' ? 'background.paper' : '#ffffff',
                            borderColor: answered ? (t) => t.palette.mode === 'dark' ? 'rgba(16,185,129,0.25)' : 'rgba(16,185,129,0.3)' : (t) => t.palette.mode === 'dark' ? 'rgba(245,158,11,0.25)' : 'rgba(245,158,11,0.3)',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                            transition: 'all .18s ease',
                            '&:hover': {
                              transform: 'translateY(-2px)',
                              boxShadow: '0 6px 16px rgba(0,0,0,0.07)',
                              borderColor: TEAL,
                            },
                          }}
                        >
                          <CardContent sx={{ p: { xs: 1.75, sm: 2 }, '&:last-child': { pb: { xs: 1.75, sm: 2 } } }}>
                            {/* Linha de Topo: Data e Status */}
                            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1.25 }}>
                              <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                                Enviada em {new Date(q.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </Typography>
                              <QuestionStatusBadge status={answered ? 'answered' : 'open'} />
                            </Stack>

                            {/* Bloco 1: A Pergunta do Paciente (sempre nítida e completa!) */}
                            <Box
                              sx={{
                                p: 1.5,
                                borderRadius: '12px',
                                bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#f8fafc',
                                borderLeft: '4px solid',
                                borderColor: answered ? '#0d9488' : '#f59e0b',
                                mb: answered && doctorMsg ? 1.5 : 0.75,
                              }}
                            >
                              <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }}>
                                <ChatBubbleOutlineOutlinedIcon sx={{ fontSize: 15, color: answered ? '#0d9488' : '#d97706' }} />
                                <Typography sx={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: answered ? '#0d9488' : '#d97706' }}>
                                  Sua dúvida:
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
                                {questionText}
                              </Typography>
                            </Box>

                            {/* Bloco 2: Se respondida, a Resposta do Médico */}
                            {answered && doctorMsg && (
                              <Box
                                sx={{
                                  p: 1.5,
                                  borderRadius: '12px',
                                  bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(16,185,129,0.08)' : 'rgba(240,253,244,0.9)',
                                  border: '1px solid',
                                  borderColor: (t) => t.palette.mode === 'dark' ? 'rgba(16,185,129,0.22)' : 'rgba(16,185,129,0.3)',
                                  mb: 0.75,
                                }}
                              >
                                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }}>
                                  <MedicalServicesOutlinedIcon sx={{ fontSize: 15, color: '#059669' }} />
                                  <Typography sx={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#059669' }}>
                                    Orientação médica ({doc?.name ? `Dr. ${doc.name}` : 'Médico'}):
                                  </Typography>
                                </Stack>
                                <Typography variant="body2" sx={{ color: 'text.primary', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                  {doctorMsg}
                                </Typography>
                              </Box>
                            )}

                            {/* Se ainda aguardando, nota de tranquilidade */}
                            {!answered && (
                              <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 0.5 }}>
                                <HourglassEmptyRoundedIcon sx={{ fontSize: 14, color: '#b45309' }} />
                                <Typography variant="caption" sx={{ color: '#b45309', fontWeight: 600 }}>
                                  Aguardando o médico responder. Você receberá uma notificação assim que houver retorno.
                                </Typography>
                              </Stack>
                            )}

                            {/* Rodapé com ação de abrir chat completo */}
                            <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1 }}>
                              <Button
                                size="small"
                                sx={{
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: TEAL,
                                  textTransform: 'none',
                                  p: 0,
                                  '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' },
                                }}
                              >
                                Ver conversa completa ›
                              </Button>
                            </Stack>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </Stack>
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Stack>
      )}

      {/* Modal da Thread Completa */}
      <Dialog
        open={!!open}
        onClose={() => setOpen(null)}
        fullScreen
        sx={{ '& .MuiDialog-paper': { bgcolor: 'background.default' } }}
      >
        <Box
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            p: 1.5,
            pt: 'env(safe-area-inset-top)',
            bgcolor: 'background.paper',
            borderBottom: '1px solid',
            borderColor: 'divider',
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          }}
        >
          <IconButton onClick={() => setOpen(null)} size="small"><CloseIcon /></IconButton>
          <Avatar
            src={open?.doctor?.photoUrl ? doctorPhotoUrl(open?.doctor?.id, 0) : undefined}
            sx={{ width: 42, height: 42, bgcolor: TEAL, fontSize: 15, fontWeight: 700 }}
          >
            {(open?.doctor?.name || 'M').charAt(0)}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {open?.doctor?.name || 'Médico'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {open?.doctor?.specialty}{open?.status === 'answered' ? ' · Respondida' : ' · Aguardando resposta'}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 720, mx: 'auto', width: '100%', pb: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
          {threadLoading ? (
            <Box sx={{ textAlign: 'center', py: 8 }}><CircularProgress size={32} sx={{ color: TEAL }} /></Box>
          ) : (
            <Stack spacing={2}>
              {/* Card da pergunta se não houver nas messages */}
              {thread.length === 0 && open && (
                <Box sx={{ p: 2, borderRadius: '16px', bgcolor: (t) => t.palette.mode === 'dark' ? '#1e293b' : '#f1f5f9' }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                    Sua pergunta original · {new Date(open.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </Typography>
                  <Typography variant="body1">{open.subject}</Typography>
                </Box>
              )}

              {thread.map((m: any, i: number) => {
                const isDoc = m.authorRole === 'doctor';
                const isSys = m.authorRole === 'system';
                if (isSys) {
                  return (
                    <Box key={i} sx={{ textAlign: 'center', my: 1 }}>
                      <Box sx={{ display: 'inline-block', px: 2, py: 0.75, borderRadius: '999px', bgcolor: 'rgba(32,178,170,.08)', color: 'text.secondary', fontSize: 12, fontWeight: 600 }}>
                        {m.body}
                      </Box>
                    </Box>
                  );
                }
                const av = isDoc
                  ? <Avatar src={open?.doctor?.photoUrl ? doctorPhotoUrl(open?.doctor?.id, 0) : undefined} sx={{ width: 36, height: 36, bgcolor: TEAL, fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{(open?.doctor?.name || 'M').charAt(0)}</Avatar>
                  : <Avatar src={open?.patientId ? photoUrlFor(open.patientId, 0) : undefined} sx={{ width: 36, height: 36, bgcolor: '#64748b', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{(userName || 'P').charAt(0)}</Avatar>;

                return (
                  <Box key={i} sx={{ display: 'flex', justifyContent: isDoc ? 'flex-start' : 'flex-end', gap: 1, alignItems: 'flex-start' }}>
                    {isDoc && av}
                    <Box
                      sx={{
                        maxWidth: { xs: '84%', sm: '76%' },
                        p: 1.5,
                        px: 2,
                        borderRadius: '16px',
                        bgcolor: (t) => isDoc
                          ? (t.palette.mode === 'dark' ? '#14312e' : '#e0f2f1')
                          : (t.palette.mode === 'dark' ? '#1e293b' : '#f1f5f9'),
                        border: '1px solid',
                        borderColor: isDoc ? 'rgba(32,178,170,.35)' : 'transparent',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                      }}
                    >
                      <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: isDoc ? TEAL : 'text.secondary', mb: 0.5, fontSize: 11.5 }}>
                        {isDoc ? `Dr. ${open?.doctor?.name || 'Médico'}` : 'Você'} · {new Date(m.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </Typography>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.5, wordBreak: 'break-word', fontSize: 14 }}>
                        {m.body}
                      </Typography>
                    </Box>
                    {!isDoc && av}
                  </Box>
                );
              })}
            </Stack>
          )}
        </Box>
      </Dialog>
    </PageContainer>
  );
};
