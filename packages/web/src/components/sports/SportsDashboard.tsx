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
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import ScienceIcon from '@mui/icons-material/Science';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
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
import { goalFor, withinGoal } from '../../utils/clinicalGoals';
import { fetchActivitySummary } from '../../services/activitySummary';
import type { SportsProfile } from '../../hooks/useSportsProfile';
import {
  resolveArchetype, parseHormonalContext, domainOrderOf, spotlightIndexOf,
  sportsDomainOf, SPORTS_DOMAINS, mergePanelVariants, type SportsDomainKey,
} from './sportsDomains';
import { SportsPersonaBar } from './SportsPersonaBar';
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

  // ── Dados próprios do painel (fetch-cache cacheia os GETs /api/*) ──
  const [items, setItems] = useState<EvolutionAnalyte[] | null>(null);
  const [exams, setExams] = useState<any[]>([]);
  const [abnByExam, setAbnByExam] = useState<Record<string, number>>({});
  const [substances, setSubstances] = useState<DeclaredSubstanceView[]>([]);
  const [activityDays, setActivityDays] = useState<{ date: string; min: number }[]>([]);
  // Métricas HC do spotlight da lente (ENDURANCE): FC repouso + distância 7d.
  const [hrRest, setHrRest] = useState<number | null>(null);
  const [dist7Km, setDist7Km] = useState<number | null>(null);

  // LENTE (E5): esporte (fuzzy da modalidade) × contexto hormonal (wizard ou dedução
  // pelas substâncias — dado antigo continua funcionando). Muda ORDEM das abas,
  // spotlight dos quick stats/primeiros cards, chips de foco e viés das perguntas.
  const archetype = useMemo(
    () => resolveArchetype({
      modality: profile?.modality,
      hormonalContext: parseHormonalContext(profile?.collectionContext),
      substances,
    }),
    [profile?.modality, profile?.collectionContext, substances],
  );

  useEffect(() => {
    if (!pid) return;
    const h = { Authorization: `Bearer ${token()}` };
    // Analitos + histórico (1 GET — alimenta cards, prep e stats por domínio).
    // MERGE de variantes com/sem acento ("HEMATÓCRITO × HEMATOCRITO" — drift canônico):
    // agrupa por chave normalizada p/ NÃO renderizar dois cards do mesmo marcador.
    fetch(`${API_URL}/items/evolution?patientId=${pid}`, { headers: h })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((res) => setItems(Array.isArray(res.items) ? mergePanelVariants(res.items) : []))
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
      // Distância dos últimos 7 dias (spotlight ENDURANCE — só se HOUVE dado, senão null).
      const dist = (activity?.metrics?.DISTANCE?.series30 ?? []).slice(-7).reduce((t: number, p: any) => t + Number(p.value || 0), 0);
      setDist7Km(dist > 0 ? Math.round(dist * 10) / 10 : null);
    }).catch(() => { /* offline: seções degradam com estados vazios honestos */ });
    // FC de repouso (spotlight ENDURANCE): mesma fonte/honestidade do RestingHeartCard —
    // só existe com ≥7 dias de dados; lente sem a métrica não faz o fetch.
    if (archetype.spotlight.some((s) => s.metric === 'hr_rest')) {
      fetch(`${API_URL}/measurements/hr-trend?days=30&patientId=${pid}`, { headers: h })
        .then((r) => (r.ok ? r.json() : { series: [] }))
        .then((d) => {
          const s = Array.isArray(d.series) ? d.series : [];
          if (s.length >= 7 && Number(s[s.length - 1].avg) > 0) setHrRest(Math.round(Number(s[s.length - 1].avg)));
        })
        .catch(() => {});
    }
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
      // Spotlight da lente sobe (E5): empatou na prioridade → marcador do arquétipo primeiro.
      const sa = spotlightIndexOf(archetype, a.nameCanonical);
      const sb = spotlightIndexOf(archetype, b.nameCanonical);
      const na = sa === -1 ? 99 : sa;
      const nb = sb === -1 ? 99 : sb;
      if (na !== nb) return na - nb;
      return new Date(b.lastDate ?? 0).getTime() - new Date(a.lastDate ?? 0).getTime();
    });
  }, [items, domain, archetype]);

  // Abas de domínio na ordem da LENTE (E5): o domínio típico do esporte vem primeiro;
  // "outros" sempre no fim. Trocar a modalidade no Perfil reordena na recarga.
  const orderedDomains = useMemo(() => {
    const order = domainOrderOf(archetype);
    return [...SPORTS_DOMAINS].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  }, [archetype]);

  // SPOTLIGHT da lente (E5): marcadores do arquétipo sobem pros QUICK STATS (substituem
  // os tiles padrão — "último exame" já vive na barra de persona). Máx 3 + "alterados"
  // (sinal de segurança sempre presente). SEM dado → tile de DADO não existe (nunca
  // zero/fake), mas o GAP não fica célula vazia: tile honesto "Complete seu painel"
  // (júri E4+ #5) nomeando os marcadores da lente que ainda não têm exame.
  const spotlightTiles = useMemo(() => {
    const fmt = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
    const tiles: { key: string; icon: ReactNode; label: string; value: string; sub: string; tone: string; onClick: () => void }[] = [];
    for (const sp of archetype.spotlight) {
      if (tiles.length >= 3) break;
      if (sp.rx) {
        const it = (items ?? []).find((x) => sp.rx!.test(x.nameCanonical) && x.lastValue != null);
        if (!it) continue;
        const above = it.refHigh != null && it.lastValue! > it.refHigh;
        const below = it.refLow != null && it.lastValue! < it.refLow;
        // TRT: testosterona dentro da meta clínica vigente → "🎯 Alvo atingido" (matriz).
        const g = goalFor(goals, it.nameCanonical, pid);
        const sub = g && withinGoal(it.lastValue, g) ? '🎯 Alvo atingido'
          : above ? 'acima da referência' : below ? 'abaixo da referência' : 'na referência';
        tiles.push({
          key: sp.key, icon: <ScienceIcon fontSize="small" />, label: sp.label,
          value: `${fmt(it.lastValue)}${it.unit ? ` ${it.unit}` : ''}`, sub,
          tone: above || below ? SEM.bad[theme.palette.mode] : tealText(theme.palette.mode),
          onClick: () => navigate(`/tendencias?select=${encodeURIComponent(it.nameCanonical)}`),
        });
      } else if (sp.metric === 'hr_rest' && hrRest != null) {
        tiles.push({
          key: sp.key, icon: <FavoriteBorderIcon fontSize="small" />, label: sp.label,
          value: `${hrRest} bpm`, sub: 'FC de repouso (7+ dias)',
          tone: hrRest > 80 ? SEM.warn[theme.palette.mode] : hrRest < 60 ? SEM.ok[theme.palette.mode] : tealText(theme.palette.mode),
          onClick: () => navigate('/medicoes'),
        });
      } else if (sp.metric === 'distance_week' && dist7Km != null) {
        tiles.push({
          key: sp.key, icon: <FavoriteBorderIcon fontSize="small" />, label: sp.label,
          value: `${dist7Km.toLocaleString('pt-BR')} km`, sub: 'últimos 7 dias · Health Connect',
          tone: tealText(theme.palette.mode), onClick: () => navigate('/medicoes'),
        });
      }
    }
    return tiles;
  }, [archetype, items, goals, pid, hrRest, dist7Km, theme.palette.mode, navigate]);

  // Marcadores da LENTE sem dado nos exames → alimentam o tile honesto "Complete seu
  // painel" (não é célula vazia nem dado inventado — é o próximo passo do atleta).
  // Só ANALITOS (sp.rx): métricas HC (FC/distância) não são exame — cobrar "complete o
  // painel" por elas seria desonesto (o dado vem do Health Connect, não do laboratório).
  const missingSpotlight = useMemo(() => {
    if (spotlightTiles.length === 0) return [];
    const got = new Set(spotlightTiles.map((t) => t.key));
    return archetype.spotlight.filter((sp) => sp.rx && !got.has(sp.key)).map((sp) => sp.label);
  }, [spotlightTiles, archetype]);

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
      sx={{ p: 1.75, minWidth: 0, borderRadius: '12px', display: 'flex', alignItems: 'center', gap: 1.25 }}>
      <Box sx={{ width: 40, height: 40, borderRadius: '12px', flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: alpha(tone, 0.12), color: tone }}>{icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography noWrap sx={{ fontSize: 11.5, fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.03em', textOverflow: 'ellipsis', overflow: 'hidden' }}>{label}</Typography>
        <Typography noWrap sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: { xs: 18, sm: 21 }, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums', textOverflow: 'ellipsis', overflow: 'hidden' }}>{value}</Typography>
        <Typography noWrap sx={{ fontSize: 11.5, color: 'text.secondary', textOverflow: 'ellipsis', overflow: 'hidden' }}>{sub}</Typography>
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

      {/* ── BARRA DE PERSONA DO ATLETA (júri E4+ #13 — ENXUTA ~2 linhas: avatar+nome/idade,
          chip modalidade, objetivo e último exame. Médico vinculado, peso/altura e chips
          de foco do arquétipo foram CORTADOS; treino recente vive na linha do tempo). ── */}
      <Box sx={{ mt: d.failed || d.rejected ? 2 : 0 }}>
        <SportsPersonaBar
          pid={pid}
          profile={profile}
          archetype={archetype}
          fallbackName={firstName}
          lastExam={lastExamRow
            ? { date: lastExamRow.performedAt ?? null, lab: typeof lastExamRow.sourceLab === 'string' ? lastExamRow.sourceLab : null }
            : d.lastExam ? { date: d.lastExam, lab: null } : null}
          ctx={ctx}
        />
      </Box>

      {/* ── ALERTAS (mesma fonte do modo normal: byPriority/staleWarning/worsening) +
          contexto educativo E5 §3 (Hct diretriz, TGO-muscular) + chips relacionados ── */}
      <SportsAlertBanner
        loaded={d.loaded}
        exams={d.stats.exams}
        importante={d.importante}
        moderada={d.moderada}
        staleWarning={d.staleWarning}
        worsened={d.worsened}
        items={items ?? undefined}
        substances={substances}
        training={activityDays}
      />

      {/* ── QUICK STATS: SPOTLIGHT da lente quando existe (E5) — senão o grid padrão
          (Carteira + Idade Biológica, mesma do modo normal). "Alterados ativos" fica
          SEMPRE (sinal de segurança); sem spotlight, nada muda em relação ao atual. ── */}
      {loading ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5, mb: 2 }}>
          {[0, 1, 2, 3].map((i) => <TileShimmer key={i} />)}
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5, mb: 2 }}>
          {spotlightTiles.length > 0 ? (
            <>
              {spotlightTiles.map((t) => statTile(t.key, t.icon, t.label, t.value, t.sub, t.tone, t.onClick))}
              {statTile('alterados', <FavoriteBorderIcon fontSize="small" />, 'Alterados ativos', String(d.stats.abnormal),
                d.stats.abnormal > 0 ? 'pedem atenção' : 'nada fora da faixa', d.stats.abnormal > 0 ? SEM.bad[theme.palette.mode] : SEM.ok[theme.palette.mode],
                () => navigate('/alterados'))}
              {/* Gap da lente: marcador do arquétipo SEM dado → tile honesto do próximo
                  passo (cobre premium, upsell leve p/ /planos) — nunca célula vazia. */}
              {missingSpotlight.length > 0 && statTile(
                'complete',
                <PlaylistAddCheckIcon fontSize="small" />,
                'Complete seu painel',
                missingSpotlight.join(' · '),
                'sem dado nos seus exames — veja como completar',
                theme.palette.mode === 'dark' ? '#d4a574' : '#8a6240',
                () => navigate('/planos'),
              )}
            </>
          ) : (
            <>
              {statTile('ultimo', <EventAvailableIcon fontSize="small" />, 'Último exame', fmtDay(d.lastExam), relDays(d.lastExam) ?? '—', tealText(theme.palette.mode),
                () => (lastExamRow ? navigate(`/exams/${lastExamRow.id}/show`) : navigate('/exams')))}
              {statTile('ano', <ScienceIcon fontSize="small" />, 'Exames no ano', String(examsLastYear), `de ${d.stats.exams} no total`, tealText(theme.palette.mode), () => navigate('/exams'))}
              {statTile('alterados', <FavoriteBorderIcon fontSize="small" />, 'Alterados ativos', String(d.stats.abnormal),
                d.stats.abnormal > 0 ? 'pedem atenção' : 'nada fora da faixa', d.stats.abnormal > 0 ? SEM.bad[theme.palette.mode] : SEM.ok[theme.palette.mode],
                () => navigate('/alterados'))}
              <BiologicalAgeCard idx={3} bio={d.bio} bioKdm={d.bioKdm} bioAvail={d.bioAvail} bioLoaded={d.hsLoaded} />
            </>
          )}
        </Box>
      )}

      {/* ── FILTROS POR DOMÍNIO (chips Carteira filtrável, contagem do preview §5) ── */}
      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
        <Chip component="button" aria-pressed={domain === 'todos'} label={`Todos (${domainCounts.todos ?? 0})`}
          onClick={() => setDomain('todos')} color={domain === 'todos' ? 'primary' : 'default'} variant={domain === 'todos' ? 'filled' : 'outlined'}
          sx={{ fontWeight: 700, borderRadius: '999px', height: { xs: 44, sm: 32 }, fontSize: 13 }} />
        {orderedDomains.filter((s) => (domainCounts[s.key] ?? 0) > 0 || s.key !== 'outros').map((s) => (
          <Chip key={s.key} component="button" aria-pressed={domain === s.key} label={`${s.label} (${domainCounts[s.key] ?? 0})`}
            onClick={() => setDomain(s.key)} color={domain === s.key ? 'primary' : 'default'} variant={domain === s.key ? 'filled' : 'outlined'}
            sx={{ fontWeight: 700, borderRadius: '999px', height: { xs: 44, sm: 32 }, fontSize: 13 }} />
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
        <SportsConsultPrep items={items ?? []} goals={goals} patientId={pid} substances={substances} lastExamAt={d.lastExam} bias={archetype.questionBias} />
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
