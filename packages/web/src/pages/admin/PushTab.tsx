import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Stack, Typography, TextField, Button, Chip, Alert, CircularProgress, Divider, Switch } from '@mui/material';
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
  { emoji: '👥', title: 'Indique e ganhe créditos! 🎁', body: '{{nome}}, convide um amigo: ele ganha bônus no cadastro e você ganha quando ele ativar. Saúde fica melhor em dupla. 💚', route: '/indique' },
  { emoji: '🩺', title: 'Exames de rotina em dia? 🩺', body: 'Previnir é mais fácil que remediar. Revise seus exames e mantenha tudo atualizado.', route: '/linha-do-tempo', aud: { exams: 'stale90d' } },
  { emoji: '📋', title: 'Seus exames em um só lugar 📋', body: 'Envie seu último exame e deixe o Dr. Exame te ajudar a entender cada valor.', route: '/exams', aud: { engagement: 'noFirstExam' } },
];

const hasAudience = (a: Audience) => Object.values(a).some(Boolean);

/** Título curto do template pra etiqueta do chip — placeholders somem SEM deixar
 *  pontuação órfã. Ex.: "{{streak}} dias seguidos, {{nome}}!" → "… dias seguidos!"
 *  Genérico: qualquer {{palavra}} vira "…", só {{nome}} (saudação) é removido. */
const chipTitle = (t: string): string => t
  .replace(/,?\s*\{\{nome\}\},?\s*/g, ' ') // {{nome}} some levando as vírgulas vizinhas
  .replace(/\{\{\w+\}\}/g, '…') // demais placeholders (streak, passosOntem, dias, meta…) → "…"
  .replace(/\s+([!?.:;,])/g, '$1') // pontuação órfã cola na palavra anterior (", !" → "!")
  .replace(/\s{2,}/g, ' ')
  .trim();

/** Público salvo da campanha → legível ("plan:free" → "Plano: Free"). */
const segLabel = (g: string, v: unknown) => {
  const group = AUDIENCE_GROUPS.find((x) => x.key === g);
  const opt = group?.options.find((o) => o.value === v)?.label;
  return `${group?.label ?? g}: ${opt ?? String(v)}`;
};

