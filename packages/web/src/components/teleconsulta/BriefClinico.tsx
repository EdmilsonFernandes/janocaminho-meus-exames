// BriefClinico — exames do paciente na MÃO do médico durante a chamada (23/10).
// Composição de dados que JÁ existem no portal (share scope 'exams'): a lista
// sintética traz só os itens ALTERADOS por exame (brief de verdade — o médico
// quer o que pulou, não 40 linhas normais); o detalhe completo (todos os
// valores) carrega on-demand ao expandir. Fetch próprio + poll 30s enquanto
// aberto (paciente pode compartilhar DURANTE a chamada). v2 design-critic:
// tokens dark AA, floor 12px, retry, Material icons, chip com ellipsis.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, Collapse, Stack, Typography, useTheme } from '@mui/material';
import { Avatar } from '@mui/material';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import FavoriteIcon from '@mui/icons-material/Favorite';
import BedtimeIcon from '@mui/icons-material/Bedtime';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import MonitorWeightIcon from '@mui/icons-material/MonitorWeight';
import { API_URL, photoUrlFor } from '../../config';
import { tealText } from '../../theme';
import { fmtSleep, fmtSteps } from '../../utils/activityStats';

export interface BriefItem {
  name: string;
  valueText: string;
  flag?: string | null;
  unit?: string | null;
  refText?: string | null;
  isAbnormal?: boolean;
}
interface BriefExam {
  id: string;
  title: string;
  performedAt?: string | null;
  sourceLab?: string | null;
  _count?: { items: number };
  items: BriefItem[];
}

