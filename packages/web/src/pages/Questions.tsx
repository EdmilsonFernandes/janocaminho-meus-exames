import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { snackbar } from '../components/ConfirmDialog';
import { bumpCredits, notifyInsufficientCredits } from '../utils/credits-events';
import { Badge } from '@/components/reui/badge';
import {
  Frame,
  FrameFooter,
  FrameHeader,
  FramePanel,
} from '@/components/reui/frame';
import {
  AssistantReplyActions,
  Bubble,
  BubbleContent,
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from '@/components/reui/message';
import { useReuiThemeSync } from '@/components/reui/use-reui-theme';

const H = () => ({ Authorization: `Bearer ${token()}` });
const TEAL = '#178f89';

/**
 * "Minhas perguntas" — tela de acompanhamento das dúvidas enviadas aos médicos.
 * Apresentação clínica premium com cards destacados para a pergunta do paciente e
 * a orientação enviada pelo médico, com thread completa em modal.
 */
export const QuestionsPage = () => {
  useReuiThemeSync();
  const translate = useTranslate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pid] = useSelectedPatient();
  const [items, setItems] = useState<any[]>([]);
  const [shares, setShares] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<any | null>(null);
  const [thread, setThread] = useState<any[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [qFilter, setQFilter] = useState<'all' | 'pending' | 'answered'>('all');
  // AUD-016: a tela era um inbox sem jeito de ESCREVER — a criação vivia escondida
  // num dialog do /medicos. Aqui nasce o "Nova pergunta" (mesmo POST, mesma cobrança).
  const navigate = useNavigate();
  const [askOpen, setAskOpen] = useState(false);
  const [askDoc, setAskDoc] = useState('');
  const [askText, setAskText] = useState('');
  const [askBusy, setAskBusy] = useState(false);
  const [doctorFilter, setDoctorFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Permite encaminhar dúvida direto do Chat IA (?ask=...)
  useEffect(() => {
    const prefill = searchParams.get('ask');
    if (prefill && !loading) {
      const firstDoc = shares.find((s: any) => s.doctor?.id || s.doctorId);
      if (firstDoc) {
        setAskDoc(firstDoc.doctor?.id ?? firstDoc.doctorId ?? '');
        setAskText(prefill.slice(0, 1000));
        setAskOpen(true);
      }
      searchParams.delete('ask');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, loading, shares, setSearchParams]);

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

  const askableDoctors = shares.filter((s: any) => s.doctor?.id || s.doctorId).map((s: any) => ({
    id: s.doctor?.id ?? s.doctorId,
    name: s.doctor?.name ?? 'Médico',
  }));
  const sendQuestion = async () => {
    const txt = askText.trim();
    if (!txt || !askDoc) return;
    setAskBusy(true);
    try {
      const r = await fetch(`${API_URL}/doctor-questions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...H() },
        body: JSON.stringify({ doctorId: askDoc, patientId: pid, subject: txt }),
      });
      const d = await r.json().catch(() => ({} as any));
      if (r.status === 402) { notifyInsufficientCredits({}); return; }
      if (!r.ok) throw new Error(d?.error || 'Falha ao enviar a pergunta.');
      bumpCredits();
      setAskOpen(false); setAskText('');
      snackbar({ message: '✓ Pergunta enviada — o médico vê no próximo acesso.', severity: 'success' });
      void load();
    } catch (e: any) {
      snackbar({ message: e?.message || 'Falha ao enviar a pergunta.', severity: 'error' });
    } finally { setAskBusy(false); }
  };

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
      <PageHeader
        icon={<QuestionAnswerIcon />}
        title={translate('page.questions')}
        actions={
          <Button
            variant="contained"
            size="small"
            onClick={() => {
              if (!askableDoctors.length) { navigate('/medicos'); return; }
              setAskDoc(askableDoctors[0].id); setAskOpen(true);
            }}
            sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, px: 2.25, whiteSpace: 'nowrap' }}
          >
            Nova pergunta
          </Button>
        }
      />
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
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 440, mx: 'auto', mb: 2 }}>
            {askableDoctors.length
              ? 'Tire uma dúvida clínica direto com um médico que já tem acesso aos seus exames.'
              : 'Compartilhe seus exames com um médico em "Meus Médicos" para poder enviar perguntas.'}
          </Typography>
          <Button
            variant="contained"
            onClick={() => {
              if (!askableDoctors.length) { navigate('/medicos'); return; }
              setAskDoc(askableDoctors[0].id); setAskOpen(true);
            }}
            sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, px: 3 }}
          >
            {askableDoctors.length ? 'Fazer uma pergunta' : 'Ir para Meus Médicos'}
          </Button>
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
                      const patientMsg = (q.messages ?? []).find((m: any) => m.authorRole === 'patient')?.body;
                      const questionText = patientMsg || q.subject || 'Dúvida clínica enviada';
                      const lastDoctorObj = (q.messages ?? []).filter((m: any) => m.authorRole === 'doctor').slice(-1)[0];
                      const doctorMsg = lastDoctorObj?.body;
                      const docPhoto = doc?.photoUrl ? doctorPhotoUrl(doc.id, 0) : undefined;
                      const crmText = doc?.crm ? `CRM ${doc.crm}${doc?.crmUf ? `-${doc.crmUf}` : ''}` : null;

                      // Contexto de biomarcador real se houver
                      const biomarkerText = q.biomarker || q.analyte || (q.context?.analyte ? `${q.context.analyte}: ${q.context.value ?? ''}` : null);

                      // Detecta se há recomendação/conduta médica no texto
                      const conductMatch = doctorMsg ? doctorMsg.match(/(?:conduta|recomenda[çc][aã]o|prescri[çc][aã]o|repetir exame|ajuste|orienta[çc][aã]o):?\s*(.+?)(?:\.|$)/i) : null;
                      const conductText = conductMatch ? conductMatch[0] : null;

                      // Tempo de resposta
                      const timeElapsed = answered && lastDoctorObj?.createdAt
                        ? (() => {
                            const diffHrs = Math.max(1, Math.round((new Date(lastDoctorObj.createdAt).getTime() - new Date(q.createdAt).getTime()) / (1000 * 60 * 60)));
                            return `Respondida em ${diffHrs < 24 ? `${diffHrs}h` : `${Math.round(diffHrs / 24)}d`}`;
                          })()
                        : null;

                      const qTimeStr = new Date(q.createdAt).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      const docTimeStr = lastDoctorObj?.createdAt
                        ? new Date(lastDoctorObj.createdAt).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '';
                      const cleanDocTitle = doc?.name
                        ? doc.name.toLowerCase().startsWith('dr')
                          ? doc.name
                          : `Dr(a). ${doc.name}`
                        : 'Médico';

                      return (
                        <Frame key={q.id} spacing="sm" className="mb-3">
                          <FrameHeader className="flex-row flex-wrap items-center justify-between gap-2">
                            <span className="text-muted-foreground text-xs font-medium">
                              📅 Pergunta de{' '}
                              <strong className="text-foreground font-semibold tabular-nums">
                                {new Date(q.createdAt).toLocaleDateString('pt-BR')} às {qTimeStr}
                              </strong>
                              {doc?.name ? ` • Para ${cleanDocTitle}` : ''}
                            </span>

                            <div className="flex flex-wrap items-center gap-1.5">
                              {biomarkerText && (
                                <Badge variant="destructive-light" size="sm">
                                  🩸 {biomarkerText}
                                </Badge>
                              )}
                              {timeElapsed ? (
                                <Badge variant="success-light" size="sm">
                                  ✓ {timeElapsed}
                                </Badge>
                              ) : (
                                <QuestionStatusBadge status={answered ? 'answered' : 'open'} />
                              )}
                            </div>
                          </FrameHeader>

                          <FramePanel className="flex flex-col gap-4">
                            {/* Mensagem 1 (ReUI c-message-3): Pergunta enviada pelo Paciente */}
                            <Message align="end">
                              <MessageContent>
                                <MessageHeader className="justify-end">
                                  <span className="text-foreground font-semibold">{userName} (Você)</span>
                                  <span
                                    aria-hidden="true"
                                    className="bg-muted-foreground/40 size-1 shrink-0 rounded-full"
                                  />
                                  <span className="tabular-nums">{qTimeStr}</span>
                                </MessageHeader>
                                <Bubble variant="default">
                                  <BubbleContent className="whitespace-pre-wrap">
                                    {questionText}
                                  </BubbleContent>
                                </Bubble>
                                <MessageFooter>
                                  <span>Enviada ao portal médico</span>
                                </MessageFooter>
                              </MessageContent>
                            </Message>

                            {/* Mensagem 2 (ReUI c-message-3 + c-message-4): Resposta Clínica do Médico */}
                            {answered && doctorMsg ? (
                              <Message align="start">
                                <MessageAvatar>
                                  <Avatar
                                    src={docPhoto}
                                    sx={{ width: 32, height: 32, bgcolor: TEAL, fontSize: 13, fontWeight: 700 }}
                                  >
                                    {(doc?.name || 'M').charAt(0)}
                                  </Avatar>
                                </MessageAvatar>
                                <MessageContent className="max-w-[92%] sm:max-w-[85%]">
                                  <MessageHeader>
                                    <span className="text-foreground font-bold">{cleanDocTitle}</span>
                                    {crmText && (
                                      <Badge variant="primary-light" size="xs" className="font-mono">
                                        {crmText}
                                      </Badge>
                                    )}
                                    {docTimeStr && (
                                      <>
                                        <span
                                          aria-hidden="true"
                                          className="bg-muted-foreground/40 size-1 shrink-0 rounded-full"
                                        />
                                        <span className="tabular-nums">{docTimeStr}</span>
                                      </>
                                    )}
                                  </MessageHeader>

                                  <Bubble variant="clinical">
                                    <BubbleContent className="space-y-2.5">
                                      <p className="m-0 whitespace-pre-wrap">{doctorMsg}</p>

                                      {conductText && (
                                        <div className="flex items-start gap-2 rounded-xl border border-sky-500/25 bg-sky-500/10 p-2.5 text-xs text-sky-900 dark:text-sky-200">
                                          <MedicalServicesOutlinedIcon
                                            sx={{ fontSize: 16, color: '#0284c7', flexShrink: 0, mt: 0.1 }}
                                          />
                                          <span>
                                            <strong>Conduta recomendada:</strong> {conductText}
                                          </span>
                                        </div>
                                      )}
                                    </BubbleContent>
                                  </Bubble>

                                  <AssistantReplyActions content={doctorMsg} />
                                </MessageContent>
                              </Message>
                            ) : (
                              <div className="flex items-center gap-2 rounded-xl border border-dashed border-amber-500/35 bg-amber-500/10 px-3.5 py-2.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                                <HourglassEmptyRoundedIcon sx={{ fontSize: 16, color: '#d97706' }} />
                                <span>
                                  Aguardando o médico responder. Você será notificado assim que houver retorno no aplicativo.
                                </span>
                              </div>
                            )}
                          </FramePanel>

                          <FrameFooter className="flex-row items-center justify-end">
                            <Button
                              size="small"
                              onClick={() => openThread(q)}
                              sx={{
                                fontSize: 12.5,
                                fontWeight: 700,
                                color: TEAL,
                                textTransform: 'none',
                                py: 0.25,
                                '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' },
                              }}
                            >
                              Ver conversa completa ›
                            </Button>
                          </FrameFooter>
                        </Frame>
                      );
                    })}
                  </Stack>
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Stack>
      )}

      {/* Modal da Thread Completa (ReUI c-message-3 & c-message-6) */}
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
            <div className="flex flex-wrap items-center gap-1.5">
              <Typography sx={{ fontWeight: 800, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {open?.doctor?.name || 'Médico'}
              </Typography>
              {open?.doctor?.crm && (
                <Badge variant="primary-light" size="xs" className="font-mono">
                  CRM {open.doctor.crm}
                </Badge>
              )}
            </div>
            <Typography variant="caption" color="text.secondary">
              {open?.doctor?.specialty}{open?.status === 'answered' ? ' · Respondida' : ' · Aguardando resposta'}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 720, mx: 'auto', width: '100%', pb: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
          {threadLoading ? (
            <Box sx={{ textAlign: 'center', py: 8 }}><CircularProgress size={32} sx={{ color: TEAL }} /></Box>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Card da pergunta se não houver nas messages */}
              {thread.length === 0 && open && (
                <Message align="end">
                  <MessageContent>
                    <MessageHeader className="justify-end">
                      <span className="text-foreground font-semibold">Sua pergunta original</span>
                      <span
                        aria-hidden="true"
                        className="bg-muted-foreground/40 size-1 shrink-0 rounded-full"
                      />
                      <span className="tabular-nums">
                        {new Date(open.createdAt).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </MessageHeader>
                    <Bubble variant="default">
                      <BubbleContent className="whitespace-pre-wrap">{open.subject}</BubbleContent>
                    </Bubble>
                  </MessageContent>
                </Message>
              )}

              {thread.map((m: any, i: number) => {
                const isDoc = m.authorRole === 'doctor';
                const isSys = m.authorRole === 'system';
                if (isSys) {
                  return (
                    <div key={i} className="my-1 flex justify-center">
                      <Badge variant="primary-light" size="default" radius="full">
                        {m.body}
                      </Badge>
                    </div>
                  );
                }

                // c-message-6: agrupamento de mensagens consecutivas do mesmo autor
                const prevSame = i > 0 && thread[i - 1]?.authorRole === m.authorRole;
                const nextSame = i < thread.length - 1 && thread[i + 1]?.authorRole === m.authorRole;
                const timeStr = new Date(m.createdAt).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                const av = isDoc ? (
                  <Avatar
                    src={open?.doctor?.photoUrl ? doctorPhotoUrl(open?.doctor?.id, 0) : undefined}
                    sx={{ width: 32, height: 32, bgcolor: TEAL, fontSize: 13, fontWeight: 700 }}
                  >
                    {(open?.doctor?.name || 'M').charAt(0)}
                  </Avatar>
                ) : (
                  <Avatar
                    src={open?.patientId ? photoUrlFor(open.patientId, 0) : undefined}
                    sx={{ width: 32, height: 32, bgcolor: '#64748b', fontSize: 13, fontWeight: 700 }}
                  >
                    {(userName || 'P').charAt(0)}
                  </Avatar>
                );

                return (
                  <Message key={i} align={isDoc ? 'start' : 'end'}>
                    <MessageAvatar>{!nextSame ? av : null}</MessageAvatar>
                    <MessageContent>
                      {!prevSame && (
                        <MessageHeader className={!isDoc ? 'justify-end' : undefined}>
                          <span className="text-foreground font-semibold">
                            {isDoc ? `Dr(a). ${open?.doctor?.name || 'Médico'}` : 'Você'}
                          </span>
                          <span
                            aria-hidden="true"
                            className="bg-muted-foreground/40 size-1 shrink-0 rounded-full"
                          />
                          <span className="tabular-nums">{timeStr}</span>
                        </MessageHeader>
                      )}
                      <Bubble variant={isDoc ? 'clinical' : 'default'}>
                        <BubbleContent className="whitespace-pre-wrap">{m.body}</BubbleContent>
                      </Bubble>
                      {isDoc && !nextSame && <AssistantReplyActions content={m.body} />}
                    </MessageContent>
                  </Message>
                );
              })}
            </div>
          )}
        </Box>
      </Dialog>

      {/* AUD-016: NOVA PERGUNTA — criação direto do inbox (mesmo POST do /medicos). */}
      <Dialog open={askOpen} onClose={() => !askBusy && setAskOpen(false)} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: '20px' } }}>
        <Box sx={{ p: { xs: 2.5, sm: 3 } }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 17 }}>Nova pergunta</Typography>
            <IconButton aria-label="Fechar" onClick={() => setAskOpen(false)} size="small" disabled={askBusy}><CloseIcon /></IconButton>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Sua dúvida vira uma conversa com o médico, que responde quando acessar o portal. O envio usa créditos do seu saldo.
          </Typography>
          <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
            <Select value={askDoc} onChange={(e) => setAskDoc(String(e.target.value))} displayEmpty inputProps={{ 'aria-label': 'Médico que vai receber a pergunta' }}>
              {askableDoctors.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField
            fullWidth
            multiline
            minRows={3}
            value={askText}
            onChange={(e) => setAskText(e.target.value)}
            placeholder="Escreva sua dúvida clínica — ex.: 'Meu TSH subiu, mantenho a dose?'"
            inputProps={{ maxLength: 1000, 'aria-label': 'Texto da pergunta' }}
          />
          <Stack direction="row" spacing={1.5} justifyContent="flex-end" sx={{ mt: 2 }}>
            <Button onClick={() => setAskOpen(false)} disabled={askBusy} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>Cancelar</Button>
            <Button
              variant="contained"
              onClick={() => void sendQuestion()}
              disabled={askBusy || !askText.trim() || !askDoc}
              startIcon={askBusy ? <CircularProgress size={16} color="inherit" /> : undefined}
              sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, px: 3 }}
            >
              Enviar pergunta
            </Button>
          </Stack>
        </Box>
      </Dialog>
    </PageContainer>
  );
};
