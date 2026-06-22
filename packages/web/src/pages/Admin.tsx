import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Button, Stack, Chip, TextField, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, CircularProgress, Divider, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper } from '@mui/material';
import { Title, useNotify } from 'react-admin';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { API_URL, token } from '../config';

interface U { id: string; email: string; name: string; role: string; credits: number; planExpiresAt: string | null; createdAt: string }

export const AdminPage = () => {
  const notify = useNotify();
  const [tab, setTab] = useState<'users' | 'payments' | 'config' | 'metrics'>('users');
  const [users, setUsers] = useState<U[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [config, setConfig] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState<U | null>(null);
  const [editCredits, setEditCredits] = useState(0);
  const [editPlan, setEditPlan] = useState('');
  const [q, setQ] = useState('');

  const load = async () => {
    setLoading(true);
    const h = { Authorization: `Bearer ${token()}` };
    const [u, p, c] = await Promise.all([
      fetch(`${API_URL}/admin/users`, { headers: h }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${API_URL}/admin/payments`, { headers: h }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${API_URL}/admin/config`, { headers: h }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    if (u) { setUsers(u.users ?? []); setStats(u.stats); }
    if (p) setPayments(p.payments ?? []);
    if (c) setConfig(c);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  const loadMetrics = async () => {
    const r = await fetch(`${API_URL}/admin/metrics`, { headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) setMetrics(await r.json());
  };
  useEffect(() => { if (tab === 'metrics') void loadMetrics(); /* eslint-disable-next-line */ }, [tab]);

  const saveCredits = async () => {
    if (!editUser) return;
    await fetch(`${API_URL}/admin/users/${editUser.id}/credits`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify({ credits: editCredits }) });
    notify('Créditos atualizados!', { type: 'success' }); setEditUser(null); void load();
  };
  const savePlan = async () => {
    if (!editUser) return;
    await fetch(`${API_URL}/admin/users/${editUser.id}/plan`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify({ planExpiresAt: editPlan || null }) });
    notify('Plano atualizado!', { type: 'success' }); setEditUser(null); void load();
  };
  const delUser = async (id: string, email: string) => {
    const ir = await fetch(`${API_URL}/admin/users/${id}/impact`, { headers: { Authorization: `Bearer ${token()}` } });
    const impact = ir.ok ? await ir.json() : { patients: 0, exams: 0, analyses: 0 };
    const msg = `Excluir ${email}?

Isso vai apagar DEFINITIVAMENTE:
• ${impact.patients} perfil(is)
• ${impact.exams} exame(s) + PDFs
• ${impact.analyses} análise(s)

NÃO dá pra desfazer.`;
    if (!window.confirm(msg)) return;
    const r = await fetch(`${API_URL}/admin/users/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) { notify('Usuário + documentos excluídos', { type: 'success' }); void load(); }
    else notify('Erro ao excluir', { type: 'error' });
  };

  if (loading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;

  const filtered = users.filter((u) => !q || u.email.toLowerCase().includes(q.toLowerCase()) || (u.name || '').toLowerCase().includes(q.toLowerCase()));
  const TabBtn = ({ id, label }: any) => (
    <Button variant={tab === id ? 'contained' : 'outlined'} size="small" onClick={() => setTab(id)} sx={{ borderRadius: 99 }}>{label}</Button>
  );
  const statusColor: Record<string, any> = { APPROVED: 'success', PENDING: 'warning', CANCELLED: 'default', FAILED: 'error' };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100, mx: 'auto' }}>
      <Title title="Admin" />
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>⚙️ Painel Admin</Typography>
      {stats && (
        <Stack direction="row" spacing={1} sx={{ mb: 2 }} useFlexGap flexWrap="wrap">
          <Chip label={`👤 ${stats.users} usuários`} color="primary" size="small" />
          <Chip label={`📋 ${stats.exams} exames`} color="secondary" size="small" />
          <Chip label={`💳 ${stats.subscriptions} pagamentos`} color="info" size="small" />
          <Chip label={`💰 R$ ${(stats.revenue ?? 0).toFixed(2).replace('.', ',')} aprovado`} color="success" size="small" />
        </Stack>
      )}
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <TabBtn id="users" label="👥 Usuários" />
        <TabBtn id="payments" label="💳 Pagamentos" />
        <TabBtn id="config" label="⚙️ Config" />
        <TabBtn id="metrics" label="📊 Métricas" />
      </Stack>

      {/* TAB: USUÁRIOS */}
      {tab === 'users' && (
        <Box>
          <TextField placeholder="Buscar..." value={q} onChange={(e) => setQ(e.target.value)} size="small" fullWidth sx={{ mb: 2 }} />
          <Stack spacing={1}>
            {filtered.map((u) => (
              <Card key={u.id} variant="outlined" sx={{ borderRadius: 2 }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', py: 1.5 }}>
                  <Box sx={{ flex: 1, minWidth: 180 }}>
                    <Typography sx={{ fontWeight: 700, wordBreak: 'break-word' }}>{u.name || '—'} {u.role === 'ADMIN' && <Chip size="small" label="ADMIN" color="warning" />}</Typography>
                    <Typography variant="caption" color="text.secondary">{u.email}</Typography>
                  </Box>
                  <Box sx={{ textAlign: 'center', minWidth: 60 }}>
                    <Typography sx={{ fontWeight: 800, color: u.credits > 0 ? 'success.main' : 'error.main' }}>{u.credits}</Typography>
                    <Typography variant="caption" color="text.secondary">créditos</Typography>
                  </Box>
                  <Box>{u.planExpiresAt && new Date(u.planExpiresAt) > new Date() ? <Chip size="small" label="Premium" color="primary" /> : <Chip size="small" label="Grátis" variant="outlined" />}</Box>
                  <IconButton size="small" onClick={() => { setEditUser(u); setEditCredits(u.credits); setEditPlan(u.planExpiresAt ? u.planExpiresAt.split('T')[0] : ''); }} title="Editar"><EditIcon fontSize="small" /></IconButton>
                  {u.role !== 'ADMIN' && <IconButton size="small" color="error" onClick={() => delUser(u.id, u.email)} title="Excluir"><DeleteIcon fontSize="small" /></IconButton>}
                </CardContent>
              </Card>
            ))}
          </Stack>
        </Box>
      )}

      {/* TAB: PAGAMENTOS */}
      {tab === 'payments' && (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#e6f7f6' } }}>
                <TableCell>Data</TableCell><TableCell>Usuário</TableCell><TableCell>Valor</TableCell><TableCell>Tipo</TableCell><TableCell>Status</TableCell><TableCell>MP ID</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{new Date(p.createdAt).toLocaleDateString('pt-BR')}</TableCell>
                  <TableCell sx={{ wordBreak: 'break-word', maxWidth: 200 }}>{p.user?.email ?? '—'}</TableCell>
                  <TableCell>R$ {p.amount.toFixed(2).replace('.', ',')}</TableCell>
                  <TableCell>{p.periodDays > 0 ? 'Mensal' : 'Créditos'}</TableCell>
                  <TableCell><Chip size="small" color={statusColor[p.status] ?? 'default'} label={p.status} /></TableCell>
                  <TableCell sx={{ fontSize: 11, fontFamily: 'monospace' }}>{p.mpPaymentId ?? '—'}</TableCell>
                </TableRow>
              ))}
              {payments.length === 0 && <TableRow><TableCell colSpan={6} align="center">Nenhum pagamento ainda.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* TAB: CONFIG */}
      {tab === 'config' && config && (
        <Card sx={{ borderRadius: 4 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Custos de créditos (por ação de IA)</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              Edite e salve — <strong>persiste no banco</strong> (sobrevive a restart/redeploy, sem editar código).
            </Typography>
            <Stack spacing={2}>
              {([['chat', '💬 Chat com IA (por pergunta)'], ['summary', '📄 Resumo de exame'], ['consolidated', '🧾 Relatório consolidado'], ['extraction', '📤 Upload de exame (0 = grátis)']] as const).map(([key, label]) => (
                <Stack key={key} direction="row" spacing={2} alignItems="center" useFlexGap flexWrap="wrap">
                  <Typography sx={{ flex: 1, minWidth: 200 }}>{label}</Typography>
                  <TextField type="number" size="small" defaultValue={config.creditCosts?.[key] ?? 0}
                    sx={{ width: 100 }}
                    id={`cost-${key}`}
                  />
                  <span style={{ fontSize: 13, color: '#888' }}>créditos</span>
                </Stack>
              ))}
              <Button variant="contained" onClick={async () => {
                const body: any = { category: 'creditCosts' };
                for (const k of ['chat', 'summary', 'consolidated', 'extraction']) {
                  const el = document.getElementById(`cost-${k}`) as HTMLInputElement;
                  if (el) body[k] = Number(el.value);
                }
                const r = await fetch(`${API_URL}/admin/config/costs`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify(body) });
                if (r.ok) { const d = await r.json(); setConfig({ ...config, creditCosts: d.creditCosts }); notify('Custos atualizados na hora!', { type: 'success' }); }
                else notify('Erro ao salvar', { type: 'error' });
              }}>Salvar custos</Button>
            </Stack>

            <Typography variant="h6" sx={{ mt: 3 }}>📤 Regras de envio de exame</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              Free: créditos por envio. Premium: X envios grátis/mês por dependente, depois Y cada.
            </Typography>
            <Stack spacing={2}>
              {([['freeCost', 'Free: créditos por envio'], ['premiumFreeQuota', 'Premium: envios grátis/mês'], ['premiumCost', 'Premium: créditos após a cota']] as const).map(([key, label]) => (
                <Stack key={key} direction="row" spacing={2} alignItems="center" useFlexGap flexWrap="wrap">
                  <Typography sx={{ flex: 1, minWidth: 200 }}>{label}</Typography>
                  <TextField type="number" size="small" defaultValue={config.uploadRules?.[key] ?? 0} sx={{ width: 100 }} id={`up-${key}`} />
                </Stack>
              ))}
              <Button variant="contained" onClick={async () => {
                const body: any = { category: 'uploadRules' };
                for (const k of ['freeCost', 'premiumFreeQuota', 'premiumCost']) {
                  const el = document.getElementById(`up-${k}`) as HTMLInputElement;
                  if (el) body[k] = Number(el.value);
                }
                const r = await fetch(`${API_URL}/admin/config/costs`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify(body) });
                if (r.ok) { const d = await r.json(); setConfig({ ...config, uploadRules: d.uploadRules }); notify('Regras de envio atualizadas!', { type: 'success' }); }
                else notify('Erro ao salvar', { type: 'error' });
              }}>Salvar regras de envio</Button>
            </Stack>

            <Typography variant="h6" sx={{ mt: 3 }}>🩺 Custo de compartilhar com médico (por escopo)</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              Soma dos escopos selecionados ao criar um compartilhamento. Reativar/editar = grátis.
            </Typography>
            <Stack spacing={2}>
              {([['exams', '📋 Exames'], ['evolution', '📈 Evolução'], ['alerts', '🚨 Alertas'], ['summary', '🤖 Resumos IA']] as const).map(([key, label]) => (
                <Stack key={key} direction="row" spacing={2} alignItems="center" useFlexGap flexWrap="wrap">
                  <Typography sx={{ flex: 1, minWidth: 200 }}>{label}</Typography>
                  <TextField type="number" size="small" defaultValue={config.shares?.[key] ?? 0} sx={{ width: 100 }} id={`sh-${key}`} />
                  <span style={{ fontSize: 13, color: '#888' }}>créditos</span>
                </Stack>
              ))}
              <Button variant="contained" onClick={async () => {
                const body: any = { category: 'shares' };
                for (const k of ['exams', 'evolution', 'alerts', 'summary']) { const el = document.getElementById(`sh-${k}`) as HTMLInputElement; if (el) body[k] = Number(el.value); }
                const r = await fetch(`${API_URL}/admin/config/costs`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify(body) });
                if (r.ok) { const d = await r.json(); setConfig({ ...config, shares: d.shares }); notify('Custo de compartilhar salvo!', { type: 'success' }); }
                else notify('Erro ao salvar', { type: 'error' });
              }}>Salvar compartilhamento</Button>
            </Stack>

            <Typography variant="h6" sx={{ mt: 3 }}>🎁 Créditos (cadastro / mensal / limite)</Typography>
            <Stack spacing={2}>
              {([['freeSignup', '🆕 Créditos no cadastro (free)'], ['monthly', '💎 Créditos do plano mensal'], ['freeExamLimit', '📤 Limite de exames grátis (paywall)']] as const).map(([key, label]) => (
                <Stack key={key} direction="row" spacing={2} alignItems="center" useFlexGap flexWrap="wrap">
                  <Typography sx={{ flex: 1, minWidth: 200 }}>{label}</Typography>
                  <TextField type="number" size="small" defaultValue={config.grants?.[key] ?? 0} sx={{ width: 100 }} id={`gr-${key}`} />
                </Stack>
              ))}
              <Button variant="contained" onClick={async () => {
                const body: any = { category: 'grants' };
                for (const k of ['freeSignup', 'monthly', 'freeExamLimit']) { const el = document.getElementById(`gr-${k}`) as HTMLInputElement; if (el) body[k] = Number(el.value); }
                const r = await fetch(`${API_URL}/admin/config/costs`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify(body) });
                if (r.ok) { const d = await r.json(); setConfig({ ...config, grants: d.grants }); notify('Grants salvos!', { type: 'success' }); }
                else notify('Erro ao salvar', { type: 'error' });
              }}>Salvar grants</Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* TAB: MÉTRICAS */}
      {tab === 'metrics' && metrics && (
        <Stack spacing={2}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr' }, gap: 1.5 }}>
            {[
              { l: 'Signups', v: metrics.funnel.signups, c: '#0ea5e9' },
              { l: 'Premium ativos', v: metrics.funnel.premiumActive, c: '#20b2aa' },
              { l: 'Conversão free→pago', v: `${metrics.funnel.conversionPct}%`, c: '#8b5cf6' },
              { l: 'MRR (recorrente/mês)', v: `R$ ${(metrics.revenue.mrr ?? 0).toFixed(2).replace('.', ',')}`, c: '#10b981' },
              { l: 'Receita total aprovada', v: `R$ ${(metrics.revenue.total ?? 0).toFixed(2).replace('.', ',')}`, c: '#059669' },
              { l: 'Retenção no vencimento', v: `${metrics.churn.retentionPct}%`, c: '#f59e0b' },
            ].map((k) => (
              <Card key={k.l} sx={{ borderRadius: 3 }}><CardContent>
                <Typography variant="caption" color="text.secondary">{k.l}</Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, color: k.c }}>{k.v}</Typography>
              </CardContent></Card>
            ))}
          </Box>

          <Card sx={{ borderRadius: 3 }}><CardContent>
            <Typography variant="h6" gutterBottom>🔻 Funil (conversão)</Typography>
            {[
              { l: 'Signups verificados', n: metrics.funnel.verified, pct: 100, c: '#0ea5e9' },
              { l: 'Free ativos', n: metrics.funnel.freeActive, pct: metrics.funnel.verified ? (metrics.funnel.freeActive / metrics.funnel.verified) * 100 : 0, c: '#94a3b8' },
              { l: 'Premium ativos', n: metrics.funnel.premiumActive, pct: metrics.funnel.verified ? (metrics.funnel.premiumActive / metrics.funnel.verified) * 100 : 0, c: '#20b2aa' },
            ].map((s) => (
              <Box key={s.l} sx={{ mb: 1.5 }}>
                <Stack direction="row" justifyContent="space-between"><Typography variant="body2">{s.l}</Typography><Typography variant="body2" sx={{ fontWeight: 700 }}>{s.n} ({Math.round(s.pct)}%)</Typography></Stack>
                <Box sx={{ height: 10, borderRadius: 99, bgcolor: '#eef2f7', mt: 0.5, overflow: 'hidden' }}>
                  <Box sx={{ height: '100%', width: `${Math.max(2, s.pct)}%`, bgcolor: s.c, borderRadius: 99 }} />
                </Box>
              </Box>
            ))}
            <Typography variant="caption" color="text.secondary">{metrics.revenue.monthlyPayments} pagamento(s) mensal(is) • {metrics.revenue.creditPurchases} compra(s) de créditos avulsos</Typography>
          </CardContent></Card>

          <Card sx={{ borderRadius: 3 }}><CardContent>
            <Typography variant="h6" gutterBottom>🔁 Retenção no vencimento</Typography>
            <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
              <Box><Typography variant="caption" color="text.secondary">Já assinaram</Typography><Typography variant="h6" sx={{ fontWeight: 800 }}>{metrics.churn.everPremium}</Typography></Box>
              <Box><Typography variant="caption" color="text.secondary">Ainda ativos</Typography><Typography variant="h6" sx={{ fontWeight: 800, color: '#10b981' }}>{metrics.churn.stillActive}</Typography></Box>
              <Box><Typography variant="caption" color="text.secondary">Churn (venceu sem renovar)</Typography><Typography variant="h6" sx={{ fontWeight: 800, color: '#ef4444' }}>{metrics.churn.churned}</Typography></Box>
              <Box><Typography variant="caption" color="text.secondary">Renovações (2+ pagamentos)</Typography><Typography variant="h6" sx={{ fontWeight: 800 }}>{metrics.churn.renewals}</Typography></Box>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Taxa de retenção <strong>{metrics.churn.retentionPct}%</strong> — é o número que o nudge de vencimento ajuda a subir.</Typography>
          </CardContent></Card>

          <Card sx={{ borderRadius: 3 }}><CardContent>
            <Typography variant="h6" gutterBottom>📅 Cohort — conversão por mês de signup</Typography>
            <Table size="small">
              <TableHead><TableRow><TableCell>Mês</TableCell><TableCell align="right">Signups</TableCell><TableCell align="right">Virou Premium</TableCell><TableCell align="right">Conversão</TableCell></TableRow></TableHead>
              <TableBody>
                {(metrics.cohort ?? []).map((c: any) => (
                  <TableRow key={c.month}><TableCell>{c.month}</TableCell><TableCell align="right">{c.signups}</TableCell><TableCell align="right">{c.converted}</TableCell><TableCell align="right">{c.signups ? Math.round((c.converted / c.signups) * 1000) / 10 : 0}%</TableCell></TableRow>
                ))}
                {(!metrics.cohort || metrics.cohort.length === 0) && <TableRow><TableCell colSpan={4} align="center">Sem dados ainda.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>

          <Card sx={{ borderRadius: 3 }}><CardContent>
            <Typography variant="h6" gutterBottom>💰 Receita aprovada por mês</Typography>
            <Table size="small">
              <TableHead><TableRow><TableCell>Mês</TableCell><TableCell align="right">Receita (R$)</TableCell></TableRow></TableHead>
              <TableBody>
                {(metrics.revenueByMonth ?? []).map((r: any) => (
                  <TableRow key={r.month}><TableCell>{r.month}</TableCell><TableCell align="right">{(r.amount ?? 0).toFixed(2).replace('.', ',')}</TableCell></TableRow>
                ))}
                {(!metrics.revenueByMonth || metrics.revenueByMonth.length === 0) && <TableRow><TableCell colSpan={2} align="center">Sem receita ainda.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </Stack>
      )}

      {/* DIALOG: Editar usuário */}
      <Dialog open={!!editUser} onClose={() => setEditUser(null)} PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle>Editar: {editUser?.name || editUser?.email}</DialogTitle>
        <DialogContent>
          <Typography variant="subtitle2" sx={{ mt: 1, mb: 0.5 }}>Créditos</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField type="number" value={editCredits} onChange={(e) => setEditCredits(Number(e.target.value))} size="small" sx={{ width: 120 }} />
            <Button size="small" variant="contained" onClick={saveCredits}>Salvar</Button>
          </Stack>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Plano Premium (data expiração ou vazio = grátis)</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField type="date" value={editPlan} onChange={(e) => setEditPlan(e.target.value)} size="small" InputLabelProps={{ shrink: true }} />
            <Button size="small" variant="contained" onClick={savePlan}>Salvar</Button>
          </Stack>
          <Button size="small" color="error" onClick={() => { setEditPlan('2099-12-31'); }} sx={{ mt: 1 }}>VIP (2099)</Button>
        </DialogContent>
        <DialogActions><Button onClick={() => setEditUser(null)}>Fechar</Button></DialogActions>
      </Dialog>
    </Box>
  );
};
