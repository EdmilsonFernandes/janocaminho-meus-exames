// SportsDashboard (E4.1/E4.2) — painel "Saúde Esportiva" do PACIENTE. Renderizado pelo
// DashboardV2 no lugar do grid normal quando o SportsProfile está ativo (toggle do
// Perfil, persistido no servidor). Layout = IA do preview
// docs/saude-esportiva/preview-sports-athlete-dashboard.html (alerta no topo →
// contexto do atleta → quick stats → filtros por domínio → cards de marcador →
// linha do tempo → preparação p/ consulta → substâncias), implementado 100% com
// componentes/padrões existentes (AppCard, chips, grid minmax da Carteira, régua
// estilo ValueBar + banda cobre tracejada do TrendsChart, PageContainer, tokens).
//
// Variação por esporte = whitelabel interno (diretiva do dono): só muda o copy do
// cabeçalho, a ênfase e o FILTRO-PADRÃO de domínio (archetypeOf) — identidade teal
// inegociável, zero sistema visual novo.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Chip, Stack, Typography, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import ScienceIcon from '@mui/icons-material/Science';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import { API_URL, token } from '../../config';
import { PageContainer } from '../layout/PageContainer';
import { DashboardHeader } from '../dashboard/DashboardHeader';
import { FailedExamsAlert } from '../dashboard/FailedExamsAlert';
import { RejectedExamsAlert } from '../dashboard/RejectedExamsAlert';
import { ProcessingStrip } from '../dashboard/DashboardV2';
import { BiologicalAgeCard } from '../dashboard/BiologicalAgeCard';
import { AppCard } from '../AppCard';
import { EmptyState } from '../EmptyState';
import { TileShimmer } from '../Shimmer';
import { SEM, tealText } from '../../theme';
import { useClinicalGoals } from '../../hooks/useClinicalGoals';
import { fetchActivitySummary } from '../../services/activitySummary';
import type { SportsProfile } from '../../hooks/useSportsProfile';
import { archetypeOf, sportsDomainOf, SPORTS_DOMAINS, type SportsDomainKey } from './sportsDomains';
import { SportsAlertBanner } from './SportsAlertBanner';
import { SportsMarkerCard, type EvolutionAnalyte, type CollectionContextChips } from './SportsMarkerCard';
import { SportsTimeline, type SportsEvent } from './SportsTimeline';
import { SportsConsultPrep } from './SportsConsultPrep';
import { SportsSubstances, type DeclaredSubstanceView } from './SportsSubstances';
import { priorityOf, PRIORITY_RANK } from '../../utils/alertPriority';

/** Recorte do useDashboardData que o painel esportivo consome (MESMOS números do modo normal). */
export interface SportsDashData {
  loaded: boolean;
  stats: { exams: number; abnormal: number };
  lastExam: string | null;
  failed: number;
  rejected: number;
  processing: { count: number; oldestAt: string | null } | null;
  importante: number;
  moderada: number;
  staleWarning: string;
  worsened: { name: string; nameCanonical?: string; unit?: string; latest?: { valueNumeric?: number | null }; refLow?: number | null; refHigh?: number | null; flag?: string }[];
  // Idade biológica: mesmos `any` do DashboardV2 (estado cru do health-summary).
  bio: any;
  bioKdm: any;
  bioAvail: any;
  hsLoaded: boolean;
}

/** collectionContext é jsonb livre (E1) — lê chaves conhecidas degradando com segurança. */
export function parseCollectionContext(cc: unknown): CollectionContextChips | null {
  if (!cc || typeof cc !== 'object') return null;
  const o = cc as Record<string, unknown>;
  const truthy = (v: unknown) => v === true || v === 1 || v === 'true' || v === 'sim';
  const jejum = truthy(o.jejum) || truthy(o.fasting);
  const treino24h = truthy(o.treino24h) || truthy(o.treino) || truthy(o.trainingWithin24h);
  const doseRaw = typeof o.ultimaDose === 'string' ? o.ultimaDose : typeof o.lastDose === 'string' ? o.lastDose : null;
  const ultimaDose = doseRaw && doseRaw.trim() ? doseRaw.trim() : null;
  if (!jejum && !treino24h && !ultimaDose) return null;
  return { jejum: jejum || undefined, treino24h: treino24h || undefined, ultimaDose };
}

