import { useState } from 'react';
import { Box, Typography, Stack, Card, CardContent, TextField, Button, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Alert } from '@mui/material';
import { useNotify } from 'react-admin';
import SearchIcon from '@mui/icons-material/Search';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { API_URL, token } from '../../config';
import { formatCpf, isValidCpf } from '../../utils/cpf';

const H = () => ({ Authorization: `Bearer ${token()}` });
const HJson = () => ({ ...H(), 'Content-Type': 'application/json' });

type Target = { type: 'PATIENT' | 'DOCTOR'; id: string; label: string; cpfMasked?: string | null };

export const PiiTab = () => {
  const notify = useNotify();
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ patients: any[]; doctors: any[] } | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [reason, setReason] = useState('');
  const [ticketId, setTicketId] = useState('');
  const [revealed, setRevealed] = useState<{ cpf: string; expiresAt: string } | null>(null);
  const [revealing, setRevealing] = useState(false);

  const lookup = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const query = isValidCpf(cpf)
      ? `cpf=${encodeURIComponent(cpf)}`
      : cleanEmail
        ? `email=${encodeURIComponent(cleanEmail)}`
        : '';
    if (!query) { notify('Informe um CPF válido ou o e-mail da conta.', { type: 'error' }); return; }
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/admin/pii/lookup?${query}`, { headers: H() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha na busca');
      setData(d);
    } catch (e: any) { notify(e.message, { type: 'error' }); }
    finally { setLoading(false); }
  };

  const reveal = async () => {
    if (!target) return;
    if (reason.trim().length < 5) { notify('Informe o motivo/ticket.', { type: 'error' }); return; }
    setRevealing(true);
    try {
      const r = await fetch(`${API_URL}/admin/pii/reveal`, {
        method: 'POST',
        headers: HJson(),
        body: JSON.stringify({ targetType: target.type, targetId: target.id, reason: reason.trim(), ticketId: ticketId.trim() || undefined }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha ao revelar');
      setRevealed({ cpf: d.cpf, expiresAt: d.expiresAt });
      notify('CPF revelado com auditoria registrada.', { type: 'success' });
    } catch (e: any) { notify(e.message, { type: 'error' }); }
    finally { setRevealing(false); }
  };

  const openReveal = (next: Target) => {
    setTarget(next);
    setReason('');
    setTicketId('');
    setRevealed(null);
  };

  const total = (data?.patients?.length ?? 0) + (data?.doctors?.length ?? 0);

  return (
    <Box>
      <Typography sx={{ fontWeight: 800, mb: 0.5 }}>CPF / PII de suporte</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Busque por CPF ou e-mail da conta. CPF completo só aparece após motivo e fica registrado na auditoria.</Typography>
      <Card variant="outlined" sx={{ borderRadius: 2, mb: 2 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField label="CPF" value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))} inputProps={{ inputMode: 'numeric' }} error={!!cpf && cpf.length === 14 && !isValidCpf(cpf)} helperText={!!cpf && cpf.length === 14 && !isValidCpf(cpf) ? 'CPF inválido.' : 'Digite o CPF completo para localizar paciente ou médico.'} fullWidth size="small" />
            <TextField label="E-mail da conta" value={email} onChange={(e) => setEmail(e.target.value)} helperText="Use quando o suporte tiver o e-mail/ticket." fullWidth size="small" />
            <Button variant="contained" startIcon={<SearchIcon />} onClick={lookup} disabled={loading} sx={{ borderRadius: 2, fontWeight: 800, minWidth: 130 }}>{loading ? 'Buscando...' : 'Buscar'}</Button>
          </Stack>
        </CardContent>
      </Card>

      {data && (
        <Stack spacing={1}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{total} resultado(s)</Typography>
          {data.patients.map((p) => (
            <Card key={`p-${p.id}`} variant="outlined" sx={{ borderRadius: 2 }}>
              <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                <Stack direction="row" alignItems="center" spacing={1} useFlexGap flexWrap="wrap">
                  <Chip size="small" label="Paciente" color="primary" />
                  <Box sx={{ flex: 1, minWidth: 220 }}>
                    <Typography sx={{ fontWeight: 800 }}>{p.fullName}</Typography>
                    <Typography variant="caption" color="text.secondary">{p.owner?.email} · {p.relationship ?? 'Perfil'} · {p.cpfMasked}</Typography>
                  </Box>
                  {p.identityLocked && <Chip size="small" label="Identidade travada" variant="outlined" />}
                  <Button size="small" startIcon={<VisibilityIcon />} onClick={() => openReveal({ type: 'PATIENT', id: p.id, label: p.fullName, cpfMasked: p.cpfMasked })}>Revelar</Button>
                </Stack>
              </CardContent>
            </Card>
          ))}
          {data.doctors.map((d) => (
            <Card key={`d-${d.id}`} variant="outlined" sx={{ borderRadius: 2 }}>
              <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                <Stack direction="row" alignItems="center" spacing={1} useFlexGap flexWrap="wrap">
                  <Chip size="small" label="Médico" color="secondary" />
                  <Box sx={{ flex: 1, minWidth: 220 }}>
                    <Typography sx={{ fontWeight: 800 }}>{d.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{d.email} · CRM {d.crm} · {d.cpfMasked}</Typography>
                  </Box>
                  {d.identityLocked && <Chip size="small" label="Identidade travada" variant="outlined" />}
                  <Button size="small" startIcon={<VisibilityIcon />} onClick={() => openReveal({ type: 'DOCTOR', id: d.id, label: d.name, cpfMasked: d.cpfMasked })}>Revelar</Button>
                </Stack>
              </CardContent>
            </Card>
          ))}
          {total === 0 && <Alert severity="info">Nenhum paciente ou médico encontrado para este CPF.</Alert>}
        </Stack>
      )}

      <Dialog open={!!target} onClose={() => setTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>Revelar CPF</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1 }}><strong>{target?.label}</strong> · {target?.cpfMasked}</Typography>
          <TextField label="Motivo obrigatório" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth size="small" sx={{ mb: 1 }} placeholder="Ex.: chamado #1234, divergência de exame" />
          <TextField label="Ticket ID ou número (opcional)" value={ticketId} onChange={(e) => setTicketId(e.target.value)} fullWidth size="small" />
          {revealed && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              CPF completo: <strong>{revealed.cpf}</strong><br />
              Visível para este atendimento até {new Date(revealed.expiresAt).toLocaleTimeString('pt-BR')}.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTarget(null)}>Fechar</Button>
          <Button variant="contained" onClick={reveal} disabled={revealing || !!revealed}>{revealing ? 'Revelando...' : 'Revelar com auditoria'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
