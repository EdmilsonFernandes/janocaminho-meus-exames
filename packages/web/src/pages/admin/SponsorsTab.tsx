import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, TextField, Button, MenuItem, Switch, FormControlLabel, Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, Chip, Alert, ToggleButton, ToggleButtonGroup, Tooltip, useTheme,
} from '@mui/material';
import { useNotify } from 'react-admin';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import LaptopMacIcon from '@mui/icons-material/LaptopMac';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import { API_URL, token } from '../../config';
import { TabLoader, SectionError, ConfirmDialog } from './parts';
import { Badge, type BadgeProps } from '@/components/reui/badge';
import { Frame, FramePanel, FrameHeader, FrameTitle, FrameDescription } from '@/components/reui/frame';
import { useReuiThemeSync } from '@/components/reui/use-reui-theme';
import { SponsorCard, glassPaperSx } from '../../components/sponsor/SponsorCard';
import type { SponsorCampaign as ClientCampaign } from '../../utils/sponsorApi';

/**
 * ADMIN · PATROCINADORES & CAMPANHAS (02/11/26)
 *  - Patrocinador: nome, site, notas, ativo, logo.
 *  - Campanha: título, descrição, imagem, botão (texto + destino interno/externo), público por
 *    perfil, início/fim, prioridade, frequência e teto por usuário. Estados: rascunho →
 *    agendada/ativa ⇄ pausada → encerrada. Prévia mobile/desktop (NÃO conta impressão).
 *  - Métricas: impressões efetivas, usuários alcançados, cliques, dispensas, CTR.
 *  - Sem cobrança/repasse nesta etapa (decisão do dono).
 */
const H = () => ({ Authorization: `Bearer ${token()}` });
const JH = () => ({ ...H(), 'Content-Type': 'application/json' });

interface Sponsor { id: string; name: string; website: string | null; notes: string | null; active: boolean; logoUrl: string | null; campaignCount?: number; createdAt: string }
interface Metrics { impressions: number; reach: number; clicks: number; dismisses: number; ctr: number }
interface Campaign {
  id: string; sponsorId: string; sponsor?: { id: string; name: string; active: boolean; logoUrl: string | null };
  title: string; description: string; imageUrl: string | null; ctaLabel: string; ctaType: 'none' | 'internal' | 'external'; ctaTarget: string | null;
  audience: 'patient' | 'doctor' | 'all'; status: string; effectiveStatus: 'draft' | 'scheduled' | 'active' | 'paused' | 'ended';
  startsAt: string | null; endsAt: string | null; priority: number; frequencyHours: number; maxImpressionsPerUser: number;
  publishedAt: string | null; endedAt: string | null; createdAt: string; metrics: Metrics | null;
}
interface AdsSettings { enabled: boolean; globalIntervalHours: number; bootDelayMs: number }

const STATUS_LABEL: Record<Campaign['effectiveStatus'], string> = { draft: 'Rascunho', scheduled: 'Agendada', active: 'Ativa', paused: 'Pausada', ended: 'Encerrada' };
const STATUS_BADGE: Record<Campaign['effectiveStatus'], BadgeProps['variant']> = { draft: 'invert-light', scheduled: 'info-light', active: 'success-light', paused: 'warning-light', ended: 'destructive-light' };
const AUDIENCE_LABEL: Record<Campaign['audience'], string> = { patient: 'Pacientes', doctor: 'Médicos', all: 'Todos' };
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const toLocalInput = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

type CampaignForm = { sponsorId: string; title: string; description: string; ctaLabel: string; ctaType: Campaign['ctaType']; ctaTarget: string; audience: Campaign['audience']; startsAt: string; endsAt: string; priority: number; frequencyHours: number; maxImpressionsPerUser: number };
const emptyForm = (sponsorId = ''): CampaignForm => ({ sponsorId, title: '', description: '', ctaLabel: 'Saiba mais', ctaType: 'external', ctaTarget: '', audience: 'patient', startsAt: '', endsAt: '', priority: 0, frequencyHours: 72, maxImpressionsPerUser: 2 });

const fieldSx = { '& .MuiOutlinedInput-root': { borderRadius: '12px' } };