/** Medication "[Classe] Nome" → view limpa (mesma regex do DeclaredSubstanceForm). */
const DECLARED_MED_RX = /^\[([^\]]+)\]\s*(.*)$/;
function substancesFromMeds(meds: unknown, pid: string): DeclaredSubstanceView[] {
  if (!Array.isArray(meds)) return [];
  return meds
    .filter((m: any) => m?.patientId === pid && typeof m.name === 'string' && DECLARED_MED_RX.test(m.name))
    .map((m: any) => {
      const mm = DECLARED_MED_RX.exec(m.name)!;
      const dosage = typeof m.dosage === 'string' ? m.dosage.replace(/ — declarado pelo paciente|declarado pelo paciente/g, '').trim() : null;
      return { id: String(m.id), name: mm[2].trim() || m.name, klass: mm[1], dosage: dosage || null, startedAt: m.startedAt ?? null };
    });
}
function substancesFromProfile(cc: unknown): DeclaredSubstanceView[] {
  if (!Array.isArray(cc)) return [];
  const out: DeclaredSubstanceView[] = [];
  cc.forEach((s: any, i: number) => {
    if (typeof s === 'string') {
      if (s.trim()) out.push({ id: `sp-${i}`, name: s.trim(), klass: null, dosage: null, startedAt: null });
    } else if (s && typeof s === 'object') {
      const name = String(s.name ?? '').trim();
      if (name) out.push({
        id: `sp-${i}`, name, klass: null,
        dosage: s.dose != null ? String(s.dose) : null, startedAt: s.startedAt != null ? String(s.startedAt) : null,
      });
    }
  });
  return out;
}

const fmtDay = (d?: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—');
const relDays = (d?: string | null) => {
  if (!d) return null;
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days < 0) return 'em breve';
  if (days === 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 30) return `há ${days} dias`;
  const m = Math.floor(days / 30);
  return m < 12 ? `há ${m} ${m === 1 ? 'mês' : 'meses'}` : `há ${Math.floor(m / 12)} ano(s)`;
};

const MARKER_CAP = 30;

