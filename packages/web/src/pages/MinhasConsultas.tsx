import { useEffect, useRef, useState } from 'react';
import {
  Avatar, Box, Button, Card, CardContent, Chip, Skeleton, Stack, Typography,
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
import { chipA11y } from '../utils/chipA11y';
import { ConsultaAtivaCard } from '../components/teleconsulta/ConsultaAtivaCard';
import { FalarAgora } from '../components/FalarAgora';
// §2 (28/10/26): "Minhas consultas" — registro particular do paciente, ao lado das
// teleconsultas do produto. Prefill vem de Meus médicos / Encontrar especialistas.
import { MinhasConsultasRegistradas } from '../components/consultas/MinhasConsultasRegistradas';
import { Badge as ReuiBadge } from '@/components/reui/badge';
import { Frame, FramePanel } from '@/components/reui/frame';
import { IconTile } from '@/components/reui/patterns';
import { useReuiThemeSync } from '@/components/reui/use-reui-theme';

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
  useReuiThemeSync();
  const [pid] = useSelectedPatient();
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  // AUD-013: sem loading state a tela piscava "Nenhuma consulta" antes do fetch
  // responder — o vazio só pode aparecer depois da PRIMEIRA resposta.
  const [loading, setLoading] = useState(true);
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
  const isDone = (r: any) => Boolean(r.endedAt || r.done || r.status === 'completed' || r.status === 'concluded');

  const load = async () => {
    if (!pid) return;
    try {
      const r = await fetch(`${API_URL}/reminders?patientId=${pid}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (r.ok) setItems(await r.json());
    } catch { /* offline: próximo tick tenta de novo */ }
    finally { setLoading(false); }
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
      !isDone(r) && !r.linkUrl &&
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
    { v: 'abertas', l: 'Próximas', n: abertas.length },
    { v: 'historico', l: 'Histórico', n: historico.length },
  ];

  return (
    <PageContainer width="content" sx={{ pb: { xs: 12, sm: 5 } }}>
      <PageHeader
        icon={<VideocamRoundedIcon />}
        title="Consultas"
        subtitle="Teleconsultas e sua agenda pessoal"
      />

      {/* Seletor de área (mock Consultas aprovado): UM segmented em pílula de vidro, labels curtos,
          no padrão do menu premium — substitui os dois botões verdes empilhados. */}
      <Box sx={{
        display: 'flex', p: '4px', borderRadius: '999px', mb: 3,
        bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.6)',
        boxShadow: (t) => t.palette.mode === 'dark'
          ? 'inset 1px 1px 0 rgba(255,255,255,0.1), 0 0 6px rgba(0,0,0,0.25)'
          : 'inset 1px 1px 0 rgba(255,255,255,0.95), inset -1px -1px 0 rgba(255,255,255,0.55), 0 0 6px rgba(0,0,0,0.05)',
      }}>
        <Button
          fullWidth
          onClick={() => { hapticLight(); setArea('tele'); }}
          aria-pressed={area === 'tele'}
          startIcon={<VideocamRoundedIcon sx={{ fontSize: 17 }} />}
          sx={segArea(area === 'tele')}
        >
          Por vídeo
        </Button>
        <Button
          fullWidth
          onClick={() => { hapticLight(); setArea('minhas'); }}
          aria-pressed={area === 'minhas'}
          startIcon={<EventAvailableRoundedIcon sx={{ fontSize: 17 }} />}
          sx={segArea(area === 'minhas')}
        >
          Minha agenda
        </Button>
      </Box>

      {area === 'tele' && (<>
        {/* Fila imediata "Falar agora" — plantão médico Dr. Exame */}
        <FalarAgora sx={{ mb: 2.5 }} />

        {/* Sub-abas: Abertas vs Histórico */}
        <Stack direction="row" spacing={1} sx={{ mb: 2.5 }}>
          {TABS.map((t) => {
            const on = tab === t.v;
            return (
              <Button
                key={t.v}
                onClick={() => { hapticLight(); setTab(t.v); }}
                startIcon={t.v === 'historico' ? <HistoryRoundedIcon /> : <EventAvailableRoundedIcon />}
                aria-pressed={on}
                sx={{
                  minHeight: 38,
                  px: 2.2,
                  borderRadius: '999px',
                  textTransform: 'none',
                  fontWeight: 800,
                  fontSize: 13,
                  color: on ? '#fff' : 'text.secondary',
                  bgcolor: on ? '#0f766e' : (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#f1f5f5',
                  boxShadow: on ? '0 2px 10px rgba(15,118,110,0.25)' : 'none',
                  border: '1px solid',
                  borderColor: on ? 'transparent' : 'divider',
                  '&:hover': { bgcolor: on ? '#115e59' : 'action.hover' },
                }}
              >
                {t.l} ({t.n})
              </Button>
            );
          })}
        </Stack>

      {/* ── ABERTAS ── */}
      {tab === 'abertas' && loading && abertas.length === 0 && (
        <Stack spacing={2}>
          {[0, 1].map((i) => (
            <Card key={i} variant="outlined" sx={{ borderRadius: '20px', p: 2.5 }}>
              <Skeleton variant="text" width="55%" height={26} />
              <Skeleton variant="text" width="35%" />
              <Skeleton variant="rounded" width={140} height={36} sx={{ mt: 1.5, borderRadius: '999px' }} />
            </Card>
          ))}
        </Stack>
      )}
      {tab === 'abertas' && !loading && (
        abertas.length === 0 ? (
          <Frame className="w-full">
            <FramePanel className="flex flex-col items-center py-7 text-center">
              <IconTile tone="primary" size="lg" className="mb-3">
                <VideocamRoundedIcon sx={{ fontSize: 24 }} />
              </IconTile>
              <Typography sx={{ fontWeight: 800, fontSize: 16, mb: 0.5, fontFamily: '"Poppins",sans-serif' }}>
                Nenhuma teleconsulta agendada agora
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 2.5, maxWidth: 360, mx: 'auto', fontSize: 13, lineHeight: 1.5 }}>
                Quando seu médico agendar uma chamada por vídeo, a sala virtual e o lembrete aparecerão aqui automaticamente.
              </Typography>

              {historico.length > 0 && (
                <button
                  type="button"
                  onClick={() => { hapticLight(); setTab('historico'); }}
                  className="mb-3 inline-flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/[0.06] px-3.5 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary/12"
                >
                  <HistoryRoundedIcon sx={{ fontSize: 16 }} />
                  <span>
                    Você tem {historico.length} {historico.length === 1 ? 'consulta concluída' : 'consultas concluídas'} no histórico
                  </span>
                  <ArrowForwardRoundedIcon sx={{ fontSize: 14 }} />
                </button>
              )}

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="center" sx={{ width: { xs: '100%', sm: 'auto' } }}>
                <Button
                  variant="outlined"
                  onClick={() => { hapticLight(); setArea('minhas'); }}
                  sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 800, borderColor: 'rgba(32,178,170,0.4)', color: '#0f766e', px: 2.5 }}
                >
                  + Anotar na minha agenda
                </Button>
                <Button
                  variant="text"
                  onClick={() => { hapticLight(); navigate('/encontrar'); }}
                  sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, color: 'text.secondary', px: 2 }}
                >
                  Buscar especialistas →
                </Button>
              </Stack>
            </FramePanel>
          </Frame>
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
      {tab === 'historico' && loading && historico.length === 0 && (
        <Stack spacing={1.5}>
          {[0, 1, 2].map((i) => (
            <Card key={i} variant="outlined" sx={{ borderRadius: '20px', p: 2.5 }}>
              <Skeleton variant="text" width="60%" height={24} />
              <Skeleton variant="text" width="40%" />
            </Card>
          ))}
        </Stack>
      )}
      {tab === 'historico' && !loading && (
        historico.length === 0 ? (
          <Frame className="w-full">
            <FramePanel className="flex flex-col items-center py-7 text-center">
              <IconTile tone="muted" size="lg" className="mb-3">
                <HistoryRoundedIcon sx={{ fontSize: 24 }} />
              </IconTile>
              <Typography sx={{ fontWeight: 800, fontSize: 16, mb: 0.5, fontFamily: '"Poppins",sans-serif' }}>
                Histórico vazio
              </Typography>
              <Typography color="text.secondary" sx={{ maxWidth: 340, mx: 'auto', fontSize: 13 }}>
                Consultas concluídas ficam arquivadas aqui, com resumo clínico e pedidos de exames aprovados pelo médico.
              </Typography>
              <ReuiBadge variant="outline" size="xs" className="mt-3">
                Prontuário seguro LGPD
              </ReuiBadge>
            </FramePanel>
          </Frame>
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

              // Identificação clara do Paciente atendido (Titular vs Dependente).
              // AUD-010: fallback NEUTRO — "Edmilson" hardcoded aparecia como paciente
              // de qualquer usuário do app.
              const patientName = r.patient?.name || 'Paciente';
              const isTitular = !r.patient?.relationship || r.patient?.relationship === 'self' || r.patient?.relationship?.toLowerCase() === 'titular';
              const relationship = isTitular ? 'Titular' : (r.patient?.relationship || 'Dependente');

              return (
                <Card
                  key={r.id}
                  variant="outlined"
                  onClick={() => { hapticLight(); navigate(`/teleconsulta/${r.id}`); }}
                  {...chipA11y()}
                  aria-label={`Abrir consulta de ${new Date(r.endedAt ?? r.dueDate).toLocaleDateString('pt-BR')}`}
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
                                height: 22,
                                fontSize: 12, // piso de legibilidade (F7)
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
                              height: 24,
                              fontSize: 12, // piso de legibilidade (F7)
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
                          sx={{ height: 24, fontSize: 12, fontWeight: 800, bgcolor: 'rgba(13,148,136,.12)', color: '#0f766e', borderRadius: '999px' }}
                        />
                      )}
                      <Chip
                        size="small"
                        icon={<CheckCircleRoundedIcon sx={{ fontSize: '14px !important' }} />}
                        label="✓ Concluída"
                        sx={{
                          height: 24,
                          fontSize: 12, // piso de legibilidade (F7)
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

/** Segmento do seletor de área — pílula de vidro no padrão do menu premium (mock aprovado). */
const segArea = (on: boolean) => ({
  height: 42,
  borderRadius: '999px',
  textTransform: 'none' as const,
  fontSize: 13.5,
  fontWeight: on ? 700 : 500,
  color: on ? ((t: any) => t.palette.mode === 'dark' ? '#8ff0e8' : '#0b5c57') : 'text.secondary',
  bgcolor: on ? ((t: any) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : '#ffffff') : 'transparent',
  boxShadow: on
    ? ((t: any) => t.palette.mode === 'dark'
      ? 'inset 1px 1px 0 rgba(255,255,255,0.14)'
      : 'inset 0 0 0 1px rgba(32,178,170,0.25), inset 1px 1px 0 #fff, 0 8px 18px -10px rgba(15,90,86,0.45)')
    : 'none',
  '&:hover': { bgcolor: on ? undefined : 'rgba(32,178,170,0.06)' },
  transition: 'all 0.18s ease',
});

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
