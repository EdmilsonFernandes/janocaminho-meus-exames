import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Stack, Typography, TextField, Button, MenuItem, Chip, Dialog, DialogTitle, DialogContent, DialogActions, IconButton,
  Switch, FormControlLabel, LinearProgress, Tooltip, Autocomplete,
} from '@mui/material';
import { useNotify } from 'react-admin';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import FilterAltOffOutlinedIcon from '@mui/icons-material/FilterAltOffOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import { API_URL, token } from '../../config';
import { TabLoader, SectionError } from './parts';
import { Badge, type BadgeProps } from '@/components/reui/badge';
import { Frame, FramePanel, FrameHeader, FrameTitle, FrameDescription } from '@/components/reui/frame';
import { ReuiTextarea } from '@/components/reui/form-controls';
import { useReuiThemeSync } from '@/components/reui/use-reui-theme';

/**
 * ADMIN · OPINIÕES DOS USUÁRIOS (02/11/26) — transformar relatos em decisões.
 *  - Resumo com DENOMINADORES visíveis (respostas, participantes, base elegível): poucas
 *    respostas nunca viram "conclusão geral" sem o n ao lado.
 *  - Dificuldades mais citadas (ponderando quem NÃO conseguiu), melhorias mais pedidas,
 *    categorias (usabilidade / técnica / valor / preço / feature) e evolução semanal.
 *  - Lista com filtros; detalhe com contexto técnico mínimo (tela, plataforma, versão);
 *    triagem: status, tags, melhoria associada (agrupa sem perder o relato), notas.
 *  - Sem IA no MVP (zero custo por resposta).
 */
const H = () => ({ Authorization: `Bearer ${token()}` });
const JH = () => ({ ...H(), 'Content-Type': 'application/json' });

interface Item {
  id: string; subjectType: 'user' | 'doctor'; subjectId: string;
  subject: { name: string; email: string; extra: string | null; isTest: boolean } | null;
  surveyKey: string; surveyVersion: number;
  outcome: string; outcomeLabel: string;
  detail: { id: string; label: string }[]; improvement: { id: string; label: string } | null;
  category: string; categoryLabel: string; comment: string | null;
  context: Record<string, string | boolean> | null;
  status: string; tags: string[]; improvementKey: string | null; adminNotes: string | null;
  createdAt: string; updatedAt: string;
}
interface Summary {
  responses: number; participants: number; withComment: number;
  eligibleBase: { users: number; doctors: number };
  byOutcome: Record<string, number>; byCategory: Record<string, number>; byStatus: Record<string, number>;
  topDifficulties: { key: string; id: string; label: string; count: number; negative: number }[];
  topDetail: { key: string; id: string; label: string; count: number; negative: number }[];
  topImprovements: { key: string; id: string; label: string; count: number }[];
  weekly: { week: string; total: number; done: number }[];
}
interface Labels { categories: Record<string, string>; outcomes: Record<string, string>; statuses: Record<string, string> }
interface Improvement { key: string; count: number; byStatus: Record<string, number>; categories: Record<string, number>; lastAt: string; firstAt: string }
interface FbSettings { enabled: boolean; minAccountAgeDays: number; inviteIntervalDays: number; maxDismissals: number }

const OUTCOME_BADGE: Record<string, BadgeProps['variant']> = { done: 'success-light', partial: 'warning-light', not: 'destructive-light', exploring: 'info-light' };
const STATUS_BADGE: Record<string, BadgeProps['variant']> = { new: 'primary-light', reviewing: 'info-light', planned: 'warning-light', resolved: 'success-light' };
const CATEGORY_BADGE: Record<string, BadgeProps['variant']> = { usability: 'info-light', technical: 'destructive-light', value: 'warning-light', pricing: 'focus-light', feature: 'primary-light', other: 'invert-light' };
const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const fieldSx = { '& .MuiOutlinedInput-root': { borderRadius: '12px' } };

type Filters = { from: string; to: string; subjectType: string; category: string; status: string; outcome: string; q: string; improvementKey: string; detail: string };
const EMPTY_FILTERS: Filters = { from: '', to: '', subjectType: '', category: '', status: '', outcome: '', q: '', improvementKey: '', detail: '' };