const fmtDate = (d?: string | null) => {
  if (!d) return null;
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

/** Cor do valor pela flag — AA nos 2 modos (fix critic #1: tokens próprios p/ dark). */
const flagTone = (flag: string | null | undefined, mode: 'light' | 'dark') => {
  const hi = flag?.startsWith('H');
  const lo = flag?.startsWith('L');
  if (mode === 'dark') {
    if (hi) return { bg: 'rgba(248,113,113,.16)', fg: '#f87171' };
    if (lo) return { bg: 'rgba(147,197,253,.16)', fg: '#93c5fd' };
    return { bg: 'rgba(251,191,36,.16)', fg: '#fbbf24' };
  }
  if (hi) return { bg: 'rgba(239,68,68,.12)', fg: '#b91c1c' };
  if (lo) return { bg: 'rgba(59,130,246,.12)', fg: '#1d4ed8' };
  return { bg: 'rgba(245,158,11,.14)', fg: '#b45309' };
};

/** Sinais vitais (Health Connect) — série diária + summary 30d do endpoint do médico. */
export interface VitalDayRow { date: string; restingHr: number; sleepMinutes: number; steps: number; activeKcal: number; exerciseMin: number }
interface VitalsBrief {
  days: VitalDayRow[];
  summary: {
    restingHrAvg30d: number | null; sleepAvg30dMin: number | null; stepsAvg30d: number | null;
    activeKcalAvg30d: number | null; lastWeightKg: number | null; lastWeightAt: string | null; lastDay: string | null;
  };
  lastSyncAt: string | null;
}

/** Carimbo relativo: "agora" · "há 12 min" · "há 3 h" · "ontem" · "há 4 dias". */
const relStamp = (iso?: string | null): string => {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return 'ontem';
  return `há ${d} dias`;
};

/** Mini-métrica de sinal vital: ícone teal + valor + contexto (proveniência koruux 6-D1). */
const VitalMetric = ({ icon, value, unit, label, context }: { icon: React.ReactNode; value: string; unit?: string; label: string; context?: string }) => (
  <Stack spacing={0.25} sx={{ minWidth: 0 }}>
    <Stack direction="row" spacing={0.75} alignItems="center">
      <Box sx={{ width: 26, height: 26, borderRadius: '8px', display: 'grid', placeItems: 'center', bgcolor: 'rgba(32,178,170,.12)', color: (t) => tealText(t.palette.mode), flexShrink: 0 }}>{icon}</Box>
      <Typography noWrap sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary' }}>{label}</Typography>
    </Stack>
    <Typography sx={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'text.primary' }}>
      {value}{unit ? ` ${unit}` : ''}
    </Typography>
    {context && <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary' }}>{context}</Typography>}
  </Stack>
);

/** Linha de valor: nome + valor com chip da flag + referência. Toque 44px, floor 12px. */
const ValueRow = ({ it, dim }: { it: BriefItem; dim?: boolean }) => {
  const mode = useTheme().palette.mode;
  const tone = it.isAbnormal || it.flag ? flagTone(it.flag, mode) : null;
  return (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ minHeight: 44, py: 0.25, opacity: dim ? 0.75 : 1 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap sx={{ fontSize: 14, fontWeight: 700, color: 'text.primary' }}>{it.name}</Typography>
        {it.refText && <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary' }}>Ref. {it.refText}</Typography>}
      </Box>
      {tone ? (
        <Chip
          size="small"
          label={`${it.valueText}${it.unit ? ` ${it.unit}` : ''}${it.flag ? ` ${it.flag}` : ''}`}
          sx={{ height: 26, maxWidth: '62%', fontSize: 13.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums', bgcolor: tone.bg, color: tone.fg, borderRadius: '8px', flexShrink: 0, '& .MuiChip-label': { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }}
        />
      ) : (
        <Typography sx={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'text.primary', flexShrink: 0 }}>
          {it.valueText}{it.unit ? ` ${it.unit}` : ''}
        </Typography>
      )}
    </Stack>
  );
};

export const BriefClinico = ({ patientId, authToken, patientName, reason }: { patientId: string; authToken: string; patientName?: string | null; reason?: string | null }) => {
  const theme = useTheme();
  const [exams, setExams] = useState<BriefExam[] | null>(null);
  const [totalExtracted, setTotalExtracted] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, BriefItem[]>>({});
  const [vitals, setVitals] = useState<VitalsBrief | null>(null);
  const reqId = useRef(0);
  const vitalsReqId = useRef(0);

  const load = useCallback(() => {
    const id = ++reqId.current;
    setErr(null);
    fetch(`${API_URL}/doctor/patients/${patientId}/exams`, { headers: { Authorization: `Bearer ${authToken}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { items?: BriefExam[]; totalExtracted?: number }) => {
        if (id !== reqId.current) return;
        setExams(d.items ?? []);
        if (typeof d.totalExtracted === 'number') setTotalExtracted(d.totalExtracted);
      })
      .catch((s: unknown) => { if (id === reqId.current) { setExams(null); setErr(s === 403 ? 'O paciente ainda não compartilhou exames com você.' : 'Não foi possível carregar os exames agora.'); } });
  }, [patientId, authToken]);

  // Sinais vitais (Health Connect): fetch on-demand discreto — seção SÓ aparece se o
  // endpoint devolver dias (paciente sem smartwatch/sem sync não vê card vazio). Sem
  // estado de erro: vitals é um extra, nunca deve competir com o brief de exames.
  const loadVitals = useCallback(() => {
    const id = ++vitalsReqId.current;
    fetch(`${API_URL}/doctor/patients/${patientId}/vitals`, { headers: { Authorization: `Bearer ${authToken}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: VitalsBrief | null) => { if (id === vitalsReqId.current) setVitals(d); })
      .catch(() => { if (id === vitalsReqId.current) setVitals(null); });
  }, [patientId, authToken]);

  useEffect(() => {
    setExams(null); setDetail({}); setOpenId(null); setVitals(null);
    load();
    loadVitals();
    // fix critic #7: poll 30s enquanto aberto — o paciente pode compartilhar
    // DURANTE a chamada e o brief precisa aparecer sem fechar/abrir.
    const iv = setInterval(() => { load(); loadVitals(); }, 30_000);
    return () => clearInterval(iv);
  }, [load, loadVitals]);

  const toggle = useCallback(async (id: string) => {
    setOpenId((cur) => (cur === id ? null : id));
    if (!detail[id]) {
      try {
        const r = await fetch(`${API_URL}/doctor/patients/${patientId}/exams/${id}`, { headers: { Authorization: `Bearer ${authToken}` } });
        if (r.ok) { const d = await r.json(); setDetail((cur) => ({ ...cur, [id]: (d.exam?.items ?? []) as BriefItem[] })); }
      } catch { /* detalhe falhou — o brief alterado segue visível */ }
    }
  }, [authToken, detail, patientId]);

  const totalAbnormal = (exams ?? []).reduce((n, e) => n + (e.items?.length ?? 0), 0);

  return (
    <Box sx={{ p: 2, pb: 3, maxWidth: 560, mx: 'auto' }}>
      {/* Cabeçalho do brief */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.25 }}>
        {/* §19 G2 (QA 24/10): foto REAL do paciente no brief — mesma identidade do
            prontuário/portal (photoUrlFor token). Fallback letra. */}
        <Avatar src={patientId ? photoUrlFor(patientId) : undefined} alt={patientName ?? 'paciente'} sx={{ width: 36, height: 36, borderRadius: '12px', fontSize: 14, fontWeight: 800, bgcolor: 'rgba(32,178,170,.12)', color: (t) => tealText(t.palette.mode), flexShrink: 0 }}>
          {(patientName ?? 'P').charAt(0).toUpperCase()}
        </Avatar>
        <Typography sx={{ fontWeight: 800, fontSize: 17, fontFamily: '"Poppins",sans-serif', color: 'text.primary', flex: 1 }}>Brief clínico</Typography>
        {exams && exams.length > 0 && (
          <Chip size="small" label={`${totalAbnormal} alterados`} sx={{ height: 24, fontSize: 12, fontWeight: 800, bgcolor: theme.palette.mode === 'dark' ? 'rgba(248,113,113,.14)' : 'rgba(239,68,68,.10)', color: theme.palette.mode === 'dark' ? '#f87171' : '#b91c1c', borderRadius: '8px' }} />
        )}
      </Stack>
      <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mb: 1.5 }}>
        {patientName ? `${patientName} · ` : ''}exames compartilhados — em destaque o que saiu da referência.
      </Typography>
      {/* Razão da visita (padrão 2-B1 koruux: overview top-down) + compartilhamento
          parcial (23/10): médico precisa SABER que existe exame que não enxerga. */}
      {reason && (
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary', mb: 0.75 }}>
          Motivo da consulta: <Box component="span" sx={{ fontWeight: 600, color: 'text.secondary' }}>{reason}</Box>
        </Typography>
      )}
      {totalExtracted != null && exams != null && exams.length > 0 && exams.length < totalExtracted && (
        <Chip size="small" label={`Compartilhamento parcial — ${exams.length} de ${totalExtracted} exames`} sx={{ height: 24, fontSize: 12, fontWeight: 800, bgcolor: 'rgba(245,158,11,.14)', color: '#b45309', borderRadius: '8px', mb: 1 }} />
      )}

      {/* Carregando — skeleton (padrão da casa) */}
      {exams === null && !err && (
        <Stack spacing={1.5}>
          {[0, 1].map((i) => (
            <Card key={i} sx={{ borderRadius: '16px' }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ height: 14, width: '55%', borderRadius: 7, bgcolor: 'rgba(32,178,170,.15)', mb: 1.5 }} />
                <Box sx={{ height: 12, width: '80%', borderRadius: 6, bgcolor: 'action.hover', mb: 1 }} />
                <Box sx={{ height: 12, width: '65%', borderRadius: 6, bgcolor: 'action.hover' }} />
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      {/* Erro com retry (fix critic #8): médico no meio da chamada não vai fechar/abrir */}
      {err && (
        <Card sx={{ borderRadius: '16px' }}>
          <CardContent sx={{ textAlign: 'center', py: 3.5, '&:last-child': { pb: 3.5 } }}>
            <FolderOpenIcon sx={{ fontSize: 34, color: 'text.secondary', mb: 1 }} />
            <Typography sx={{ fontSize: 14, color: 'text.secondary', mb: 1.5 }}>{err}</Typography>
            <Button size="small" variant="contained" onClick={() => { load(); loadVitals(); }} startIcon={<RefreshIcon sx={{ fontSize: 16 }} />} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>
              Tentar de novo
            </Button>
          </CardContent>
        </Card>
      )}

      {exams && exams.length === 0 && !err && (
        <Card sx={{ borderRadius: '16px' }}>
          <CardContent sx={{ textAlign: 'center', py: 3.5, '&:last-child': { pb: 3.5 } }}>
            <FolderOpenIcon sx={{ fontSize: 34, color: 'text.secondary', mb: 1 }} />
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: 'text.primary', mb: 0.5 }}>Nenhum exame compartilhado</Typography>
            <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>Peça ao paciente para compartilhar no app — o brief aparece aqui em até 30s.</Typography>
          </CardContent>
        </Card>
      )}

      {/* Lista de exames: alterados sempre visíveis; toque expande TODOS os valores */}
      {exams && exams.length > 0 && (
        <Stack spacing={1.5}>
          {exams.map((e) => {
            const open = openId === e.id;
            const all = detail[e.id];
            const abnormal = e.items ?? [];
            return (
              <Card key={e.id} sx={{ borderRadius: '16px', border: open ? '1.5px solid' : '1px solid', borderColor: open ? 'rgba(32,178,170,.45)' : 'divider' }}>
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    onClick={() => void toggle(e.id)}
                    role="button"
                    tabIndex={0}
                    aria-expanded={open}
                    aria-label={`Exame ${e.title}${fmtDate(e.performedAt) ? ` de ${fmtDate(e.performedAt)}` : ''} — ver todos os valores`}
                    onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); void toggle(e.id); } }}
                    sx={{ cursor: 'pointer', minHeight: 44, '&:focus-visible': { outline: '2px solid #178f89', outlineOffset: 2, borderRadius: '12px' } }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        {fmtDate(e.performedAt) && <Chip size="small" label={fmtDate(e.performedAt)} sx={{ height: 22, fontSize: 12, fontWeight: 800, bgcolor: 'rgba(32,178,170,.10)', color: (t) => tealText(t.palette.mode), borderRadius: '6px', flexShrink: 0 }} />}
                        <Typography noWrap sx={{ fontSize: 14.5, fontWeight: 800, color: 'text.primary' }}>{e.title}</Typography>
                      </Stack>
                      {e.sourceLab && <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>{e.sourceLab}</Typography>}
                    </Box>
                    <ExpandMoreIcon sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s', color: 'text.secondary', fontSize: 20, flexShrink: 0 }} />
                  </Stack>

                  {/* Brief: valores ALTERADOS direto na cara */}
                  {abnormal.length > 0 ? (
                    <Box sx={{ mt: 0.5 }}>
                      {abnormal.slice(0, open ? abnormal.length : 3).map((it, i) => <ValueRow key={`${e.id}-ab-${i}`} it={it} />)}
                      {!open && abnormal.length > 3 && (
                        <Typography
                          role="button"
                          tabIndex={0}
                          aria-label={`Ver todos os ${abnormal.length} valores alterados`}
                          onClick={() => void toggle(e.id)}
                          onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); void toggle(e.id); } }}
                          sx={{ fontSize: 12, fontWeight: 700, color: (t) => tealText(t.palette.mode), pl: 0.5, minHeight: 32, display: 'flex', alignItems: 'center', cursor: 'pointer', '&:focus-visible': { outline: '2px solid #178f89', outlineOffset: 2, borderRadius: '8px' } }}
                        >
                          +{abnormal.length - 3} alterados — toque para ver todos
                        </Typography>
                      )}
                    </Box>
                  ) : (
                    <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.5 }}>✓ Nada fora da referência</Typography>
                  )}

                  <Collapse in={open} timeout="auto" unmountOnExit>
                    <Box sx={{ pt: 1, mt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
                      {all === undefined ? (
                        <Typography sx={{ fontSize: 12.5, color: 'text.secondary', py: 1 }}>Carregando valores…</Typography>
                      ) : (
                        all.map((it, i) => <ValueRow key={`${e.id}-all-${i}`} it={it} dim={!it.isAbnormal && !it.flag} />)
                      )}
                    </Box>
                  </Collapse>

                  <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.75 }}>
                    {open ? `${(all ?? abnormal).length} valores` : `Toque para ver todos os ${e._count?.items ?? abnormal.length} valores`}
                  </Typography>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}

      {/* Sinais vitais contínuos (Health Connect) — só se o paciente sincronizou. Proveniência
          explícita (padrão koruux 6-D1): o médico precisa saber de ONDE o dado veio. */}
      {vitals && vitals.days.length > 0 && (() => {
        const s = vitals.summary;
        const latest = vitals.days[0];
        return (
          <Card sx={{ borderRadius: '16px', mt: 2 }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.25 }}>
                <MonitorHeartIcon sx={{ fontSize: 18, color: (t) => tealText(t.palette.mode) }} />
                <Typography sx={{ fontWeight: 800, fontSize: 14, color: 'text.primary', flex: 1 }}>Sinais vitais</Typography>
                <Chip size="small" label="30 dias" sx={{ height: 22, fontSize: 11.5, fontWeight: 800, bgcolor: 'rgba(32,178,170,.10)', color: (t) => tealText(t.palette.mode), borderRadius: '6px' }} />
              </Stack>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1.25 }}>
                {latest.restingHr > 0 && (
                  <VitalMetric icon={<FavoriteIcon sx={{ fontSize: 15 }} />} value={`${latest.restingHr}`} unit="bpm" label="FC de repouso" context={s.restingHrAvg30d ? `média 30d ${s.restingHrAvg30d} bpm` : undefined} />
                )}
                {s.sleepAvg30dMin != null && (
                  <VitalMetric icon={<BedtimeIcon sx={{ fontSize: 15 }} />} value={fmtSleep(s.sleepAvg30dMin)} label="Sono" context="média/noite · 30d" />
                )}
                {s.stepsAvg30d != null && (
                  <VitalMetric icon={<DirectionsWalkIcon sx={{ fontSize: 15 }} />} value={fmtSteps(s.stepsAvg30d)} label="Passos" context="média/dia · 30d" />
                )}
                {s.lastWeightKg != null && (
                  <VitalMetric icon={<MonitorWeightIcon sx={{ fontSize: 15 }} />} value={`${s.lastWeightKg} kg`} label="Último peso" context={relStamp(s.lastWeightAt)} />
                )}
              </Box>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1.25 }}>
                Fonte: smartwatch do paciente (Health Connect) · atualizado {relStamp(vitals.lastSyncAt)}
              </Typography>
            </CardContent>
          </Card>
        );
      })()}

      <Typography sx={{ fontSize: 12, color: 'text.secondary', textAlign: 'center', mt: 2 }}>
        Fonte: exames enviados pelo paciente · leitura educativa, decisão clínica é sua.
      </Typography>
    </Box>
  );
};
