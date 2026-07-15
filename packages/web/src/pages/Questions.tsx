import { useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Stack, Chip, Avatar, CircularProgress, Dialog, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import { API_URL, token } from '../config';
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
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<any | null>(null);
  const [thread, setThread] = useState<any[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/doctor-questions`, { headers: H() });
      if (r.ok) { const d = await r.json(); setItems(d.items ?? []); }
    } catch {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openThread = async (q: any) => {
    setOpen(q); setThreadLoading(true); setThread([]);
    try {
      const r = await fetch(`${API_URL}/doctor-questions/${q.id}`, { headers: H() });
      if (r.ok) { const d = await r.json(); setThread(d.item?.messages ?? []); }
    } catch {} finally { setThreadLoading(false); }
  };

  if (loading) return <PageSkeleton />;

  const userName = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}')?.name || 'Paciente'; } catch { return 'Paciente'; } })();
  const patientAvatar = <Avatar sx={{ width: 28, height: 28, bgcolor: '#94a3b8', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{(userName || 'P').charAt(0)}</Avatar>;

  return (
    <PageContainer width="content">
      <PageHeader icon={<QuestionAnswerIcon />} title="Minhas perguntas" />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Suas perguntas enviadas aos médicos e as respostas — num só lugar.
      </Typography>

      {items.length === 0 ? (
        <Card variant="outlined" sx={{ borderRadius: 3, textAlign: 'center', py: 6, px: 3 }}>
          <Box sx={{ fontSize: 48, mb: 1 }}>💬</Box>
          <Typography sx={{ fontWeight: 800, mb: 0.5 }}>Nenhuma pergunta ainda</Typography>
          <Typography variant="body2" color="text.secondary">
            Gere seu relatório consolidado e envie as perguntas ao médico, ou pergunte direto em "Meus Médicos".
          </Typography>
        </Card>
      ) : (
        <Stack spacing={1.5}>
          {items.map((q: any) => {
            const doc = q.doctor;
            const lastMsg = q.messages?.[0];
            const answered = q.status === 'answered';
            return (
              <Card key={q.id} variant="outlined" onClick={() => openThread(q)} sx={{
                borderRadius: 3, cursor: 'pointer', borderColor: 'divider',
                transition: 'transform .12s ease, box-shadow .2s ease', '&:active': { transform: 'scale(0.985)' },
                '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,.06)' },
              }}>
                <CardContent sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', '&:last-child': { pb: 1.5 } }}>
                  <Avatar src={doc?.photoUrl ? `${API_URL}/doctor/photo/${doc.id}?v=0` : undefined} sx={{ width: 40, height: 40, bgcolor: TEAL, fontWeight: 700, flexShrink: 0 }}>{(doc?.name || 'M').charAt(0)}</Avatar>
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
          <Avatar src={open?.doctor?.photoUrl ? `${API_URL}/doctor/photo/${open?.doctor?.id}?v=0` : undefined} sx={{ width: 32, height: 32, bgcolor: TEAL, fontSize: 13, fontWeight: 700 }}>{(open?.doctor?.name || 'M').charAt(0)}</Avatar>
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
                const av = isDoc
                  ? <Avatar src={open?.doctor?.photoUrl ? `${API_URL}/doctor/photo/${open?.doctor?.id}?v=0` : undefined} sx={{ width: 28, height: 28, bgcolor: TEAL, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{(open?.doctor?.name || 'M').charAt(0)}</Avatar>
                  : patientAvatar;
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