export const SponsorsTab = () => {
  useReuiThemeSync();
  const notify = useNotify();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [settings, setSettings] = useState<AdsSettings>({ enabled: true, globalIntervalHours: 24, bootDelayMs: 3500 });
  const [savingSettings, setSavingSettings] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [s, c] = await Promise.all([
        fetch(`${API_URL}/admin/sponsors`, { headers: H() }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('sponsors')))),
        fetch(`${API_URL}/admin/campaigns`, { headers: H() }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('campaigns')))),
      ]);
      setSponsors(s.sponsors ?? []);
      setCampaigns(c.campaigns ?? []);
      if (c.settings) setSettings(c.settings);
    } catch { setError('Não foi possível carregar patrocinadores e campanhas.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // ── patrocinador (form) ──
  const [spDialog, setSpDialog] = useState<{ open: boolean; editing: Sponsor | null }>({ open: false, editing: null });
  const [spForm, setSpForm] = useState({ name: '', website: '', notes: '', active: true });
  const [spSaving, setSpSaving] = useState(false);
  const openSponsor = (s: Sponsor | null) => { setSpForm(s ? { name: s.name, website: s.website ?? '', notes: s.notes ?? '', active: s.active } : { name: '', website: '', notes: '', active: true }); setSpDialog({ open: true, editing: s }); };
  const saveSponsor = async () => {
    setSpSaving(true);
    try {
      const url = spDialog.editing ? `${API_URL}/admin/sponsors/${spDialog.editing.id}` : `${API_URL}/admin/sponsors`;
      const r = await fetch(url, { method: spDialog.editing ? 'PATCH' : 'POST', headers: JH(), body: JSON.stringify(spForm) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { notify(d?.error || 'Falha ao salvar patrocinador', { type: 'error' }); return; }
      notify(spDialog.editing ? 'Patrocinador atualizado' : 'Patrocinador criado', { type: 'success' });
      setSpDialog({ open: false, editing: null });
      await load();
    } finally { setSpSaving(false); }
  };
  const uploadAsset = async (kind: 'sponsor' | 'campaign', id: string, file: File) => {
    const fd = new FormData();
    fd.append(kind === 'sponsor' ? 'logo' : 'image', file);
    const r = await fetch(`${API_URL}/admin/${kind === 'sponsor' ? 'sponsors' : 'campaigns'}/${id}/${kind === 'sponsor' ? 'logo' : 'image'}`, { method: 'POST', headers: H(), body: fd });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { notify(d?.error || 'Falha no upload da imagem', { type: 'error' }); return; }
    notify('Imagem atualizada', { type: 'success' });
    await load();
  };

  // ── campanha (form) ──
  const [cpDialog, setCpDialog] = useState<{ open: boolean; editing: Campaign | null }>({ open: false, editing: null });
  const [cpForm, setCpForm] = useState<CampaignForm>(emptyForm());
  const [cpSaving, setCpSaving] = useState(false);
  const [cpError, setCpError] = useState<string | null>(null);
  const openCampaign = (c: Campaign | null) => {
    setCpError(null);
    setCpForm(c ? { sponsorId: c.sponsorId, title: c.title, description: c.description, ctaLabel: c.ctaLabel, ctaType: c.ctaType, ctaTarget: c.ctaTarget ?? '', audience: c.audience, startsAt: toLocalInput(c.startsAt), endsAt: toLocalInput(c.endsAt), priority: c.priority, frequencyHours: c.frequencyHours, maxImpressionsPerUser: c.maxImpressionsPerUser } : emptyForm(sponsors.find((s) => s.active)?.id ?? ''));
    setCpDialog({ open: true, editing: c });
  };
  const saveCampaign = async () => {
    setCpSaving(true); setCpError(null);
    try {
      const body = { ...cpForm, startsAt: cpForm.startsAt ? new Date(cpForm.startsAt).toISOString() : null, endsAt: cpForm.endsAt ? new Date(cpForm.endsAt).toISOString() : null };
      const url = cpDialog.editing ? `${API_URL}/admin/campaigns/${cpDialog.editing.id}` : `${API_URL}/admin/campaigns`;
      const r = await fetch(url, { method: cpDialog.editing ? 'PATCH' : 'POST', headers: JH(), body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setCpError(d?.error || 'Falha ao salvar campanha'); return; }
      notify(cpDialog.editing ? 'Campanha atualizada' : 'Rascunho criado — publique quando estiver pronto', { type: 'success' });
      setCpDialog({ open: false, editing: null });
      await load();
    } finally { setCpSaving(false); }
  };

  // ── transições ──
  const [confirm, setConfirm] = useState<{ open: boolean; title: string; desc: string; label: string; tone: 'danger' | 'primary'; run: () => Promise<void> } | null>(null);
  const [acting, setActing] = useState(false);
  const action = async (c: Campaign, act: 'publish' | 'pause' | 'end' | 'delete') => {
    const r = await fetch(`${API_URL}/admin/campaigns/${c.id}${act === 'delete' ? '' : `/${act}`}`, { method: act === 'delete' ? 'DELETE' : 'POST', headers: H() });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { notify(d?.error || 'Ação não permitida', { type: 'error' }); return; }
    notify({ publish: 'Campanha publicada', pause: 'Campanha pausada', end: 'Campanha encerrada', delete: 'Rascunho excluído' }[act], { type: 'success' });
    await load();
  };
  const ask = (c: Campaign, act: 'publish' | 'pause' | 'end' | 'delete') => {
    const map = {
      publish: { title: c.effectiveStatus === 'paused' ? 'Retomar campanha?' : 'Publicar campanha?', desc: c.startsAt && new Date(c.startsAt) > new Date() ? `Fica AGENDADA e começa em ${fmtDate(c.startsAt)}.` : 'Passa a aparecer para o público escolhido a partir de agora, respeitando a frequência por usuário.', label: 'Publicar', tone: 'primary' as const },
      pause: { title: 'Pausar campanha?', desc: 'Para de aparecer imediatamente. Você pode retomar depois.', label: 'Pausar', tone: 'primary' as const },
      end: { title: 'Encerrar campanha?', desc: 'Encerramento é definitivo (histórico e métricas ficam). Para rodar de novo, crie outra campanha.', label: 'Encerrar', tone: 'danger' as const },
      delete: { title: 'Excluir rascunho?', desc: 'O rascunho some para sempre.', label: 'Excluir', tone: 'danger' as const },
    }[act];
    setConfirm({ open: true, ...map, run: () => action(c, act) });
  };

  // ── prévia ──
  const [preview, setPreview] = useState<Campaign | null>(null);

  // ── settings (kill-switch + intervalo global) ──
  const saveSettingsNow = async (patch: Partial<AdsSettings>) => {
    setSavingSettings(true);
    try {
      const next = { ...settings, ...patch };
      const r = await fetch(`${API_URL}/admin/config/costs`, { method: 'PATCH', headers: JH(), body: JSON.stringify({ category: 'sponsorAds', enabled: next.enabled ? 1 : 0, globalIntervalHours: next.globalIntervalHours, bootDelayMs: next.bootDelayMs }) });
      if (!r.ok) { notify('Falha ao salvar configuração', { type: 'error' }); return; }
      setSettings(next);
      notify('Configuração salva (vale imediatamente)', { type: 'success' });
    } finally { setSavingSettings(false); }
  };

  const totals = useMemo(() => campaigns.reduce((a, c) => ({ impressions: a.impressions + (c.metrics?.impressions ?? 0), clicks: a.clicks + (c.metrics?.clicks ?? 0), active: a.active + (c.effectiveStatus === 'active' ? 1 : 0) }), { impressions: 0, clicks: 0, active: 0 }), [campaigns]);

  if (loading && sponsors.length === 0 && campaigns.length === 0) return <TabLoader />;
  if (error) return <SectionError message={error} onRetry={load} />;

  return (
    <Stack spacing={2.5} data-testid="admin-sponsors">
      {/* Cabeçalho + resumo */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
        <Box>
          <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 20, color: 'text.primary' }}>Patrocinadores & Campanhas</Typography>
          <Typography variant="body2" color="text.secondary">Popup discreto pós-login. Público só por perfil de acesso — nunca por exame, diagnóstico ou medicação.</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button size="small" startIcon={<RefreshIcon />} onClick={load} sx={{ textTransform: 'none', fontWeight: 700 }}>Atualizar</Button>
          <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => openCampaign(null)} disabled={sponsors.length === 0} data-testid="new-campaign"
            sx={{ textTransform: 'none', fontWeight: 800, borderRadius: '10px', background: 'linear-gradient(135deg,#20b2aa,#178f89)' }}>Nova campanha</Button>
        </Stack>
      </Box>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Ativas agora', value: totals.active, badge: 'success-light' as const },
          { label: 'Impressões', value: totals.impressions, badge: 'info-light' as const },
          { label: 'Cliques', value: totals.clicks, badge: 'primary-light' as const },
          { label: 'CTR geral', value: totals.impressions ? `${Math.round((totals.clicks / totals.impressions) * 1000) / 10}%` : '—', badge: 'warning-light' as const },
        ].map((k) => (
          <Frame key={k.label} spacing="sm"><FramePanel className="flex flex-col gap-1">
            <Badge variant={k.badge} size="xs">{k.label}</Badge>
            <span className="text-2xl font-extrabold text-foreground" style={{ fontFamily: 'Poppins, sans-serif' }}>{k.value}</span>
          </FramePanel></Frame>
        ))}
      </div>

      {/* Configuração global */}
      <Frame>
        <FrameHeader><FrameTitle>Regras globais</FrameTitle><FrameDescription>Kill-switch e intervalo mínimo entre popups de qualquer campanha ao mesmo usuário. Vale sem deploy.</FrameDescription></FrameHeader>
        <FramePanel className="flex flex-wrap items-center gap-4">
          <FormControlLabel control={<Switch checked={settings.enabled} disabled={savingSettings} onChange={(e) => saveSettingsNow({ enabled: e.target.checked })} data-testid="ads-enabled" />} label={<Typography sx={{ fontWeight: 700, fontSize: 14 }}>{settings.enabled ? 'Popup ligado' : 'Popup desligado (nenhuma campanha aparece)'}</Typography>} />
          <TextField size="small" type="number" label="Intervalo global (horas)" value={settings.globalIntervalHours} sx={{ ...fieldSx, width: 200 }}
            onChange={(e) => setSettings((s) => ({ ...s, globalIntervalHours: Math.max(0, Number(e.target.value) || 0) }))}
            onBlur={() => saveSettingsNow({})} slotProps={{ htmlInput: { min: 0, max: 8760 } }} />
        </FramePanel>
      </Frame>

      {/* Patrocinadores */}
      <Frame>
        <FrameHeader className="flex items-center justify-between">
          <div><FrameTitle>Patrocinadores</FrameTitle><FrameDescription>Marca, site e logo. Patrocinador inativo não publica campanha.</FrameDescription></div>
          <Button size="small" startIcon={<AddIcon />} onClick={() => openSponsor(null)} data-testid="new-sponsor" sx={{ textTransform: 'none', fontWeight: 700 }}>Novo</Button>
        </FrameHeader>
        <FramePanel className="p-0">
          {sponsors.length === 0 && <Typography sx={{ p: 2.5, color: 'text.secondary', fontSize: 14 }}>Nenhum patrocinador ainda. Cadastre o primeiro para criar campanhas.</Typography>}
          {sponsors.map((s) => (
            <div key={s.id} className="flex items-center gap-3 border-b border-border/70 p-3 last:border-b-0" data-testid={`sponsor-row-${s.id}`}>
              <SponsorLogo src={s.logoUrl ? `${API_URL}${s.logoUrl}` : null} name={s.name} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-foreground">{s.name}</span>
                  <Badge variant={s.active ? 'success-light' : 'invert-light'} size="xs">{s.active ? 'Ativo' : 'Inativo'}</Badge>
                  {!!s.campaignCount && <Badge variant="primary-light" size="xs">{s.campaignCount} campanha{s.campaignCount === 1 ? '' : 's'}</Badge>}
                </div>
                <div className="truncate text-xs text-muted-foreground">{s.website || 'sem site'}{s.notes ? ` · ${s.notes}` : ''}</div>
              </div>
              <UploadButton label={s.logoUrl ? 'Trocar logo' : 'Subir logo'} onFile={(f) => uploadAsset('sponsor', s.id, f)} />
              <IconButton size="small" aria-label="Editar patrocinador" onClick={() => openSponsor(s)}><EditOutlinedIcon fontSize="small" /></IconButton>
            </div>
          ))}
        </FramePanel>
      </Frame>

      {/* Campanhas */}
      <Frame>
        <FrameHeader><FrameTitle>Campanhas</FrameTitle><FrameDescription>CTR = impressões com clique ÷ impressões efetivas (1 clique por impressão; a prévia não conta).</FrameDescription></FrameHeader>
        <FramePanel className="p-0">
          {campaigns.length === 0 && (
            <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
              <CampaignOutlinedIcon sx={{ fontSize: 36, opacity: .5 }} />
              <Typography sx={{ fontSize: 14, mt: 1 }}>Nenhuma campanha. Crie um rascunho, veja a prévia e publique.</Typography>
            </Box>
          )}
          {campaigns.map((c) => (
            <div key={c.id} className="flex flex-col gap-2 border-b border-border/70 p-3 last:border-b-0 sm:flex-row sm:items-center" data-testid={`campaign-row-${c.id}`}>
              <SponsorLogo src={c.sponsor?.logoUrl ? `${API_URL}${c.sponsor.logoUrl}` : null} name={c.sponsor?.name ?? '?'} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-foreground">{c.title}</span>
                  <Badge variant={STATUS_BADGE[c.effectiveStatus]} size="xs" data-testid="campaign-status">{STATUS_LABEL[c.effectiveStatus]}</Badge>
                  <Badge variant="invert-outline" size="xs">{AUDIENCE_LABEL[c.audience]}</Badge>
                  {c.priority > 0 && <Badge variant="warning-outline" size="xs">prioridade {c.priority}</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {c.sponsor?.name} · {c.startsAt || c.endsAt ? `${fmtDate(c.startsAt)} → ${fmtDate(c.endsAt)}` : 'sem período'} · a cada {c.frequencyHours}h · máx {c.maxImpressionsPerUser || '∞'}/usuário
                </div>
                {c.metrics && (
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                    <span><b>{c.metrics.impressions}</b> impressões</span>
                    <span><b>{c.metrics.reach}</b> usuários</span>
                    <span><b>{c.metrics.clicks}</b> cliques</span>
                    <span><b>{c.metrics.dismisses}</b> dispensas</span>
                    <span>CTR <b>{c.metrics.ctr}%</b></span>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Tooltip title="Prévia mobile/desktop (não conta impressão)"><IconButton size="small" onClick={() => setPreview(c)} aria-label="Prévia" data-testid="campaign-preview"><VisibilityOutlinedIcon fontSize="small" /></IconButton></Tooltip>
                {c.effectiveStatus !== 'ended' && <Tooltip title="Editar"><IconButton size="small" onClick={() => openCampaign(c)} aria-label="Editar"><EditOutlinedIcon fontSize="small" /></IconButton></Tooltip>}
                {c.effectiveStatus !== 'ended' && <UploadButton label={c.imageUrl ? 'Trocar imagem' : 'Imagem'} icon onFile={(f) => uploadAsset('campaign', c.id, f)} />}
                {(c.effectiveStatus === 'draft' || c.effectiveStatus === 'paused') && (
                  <Button size="small" variant="contained" startIcon={<PlayArrowRoundedIcon />} onClick={() => ask(c, 'publish')} data-testid="campaign-publish"
                    sx={{ textTransform: 'none', fontWeight: 800, borderRadius: '10px', bgcolor: '#20b2aa', '&:hover': { bgcolor: '#178f89' } }}>{c.effectiveStatus === 'paused' ? 'Retomar' : 'Publicar'}</Button>
                )}
                {(c.effectiveStatus === 'active' || c.effectiveStatus === 'scheduled') && (
                  <Button size="small" variant="outlined" startIcon={<PauseRoundedIcon />} onClick={() => ask(c, 'pause')} data-testid="campaign-pause" sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '10px' }}>Pausar</Button>
                )}
                {c.effectiveStatus !== 'ended' && c.effectiveStatus !== 'draft' && (
                  <Button size="small" variant="text" color="error" startIcon={<StopRoundedIcon />} onClick={() => ask(c, 'end')} data-testid="campaign-end" sx={{ textTransform: 'none', fontWeight: 700 }}>Encerrar</Button>
                )}
                {c.effectiveStatus === 'draft' && (
                  <Tooltip title="Excluir rascunho"><IconButton size="small" color="error" onClick={() => ask(c, 'delete')} aria-label="Excluir rascunho"><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
                )}
              </div>
            </div>
          ))}
        </FramePanel>
      </Frame>

      {/* Dialog patrocinador */}
      <Dialog open={spDialog.open} onClose={() => setSpDialog({ open: false, editing: null })} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif' }}>{spDialog.editing ? 'Editar patrocinador' : 'Novo patrocinador'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField label="Nome" value={spForm.name} onChange={(e) => setSpForm({ ...spForm, name: e.target.value })} fullWidth sx={fieldSx} slotProps={{ htmlInput: { maxLength: 80, 'data-testid': 'sponsor-name' } }} />
            <TextField label="Site (https://…)" value={spForm.website} onChange={(e) => setSpForm({ ...spForm, website: e.target.value })} fullWidth sx={fieldSx} />
            <TextField label="Notas internas" value={spForm.notes} onChange={(e) => setSpForm({ ...spForm, notes: e.target.value })} fullWidth multiline minRows={2} sx={fieldSx} />
            <FormControlLabel control={<Switch checked={spForm.active} onChange={(e) => setSpForm({ ...spForm, active: e.target.checked })} />} label="Ativo" />
            {spDialog.editing && <Typography variant="caption" color="text.secondary">Logo: use "Subir logo" na lista (JPG/PNG, recorte quadrado automático).</Typography>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSpDialog({ open: false, editing: null })} sx={{ textTransform: 'none' }}>Cancelar</Button>
          <Button variant="contained" onClick={saveSponsor} disabled={spSaving || spForm.name.trim().length < 2} data-testid="sponsor-save" sx={{ textTransform: 'none', fontWeight: 800, borderRadius: '10px', bgcolor: '#20b2aa' }}>{spSaving ? 'Salvando…' : 'Salvar'}</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog campanha */}
      <Dialog open={cpDialog.open} onClose={() => setCpDialog({ open: false, editing: null })} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif' }}>{cpDialog.editing ? 'Editar campanha' : 'Nova campanha'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            {cpError && <Alert severity="error" sx={{ borderRadius: '12px' }} data-testid="campaign-error">{cpError}</Alert>}
            <TextField select label="Patrocinador" value={cpForm.sponsorId} onChange={(e) => setCpForm({ ...cpForm, sponsorId: e.target.value })} fullWidth sx={fieldSx} slotProps={{ htmlInput: { 'data-testid': 'campaign-sponsor' } }}>
              {sponsors.map((s) => <MenuItem key={s.id} value={s.id} disabled={!s.active}>{s.name}{s.active ? '' : ' (inativo)'}</MenuItem>)}
            </TextField>
            <TextField label="Título (curto)" value={cpForm.title} onChange={(e) => setCpForm({ ...cpForm, title: e.target.value })} fullWidth sx={fieldSx} helperText={`${cpForm.title.length}/60`} slotProps={{ htmlInput: { maxLength: 60, 'data-testid': 'campaign-title' } }} />
            <TextField label="Descrição (objetiva)" value={cpForm.description} onChange={(e) => setCpForm({ ...cpForm, description: e.target.value })} fullWidth multiline minRows={2} sx={fieldSx} helperText={`${cpForm.description.length}/220`} slotProps={{ htmlInput: { maxLength: 220, 'data-testid': 'campaign-description' } }} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Texto do botão" value={cpForm.ctaLabel} onChange={(e) => setCpForm({ ...cpForm, ctaLabel: e.target.value })} sx={{ ...fieldSx, flex: 1 }} slotProps={{ htmlInput: { maxLength: 24 } }} />
              <TextField select label="Destino" value={cpForm.ctaType} onChange={(e) => setCpForm({ ...cpForm, ctaType: e.target.value as Campaign['ctaType'] })} sx={{ ...fieldSx, flex: 1 }}>
                <MenuItem value="none">Sem botão (só fechar)</MenuItem>
                <MenuItem value="internal">Tela do app (rota interna)</MenuItem>
                <MenuItem value="external">Site externo (https)</MenuItem>
              </TextField>
            </Stack>
            {cpForm.ctaType !== 'none' && (
              <TextField label={cpForm.ctaType === 'internal' ? 'Rota interna (ex.: /planos)' : 'URL externa (https://…)'} value={cpForm.ctaTarget} onChange={(e) => setCpForm({ ...cpForm, ctaTarget: e.target.value })} fullWidth sx={fieldSx}
                helperText={cpForm.ctaType === 'external' ? 'No app Android abre no navegador seguro (Custom Tab); na web, em nova aba.' : 'Navega dentro do app sem recarregar.'} slotProps={{ htmlInput: { 'data-testid': 'campaign-target' } }} />
            )}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField select label="Público" value={cpForm.audience} onChange={(e) => setCpForm({ ...cpForm, audience: e.target.value as Campaign['audience'] })} sx={{ ...fieldSx, flex: 1 }}>
                <MenuItem value="patient">Pacientes</MenuItem><MenuItem value="doctor">Médicos</MenuItem><MenuItem value="all">Todos</MenuItem>
              </TextField>
              <TextField type="number" label="Prioridade" value={cpForm.priority} onChange={(e) => setCpForm({ ...cpForm, priority: Number(e.target.value) || 0 })} sx={{ ...fieldSx, flex: 1 }} helperText="Maior ganha quando há várias ativas" slotProps={{ htmlInput: { min: 0, max: 1000 } }} />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField type="datetime-local" label="Início" value={cpForm.startsAt} onChange={(e) => setCpForm({ ...cpForm, startsAt: e.target.value })} sx={{ ...fieldSx, flex: 1 }} slotProps={{ inputLabel: { shrink: true } }} helperText="Vazio = imediato ao publicar" />
              <TextField type="datetime-local" label="Término" value={cpForm.endsAt} onChange={(e) => setCpForm({ ...cpForm, endsAt: e.target.value })} sx={{ ...fieldSx, flex: 1 }} slotProps={{ inputLabel: { shrink: true } }} helperText="Vazio = até encerrar manualmente" />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField type="number" label="Intervalo por usuário (horas)" value={cpForm.frequencyHours} onChange={(e) => setCpForm({ ...cpForm, frequencyHours: Number(e.target.value) || 0 })} sx={{ ...fieldSx, flex: 1 }} slotProps={{ htmlInput: { min: 0 } }} />
              <TextField type="number" label="Máx. exibições por usuário" value={cpForm.maxImpressionsPerUser} onChange={(e) => setCpForm({ ...cpForm, maxImpressionsPerUser: Number(e.target.value) || 0 })} sx={{ ...fieldSx, flex: 1 }} helperText="0 = sem limite" slotProps={{ htmlInput: { min: 0 } }} />
            </Stack>
            <Typography variant="caption" color="text.secondary">Imagem da campanha (opcional): salve primeiro, depois use "Imagem" na lista. Sem imagem, o popup usa o logo do patrocinador.</Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCpDialog({ open: false, editing: null })} sx={{ textTransform: 'none' }}>Cancelar</Button>
          <Button variant="contained" onClick={saveCampaign} disabled={cpSaving} data-testid="campaign-save" sx={{ textTransform: 'none', fontWeight: 800, borderRadius: '10px', bgcolor: '#20b2aa' }}>{cpSaving ? 'Salvando…' : cpDialog.editing ? 'Salvar' : 'Criar rascunho'}</Button>
        </DialogActions>
      </Dialog>

      {preview && <PreviewDialog campaign={preview} onClose={() => setPreview(null)} />}

      {confirm && (
        <ConfirmDialog open={confirm.open} title={confirm.title} desc={confirm.desc} confirmLabel={confirm.label} tone={confirm.tone} loading={acting}
          onClose={() => setConfirm(null)}
          onConfirm={async () => { setActing(true); try { await confirm.run(); } finally { setActing(false); setConfirm(null); } }} />
      )}
    </Stack>
  );
};

