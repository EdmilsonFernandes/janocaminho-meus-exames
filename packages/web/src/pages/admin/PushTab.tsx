import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Stack, Typography, TextField, Button, Chip, Alert, CircularProgress, Divider } from '@mui/material';
import { useNotify } from 'react-admin';
import SendIcon from '@mui/icons-material/Send';
import GroupsIcon from '@mui/icons-material/Groups';
import ScheduleIcon from '@mui/icons-material/Schedule';
import { API_URL, token } from '../../config';
import { confirmDialog } from '../../components/ConfirmDialog';

/**
 * Push — campanhas segmentadas (plano/engajamento/exames/atividade HC) + broadcast global.
 *
 * - Público: 1 pick por grupo (interseção entre grupos). Sem público = global (todos).
 * - Preview de audiência (debounce): "👥 X usuários · 📱 Y dispositivos" ANTES de enviar.
 * - Agendar (opcional): cria PushCampaign com scheduledAt → scheduler server dispara.
 * - Merge fields: {{nome}}, {{streak}}, {{passosOntem}} — resolvidos por usuário no envio.
 * - Cap anti-spam server-side: quem recebeu push manual há <7d fica de fora do segmentado.
 */

type Audience = {
  plan?: 'free' | 'premium' | 'premiumExpiring7d';
  engagement?: 'active7d' | 'inactive14d' | 'noFirstExam';
  exams?: 'stale90d' | 'abnormal30d';
  activity?: 'hcConnected' | 'lowActivity3d' | 'goalHitYesterday';
};

const AUDIENCE_GROUPS: { key: keyof Audience; label: string; options: { value: string; label: string }[] }[] = [
  {
    key: 'plan', label: 'Plano',
    options: [
      { value: 'free', label: 'Free' },
      { value: 'premium', label: 'Premium' },
      { value: 'premiumExpiring7d', label: 'Premium expira em 7d' },
    ],
  },
  {
    key: 'engagement', label: 'Engajamento',
    options: [
      { value: 'active7d', label: 'Ativos (7d)' },
      { value: 'inactive14d', label: 'Sumidos (14d+)' },
      { value: 'noFirstExam', label: 'Nunca enviaram exame' },
    ],
  },
  {
    key: 'exams', label: 'Exames',
    options: [
      { value: 'stale90d', label: 'Sem exame há 90d+' },
      { value: 'abnormal30d', label: 'Marcador alterado (30d)' },
    ],
  },
  {
    key: 'activity', label: 'Atividade (Health Connect)',
    options: [
      { value: 'hcConnected', label: 'Conectaram o HC' },
      { value: 'lowActivity3d', label: 'Atividade caiu (3d)' },
      { value: 'goalHitYesterday', label: 'Meta 8k ontem 🎉' },
    ],
  },
];