export const FeedbackTab = () => {
  useReuiThemeSync();
  const notify = useNotify();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [labels, setLabels] = useState<Labels | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [improvements, setImprovements] = useState<Improvement[]>([]);
  const [detail, setDetail] = useState<Item | null>(null);
  const [settings, setSettings] = useState<FbSettings | null>(null);
  const [view, setView] = useState<'list' | 'improvements'>('list');

  const query = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) p.set(k, v); });
    p.set('page', String(page)); p.set('limit', '30');
    return p.toString();
  }, [filters, page]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [r, imp, cfg] = await Promise.all([
        fetch(`${API_URL}/admin/feedback?${query}`, { headers: H() }),
        fetch(`${API_URL}/admin/feedback/improvements`, { headers: H() }),
        fetch(`${API_URL}/admin/config`, { headers: H() }),
      ]);
      if (!r.ok) throw new Error('feedback');
      const d = await r.json();
      setItems(d.items ?? []); setTotal(d.total ?? 0); setSummary(d.summary ?? null); setLabels(d.labels ?? null);
      if (imp.ok) setImprovements((await imp.json()).improvements ?? []);
      if (cfg.ok) { const c = await cfg.json(); const f = c?.feedback ?? {}; setSettings({ enabled: f.enabled === true || Number(f.enabled) === 1, minAccountAgeDays: Number(f.minAccountAgeDays ?? 2), inviteIntervalDays: Number(f.inviteIntervalDays ?? 30), maxDismissals: Number(f.maxDismissals ?? 3) }); }
    } catch { setError('Não foi possível carregar as opiniões.'); }
    finally { setLoading(false); }
  }, [query]);
  useEffect(() => { void load(); }, [load]);

  const saveSettings = async (patch: Partial<FbSettings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    const r = await fetch(`${API_URL}/admin/config/costs`, { method: 'PATCH', headers: JH(), body: JSON.stringify({ category: 'feedback', enabled: next.enabled ? 1 : 0, minAccountAgeDays: next.minAccountAgeDays, inviteIntervalDays: next.inviteIntervalDays, maxDismissals: next.maxDismissals }) });
    if (!r.ok) { notify('Falha ao salvar configuração', { type: 'error' }); return; }
    setSettings(next); notify('Configuração salva', { type: 'success' });
  };

  const patchItem = async (id: string, body: Record<string, unknown>) => {
    const r = await fetch(`${API_URL}/admin/feedback/${id}`, { method: 'PATCH', headers: JH(), body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { notify(d?.error || 'Falha ao salvar', { type: 'error' }); return null; }
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...d } : i)));
    if (detail?.id === id) setDetail({ ...detail, ...d });
    notify('Salvo', { type: 'success' });
    return d as Item;
  };

  const hasFilters = Object.values(filters).some(Boolean);
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
  const improvementKeys = useMemo(() => improvements.map((i) => i.key), [improvements]);

  if (loading && !summary) return <TabLoader />;
  if (error) return <SectionError message={error} onRetry={load} />;

  return (
    <Stack spacing={2.5} data-testid="admin-feedback">
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
        <Box>
          <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 20, color: 'text.primary' }}>Opiniões dos usuários</Typography>
          <Typography variant="body2" color="text.secondary">O que ajuda, o que confunde e o que falta — com o n ao lado de cada número.</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant={view === 'list' ? 'contained' : 'outlined'} onClick={() => setView('list')} sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '10px' }}>Respostas</Button>
          <Button size="small" variant={view === 'improvements' ? 'contained' : 'outlined'} onClick={() => setView('improvements')} sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '10px' }}>Melhorias ({improvements.length})</Button>
          <Button size="small" startIcon={<RefreshIcon />} onClick={load} sx={{ textTransform: 'none', fontWeight: 700 }}>Atualizar</Button>
        </Stack>
      </Box>

      {summary && (
        <>
          {/* Denominadores */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: 'Respostas (filtro)', value: summary.responses, hint: `${summary.withComment} com comentário` },
              { label: 'Participantes', value: summary.participants, hint: 'pessoas distintas' },
              { label: 'Base elegível', value: summary.eligibleBase.users + summary.eligibleBase.doctors, hint: `${summary.eligibleBase.users} pacientes · ${summary.eligibleBase.doctors} médicos` },
              { label: 'Participação', value: `${pct(summary.participants, summary.eligibleBase.users + summary.eligibleBase.doctors)}%`, hint: 'participantes ÷ base' },
            ].map((k) => (
              <Frame key={k.label} spacing="sm"><FramePanel className="flex flex-col gap-0.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{k.label}</span>
                <span className="text-2xl font-extrabold text-foreground" style={{ fontFamily: 'Poppins, sans-serif' }} data-testid={`kpi-${k.label}`}>{k.value}</span>
                <span className="text-xs text-muted-foreground">{k.hint}</span>
              </FramePanel></Frame>
            ))}
          </div>

          {summary.responses > 0 && summary.responses < 10 && (
            <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 700 }}>Poucas respostas ({summary.responses}): leia como sinais individuais, não como tendência.</Typography>
          )}

          <div className="grid gap-2.5 lg:grid-cols-3">
            {/* Conseguiu? */}
            <Frame>
              <FrameHeader><FrameTitle>Conseguiu fazer o que precisava?</FrameTitle><FrameDescription>n = {summary.responses}</FrameDescription></FrameHeader>
              <FramePanel className="flex flex-col gap-2">
                {(['done', 'partial', 'not', 'exploring'] as const).map((k) => {
                  const n = summary.byOutcome[k] ?? 0;
                  return (
                    <Box key={k} sx={{ cursor: 'pointer' }} onClick={() => { setFilters((f) => ({ ...f, outcome: f.outcome === k ? '' : k })); setPage(1); }} data-testid={`outcome-bar-${k}`}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
                        <Badge variant={OUTCOME_BADGE[k]} size="xs">{labels?.outcomes[k] ?? k}</Badge>
                        <span className="text-xs font-bold text-foreground">{n} · {pct(n, summary.responses)}%</span>
                      </Box>
                      <LinearProgress variant="determinate" value={pct(n, summary.responses)} sx={{ height: 6, borderRadius: 99, bgcolor: 'rgba(15,90,86,.08)', '& .MuiLinearProgress-bar': { borderRadius: 99, bgcolor: '#20b2aa' } }} />
                    </Box>
                  );
                })}
              </FramePanel>
            </Frame>

            {/* Dificuldades */}
            <Frame>
              <FrameHeader><FrameTitle>Dificuldades mais citadas</FrameTitle><FrameDescription>Pondera quem respondeu "em parte" ou "não". Clique para filtrar.</FrameDescription></FrameHeader>
              <FramePanel className="flex flex-col gap-1.5 p-2">
                {summary.topDifficulties.length === 0 && <span className="p-2 text-xs text-muted-foreground">Sem dados ainda.</span>}
                {summary.topDifficulties.map((d) => (
                  <button key={d.key} type="button" onClick={() => { setFilters((f) => ({ ...f, detail: f.detail === d.id ? '' : d.id })); setPage(1); }}
                    className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted/40 ${filters.detail === d.id ? 'bg-primary/10' : ''}`}>
                    <span className="text-foreground">{d.label}</span>
                    <span className="shrink-0 text-xs text-muted-foreground"><b className="text-foreground">{d.negative}</b> dific. · {d.count} total</span>
                  </button>
                ))}
              </FramePanel>
            </Frame>

            {/* Melhorias pedidas */}
            <Frame>
              <FrameHeader><FrameTitle>O que faria diferença</FrameTitle><FrameDescription>Pedidos recorrentes (Q3).</FrameDescription></FrameHeader>
              <FramePanel className="flex flex-col gap-1.5 p-2">
                {summary.topImprovements.length === 0 && <span className="p-2 text-xs text-muted-foreground">Sem dados ainda.</span>}
                {summary.topImprovements.map((d) => (
                  <div key={d.key} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm">
                    <span className="text-foreground">{d.label}</span>
                    <span className="shrink-0 text-xs text-muted-foreground"><b className="text-foreground">{d.count}</b> · {pct(d.count, summary.responses)}%</span>
                  </div>
                ))}
              </FramePanel>
            </Frame>
          </div>

          <div className="grid gap-2.5 lg:grid-cols-2">
            <Frame>
              <FrameHeader><FrameTitle>Tipo de problema</FrameTitle><FrameDescription>Categoria derivada automaticamente; reclassifique no detalhe.</FrameDescription></FrameHeader>
              <FramePanel className="flex flex-wrap gap-1.5">
                {labels && Object.entries(labels.categories).map(([k, l]) => (
                  <Chip key={k} size="small" label={`${l}: ${summary.byCategory[k] ?? 0}`} onClick={() => { setFilters((f) => ({ ...f, category: f.category === k ? '' : k })); setPage(1); }} color={filters.category === k ? 'primary' : 'default'} variant={filters.category === k ? 'filled' : 'outlined'} sx={{ fontWeight: 700 }} data-testid={`category-chip-${k}`} />
                ))}
              </FramePanel>
            </Frame>
            <Frame>
              <FrameHeader><FrameTitle>Evolução (semanas)</FrameTitle><FrameDescription>Respostas por semana e % que conseguiu.</FrameDescription></FrameHeader>
              <FramePanel className="flex items-end gap-1.5 overflow-x-auto p-3" style={{ minHeight: 96 }}>
                {summary.weekly.length === 0 && <span className="text-xs text-muted-foreground">Sem dados ainda.</span>}
                {summary.weekly.map((w) => {
                  const max = Math.max(...summary.weekly.map((x) => x.total), 1);
                  return (
                    <Tooltip key={w.week} title={`Semana de ${new Date(w.week).toLocaleDateString('pt-BR')}: ${w.total} respostas · ${pct(w.done, w.total)}% conseguiu`}>
                      <div className="flex w-9 shrink-0 flex-col items-center gap-1">
                        <div className="w-full rounded-t-md bg-primary/25" style={{ height: Math.max(6, (w.total / max) * 60) }}><div className="w-full rounded-t-md bg-primary" style={{ height: `${pct(w.done, w.total)}%` }} /></div>
                        <span className="text-[10px] text-muted-foreground">{new Date(w.week).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                      </div>
                    </Tooltip>
                  );
                })}
              </FramePanel>
            </Frame>
          </div>
        </>
      )}

      {/* Configuração do convite */}
      {settings && (
        <Frame>
          <FrameHeader><FrameTitle>Convite contextual</FrameTitle><FrameDescription>O acesso permanente no Perfil continua mesmo com o convite desligado. Vale sem deploy.</FrameDescription></FrameHeader>
          <FramePanel className="flex flex-wrap items-center gap-3">
            <FormControlLabel control={<Switch checked={settings.enabled} onChange={(e) => saveSettings({ enabled: e.target.checked })} data-testid="feedback-enabled" />} label={<Typography sx={{ fontWeight: 700, fontSize: 14 }}>{settings.enabled ? 'Convite ligado' : 'Convite desligado'}</Typography>} />
            <TextField size="small" type="number" label="Idade mín. da conta (dias)" value={settings.minAccountAgeDays} sx={{ ...fieldSx, width: 190 }} onChange={(e) => setSettings({ ...settings, minAccountAgeDays: Math.max(0, Number(e.target.value) || 0) })} onBlur={() => saveSettings({})} />
            <TextField size="small" type="number" label="Intervalo após dispensa (dias)" value={settings.inviteIntervalDays} sx={{ ...fieldSx, width: 220 }} onChange={(e) => setSettings({ ...settings, inviteIntervalDays: Math.max(0, Number(e.target.value) || 0) })} onBlur={() => saveSettings({})} />
            <TextField size="small" type="number" label="Máx. de dispensas" value={settings.maxDismissals} sx={{ ...fieldSx, width: 150 }} onChange={(e) => setSettings({ ...settings, maxDismissals: Math.max(1, Number(e.target.value) || 1) })} onBlur={() => saveSettings({})} />
          </FramePanel>
        </Frame>
      )}

      {view === 'improvements' ? (
        <Frame>
          <FrameHeader><FrameTitle>Melhorias associadas</FrameTitle><FrameDescription>Relatos agrupados pela mesma melhoria (o original fica intacto). Entregar uma melhoria não prova que resolveu: acompanhe as opiniões seguintes.</FrameDescription></FrameHeader>
          <FramePanel className="p-0">
            {improvements.length === 0 && <Typography sx={{ p: 2.5, color: 'text.secondary', fontSize: 14 }}>Nenhuma melhoria associada ainda. No detalhe de uma opinião, preencha "Melhoria associada".</Typography>}
            {improvements.map((g) => (
              <button key={g.key} type="button" onClick={() => { setView('list'); setFilters({ ...EMPTY_FILTERS, improvementKey: g.key }); setPage(1); }}
                className="flex w-full items-center gap-3 border-b border-border/70 p-3 text-left last:border-b-0 hover:bg-muted/25" data-testid={`improvement-${g.key}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-bold text-foreground">{g.key}</span><Badge variant="primary-light" size="xs">{g.count} relato{g.count === 1 ? '' : 's'}</Badge></div>
                  <div className="text-xs text-muted-foreground">primeiro {fmt(g.firstAt)} · último {fmt(g.lastAt)}</div>
                </div>
                <div className="flex flex-wrap gap-1">{Object.entries(g.byStatus).map(([s, n]) => <Badge key={s} variant={STATUS_BADGE[s] ?? 'invert-light'} size="xs">{labels?.statuses[s] ?? s}: {n}</Badge>)}</div>
              </button>
            ))}
          </FramePanel>
        </Frame>
      ) : (
        <Frame>
          <FrameHeader>
            <FrameTitle>Respostas</FrameTitle>
            <FrameDescription>{total} no filtro atual{hasFilters ? '' : ' (sem filtro)'}.</FrameDescription>
          </FrameHeader>
          <FramePanel className="flex flex-col gap-3">
            {/* Filtros */}
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
              <TextField size="small" type="date" label="De" value={filters.from} onChange={(e) => { setFilters({ ...filters, from: e.target.value }); setPage(1); }} sx={{ ...fieldSx, width: 150 }} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField size="small" type="date" label="Até" value={filters.to} onChange={(e) => { setFilters({ ...filters, to: e.target.value }); setPage(1); }} sx={{ ...fieldSx, width: 150 }} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField size="small" select label="Perfil" value={filters.subjectType} onChange={(e) => { setFilters({ ...filters, subjectType: e.target.value }); setPage(1); }} sx={{ ...fieldSx, width: 130 }}><MenuItem value="">Todos</MenuItem><MenuItem value="user">Pacientes</MenuItem><MenuItem value="doctor">Médicos</MenuItem></TextField>
              <TextField size="small" select label="Status" value={filters.status} onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(1); }} sx={{ ...fieldSx, width: 140 }} slotProps={{ htmlInput: { 'data-testid': 'filter-status' } }}><MenuItem value="">Todos</MenuItem>{labels && Object.entries(labels.statuses).map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}</TextField>
              <TextField size="small" label="Buscar (comentário, tag, nota)" value={filters.q} onChange={(e) => { setFilters({ ...filters, q: e.target.value }); setPage(1); }} sx={{ ...fieldSx, minWidth: 220, flex: 1 }} slotProps={{ htmlInput: { 'data-testid': 'filter-q' } }} />
              {hasFilters && <Button size="small" startIcon={<FilterAltOffOutlinedIcon />} onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); }} sx={{ textTransform: 'none', fontWeight: 700 }}>Limpar</Button>}
            </Stack>
            {(filters.category || filters.outcome || filters.detail || filters.improvementKey) && (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {filters.category && <Chip size="small" label={`Tipo: ${labels?.categories[filters.category]}`} onDelete={() => setFilters({ ...filters, category: '' })} />}
                {filters.outcome && <Chip size="small" label={`Resultado: ${labels?.outcomes[filters.outcome]}`} onDelete={() => setFilters({ ...filters, outcome: '' })} />}
                {filters.detail && <Chip size="small" label={`Dificuldade: ${filters.detail}`} onDelete={() => setFilters({ ...filters, detail: '' })} />}
                {filters.improvementKey && <Chip size="small" label={`Melhoria: ${filters.improvementKey}`} onDelete={() => setFilters({ ...filters, improvementKey: '' })} />}
              </Stack>
            )}

            {loading && <LinearProgress sx={{ borderRadius: 99 }} />}
            {!loading && items.length === 0 && (
              <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
                <RateReviewOutlinedIcon sx={{ fontSize: 36, opacity: .5 }} />
                <Typography sx={{ fontSize: 14, mt: 1 }}>{hasFilters ? 'Nada com esses filtros.' : 'Nenhuma opinião ainda. O convite aparece após uso real; o acesso permanente está no Perfil.'}</Typography>
              </Box>
            )}
            <div className="flex flex-col gap-2">
              {items.map((i) => (
                <button key={i.id} type="button" onClick={() => setDetail(i)} className="rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-muted/25" data-testid={`feedback-item-${i.id}`}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={OUTCOME_BADGE[i.outcome] ?? 'invert-light'} size="xs">{i.outcomeLabel}</Badge>
                    <Badge variant={CATEGORY_BADGE[i.category] ?? 'invert-light'} size="xs">{i.categoryLabel}</Badge>
                    <Badge variant={STATUS_BADGE[i.status] ?? 'invert-light'} size="xs">{labels?.statuses[i.status] ?? i.status}</Badge>
                    <Badge variant="invert-outline" size="xs">{i.subjectType === 'doctor' ? 'Médico' : 'Paciente'}</Badge>
                    {i.subject?.isTest && <Badge variant="warning-outline" size="xs">conta de teste</Badge>}
                    <span className="ml-auto text-xs text-muted-foreground">{fmt(i.createdAt)}</span>
                  </div>
                  <div className="mt-1.5 text-sm text-foreground"><b>{i.subject?.name ?? 'Conta removida'}</b>{i.subject?.extra ? ` · ${i.subject.extra}` : ''}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{i.detail.map((d) => d.label).join(' · ')}{i.improvement ? ` → ${i.improvement.label}` : ''}</div>
                  {i.comment && <div className="mt-1.5 line-clamp-2 text-sm italic text-foreground/90">“{i.comment}”</div>}
                  {(i.tags.length > 0 || i.improvementKey) && (
                    <div className="mt-1.5 flex flex-wrap gap-1">{i.improvementKey && <Badge variant="primary-outline" size="xs">⤴ {i.improvementKey}</Badge>}{i.tags.map((t) => <Badge key={t} variant="invert-light" size="xs">#{t}</Badge>)}</div>
                  )}
                </button>
              ))}
            </div>
            {total > 30 && (
              <Stack direction="row" spacing={1} justifyContent="center">
                <Button size="small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} sx={{ textTransform: 'none' }}>Anterior</Button>
                <Typography variant="caption" sx={{ alignSelf: 'center' }}>página {page} de {Math.ceil(total / 30)}</Typography>
                <Button size="small" disabled={page >= Math.ceil(total / 30)} onClick={() => setPage((p) => p + 1)} sx={{ textTransform: 'none' }}>Próxima</Button>
              </Stack>
            )}
          </FramePanel>
        </Frame>
      )}

      {detail && labels && (
        <DetailDialog item={detail} labels={labels} improvementKeys={improvementKeys} onClose={() => setDetail(null)} onSave={(body) => patchItem(detail.id, body)} />
      )}
    </Stack>
  );
};