const SponsorLogo = ({ src, name }: { src: string | null; name: string }) => (
  <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-card">
    {src ? <img src={src} alt="" className="size-full object-cover" /> : <span className="text-base font-extrabold text-primary" style={{ fontFamily: 'Poppins, sans-serif' }}>{name.charAt(0).toUpperCase()}</span>}
  </div>
);

const UploadButton = ({ label, icon = false, onFile }: { label: string; icon?: boolean; onFile: (f: File) => void }) => {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      {icon
        ? <Tooltip title={label}><IconButton size="small" onClick={() => ref.current?.click()} aria-label={label}><ImageOutlinedIcon fontSize="small" /></IconButton></Tooltip>
        : <Button size="small" variant="outlined" startIcon={<ImageOutlinedIcon />} onClick={() => ref.current?.click()} sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '10px', whiteSpace: 'nowrap' }}>{label}</Button>}
    </>
  );
};

/** Prévia FIEL (mesmo SponsorCard + mesmo "vidro" do popup) em moldura mobile ou desktop. Não dispara evento algum. */
const PreviewDialog = ({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) => {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile');
  const client: ClientCampaign = { id: campaign.id, title: campaign.title, description: campaign.description, ctaLabel: campaign.ctaLabel, ctaType: campaign.ctaType, ctaTarget: campaign.ctaTarget, imageUrl: campaign.imageUrl, sponsor: { id: campaign.sponsorId, name: campaign.sponsor?.name ?? '', logoUrl: campaign.sponsor?.logoUrl ?? null } };
  const frameW = device === 'mobile' ? 390 : 960;
  return (
    <Dialog open onClose={onClose} maxWidth={device === 'mobile' ? 'xs' : 'lg'} fullWidth PaperProps={{ sx: { borderRadius: '16px', bgcolor: 'background.paper' } }} data-testid="campaign-preview-dialog">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, fontWeight: 800, fontFamily: 'Poppins, sans-serif' }}>
        Prévia · {campaign.title}
        <ToggleButtonGroup size="small" exclusive value={device} onChange={(_, v) => v && setDevice(v)}>
          <ToggleButton value="mobile" aria-label="Prévia mobile"><PhoneIphoneIcon fontSize="small" /></ToggleButton>
          <ToggleButton value="desktop" aria-label="Prévia desktop"><LaptopMacIcon fontSize="small" /></ToggleButton>
        </ToggleButtonGroup>
      </DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ borderRadius: '12px', mb: 2 }}>A prévia não conta como impressão nem clique. É exatamente o que o usuário vê sobre a tela principal.</Alert>
        <Box sx={{ mx: 'auto', width: '100%', maxWidth: frameW, aspectRatio: device === 'mobile' ? '390 / 760' : '16 / 10', borderRadius: device === 'mobile' ? '32px' : '14px', border: '10px solid', borderColor: dark ? '#0b1212' : '#1f2937', overflow: 'hidden', position: 'relative',
          background: dark ? 'linear-gradient(180deg,#0f1818,#13201f)' : 'linear-gradient(180deg,#eef7f6,#dcefed)' }}>
          {/* "tela principal" atrás, desfocada como no app */}
          <Box aria-hidden sx={{ position: 'absolute', inset: 0, p: 2, opacity: .55, filter: 'blur(1px)' }}>
            {[72, 120, 90, 140].map((h, i) => <Box key={i} sx={{ height: h, borderRadius: '16px', bgcolor: dark ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.75)', mb: 1.5 }} />)}
          </Box>
          <Box sx={{ position: 'absolute', inset: 0, bgcolor: dark ? 'rgba(4,10,10,.55)' : 'rgba(15,40,38,.35)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', p: 2 }}>
            <Box sx={{ ...glassPaperSx(dark, false), width: '100%', maxWidth: 400 }}>
              <SponsorCard campaign={client} variant="preview" logoSrc={client.sponsor.logoUrl ? `${API_URL}${client.sponsor.logoUrl}` : null} imageSrc={client.imageUrl ? `${API_URL}${client.imageUrl}` : null} onPrimary={() => {}} onClose={() => {}} />
            </Box>
          </Box>
        </Box>
        <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap' }}>
          <Chip size="small" label={`Destino: ${campaign.ctaType === 'none' ? 'sem botão' : campaign.ctaTarget}`} />
          <Chip size="small" label={`Público: ${AUDIENCE_LABEL[campaign.audience]}`} />
          <Chip size="small" label={`Status: ${STATUS_LABEL[campaign.effectiveStatus]}`} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={onClose} sx={{ textTransform: 'none', fontWeight: 700 }}>Fechar</Button></DialogActions>
    </Dialog>
  );
};
