import { useState, useEffect } from 'react';
import { Box, Stack, Typography, TextField, Button, Chip, Alert, CircularProgress } from '@mui/material';
import { useNotify } from 'react-admin';
import SendIcon from '@mui/icons-material/Send';
import { API_URL, token } from '../../config';
import { confirmDialog } from '../../components/ConfirmDialog';

/** Templates prontos de push global — voz do Dr. Exame, foco em engajamento (saúde)
 *  e aquisição (indicação/Premium). `route` = tela ao tocar (deep-link opcional). */
const TEMPLATES: { emoji: string; title: string; body: string; route?: string }[] = [
  { emoji: '👥', title: 'Indique o Dr. Exame!', body: 'Convide um amigo pra cuidar da saúde junto. Saúde fica mais fácil (e mais leve) em dupla. 💚', route: '/planos' },
  { emoji: '💧', title: 'Beba um copo d’água agora 💧', body: 'Hidratação ajuda rins, pele e disposição. Um gesto simples com grande efeito.', route: '/' },
  { emoji: '🚶', title: '10 min de caminhada hoje 🚶', body: 'Caminhar 10 minutos melhora pressão, açúcar e humor. Que tal dar o primeiro passo agora?', route: '/evolucao' },
  { emoji: '😴', title: 'Dormiu bem hoje? 😴', body: '7 a 8 horas de sono regulam hormônios, imunidade e memória. Evite telas 1h antes de dormir.', route: '/' },
  { emoji: '🥗', title: 'Prato colorido 🥗', body: 'Frutas, verduras e fibras ajudam intestino e coração. Capriche na próxima refeição!', route: '/' },
  { emoji: '📋', title: 'Seus exames em um só lugar 📋', body: 'Envie seu último exame e deixe o Dr. Exame te ajudar a entender cada valor.', route: '/exams' },
  { emoji: '⭐', title: 'Desbloqueie o Premium ⭐', body: 'Histórico completo, tendências e relatório pra levar ao médico. Conheça o plano Premium.', route: '/planos' },
  { emoji: '🩺', title: 'Exames de rotina em dia? 🩺', body: 'Previnir é mais fácil que remediar. Revise seus exames e mantenha tudo atualizado.', route: '/linha-do-tempo' },
];

export const PushTab = () => {
  const notify = useNotify();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [route, setRoute] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number } | null>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  useEffect(() => { fetch(`${API_URL}/admin/push/campaigns`, { headers: { Authorization: `Bearer ${token()}` } }).then((r) => r.ok ? r.json() : { campaigns: [] }).then((d) => setCampaigns(d.campaigns ?? [])).catch(() => {}); }, []);

  const pick = (t: { title: string; body: string; route?: string }) => {
    setTitle(t.title); setBody(t.body); setRoute(t.route ?? ''); setResult(null);
  };

  const send = async () => {
    if (!title.trim() || !body.trim()) { notify('Preencha título e corpo.', { type: 'warning' }); return; }
    if (!(await confirmDialog({ title: 'Enviar push global', message: <>Enviar pra <b>todos</b> os dispositivos?<br /><br /><b>"{title.trim()}"</b><br />{body.trim()}</>, confirmLabel: 'Enviar', tone: 'warning' }))) return;
    setSending(true);
    try {
      const r = await fetch(`${API_URL}/admin/push/global`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), route: route.trim() || undefined }),
      });
      const d = await r.json();
      if (r.ok) { setResult({ sent: d.sent ?? 0 }); notify(`Push enviado pra ${d.sent ?? 0} dispositivo(s).`, { type: 'success' }); }
      else notify(d.error || 'Falha ao enviar.', { type: 'error' });
    } catch { notify('Falha de conexão.', { type: 'error' }); }
    setSending(false);
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Dispara uma notificação push pra <strong>todos os dispositivos</strong> com o app instalado. Útil pra engajamento, dicas de saúde e campanhas de indicação.
      </Typography>

      <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>📋 Modelos prontos</Typography>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2.5 }}>
        {TEMPLATES.map((t) => (
          <Chip key={t.title} clickable onClick={() => pick(t)} label={`${t.emoji} ${t.title}`}
            sx={{ height: 36, fontSize: 13, bgcolor: 'rgba(32,178,170,.08)', color: '#178f89', fontWeight: 600, '&:hover': { bgcolor: 'rgba(32,178,170,.16)' } }} />
        ))}
      </Stack>

      <Stack spacing={1.5}>
        <TextField label="Título" value={title} onChange={(e) => setTitle(e.target.value)} size="small" fullWidth />
        <TextField label="Corpo da mensagem" value={body} onChange={(e) => setBody(e.target.value)} size="small" fullWidth multiline minRows={2} />
        <TextField label="Tela ao tocar (opcional)" value={route} onChange={(e) => setRoute(e.target.value)} size="small" fullWidth placeholder="/planos, /exams, /evolucao…" />
      </Stack>

      <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Button variant="contained" startIcon={sending ? <CircularProgress size={18} color="inherit" /> : <SendIcon />} onClick={send} disabled={sending}
          sx={{ bgcolor: '#20b2aa', '&:hover': { bgcolor: '#178f89' }, textTransform: 'none', fontWeight: 700, borderRadius: 99 }}>
          {sending ? 'Enviando…' : 'Enviar push global'}
        </Button>
        {result != null && <Alert severity="success" icon={false} sx={{ py: 0.5, '.MuiAlert-message': { padding: 0 } }}>✅ Enviado pra <strong>{result.sent}</strong> dispositivo(s).</Alert>}
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
        * O Firebase Admin precisa estar configurado no servidor. Sem o service account, conta os dispositivos mas não entrega a notificação de fato.
      </Typography>

      {campaigns.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>📣 Campanhas recentes ({campaigns.length})</Typography>
          <Stack spacing={1}>
            {campaigns.map((c: any) => (
              <Box key={c.id} sx={{ p: 1.25, borderRadius: 2, bgcolor: 'action.hover' }}>
                <Stack direction="row" justifyContent="space-between" gap={1} flexWrap="wrap">
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography sx={{ fontWeight: 700 }}>{c.title}</Typography>
                    <Typography variant="caption" color="text.secondary">{c.body.slice(0, 60)}{c.body.length > 60 ? '…' : ''}</Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>📤 {c.sentCount} disp. · {c.sentAt ? new Date(c.sentAt).toLocaleDateString('pt-BR') : '—'}</Typography>
                </Stack>
              </Box>
            ))}
          </Stack>
        </Box>
      )}
    </Box>
  );
};
