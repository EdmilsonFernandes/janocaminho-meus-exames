// DoctorRequestPanel — compositor de pedido de exame do médico (F3 §2a).
// Self-contained: carrega os exames do paciente (via `fetchExams` — o portal
// injeta os já carregados; in-call o fe1 pode injetar o fetch da API), posta o
// pedido e emite onSent. PAINEL DE CONTEÚDO: o wrapper decide a superfície
// (GlassSheet in-call / Drawer na ficha do portal).
//
// Plug p/ Teleconsulta.tsx (fe1/orquestrador — PENDÊNCIA REGISTRADA):
//   <DoctorRequestPanel
//     patientId={patientId}            // obrigatório
//     reminderId={reminderId}          // in-call → POST /api/teleconsulta/:id/exam-request
//     onSent={(req) => { /* toast espelhado / atualiza lista */ }}
//     onClose={() => setSheetOpen(false)}
//   />
// Sem reminderId → gêmea fora de chamada: POST /api/exam-requests {patientId}.
// Confirmação é 1-toque: "Enviar pedido" É a confirmação (sem dialog extra, §2a).
import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Chip, CircularProgress, Stack, TextField, Typography, useTheme } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AssignmentAddIcon from '@mui/icons-material/AssignmentAdd';
import { API_URL } from '../../config';
import { snackbar } from '../ConfirmDialog';
import { hapticLight, hapticSuccess } from '../../utils/haptic';
import type { DoctorExamOption, ExamRequest } from './types';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fmtDay = (d?: string | null) => {
  if (!d) return null;
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

export interface DoctorRequestPanelProps {
  patientId: string;
  /** Teleconsulta de origem (in-call). Ausente = fora de chamada (rota gêmea). */
  reminderId?: string;
  /** Exames do paciente; default = GET /api/doctor/patients/:patientId/exams (doctorToken). */
  fetchExams?: () => Promise<DoctorExamOption[]>;
  /** Token do médico; default = localStorage 'doctorToken' (régua do portal). */
  authToken?: () => string | null;
  onSent?: (req: ExamRequest) => void;
  onClose?: () => void;
}

export const DoctorRequestPanel = ({ patientId, reminderId, fetchExams, authToken, onSent, onClose }: DoctorRequestPanelProps) => {
  const theme = useTheme();
  const teal = theme.palette.mode === 'dark' ? '#5fc9c3' : '#0f766e';
  const [query, setQuery] = useState('');
  const [exams, setExams] = useState<DoctorExamOption[] | null>(null);
  const [examsErr, setExamsErr] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const getDoctorToken = authToken ?? (() => { try { return localStorage.getItem('doctorToken'); } catch { return null; } });

  useEffect(() => {
    let alive = true;
    // TS6: arrow como RHS de ?? exige parênteses.
    const loader = fetchExams ?? (async () => {
      const r = await fetch(`${API_URL}/doctor/patients/${patientId}/exams`, { headers: { Authorization: `Bearer ${getDoctorToken() ?? ''}` } });
      if (!r.ok) throw new Error('exams');
      const d = await r.json();
      return (d.items ?? []) as DoctorExamOption[];
    });
    loader()
      .then((items) => { if (alive) setExams(Array.isArray(items) ? items : []); })
      .catch(() => { if (alive) { setExams([]); setExamsErr(true); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    const list = exams ?? [];
    if (!q) return list.slice(0, 12);
    return list.filter((e) => norm(e.title ?? '').includes(q)).slice(0, 12);
  }, [exams, query]);

  // Mutuamente exclusivos: o ÚLTIMO editado vence (§2a) — digitar limpa a seleção,
  // selecionar limpa o texto.
  const selectExam = (id: string) => {
    hapticLight();
    setSelectedId((cur) => (cur === id ? null : id));
    setNewTitle('');
  };
  const typeNewTitle = (v: string) => {
    setNewTitle(v);
    if (v.trim()) setSelectedId(null); // mutuamente exclusivos: o último editado vence
  };

  const selected = exams?.find((e) => e.id === selectedId) ?? null;
  const title = selected ? selected.title : newTitle.trim();
  const valid = !!title && title.length <= 120;

  const send = async () => {
    if (!valid || sending) return;
    setSending(true);
    hapticLight();
    try {
      const url = reminderId
        ? `${API_URL}/teleconsulta/${reminderId}/exam-request`
        : `${API_URL}/exam-requests`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getDoctorToken() ?? ''}` },
        body: JSON.stringify({
          ...(reminderId ? {} : { patientId }),
          title,
          note: note.trim() || undefined,
          existingExamId: selected?.id ?? undefined,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || 'Falha ao enviar o pedido.');
      hapticSuccess();
      snackbar({ message: 'Pedido enviado ✨ O paciente responde no app dele.', severity: 'success' });
      setQuery(''); setSelectedId(null); setNewTitle(''); setNote('');
      onSent?.(d.examRequest ?? d);
      onClose?.();
    } catch (e: any) {
      snackbar({ message: e?.message || 'Falha ao enviar o pedido.', severity: 'error' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Stack spacing={2} sx={{ p: { xs: 2, sm: 2.5 }, pt: { xs: 1.5, sm: 2 } }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <AssignmentAddIcon sx={{ fontSize: 22, color: teal }} />
        <Typography sx={{ fontWeight: 800, fontSize: 17, fontFamily: '"Poppins",sans-serif', color: 'text.primary', flex: 1 }}>
          Pedir exame
        </Typography>
      </Stack>
      <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.55, mt: -1 }}>
        Peça um exame novo ou a autorização para ver um que o paciente já tem no app — ele recebe na hora e responde com um toque.
      </Typography>

      {/* Busca nos exames já extraídos */}
      <TextField
        size="small"
        fullWidth
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="buscar nos exames do paciente…"
        slotProps={{ input: { startAdornment: (<SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />) } }}
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '999px', fontSize: 14 } }}
      />

      {/* Chips dos exames existentes (escopo já filtrado pelo fetcher) */}
      <Box>
        {exams === null ? (
          <Stack direction="row" alignItems="center" spacing={1} sx={{ py: 1 }}>
            <CircularProgress size={16} sx={{ color: teal }} />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>carregando exames…</Typography>
          </Stack>
        ) : filtered.length === 0 ? (
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', py: 0.5 }}>
            {examsErr ? 'Não foi possível carregar os exames agora — escreva o nome do exame abaixo.' : 'Nenhum exame encontrado — escreva o nome.'}
          </Typography>
        ) : (
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
            {filtered.map((e) => {
              const on = e.id === selectedId;
              const day = fmtDay(e.performedAt);
              return (
                <Chip
                  key={e.id}
                  size="small"
                  label={day ? `${e.title} · ${day}` : e.title}
                  onClick={() => selectExam(e.id)}
                  aria-pressed={on}
                  sx={{
                    height: 32, fontSize: 12.5, fontWeight: 700, maxWidth: '100%', borderRadius: '999px',
                    bgcolor: on ? 'rgba(32,178,170,.18)' : 'action.hover',
                    color: on ? teal : 'text.secondary',
                    border: '1px solid',
                    borderColor: on ? 'rgba(32,178,170,.5)' : 'transparent',
                    '& .MuiChip-label': { whiteSpace: 'normal', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis' },
                  }}
                />
              );
            })}
          </Stack>
        )}
      </Box>

      {/* Exame novo (mutuamente exclusivo com a seleção) */}
      <TextField
        size="small"
        fullWidth
        value={newTitle}
        onChange={(e) => typeNewTitle(e.target.value)}
        label="exame novo, ex.: Ultrassom"
        placeholder="Ultrassom"
        slotProps={{ htmlInput: { maxLength: 120, 'aria-label': 'Nome do exame novo' } }}
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px', fontSize: 14 } }}
      />

      {/* Orientação opcional */}
      <TextField
        size="small"
        fullWidth
        value={note}
        onChange={(e) => setNote(e.target.value)}
        label="orientação (opcional)"
        placeholder="Jejum de 8h, levar pedido anterior…"
        slotProps={{ htmlInput: { maxLength: 500, 'aria-label': 'Orientação para o paciente' } }}
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px', fontSize: 14 } }}
      />

      <Button
        variant="contained"
        fullWidth
        disabled={!valid || sending}
        onClick={() => void send()}
        startIcon={sending ? <CircularProgress size={17} sx={{ color: 'rgba(255,255,255,.85)' }} /> : undefined}
        sx={{
          minHeight: 48, borderRadius: '999px', textTransform: 'none', fontWeight: 800, fontSize: 15,
          background: 'linear-gradient(135deg,#20b2aa,#178f89)', color: '#fff',
          boxShadow: '0 4px 12px rgba(32,178,170,.30)',
          '&:hover': { background: 'linear-gradient(135deg,#1aa39b,#12706b)' },
          '&:disabled': { color: 'rgba(255,255,255,.7)' },
        }}
      >
        {sending ? 'Enviando…' : 'Enviar pedido'}
      </Button>
    </Stack>
  );
};
