import { useEffect, useState } from 'react';
import { useTranslate } from 'react-admin';
import { Box, Typography, Card, CardContent, Stack, Chip, Avatar, CircularProgress, Dialog, IconButton, Select, MenuItem, TextField, FormControl } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { PageSkeleton } from '../components/PageSkeleton';

const H = () => ({ Authorization: `Bearer ${token()}` });
const TEAL = '#178f89';

/**
 * "Minhas perguntas" — espelho do lado PACIENTE do fluxo de perguntas ao médico.
 * Lista as DoctorQuestions enviadas (com status Respondida/Aguardando + última msg) e
 * abre a thread completa (pergunta + resposta) num Dialog full-screen (mobile-friendly).
 * Fecha o loop: o paciente via a resposta só na notificação — agora tem um lugar fixo.
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
  const filtered = items.filter((q: any) => {
    if (qFilter === 'pending' && q.status === 'answered') return false;
    if (qFilter === 'answered' && q.status !== 'answered') return false;
    if (doctorFilter && q.doctor?.id !== doctorFilter) return false;
    const d = new Date(q.createdAt).getTime();
    if (dateFrom && d < new Date(dateFrom + 'T00:00:00').getTime()) return false;
    if (dateTo && d > new Date(dateTo + 'T23:59:59').getTime()) return false;
    return true;
  });

  const userName = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}')?.name || 'Paciente'; } catch { return 'Paciente'; } })();

  return (
    <PageContainer width="content">
      <PageHeader icon={<QuestionAnswerIcon />} title={translate('page.questions')} />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Suas perguntas enviadas aos médicos e as respostas — num só lugar.
      </Typography>

      {/* Direito de perguntas: X em aberto de Y por médico. Tangível (antes o +1 do 'Atendi' não
          aparecia em lugar nenhum). Ao receber resposta, o espaço libera. */}
      {shares.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', p: 1, px: 1.25, borderRadius: 2, bgcolor: 'rgba(32,178,170,.06)', border: '1px solid rgba(32,178,170,.15)', mb: 2 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: TEAL }}>💬 Perguntas em aberto:</Typography>
          {shares.map((s: any) => {
            const open = Number(s.openQuestions ?? 0); const max = Number(s.questionLimit ?? 5);
            return <Chip key={s.doctorId ?? s.doctor?.id} size="small" label={`${s.doctor?.name ?? s.name}: ${open}/${max}`} sx={{ fontWeight: 600, bgcolor: open >= max ? '#fee2e2' : 'rgba(32,178,170,.1)', color: open >= max ? '#b91c1c' : TEAL }} />;
          })}
          <Typography variant="caption" color="text.secondary">· ao receber resposta, o espaço libera.</Typography>
        </Box>
      )}

      {/* Filtros */}
      {items.length > 0 && (
        <Stack spacing={1} sx={{ mb: 2 }}>
          <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
            {([['all', 'Todas'], ['pending', 'Aguardando'], ['answered', 'Respondidas']] as const).map(([k, l]) => (
              <Chip key={k} size="small" label={l} color={qFilter === k ? 'primary' : 'default'} variant={qFilter === k ? 'filled' : 'outlined'} onClick={() => setQFilter(k)} sx={{ fontWeight: 700, borderRadius: 99 }} />
            ))}
          </Stack>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
            <FormControl size="small" sx={{ minWidth: 150, flex: 1 }}>
              <Select value={doctorFilter} displayEmpty onChange={(e) => setDoctorFilter(String(e.target.value))}>
                <MenuItem value="">Todos os médicos</MenuItem>
                {doctors.map((d: any) => <MenuItem key={d?.id} value={d?.id}>{d?.name}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField type="date" size="small" label="De" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: 120 }} />
            <TextField type="date" size="small" label="Até" value={dateTo} onChange={(e) => setDateTo(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: 120 }} />
          </Stack>
        </Stack>
      )}

      {filtered.length === 0 ? (
        <Card variant="outlined" sx={{ borderRadius: 3, textAlign: 'center', py: 6, px: 3 }}>
          <Box sx={{ fontSize: 48, mb: 1 }}>💬</Box>
          <Typography sx={{ fontWeight: 800, mb: 0.5 }}>Nenhuma pergunta ainda</Typography>
          <Typography variant="body2" color="text.secondary">
            Gere seu relatório consolidado e envie as perguntas ao médico, ou pergunte direto em "Meus Médicos".
          </Typography>
        </Card>
      ) : (
        <Stack spacing={1.5}>
          {filtered.map((q: any) => {
            const doc = q.doctor;
            // Última mensagem REAL (pula o auto-recebimento 'system' — senão o preview mostrava "Você: ✅ Recebido...").
            const lastMsg = q.messages?.find((m: any) => m.authorRole !== 'system');
            const answered = q.status === 'answered';
            return (
              <Card key={q.id} variant="outlined" onClick={() => openThread(q)} sx={{
                borderRadius: 3, cursor: 'pointer', borderColor: 'divider',
                transition: 'transform .12s ease, box-shadow .2s ease', '&:active': { transform: 'scale(0.985)' },
                '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,.06)' },
              }}>
                <CardContent sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', '&:last-child': { pb: 1.5 } }}>
                  <Avatar src={doc?.photoUrl ? `${API_URL}/doctor/photo/${doc.id}?v=0` : undefined} sx={{ width: 44, height: 44, bgcolor: TEAL, fontSize: 16, fontWeight: 700, flexShrink: 0 }}>{(doc?.name || 'M').charAt(0)}</Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mb: 0.25 }}>
                      <Typography sx={{ fontWeight: 800, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc?.name || 'Médico'}{doc?.specialty ? ` · ${doc.specialty}` : ''}</Typography>
                      <Chip size="small" label={answered ? '✓ Respondida' : '⏳ Aguardando'} sx={{ height: 20, fontSize: 10, fontWeight: 700, flexShrink: 0, bgcolor: answered ? '#dcfce7' : '#fef3c7', color: answered ? '#15803d' : '#9a6b00' }} />
                    </Stack>
                    {lastMsg && (
                      <Typography variant="body2" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4 }}>
                        <strong style={{ color: lastMsg.authorRole === 'doctor' ? TEAL : 'inherit' }}>{lastMsg.authorRole === 'doctor' ? 'Médico' : 'Você'}:</strong> {lastMsg.body}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary">{new Date(q.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</Typography>
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}

      {/* Thread completa (Dialog full-screen em mobile) */}
      <Dialog open={!!open} onClose={() => setOpen(null)} fullScreen
        sx={{ '& .MuiDialog-paper': { bgcolor: 'background.default' } }}>
        <Box sx={{ position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 1, p: 1.5, pt: 'env(safe-area-inset-top)', bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
          <IconButton onClick={() => setOpen(null)} size="small"><CloseIcon /></IconButton>
          <Avatar src={open?.doctor?.photoUrl ? `${API_URL}/doctor/photo/${open?.doctor?.id}?v=0` : undefined} sx={{ width: 40, height: 40, bgcolor: TEAL, fontSize: 15, fontWeight: 700 }}>{(open?.doctor?.name || 'M').charAt(0)}</Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{open?.doctor?.name || 'Médico'}</Typography>
            <Typography variant="caption" color="text.secondary">{open?.doctor?.specialty}{open?.status === 'answered' ? ' · ✓ Respondida' : ' · ⏳ Aguardando'}</Typography>
          </Box>
        </Box>
        <Box sx={{ p: 2, pb: 'env(safe-area-inset-bottom)' }}>
          {threadLoading ? (
            <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress size={28} sx={{ color: TEAL }} /></Box>
          ) : (
            <Stack spacing={1}>
              {thread.map((m: any, i: number) => {
                const isDoc = m.authorRole === 'doctor';
                const isSys = m.authorRole === 'system';
                if (isSys) {
                  // Auto-recebimento (ex.: "✅ Recebido! Dr. X vai analisar em breve") — centralizado, muted.
                  return <Box key={i} sx={{ textAlign: 'center', my: 0.5 }}><Box sx={{ display: 'inline-block', px: 1.5, py: 0.5, borderRadius: 99, bgcolor: 'rgba(32,178,170,.08)', color: 'text.secondary', fontSize: 12, fontWeight: 600 }}>{m.body}</Box></Box>;
                }
                const av = isDoc
                  ? <Avatar src={open?.doctor?.photoUrl ? `${API_URL}/doctor/photo/${open?.doctor?.id}?v=0` : undefined} sx={{ width: 36, height: 36, bgcolor: TEAL, fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{(open?.doctor?.name || 'M').charAt(0)}</Avatar>
                  : <Avatar src={open?.patientId ? `${API_URL}/patients/${open.patientId}/photo?v=0` : undefined} sx={{ width: 36, height: 36, bgcolor: '#94a3b8', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{(userName || 'P').charAt(0)}</Avatar>;
                return (
                  <Box key={i} sx={{ display: 'flex', justifyContent: isDoc ? 'flex-end' : 'flex-start', gap: 0.75, alignItems: 'flex-end' }}>
                    {!isDoc && av}
                    <Box sx={{ maxWidth: '80%', p: 1, px: 1.25, borderRadius: 2, bgcolor: isDoc ? '#e0f2f1' : '#f1f5f9', border: '1px solid', borderColor: isDoc ? 'rgba(32,178,170,.25)' : 'transparent' }}>
                      <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: isDoc ? TEAL : 'text.secondary', mb: 0.25, fontSize: 10.5 }}>{isDoc ? `Dr. ${open?.doctor?.name || 'Médico'}` : 'Você'} · {new Date(m.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</Typography>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.45, wordBreak: 'break-word' }}>{m.body}</Typography>
                    </Box>
                    {isDoc && av}
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
