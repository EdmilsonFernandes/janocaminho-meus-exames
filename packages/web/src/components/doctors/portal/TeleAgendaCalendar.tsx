import { useMemo, useState } from 'react';
import { Box, Stack, Typography, IconButton, Avatar, Chip, Button } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import VideocamIcon from '@mui/icons-material/Videocam';
import SummarizeIcon from '@mui/icons-material/Summarize';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import { AppCard } from '../../AppCard';
import { photoUrlFor } from '../../../config';
import { tealText } from '../../../theme';

/**
 * TeleAgendaCalendar — visão CALENDÁRIO da agenda do médico (ReUI event-calendar,
 * pedido do dono 30/10: "as consultas que ele marcar aparecem com a FOTO do
 * paciente no dia"). Grade mensal com avatares dos pacientes nos dias; tocar no
 * dia abre o painel com cada consulta (foto, nome, hora, status) e a ação certa:
 * Entrar na sala (ativa) ou Ver resumo (encerrada). Concluída fica esmaecida.
 */
const TELE_CONCLUDED = new Set(['completed', 'no_show', 'cancelled', 'technical']);
const isConcluded = (tc: any) => !!tc.endedAt || TELE_CONCLUDED.has(tc.teleStatus);
const WEEK = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const keyOf = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

interface Resolved { tc: any; name: string; photo?: string; due: Date; done: boolean }

