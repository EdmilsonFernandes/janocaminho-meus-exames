import { useEffect, useState } from 'react';
import {
  Box, Button, Card, CardContent, Typography, Stack, Chip, TextField, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Alert,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Title, useTranslate } from 'react-admin';
import { PageContainer } from '../components/layout/PageContainer';
import { API_URL, token } from '../config';
import { DrExame } from '../components/DrExame';
import ApiIcon from '@mui/icons-material/Api';
import KeyIcon from '@mui/icons-material/Key';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import BoltIcon from '@mui/icons-material/Bolt';

const H = () => ({ Authorization: `Bearer ${token()}` });
const fmt = (d: string | null) => (d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

const ENDPOINTS = [
  { m: 'GET', p: '/meds?q=dipirona', d: 'Catálogo com melhor preço, foto e EAN' },
  { m: 'GET', p: '/meds/prices?ingredient=…', d: 'Preços por farmácia (snapshot com stale honesto)' },
  { m: 'GET', p: '/meds/interactions?drugs=…', d: 'Interações D/X entre remédios' },
];

/**
 * Painel self-service da API pública — mata o "funil só via curl": o parceiro solicita
 * acesso, acompanha a aprovação, cria/revoga chaves, vê o saldo pré-pago e compra
 * pacotes de chamadas com o MESMO PIX/cartão do app. Documentação completa: /api/docs.
 */
export const ApiPanelPage = () => {
  const translate = useTranslate();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null); // GET /keys → { keys, access, balance, packs }
  const [authed, setAuthed] = useState(true); // 401 → mostra CTA de login (funil da landing)
  const [pendingPix, setPendingPix] = useState<any>(null); // PIX de API ainda válido (retomada)
  const [company, setCompany] = useState('');
  const [useCase, setUseCase] = useState('');
  const [sending, setSending] = useState(false);

  // criação de chave
  const [keyName, setKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  // compra PIX
  const [pix, setPix] = useState<any>(null); // { qrBase64, qrCode, expiresAt, calls, price }
  const [buying, setBuying] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await fetch(`${API_URL}/public/v1/keys`, { headers: H() });
      if (r.status === 401) { setAuthed(false); setLoading(false); return; }
      if (r.ok) setData(await r.json());
      // PIX de pacote ainda válido → banner de retomada (mesmo QR, sem ordem nova).
      const pp = await fetch(`${API_URL}/billing/pending-api-pack`, { headers: H() });
      if (pp.ok) { const d = await pp.json(); if (d.hasPending) setPendingPix(d); }
    } catch { /* offline */ }
    setLoading(false);
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  // countdown do PIX (ticka enquanto houver PIX aberto OU pendente no card — igual ao Plans).
  // Expirou (dialog OU card) → recarrega o estado: cards voltam a "comprar" SEM refresh manual.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!pix && !pendingPix) return;
    const iv = setInterval(() => {
      if (pix && new Date(pix.expiresAt).getTime() - Date.now() <= 0) { setPix(null); void load(); return; }
      if (!pix && pendingPix && new Date(pendingPix.expiresAt).getTime() - Date.now() <= 0) { void load(); return; }
      forceTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(iv);
  }, [pix, pendingPix]);

  // POLLING enquanto há PIX pendente: o webhook do MP aprova em segundos após o pagamento —
  // o painel percebe sozinho (saldo sobe, card limpa) sem F5 e sem "Já paguei".
  useEffect(() => {
    if (!pendingPix) return;
    const iv = setInterval(() => { void load(); }, 5000);
    return () => clearInterval(iv);
    /* eslint-disable-next-line */
  }, [!!pendingPix]);

  const mmss = (expiresAt: string) => {
    const secs = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
    return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  };

  // Volta do app do banco (pagou o PIX lá fora) → estado reflete na hora, sem F5.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
    /* eslint-disable-next-line */
  }, []);

  const requestAccess = async () => {
    setSending(true);
    try {
      const r = await fetch(`${API_URL}/public/v1/access-request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...H() },
        body: JSON.stringify({ company, useCase }),
      });
      if (r.ok) await load();
    } catch { /* */ }
    setSending(false);
  };

  const createKey = async () => {
    setSending(true);
    try {
      const r = await fetch(`${API_URL}/public/v1/keys`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...H() },
        body: JSON.stringify({ name: keyName || 'Minha integração' }),
      });
      const d = await r.json();
      if (r.ok) { setCreatedKey(d.key); setKeyName(''); await load(); }
    } catch { /* */ }
    setSending(false);
  };

  const revokeKey = async (id: string) => {
    await fetch(`${API_URL}/public/v1/keys/${id}`, { method: 'DELETE', headers: H() }).catch(() => {});
    await load();
  };

  const buyPack = async (packId: string, method: 'pix' | 'card') => {
    setBuying(packId);
    try {
      const r = await fetch(`${API_URL}/billing/buy-api-pack`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...H() },
        body: JSON.stringify({ pack: packId, method }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (method === 'pix') setPix(d);
      else if (d.init_point) {
        if (Capacitor.isNativePlatform()) await Browser.open({ url: d.init_point });
        else window.location.href = d.init_point;
      }
    } catch { /* */ }
    setBuying(null);
  };

  if (loading) return <PageContainer><Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box></PageContainer>;

  // Funil da landing sem login: convite a entrar/criar conta e VOLTA pro painel (dxAfterLogin).
  if (!authed) {
    const go = (path: string) => { try { localStorage.setItem('dxAfterLogin', '/api'); } catch { /* */ } navigate(path); };
    return (
      <PageContainer width={560}>
        <Title title="API Dr. Exame" />
        <Card variant="outlined" sx={{ borderRadius: '14px' }}>
          <CardContent sx={{ textAlign: 'center', py: 5, px: 3 }}>
            <Box sx={{ width: 76, height: 76, mx: 'auto', mb: 2, borderRadius: '50%', bgcolor: 'rgba(32,178,170,.12)', display: 'grid', placeItems: 'center' }}>
              <ApiIcon sx={{ fontSize: 36, color: '#178f89' }} />
            </Box>
            <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 20 }}>API do Dr. Exame</Typography>
            <Typography color="text.secondary" sx={{ fontSize: 14, mt: 0.75, mb: 2.5, maxWidth: 380, mx: 'auto' }}>
              Preço real de farmácia e interações D/X no seu produto. Crie uma conta pra solicitar acesso — você volta direto pra cá.
            </Typography>
            <Stack direction="row" spacing={1.5} justifyContent="center" useFlexGap flexWrap="wrap">
              <Button variant="contained" onClick={() => go('/registrar')} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, px: 3.5 }}>Criar conta e solicitar</Button>
              <Button variant="outlined" onClick={() => go('/entrar')} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, px: 3.5, borderColor: '#d8f4f2', color: '#178f89' }}>Já tenho conta</Button>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2.5 }}>
              Documentação pública: <Box component="a" href="/api/docs" target="_blank" rel="noopener noreferrer" sx={{ color: '#178f89', fontWeight: 700 }}>/api/docs</Box>
            </Typography>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  const access = data?.access?.status ?? 'none';
  const approved = access === 'approved';
  const balance = data?.balance?.calls ?? 0;
  const packs = data?.packs ?? [];

  return (
    <PageContainer width={860}>
      <Title title="API Dr. Exame" />

      {/* HERO */}
      <Box sx={{
        position: 'relative', overflow: 'hidden', mb: 3,
        borderRadius: '18px', p: { xs: 2.5, md: 3.5 },
        background: 'linear-gradient(135deg,#0f5f5a 0%,#137a72 55%,#178f89 100%)',
        color: '#fff',
      }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Box sx={{ width: 64, height: 64, flexShrink: 0, borderRadius: '50%', bgcolor: 'rgba(255,255,255,.18)', border: '2px solid rgba(255,255,255,.35)', display: 'grid', placeItems: 'center' }}>
            <ApiIcon sx={{ fontSize: 30 }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: { xs: 20, md: 24 }, lineHeight: 1.15 }}>API do Dr. Exame</Typography>
            <Typography sx={{ fontSize: 13.5, opacity: 0.9, mt: 0.5 }}>
              Preço real de farmácia + interações D/X no seu produto. Documentação completa em <Box component="a" href="/api-docs" sx={{ color: '#fff', fontWeight: 700, textDecoration: 'underline' }}>/api-docs</Box> · console interativo em <Box component="a" href="/api/docs" target="_blank" rel="noopener noreferrer" sx={{ color: '#fff', fontWeight: 700, textDecoration: 'underline' }}>/api/docs</Box>.
            </Typography>
          </Box>
          {approved && (
            <Box sx={{ textAlign: 'center', flexShrink: 0, px: 2, py: 1.25, borderRadius: '14px', bgcolor: 'rgba(255,255,255,.16)', border: '1px solid rgba(255,255,255,.28)' }}>
              <Typography sx={{ fontSize: 10.5, letterSpacing: 1, fontWeight: 700, opacity: 0.85 }}>SALDO</Typography>
              <Typography sx={{ fontWeight: 800, fontSize: 26, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{balance.toLocaleString('pt-BR')}</Typography>
              <Typography sx={{ fontSize: 10.5, opacity: 0.85 }}>chamadas</Typography>
            </Box>
          )}
        </Stack>
      </Box>

      {/* SEM APROVAÇÃO — showcase + formulário de solicitação */}
      {!approved && (
        <Card variant="outlined" sx={{ borderRadius: '14px', mb: 2.5 }}>
          <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
            {access === 'pending' ? (
              <Stack alignItems="center" spacing={1.5} sx={{ py: 3, textAlign: 'center' }}>
                <Chip color="warning" label="⏳ Solicitação em análise" sx={{ fontWeight: 800 }} />
                <Typography color="text.secondary" sx={{ fontSize: 14.5, maxWidth: 420 }}>
                  Recebemos seu pedido — analisamos e liberamos o pacote de teste (25 chamadas). Você recebe a resposta no e-mail da conta, e esta tela atualiza sozinha.
                </Typography>
              </Stack>
            ) : (
              <>
                {access === 'rejected' && (
                  <Alert severity="warning" sx={{ mb: 2, borderRadius: '12px' }}>
                    Solicitação anterior não foi aprovada{data?.access?.note ? `: “${data.access.note}”` : '.'} Se seu caso mudou, solicite de novo abaixo.
                  </Alert>
                )}
                <Typography sx={{ fontWeight: 800, fontSize: 17, mb: 0.5 }}>
                  {access === 'rejected' ? 'Solicitar novamente' : 'Solicitar acesso'}
                </Typography>
                <Typography color="text.secondary" sx={{ fontSize: 14, mb: 2 }}>
                  Conte quem você é e o que vai construir. Na aprovação você ganha <b>25 chamadas de teste</b> e pode criar chaves.
                </Typography>
                <Stack spacing={1.5} sx={{ mb: 2.5 }}>
                  {ENDPOINTS.map((e) => (
                    <Stack key={e.p} direction="row" spacing={1.25} alignItems="center" sx={{ borderRadius: '12px', bgcolor: 'action.hover', px: 1.5, py: 1 }}>
                      <Chip size="small" label={e.m} sx={{ height: 20, fontWeight: 800, fontSize: 10, bgcolor: 'rgba(32,178,170,.14)', color: '#178f89' }} />
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5, fontWeight: 700, wordBreak: 'break-all' }}>{e.p}</Typography>
                        <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>{e.d}</Typography>
                      </Box>
                    </Stack>
                  ))}
                </Stack>
                <Stack spacing={1.5}>
                  <TextField label="Empresa / projeto" size="small" value={company} onChange={(e) => setCompany(e.target.value)} fullWidth placeholder="Ex.: Portal Saúde XYZ" />
                  <TextField label="O que você vai construir?" size="small" value={useCase} onChange={(e) => setUseCase(e.target.value)} multiline minRows={2} fullWidth placeholder="Ex.: comparador de preço de remédios no meu site" helperText="Mínimo 10 caracteres — é o que acelera a aprovação." />
                  <Button variant="contained" disabled={sending || company.trim().length < 2 || useCase.trim().length < 10} onClick={() => void requestAccess()} sx={{ alignSelf: 'flex-start', borderRadius: '12px', textTransform: 'none', fontWeight: 800, px: 3 }}>
                    {sending ? <CircularProgress size={18} color="inherit" /> : 'Enviar solicitação'}
                  </Button>
                </Stack>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* APROVADO — chaves + pacotes */}
      {approved && (
        <>
          <Card variant="outlined" sx={{ borderRadius: '14px', mb: 2.5 }}>
            <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                <KeyIcon sx={{ color: '#178f89', fontSize: 20 }} />
                <Typography sx={{ fontWeight: 800, fontSize: 17 }}>Suas chaves</Typography>
                <Box sx={{ flex: 1 }} />
                <Button size="small" variant="contained" onClick={() => setCreatedKey('__form__')} sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '999px' }}>+ Nova chave</Button>
              </Stack>
              {(data?.keys ?? []).filter((k: any) => !k.revokedAt).length === 0 ? (
                <Typography color="text.secondary" sx={{ fontSize: 14, py: 2, textAlign: 'center' }}>
                  Nenhuma chave ativa. Crie a primeira pra começar a chamar a API.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {(data?.keys ?? []).map((k: any) => (
                    <Stack key={k.id} direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ borderRadius: '12px', border: '1px solid', borderColor: 'divider', px: 1.5, py: 1 }}>
                      <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, fontWeight: 700 }}>{k.prefix}…</Typography>
                      <Typography variant="caption" color="text.secondary">{k.name} · último uso {k.lastUsedAt ? fmt(k.lastUsedAt) : 'nunca'}</Typography>
                      <Box sx={{ flex: 1 }} />
                      {k.revokedAt
                        ? <Chip size="small" label="revogada" sx={{ height: 22 }} />
                        : <Button size="small" color="error" sx={{ textTransform: 'none' }} onClick={() => void revokeKey(k.id)}>Revogar</Button>}
                    </Stack>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>

          {/* PACOTES pré-pagos */}
          <Card variant="outlined" sx={{ borderRadius: '14px' }}>
            <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                <BoltIcon sx={{ color: '#b88a54', fontSize: 20 }} />
                <Typography sx={{ fontWeight: 800, fontSize: 17 }}>Recarregar chamadas</Typography>
              </Stack>
              <Typography color="text.secondary" sx={{ fontSize: 13.5, mb: 2 }}>
                Pré-pago sem surpresa: quando o saldo acaba, a API responde 402 até você recarregar. PIX na hora ou cartão/débito no checkout seguro.
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5 }}>
                {packs.map((p: any) => {
                  // PIX PENDENTE deste pacote? O card vira "Aguardando pagamento" com countdown
                  // e o botão primário vira RETOMAR (mesmo QR, sem ordem nova) — igual ao Plans.
                  // Os OUTROS cards DESABILITAM (1 PIX por vez — clicar em outro durante a espera
                  // abria o PIX pendente de outro pacote, confusão relatada pelo dono).
                  const isPending = pendingPix && Number(pendingPix.calls) === Number(p.calls) && Number(pendingPix.price) === Number(p.price);
                  const blocked = !!pendingPix && !isPending;
                  const ptLabel = ({ Starter: 'Inicial', Pro: 'Profissional', Scale: 'Grande volume' } as Record<string, string>)[String(p.label)] ?? p.label;
                  return (
                  <Box key={p.id} sx={{
                    borderRadius: '14px', border: isPending ? '2px solid #d97706' : p.popular ? '2px solid #20b2aa' : '1px solid',
                    borderColor: isPending ? undefined : p.popular ? '#20b2aa' : 'divider',
                    p: 2, textAlign: 'center', position: 'relative',
                    bgcolor: isPending ? 'rgba(217,119,6,0.04)' : undefined,
                    ...(p.popular ? { background: 'linear-gradient(135deg,rgba(32,178,170,.10),rgba(212,165,116,.08))' } : {}),
                  }}>
                    {isPending
                      ? <Chip size="small" label="⏳ Aguardando pagamento" sx={{ fontWeight: 800, fontSize: 10, height: 22, bgcolor: 'rgba(217,119,6,.15)', color: '#92400e' }} />
                      : p.popular ? <Chip size="small" label="MAIS VENDIDO" sx={{ bgcolor: '#20b2aa', color: '#fff', fontWeight: 800, fontSize: 10, height: 22 }} /> : <Box sx={{ height: 22 }} />}
                    <Typography sx={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 1, color: '#b88a54', mt: 1 }}>{String(ptLabel).toUpperCase()}</Typography>
                    <Typography sx={{ fontWeight: 800, fontSize: 24, mt: 0.5 }}>{Number(p.calls).toLocaleString('pt-BR')}</Typography>
                    <Typography sx={{ fontSize: 11.5, color: 'text.secondary', mb: 1.5 }}>chamadas · R$ {Number(p.price).toFixed(2).replace('.', ',')}</Typography>
                    {isPending ? (
                      <Stack spacing={0.75}>
                        {/* Countdown de verdade (mm:ss, tickando) — igual ao PIX de créditos. */}
                        <Typography sx={{ fontWeight: 800, fontSize: 26, fontVariantNumeric: 'tabular-nums', color: '#92400e', lineHeight: 1 }}>
                          {mmss(pendingPix.expiresAt)}
                        </Typography>
                        <Button size="small" variant="contained" fullWidth onClick={() => setPix(pendingPix)} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, bgcolor: '#d97706', '&:hover': { bgcolor: '#b45309' } }}>
                          Retomar pagamento
                        </Button>
                      </Stack>
                    ) : (
                      <Stack spacing={0.75}>
                        <Button size="small" variant="contained" disabled={buying === p.id || blocked} onClick={() => void buyPack(p.id, 'pix')} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>
                          {buying === p.id ? <CircularProgress size={15} color="inherit" /> : 'PIX (na hora)'}
                        </Button>
                        <Button size="small" disabled={buying === p.id || blocked} onClick={() => void buyPack(p.id, 'card')} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, borderColor: '#d8f4f2', color: '#178f89' }} variant="outlined">
                          {blocked ? 'Aguarde o PIX atual' : 'Cartão / débito'}
                        </Button>
                      </Stack>
                    )}
                  </Box>
                  );
                })}
              </Box>
            </CardContent>
          </Card>
        </>
      )}

      {/* DIALOG: criar chave → mostra UMA vez */}
      <Dialog open={createdKey === '__form__'} onClose={() => setCreatedKey(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>Nova chave</DialogTitle>
        <DialogContent>
          <TextField label="Nome (pra que serve)" size="small" value={keyName} onChange={(e) => setKeyName(e.target.value)} fullWidth autoFocus sx={{ mt: 0.5 }} placeholder="Ex.: Produção: portal" />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setCreatedKey(null)} sx={{ textTransform: 'none' }}>Cancelar</Button>
          <Button variant="contained" disabled={sending} onClick={() => void createKey()} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 800 }}>
            {sending ? <CircularProgress size={16} color="inherit" /> : 'Criar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* DIALOG: chave criada (exibe 1 vez com copiar) */}
      <Dialog open={!!createdKey && createdKey !== '__form__'} onClose={() => setCreatedKey(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>🔑 Chave criada: guarde agora</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 1.5, borderRadius: '12px' }}>Esta chave <b>não será exibida novamente</b>. Copie e guarde em segredo (como uma senha).</Alert>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ borderRadius: '12px', bgcolor: 'action.hover', p: 1.25 }}>
            <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5, wordBreak: 'break-all', flex: 1 }}>{createdKey}</Typography>
            <IconButton size="small" onClick={() => { void navigator.clipboard?.writeText(createdKey ?? ''); }} aria-label="Copiar"><ContentCopyIcon sx={{ fontSize: 18, color: '#178f89' }} /></IconButton>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            Use no header das chamadas: <code>x-api-key: {String(createdKey ?? '').slice(0, 16)}…</code> (exemplos em /api/docs).
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button variant="contained" onClick={() => setCreatedKey(null)} startIcon={<CheckCircleIcon />} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 800 }}>Guardei: fechar</Button>
        </DialogActions>
      </Dialog>

      {/* DIALOG: PIX do pacote — FECHAR também atualiza o card (aguardando/call back) sem F5. */}
      <Dialog open={!!pix} onClose={() => { setPix(null); void load(); }} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 800, pb: 0.5, textAlign: 'center' }}>
          PIX: {pix?.calls?.toLocaleString('pt-BR')} chamadas
          {pix?.resumed && <Chip size="small" label="mesmo código de antes" sx={{ ml: 1, height: 20, fontSize: 10, fontWeight: 700, bgcolor: 'rgba(217,119,6,.15)', color: '#92400e' }} />}
        </DialogTitle>
        <DialogContent sx={{ textAlign: 'center' }}>
          {pix?.qrBase64 && <Box component="img" src={pix.qrBase64} alt="QR Code PIX" sx={{ width: 'min(230px, 64vw)', aspectRatio: '1 / 1', height: 'auto', borderRadius: '12px', bgcolor: '#fff', p: 1, my: 1 }} />}
          {pix && new Date(pix.expiresAt).getTime() - Date.now() > 0 ? (
            <Typography sx={{ fontWeight: 800, fontSize: 30, fontVariantNumeric: 'tabular-nums', color: '#92400e', lineHeight: 1.1 }}>
              {mmss(pix.expiresAt)}
            </Typography>
          ) : (
            <Alert severity="warning" sx={{ borderRadius: '12px', mt: 1 }}>PIX expirado — feche e gere um novo (os pacotes voltam liberados).</Alert>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5, mt: 0.5 }}>
            Confirmação automática após o pagamento
          </Typography>
          <Button size="small" variant="outlined" startIcon={<ContentCopyIcon />} onClick={() => { void navigator.clipboard?.writeText(pix?.qrCode ?? ''); }} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>
            Copiar código PIX
          </Button>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 2.5 }}>
          <Button onClick={() => setPix(null)} sx={{ textTransform: 'none' }}>Fechar</Button>
          <Button variant="contained" onClick={() => void load()} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 800 }}>Já paguei — atualizar</Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
};