const DetailDialog = ({ item, labels, improvementKeys, onClose, onSave }: { item: Item; labels: Labels; improvementKeys: string[]; onClose: () => void; onSave: (body: Record<string, unknown>) => Promise<Item | null> }) => {
  const [status, setStatus] = useState(item.status);
  const [category, setCategory] = useState(item.category);
  const [tags, setTags] = useState<string[]>(item.tags);
  const [improvementKey, setImprovementKey] = useState(item.improvementKey ?? '');
  const [notes, setNotes] = useState(item.adminNotes ?? '');
  const [saving, setSaving] = useState(false);
  const save = async () => { setSaving(true); try { const r = await onSave({ status, category, tags, improvementKey, adminNotes: notes }); if (r) onClose(); } finally { setSaving(false); } };
  const ctx = item.context ?? {};
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: '16px' } }} data-testid="feedback-detail">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 800, fontFamily: 'Poppins, sans-serif' }}>
        Opinião · {item.subject?.name ?? 'Conta removida'}
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" onClick={onClose} aria-label="Fechar"><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={OUTCOME_BADGE[item.outcome] ?? 'invert-light'} size="sm">{item.outcomeLabel}</Badge>
            <Badge variant="invert-outline" size="sm">{item.subjectType === 'doctor' ? 'Médico' : 'Paciente'}</Badge>
            <span className="text-xs text-muted-foreground">{fmt(item.createdAt)} · pesquisa {item.surveyKey} v{item.surveyVersion}</span>
          </div>
          <Typography variant="body2"><b>Conta:</b> {item.subject?.email ?? '—'}{item.subject?.extra ? ` · ${item.subject.extra}` : ''} <span style={{ opacity: .6 }}>(a pessoa foi informada de que a opinião fica vinculada à conta)</span></Typography>
          <Typography variant="body2"><b>Respostas:</b> {item.detail.map((d) => d.label).join(' · ') || '—'}{item.improvement ? ` → ${item.improvement.label}` : ''}</Typography>
          {item.comment ? <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: 'rgba(32,178,170,.07)', fontStyle: 'italic', fontSize: 14.5, whiteSpace: 'pre-wrap' }} data-testid="detail-comment">“{item.comment}”</Box> : <Typography variant="caption" color="text.secondary">Sem comentário.</Typography>}
          <Typography variant="caption" color="text.secondary">
            <b>Contexto técnico:</b> {[ctx.trigger && `gatilho ${ctx.trigger}`, ctx.screen && `tela ${ctx.screen}`, ctx.platform && `plataforma ${ctx.platform}`, ctx.appVersion && `versão ${ctx.appVersion}`, ctx.hasExams != null && (ctx.hasExams ? 'já enviou exame' : 'sem exames')].filter(Boolean).join(' · ') || 'não informado'}
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select size="small" label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ ...fieldSx, flex: 1 }} slotProps={{ htmlInput: { 'data-testid': 'detail-status' } }}>{Object.entries(labels.statuses).map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}</TextField>
            <TextField select size="small" label="Tipo de problema" value={category} onChange={(e) => setCategory(e.target.value)} sx={{ ...fieldSx, flex: 1 }}>{Object.entries(labels.categories).map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}</TextField>
          </Stack>
          <Autocomplete multiple freeSolo size="small" options={[]} value={tags} onChange={(_, v) => setTags(v.map((t) => String(t).toLowerCase()))}
            renderInput={(p) => <TextField {...p} label="Tags (Enter para adicionar)" sx={fieldSx} />} />
          <Autocomplete freeSolo size="small" options={improvementKeys} value={improvementKey} onInputChange={(_, v) => setImprovementKey(v)}
            renderInput={(p) => <TextField {...p} label="Melhoria associada (agrupa relatos iguais)" helperText="Ex.: explicar-creditos-no-402. Vira uma chave; relatos com a mesma chave aparecem juntos." sx={fieldSx} slotProps={{ htmlInput: { ...p.inputProps, 'data-testid': 'detail-improvement' } }} />} />
          <div>
            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: .5 }}>Notas internas</Typography>
            <ReuiTextarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} placeholder="Decisão, hipótese, link do card…" data-testid="detail-notes" />
          </div>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>Cancelar</Button>
        <Button variant="contained" onClick={save} disabled={saving} data-testid="detail-save" sx={{ textTransform: 'none', fontWeight: 800, borderRadius: '10px', bgcolor: '#20b2aa' }}>{saving ? 'Salvando…' : 'Salvar triagem'}</Button>
      </DialogActions>
    </Dialog>
  );
};
