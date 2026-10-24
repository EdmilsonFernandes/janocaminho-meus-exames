import { useEffect, useRef, useState } from 'react';
import {
  Avatar, Box, Button, Card, CardContent, Chip, Stack, Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import EventAvailableRoundedIcon from '@mui/icons-material/EventAvailableRounded';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { API_URL, token, doctorPhotoUrl } from '../config';
import { useSelectedPatient } from '../patient-context';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { hapticLight, hapticSuccess } from '../utils/haptic';
import { safeAvatar } from '../utils/safeAvatar';
import { ConsultaAtivaCard } from '../components/teleconsulta/ConsultaAtivaCard';

/**
 * Minhas Consultas (rota /consultas, item 3 da bottom nav) — tela dedicada do
 * paciente para teleconsultas, conforme mock aprovado:
 *  - Tabs Abertas/Histórico (pills 999px).
 *  - Abertas = teleconsulta não concluída (!endedAt && !done), asc por data.
 *  - Histórico = concluída (endedAt || done), desc.
 *  - Poll 15s + refetch imediato no visibilitychange (padrão Reminders).
 *  - Poll 5s doctorInRoom p/ "SALA ABERTA" (mesmo contrato do Reminders).
 * Payload real do GET /api/reminders: id, title, dueDate, type, provider,
 * linkUrl, consentAt, done, endedAt, consultPriceCents, paidAt,
 * createdByDoctorId, doctor{id,name,crm,crmUf,specialty,photoUrl}, consultSummaryApproved.
 */
export const MinhasConsultasPage = () => {
  const [pid] = useSelectedPatient();
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [tab, setTab] = useState<'abertas' | 'historico'>('abertas');
  // médico na sala (chamando): id → true. Ref p/ haptic só na transição.
  const [callingIds, setCallingIds] = useState<Record<string, boolean>>({});
  const callingRef = useRef<Record<string, boolean>>({});

  const isTele = (r: any) => r && (r.type === 'teleconsulta' || r.provider === 'livekit');
  const isDone = (r: any) => !!r.endedAt || !!r.done;

  const load = async () => {
    if (!pid) return;
    try {
      const r = await fetch(`${API_URL}/reminders?patientId=${pid}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (r.ok) setItems(await r.json());
    } catch { /* offline: próximo tick tenta de novo */ }
  };

  // Polling 15s + refetch imediato ao voltar pra aba (visibilidade).
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    void load();
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    const iv = setInterval(refresh, 15_000);
    return () => { document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh); clearInterval(iv); };
  }, [pid]); // eslint-disable-line react-hooks/exhaustive-deps

  const teleconsultas = items.filter(isTele);

  // Poll doctorInRoom (5s) — espelha o Reminders: só teleconsultas não-done
  // sem link externo na janela (atraso ≤2h). Alimenta o pill "SALA ABERTA".
  useEffect(() => {
    const cands = teleconsultas.filter((r) =>
      !r.done && !r.endedAt && !r.linkUrl &&
      new Date(r.dueDate).getTime() >= Date.now() - 2 * 60 * 60 * 1000);
    if (!cands.length) { setCallingIds({}); callingRef.current = {}; return; }
    let stop = false;
    const poll = async () => {
      const next: Record<string, boolean> = {};
      await Promise.all(cands.map(async (r) => {
        try {
          const res = await fetch(`${API_URL}/teleconsulta/${r.id}/summary`, { headers: { Authorization: `Bearer ${token()}` } });
          if (!res.ok) return;
          const d = await res.json();
          if (d?.doctorInRoom) next[r.id] = true;
        } catch { /* offline: próximo tick */ }
      }));
      if (stop) return;
      const started = Object.keys(next).some((id) => !callingRef.current[id]);
      callingRef.current = next;
      setCallingIds(next);
      if (started) hapticSuccess();
    };
    void poll();
    const iv = setInterval(() => void poll(), 5000);
    return () => { stop = true; clearInterval(iv); };
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = new Date();
  const abertas = teleconsultas.filter((r) => !isDone(r)).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const historico = teleconsultas.filter(isDone).sort((a, b) => new Date(b.endedAt ?? b.dueDate).getTime() - new Date(a.endedAt ?? a.dueDate).getTime());

  const TABS: { v: 'abertas' | 'historico'; l: string; n: number }[] = [
    { v: 'abertas', l: 'Abertas', n: abertas.length },
    { v: 'historico', l: 'Histórico', n: historico.length },
  ];

  return (
    <PageContainer width="content" sx={{ pb: { xs: 12, sm: 5 } }}>
      <PageHeader
        icon={<VideocamRoundedIcon />}
        title="Minhas Consultas"
        subtitle="Suas teleconsultas com sala virtual, pagamento e histórico em um só lugar."
      />

      {/* Tabs em pill (mock) */}
      <Stack direction="row" spacing={1} sx={{ mb: 2.5 }}>
        {TABS.map((t) => {
          const on = tab === t.v;
          return (
            <Button
              key={t.v}
              onClick={() => { hapticLight(); setTab(t.v); }}
              startIcon={t.v === 'historico' ? <HistoryRoundedIcon sx={{ display: { xs: 'none', sm: 'inline-flex' } }} /> : <EventAvailableRoundedIcon sx={{ display: { xs: 'none', sm: 'inline-flex' } }} />}
              aria-pressed={on}
              sx={{
                minHeight: 40,
                px: 2.5,
                borderRadius: '999px',
                textTransform: 'none',
                fontWeight: 800,
                fontSize: 13.5,
                color: on ? '#fff' : 'text.secondary',
                background: on ? 'linear-gradient(135deg, #20b2aa 0%, #178f89 100%)' : 'transparent',
                border: '1px solid',
                borderColor: on ? 'transparent' : 'divider',
                boxShadow: on ? '0 4px 14px rgba(32,178,170,.35)' : 'none',
                '&:hover': { bgcolor: on ? undefined : 'action.hover' },
              }}
            >
              {t.l} ({t.n})
            </Button>
          );
        })}
      </Stack>

      {/* ── ABERTAS ── */}
      {tab === 'abertas' && (
        abertas.length === 0 ? (
          <Card variant="outlined" sx={{ borderRadius: '20px', borderStyle: 'dashed', textAlign: 'center', py: 5 }}>
            <CardContent>
              <VideocamRoundedIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
              <Typography sx={{ fontWeight: 800, fontSize: 16, mb: 0.5 }}>Nenhuma consulta aberta</Typography>
              <Typography color="text.secondary" sx={{ mb: 2, maxWidth: 340, mx: 'auto', fontSize: 13.5 }}>
                Quando seu médico agendar uma teleconsulta, ela aparece aqui com sala virtual e lembretes.
              </Typography>
              <Button
                variant="outlined"
                onClick={() => { hapticLight(); navigate('/medicos'); }}
                sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, borderColor: '#20b2aa', color: '#0f766e', px: 3 }}
              >
                Falar com meu médico
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Stack spacing={2}>
            {abertas.map((r) => (
              <ConsultaAtivaCard
                key={r.id}
                r={r}
                now={now}
                calling={!!callingIds[r.id]}
                onCanceled={() => void load()}
                onPaid={() => void load()}
              />
            ))}
          </Stack>
        )
      )}

      {/* ── HISTÓRICO ── */}
      {tab === 'historico' && (
        historico.length === 0 ? (
          <Card variant="outlined" sx={{ borderRadius: '20px', borderStyle: 'dashed', textAlign: 'center', py: 5 }}>
            <CardContent>
              <HistoryRoundedIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
              <Typography sx={{ fontWeight: 800, fontSize: 16, mb: 0.5 }}>Histórico vazio</Typography>
              <Typography color="text.secondary" sx={{ maxWidth: 340, mx: 'auto', fontSize: 13.5 }}>
                Consultas concluídas ficam arquivadas aqui, com resumo e documentos quando o médico aprovar.
              </Typography>
            </CardContent>
          </Card>
        ) : (
          <Card variant="outlined" sx={{ borderRadius: '20px', p: { xs: 1, sm: 1.5 }, borderColor: 'rgba(13,148,136,.25)' }}>
            {historico.map((r, i) => {
              const docId = r.doctor?.id || r.createdByDoctorId || r.doctorId;
              const docName = r.doctor?.name
                ? (r.doctor.name.toLowerCase().startsWith('dr') ? r.doctor.name : `Dr(a). ${r.doctor.name}`)
                : r.title || 'Consulta médica';
              const ended = r.endedAt ? new Date(r.endedAt) : new Date(r.dueDate);
              return (
                <Stack
                  key={r.id}
                  component="button"
                  type="button"
                  direction="row"
                  alignItems="center"
                  spacing={1.25}
                  onClick={() => { hapticLight(); navigate(`/teleconsulta/${r.id}`); }}
                  sx={{
                    width: '100%', textAlign: 'left', cursor: 'pointer',
                    background: 'transparent', border: 'none', fontFamily: 'inherit',
                    py: 1.5, px: 1,
                    borderBottom: i < historico.length - 1 ? '1px solid' : 'none',
                    borderColor: 'divider',
                    borderRadius: '12px',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <Avatar
                    src={safeAvatar(docId ? doctorPhotoUrl(docId) : undefined, docName)}
                    alt={docName}
                    sx={{ width: 40, height: 40, borderRadius: '12px', fontSize: 15, fontWeight: 800, bgcolor: 'rgba(99,102,241,.12)', color: '#6366f1', flexShrink: 0 }}
                  >
                    {docName.charAt(0)?.toUpperCase()}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 800, color: 'text.primary' }}>{docName}</Typography>
                    <Typography noWrap sx={{ fontSize: 11.5, color: 'text.secondary', mt: 0.15 }}>
                      {ended.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      {r.doctor?.specialty ? ` · ${r.doctor.specialty}` : ''}
                    </Typography>
                  </Box>
                  {r.consultSummaryApproved && (
                    <Chip size="small" label="Resumo disponível" sx={{ height: 22, fontSize: 10.5, fontWeight: 800, bgcolor: 'rgba(13,148,136,.12)', color: '#0f766e', borderRadius: '999px', display: { xs: 'none', sm: 'inline-flex' } }} />
                  )}
                  <Chip
                    size="small"
                    icon={<CheckCircleRoundedIcon sx={{ fontSize: '13px !important' }} />}
                    label="Concluída"
                    sx={{ height: 22, fontSize: 10.5, fontWeight: 800, bgcolor: 'rgba(99,102,241,.12)', color: '#818cf8', border: '1px solid rgba(165,180,252,.25)', borderRadius: '999px', '& .MuiChip-icon': { color: '#a5b4fc' } }}
                  />
                  <ArrowForwardRoundedIcon sx={{ fontSize: 16, color: '#0d9488', flexShrink: 0 }} />
                </Stack>
              );
            })}
          </Card>
        )
      )}
    </PageContainer>
  );
};
