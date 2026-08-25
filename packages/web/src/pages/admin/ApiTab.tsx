import { useEffect, useState } from 'react';
import { Box, Typography, Stack, Chip, Card, CardContent, Button, TextField, CircularProgress } from '@mui/material';
import { useNotify } from 'react-admin';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import KeyIcon from '@mui/icons-material/Key';
import { API_URL, token } from '../../config';
import { TabLoader, SectionError } from './parts';

const H = () => ({ Authorization: `Bearer ${token()}` });
const fmt = (d: string | null) => (d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

const STATUS_CHIP: Record<string, { label: string; color: 'warning' | 'success' | 'default' | 'error' }> = {
  pending: { label: '⏳ Aguardando', color: 'warning' },
  approved: { label: 'Aprovado', color: 'success' },
  rejected: { label: 'Rejeitado', color: 'default' },
};

/** Admin da API pública: fila de solicitações de acesso (aprovar concede o pacote teste
 *  e libera chaves), chaves ativas com saldo pré-pago, e totais vendidos/usados. */
export const ApiTab = () => {
  const notify = useNotify();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const load = async () => {
    setLoading(true); setError(false);
    try {
      const r = await fetch(`${API_URL}/admin/api-access`, { headers: H() });
      if (r.ok) setData(await r.json()); else setError(true);
    } catch { setError(true); }
    setLoading(false);
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  const review = async (id: string, action: 'approve' | 'reject') => {
    const r = await fetch(`${API_URL}/admin/api-access/${id}/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...H() },
      body: JSON.stringify({ note }),
    });
    if (r.ok) { notify(action === 'approve' ? 'Acesso aprovado — pacote teste concedido.' : 'Solicitação rejeitada.', { type: 'success' }); setNoteFor(null); setNote(''); void load(); }
    else notify('Falha na ação.', { type: 'error' });
  };

  const revokeKey = async (id: string) => {
    const r = await fetch(`${API_URL}/admin/api-keys/${id}/revoke`, { method: 'POST', headers: H() });
    if (r.ok) { notify('Chave revogada.', { type: 'success' }); void load(); } else notify('Falha ao revogar.', { type: 'error' });
  };

  if (loading) return <TabLoader />;
  if (error) return <SectionError message="Não foi possível carregar a fila da API." onRetry={() => void load()} />;

  const pending = (data?.requests ?? []).filter((r: any) => r.status === 'pending');
  const reviewed = (data?.requests ?? []).filter((r: any) => r.status !== 'pending');

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap' }} useFlexGap>
        <Typography sx={{ fontWeight: 800 }}>🔌 API pública</Typography>
        {!!pending.length && <Chip size="small" color="warning" label={`${pending.length} solicitação(ões)`} />}
        <Box sx={{ flex: 1 }} />
        <Chip size="small" label={`💰 ${data?.totals?.purchases ?? 0} pacotes · ${Number(data?.totals?.callsSold ?? 0).toLocaleString('pt-BR')} chamadas vendidas`} sx={{ fontWeight: 700, bgcolor: 'rgba(212,165,116,.16)', color: '#b88a54' }} />
        <Chip size="small" label={`⚡ ${Number(data?.totals?.callsUsed ?? 0).toLocaleString('pt-BR')} chamadas usadas`} sx={{ fontWeight: 700, bgcolor: 'rgba(32,178,170,.12)', color: '#178f89' }} />
      </Stack>

      {/* FILA — pendentes primeiro */}
      <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 1 }}>Solicitações de acesso</Typography>
      {pending.length === 0 && reviewed.length === 0 && (
        <Card variant="outlined"><CardContent><Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>Nenhuma solicitação ainda. Elas chegam quando um dev cria conta e pede acesso em POST /access-request.</Typography></CardContent></Card>
      )}
      <Stack spacing={1.25} sx={{ mb: 3 }}>
        {[...pending, ...reviewed.slice(0, 5)].map((r: any) => {
          const st = STATUS_CHIP[r.status] ?? STATUS_CHIP.pending;
          return (
            <Card key={r.id} variant="outlined" sx={{ borderLeft: r.status === 'pending' ? '4px solid #b45309' : undefined }}>
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Stack direction="row" alignItems="center" spacing={1} useFlexGap flexWrap="wrap">
                  <Chip size="small" color={st.color as any} label={st.label} sx={{ fontWeight: 700 }} />
                  <Typography sx={{ fontWeight: 800, fontSize: 14 }}>{r.company}</Typography>
                  <Typography variant="caption" color="text.secondary">{r.user?.name} · {r.user?.email} · {fmt(r.createdAt)}</Typography>
                </Stack>
                <Typography sx={{ fontSize: 13.5, color: 'text.secondary', mt: 0.5, lineHeight: 1.5 }}>{r.useCase}</Typography>
                {r.note && r.status !== 'pending' && <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'text.disabled', fontStyle: 'italic' }}>→ {r.note}</Typography>}
                {r.status === 'pending' && (
                  <Stack direction="row" spacing={1} sx={{ mt: 1.25 }} alignItems="center" useFlexGap flexWrap="wrap">
                    {noteFor === r.id ? (
                      <>
                        <TextField size="small" placeholder="Resposta (opcional)…" value={note} onChange={(e) => setNote(e.target.value)} sx={{ flex: 1, minWidth: 220 }} />
                        <Button size="small" variant="contained" color="success" startIcon={<CheckIcon />} onClick={() => void review(r.id, 'approve')}>Aprovar + teste grátis</Button>
                        <Button size="small" color="error" startIcon={<CloseIcon />} onClick={() => void review(r.id, 'reject')}>Rejeitar</Button>
                      </>
                    ) : (
                      <Button size="small" variant="outlined" onClick={() => { setNoteFor(r.id); setNote(''); }}>Avaliar</Button>
                    )}
                  </Stack>
                )}
              </CardContent>
            </Card>
          );
        })}
      </Stack>

      {/* CHAVES ATIVAS com saldo */}
      <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 1 }}>Chaves ativas</Typography>
      {(data?.keys ?? []).length === 0 ? (
        <Card variant="outlined"><CardContent><Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>Nenhuma chave ativa.</Typography></CardContent></Card>
      ) : (
        <Stack spacing={1}>
          {data.keys.map((k: any) => (
            <Card key={k.id} variant="outlined">
              <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                <Stack direction="row" alignItems="center" spacing={1} useFlexGap flexWrap="wrap">
                  <KeyIcon sx={{ fontSize: 17, color: '#178f89' }} />
                  <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, fontWeight: 700 }}>{k.prefix}…</Typography>
                  <Typography variant="caption" color="text.secondary">{k.name} · {k.user?.email}</Typography>
                  <Box sx={{ flex: 1 }} />
                  <Chip size="small" label={`saldo: ${Number(k.balance ?? 0).toLocaleString('pt-BR')} chamadas`} sx={{ fontWeight: 700, bgcolor: k.balance > 0 ? 'rgba(32,178,170,.12)' : 'rgba(239,68,68,.12)', color: k.balance > 0 ? '#178f89' : '#b91c1c' }} />
                  <Chip size="small" variant="outlined" label={`último uso ${k.lastUsedAt ? fmt(k.lastUsedAt) : 'nunca'}`} />
                  <Button size="small" color="error" onClick={() => void revokeKey(k.id)}>Revogar</Button>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
      {loading && <CircularProgress size={18} sx={{ mt: 2 }} />}
    </Box>
  );
};
