import React, { useEffect, useState } from 'react';
import { Stack, Typography, TextField, InputAdornment, Button, CircularProgress } from '@mui/material';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import SearchIcon from '@mui/icons-material/Search';
import { API_URL, token } from '../../config';
import { TabLoader, SectionError } from './parts';
import { Badge } from '@/components/reui/badge';
import { Frame, FramePanel, FrameHeader, FrameTitle, FrameDescription } from '@/components/reui/frame';
import { useReuiThemeSync } from '@/components/reui/use-reui-theme';

/**
 * ADMIN · SESSÕES & LOGINS (Fase 1 — leitura do audit_log, 09/11/26).
 * Login de usuário e médico já é auditado com hora/IP/aparelho: aqui só agregamos
 * — por dia (sucesso × falha), hora do dia, dia da semana, motivos de falha e a
 * timeline por usuário. Tempo de sessão ("quanto tempo ficou no app") é Fase 2
 * (heartbeat throttled + migration aditiva) — dito na tela, não prometido às escondidas.
 */
const H = () => ({ Authorization: `Bearer ${token()}` });
const TEAL = '#20b2aa';
const COPPER = '#d4a574';

interface Overview {
  days: number;
  totals: { success: number; failed: number; users: number; doctors: number };
  perDay: { day: string; success: number; failed: number }[];
  byHour: { hour: number; count: number }[];
  byWeekday: { weekday: number; count: number }[];
  failReasons: { reason: string; count: number }[];
}
interface UserHit { id: string; name: string; email: string; role: string; lastActiveDay: string | null; createdAt: string }
interface TimelineEvent { at: string; action: string; via: string | null; reason: string | null; ip: string | null; ua: string | null }

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const uaShort = (ua: string | null) => {
  if (!ua) return '—';
  const m = ua.match(/(Android|iPhone|iPad|Windows|Macintosh|Linux)[^;)]*/i);
  const b = ua.match(/(Chrome|Safari|Firefox|Edg|SamsungBrowser)\/[\d.]+/g);
  return [m?.[0], b?.[b.length - 1]?.split('/')[0]].filter(Boolean).join(' · ') || ua.slice(0, 40);
};
const eventBadge = (a: string): 'success-light' | 'destructive-light' | 'warning-light' =>
  a === 'LOGIN_SUCCESS' ? 'success-light' : a === 'LOGIN_BLOCKED' ? 'destructive-light' : 'warning-light';
const eventLabel = (e: TimelineEvent) =>
  e.action === 'LOGIN_SUCCESS' ? 'sucesso' : e.action === 'LOGIN_BLOCKED' ? 'bloqueado' : `falha${e.reason ? ` · ${e.reason}` : ''}`;

// Charts: Recharts — o MESMO motor dos chart blocks da ReUI (todos os blocks "chart-*"
// são Recharts + Frame; usamos o motor direto com as cores da casa, dentro dos Frames).
const AXIS = { fontSize: 10.5, fill: 'currentColor' } as const;
const tooltipStyle = { fontSize: 12, borderRadius: 10, border: '1px solid rgba(32,178,170,0.3)' };

