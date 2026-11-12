import { Avatar } from '@mui/material';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
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
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import { IconTile } from '@/components/reui/patterns';
import { CopyableInput } from '@/components/reui/form-controls';

export interface InviteItem {
  id: string;
  patientName?: string;
  phone?: string;
  email?: string;
  status: string;
  token: string;
  createdAt?: string;
  acceptedAt?: string;
}

/** View CONVITES do portal — ReUI Frame + CopyableInput (c-input-group-11). */
export const PortalInvites = ({
  invites,
  doctorName,
  onNewInvite,
  onCancel,
  linkFor,
  onSnackbar,
  onPrefill,
}: {
  invites: InviteItem[];
  doctorName?: string;
  onNewInvite: (prefill?: Partial<InviteItem>) => void;
  onCancel: (id: string) => void;
  linkFor: (token: string) => string;
  onSnackbar: (msg: string, sev: 'success' | 'error') => void;
  onPrefill: (p: { name?: string; phone?: string; email?: string }) => void;
}) => {
  const themeClass = useReuiThemeSync();
  const pending = invites.filter((i) => i.status === 'pending');
  const accepted = invites.filter((i) => i.status === 'accepted');
  const expired = invites.filter((i) => i.status === 'expired');
  const relDate = (d?: string) =>
    d ? new Date(d).toLocaleDateString('pt-BR') : '';

  return (
    <div className={`reui-scope ${themeClass} space-y-4`}>
      {/* Header + KPI Rail */}
      <Frame>
        <FrameHeader className="flex flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <IconTile tone="primary" size="md">
              <PersonAddAlt1Icon sx={{ fontSize: 20 }} />
            </IconTile>
            <div>
              <FrameTitle>Convites de Pacientes</FrameTitle>
              <FrameDescription>
                Convide pacientes para o Dr. Exame — ao instalarem, o vínculo com seu consultório já fica ativo
              </FrameDescription>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNewInvite()}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-extrabold text-primary-foreground shadow-sm transition hover:opacity-95 cursor-pointer"
          >
            <PersonAddAlt1Icon sx={{ fontSize: 16 }} />
            Convidar
          </button>
        </FrameHeader>

        <FramePanel className="grid grid-cols-3 divide-x divide-border p-0">
          <div className="p-3.5 text-center sm:p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Pendentes
            </div>
            <div className="mt-0.5 font-heading text-xl font-extrabold text-amber-600 dark:text-amber-400 tabular-nums sm:text-2xl">
              {pending.length}
            </div>
          </div>
          <div className="p-3.5 text-center sm:p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Aceitos
            </div>
            <div className="mt-0.5 font-heading text-xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums sm:text-2xl">
              {accepted.length}
            </div>
          </div>
          <div className="p-3.5 text-center sm:p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Expirados
            </div>
            <div className="mt-0.5 font-heading text-xl font-extrabold text-muted-foreground tabular-nums sm:text-2xl">
              {expired.length}
            </div>
          </div>
        </FramePanel>
      </Frame>

      {/* Pendentes */}
      {pending.length > 0 && (
        <Frame spacing="sm">
          <FrameHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <FrameTitle className="flex items-center gap-2">
                <InboxOutlinedIcon sx={{ fontSize: 17 }} className="text-primary" />
                Aguardando aceite
              </FrameTitle>
              <FrameDescription>
                Envie o link pelo WhatsApp ou copie para compartilhar com o paciente
              </FrameDescription>
            </div>
            <ReuiBadge variant="warning-light" size="sm">
              {pending.length} pendente{pending.length > 1 ? 's' : ''}
            </ReuiBadge>
          </FrameHeader>

          {pending.map((it) => {
            const url = linkFor(it.token);
            const waBase = it.phone
              ? `https://wa.me/${it.phone.startsWith('55') ? '' : '55'}${it.phone}`
              : '';
            const waMsg = waBase
              ? `${waBase}?text=${encodeURIComponent(
                  `Olá! Aqui é ${
                    doctorName || 'seu médico'
                  }. Cadastre-se no app Dr. Exame para eu acompanhar seus exames: ${url}`
                )}`
              : '';

            return (
              <FramePanel key={it.id} className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar
                      sx={{
                        bgcolor: 'rgba(234,88,12,.14)',
                        color: '#c2410c',
                        fontWeight: 800,
                        width: 40,
                        height: 40,
                      }}
                    >
                      {it.patientName?.charAt(0) || 'P'}
                    </Avatar>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-extrabold text-foreground">
                        {it.patientName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {[
                          it.phone,
                          it.email,
                          it.createdAt ? `enviado em ${relDate(it.createdAt)}` : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                  </div>
                  <ReuiBadge variant="warning-light" size="xs">
                    Pendente
                  </ReuiBadge>
                </div>

                {/* Copyable Invite Link (ReUI c-input-group-11) */}
                <CopyableInput
                  value={url}
                  onCopied={() => onSnackbar('Link copiado!', 'success')}
                />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={!waMsg}
                    onClick={() => waMsg && window.open(waMsg, '_blank')}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-3.5 py-1.5 text-xs font-extrabold text-white shadow-xs transition hover:bg-[#047857] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                  >
                    <WhatsAppIcon sx={{ fontSize: 15 }} />
                    Enviar via WhatsApp
                  </button>

                  <button
                    type="button"
                    onClick={() => onCancel(it.id)}
                    className="rounded-full px-3 py-1 text-xs font-bold text-destructive transition hover:bg-destructive/10 cursor-pointer"
                  >
                    Cancelar convite
                  </button>
                </div>
              </FramePanel>
            );
          })}
        </Frame>
      )}

      {/* Aceitos */}
      {accepted.length > 0 && (
        <Frame spacing="sm">
          <FrameHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <FrameTitle className="flex items-center gap-2">
                <CheckCircleOutlinedIcon
                  sx={{ fontSize: 17 }}
                  className="text-emerald-600 dark:text-emerald-400"
                />
                Convites aceitos
              </FrameTitle>
              <FrameDescription>
                Pacientes conectados e ativos na sua carteira
              </FrameDescription>
            </div>
            <ReuiBadge variant="success-light" size="sm">
              {accepted.length} ativo{accepted.length > 1 ? 's' : ''}
            </ReuiBadge>
          </FrameHeader>

          <FramePanel className="divide-y divide-border p-0 overflow-hidden">
            {accepted.map((it) => (
              <div
                key={it.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar
                    sx={{
                      bgcolor: 'rgba(22,163,74,.14)',
                      color: '#047857',
                      fontWeight: 800,
                      width: 38,
                      height: 38,
                    }}
                  >
                    {it.patientName?.charAt(0) || 'P'}
                  </Avatar>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-foreground">
                      {it.patientName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Conta criada em {relDate(it.acceptedAt)} · já disponível em Pacientes
                    </div>
                  </div>
                </div>
                <ReuiBadge variant="success-light" size="xs">
                  Ativo
                </ReuiBadge>
              </div>
            ))}
          </FramePanel>
        </Frame>
      )}

      {/* Expirados */}
      {expired.length > 0 && (
        <Frame spacing="sm">
          <FrameHeader>
            <FrameTitle className="flex items-center gap-2 text-muted-foreground">
              <ScheduleOutlinedIcon sx={{ fontSize: 17 }} />
              Expirados ou cancelados ({expired.length})
            </FrameTitle>
          </FrameHeader>
          <FramePanel className="divide-y divide-border p-0 overflow-hidden">
            {expired.map((it) => (
              <div
                key={it.id}
                className="flex items-center justify-between gap-3 px-4 py-3 opacity-80"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar
                    sx={{
                      width: 36,
                      height: 36,
                      fontWeight: 800,
                    }}
                  >
                    {it.patientName?.charAt(0) || 'P'}
                  </Avatar>
                  <span className="truncate text-sm font-bold text-foreground">
                    {it.patientName}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onPrefill({
                      name: it.patientName,
                      phone: it.phone || '',
                      email: it.email || '',
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/35 bg-primary/10 px-3 py-1 text-xs font-bold text-primary transition hover:bg-primary/20 cursor-pointer"
                >
                  <PersonAddAlt1Icon sx={{ fontSize: 14 }} />
                  Reenviar
                </button>
              </div>
            ))}
          </FramePanel>
        </Frame>
      )}

      {/* Empty state */}
      {invites.length === 0 && (
        <Frame>
          <FramePanel className="p-6">
            <Empty className="border-0 p-4 md:p-6">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PersonAddAlt1Icon sx={{ fontSize: 22 }} />
                </EmptyMedia>
                <EmptyTitle>Nenhum convite enviado ainda</EmptyTitle>
                <EmptyDescription>
                  Toque em “Convidar” para gerar um link exclusivo para seu paciente — quando ele instalar o app, vocês já ficam conectados automaticamente.
                </EmptyDescription>
              </EmptyHeader>
              <button
                type="button"
                onClick={() => onNewInvite()}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-extrabold text-primary-foreground shadow-sm transition hover:opacity-95 cursor-pointer"
              >
                <PersonAddAlt1Icon sx={{ fontSize: 16 }} />
                Convidar primeiro paciente
              </button>
            </Empty>
          </FramePanel>
        </Frame>
      )}
    </div>
  );
};