export const SportsDashboard = ({ pid, d, profile, firstName }: {
  pid: string | null;
  d: SportsDashData;
  profile: SportsProfile | null;
  firstName: string;
}) => {
  const navigate = useNavigate();
  const theme = useTheme();
  const goals = useClinicalGoals();
  const archetype = archetypeOf(profile?.modality);

  // ── Dados próprios do painel (fetch-cache cacheia os GETs /api/*) ──
  const [items, setItems] = useState<EvolutionAnalyte[] | null>(null);
  const [exams, setExams] = useState<any[]>([]);
  const [abnByExam, setAbnByExam] = useState<Record<string, number>>({});
  const [substances, setSubstances] = useState<DeclaredSubstanceView[]>([]);
  const [activityDays, setActivityDays] = useState<{ date: string; min: number }[]>([]);

  useEffect(() => {
    if (!pid) return;
    const h = { Authorization: `Bearer ${token()}` };
    // Analitos + histórico (1 GET — alimenta cards, prep e stats por domínio).
    fetch(`${API_URL}/items/evolution?patientId=${pid}`, { headers: h })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((res) => setItems(Array.isArray(res.items) ? res.items : []))
      .catch(() => setItems([]));
    // Exames + alterados por exame (linha do tempo — mesmo par da página Timeline).
    Promise.all([
      fetch(`${API_URL}/exams?_start=0&_end=100&patientId=${pid}`, { headers: h }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`${API_URL}/items/abnormal?patientId=${pid}`, { headers: h }).then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
      fetch(`${API_URL}/medications?patientId=${pid}`, { headers: h }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetchActivitySummary(30, pid),
    ]).then(([rows, abn, meds, activity]: any[]) => {
      // Exames EXTRAÍDOS e do titular (CPF divergente não é jornada — padrão Timeline).
      const examRows = (Array.isArray(rows) ? rows : [])
        .filter((e: any) => e.status === 'EXTRACTED' && !(e?.rawExtraction?.identityMatch?.method === 'cpf' && e?.rawExtraction?.identityMatch?.cpfMatch === false));
      setExams(examRows);
      const byExam: Record<string, number> = {};
      for (const it of abn?.items ?? []) byExam[it.examId] = (byExam[it.examId] ?? 0) + 1;
      setAbnByExam(byExam);
      // Substâncias: Medications com prefixo de classe + jsonb do perfil (dedup por nome).
      const merged = [...substancesFromMeds(meds, pid), ...substancesFromProfile(profile?.declaredSubstances)];
      const seen = new Set<string>();
      setSubstances(merged.filter((s) => {
        const k = s.name.trim().toLowerCase();
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      }));
      // Atividade HC: treinos = minutos de exercício por dia (ausente ≠ zero — §E4.3).
      // series30 vem ASC — pega os 6 dias de treino mais recentes (slice(-6), não slice(0,6)).
      const ex = activity?.metrics?.EXERCISE_MINUTES?.series30 ?? [];
      setActivityDays(ex.filter((p: any) => Number(p.value) > 0).slice(-6).map((p: any) => ({ date: p.date, min: Math.round(Number(p.value)) })));
    }).catch(() => { /* offline: seções degradam com estados vazios honestos */ });
    // profile muda só ao togglar (o que desmonta este painel) — fetch idempotente via cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid]);

  const ctx = parseCollectionContext(profile?.collectionContext);
  const loading = items == null || !d.loaded;

  // Contagem por domínio (chips de filtro com contagem, padrão Carteira/preview §5).
  const domainCounts = useMemo(() => {
    const counts: Record<string, number> = { todos: items?.length ?? 0 };
    for (const it of items ?? []) {
      const dom = sportsDomainOf(it.nameCanonical);
      counts[dom] = (counts[dom] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  // Whitelabel: filtro-padrão do arquétipo; domínio vazio no paciente (ou troca de
  // paciente que esvazia o domínio selecionado) → volta pra "Todos" (nunca estado
  // vazio sem motivo).
  const [domain, setDomain] = useState<SportsDomainKey | 'todos'>('todos');
  useEffect(() => {
    if (items == null) return;
    setDomain((cur) => {
      if (cur !== 'todos' && (domainCounts[cur] ?? 0) === 0) return 'todos';
      if (cur === 'todos' && archetype.defaultDomain && (domainCounts[archetype.defaultDomain] ?? 0) > 0) return archetype.defaultDomain;
      return cur;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items != null]);

  const visible = useMemo(() => {
    const list = (items ?? []).filter((it) => domain === 'todos' || sportsDomainOf(it.nameCanonical) === domain);
    const asAlert = (it: EvolutionAnalyte) => ({
      name: it.nameCanonical, nameCanonical: it.nameCanonical, valueNumeric: it.lastValue,
      refLow: it.refLow, refHigh: it.refHigh, flag: it.points[it.points.length - 1]?.flag ?? null,
    });
    return [...list].sort((a, b) => {
      const pa = a.abnormal ? PRIORITY_RANK[priorityOf(asAlert(a))] : -1;
      const pb = b.abnormal ? PRIORITY_RANK[priorityOf(asAlert(b))] : -1;
      if (pa !== pb) return pb - pa;
      return new Date(b.lastDate ?? 0).getTime() - new Date(a.lastDate ?? 0).getTime();
    });
  }, [items, domain]);

  const examsLastYear = useMemo(
    () => exams.filter((e) => e.performedAt && Date.now() - new Date(e.performedAt).getTime() < 365 * 86400000).length,
    [exams],
  );

  /** Exame de coleta mais recente (o tile "Último exame" abre ELE, não o último upload). */
  const lastExamRow = useMemo(() => {
    let best: any = null;
    for (const e of exams) {
      if (!e.performedAt) continue;
      if (!best || new Date(e.performedAt).getTime() > new Date(best.performedAt).getTime()) best = e;
    }
    return best;
  }, [exams]);

  // Linha do tempo unificada: exames + substâncias + treinos HC.
  const timelineEvents: SportsEvent[] = useMemo(() => {
    const evts: SportsEvent[] = exams.map((e) => ({
      id: e.id, date: e.performedAt, title: e.title ?? 'Exame', type: 'exam' as const, abnormalCount: abnByExam[e.id] ?? 0,
    }));
    for (const s of substances) {
      if (s.startedAt) evts.push({ id: `s-${s.id}`, date: s.startedAt, title: `Início: ${s.name}`, detail: s.klass ?? 'Substância declarada', type: 'substancia' });
    }
    for (const a of activityDays.slice(0, 6)) {
      evts.push({ id: `a-${a.date}`, date: `${a.date}T12:00:00`, title: `Treino · ${a.min} min`, detail: 'Health Connect', type: 'atividade' });
    }
    return evts;
  }, [exams, abnByExam, substances, activityDays]);

  const totalMarkers = items?.length ?? 0;

  // Estado vazio GLOBAL: sem exames nenhum → onboarding honesto (não inventa painel).
  if (d.loaded && d.stats.exams === 0 && (items ?? []).length === 0) {
    return (
      <PageContainer width="wide" sx={{ bgcolor: 'transparent', minHeight: '100dvh' }}>
        <DashboardHeader firstName={firstName} />
        <AppCard sx={{ mt: 2 }}>
          <EmptyState
            title="Saúde Esportiva começa com um exame"
            desc={`Envie seu primeiro exame e o Dr. Exame organiza seus marcadores por domínio${profile?.modality ? ` para ${profile.modality.toLowerCase()}` : ''} — com régua do laboratório, histórico e meta clínica.`}
            cta="Enviar primeiro exame"
            onCta={() => navigate('/exams/create')}
          />
        </AppCard>
      </PageContainer>
    );
  }

  const statTile = (key: string, icon: ReactNode, label: string, value: string, sub: string, tone: string, onClick: () => void) => (
    <AppCard key={key} kind="interactive" onClick={onClick} aria-label={`${label}: ${value} — ver`}
      sx={{ p: 1.75, minWidth: 0, borderRadius: '14px', display: 'flex', alignItems: 'center', gap: 1.25 }}>
      <Box sx={{ width: 40, height: 40, borderRadius: '12px', flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: alpha(tone, 0.12), color: tone }}>{icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</Typography>
        <Typography noWrap sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: { xs: 18, sm: 21 }, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
        <Typography noWrap sx={{ fontSize: 11.5, color: 'text.secondary' }}>{sub}</Typography>
      </Box>
    </AppCard>
  );

  return (
    <PageContainer width="wide" sx={{ bgcolor: 'transparent', minHeight: '100dvh' }}>
      <DashboardHeader firstName={firstName} />
      <FailedExamsAlert count={d.failed} onClick={() => navigate('/exams')} />
      <RejectedExamsAlert count={d.rejected} onClick={() => navigate('/exams')} />
      {d.processing && d.processing.count > 0 && (
        <ProcessingStrip count={d.processing.count} oldestAt={d.processing.oldestAt} onClick={() => navigate('/exams')} />
      )}

      {/* ── CONTEXTO DO ATLETA (hero compacto do preview §1 — copy por arquétipo) ── */}
      <AppCard kind="tinted" tone="primary" tone2="secondary" sx={{ mt: d.failed || d.rejected ? 2 : 0, p: { xs: 2, sm: 2.5 }, mb: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
          <Box sx={{ width: 44, height: 44, borderRadius: '12px', flexShrink: 0, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, rgba(32,178,170,.25), rgba(212,165,116,.25))' }}>
            <FitnessCenterIcon sx={{ color: (t) => tealText(t.palette.mode) }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
              <Typography component="h2" sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: { xs: 18, sm: 21 }, lineHeight: 1.15 }}>
                {archetype.header}
              </Typography>
              {profile?.modality && (
                <Chip size="small" label={profile.modality} sx={{ height: 24, fontWeight: 800, bgcolor: 'rgba(32,178,170,.14)', color: (t) => tealText(t.palette.mode) }} />
              )}
              <Chip size="small" label="🏃 Modo Esporte" sx={{ height: 24, fontWeight: 800, bgcolor: 'rgba(32,178,170,.14)', color: (t) => tealText(t.palette.mode) }} />
            </Stack>
            <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5, lineHeight: 1.45 }}>
              {profile?.goals?.trim() || archetype.emphasis}
            </Typography>
            {(ctx || profile?.trainingFreq) && (
              <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.75 }}>
                {profile?.trainingFreq && <Chip size="small" label={`Treino: ${profile.trainingFreq}`} sx={{ height: 22, fontSize: 11, fontWeight: 700, bgcolor: 'action.hover', color: 'text.secondary' }} />}
                {ctx?.jejum && <Chip size="small" label="Coleta em jejum" sx={{ height: 22, fontSize: 11, fontWeight: 700, bgcolor: 'action.hover', color: 'text.secondary' }} />}
                {ctx?.treino24h && <Chip size="small" label="Treino <24h antes da coleta" sx={{ height: 22, fontSize: 11, fontWeight: 700, bgcolor: 'action.hover', color: 'text.secondary' }} />}
                {ctx?.ultimaDose && <Chip size="small" label={`Última dose: ${ctx.ultimaDose}`} sx={{ height: 22, fontSize: 11, fontWeight: 700, bgcolor: 'action.hover', color: 'text.secondary' }} />}
              </Stack>
            )}
          </Box>
          {d.lastExam && (
            <Box sx={{ textAlign: { sm: 'right' }, flexShrink: 0 }}>
              <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Último exame</Typography>
              <Typography sx={{ fontSize: 13, fontWeight: 800 }}>{fmtDay(d.lastExam)} · {relDays(d.lastExam)}</Typography>
            </Box>
          )}
        </Stack>
      </AppCard>

      {/* ── ALERTAS (mesma fonte do modo normal: byPriority/staleWarning/worsening) ── */}
      <SportsAlertBanner
        loaded={d.loaded}
        exams={d.stats.exams}
        importante={d.importante}
        moderada={d.moderada}
        staleWarning={d.staleWarning}
        worsened={d.worsened}
      />

      {/* ── QUICK STATS (grid minmax da Carteira + Idade Biológica — mesma do modo normal) ── */}
      {loading ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5, mb: 2 }}>
          {[0, 1, 2, 3].map((i) => <TileShimmer key={i} />)}
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5, mb: 2 }}>
          {statTile('ultimo', <EventAvailableIcon fontSize="small" />, 'Último exame', fmtDay(d.lastExam), relDays(d.lastExam) ?? '—', '#0d9488',
            () => (lastExamRow ? navigate(`/exams/${lastExamRow.id}/show`) : navigate('/exams')))}
          {statTile('ano', <ScienceIcon fontSize="small" />, 'Exames no ano', String(examsLastYear), `de ${d.stats.exams} no total`, '#6366f1', () => navigate('/exams'))}
          {statTile('alterados', <FavoriteBorderIcon fontSize="small" />, 'Alterados ativos', String(d.stats.abnormal),
            d.stats.abnormal > 0 ? 'pedem atenção' : 'nada fora da faixa', d.stats.abnormal > 0 ? SEM.bad[theme.palette.mode] : SEM.ok[theme.palette.mode],
            () => navigate('/alterados'))}
          <BiologicalAgeCard idx={3} bio={d.bio} bioKdm={d.bioKdm} bioAvail={d.bioAvail} bioLoaded={d.hsLoaded} />
        </Box>
      )}

      {/* ── FILTROS POR DOMÍNIO (chips Carteira filtrável, contagem do preview §5) ── */}
      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
        <Chip component="button" aria-pressed={domain === 'todos'} label={`Todos (${domainCounts.todos ?? 0})`}
          onClick={() => setDomain('todos')} color={domain === 'todos' ? 'primary' : 'default'} variant={domain === 'todos' ? 'filled' : 'outlined'}
          sx={{ fontWeight: 700, borderRadius: '999px', height: { xs: 40, sm: 32 }, fontSize: 13 }} />
        {SPORTS_DOMAINS.filter((s) => (domainCounts[s.key] ?? 0) > 0 || s.key !== 'outros').map((s) => (
          <Chip key={s.key} component="button" aria-pressed={domain === s.key} label={`${s.label} (${domainCounts[s.key] ?? 0})`}
            onClick={() => setDomain(s.key)} color={domain === s.key ? 'primary' : 'default'} variant={domain === s.key ? 'filled' : 'outlined'}
            sx={{ fontWeight: 700, borderRadius: '999px', height: { xs: 40, sm: 32 }, fontSize: 13 }} />
        ))}
      </Stack>

      {/* ── CARDS DE MARCADOR (renderCard pattern: AppCard + régua + chips) ── */}
      {items == null ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          {[0, 1, 2, 3].map((i) => <TileShimmer key={i} />)}
        </Box>
      ) : visible.length === 0 ? (
        <AppCard>
          <EmptyState emoji="🔬" title={`Nenhum marcador em ${SPORTS_DOMAINS.find((s) => s.key === domain)?.label ?? 'domínio'}`}
            desc="Envie um exame com esta banca para o domínio aparecer aqui — ou volte para “Todos”." />
        </AppCard>
      ) : (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
            {visible.slice(0, MARKER_CAP).map((it) => (
              <SportsMarkerCard key={it.nameCanonical} it={it} goals={goals} patientId={pid} ctx={ctx} />
            ))}
          </Box>
          {visible.length > MARKER_CAP && (
            <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'text.secondary' }}>
              Mostrando {MARKER_CAP} de {visible.length} marcadores — a lista completa fica em <b>Tendências</b>.
            </Typography>
          )}
        </>
      )}

      {/* ── LINHA DO TEMPO UNIFICADA ── */}
      <Box sx={{ mt: 2.5 }}>
        <SportsTimeline events={timelineEvents} hasActivityData={activityDays.length > 0} />
      </Box>

      {/* ── PREPARAÇÃO P/ CONSULTA + SUBSTÂNCIAS (grid assimétrico do DashboardV2) ── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 7fr) minmax(0, 5fr)' }, gap: 2.5, mt: 2.5, alignItems: 'start' }}>
        <SportsConsultPrep items={items ?? []} goals={goals} patientId={pid} substances={substances} lastExamAt={d.lastExam} />
        <SportsSubstances substances={substances} />
      </Box>

      {/* Rodapé de ética (preview §8 — redução de danos, sem citar norma específica) */}
      <Typography variant="caption" sx={{ display: 'block', mt: 3, color: 'text.secondary', lineHeight: 1.5 }}>
        *Educativo. O Dr. Exame monitora e organiza seus exames — não prescreve, não sugere dose nem orienta uso de substâncias. A interpretação final é do seu médico.
        {totalMarkers > 0 && ` · ${totalMarkers} marcadores analisados.`}
      </Typography>
    </PageContainer>
  );
};
