import { Box, Stack, Typography, Button, Card, CardContent, Avatar, Chip, TextField, Accordion, AccordionSummary, AccordionDetails, CircularProgress, IconButton } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import { AppCard } from '../../AppCard';
import { QuestionStatusBadge } from '../../QuestionStatusBadge';
import { photoUrlFor } from '../../../config';
import { a11yClick, focusRingSx } from './shared';

/** Respostas prontas pro médico (chips de 1 clique) — frases de triagem neutras. */
export const QUICK_REPLIES = [
  'Recebido! Vou analisar seus exames com atenção e já te respondo.',
  'Vamos conversar sobre isso na sua próxima consulta.',
  'Por favor, marque uma consulta para avaliarmos juntos.',
  'Preciso do exame completo/atual para concluir a análise.',
  'Seus resultados estão dentro da normalidade — mantenha o acompanhamento de rotina.',
  'Está tudo estável, sem alterações relevantes. Continue assim!',
];

/** View PERGUNTAS (inbox global) — extraída do DoctorPortal (P3 passo B, move-only). */
export const PortalQuestions = ({ allQ, allQLoading, patients, qText, setQText, qSending, replyOpen, setReplyOpen, onAnswer, onRefresh, onGoToPatient }: {
  allQ: any[]; allQLoading: boolean; patients: any[]; qText: Record<string, string>; setQText: (fn: (t: Record<string, string>) => Record<string, string>) => void; qSending: string | null; replyOpen: string | null; setReplyOpen: any; onAnswer: (id: string) => void; onRefresh: () => void; onGoToPatient: (patientId: string) => void;
}) => {
          const openQ = allQ.filter((q: any) => q.status !== 'answered');
          const answeredQ = allQ.filter((q: any) => q.status === 'answered');
          const relDate = (d?: string) => { if (!d) return ''; const days = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 86400000)); return days === 0 ? 'hoje' : days === 1 ? 'há 1 dia' : `há ${days} dias`; };
          const card = (q: any) => {
            const answered = q.status === 'answered';
            const lastPatient = (q.messages ?? []).filter((m: any) => m.authorRole === 'patient').slice(-1)[0];
            const lastDoctor = (q.messages ?? []).filter((m: any) => m.authorRole === 'doctor').slice(-1)[0];
            const qp = patients.find((pp: any) => pp.patient?.id === q.patientId);
            const isOpen = replyOpen === q.id;
            return (
              <AppCard key={q.id} sx={{ mb: 1.5, border: '1px solid', borderColor: answered ? 'divider' : 'transparent' }}><CardContent>
                <Stack direction="row" alignItems="center" spacing={1.25}>
                  <Box role="button" tabIndex={0} {...a11yClick(() => onGoToPatient(q.patientId))} title="Abrir o paciente" sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flex: 1, minWidth: 0, cursor: 'pointer', borderRadius: '12px', mx: -0.5, px: 0.5, py: 0.25, transition: 'background .15s', '&:hover': { bgcolor: 'rgba(32,178,170,.06)' }, ...focusRingSx }}>
                    <Avatar src={q.patient?.id ? photoUrlFor(q.patient.id) : undefined} sx={{ bgcolor: 'primary.dark', fontWeight: 800, width: 44, height: 44, flexShrink: 0 }}>{q.patient?.fullName?.charAt(0)}</Avatar>
                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                        <Typography sx={{ fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>{q.patient?.fullName}<OpenInNewIcon sx={{ fontSize: 13, color: 'text.disabled' }} /></Typography>
                        <QuestionStatusBadge status={answered ? 'answered' : 'open'} />
                      </Stack>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={q.subject}>{q.subject} · {relDate(q.createdAt)}{qp?.age != null ? ` · ${qp.age}a${qp.sex === 'female' ? ' · F' : qp.sex === 'male' ? ' · M' : ''}` : ''}</Typography>
                    </Box>
                  </Box>
                  {!answered && <Button size="small" variant={isOpen ? 'outlined' : 'contained'} onClick={() => setReplyOpen(isOpen ? null : q.id)} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, bgcolor: isOpen ? undefined : 'primary.main', color: isOpen ? 'primary.dark' : '#fff', boxShadow: 'none', '&:hover': { bgcolor: isOpen ? undefined : 'primary.dark' }, flexShrink: 0 }}>{isOpen ? 'Fechar' : 'Responder'}</Button>}
                </Stack>
                {lastPatient && <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary', fontStyle: 'italic', pl: 0.5 }}>"{String(lastPatient.body).slice(0, 160)}{(String(lastPatient.body).length ?? 0) > 160 ? '…' : ''}"</Typography>}
                {/* Resposta INLINE + respostas prontas (sem navegar pro paciente — era lento). */}
                {isOpen && !answered && (
                  <Box sx={{ mt: 1.5 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>⚡ Resposta rápida:</Typography>
                    <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.5, mb: 1 }}>
                      {QUICK_REPLIES.map((t) => <Chip key={t} size="small" variant="outlined" label={t} onClick={() => setQText((prev) => ({ ...prev, [q.id]: t }))} sx={{ fontWeight: 600, height: 'auto', maxWidth: '100%', borderRadius: '12px', py: 0.5, borderColor: 'rgba(32,178,170,.4)', color: 'primary.dark', '& .MuiChip-label': { whiteSpace: 'normal', lineHeight: 1.3 }, '&:hover': { bgcolor: 'rgba(32,178,170,.06)' } }} />)}
                    </Stack>
                    <TextField multiline minRows={2} size="small" fullWidth placeholder="Escrever resposta…" value={qText[q.id] ?? ''} onChange={(e) => setQText((t) => ({ ...t, [q.id]: e.target.value }))} />
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }} justifyContent="flex-end">
                      <Button size="small" onClick={() => { setQText((t) => ({ ...t, [q.id]: '' })); setReplyOpen(null); }} sx={{ textTransform: 'none', fontWeight: 700, color: 'text.secondary' }}>Cancelar</Button>
                      <Button size="small" variant="contained" disabled={qSending === q.id || !(qText[q.id]?.trim())} onClick={() => onAnswer(q.id)} startIcon={qSending === q.id ? <CircularProgress size={14} color="inherit" /> : undefined} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, bgcolor: 'primary.main', boxShadow: 'none', '&:hover': { bgcolor: 'primary.dark' } }}>{qSending === q.id ? 'Enviando…' : 'Enviar resposta'}</Button>
                    </Stack>
                  </Box>
                )}
                {answered && lastDoctor && (
                  <Box sx={{ mt: 1.25, p: 1, px: 1.25, borderRadius: '12px', bgcolor: (t) => t.palette.mode === 'dark' ? '#1e2d2c' : '#e0f2f1', border: '1px solid', borderColor: 'rgba(32,178,170,.25)' }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.dark' }}>Sua resposta</Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{String(lastDoctor.body)}</Typography>
                  </Box>
                )}
              </CardContent></AppCard>
            );
          };
          return (
            <>
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 2 }}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif' }}>Perguntas</Typography>
                  <Typography variant="caption" color="text.secondary">{openQ.length} em aberto · {answeredQ.length} respondidas</Typography>
                </Box>
                <IconButton onClick={onRefresh} disabled={allQLoading} sx={{ color: 'primary.dark' }}><RefreshIcon /></IconButton>
              </Stack>
              {allQLoading && <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress sx={{ color: 'primary.dark' }} /></Box>}
              {!allQLoading && allQ.length === 0 && (
                <AppCard><CardContent><Box sx={{ textAlign: 'center', py: 5 }}>
                  <Box sx={{ fontSize: 56, mb: 1.5, opacity: 0.4 }}>💬</Box>
                  <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 17 }}>Nenhuma pergunta ainda</Typography>
                  <Typography color="text.secondary">Quando um paciente enviar uma pergunta pelo app, ela aparece aqui.</Typography>
                </Box></CardContent></AppCard>
              )}
              {!allQLoading && openQ.length > 0 && (<Box sx={{ mb: 3 }}>
                <Typography sx={{ fontWeight: 800, mb: 1.5, display: 'flex', alignItems: 'center', gap: 0.75 }}><ScheduleOutlinedIcon fontSize="small" sx={{ color: 'warning.main' }} />Em aberto ({openQ.length})</Typography>
                <Stack spacing={1.5}>
                  {(() => {
                    const map = new Map<string, { p: any; qs: any[]; last: number }>();
                    for (const q of openQ) { const pid = q.patientId; const g = map.get(pid) ?? { p: q.patient, qs: [], last: 0 }; g.qs.push(q); g.last = Math.max(g.last, new Date(q.createdAt).getTime()); map.set(pid, g); }
                    return [...map.values()].sort((a, b) => b.last - a.last).map((g) => (
                      <Accordion key={g.p?.id} elevation={0} sx={{ '&:before': { display: 'none' }, border: '1px solid', borderColor: 'divider', borderRadius: '12px !important', overflow: 'hidden' }}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: '52px !important', '& .MuiAccordionSummary-content': { my: 0.75 } }}>
                          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flex: 1, minWidth: 0 }}>
                            <Avatar src={g.p?.id ? photoUrlFor(g.p.id) : undefined} sx={{ width: 40, height: 40, bgcolor: 'primary.dark', fontSize: 15, fontWeight: 700, flexShrink: 0 }}>{(g.p?.fullName || 'P').charAt(0)}</Avatar>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography sx={{ fontWeight: 800, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.p?.fullName || 'Paciente'}</Typography>
                              <Typography variant="caption" color="text.secondary">{g.qs.length} pergunta(s) · última {new Date(g.last).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</Typography>
                            </Box>
                            <Chip size="small" label="aberto" sx={{ height: 22, fontWeight: 700, bgcolor: 'rgba(245,158,11,.12)', color: '#b45309', flexShrink: 0 }} />
                          </Stack>
                        </AccordionSummary>
                        <AccordionDetails sx={{ p: 1.5, pt: 0.5 }}>
                          <Stack spacing={1}>{g.qs.map(card)}</Stack>
                        </AccordionDetails>
                      </Accordion>
                    ));
                  })()}
                </Stack>
              </Box>)}
              {!allQLoading && answeredQ.length > 0 && (<Box>
                <Typography sx={{ fontWeight: 800, mb: 1.5, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.75 }}><CheckCircleOutlinedIcon fontSize="small" />Respondidas ({answeredQ.length})</Typography>
                <Stack spacing={1.5}>
                  {(() => {
                    const map = new Map<string, { p: any; qs: any[]; last: number }>();
                    for (const q of answeredQ) { const pid = q.patientId; const g = map.get(pid) ?? { p: q.patient, qs: [], last: 0 }; g.qs.push(q); g.last = Math.max(g.last, new Date(q.createdAt).getTime()); map.set(pid, g); }
                    return [...map.values()].sort((a, b) => b.last - a.last).map((g) => (
                      <Accordion key={g.p?.id} elevation={0} sx={{ '&:before': { display: 'none' }, border: '1px solid', borderColor: 'divider', borderRadius: '12px !important', overflow: 'hidden' }}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: '52px !important', '& .MuiAccordionSummary-content': { my: 0.75 } }}>
                          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flex: 1, minWidth: 0 }}>
                            <Avatar src={g.p?.id ? photoUrlFor(g.p.id) : undefined} sx={{ width: 40, height: 40, bgcolor: 'rgba(32,178,170,.08)', color: 'primary.dark', fontSize: 15, fontWeight: 700, flexShrink: 0 }}>{(g.p?.fullName || 'P').charAt(0)}</Avatar>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography sx={{ fontWeight: 800, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'text.secondary' }}>{g.p?.fullName || 'Paciente'}</Typography>
                              <Typography variant="caption" color="text.secondary">{g.qs.length} respondida(s) · última {new Date(g.last).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</Typography>
                            </Box>
                            <Chip size="small" label="✓" sx={{ height: 22, fontWeight: 700, bgcolor: 'rgba(32,178,170,.12)', color: 'primary.dark', flexShrink: 0 }} />
                          </Stack>
                        </AccordionSummary>
                        <AccordionDetails sx={{ p: 1.5, pt: 0.5 }}>
                          <Stack spacing={1}>{g.qs.map(card)}</Stack>
                        </AccordionDetails>
                      </Accordion>
                    ));
                  })()}
                </Stack>
              </Box>)}
            </>
          );
};
