import { useEffect, useRef, useState } from 'react';
import {
  Avatar, Box, Button, Card, CardContent, Chip, Stack, Typography,
} from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
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
// §2 (28/10/26): "Minhas consultas" — registro particular do paciente, ao lado das
// teleconsultas do produto. Prefill vem de Meus médicos / Encontrar especialistas.
import { MinhasConsultasRegistradas } from '../components/consultas/MinhasConsultasRegistradas';

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
  // §2 (28/10/26): duas áreas — Teleconsultas (sala virtual do produto) × Minhas
  // consultas (registro particular: presencial ou link externo, convênio, exames).
  const location = useLocation() as { state?: { tab?: string; prefillDoctor?: { doctorId?: string; doctorName?: string; specialty?: string } | null } };
  const [area, setArea] = useState<'tele' | 'minhas'>(location.state?.tab === 'minhas' ? 'minhas' : 'tele');
  const prefillDoctor = location.state?.prefillDoctor ?? null;
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

      {/* Seletor de área (28/10/26): Teleconsultas do produto × registro particular */}
      <Stack direction="row" spacing={1} sx={{ mb: 2.5 }}>
        <Button
          onClick={() => { hapticLight(); setArea('tele'); }} aria-pressed={area === 'tele'}
          sx={areaPill(area === 'tele')}
        >
          Teleconsultas
        </Button>
        <Button
          onClick={() => { hapticLight(); setArea('minhas'); }} aria-pressed={area === 'minhas'}
          sx={areaPill(area === 'minhas')}
        >
          Minhas consultas
        </Button>
      </Stack>

      {area === 'tele' && (<>

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
          <Stack spacing={1.5}>
            {historico.map((r) => {
              const docId = r.doctor?.id || r.createdByDoctorId || r.doctorId;
              const docName = r.doctor?.name
                ? (r.doctor.name.toLowerCase().startsWith('dr') ? r.doctor.name : `Dr(a). ${r.doctor.name}`)
                : r.title || 'Consulta médica';
              const ended = r.endedAt ? new Date(r.endedAt) : new Date(r.dueDate);
              const photo = r.doctor?.photoUrl || (docId ? doctorPhotoUrl(docId) : undefined);
              const crmDisplay = r.doctor?.crm ? `CRM ${r.doctor.crm}${r.doctor?.crmUf ? `-${r.doctor.crmUf}` : ''}` : null;

              // Identificação clara do Paciente atendido (Titular vs Dependente)
              const patientName = r.patient?.name || 'Edmilson';
              const isTitular = !r.patient?.relationship || r.patient?.relationship === 'self' || r.patient?.relationship?.toLowerCase() === 'titular';
              const relationship = isTitular ? 'Titular' : (r.patient?.relationship || 'Dependente');

              return (
                <Card
                  key={r.id}
                  variant="outlined"
                  onClick={() => { hapticLight(); navigate(`/teleconsulta/${r.id}`); }}
                  sx={{
                    borderRadius: '16px',
                    p: { xs: 1.75, sm: 2 },
                    bgcolor: (t) => t.palette.mode === 'dark' ? 'background.paper' : '#ffffff',
                    borderColor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      borderColor: '#0d9488',
                      boxShadow: '0 6px 18px rgba(13,148,136,0.10)',
                      transform: 'translateY(-1px)',
                    },
                  }}
                >
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.75} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between">
                    {/* Perfil do Médico & Paciente */}
                    <Stack direction="row" spacing={1.75} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                      <Box sx={{ position: 'relative', width: { xs: 46, sm: 52 }, height: { xs: 46, sm: 52 }, flexShrink: 0 }}>
                        <Avatar
                          src={safeAvatar(photo, docName)}
                          alt={docName}
                          sx={{
                            width: '100%',
                            height: '100%',
                            borderRadius: '50%',
                            fontSize: 18,
                            fontWeight: 800,
                            bgcolor: 'rgba(13,148,136,.12)',
                            color: '#0f766e',
                            border: '2px solid #e0f2fe',
                          }}
                        >
                          {docName.charAt(0)?.toUpperCase()}
                        </Avatar>
                        {crmDisplay && (
                          <Box
                            sx={{
                              position: 'absolute',
                              bottom: 0,
                              right: 0,
                              width: 14,
                              height: 14,
                              borderRadius: '50%',
                              bgcolor: '#10b981',
                              border: '2px solid white',
                            }}
                            title="Médico verificado no CFM"
                          />
                        )}
                      </Box>

                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Typography noWrap sx={{ fontSize: { xs: 14.5, sm: 15.5 }, fontWeight: 800, color: 'text.primary' }}>
                            {docName}
                          </Typography>
                          {crmDisplay && (
                            <Chip
                              size="small"
                              label={crmDisplay}
                              sx={{
                                height: 20,
                                fontSize: 11,
                                fontWeight: 700,
                                fontFamily: 'monospace',
                                bgcolor: 'action.hover',
                                color: 'text.secondary',
                                borderRadius: '4px',
                              }}
                            />
                          )}
                        </Stack>

                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mt: 0.5, rowGap: 0.5 }}>
                          {r.doctor?.specialty && (
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                              🩺 {r.doctor.specialty}
                            </Typography>
                          )}
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            📅 {ended.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })} às {ended.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </Typography>
                          <Chip
                            size="small"
                            label={`👤 Paciente: ${patientName} (${relationship})`}
                            sx={{
                              height: 22,
                              fontSize: 11,
                              fontWeight: 700,
                              bgcolor: isTitular ? 'rgba(32,178,170,.12)' : 'rgba(236,72,153,.12)',
                              color: isTitular ? '#0f766e' : '#be185d',
                              border: '1px solid',
                              borderColor: isTitular ? 'rgba(32,178,170,.25)' : 'rgba(236,72,153,.25)',
                              borderRadius: '999px',
                            }}
                          />
                        </Stack>
                      </Box>
                    </Stack>

                    {/* Ações e Status */}
                    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ width: { xs: '100%', sm: 'auto' }, justifyContent: { xs: 'space-between', sm: 'flex-end' }, pt: { xs: 1, sm: 0 }, borderTop: { xs: '1px dashed rgba(0,0,0,0.06)', sm: 'none' } }}>
                      {r.consultSummaryApproved && (
                        <Chip
                          size="small"
                          label="Resumo disponível"
                          sx={{ height: 22, fontSize: 10.5, fontWeight: 800, bgcolor: 'rgba(13,148,136,.12)', color: '#0f766e', borderRadius: '999px' }}
                        />
                      )}
                      <Chip
                        size="small"
                        icon={<CheckCircleRoundedIcon sx={{ fontSize: '14px !important' }} />}
                        label="✓ Concluída"
                        sx={{
                          height: 24,
                          fontSize: 11,
                          fontWeight: 700,
                          bgcolor: 'rgba(16,185,129,.12)',
                          color: '#065f46',
                          border: '1px solid rgba(16,185,129,.25)',
                          borderRadius: '999px',
                          '& .MuiChip-icon': { color: '#059669' },
                        }}
                      />
                      <Button
                        size="small"
                        variant="outlined"
                        endIcon={<ArrowForwardRoundedIcon sx={{ fontSize: 15 }} />}
                        sx={{
                          borderRadius: '8px',
                          textTransform: 'none',
                          fontWeight: 700,
                          fontSize: 12,
                          color: 'text.primary',
                          borderColor: 'divider',
                          px: 1.5,
                          '&:hover': { bgcolor: 'action.hover', borderColor: '#0d9488' },
                        }}
                      >
                        Ver Prontuário
                      </Button>
                    </Stack>
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        )
      )}
      </>)}

      {area === 'minhas' && <MinhasConsultasRegistradas prefillDoctor={prefillDoctor} />}
    </PageContainer>
  );
};

/** Pill de seleção de área — mesmo estilo das tabs Abertas/Histórico. */
const areaPill = (on: boolean) => ({
  minHeight: 40,
  px: 2.5,
  borderRadius: '999px',
  textTransform: 'none' as const,
  fontWeight: 800,
  fontSize: 13.5,
  color: on ? '#fff' : 'text.secondary',
  background: on ? 'linear-gradient(135deg, #20b2aa 0%, #178f89 100%)' : 'transparent',
  border: '1px solid',
  borderColor: on ? 'transparent' : 'divider',
  boxShadow: on ? '0 4px 14px rgba(32,178,170,.35)' : 'none',
  '&:hover': { bgcolor: on ? undefined : 'action.hover' },
});