export const PushTab = () => {
  const notify = useNotify();
  const [audienceMode, setAudienceMode] = useState<'global' | 'segmented'>('global');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [route, setRoute] = useState('');
  const [audience, setAudience] = useState<Audience>({});
  const [scheduleAt, setScheduleAt] = useState('');
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<{
    users: number;
    devices: number;
    sampleUsers?: Array<{ id: string; name: string | null; email: string; planExpiresAt: Date | null; deviceCount: number; platforms: string[] }>;
  } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [showUserList, setShowUserList] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  useEffect(() => { fetch(`${API_URL}/admin/push/campaigns`, { headers: { Authorization: `Bearer ${token()}` } }).then((r) => r.ok ? r.json() : { campaigns: [] }).then((d) => setCampaigns(d.campaigns ?? [])).catch(() => {}); }, []);

  // ── MOTD (mensagem do dia pós-login) + share de indicação — AppSettings editáveis ──
  const [motd, setMotd] = useState({ enabled: 0, title: '', message: '', ctaLabel: '', ctaRoute: '' });
  const [shareMsg, setShareMsg] = useState('');
  const [txtSaving, setTxtSaving] = useState(false);
  useEffect(() => {
    fetch(`${API_URL}/admin/config`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (c?.motd) setMotd((m) => ({ ...m, ...c.motd }));
        if (c?.referral) setShareMsg(String(c.referral.shareMessage ?? ''));
      }).catch(() => {});
  }, []);
  const saveTexts = async () => {
    setTxtSaving(true);
    try {
      const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` };
      const r1 = await fetch(`${API_URL}/admin/config/costs`, { method: 'PATCH', headers: h, body: JSON.stringify({ category: 'motd', value: motd }) });
      const r2 = await fetch(`${API_URL}/admin/config/costs`, { method: 'PATCH', headers: h, body: JSON.stringify({ category: 'referral', value: { shareMessage: shareMsg } }) });
      if (!r1.ok || !r2.ok) throw new Error();
      notify('Textos salvos — MOTD aparece na próxima sessão (1x por conteúdo).', { type: 'success' });
    } catch { notify('Falha ao salvar textos.', { type: 'error' }); }
    finally { setTxtSaving(false); }
  };

  const segmented = audienceMode === 'segmented' && hasAudience(audience);

  // Preview de audiência com debounce (400ms)
  const refreshPreview = useCallback(() => {
    setPreviewing(true);
    const activeFilter = audienceMode === 'global' ? {} : audience;
    fetch(`${API_URL}/admin/push/audience-preview`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ filter: activeFilter, includeUsers: true }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPreview(d ? { users: d.users ?? 0, devices: d.devices ?? 0, sampleUsers: d.sampleUsers ?? [] } : null))
      .catch(() => setPreview(null))
      .finally(() => setPreviewing(false));
  }, [audience, audienceMode]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(refreshPreview, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [refreshPreview]);

  // Escolha de modelo: NUNCA altera o público se o usuário estiver em Global!
  const pick = (t: typeof TEMPLATES[number]) => {
    setTitle(t.title);
    setBody(t.body);
    setRoute(t.route ?? '');
    setResult(null);
    if (audienceMode === 'segmented' && t.aud) {
      setAudience(t.aud);
    }
  };

  const toggle = (group: keyof Audience, value: string) =>
    setAudience((a) => ({ ...a, [group]: a[group] === value ? undefined : value }) as Audience);

  const send = async () => {
    if (!title.trim() || !body.trim()) { notify('Preencha título e corpo.', { type: 'warning' }); return; }
    const when = scheduleAt ? new Date(scheduleAt) : null;
    if (when && (Number.isNaN(when.getTime()) || when.getTime() < Date.now())) { notify('Horário de agendamento inválido (passado).', { type: 'warning' }); return; }

    const audDesc = segmented
      ? `público segmentado: ${AUDIENCE_GROUPS.filter((g) => audience[g.key]).map((g) => g.options.find((o) => o.value === audience[g.key])?.label).join(' × ')}${preview ? ` (${preview.users} usuários)` : ''}`
      : `TODOS os usuários cadastrados (${preview?.users ?? 0} pessoas, ${preview?.devices ?? 0} aparelhos ativos)`;
    const whenDesc = when ? ` — agendada p/ ${when.toLocaleString('pt-BR')}` : '';
    if (!(await confirmDialog({ title: when ? 'Agendar push' : 'Enviar push agora', message: <>Enviar para <b>{audDesc}</b>{whenDesc}?<br /><br /><b>"{title.trim()}"</b><br />{body.trim()}</>, confirmLabel: when ? 'Agendar' : 'Enviar push', tone: 'warning' }))) return;

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
          : `✅ Enviado com sucesso pra ${d.sent ?? 0} ${d.sent === 1 ? 'usuário' : 'usuários'}.`);
        notify(d.scheduled ? 'Campanha agendada.' : `Push enviado pra ${d.sent ?? 0}.`, { type: 'success' });
        fetch(`${API_URL}/admin/push/campaigns`, { headers: { Authorization: `Bearer ${token()}` } }).then((rr) => rr.ok ? rr.json() : { campaigns: [] }).then((dd) => setCampaigns(dd.campaigns ?? [])).catch(() => {});
      }
      else notify(d.error || 'Falha ao enviar.', { type: 'error' });
    } catch { notify('Falha de conexão.', { type: 'error' }); }
    setSending(false);
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Dispare notificações para <strong>todos os usuários</strong> ou filtre por <strong>segmentos específicos</strong>. Com lista transparente de destinatários e pré-visualização em tempo real.
      </Typography>

      {/* ── CARD PRINCIPAL COM FLUXO EM 3 PASSOS ── */}
      <Box sx={{ p: { xs: 2, sm: 3 }, borderRadius: '18px', border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', mb: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>

        {/* ── PASSO 1: DESTINATÁRIOS ── */}
        <Box sx={{ pb: 3, mb: 3, borderBottom: '1px dashed', borderColor: 'divider' }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: '#178f89', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13 }}>1</Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'text.primary' }}>Escolha o público (Para quem enviar?)</Typography>
          </Stack>

          {/* Seletores principais de Modo */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, mb: 2 }}>
            <Box
              onClick={() => { setAudienceMode('global'); setAudience({}); }}
              sx={{
                p: 2, borderRadius: '14px', cursor: 'pointer', transition: 'all .2s ease',
                border: '2px solid',
                borderColor: audienceMode === 'global' ? '#178f89' : 'divider',
                bgcolor: audienceMode === 'global' ? 'rgba(32,178,170,.08)' : 'background.default',
                '&:hover': { borderColor: '#178f89' },
              }}
            >
              <Typography sx={{ fontWeight: 800, fontSize: 15, color: audienceMode === 'global' ? '#178f89' : 'text.primary', mb: 0.5 }}>
                🌍 Enviar para TODO MUNDO (Global)
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                Dispara para todos os usuários cadastrados que possuem celulares com token push ativo.
              </Typography>
            </Box>

            <Box
              onClick={() => setAudienceMode('segmented')}
              sx={{
                p: 2, borderRadius: '14px', cursor: 'pointer', transition: 'all .2s ease',
                border: '2px solid',
                borderColor: audienceMode === 'segmented' ? '#178f89' : 'divider',
                bgcolor: audienceMode === 'segmented' ? 'rgba(32,178,170,.08)' : 'background.default',
                '&:hover': { borderColor: '#178f89' },
              }}
            >
              <Typography sx={{ fontWeight: 800, fontSize: 15, color: audienceMode === 'segmented' ? '#178f89' : 'text.primary', mb: 0.5 }}>
                🎯 Filtrar por Segmento Específico
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                Filtre por plano (Free/Premium), sumidos (14d+), exame alterado ou atividade do Health Connect.
              </Typography>
            </Box>
          </Box>

          {/* Filtros de segmento (só exibidos no modo segmentado) */}
          {audienceMode === 'segmented' && (
            <Box sx={{ p: 2, borderRadius: '14px', bgcolor: 'action.hover', mb: 2 }}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', display: 'block', mb: 1, textTransform: 'uppercase' }}>
                Filtros de Segmentação:
              </Typography>
              <Stack spacing={1}>
                {AUDIENCE_GROUPS.map((g) => (
                  <Stack key={g.key} direction="row" spacing={0.75} useFlexGap flexWrap="wrap" alignItems="center">
                    <Typography variant="caption" sx={{ width: 130, color: 'text.secondary', fontWeight: 700, flexShrink: 0 }}>{g.label}</Typography>
                    {g.options.map((o) => {
                      const on = audience[g.key] === o.value;
                      return (
                        <Chip key={o.value} size="small" clickable onClick={() => toggle(g.key, o.value)} aria-pressed={on} label={o.label}
                          sx={{ height: 28, fontSize: 12, fontWeight: on ? 800 : 600, bgcolor: on ? 'rgba(32,178,170,.22)' : 'background.paper', color: on ? '#0f5f5a' : 'text.primary', border: on ? '1.5px solid #178f89' : '1px solid rgba(0,0,0,0.12)', '&:hover': { bgcolor: 'rgba(32,178,170,.14)' } }} />
                      );
                    })}
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}

          {/* Barra de contagem e botão de inspeção de destinatários */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" sx={{ p: 1.5, borderRadius: '12px', bgcolor: 'rgba(32,178,170,.06)', border: '1px solid rgba(32,178,170,.18)' }}>
            <Stack direction="row" spacing={1} alignItems="center">
              {previewing ? (
                <CircularProgress size={18} sx={{ color: '#178f89' }} />
              ) : (
                <GroupsIcon sx={{ color: '#178f89', fontSize: 20 }} />
              )}
              <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: '#0f5f5a' }}>
                {preview ? (
                  <>Destinatários alcançáveis: <strong>{preview.users}</strong> usuário(s) · <strong>{preview.devices}</strong> dispositivo(s) com push ativo</>
                ) : (
                  'Calculando audiência…'
                )}
              </Typography>
            </Stack>

            {preview && preview.users > 0 && (
              <Button size="small" variant="outlined" onClick={() => setShowUserList((v) => !v)}
                sx={{ textTransform: 'none', fontWeight: 700, fontSize: 12.5, borderRadius: '8px', borderColor: '#178f89', color: '#178f89' }}>
                {showUserList ? 'Ocultar lista de pessoas ▲' : `Ver quem são os ${preview.users} destinatários ▼`}
              </Button>
            )}
          </Stack>

          {/* Tabela transparente de destinatários (expandível) */}
          {showUserList && preview?.sampleUsers && preview.sampleUsers.length > 0 && (
            <Box sx={{ mt: 1.5, borderRadius: '12px', overflow: 'hidden', border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
              <Box sx={{ px: 2, py: 1, bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase' }}>
                  Usuários que receberão este disparo (amostra de até 50):
                </Typography>
              </Box>
              <Box sx={{ maxHeight: 220, overflowY: 'auto' }}>
                {preview.sampleUsers.map((u) => {
                  const isPremium = u.planExpiresAt && new Date(u.planExpiresAt).getTime() > Date.now();
                  return (
                    <Stack key={u.id} direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, py: 1, borderBottom: '1px solid rgba(0,0,0,0.05)', fontSize: 13 }}>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: 13, color: 'text.primary' }}>{u.name || 'Sem nome'}</Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{u.email}</Typography>
                      </Box>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip size="small" label={isPremium ? 'Premium' : 'Free'} sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: isPremium ? 'rgba(32,178,170,.15)' : 'action.selected' }} />
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                          📱 {u.deviceCount} aparelho(s) {u.platforms.length ? `(${u.platforms.join(', ')})` : ''}
                        </Typography>
                      </Stack>
                    </Stack>
                  );
                })}
              </Box>
            </Box>
          )}
        </Box>

        {/* ── PASSO 2: MENSAGEM & PRÉVIA NO SMARTPHONE ── */}
        <Box sx={{ pb: 3, mb: 3, borderBottom: '1px dashed', borderColor: 'divider' }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
            <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: '#178f89', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13 }}>2</Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'text.primary' }}>Mensagem & Prévia no Celular</Typography>
          </Stack>

          {/* Modelos prontos que NÃO mudam o público em Global */}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Modelos prontos (clique para preencher o texto — seu público selecionado acima será mantido):
          </Typography>
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mb: 2.5 }}>
            {TEMPLATES.map((t) => (
              <Chip key={t.title} clickable onClick={() => pick(t)} label={`${t.emoji} ${chipTitle(t.title)}`}
                sx={{ height: 32, fontSize: 12.5, bgcolor: 'rgba(32,178,170,.08)', color: '#178f89', fontWeight: 600, '&:hover': { bgcolor: 'rgba(32,178,170,.18)' } }} />
            ))}
          </Stack>

          {/* Grade: Formulário à esquerda + Celular à direita */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.2fr 0.8fr' }, gap: 3, alignItems: 'start' }}>
            <Stack spacing={1.5}>
              <TextField label="Título da notificação" value={title} onChange={(e) => setTitle(e.target.value)} size="small" fullWidth placeholder="Ex.: Exames de rotina em dia? 🩺" />
              <TextField label="Corpo da mensagem" value={body} onChange={(e) => setBody(e.target.value)} size="small" fullWidth multiline minRows={3} helperText="Placeholders automáticos: {{nome}} · {{streak}} (dias seguidos) · {{passosOntem}} — preenchidos por usuário no envio." />
              <TextField label="Tela ao tocar (opcional)" value={route} onChange={(e) => setRoute(e.target.value)} size="small" fullWidth placeholder="/exams, /evolucao, /planos, /linha-do-tempo…" />
            </Stack>

            {/* Mockup de celular com o push ao vivo */}
            <Box sx={{
              bgcolor: '#0f172a', borderRadius: '24px', p: 2, color: '#fff',
              boxShadow: '0 16px 36px rgba(0,0,0,0.18)', maxWidth: 330, mx: 'auto', width: '100%',
              border: '2px solid rgba(255,255,255,0.1)'
            }}>
              <Stack direction="row" justifyContent="space-between" sx={{ fontSize: 11, color: '#94a3b8', mb: 1.5, px: 0.5 }}>
                <span>09:41</span>
                <span>5G · 100%</span>
              </Stack>
              <Box sx={{
                bgcolor: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(16px)',
                borderRadius: '16px', p: 1.5, border: '1px solid rgba(255,255,255,0.14)'
              }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#5fc9c3', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    🩺 Dr. Exame
                  </Typography>
                  <Typography sx={{ fontSize: 10.5, color: '#cbd5e1' }}>Agora</Typography>
                </Stack>
                <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#fff', mb: 0.3, lineHeight: 1.25 }}>
                  {title.trim() || 'Título da Notificação'}
                </Typography>
                <Typography sx={{ fontSize: 12, color: '#e2e8f0', lineHeight: 1.4 }}>
                  {body.trim() || 'Aqui aparecerá o texto do seu push exatamente como o paciente lerá na tela bloqueada do celular.'}
                </Typography>
              </Box>
              <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 1.5, color: '#64748b', fontSize: 11 }}>
                Prévia da tela bloqueada (Android / iOS)
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* ── PASSO 3: CONFIRMAÇÃO & DISPARO ── */}
        <Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
            <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: '#178f89', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13 }}>3</Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'text.primary' }}>Revisão & Disparo</Typography>
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between">
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: 'text.primary' }}>
                Disparar para: <Box component="span" sx={{ color: '#178f89', fontWeight: 800 }}>{audienceMode === 'global' ? '🌍 Todos os usuários da base' : '🎯 Segmento filtrado'}</Box>
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {preview ? `${preview.users} pessoa(s) receberão nos seus celulares ativos.` : 'Aguardando cálculo…'}
              </Typography>
            </Box>

            <Stack direction="row" spacing={1.5} alignItems="center">
              <TextField label="Agendar (opcional)" type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} size="small"
                slotProps={{ htmlInput: { min: new Date(Date.now() + 5 * 60000).toISOString().slice(0, 16) } }}
                InputLabelProps={{ shrink: true }} sx={{ width: { xs: '100%', sm: 220 } }} />

              <Button variant="contained" startIcon={sending ? <CircularProgress size={18} color="inherit" /> : (scheduleAt ? <ScheduleIcon /> : <SendIcon />)}
                onClick={send} disabled={sending || !title.trim() || !body.trim()}
                sx={{ bgcolor: '#20b2aa', '&:hover': { bgcolor: '#178f89' }, textTransform: 'none', fontWeight: 800, borderRadius: '999px', px: 3, py: 1, whiteSpace: 'nowrap' }}>
                {sending ? 'Enviando…' : scheduleAt ? 'Agendar campanha' : 'Disparar Push Agora'}
              </Button>
            </Stack>
          </Stack>

          {result && <Alert severity="success" sx={{ mt: 2 }}>{result}</Alert>}
        </Box>
      </Box>

      {/* ── SEÇÃO 2: CAMPANHAS RECENTES ── */}
      {campaigns.length > 0 && (
        <Box sx={{ p: 2, borderRadius: '14px', border: '1px solid', borderColor: 'divider', mb: 2.5 }}>
          <Typography sx={{ fontWeight: 800, mb: 1.5 }}>🗂 Campanhas recentes ({campaigns.length})</Typography>
          <Stack spacing={1}>
            {campaigns.map((c: any) => {
              const scheduled = c.scheduledAt && !c.sentAt;
              const aud = c.audienceFilter && Object.keys(c.audienceFilter).length
                ? Object.entries(c.audienceFilter).map(([g, v]) => segLabel(g, v)).join(' · ')
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

      {/* ── SEÇÃO 3: MENSAGENS DO APP ── */}
      <Box sx={{ p: 2, borderRadius: '14px', border: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
          <Box>
            <Typography sx={{ fontWeight: 800 }}>💬 Mensagens do app</Typography>
            <Typography variant="caption" color="text.secondary">
              Dialog pós-login, 1x por conteúdo (mudou o texto = mostra de novo). Vazio/desligado = não aparece.
            </Typography>
          </Box>
          <Switch checked={!!motd.enabled} onChange={(e) => setMotd((m) => ({ ...m, enabled: e.target.checked ? 1 : 0 }))} />
        </Stack>
        <Stack spacing={1.5}>
          <TextField size="small" label="Título" value={motd.title} onChange={(e) => setMotd((m) => ({ ...m, title: e.target.value }))} fullWidth />
          <TextField size="small" label="Mensagem" value={motd.message} onChange={(e) => setMotd((m) => ({ ...m, message: e.target.value }))} fullWidth multiline minRows={2} />
          <Stack direction="row" spacing={1.5}>
            <TextField size="small" label="Botão (opcional)" value={motd.ctaLabel} onChange={(e) => setMotd((m) => ({ ...m, ctaLabel: e.target.value }))} fullWidth />
            <TextField size="small" label="Rota do botão (ex.: /carteira)" value={motd.ctaRoute} onChange={(e) => setMotd((m) => ({ ...m, ctaRoute: e.target.value }))} fullWidth />
          </Stack>
          <Divider sx={{ my: 0.5 }} />
          <TextField
            size="small" label="Texto do share de indicação (opcional)"
            value={shareMsg} onChange={(e) => setShareMsg(e.target.value)} fullWidth multiline minRows={2}
            helperText="Placeholders: {code} {bonus} {link}. Vazio = texto padrão do app."
          />
          <Box>
            <Button variant="contained" onClick={saveTexts} disabled={txtSaving} sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '10px' }}>
              {txtSaving ? 'Salvando…' : 'Salvar textos'}
            </Button>
          </Box>
        </Stack>
      </Box>

      <Divider sx={{ my: 2.5 }} />
      <Typography variant="caption" color="text.secondary">
        Triggers automáticos no server (08h): meta de passos 🎉 · streak 7d 🔥 · queda de atividade 📉 · reativação de sumidos 14d 📂 — com cooldowns anti-spam.
      </Typography>
    </Box>
  );
};
