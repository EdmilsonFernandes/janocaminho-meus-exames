import { useEffect, useState } from 'react';
import { Card, CardContent, Typography, Box, Stack, Chip, TextField, Button, CircularProgress } from '@mui/material';
import { useNotify } from 'react-admin';
import { API_URL, token } from '../../config';
import { TabLoader, SectionError } from './parts';

export const SecurityTab = () => {
  const notify = useNotify();
  const [blocked, setBlocked] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    setLoading(true); setError(false);
    try {
      const r = await fetch(`${API_URL}/admin/blocked-domains`, { headers: { Authorization: `Bearer ${token()}` } });
      if (r.ok) setBlocked((await r.json()).domains || []); else setError(true);
    } catch { setError(true); }
    setLoading(false);
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  const addDomain = async () => {
    const d = newDomain.trim().toLowerCase().replace(/^@/, '');
    if (!d) return;
    const r = await fetch(`${API_URL}/admin/blocked-domains`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify({ domain: d }) });
    if (r.ok) { setBlocked((await r.json()).domains || []); setNewDomain(''); notify('Domínio bloqueado.'); }
    else notify('Falha ao bloquear.', { type: 'error' });
  };
  const removeDomain = async (d: string) => {
    const r = await fetch(`${API_URL}/admin/blocked-domains/${encodeURIComponent(d)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) setBlocked((await r.json()).domains || []);
  };
  const syncDomains = async () => {
    setSyncing(true);
    try {
      const r = await fetch(`${API_URL}/admin/blocked-domains/sync`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` } });
      const d = r.ok ? await r.json() : null;
      if (d) notify(`Sincronizado: +${d.added} domínios (total ${d.total}).`, { type: 'success' });
      else notify('Falha no sync.', { type: 'error' });
      await load();
    } catch { notify('Falha no sync.', { type: 'error' }); }
    setSyncing(false);
  };

  if (loading) return <TabLoader />;
  if (error) return <SectionError message="Não foi possível carregar os domínios bloqueados." onRetry={() => void load()} />;

  return (
    <Card sx={{ borderRadius: 3 }}><CardContent>
      <Typography variant="h6" gutterBottom>🚫 E-mails temporários bloqueados</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Domínios descartáveis (mailinator, guerrillamail…) não conseguem se cadastrar — evita farm de contas pra roubar o bônus de créditos. Lista no banco, configurável.</Typography>
      <Box sx={{ mb: 2, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
        {blocked.map((d) => (<Chip key={d} label={d} size="small" onDelete={() => void removeDomain(d)} />))}
        {!blocked.length && <Typography variant="body2" color="text.secondary">Nenhum domínio bloqueado.</Typography>}
      </Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }} useFlexGap flexWrap="wrap">
        <TextField size="small" placeholder="exemplo.com" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void addDomain(); }} sx={{ width: 220 }} />
        <Button size="small" variant="contained" onClick={addDomain}>Bloquear</Button>
        <Button size="small" variant="outlined" onClick={syncDomains} disabled={syncing} startIcon={syncing ? <CircularProgress size={14} /> : undefined}>↻ Sincronizar lista pública</Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">{blocked.length} domínios. "Sincronizar" puxa de uma lista pública comunitária (só adiciona, não remove os manuais).</Typography>
    </CardContent></Card>
  );
};
