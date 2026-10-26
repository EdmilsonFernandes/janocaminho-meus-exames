import { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Card, CardContent, Stack, Chip, Avatar, Button,
  TextField, InputAdornment, Dialog, DialogTitle, DialogContent,
  DialogActions, useTheme,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import BlockIcon from '@mui/icons-material/Block';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { API_URL, token, doctorPhotoUrl } from '../../config';
import { TabLoader, SectionError, PhotoZoom } from './parts';
import { tealText } from '../../theme';

const H = () => ({ Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' });

export interface AdminDoctor {
  id: string;
  name: string;
  crm: string;
  crmUf?: string | null;
  specialty?: string | null;
  email: string;
  emailVerified: boolean;
  photoUrl?: string | null;
  createdAt: string;
  blocked?: boolean;
  blockedAt?: string | null;
  blockedReason?: string | null;
  _count?: { shares: number };
}

/** Gestão de médicos — CRM/UF, fotos, bloqueio administrativo, validação e pacientes compartilhados. */
export const DoctorsTab = () => {
  const theme = useTheme();
  const mode = theme.palette.mode as 'light' | 'dark';
  const [data, setData] = useState<{ doctors: AdminDoctor[]; total: number } | null>(null);
  const [err, setErr] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'BLOCKED' | 'VERIFIED' | 'PENDING'>('ALL');

  // Modais de Bloqueio e Desbloqueio
  const [blockTarget, setBlockTarget] = useState<AdminDoctor | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [unblockTarget, setUnblockTarget] = useState<AdminDoctor | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = () => {
    setErr(false);
    fetch(`${API_URL}/admin/doctors`, { headers: H() })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setErr(true));
  };

  useEffect(load, []);

  const handleBlockConfirm = async () => {
    if (!blockTarget) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/admin/doctors/${blockTarget.id}/block`, {
        method: 'POST',
        headers: H(),
        body: JSON.stringify({ reason: blockReason }),
      });
      if (!res.ok) throw new Error('Falha ao bloquear o médico.');
      const resJson = await res.json();
      setFeedback(`Acesso de ${blockTarget.name} bloqueado com sucesso.`);
      setBlockTarget(null);
      setBlockReason('');
      // Atualiza localmente
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          doctors: prev.doctors.map((doc) =>
            doc.id === blockTarget.id
              ? { ...doc, blocked: true, blockedAt: new Date().toISOString(), blockedReason: blockReason || null }
              : doc
          ),
        };
      });
    } catch (e: any) {
      alert(e?.message ?? 'Erro ao bloquear.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnblockConfirm = async () => {
    if (!unblockTarget) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/admin/doctors/${unblockTarget.id}/unblock`, {
        method: 'POST',
        headers: H(),
      });
      if (!res.ok) throw new Error('Falha ao desbloquear o médico.');
      setFeedback(`Acesso de ${unblockTarget.name} restaurado.`);
      setUnblockTarget(null);
      // Atualiza localmente
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          doctors: prev.doctors.map((doc) =>
            doc.id === unblockTarget.id
              ? { ...doc, blocked: false, blockedAt: null, blockedReason: null }
              : doc
          ),
        };
      });
    } catch (e: any) {
      alert(e?.message ?? 'Erro ao desbloquear.');
    } finally {
      setSubmitting(false);
    }
  };

  const doctorsList = data?.doctors || [];

  const counts = useMemo(() => {
    let active = 0;
    let blocked = 0;
    let verified = 0;
    let pending = 0;
    for (const doc of doctorsList) {
      if (doc.blocked) blocked++;
      else active++;
      if (doc.emailVerified) verified++;
      else pending++;
    }
    return { all: doctorsList.length, active, blocked, verified, pending };
  }, [doctorsList]);

  const filteredDoctors = useMemo(() => {
    const q = search.trim().toLowerCase();
    return doctorsList.filter((doc) => {
      // Filtro de status
      if (filter === 'ACTIVE' && doc.blocked) return false;
      if (filter === 'BLOCKED' && !doc.blocked) return false;
      if (filter === 'VERIFIED' && !doc.emailVerified) return false;
      if (filter === 'PENDING' && doc.emailVerified) return false;

      // Busca por texto
      if (!q) return true;
      const matchName = doc.name.toLowerCase().includes(q);
      const matchCrm = doc.crm.toLowerCase().includes(q);
      const matchSpecialty = (doc.specialty || '').toLowerCase().includes(q);
      const matchEmail = (doc.email || '').toLowerCase().includes(q);
      return matchName || matchCrm || matchSpecialty || matchEmail;
    });
  }, [doctorsList, search, filter]);

  if (!data && !err) return <TabLoader />;
  if (err) return <SectionError message="Não foi possível carregar os médicos." onRetry={load} />;

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif' }}>
            🩺 Médicos & Portais ({data!.total})
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Controle de credenciais, fotos de perfil, autorizações e bloqueio administrativo de acesso.
          </Typography>
        </Box>
      </Stack>

      {/* Barra de Filtros e Busca */}
      <Stack spacing={1.5} sx={{ mb: 2.5 }}>
        <TextField
          size="small"
          placeholder="Buscar por nome, CRM, especialidade ou e-mail..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                </InputAdornment>
              ),
            },
          }}
          sx={{
            maxWidth: { xs: '100%', sm: 460 },
            '& .MuiOutlinedInput-root': { borderRadius: '12px', bgcolor: 'background.paper' },
          }}
        />

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip
            size="small"
            label={`Todos (${counts.all})`}
            onClick={() => setFilter('ALL')}
            sx={{
              fontWeight: 800,
              bgcolor: filter === 'ALL' ? 'primary.main' : 'action.hover',
              color: filter === 'ALL' ? '#ffffff' : 'text.primary',
            }}
          />
          <Chip
            size="small"
            label={`Ativos (${counts.active})`}
            onClick={() => setFilter('ACTIVE')}
            sx={{
              fontWeight: 800,
              bgcolor: filter === 'ACTIVE' ? 'rgba(16,185,129,0.18)' : 'action.hover',
              color: filter === 'ACTIVE' ? '#059669' : 'text.primary',
              border: filter === 'ACTIVE' ? '1px solid #10b981' : 'none',
            }}
          />
          <Chip
            size="small"
            label={`⛔ Bloqueados (${counts.blocked})`}
            onClick={() => setFilter('BLOCKED')}
            sx={{
              fontWeight: 800,
              bgcolor: filter === 'BLOCKED' ? 'rgba(239,68,68,0.18)' : 'action.hover',
              color: filter === 'BLOCKED' ? '#dc2626' : 'text.primary',
              border: filter === 'BLOCKED' ? '1px solid #ef4444' : 'none',
            }}
          />
          <Chip
            size="small"
            label={`✓ Verificados (${counts.verified})`}
            onClick={() => setFilter('VERIFIED')}
            sx={{
              fontWeight: 700,
              bgcolor: filter === 'VERIFIED' ? 'rgba(32,178,170,0.18)' : 'action.hover',
              color: filter === 'VERIFIED' ? tealText(mode) : 'text.primary',
            }}
          />
          <Chip
            size="small"
            label={`Pendentes (${counts.pending})`}
            onClick={() => setFilter('PENDING')}
            sx={{
              fontWeight: 700,
              bgcolor: filter === 'PENDING' ? 'rgba(245,158,11,0.18)' : 'action.hover',
              color: filter === 'PENDING' ? '#d97706' : 'text.primary',
            }}
          />
        </Stack>
      </Stack>

      {/* Feedback Toast */}
      {feedback && (
        <Card variant="outlined" sx={{ mb: 2, p: 1.5, borderRadius: '12px', bgcolor: 'rgba(32,178,170,.08)', borderColor: 'rgba(32,178,170,.4)' }}>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
            <Typography sx={{ fontSize: 13.5, color: tealText(mode), fontWeight: 700 }}>{feedback}</Typography>
            <Button size="small" onClick={() => setFeedback(null)} sx={{ textTransform: 'none', minHeight: 'auto', p: 0.5 }}>
              Fechar
            </Button>
          </Stack>
        </Card>
      )}

      {/* Lista de Médicos */}
      <Stack spacing={1.5}>
        {filteredDoctors.map((m, idx) => {
          const docPhoto = m.photoUrl ? doctorPhotoUrl(m.id) : undefined;
          const isBlocked = !!m.blocked;

          return (
            <Card
              key={m.id}
              variant="outlined"
              sx={{
                borderRadius: '16px',
                borderColor: isBlocked ? 'rgba(239,68,68,0.45)' : undefined,
                bgcolor: isBlocked
                  ? (mode === 'dark' ? 'rgba(239,68,68,0.04)' : 'rgba(254,242,242,0.6)')
                  : 'background.paper',
                boxShadow: '0 1px 2px rgba(0,0,0,.03), 0 2px 8px rgba(0,0,0,.04)',
                transition: 'box-shadow .15s, border-color .15s',
                '&:hover': {
                  borderColor: isBlocked ? '#ef4444' : 'rgba(32,178,170,.4)',
                  boxShadow: '0 4px 16px rgba(0,0,0,.06)',
                },
                animation: `docCardIn .3s ease ${idx * 0.04}s both`,
                '@keyframes docCardIn': {
                  from: { opacity: 0, transform: 'translateY(6px)' },
                  to: { opacity: 1, transform: 'translateY(0)' },
                },
              }}
            >
              <CardContent sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'center' }, gap: 2, py: 2, '&:last-child': { pb: 2 } }}>
                {/* Foto / Avatar do Médico */}
                <PhotoZoom
                  src={docPhoto || null}
                  caption={`${m.name} · CRM ${m.crm}${m.crmUf && !String(m.crm).includes('-') ? `-${m.crmUf}` : ''}`}
                >
                  <Avatar
                    src={docPhoto}
                    alt={m.name}
                    sx={{
                      width: 52,
                      height: 52,
                      borderRadius: '14px',
                      bgcolor: isBlocked ? 'rgba(239,68,68,0.12)' : 'rgba(32,178,170,.12)',
                      color: isBlocked ? '#ef4444' : '#178f89',
                      fontWeight: 800,
                      fontSize: 19,
                      fontFamily: 'Poppins, sans-serif',
                      flexShrink: 0,
                      border: `2px solid ${isBlocked ? 'rgba(239,68,68,0.35)' : 'rgba(32,178,170,.25)'}`,
                      boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                    }}
                  >
                    {(m.name || '?').charAt(0).toUpperCase()}
                  </Avatar>
                </PhotoZoom>

                {/* Dados do Médico */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                    <Typography sx={{ fontWeight: 800, fontSize: 16, fontFamily: 'Poppins, sans-serif' }}>
                      {m.name}
                    </Typography>
                    {isBlocked ? (
                      <Chip
                        size="small"
                        icon={<BlockIcon sx={{ fontSize: '13px !important' }} />}
                        label="Acesso Bloqueado"
                        color="error"
                        sx={{ height: 22, fontSize: 11.5, fontWeight: 800 }}
                      />
                    ) : (
                      m.emailVerified ? (
                        <Chip
                          size="small"
                          label="✓ Verificado"
                          color="success"
                          sx={{ height: 22, fontSize: 11.5, fontWeight: 700 }}
                        />
                      ) : (
                        <Chip
                          size="small"
                          label="Pendente"
                          color="warning"
                          sx={{ height: 22, fontSize: 11.5, fontWeight: 700 }}
                        />
                      )
                    )}
                  </Stack>

                  <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600, mt: 0.25 }}>
                    CRM {m.crm}{m.crmUf && !String(m.crm).includes('-') ? `-${m.crmUf}` : ''}{m.specialty ? ` · ${m.specialty}` : ''}
                  </Typography>

                  <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block' }}>
                    {m.email}
                  </Typography>

                  {m.createdAt && (
                    <Typography variant="caption" sx={{ display: 'block', fontSize: 11.5, color: 'text.disabled', mt: 0.25 }}>
                      Cadastrado em {new Date(m.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </Typography>
                  )}

                  {isBlocked && (
                    <Box sx={{ mt: 0.75, p: 0.75, px: 1.25, borderRadius: '8px', bgcolor: 'rgba(239,68,68,0.1)', display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                      <WarningAmberOutlinedIcon sx={{ fontSize: 15, color: '#ef4444' }} />
                      <Typography sx={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
                        Bloqueado em {m.blockedAt ? new Date(m.blockedAt).toLocaleDateString('pt-BR') : '—'}
                        {m.blockedReason ? ` · Motivo: "${m.blockedReason}"` : ''}
                      </Typography>
                    </Box>
                  )}
                </Box>

                {/* Métricas e Ações de Bloqueio */}
                <Stack spacing={1.25} alignItems={{ xs: 'flex-start', sm: 'flex-end' }} sx={{ width: { xs: '100%', sm: 'auto' } }}>
                  <Chip
                    size="small"
                    label={`${m._count?.shares ?? 0} paciente${m._count?.shares === 1 ? '' : 's'}`}
                    sx={{ fontWeight: 800, height: 24, fontSize: 12 }}
                  />

                  {/* Botão de Bloquear / Desbloquear */}
                  {isBlocked ? (
                    <Button
                      variant="contained"
                      size="small"
                      color="success"
                      startIcon={<LockOpenIcon />}
                      onClick={() => setUnblockTarget(m)}
                      sx={{
                        borderRadius: '999px',
                        textTransform: 'none',
                        fontWeight: 800,
                        fontSize: 12.5,
                        px: 2,
                        width: { xs: '100%', sm: 'auto' },
                      }}
                    >
                      Desbloquear acesso
                    </Button>
                  ) : (
                    <Button
                      variant="outlined"
                      size="small"
                      color="error"
                      startIcon={<BlockIcon />}
                      onClick={() => { setBlockTarget(m); setBlockReason(''); }}
                      sx={{
                        borderRadius: '999px',
                        textTransform: 'none',
                        fontWeight: 800,
                        fontSize: 12.5,
                        px: 2,
                        width: { xs: '100%', sm: 'auto' },
                        borderColor: 'rgba(239,68,68,0.5)',
                        '&:hover': { bgcolor: 'rgba(239,68,68,0.06)', borderColor: '#ef4444' },
                      }}
                    >
                      Bloquear acesso
                    </Button>
                  )}
                </Stack>
              </CardContent>
            </Card>
          );
        })}

        {filteredDoctors.length === 0 && (
          <Card variant="outlined" sx={{ py: 6, textAlign: 'center', borderRadius: '16px' }}>
            <Typography variant="body1" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              Nenhum médico encontrado para os critérios selecionados.
            </Typography>
          </Card>
        )}
      </Stack>

      {/* DIÁLOGO: Bloquear Acesso do Médico */}
      <Dialog open={!!blockTarget} onClose={() => !submitting && setBlockTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', color: 'error.main', display: 'flex', alignItems: 'center', gap: 1 }}>
          <BlockIcon /> Bloquear Acesso do Médico
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            Você está prestes a bloquear o acesso de <strong>{blockTarget?.name}</strong> (CRM {blockTarget?.crm}).
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            O profissional será <strong>imediatamente impedido de logar</strong> no portal médico e suas sessões ativas serão recusadas. O histórico de atendimentos e teleconsultas será mantido.
          </Typography>
          <TextField
            fullWidth
            size="small"
            label="Motivo do bloqueio (opcional / auditoria)"
            placeholder="Ex: Suspensão pelo CRM, divergência cadastral, etc."
            value={blockReason}
            onChange={(e) => setBlockReason(e.target.value)}
            multiline
            rows={2}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setBlockTarget(null)} disabled={submitting} sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 700 }}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleBlockConfirm}
            disabled={submitting}
            sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 800 }}
          >
            {submitting ? 'Bloqueando…' : 'Confirmar Bloqueio'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* DIÁLOGO: Desbloquear Acesso do Médico */}
      <Dialog open={!!unblockTarget} onClose={() => !submitting && setUnblockTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 800, fontFamily: 'Poppins, sans-serif', color: 'success.main', display: 'flex', alignItems: 'center', gap: 1 }}>
          <CheckCircleOutlineIcon /> Desbloquear Acesso do Médico
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            Deseja reativar o acesso de <strong>{unblockTarget?.name}</strong> (CRM {unblockTarget?.crm})?
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            O médico voltará a conseguir acessar o portal normalmente e poderá realizar atendimentos e teleconsultas.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setUnblockTarget(null)} disabled={submitting} sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 700 }}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleUnblockConfirm}
            disabled={submitting}
            sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 800 }}
          >
            {submitting ? 'Desbloqueando…' : 'Confirmar Desbloqueio'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
