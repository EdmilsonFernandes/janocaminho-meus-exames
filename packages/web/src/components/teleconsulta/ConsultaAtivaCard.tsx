import { useState } from 'react';
import {
  Avatar, Box, Button, Card, CardContent, Chip, Stack, Typography, keyframes, useTheme,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import VerifiedRoundedIcon from '@mui/icons-material/VerifiedRounded';
import EventBusyRoundedIcon from '@mui/icons-material/EventBusyRounded';
import HourglassTopRoundedIcon from '@mui/icons-material/HourglassTopRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { API_URL, token, doctorPhotoUrl } from '../../config';
import { confirmDialog } from '../ConfirmDialog';
import { hapticLight, hapticError } from '../../utils/haptic';
import { safeAvatar } from '../../utils/safeAvatar';
import { PixPaymentBlock } from './PixPaymentBlock';

const pulse = keyframes`0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.35)}`;

/** centavos → "X,XX" pt-BR (mesmo padrão do Reminders). */
const fmtBrl = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * ConsultaAtivaCard — card de teleconsulta ABERTA da tela Minhas Consultas,
 * conforme mock aprovado (pills 999px, borda por estado, avatar real do médico,
 * badge de pagamento e CTA contextual). Estado:
 *  - SALA ABERTA (verde pulsante): médico na sala (poll doctorInRoom) OU janela
 *    da consulta (15min antes → 60min depois, mesmo critério do Reminders).
 *  - AGENDADA (teal) / HOJE (teal): fora da janela.
 *  - Pagamento pendente (âmbar): borda âmbar + CTA "Pagar com PIX".
 */
export const ConsultaAtivaCard = ({
  r,
  now,
  calling = false,
  onCanceled,
  onPaid,
}: {
  r: any;
  now: Date;
  /** médico está na sala agora (poll /teleconsulta/:id/summary → doctorInRoom). */
  calling?: boolean;
  onCanceled: (id: string) => void;
  onPaid?: () => void;
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const navigate = useNavigate();
  const [pixOpen, setPixOpen] = useState(false);
  const [canceling, setCanceling] = useState(false);

  const dueMs = new Date(r.dueDate).getTime();
  const diffMs = dueMs - now.getTime();
  // Janela da consulta — mesmo critério do Reminders (15min antes → 60min depois).
  const inWindow = diffMs <= 15 * 60 * 1000 && diffMs >= -60 * 60 * 1000;
  const isLive = calling || inWindow;
  const pendingPayment = (r.consultPriceCents ?? 0) > 0 && !r.paidAt;
  const isPaid = !!r.paidAt || (r.consultPriceCents ?? 0) === 0;

  const docId = r.doctor?.id || r.createdByDoctorId || r.doctorId;
  const docPhoto = safeAvatar(docId ? doctorPhotoUrl(docId) : undefined, r.doctor?.name);
  const docName = r.doctor?.name
    ? (r.doctor.name.toLowerCase().startsWith('dr') ? r.doctor.name : `Dr(a). ${r.doctor.name}`)
    : r.title || 'Consulta médica online';
  // CRM já vem às vezes com UF embutida ("65432-SP") — não duplicar sufixo.
  const crmBase = String(r.doctor?.crm ?? '').trim();
  const crmHasUf = /-?\b[A-Za-z]{2}$/.test(crmBase);
  const docCrm = crmBase
    ? `CRM ${crmBase}${!crmHasUf && r.doctor?.crmUf ? `-${r.doctor.crmUf}` : ''}`
    : null;

  const due = new Date(r.dueDate);
  const isToday = due.toDateString() === now.toDateString();
  const dateLabel = isToday
    ? 'Hoje'
    : due.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
  const timeLabel = due.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const roomCode = String(r.id || '').slice(-5).toUpperCase();

  // Pill de status (mock): SALA ABERTA verde pulsante | AGENDADA teal | HOJE teal.
  const pill = isLive ? (
    <Chip
      size="small"
      icon={<Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#10b981', animation: `${pulse} 1.6s infinite`, '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }} />}
      label="SALA ABERTA"
      sx={{
        height: 24, fontWeight: 800, fontSize: 10.5, letterSpacing: '0.05em',
        bgcolor: isDark ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.10)',
        color: isDark ? '#34d399' : '#059669',
        border: '1px solid rgba(52,211,153,.3)',
        '& .MuiChip-icon': { ml: 1 },
      }}
    />
  ) : (
    <Chip
      size="small"
      icon={isToday ? undefined : <CalendarMonthRoundedIcon sx={{ fontSize: '13px !important', color: '#0d9488 !important' }} />}
      label={isToday ? 'HOJE' : 'AGENDADA'}
      sx={{
        height: 24, fontWeight: 800, fontSize: 10.5, letterSpacing: '0.05em',
        bgcolor: isDark ? 'rgba(13,148,136,0.15)' : 'rgba(13,148,136,0.10)',
        color: isDark ? '#2dd4bf' : '#0f766e',
        border: '1px solid rgba(13,148,136,.3)',
      }}
    />
  );

  const border = isLive
    ? { borderColor: isDark ? 'rgba(16,185,129,0.45)' : 'rgba(16,185,129,0.35)', boxShadow: isDark ? '0 0 0 1px rgba(16,185,129,.12), 0 12px 36px rgba(0,0,0,.4)' : '0 12px 30px rgba(16,185,129,.10)' }
    : pendingPayment
    ? { borderColor: 'rgba(245,158,11,0.35)' }
    : { borderColor: isDark ? 'rgba(13,148,136,0.3)' : 'rgba(13,148,136,0.22)' };

  // CTA contextual (spec):
  //  pending_payment → "Pagar com PIX — R$ X" (a fase payment do /teleconsulta/:id mostra o PIX)
  //  live → "Entrar Agora" · dentro da janela → "Entrar" · antes → "Ver detalhes" (countdown lá).
  const cta = pendingPayment
    ? { label: `Pagar com PIX — R$ ${fmtBrl(r.consultPriceCents)}`, icon: <HourglassTopRoundedIcon /> }
    : isLive
    ? { label: 'Entrar Agora', icon: <VideocamRoundedIcon /> }
    : inWindow
    ? { label: 'Entrar', icon: <VideocamRoundedIcon /> }
    : { label: 'Ver detalhes', icon: <ArrowForwardRoundedIcon /> };

  const cancel = async () => {
    if (!(await confirmDialog({
      title: 'Cancelar consulta',
      message: `Deseja cancelar a consulta com ${docName}? O médico será informado.`,
      confirmLabel: 'Cancelar consulta',
    }))) return;
    setCanceling(true);
    try {
      const res = await fetch(`${API_URL}/reminders/${r.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
      if (!res.ok) throw new Error();
      hapticLight();
      onCanceled(r.id);
    } catch {
      hapticError();
    } finally { setCanceling(false); }
  };

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: '20px',
        position: 'relative',
        overflow: 'hidden',
        bgcolor: isLive
          ? (isDark ? 'rgba(16,185,129,0.05)' : 'rgba(236,253,245,0.6)')
          : pendingPayment
          ? (isDark ? 'rgba(245,158,11,0.03)' : 'rgba(255,251,235,0.4)')
          : (isDark ? '#0f172a' : '#ffffff'),
        border: '1.5px solid',
        transition: 'all .25s ease',
        ...border,
        '&:hover': { transform: 'translateY(-2px)' },
      }}
    >
      {/* Glow decorativo do mock (canto sup. direito) */}
      {isLive && (
        <Box sx={{
          position: 'absolute', top: -60, right: -60, width: 160, height: 160, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(16,185,129,0.16) 0%, transparent 70%)', pointerEvents: 'none',
        }} />
      )}

      <CardContent sx={{ p: { xs: 2, sm: 2.25 }, '&:last-child': { pb: { xs: 2, sm: 2.25 } } }}>
        {/* Status pill + protocolo */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            {pill}
            {!isLive && (
              <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                {dateLabel}
              </Typography>
            )}
          </Stack>
          <Typography sx={{ fontSize: 11, fontWeight: 800, fontFamily: 'monospace', color: 'text.secondary', letterSpacing: '0.05em' }}>
            SALA #{roomCode}
          </Typography>
        </Stack>

        {/* Médico: avatar real + nome + especialidade + CRM */}
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.75 }}>
          <Box sx={{ position: 'relative', flexShrink: 0 }}>
            <Avatar
              src={docPhoto}
              alt={docName}
              sx={{
                width: { xs: 52 }, height: 52, borderRadius: '16px',
                fontWeight: 800, fontSize: 20,
                bgcolor: 'rgba(13,148,136,0.12)', color: '#0d9488',
                border: '2px solid', borderColor: isLive ? '#10b981' : 'rgba(13,148,136,0.3)',
              }}
            >
              {docName.charAt(0)?.toUpperCase() || 'D'}
            </Avatar>
            {isLive && (
              <Box
                title="Médico na sala"
                sx={{ position: 'absolute', bottom: -2, right: -2, width: 14, height: 14, borderRadius: '50%', bgcolor: '#10b981', border: '2.5px solid', borderColor: isDark ? '#0f172a' : '#ffffff' }}
              />
            )}
          </Box>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Typography noWrap sx={{ fontSize: 15.5, fontWeight: 800, color: 'text.primary', fontFamily: 'Poppins, sans-serif' }}>
                {docName}
              </Typography>
              <VerifiedRoundedIcon sx={{ fontSize: 15, color: '#0d9488', flexShrink: 0 }} />
            </Stack>
            <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.secondary', mt: 0.15 }}>
              {[r.doctor?.specialty, docCrm].filter(Boolean).join(' · ') || 'Teleconsulta'}
            </Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 600, mt: 0.15, fontVariantNumeric: 'tabular-nums' }}>
              {dateLabel} · {timeLabel}
            </Typography>
          </Box>
        </Stack>

        {/* Badge pagamento (mock: ✅ Pago — R$ X | ⏳ Aguardando pagamento) */}
        {(r.consultPriceCents ?? 0) > 0 && (
          r.paidAt ? (
            <Chip
              size="small"
              icon={<VerifiedRoundedIcon />}
              label={`✅ Pago — R$ ${fmtBrl(r.consultPriceCents)}`}
              sx={{ height: 26, fontSize: 12, fontWeight: 800, borderRadius: '999px', mb: 1.25, bgcolor: 'rgba(16,185,129,.12)', color: isDark ? '#34d399' : '#059669', border: '1px solid rgba(52,211,153,.25)' }}
            />
          ) : (
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{
                mb: 1.25, px: 1.25, py: 1, borderRadius: '12px',
                bgcolor: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.25)',
              }}
            >
              <HourglassTopRoundedIcon sx={{ fontSize: 18, color: isDark ? '#fbbf24' : '#b45309' }} />
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: isDark ? '#fbbf24' : '#b45309' }}>
                  ⏳ Aguardando pagamento
                </Typography>
                <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 0.15 }}>
                  {dateLabel} às {timeLabel} · R$ {fmtBrl(r.consultPriceCents)}
                </Typography>
              </Box>
            </Stack>
          )
        )}

        {/* CTA primário contextual */}
        <Button
          fullWidth
          variant="contained"
          disabled={canceling}
          startIcon={cta.icon}
          onClick={() => { hapticLight(); navigate(`/teleconsulta/${r.id}`); }}
          sx={{
            minHeight: 46,
            borderRadius: '12px',
            textTransform: 'none',
            fontWeight: 800,
            fontSize: 14,
            background: pendingPayment
              ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
              : 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
            color: '#fff',
            boxShadow: '0 4px 14px rgba(13,148,136,.35)',
            '&:hover': { background: pendingPayment ? 'linear-gradient(135deg, #047857 0%, #059669 100%)' : 'linear-gradient(135deg, #0f766e 0%, #047857 100%)' },
          }}
        >
          {cta.label}
        </Button>

        {/* PIX inline (alternativa ao fluxo da tela /teleconsulta) */}
        {pendingPayment && (
          <>
            <Button
              fullWidth
              size="small"
              onClick={() => { hapticLight(); setPixOpen((o) => !o); }}
              sx={{ mt: 0.75, textTransform: 'none', fontWeight: 700, fontSize: 12, color: 'text.secondary', minHeight: 36 }}
            >
              {pixOpen ? 'Esconder pagamento' : 'Pagar aqui sem sair da lista'}
            </Button>
            {pixOpen && (
              <PixPaymentBlock
                reminderId={r.id}
                priceCents={r.consultPriceCents}
                paidAt={r.paidAt}
                onPaid={onPaid}
              />
            )}
          </>
        )}

        {/* Ação discreta: cancelar */}
        <Button
          fullWidth
          size="small"
          disabled={canceling}
          startIcon={<EventBusyRoundedIcon sx={{ fontSize: 16 }} />}
          onClick={() => void cancel()}
          sx={{
            mt: 1, minHeight: 36, borderRadius: '999px', textTransform: 'none',
            fontWeight: 700, fontSize: 12, color: 'text.disabled',
            '&:hover': { color: 'error.main', bgcolor: 'rgba(239,68,68,.06)' },
          }}
        >
          {canceling ? 'Cancelando…' : 'Cancelar consulta'}
        </Button>
      </CardContent>
    </Card>
  );
};
