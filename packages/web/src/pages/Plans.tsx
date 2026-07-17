import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Button, Chip, Alert, Stack, Divider, CircularProgress } from '@mui/material';
import CheckIcon from '@mui/icons-material/CheckCircle';
import BoltIcon from '@mui/icons-material/Bolt';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import DiamondIcon from '@mui/icons-material/Diamond';
import { useNotify, useTranslate } from 'react-admin';
import { useSearchParams } from 'react-router-dom';
import { API_URL, token } from '../config';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { PixModal } from '../components/PixModal';
import { PaymentChooser } from '../components/PaymentChooser';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';

interface Status { active: boolean; planExpiresAt: string | null; examsCount: number; freeExamLimit: number; credits: number; tokensUsed: number; }
interface Pack { id: string; credits: number; price: number; label: string; popular: boolean; }
interface PlanInfo { plans: { id: string; label: string; price: number; periodDays: number }[]; creditPacks: Pack[]; freeExamLimit: number; mercadoPagoEnabled: boolean; }

export const PlansPage = () => {
  const translate = useTranslate();
  const notify = useNotify();
  const [params] = useSearchParams();
  const [status, setStatus] = useState<Status | null>(null);
  const [plans, setPlans] = useState<PlanInfo | null>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [pixPack, setPixPack] = useState<string | null>(null);
  const [chooserPack, setChooserPack] = useState<string | null>(null);
  const [chooserLabel, setChooserLabel] = useState('');
  const [hist, setHist] = useState<any[]>([]);
  const [histPage, setHistPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [histLoading, setHistLoading] = useState(false);
  const [histFilter, setHistFilter] = useState<string>('all');
  const [histTotal, setHistTotal] = useState(0);
  const [dispPage, setDispPage] = useState(1);
  const [histOpen, setHistOpen] = useState(false); // extrato começa recolhido (não auto-expande)

  const loadHistory = async () => {
    setHistLoading(true);
    const h = { Authorization: `Bearer ${token()}` };
    // Carrega TODAS as páginas de uma vez — assim o filtro (client-side) enxerga o histórico inteiro.
    let page = 1; let all: any[] = []; let more = true;
    while (more && page < 50) {
      const r = await fetch(`${API_URL}/billing/credits/history?page=${page}`, { headers: h });
      if (!r.ok) break;
      const d = await r.json();
      all = all.concat(d.items ?? []);
      more = !!d.hasMore;
      setHistTotal(d.total ?? all.length);
      page++;
    }
    setHist(all);
    setHasMore(false);
    setHistPage(1);
    setDispPage(1);
    setHistLoading(false);
  };

  const load = async () => {
    const h = { Authorization: `Bearer ${token()}` };
    const [s, p] = await Promise.all([
      fetch(`${API_URL}/billing/status`, { headers: h }),
      fetch(`${API_URL}/billing/plans`),
    ]);
    if (s.ok) setStatus(await s.json());
    if (p.ok) setPlans(await p.json());
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  // Histórico (lazy): só busca quando o user expande o extrato — Plans abre rápido.
  useEffect(() => { if (histOpen && hist.length === 0 && !histLoading) void loadHistory(); /* eslint-disable-next-line */ }, [histOpen]);

  useEffect(() => {
    if (params.get('status') === 'success') notify('Pagamento aprovado! Plano ativo. 🎉', { type: 'success' });
    if (params.get('status') === 'failure') notify('Pagamento não concluído.', { type: 'error' });
  }, [params, notify]);

  const subscribe = async () => {
    setSubLoading(true);
    try {
      const r = await fetch(`${API_URL}/billing/checkout`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ plan: 'monthly' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha');
      if (d.init_point) {
        if (Capacitor.isNativePlatform()) await Browser.open({ url: d.init_point });
        else window.location.href = d.init_point;
      }
    } catch (e: any) { notify(e.message, { type: 'error' }); }
    finally { setSubLoading(false); }
  };

  const fmt = (d: string) => new Date(d).toLocaleDateString('pt-BR');
  const packs = plans?.creditPacks ?? [];
  const mpOn = plans?.mercadoPagoEnabled ?? false;
  // REVERTIDO: compra PIX volta a funcionar no app Android também.
  // (A Play Store rejeita venda de bem digital sem conta de organização — assumido pelo Edmilson.)
  const isNative = false;

  return (
    <PageContainer width={860}>
      <PageHeader icon={<DiamondIcon />} title={translate('page.plans')}
        subtitle={<>Use à vontade: assine o <strong>mensal</strong> (250 créditos de IA por mês) ou compre <strong>créditos avulsos</strong> via PIX.</>} />

      {/* HERO — saldo centralizado, gradiente esmeralda + profundidade */}
      <Card sx={{ mb: 2.5, borderRadius: 5, overflow: 'hidden', position: 'relative', color: '#fff',
          background: 'linear-gradient(135deg,#0f3d3a 0%,#137a72 55%,#1f9d95 100%)',
          boxShadow: '0 20px 44px rgba(15,61,58,.28)' }}>
        <Box sx={{ position: 'absolute', top: '-45%', right: '-12%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,.16), transparent 70%)', pointerEvents: 'none' }} />
        <CardContent sx={{ position: 'relative', textAlign: 'center', py: { xs: 3.5, md: 4.5 } }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: 2.4, textTransform: 'uppercase', color: 'rgba(255,255,255,.72)' }}>Seus créditos</Typography>
          <Typography sx={{ fontWeight: 800, fontSize: { xs: 52, md: 62 }, lineHeight: 1, mt: 0.5, letterSpacing: '-0.02em', fontFamily: 'Poppins, sans-serif', fontVariantNumeric: 'tabular-nums' }}>{status?.credits ?? 0}</Typography>
          {status?.active
            ? <Box sx={{ display: 'inline-flex', mt: 2.5, alignItems: 'center', gap: 0.75, px: 2, py: 0.85, borderRadius: 99, bgcolor: 'rgba(255,255,255,.16)', backdropFilter: 'blur(8px)', boxShadow: '0 6px 18px rgba(0,0,0,.18)', border: '1px solid rgba(255,255,255,.28)' }}>
                <Box sx={{ fontSize: 14 }}>👑</Box>
                <Typography sx={{ fontWeight: 700, fontSize: 13, letterSpacing: 0.2 }}>Premium ativo até {status.planExpiresAt ? fmt(status.planExpiresAt) : '—'}</Typography>
              </Box>
            : <Typography variant="caption" sx={{ display: 'block', mt: 2.5, color: 'rgba(255,255,255,.75)' }}>Sem assinatura — créditos custeiam a IA.</Typography>}
        </CardContent>
      </Card>

      {/* CONSUMO RECENTE */}
      {( /* Histórico de Uso: sempre visível — load lazy ao expandir */ 
        <Card sx={{ mb: 2, borderRadius: 4 }}><CardContent>
          <Stack direction="row" alignItems="center" justifyContent="space-between" onClick={() => setHistOpen((v) => !v)} sx={{ mb: histOpen ? 1.5 : 0, cursor: 'pointer', userSelect: 'none', '&:hover': { opacity: 0.8 } }}>
            <Typography variant="h6" sx={{ fontWeight: 800, color: 'text.primary', fontSize: 17 }}>Histórico de Uso</Typography>
            <Typography variant="caption" sx={{ color: '#178f89', fontWeight: 700 }}>{histOpen ? 'Ocultar ▲' : histTotal ? `${histTotal} lançamento(s) ▼` : 'Ver histórico ▼'}</Typography>
          </Stack>
          {histOpen && (histLoading ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={22} /></Box> : <>
          {/* Filtros rápidos — segmented control borderless (ativo = verde 14%, inativo = texto sutil) */}
          <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
            {[{ k: 'all', l: 'Todos' }, { k: 'gain', l: '➕ Ganhos' }, { k: 'ai', l: '🤖 IA' }, { k: 'upload', l: '📤 Exames' }, { k: 'achievement', l: '🏆 Conquistas' }, { k: 'referral', l: '🤝 Indicações' }, { k: 'purchase', l: '🛒 Compras' }].map((f) => {
              const on = histFilter === f.k;
              return (
                <Chip key={f.k} size="small" label={f.l} onClick={() => { setHistFilter(f.k); setDispPage(1); }}
                  sx={{ fontWeight: 700, fontSize: 12.5, height: 30, px: 1.25, border: 'none',
                    bgcolor: on ? 'rgba(32,178,170,.14)' : 'transparent',
                    color: on ? '#0f7670' : 'text.secondary',
                    '&:hover': { bgcolor: on ? 'rgba(32,178,170,.2)' : 'rgba(15,23,42,.05)' } }} />
              );
            })}
          </Stack>
          {(() => {
            const META: Record<string, { e: string; c: boolean }> = { purchase: { e: '🛒', c: true }, plan_monthly: { e: '📅', c: true }, achievement: { e: '🏆', c: true }, referral: { e: '🤝', c: true }, signup: { e: '🎁', c: true }, ai_chat: { e: '🤖', c: false }, ai_summary: { e: '📄', c: false }, ai_consolidated: { e: '🧾', c: false }, upload: { e: '📤', c: false }, share: { e: '🩺', c: false }, patient_extra: { e: '👥', c: false } };
            const metaOf = (k: string) => META[k] || { e: '•', c: false };
            const filtered = hist.filter((it: any) => {
              if (histFilter === 'all') return true;
              if (histFilter === 'gain') return metaOf(it.kind).c;
              if (histFilter === 'ai') return String(it.kind).startsWith('ai_');
              if (histFilter === 'upload') return it.kind === 'upload';
              if (histFilter === 'achievement') return it.kind === 'achievement';
              if (histFilter === 'referral') return it.kind === 'referral' || it.kind === 'signup';
              if (histFilter === 'purchase') return it.kind === 'purchase' || it.kind === 'plan_monthly';
              return true;
            });
            const PS = 7;
            const totalPages = Math.max(1, Math.ceil(filtered.length / PS));
            const safePage = Math.min(dispPage, totalPages);
            const pageItems = filtered.slice((safePage - 1) * PS, safePage * PS);
            return (
              <>
                <Stack divider={<Divider />} spacing={0}>
                  {pageItems.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>Nenhum lançamento neste filtro.</Typography>}
                  {pageItems.map((it: any) => {
                    const m = metaOf(it.kind);
                    const d = Number(it.delta) || 0;
                    return (
                      <Stack key={it.id} direction="row" alignItems="center" spacing={1.5} sx={{ py: 1.5 }}>
                        <Box sx={{ fontSize: 19, flexShrink: 0, width: 30, textAlign: 'center' }}>{m.e}</Box>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{it.label}</Typography>
                          <Typography variant="caption" color="text.secondary">{new Date(it.createdAt).toLocaleString('pt-BR')}</Typography>
                        </Box>
                        <Typography sx={{ fontWeight: 800, fontSize: 15, fontVariantNumeric: 'tabular-nums', minWidth: 52, textAlign: 'right', color: m.c ? '#059669' : 'text.secondary' }}>
                          {d > 0 ? `+${d}` : d}
                        </Typography>
                      </Stack>
                    );
                  })}
                </Stack>
                {filtered.length > PS && (
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1.5 }}>
                    <Button size="small" disabled={safePage <= 1 || histLoading} onClick={() => setDispPage(safePage - 1)}>← Anterior</Button>
                    <Typography variant="caption" color="text.secondary">{filtered.length} lançamento(s) • pág. {safePage} de {totalPages}</Typography>
                    <Button size="small" disabled={safePage >= totalPages || histLoading} onClick={() => setDispPage(safePage + 1)}>Próxima →</Button>
                  </Stack>
                )}
              </>
            );
          })()}
          </>)}
        </CardContent></Card>
      )}

      {isNative ? (
        /* Android (Play Store): SEM compra dentro do app — o usuário assina/compra créditos
           pelo SITE. Evita violar a política de pagamentos do Google (Play Billing p/ bens digitais).
           O saldo e o Premium adquirados no site aparecem aqui automaticamente. */
        <Card sx={{ mt: 1, borderRadius: 4, border: '2px dashed #20b2aa', background: 'rgba(32,178,170,0.08)' }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 800, color: '#178f89' }}>💎 Premium e Créditos de IA</Typography>
            <Typography sx={{ mt: 1, fontSize: 15 }}>
              O <strong>Plano Premium</strong> (R$ 19,90/mês) e os <strong>créditos</strong> para a IA são adquirados pelo nosso <strong>site</strong>, com PIX instantâneo.
            </Typography>
            <Typography sx={{ mt: 2, fontWeight: 700 }}>Acesse pelo navegador:</Typography>
            <Typography sx={{ fontFamily: 'monospace', fontSize: 16, bgcolor: 'background.paper', border: '1px solid #cfe9e5', p: 1, borderRadius: 1, mt: 0.5, userSelect: 'all' }}>
              janocaminho.com.br/minhasaude
            </Typography>
            <Alert severity="info" sx={{ mt: 2 }} icon={false}>
              Depois de assinar ou comprar créditos no site, entre no app com o <strong>mesmo login</strong> — o saldo e o Premium aparecem aqui automaticamente.
            </Alert>
          </CardContent>
        </Card>
      ) : (
        <>
      {/* PACOTES DE CRÉDITOS */}
      <Typography variant="h6" sx={{ mt: 1, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}><BoltIcon color="secondary" /> Comprar créditos (PIX instantâneo)</Typography>
      <Stack spacing={2} sx={{ mb: 3, width: '100%' }}>
        {packs.map((p) => (
          <Card key={p.id} sx={{ borderRadius: 4, border: p.popular ? '2px solid #20b2aa' : '1px solid', borderColor: p.popular ? undefined : 'divider', width: '100%' }}>
            {p.popular && <Box sx={{ textAlign: 'center', pt: 1.5 }}><Chip color="primary" label="MAIS VENDIDO" size="small" /></Box>}
            <CardContent sx={{ textAlign: 'center', pt: p.popular ? 1 : 2 }}>
              <Typography sx={{ fontWeight: 800, fontSize: 28, color: 'primary.main', lineHeight: 1.1 }}>{p.credits}</Typography>
              <Typography color="text.secondary">créditos</Typography>
              <Typography variant="h5" sx={{ my: 1, fontWeight: 800 }}>R$ {p.price.toFixed(2).replace('.', ',')}</Typography>
              <Button variant={p.popular ? 'contained' : 'outlined'} fullWidth disabled={!mpOn} onClick={() => { setChooserLabel(`${p.credits} créditos • R$ ${p.price.toFixed(2).replace('.', ',')}`); setChooserPack(p.id); }}>Comprar</Button>
            </CardContent>
          </Card>
        ))}
      </Stack>

      <Typography align="center" color="text.secondary" sx={{ my: 2, fontWeight: 600 }}>— ou assine —</Typography>

      {/* PLANO MENSAL */}
      <Card sx={{ borderRadius: 4, background: 'rgba(32,178,170,0.06)', border: '2px solid #20b2aa' }}>
        <CardContent>
          <Typography variant="h6" sx={{ fontWeight: 800, color: '#178f89' }}>💎 Premium Mensal</Typography>
          <Typography color="text.secondary" sx={{ fontSize: 14, mt: 0.5 }}>
            250 créditos que <strong>somam</strong> ao seu saldo. Válido 30 dias. Seus créditos <strong>não expiram</strong> — você decide se renova.
          </Typography>
          <Box component="ul" sx={{ pl: 2.5, mt: 1.5, mb: 2, lineHeight: 1.8, fontSize: 14 }}>
            <li>250 créditos de IA por mês</li>
            <li>Exames + dependentes</li>
            <li>Relatório completo + impressão</li>
          </Box>
          <Divider sx={{ mb: 2 }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" justifyContent="space-between" useFlexGap flexWrap="wrap">
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 800, color: '#178f89', lineHeight: 1 }}>R$ 19,90</Typography>
              <Typography color="text.secondary" sx={{ fontSize: 13 }}>/mês · sem anual · sem fidelidade</Typography>
            </Box>
            <Button variant="contained" size="large" disabled={!mpOn || subLoading || !!status?.active} onClick={subscribe} sx={{ minWidth: 160 }}>
              {status?.active ? '✓ Ativo' : subLoading ? 'Abrindo…' : 'Assinar mensal'}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {!mpOn && (
        <Alert severity="info" sx={{ mt: 2 }} icon={<CheckIcon />}>
          Em ambiente de teste os pagamentos podem estar desativados. Em produção usamos o mesmo Mercado Pago da sua loja.
        </Alert>
      )}

      <PaymentChooser packId={chooserPack} packLabel={chooserLabel} onClose={() => setChooserPack(null)} onPix={() => setPixPack(chooserPack)} />
      <PixModal packId={pixPack} onClose={() => setPixPack(null)} onApproved={() => { setPixPack(null); notify('Créditos adicionados! 🎉', { type: 'success' }); load(); }} />
        </>
      )}
    </PageContainer>
  );
};