export const TeleAgendaCalendar = ({ consultas, patients, onEnterTele, onOpenPost }: {
  consultas: any[];
  patients: any[];
  onEnterTele: (tc: any, patientName?: string) => void;
  onOpenPost: (teleId: string) => void;
}) => {
  const today = new Date();
  const [ym, setYm] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [selDay, setSelDay] = useState<Date | null>(today);

  const resolved: Resolved[] = useMemo(() => (consultas ?? []).filter((tc: any) => tc?.dueDate).map((tc: any) => {
    const matched = patients.find((p: any) => (p?.patient?.id || p?.id) === tc.patientId);
    const pat = tc.patient || matched?.patient || matched;
    const patId = pat?.id || matched?.patient?.id || matched?.id || tc.patientId;
    const name = pat?.fullName || pat?.name || 'Paciente';
    // Mesma regra dos cards (§19 G2): foto SEMPRE via photoUrlFor(Patient.id) —
    // a ref crua é chave S3, nunca vai direto num <img>.
    const hasPhoto = !!(pat?.photoUrl || tc.patient?.photoUrl);
    const photo = patId && hasPhoto ? photoUrlFor(String(patId), pat?.photoUrl || tc.patient?.photoUrl) : undefined;
    return { tc, name, photo, due: new Date(tc.dueDate), done: isConcluded(tc) };
  }).filter((r: Resolved) => !Number.isNaN(r.due.getTime())), [consultas, patients]);

  const byDay = useMemo(() => {
    const m = new Map<string, Resolved[]>();
    for (const r of resolved) {
      const k = keyOf(r.due);
      const arr = m.get(k) ?? [];
      arr.push(r);
      m.set(k, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.due.getTime() - b.due.getTime());
    return m;
  }, [resolved]);

  const first = new Date(ym.y, ym.m, 1);
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: first.getDay() }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(ym.y, ym.m, i + 1)),
  ];
  const monthLabelRaw = first.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const monthLabel = monthLabelRaw.charAt(0).toUpperCase() + monthLabelRaw.slice(1);
  const monthCount = resolved.filter((r) => r.due.getFullYear() === ym.y && r.due.getMonth() === ym.m).length;
  const nav = (delta: number) => {
    const d = new Date(ym.y, ym.m + delta, 1);
    setYm({ y: d.getFullYear(), m: d.getMonth() });
  };
  const goToday = () => { setYm({ y: today.getFullYear(), m: today.getMonth() }); setSelDay(today); };
  const sel = selDay ? (byDay.get(keyOf(selDay)) ?? []) : [];
  const selLabel = selDay ? selDay.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }) : '';

  return (
    <Stack spacing={1.5}>
      <AppCard sx={{ p: { xs: 1.5, sm: 2 } }}>
        {/* Cabeçalho do mês */}
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.25 }}>
          <IconButton size="small" aria-label="Mês anterior" onClick={() => nav(-1)} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '10px' }}>
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
          <Typography sx={{ flex: 1, textAlign: 'center', fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 15.5 }}>
            {monthLabel}
            <Chip size="small" label={`${monthCount} no mês`} sx={{ ml: 1, height: 20, fontSize: 11, fontWeight: 800, bgcolor: 'rgba(15,118,110,0.10)', color: (t) => tealText(t.palette.mode) }} />
          </Typography>
          <Button size="small" onClick={goToday} sx={{ textTransform: 'none', fontWeight: 700, fontSize: 12, borderRadius: '999px', minWidth: 0, px: 1.25, color: (t) => tealText(t.palette.mode) }}>Hoje</Button>
          <IconButton size="small" aria-label="Próximo mês" onClick={() => nav(1)} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '10px' }}>
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </Stack>

        {/* Semana */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5, mb: 0.5 }}>
          {WEEK.map((w, i) => (
            <Typography key={`${w}-${i}`} sx={{ textAlign: 'center', fontSize: 11, fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase' }}>{w}</Typography>
          ))}
        </Box>

        {/* Grade de dias — avatar do paciente DENTRO do dia */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5 }}>
          {cells.map((d, i) => {
            if (!d) return <Box key={`pad-${i}`} />;
            const k = keyOf(d);
            const items = byDay.get(k) ?? [];
            const isToday = keyOf(today) === k;
            const isSel = !!selDay && keyOf(selDay) === k;
            const pending = items.filter((x) => !x.done);
            return (
              <Box
                key={k}
                component="button"
                type="button"
                aria-label={`${d.getDate()} — ${items.length ? `${items.length} consulta(s)` : 'sem consultas'}`}
                onClick={() => setSelDay(d)}
                sx={{
                  position: 'relative', minHeight: { xs: 52, sm: 62 }, p: 0.5, pt: 0.75,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5,
                  borderRadius: '12px', cursor: 'pointer', fontFamily: 'inherit',
                  border: '1px solid',
                  borderColor: isSel ? '#178f89' : isToday ? 'rgba(32,178,170,0.5)' : 'transparent',
                  bgcolor: isSel
                    ? 'rgba(32,178,170,0.12)'
                    : items.length ? (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(15,118,110,0.04)' : 'transparent',
                  transition: 'all .15s ease',
                  '&:hover': { borderColor: '#20b2aa', bgcolor: 'rgba(32,178,170,0.08)' },
                }}
              >
                <Typography component="span" sx={{ fontSize: 12.5, fontWeight: isToday || isSel ? 800 : 600, lineHeight: 1, color: isToday ? (t) => tealText(t.palette.mode) : 'text.primary' }}>
                  {d.getDate()}
                </Typography>
                {items.length > 0 && (
                  <Stack direction="row" spacing={-0.6} alignItems="center">
                    {items.slice(0, 2).map((r, j) => (
                      <Avatar
                        key={j}
                        src={r.photo}
                        alt={r.name}
                        sx={{
                          width: 20, height: 20, fontSize: 9.5, fontWeight: 800,
                          bgcolor: 'rgba(15,118,110,0.18)', color: '#178f89',
                          border: '1.5px solid', borderColor: 'background.paper',
                          ...(r.done ? { filter: 'grayscale(1)', opacity: 0.55 } : {}),
                        }}
                      >
                        {r.name.charAt(0).toUpperCase()}
                      </Avatar>
                    ))}
                    {items.length > 2 && (
                      <Box component="span" sx={{ ml: 1, fontSize: 9.5, fontWeight: 800, color: 'text.secondary' }}>+{items.length - 2}</Box>
                    )}
                  </Stack>
                )}
                {pending.length > 0 && (
                  <Box aria-hidden sx={{ position: 'absolute', top: 5, right: 5, width: 6, height: 6, borderRadius: '50%', bgcolor: '#20b2aa' }} />
                )}
              </Box>
            );
          })}
        </Box>
      </AppCard>

      {/* Painel do dia selecionado */}
      {selDay && (
        <AppCard sx={{ p: { xs: 1.5, sm: 2 } }}>
          <Typography sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', fontSize: 14, mb: 1, textTransform: 'capitalize' }}>{selLabel}</Typography>
          {sel.length === 0 ? (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'text.secondary', py: 1 }}>
              <EventBusyOutlinedIcon sx={{ fontSize: 18 }} />
              <Typography sx={{ fontSize: 13.5 }}>Sem consultas neste dia.</Typography>
            </Stack>
          ) : (
            <Stack spacing={1}>
              {sel.map((r, i) => {
                const hhmm = r.due.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                return (
                  <Stack key={`${r.tc.id}-${i}`} direction="row" alignItems="center" spacing={1.25} sx={{ p: 1, borderRadius: '14px', border: '1px solid', borderColor: 'divider', ...(r.done ? { opacity: 0.72 } : {}) }}>
                    <Avatar src={r.photo} alt={r.name} sx={{ width: 38, height: 38, fontSize: 14, fontWeight: 800, bgcolor: 'rgba(15,118,110,0.12)', color: '#178f89', ...(r.done ? { filter: 'grayscale(1)' } : {}) }}>
                      {r.name.charAt(0).toUpperCase()}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography noWrap sx={{ fontWeight: 800, fontSize: 14 }}>{r.name}</Typography>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Chip size="small" label={hhmm} sx={{ height: 19, fontSize: 11, fontWeight: 800, bgcolor: 'rgba(15,118,110,0.10)', color: (t) => tealText(t.palette.mode) }} />
                        {r.done && <Chip size="small" label={r.tc.teleStatus === 'completed' ? 'Realizada' : r.tc.teleStatus === 'cancelled' ? 'Cancelada' : 'Não realizada'} sx={{ height: 19, fontSize: 11, fontWeight: 700, bgcolor: 'action.hover', color: 'text.secondary' }} />}
                      </Stack>
                    </Box>
                    {r.done ? (
                      <Button size="small" variant="outlined" startIcon={<SummarizeIcon sx={{ fontSize: 15 }} />} onClick={() => onOpenPost(r.tc.id)} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                        Resumo
                      </Button>
                    ) : (
                      <Button size="small" variant="contained" startIcon={<VideocamIcon sx={{ fontSize: 15 }} />} onClick={() => onEnterTele(r.tc, r.name)} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, fontSize: 12, flexShrink: 0, background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 100%)', '&:hover': { background: 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)' } }}>
                        Entrar
                      </Button>
                    )}
                  </Stack>
                );
              })}
            </Stack>
          )}
        </AppCard>
      )}
    </Stack>
  );
};
