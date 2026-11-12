import { useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import BlockIcon from '@mui/icons-material/Block';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { API_URL, token, doctorPhotoUrl } from '../../config';
import { TabLoader, SectionError, PhotoZoom } from './parts';
import { DoctorVerificationPanel, IdentityChip } from './DoctorVerificationPanel';
import { useReuiThemeSync } from '@/components/reui/useReuiThemeSync';
import {
  Frame,
  FrameHeader,
  FrameTitle,
  FrameDescription,
  FramePanel,
} from '@/components/reui/frame';
import { Badge as ReuiBadge } from '@/components/reui/badge';
import {
  Alert,
  AlertTitle,
  AlertDescription,
  AlertAction,
} from '@/components/reui/alert';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import { IconTile } from '@/components/reui/patterns';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  ReuiTextarea,
} from '@/components/reui/form-controls';
import { FirstAidKitIcon } from '@/components/reui/icons';
import { snackbar } from '../../components/ConfirmDialog';

const H = () => ({
  Authorization: `Bearer ${token()}`,
  'Content-Type': 'application/json',
});

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
  /** Verificação de identidade (UaiID). Ausente (server antigo) = chip escondido. */
  verificationStatus?: string | null;
}

/** Gestão de médicos — ReUI Frame, InputGroup, Badge, Alert e controle de bloqueio administrativo. */
export const DoctorsTab = () => {
  const themeClass = useReuiThemeSync();
  const [data, setData] = useState<{
    doctors: AdminDoctor[];
    total: number;
  } | null>(null);
  const [err, setErr] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<
    'ALL' | 'ACTIVE' | 'BLOCKED' | 'VERIFIED' | 'PENDING'
  >('ALL');

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
      const res = await fetch(
        `${API_URL}/admin/doctors/${blockTarget.id}/block`,
        {
          method: 'POST',
          headers: H(),
          body: JSON.stringify({ reason: blockReason }),
        }
      );
      if (!res.ok) throw new Error('Falha ao bloquear o médico.');
      await res.json();
      setFeedback(`Acesso de ${blockTarget.name} bloqueado com sucesso.`);
      setBlockTarget(null);
      setBlockReason('');
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          doctors: prev.doctors.map((doc) =>
            doc.id === blockTarget.id
              ? {
                  ...doc,
                  blocked: true,
                  blockedAt: new Date().toISOString(),
                  blockedReason: blockReason || null,
                }
              : doc
          ),
        };
      });
    } catch (e: any) {
      snackbar({ message: e?.message ?? 'Erro ao bloquear.', severity: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnblockConfirm = async () => {
    if (!unblockTarget) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `${API_URL}/admin/doctors/${unblockTarget.id}/unblock`,
        {
          method: 'POST',
          headers: H(),
        }
      );
      if (!res.ok) throw new Error('Falha ao desbloquear o médico.');
      setFeedback(`Acesso de ${unblockTarget.name} restaurado.`);
      setUnblockTarget(null);
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          doctors: prev.doctors.map((doc) =>
            doc.id === unblockTarget.id
              ? {
                  ...doc,
                  blocked: false,
                  blockedAt: null,
                  blockedReason: null,
                }
              : doc
          ),
        };
      });
    } catch (e: any) {
      snackbar({ message: e?.message ?? 'Erro ao desbloquear.', severity: 'error' });
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
      if (filter === 'ACTIVE' && doc.blocked) return false;
      if (filter === 'BLOCKED' && !doc.blocked) return false;
      if (filter === 'VERIFIED' && !doc.emailVerified) return false;
      if (filter === 'PENDING' && doc.emailVerified) return false;

      if (!q) return true;
      const matchName = doc.name.toLowerCase().includes(q);
      const matchCrm = doc.crm.toLowerCase().includes(q);
      const matchSpecialty = (doc.specialty || '').toLowerCase().includes(q);
      const matchEmail = (doc.email || '').toLowerCase().includes(q);
      return matchName || matchCrm || matchSpecialty || matchEmail;
    });
  }, [doctorsList, search, filter]);

  if (!data && !err) return <TabLoader />;
  if (err)
    return (
      <SectionError
        message="Não foi possível carregar os médicos."
        onRetry={load}
      />
    );

  const filterPills: Array<{
    key: 'ALL' | 'ACTIVE' | 'BLOCKED' | 'VERIFIED' | 'PENDING';
    label: string;
    count: number;
  }> = [
    { key: 'ALL', label: 'Todos', count: counts.all },
    { key: 'ACTIVE', label: 'Ativos', count: counts.active },
    { key: 'BLOCKED', label: '⛔ Bloqueados', count: counts.blocked },
    { key: 'VERIFIED', label: '✓ E-mail verificado', count: counts.verified },
    { key: 'PENDING', label: 'Pendentes', count: counts.pending },
  ];

  return (
    <div className={`reui-scope ${themeClass} space-y-4`}>
      {/* Verificação de identidade UaiID */}
      <DoctorVerificationPanel onChanged={load} />

      {feedback && (
        <Alert variant="success">
          <CheckCircleOutlineIcon sx={{ fontSize: 18 }} />
          <AlertTitle>Operação concluída</AlertTitle>
          <AlertDescription>{feedback}</AlertDescription>
          <AlertAction>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-bold text-foreground hover:bg-muted cursor-pointer"
            >
              Fechar
            </button>
          </AlertAction>
        </Alert>
      )}

      {/* Frame Principal de Médicos & Portais */}
      <Frame>
        <FrameHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <IconTile tone="primary" size="md">
              <FirstAidKitIcon size={20} />
            </IconTile>
            <div>
              <FrameTitle className="flex items-center gap-2">
                Médicos & Portais
                <ReuiBadge variant="primary-light" size="xs">
                  {data!.total} cadastrados
                </ReuiBadge>
              </FrameTitle>
              <FrameDescription>
                Controle de credenciais CRM/UF, fotos de perfil, pacientes vinculados e bloqueio administrativo
              </FrameDescription>
            </div>
          </div>

          <div className="w-full sm:w-80">
            <InputGroup>
              <InputGroupAddon>
                <SearchIcon sx={{ fontSize: 16 }} />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Buscar nome, CRM, especialidade ou e-mail..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </InputGroup>
          </div>
        </FrameHeader>

        <FramePanel className="space-y-3">
          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-1.5">
            {filterPills.map((fp) => {
              const active = filter === fp.key;
              return (
                <button
                  key={fp.key}
                  type="button"
                  onClick={() => setFilter(fp.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                    active
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5'
                  }`}
                >
                  <span>{fp.label}</span>
                  <span
                    className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs font-extrabold tabular-nums ${
                      active
                        ? 'bg-white/25 text-white'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {fp.count}
                  </span>
                </button>
              );
            })}
          </div>

          {filteredDoctors.length === 0 ? (
            <Empty className="border-0 p-6">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FirstAidKitIcon size={22} />
                </EmptyMedia>
                <EmptyTitle>Nenhum médico encontrado</EmptyTitle>
                <EmptyDescription>
                  Ajuste os filtros ou o termo de busca acima para visualizar outros profissionais.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
              {filteredDoctors.map((m) => {
                const docPhoto = m.photoUrl ? doctorPhotoUrl(m.id) : undefined;
                const isBlocked = !!m.blocked;

                return (
                  <div
                    key={m.id}
                    className={`flex flex-col gap-3 p-4 transition sm:flex-row sm:items-center ${
                      isBlocked
                        ? 'bg-destructive/[0.03]'
                        : 'bg-card hover:bg-muted/25'
                    }`}
                  >
                    {/* Foto / Avatar do Médico */}
                    <PhotoZoom
                      src={docPhoto || null}
                      caption={`${m.name} · CRM ${m.crm}${
                        m.crmUf && !String(m.crm).includes('-')
                          ? `-${m.crmUf}`
                          : ''
                      }`}
                    >
                      <Avatar
                        src={docPhoto}
                        alt={m.name}
                        sx={{
                          width: 48,
                          height: 48,
                          borderRadius: '14px',
                          bgcolor: isBlocked
                            ? 'rgba(239,68,68,0.12)'
                            : 'rgba(32,178,170,.12)',
                          color: isBlocked ? '#ef4444' : '#178f89',
                          fontWeight: 800,
                          fontSize: 18,
                          fontFamily: 'Poppins, sans-serif',
                          flexShrink: 0,
                          border: `2px solid ${
                            isBlocked
                              ? 'rgba(239,68,68,0.35)'
                              : 'rgba(32,178,170,.25)'
                          }`,
                        }}
                      >
                        {(m.name || '?').charAt(0).toUpperCase()}
                      </Avatar>
                    </PhotoZoom>

                    {/* Dados do Médico */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-heading text-sm font-extrabold text-foreground">
                          {m.name}
                        </span>
                        {isBlocked ? (
                          <ReuiBadge variant="destructive" size="xs">
                            <BlockIcon sx={{ fontSize: 12 }} />
                            Acesso Bloqueado
                          </ReuiBadge>
                        ) : m.emailVerified ? (
                          <ReuiBadge variant="success-light" size="xs">
                            ✓ E-mail verificado
                          </ReuiBadge>
                        ) : (
                          <ReuiBadge variant="warning-light" size="xs">
                            Pendente
                          </ReuiBadge>
                        )}
                        <IdentityChip status={m.verificationStatus} />
                      </div>

                      <div className="mt-0.5 text-xs font-semibold text-foreground/80">
                        CRM {m.crm}
                        {m.crmUf && !String(m.crm).includes('-')
                          ? `-${m.crmUf}`
                          : ''}
                        {m.specialty ? ` · ${m.specialty}` : ''}
                      </div>

                      <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                        {m.email}
                        {m.createdAt && (
                          <>
                            {' · '}Cadastrado em{' '}
                            {new Date(m.createdAt).toLocaleDateString('pt-BR')}
                          </>
                        )}
                      </div>

                      {isBlocked && (
                        <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
                          <WarningAmberOutlinedIcon sx={{ fontSize: 14 }} />
                          <span>
                            Bloqueado em{' '}
                            {m.blockedAt
                              ? new Date(m.blockedAt).toLocaleDateString(
                                  'pt-BR'
                                )
                              : '—'}
                            {m.blockedReason
                              ? ` · Motivo: "${m.blockedReason}"`
                              : ''}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Métricas e Ações de Bloqueio */}
                    <div className="flex shrink-0 flex-row items-center justify-between gap-2 sm:flex-col sm:items-end">
                      <ReuiBadge
                        variant="outline"
                        size="sm"
                        className="tabular-nums"
                      >
                        {m._count?.shares ?? 0} paciente
                        {m._count?.shares === 1 ? '' : 's'}
                      </ReuiBadge>

                      {isBlocked ? (
                        <button
                          type="button"
                          onClick={() => setUnblockTarget(m)}
                          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-1.5 text-xs font-extrabold text-white shadow-xs transition hover:bg-emerald-700 cursor-pointer"
                        >
                          <LockOpenIcon sx={{ fontSize: 14 }} />
                          Desbloquear acesso
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setBlockTarget(m);
                            setBlockReason('');
                          }}
                          className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/5 px-3.5 py-1.5 text-xs font-bold text-destructive transition hover:bg-destructive/15 cursor-pointer"
                        >
                          <BlockIcon sx={{ fontSize: 14 }} />
                          Bloquear acesso
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </FramePanel>
      </Frame>

      {/* DIÁLOGO: Bloquear Acesso do Médico */}
      <Dialog
        open={!!blockTarget}
        onClose={() => !submitting && setBlockTarget(null)}
        fullWidth
        maxWidth="xs"
      >
        <div className={`reui-scope ${themeClass}`}>
          <DialogTitle
            sx={{
              fontWeight: 800,
              fontFamily: 'Poppins, sans-serif',
              color: 'error.main',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <BlockIcon /> Bloquear Acesso do Médico
          </DialogTitle>
          <DialogContent sx={{ pt: 1 }}>
            <p className="mb-2 text-sm text-foreground">
              Você está prestes a bloquear o acesso de{' '}
              <strong>{blockTarget?.name}</strong> (CRM {blockTarget?.crm}).
            </p>
            <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
              O profissional será <strong>imediatamente impedido de logar</strong>{' '}
              no portal médico e suas sessões ativas serão recusadas. O histórico
              de atendimentos e teleconsultas será mantido.
            </p>
            <ReuiTextarea
              rows={2}
              placeholder="Motivo do bloqueio (opcional / auditoria): Ex. Suspensão pelo CRM, divergência cadastral..."
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button
              onClick={() => setBlockTarget(null)}
              disabled={submitting}
              sx={{
                borderRadius: '10px',
                textTransform: 'none',
                fontWeight: 700,
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={handleBlockConfirm}
              disabled={submitting}
              sx={{
                borderRadius: '10px',
                textTransform: 'none',
                fontWeight: 800,
              }}
            >
              {submitting ? 'Bloqueando…' : 'Confirmar Bloqueio'}
            </Button>
          </DialogActions>
        </div>
      </Dialog>

      {/* DIÁLOGO: Desbloquear Acesso do Médico */}
      <Dialog
        open={!!unblockTarget}
        onClose={() => !submitting && setUnblockTarget(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle
          sx={{
            fontWeight: 800,
            fontFamily: 'Poppins, sans-serif',
            color: 'success.main',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <CheckCircleOutlineIcon /> Desbloquear Acesso do Médico
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <p className="mb-2 text-sm">
            Deseja reativar o acesso de{' '}
            <strong>{unblockTarget?.name}</strong> (CRM {unblockTarget?.crm})?
          </p>
          <p className="text-xs text-muted-foreground">
            O médico voltará a conseguir acessar o portal normalmente e poderá
            realizar atendimentos e teleconsultas.
          </p>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setUnblockTarget(null)}
            disabled={submitting}
            sx={{
              borderRadius: '10px',
              textTransform: 'none',
              fontWeight: 700,
            }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleUnblockConfirm}
            disabled={submitting}
            sx={{
              borderRadius: '10px',
              textTransform: 'none',
              fontWeight: 800,
            }}
          >
            {submitting ? 'Desbloqueando…' : 'Confirmar Desbloqueio'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};