/** Templates prontos — voz do Dr. Exame. `aud` pré-seleciona o público do template. */
const TEMPLATES: { emoji: string; title: string; body: string; route?: string; aud?: Audience }[] = [
  { emoji: '🏆', title: '{{nome}}, meta batida ontem! 🎉', body: 'Foram {{passosOntem}} passos — a partir de 8 mil por dia é onde a ciência vê o maior ganho pra coração e metabolismo. Segue o ritmo! 💚', route: '/evolucao', aud: { activity: 'goalHitYesterday' } },
  { emoji: '🚶', title: '{{nome}}, o corpo sente a pausa', body: 'Sua média de passos caiu pela metade nos últimos 3 dias. 10 minutos de caminhada já ajudam pressão, açúcar e humor — dá pra encaixar um hoje?', route: '/evolucao', aud: { activity: 'lowActivity3d' } },
  { emoji: '🔥', title: '{{streak}} dias seguidos, {{nome}}!', body: 'Constância é o que muda exame de verdade — e você está entregando. O Dr. Exame registrou (e aplaudiu).', route: '/', aud: { engagement: 'active7d' } },
  { emoji: '👑', title: 'Seu Premium expira em breve', body: 'Histórico completo, tendências e relatório pro médico continuam com você. Renove e não perca o ritmo.', route: '/planos', aud: { plan: 'premiumExpiring7d' } },
  { emoji: '📋', title: '{{nome}}, seus exames continuam aqui', body: 'Faz um tempinho. Que tal conferir se algo mudou na sua evolução? Seu histórico está guardadinho.', route: '/evolucao', aud: { engagement: 'inactive14d' } },
  { emoji: '👥', title: 'Indique o Dr. Exame!', body: 'Convide um amigo pra cuidar da saúde junto. Saúde fica mais fácil (e mais leve) em dupla. 💚', route: '/planos' },
  { emoji: '🩺', title: 'Exames de rotina em dia? 🩺', body: 'Previnir é mais fácil que remediar. Revise seus exames e mantenha tudo atualizado.', route: '/linha-do-tempo', aud: { exams: 'stale90d' } },
  { emoji: '📋', title: 'Seus exames em um só lugar 📋', body: 'Envie seu último exame e deixe o Dr. Exame te ajudar a entender cada valor.', route: '/exams', aud: { engagement: 'noFirstExam' } },
];

const hasAudience = (a: Audience) => Object.values(a).some(Boolean);