export const SessionsTab = () => {
  useReuiThemeSync();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<UserHit[]>([]);
  const [sel, setSel] = useState<{ user: UserHit; events: TimelineEvent[] } | null>(null);
  const [selLoading, setSelLoading] = useState(false);

  const load = () => {
    setLoading(true); setError(null);
    fetch(`${API_URL}/admin/logins/overview?days=${days}`, { headers: H() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!d) throw new Error('x'); setData(d); })
      .catch(() => setError('Não foi possível carregar os dados de sessões.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  // Busca de usuário com debounce
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setHits([]); return; }
    const t = window.setTimeout(() => {
      fetch(`${API_URL}/admin/logins/user-search?q=${encodeURIComponent(q)}`, { headers: H() })
        .then((r) => (r.ok ? r.json() : { users: [] }))
        .then((d) => setHits(d.users ?? []))
        .catch(() => setHits([]));
    }, 400);
    return () => window.clearTimeout(t);
  }, [query]);

  const openUser = async (id: string) => {
    setSelLoading(true); setSel(null);
    try {
      const r = await fetch(`${API_URL}/admin/logins/user/${id}`, { headers: H() });
      if (r.ok) {
        const d = await r.json();
        setSel({ user: d.user, events: d.events ?? [] });
      }
    } catch { /* mantém null */ }
    setSelLoading(false);
  };

  if (loading && !data) return <TabLoader />;
  if (error) return <SectionError message={error} onRetry={load} />;
  if (!data) return null;

  const kpis = [
    { label: 'Logins com sucesso', value: data.totals.success.toLocaleString('pt-BR'), hint: `últimos ${data.days} dias` },
    { label: 'Usuários únicos', value: data.totals.users.toLocaleString('pt-BR'), hint: 'pessoas distintas logadas' },
    { label: 'Tentativas com falha', value: data.totals.failed.toLocaleString('pt-BR'), hint: 'senha errada, bloqueio…' },
    { label: 'Médicos logados', value: data.totals.doctors.toLocaleString('pt-BR'), hint: 'acessos no portal do médico' },
  ];

  return (
    <Stack spacing={2.5} data-testid="admin-sessions">
      {/* Título + período */}
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div>
          <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 20, color: 'text.primary' }}>Sessões & Logins</Typography>
          <Typography variant="body2" color="text.secondary">Quando as pessoas entram — dia, hora e aparelho de cada acesso.</Typography>
        </div>
        <Stack direction="row" spacing={1}>
          {[7, 30, 90].map((d) => (
            <Button key={d} size="small" variant={days === d ? 'contained' : 'outlined'} onClick={() => setDays(d)} sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '10px' }}>
              {d} dias
            </Button>
          ))}
          <Button size="small" onClick={load} sx={{ textTransform: 'none', fontWeight: 700 }}>Atualizar</Button>
        </Stack>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {kpis.map((k) => (
          <Frame key={k.label} spacing="sm">
            <FramePanel className="flex flex-col gap-0.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{k.label}</span>
              <span className="text-2xl font-extrabold text-foreground" style={{ fontFamily: 'Poppins, sans-serif' }} data-testid={`kpi-${k.label}`}>{k.value}</span>
              <span className="text-xs text-muted-foreground">{k.hint}</span>
            </FramePanel>
          </Frame>
        ))}
      </div>

      {/* Logins por dia */}
      <Frame>
        <FrameHeader>
          <FrameTitle>Logins por dia</FrameTitle>
          <FrameDescription>teal = sucesso · cobre = falha (passe o mouse)</FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="h-[190px] w-full text-muted-foreground">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.perDay} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.12} />
                <XAxis dataKey="day" tickFormatter={(d: string) => dayLabel(d)} tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={18} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(d) => dayLabel(String(d))} formatter={(v, n) => [String(v ?? 0), n === 'success' ? 'sucesso' : 'falha']} cursor={{ fill: 'rgba(32,178,170,0.06)' }} />
                <Bar dataKey="success" stackId="a" fill={TEAL} radius={[3, 3, 0, 0]} maxBarSize={22} />
                <Bar dataKey="failed" stackId="a" fill={COPPER} radius={[3, 3, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </FramePanel>
      </Frame>

      <div className="grid gap-2.5 lg:grid-cols-2">
        {/* Por hora do dia */}
        <Frame>
          <FrameHeader>
            <FrameTitle>Por hora do dia</FrameTitle>
            <FrameDescription>Hora do servidor (UTC) do login</FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-[150px] w-full text-muted-foreground">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.byHour} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                  <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.12} />
                  <XAxis dataKey="hour" tick={AXIS} tickLine={false} axisLine={false} interval={2} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={(h) => `${h}h`} cursor={{ fill: 'rgba(32,178,170,0.06)' }} />
                  <Bar dataKey="count" name="logins" fill="rgba(32,178,170,0.8)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </FramePanel>
        </Frame>

        {/* Por dia da semana + motivos */}
        <Frame>
          <FrameHeader>
            <FrameTitle>Por dia da semana</FrameTitle>
            <FrameDescription>0 = domingo</FrameDescription>
          </FrameHeader>
          <FramePanel className="flex flex-col gap-2">
            <div className="h-[150px] w-full text-muted-foreground">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.byWeekday} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                  <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.12} />
                  <XAxis dataKey="weekday" tickFormatter={(w: number) => WEEKDAYS[w] ?? String(w)} tick={AXIS} tickLine={false} axisLine={false} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={(w) => WEEKDAYS[Number(w)] ?? String(w)} cursor={{ fill: 'rgba(32,178,170,0.06)' }} />
                  <Bar dataKey="count" name="logins" fill="rgba(32,178,170,0.8)" radius={[3, 3, 0, 0]} maxBarSize={34} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {data.failReasons.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {data.failReasons.map((f) => (
                  <Badge key={f.reason} variant="warning-light" size="xs">{f.reason}: {f.count}</Badge>
                ))}
              </div>
            )}
          </FramePanel>
        </Frame>
      </div>

      {/* Histórico por usuário */}
      <Frame>
        <FrameHeader>
          <FrameTitle>Histórico de um usuário</FrameTitle>
          <FrameDescription>Busque por nome ou e-mail e veja cada acesso (150 mais recentes)</FrameDescription>
        </FrameHeader>
        <FramePanel className="flex flex-col gap-2">
          <TextField
            fullWidth size="small" placeholder="Buscar por nome ou e-mail…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            sx={{ maxWidth: 420, '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
            InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>) }}
          />

          {hits.length > 0 && (
            <div className="flex flex-col gap-1">
              {hits.map((h) => (
                <button key={h.id} type="button" onClick={() => void openUser(h.id)}
                  className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-left hover:border-primary/40 hover:bg-primary/5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-foreground">{h.name}</span>
                    <span className="block text-xs text-muted-foreground">{h.email} · ativo {h.lastActiveDay ?? '—'}</span>
                  </span>
                  <Badge variant={h.role === 'DOCTOR' ? 'focus-light' : 'info-light'} size="xs">{h.role === 'DOCTOR' ? 'médico' : 'paciente'}</Badge>
                </button>
              ))}
            </div>
          )}

          {selLoading && <CircularProgress size={20} sx={{ color: TEAL }} />}

          {sel && (
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-extrabold text-foreground" style={{ fontFamily: 'Poppins, sans-serif' }}>{sel.user.name}</span>
                <span className="text-sm text-muted-foreground">{sel.user.email}</span>
                <Badge variant="invert-light" size="xs">desde {new Date(sel.user.createdAt).toLocaleDateString('pt-BR')}</Badge>
              </div>
              {sel.events.length === 0 ? (
                <span className="py-2 text-xs text-muted-foreground">Nenhum login registrado (contas antigas podem não ter histórico).</span>
              ) : (
                <div className="max-h-[360px] overflow-auto rounded-lg border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                      <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-2.5 py-2 font-semibold">Quando</th>
                        <th className="px-2.5 py-2 font-semibold">Evento</th>
                        <th className="px-2.5 py-2 font-semibold">Via</th>
                        <th className="px-2.5 py-2 font-semibold">Aparelho</th>
                        <th className="px-2.5 py-2 font-semibold">IP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sel.events.map((e, i) => (
                        <tr key={i} className="border-t border-border/60 hover:bg-muted/30">
                          <td className="whitespace-nowrap px-2.5 py-1.5 text-foreground">{fmt(e.at)}</td>
                          <td className="px-2.5 py-1.5"><Badge variant={eventBadge(e.action)} size="xs">{eventLabel(e)}</Badge></td>
                          <td className="px-2.5 py-1.5 text-muted-foreground">{e.via ?? (e.action === 'LOGIN_SUCCESS' ? 'senha' : '—')}</td>
                          <td className="max-w-[180px] truncate px-2.5 py-1.5 text-muted-foreground" title={e.ua ?? ''}>{uaShort(e.ua)}</td>
                          <td className="whitespace-nowrap px-2.5 py-1.5 text-muted-foreground">{e.ip ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </FramePanel>
      </Frame>

      <Typography variant="caption" color="text.secondary">
        Fase 1 (leitura do audit_log): logins com dia/hora, aparelho e IP. Tempo de sessão no app chega na Fase 2 (heartbeat leve + migration).
      </Typography>
    </Stack>
  );
};