export const PushTab = () => {
  const notify = useNotify();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [route, setRoute] = useState('');
  const [audience, setAudience] = useState<Audience>({});
  const [scheduleAt, setScheduleAt] = useState('');
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<{ users: number; devices: number } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  useEffect(() => { fetch(`${API_URL}/admin/push/campaigns`, { headers: { Authorization: `Bearer ${token()}` } }).then((r) => r.ok ? r.json() : { campaigns: [] }).then((d) => setCampaigns(d.campaigns ?? [])).catch(() => {}); }, []);

  const segmented = hasAudience(audience);

  // Preview de audiência com debounce (400ms) — só aposta contagem, nunca envia.
  const refreshPreview = useCallback(() => {
    setPreviewing(true);
    fetch(`${API_URL}/admin/push/audience-preview`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ filter: audience }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPreview(d ? { users: d.users ?? 0, devices: d.devices ?? 0 } : null))
      .catch(() => setPreview(null))
      .finally(() => setPreviewing(false));
  }, [audience]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(refreshPreview, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [refreshPreview]);

  const pick = (t: typeof TEMPLATES[number]) => {
    setTitle(t.title); setBody(t.body); setRoute(t.route ?? ''); setResult(null);
    if (t.aud) setAudience(t.aud);
  };

  const toggle = (group: keyof Audience, value: string) =>
    setAudience((a) => ({ ...a, [group]: a[group] === value ? undefined : value }) as Audience);

  const send = async () => {
    if (!title.trim() || !body.trim()) { notify('Preencha título e corpo.', { type: 'warning' }); return; }
    const when = scheduleAt ? new Date(scheduleAt) : null;
    if (when && (Number.isNaN(when.getTime()) || when.getTime() < Date.now())) { notify('Horário de agendamento inválido (passado).', { type: 'warning' }); return; }

    const audDesc = segmented
      ? `público: ${AUDIENCE_GROUPS.filter((g) => audience[g.key]).map((g) => g.options.find((o) => o.value === audience[g.key])?.label).join(' × ')}${preview ? ` (${preview.users} usuários)` : ''}`
      : 'TODOS os dispositivos';
    const whenDesc = when ? ` — agendada p/ ${when.toLocaleString('pt-BR')}` : '';
    if (!(await confirmDialog({ title: when ? 'Agendar push' : 'Enviar push', message: <>Enviar pra <b>{audDesc}</b>{whenDesc}?<br /><br /><b>"{title.trim()}"</b><br />{body.trim()}</>, confirmLabel: when ? 'Agendar' : 'Enviar', tone: 'warning' }))) return;

    setSending(true);
    try {
      const r = segmented
        ? await fetch(`${API_URL}/admin/push/campaign`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
            body: JSON.stringify({ title: title.trim(), body: body.trim(), route: route.trim() || undefined, filter: audience, ...(when ? { scheduledAt: when.toISOString() } : {}) }),
          })
        : await fetch(`${API_URL}/admin/push/global`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
            body: JSON.stringify({ title: title.trim(), body: body.trim(), route: route.trim() || undefined }),
          });
      const d = await r.json();
      if (r.ok) {
        setResult(d.scheduled
          ? `⏰ Agendada p/ ${new Date(d.at).toLocaleString('pt-BR')}.`
          : `✅ Enviado pra ${d.sent ?? 0} ${d.sent === 1 ? 'usuário' : 'usuários'}.`);
        notify(d.scheduled ? 'Campanha agendada.' : `Push enviado pra ${d.sent ?? 0}.`, { type: 'success' });
        fetch(`${API_URL}/admin/push/campaigns`, { headers: { Authorization: `Bearer ${token()}` } }).then((rr) => rr.ok ? rr.json() : { campaigns: [] }).then((dd) => setCampaigns(dd.campaigns ?? [])).catch(() => {});
      }
      else notify(d.error || 'Falha ao enviar.', { type: 'error' });
    } catch { notify('Falha de conexão.', { type: 'error' }); }
    setSending(false);
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Campanhas por <strong>público-alvo</strong> (plano, engajamento, exames, atividade do celular) ou <strong>global</strong> sem público. Sempre com preview de audiência antes de disparar.
      </Typography>

      {/* PÚBLICO-ALVO */}
      <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>🎯 Público-alvo</Typography>
      <Stack spacing={1} sx={{ mb: 1.5 }}>
        {AUDIENCE_GROUPS.map((g) => (
          <Stack key={g.key} direction="row" spacing={0.75} useFlexGap flexWrap="wrap" alignItems="center">
            <Typography variant="caption" sx={{ width: 130, color: 'text.secondary', fontWeight: 700, flexShrink: 0 }}>{g.label}</Typography>
            {g.options.map((o) => {
              const on = audience[g.key] === o.value;
              return (
                <Chip key={o.value} size="small" clickable onClick={() => toggle(g.key, o.value)} aria-pressed={on} label={o.label}
                  sx={{ height: 28, fontSize: 12, fontWeight: on ? 800 : 600, bgcolor: on ? 'rgba(32,178,170,.18)' : 'rgba(32,178,170,.06)', color: '#178f89', border: on ? '1.5px solid rgba(32,178,170,.5)' : '1px solid rgba(32,178,170,.18)', '&:hover': { bgcolor: 'rgba(32,178,170,.14)' } }} />
              );
            })}
          </Stack>
        ))}
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        {previewing && <CircularProgress size={16} sx={{ color: '#178f89' }} />}
        {!previewing && preview && (
          <Alert severity={preview.users > 0 ? 'info' : 'warning'} icon={<GroupsIcon fontSize="small" />} sx={{ py: 0.25, '.MuiAlert-message': { padding: 0, fontSize: 13 } }}>
            <strong>{preview.users}</strong> usuário(s) · <strong>{preview.devices}</strong> dispositivo(s){segmented ? '' : ' (global)'}
          </Alert>
        )}
        {segmented && <Chip size="small" label="cap: 1 push manual/usuário/semana" variant="outlined" sx={{ height: 24, fontSize: 10.5, color: 'text.secondary' }} />}
      </Stack>
      {!segmented && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          Sem público selecionado = <strong>global</strong> (todos os dispositivos, sem cap anti-spam).
        </Typography>
      )}

      {/* TEMPLATES */}
      <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>📋 Modelos prontos <Typography component="span" variant="caption" color="text.secondary">(o marcado com 🎯 pré-seleciona o público)</Typography></Typography>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2.5 }}>
        {TEMPLATES.map((t) => (
          <Chip key={t.title} clickable onClick={() => pick(t)} label={`${t.emoji} ${t.title.replace(/\{\{nome\}\},?\s*/g, '').replace(/\{\{(streak|passosOntem)\}\}/g, '…')}${t.aud ? ' 🎯' : ''}`}
            sx={{ height: 36, fontSize: 13, bgcolor: 'rgba(32,178,170,.08)', color: '#178f89', fontWeight: 600, '&:hover': { bgcolor: 'rgba(32,178,170,.16)' } }} />
        ))}
      </Stack>

      <Stack spacing={1.5}>
        <TextField label="Título" value={title} onChange={(e) => setTitle(e.target.value)} size="small" fullWidth />
        <TextField label="Corpo da mensagem" value={body} onChange={(e) => setBody(e.target.value)} size="small" fullWidth multiline minRows={2} helperText="Merge fields: {{nome}} · {{streak}} (dias seguidos) · {{passosOntem}} — resolvidos por usuário no envio." />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <TextField label="Tela ao tocar (opcional)" value={route} onChange={(e) => setRoute(e.target.value)} size="small" fullWidth placeholder="/planos, /exams, /evolucao…" />
          <TextField label="Agendar (opcional)" type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} size="small" fullWidth
            slotProps={{ htmlInput: { min: new Date(Date.now() + 5 * 60000).toISOString().slice(0, 16) } }}
            helperText={segmented ? 'Dispara sozinho na hora.' : 'Só com público selecionado.'} InputLabelProps={{ shrink: true }} />
        </Stack>
      </Stack>

      <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Button variant="contained" startIcon={sending ? <CircularProgress size={18} color="inherit" /> : (scheduleAt && segmented ? <ScheduleIcon /> : <SendIcon />)} onClick={send} disabled={sending || (!!scheduleAt && !segmented)}
          sx={{ bgcolor: '#20b2aa', '&:hover': { bgcolor: '#178f89' }, textTransform: 'none', fontWeight: 700, borderRadius: '999px' }}>
          {sending ? 'Enviando…' : scheduleAt && segmented ? 'Agendar campanha' : 'Enviar push'}
        </Button>
        {result && <Alert severity="success" icon={false} sx={{ py: 0.5, '.MuiAlert-message': { padding: 0 } }}>{result}</Alert>}
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
        * O Firebase Admin precisa estar configurado no servidor. Sem o service account, conta a audiência mas não entrega a notificação de fato.
      </Typography>

      {campaigns.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>📣 Campanhas recentes ({campaigns.length})</Typography>
          <Stack spacing={1}>
            {campaigns.map((c: any) => {
              const scheduled = c.scheduledAt && !c.sentAt;
              const aud = c.audienceFilter && Object.keys(c.audienceFilter).length
                ? Object.entries(c.audienceFilter).map(([g, v]) => `${g}:${v}`).join(' · ')
                : 'global';
              return (
                <Box key={c.id} sx={{ p: 1.25, borderRadius: '12px', bgcolor: 'action.hover' }}>
                  <Stack direction="row" justifyContent="space-between" gap={1} flexWrap="wrap">
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography sx={{ fontWeight: 700 }}>{scheduled && '⏰ '}{c.title}</Typography>
                      <Typography variant="caption" color="text.secondary">{c.body.slice(0, 60)}{c.body.length > 60 ? '…' : ''}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>🎯 {aud}</Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                      {scheduled ? `agendada ${new Date(c.scheduledAt).toLocaleString('pt-BR')}` : `📤 ${c.sentCount} · ${c.sentAt ? new Date(c.sentAt).toLocaleDateString('pt-BR') : '—'}`}
                    </Typography>
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        </Box>
      )}

      <Divider sx={{ my: 2.5 }} />
      <Typography variant="caption" color="text.secondary">
        Triggers automáticos no server (08h): meta de passos 🎉 · streak 7d 🔥 · queda de atividade 📉 · reativação de sumidos 14d 📂 — com cooldowns anti-spam.
      </Typography>
    </Box>
  );
};
