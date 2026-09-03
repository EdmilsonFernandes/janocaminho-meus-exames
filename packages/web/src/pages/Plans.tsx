import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Button, Chip, Alert, Stack, Divider, CircularProgress } from '@mui/material';
import CheckIcon from '@mui/icons-material/CheckCircle';
import BoltIcon from '@mui/icons-material/Bolt';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import DiamondIcon from '@mui/icons-material/Diamond';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useNotify, useTranslate } from 'react-admin';
import { useSearchParams } from 'react-router-dom';
import { API_URL, token } from '../config';
import { usePlanInfo, fmtBRL } from '../utils/planInfo';
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
  // Preço/perks dinâmicos (admin edita live). planInfo nulo = API indisponível → fallback visual.
  const planInfo = usePlanInfo();
  const crLabel = String(planInfo?.plan?.monthlyCredits ?? 250);
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
  // PIX PENDENTE (padrão gateway): retoma o mesmo QR/timer se o usuário saiu e voltou.
  const [pendingPix, setPendingPix] = useState<any>(null);
  const [, forceTick] = useState(0); // re-render a cada 1s pro timer do PIX vivo

  const checkPendingPix = () => {
    fetch(`${API_URL}/billing/pending-payment`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { setPendingPix(d?.hasPending ? d : null); })
      .catch(() => {});
  };

  useEffect(() => { checkPendingPix(); }, []);

  // Timer ao vivo: só roda quando há PIX pendente (sem custo quando não tem)
  useEffect(() => {
    if (!pendingPix) return;
    const iv = setInterval(() => {
      const left = new Date(pendingPix.expiresAt).getTime() - Date.now();
      if (left <= 0) { setPendingPix(null); return; } // expirou → remove o banner/botão
      forceTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(iv);
  }, [pendingPix]);

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
    <PageContainer width={860} sx={{ pb: { xs: 10, sm: 5 } }}>
      <PageHeader icon={<DiamondIcon />} title={translate('page.plans')}
        subtitle={<>Use à vontade: assine o <strong>mensal</strong> ({crLabel} créditos de IA por mês) ou compre <strong>créditos avulsos</strong> via PIX.</>} />

      {/* PIX PENDENTE (padrão gateway): banner discreto que retoma o mesmo QR/timer.
          Só aparece se o usuário gerou um PIX e saiu sem pagar — SEM criar ordem nova. */}
      {pendingPix && (
        <Alert severity="info" icon={<QrCode2Icon />} sx={{ mb: 2, borderRadius: '16px', alignItems: 'center' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ width: '100%' }}>
            <Typography sx={{ fontSize: 14 }}>
              Você tem um PIX de <strong>{pendingPix.credits} créditos</strong> aguardando pagamento
              {' '}({Math.max(0, Math.ceil((new Date(pendingPix.expiresAt).getTime() - Date.now()) / 60000))} min restantes)
            </Typography>
            <Button size="small" variant="contained" onClick={() => setPixPack('__pending__')} sx={{ textTransform: 'none', fontWeight: 700, flexShrink: 0 }}>
              Retomar pagamento
            </Button>
          </Stack>
        </Alert>
      )}

      {/* HERO — saldo centralizado, gradiente esmeralda + profundidade */}
      <Card sx={{ mb: 3, borderRadius: '24px', overflow: 'hidden', position: 'relative', color: '#fff',
          background: 'linear-gradient(135deg,#0c4a46 0%,#137a72 50%,#178f89 100%)',
          boxShadow: '0 20px 50px rgba(15,61,58,.32)', border: '1px solid rgba(255,255,255,0.2)' }}>
        <Box sx={{ position: 'absolute', top: '-45%', right: '-12%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,.16), transparent 70%)', pointerEvents: 'none' }} />
        <CardContent sx={{ position: 'relative', textAlign: 'center', py: { xs: 3.5, md: 4.5 } }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'rgba(255,255,255,.72)' }}>Seus créditos</Typography>
          <Typography sx={{ fontWeight: 800, fontSize: { xs: 52, md: 62 }, lineHeight: 1, mt: 0.5, letterSpacing: '-0.02em', fontFamily: 'Poppins, sans-serif', fontVariantNumeric: 'tabular-nums' }}>{status?.credits ?? 0}</Typography>
          {status?.active
            ? <Box sx={{ display: 'inline-flex', mt: 2.5, alignItems: 'center', gap: 0.75, px: 2, py: 0.85, borderRadius: '999px', bgcolor: 'rgba(255,255,255,.16)', backdropFilter: 'blur(8px)', boxShadow: '0 6px 18px rgba(0,0,0,.18)', border: '1px solid rgba(255,255,255,.28)' }}>
                <Box sx={{ fontSize: 14 }}>👑</Box>
                <Typography sx={{ fontWeight: 700, fontSize: 13, letterSpacing: 0.2 }}>Premium ativo até {status.planExpiresAt ? fmt(status.planExpiresAt) : '—'}</Typography>
              </Box>
            : <Typography variant="caption" sx={{ display: 'block', mt: 2.5, color: 'rgba(255,255,255,.75)' }}>Sem assinatura — créditos custeiam a IA.</Typography>}
        </CardContent>
      </Card>

      {/* CONSUMO RECENTE */}
      {( /* Histórico de Uso: sempre visível — load lazy ao expandir */ 
        <Card sx={{ mb: 2, borderRadius: '12px' }}><CardContent>
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
                  sx={{ fontWeight: 700, fontSize: 13, height: 30, px: 1.25, border: 'none',
                    bgcolor: on ? 'rgba(32,178,170,.14)' : 'transparent',
                    color: on ? '#0f766e' : 'text.secondary',
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
        <Card sx={{ mt: 1, borderRadius: '12px', border: '2px dashed #20b2aa', background: 'rgba(32,178,170,0.08)' }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 800, color: '#178f89' }}>💎 Premium e Créditos de IA</Typography>
            <Typography sx={{ mt: 1, fontSize: 15 }}>
              O <strong>Plano Premium</strong> ({planInfo?.plan ? fmtBRL(planInfo.plan.effectivePrice) : 'R$ 19,90'}/mês) e os <strong>créditos</strong> para a IA são adquirados pelo nosso <strong>site</strong>, com PIX instantâneo.
            </Typography>
            <Typography sx={{ mt: 2, fontWeight: 700 }}>Acesse pelo navegador:</Typography>
            <Box component="a" href="https://drexame.janocaminho.com.br" target="_blank" rel="noopener noreferrer" sx={{ display: 'block', fontFamily: 'monospace', fontSize: 16, bgcolor: 'background.paper', border: '1px solid #cfe9e5', p: 1, borderRadius: '8px', mt: 0.5, userSelect: 'all', textDecoration: 'none', color: 'primary.dark', '&:hover': { textDecoration: 'underline', borderColor: 'primary.main' } }}>
              drexame.janocaminho.com.br
            </Box>
            <Alert severity="info" sx={{ mt: 2 }} icon={false}>
              Depois de assinar ou comprar créditos no site, entre no app com o <strong>mesmo login</strong> — o saldo e o Premium aparecem aqui automaticamente.
            </Alert>
          </CardContent>
        </Card>
      ) : (
        <>
      {/* PACOTES DE CRÉDITOS */}
      <Typography variant="h6" sx={{ mt: 1, mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}><BoltIcon color="secondary" /> Comprar créditos (PIX instantâneo)</Typography>
      {/* Auditoria: faltava dizer O QUE consome créditos e quanto — transparencia total de custos.
          Valores padrão do AppSetting creditCosts (admin pode ajustar no painel; upstream envia
          junto no billing/status quando disponível). */}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5, lineHeight: 1.5 }}>
        O que consome: 💬 pergunta no chat <b>2</b> · ✨ resumo do exame <b>10</b> · 🧾 relatório completo <b>20</b>. Enviar exame é <b>grátis</b>.
      </Typography>
      <Stack spacing={2} sx={{ mb: 3, width: '100%' }}>
        {packs.map((p) => {
          // PIX PENDENTE deste pacote? O botão vira "Retomar pagamento" com timer
          const isPending = pendingPix && pendingPix.credits === p.credits && pendingPix.price === p.price;
          const secsLeft = isPending ? Math.max(0, Math.floor((new Date(pendingPix.expiresAt).getTime() - Date.now()) / 1000)) : 0;
          const mmLeft = String(Math.floor(secsLeft / 60)).padStart(2, '0');
          const ssLeft = String(secsLeft % 60).padStart(2, '0');
          return (
          <Card key={p.id} sx={{ borderRadius: '12px', border: isPending ? '2px solid #d97706' : p.popular ? '2px solid #20b2aa' : '1px solid', borderColor: isPending ? undefined : p.popular ? undefined : 'divider', width: '100%', position: 'relative', bgcolor: isPending ? 'rgba(217,119,6,0.04)' : undefined }}>
            {isPending && <Box sx={{ textAlign: 'center', pt: 1.5 }}><Chip label="⏳ Aguardando pagamento" size="small" sx={{ fontWeight: 700, bgcolor: 'rgba(217,119,6,.15)', color: '#92400e' }} /></Box>}
            {!isPending && p.popular && <Box sx={{ textAlign: 'center', pt: 1.5 }}><Chip color="primary" label="MAIS VENDIDO" size="small" /></Box>}
            <CardContent sx={{ textAlign: 'center', pt: isPending || p.popular ? 1 : 2 }}>
              <Typography sx={{ fontWeight: 800, fontSize: 28, color: 'primary.main', lineHeight: 1.1 }}>{p.credits}</Typography>
              <Typography color="text.secondary">créditos</Typography>
              <Typography variant="h5" sx={{ my: 1, fontWeight: 800 }}>R$ {p.price.toFixed(2).replace('.', ',')}</Typography>
              {isPending ? (
                <Stack spacing={0.75}>
                  {/* ÂMBAR = ação pendente (vs teal = comprar). Não confunde com os outros cards. */}
                  <Button variant="contained" fullWidth onClick={() => setPixPack('__pending__')}
                    startIcon={<QrCode2Icon />}
                    sx={{ bgcolor: '#d97706', '&:hover': { bgcolor: '#b45309' }, textTransform: 'none', fontWeight: 800, boxShadow: '0 4px 12px rgba(217,119,6,.3)' }}>
                    Abrir QR Code · {mmLeft}:{ssLeft}
                  </Button>
                  {/* Copia-cola inline: copia SEM abrir o modal (1 toque) */}
                  <Button size="small" variant="outlined" fullWidth
                    startIcon={<ContentCopyIcon fontSize="small" />}
                    onClick={() => { navigator.clipboard?.writeText(pendingPix.qrCode || ''); notify('Código PIX copiado! Cole no app do banco.', { type: 'success' }); }}
                    sx={{ textTransform: 'none', fontWeight: 700, fontSize: 12, borderColor: 'rgba(217,119,6,.4)', color: '#b45309', '&:hover': { borderColor: '#d97706', bgcolor: 'rgba(217,119,6,.06)' } }}>
                    Copiar código PIX
                  </Button>
                </Stack>
              ) : (
                <Button variant={p.popular ? 'contained' : 'outlined'} fullWidth disabled={!mpOn} onClick={() => { setChooserLabel(`${p.credits} créditos • R$ ${p.price.toFixed(2).replace('.', ',')}`); setChooserPack(p.id); }}>Comprar</Button>
              )}
            </CardContent>
          </Card>
          );
        })}
      </Stack>

      <Typography align="center" color="text.secondary" sx={{ my: 2, fontWeight: 600 }}>— ou assine —</Typography>

      {/* PLANO MENSAL — preço/perks da API (admin edita live; zero hardcode). */}
      <Card sx={{ borderRadius: '12px', background: 'rgba(32,178,170,0.06)', border: '2px solid #20b2aa' }}>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
            <Typography variant="h6" sx={{ fontWeight: 800, color: '#178f89' }}>💎 Premium Mensal</Typography>
            {planInfo?.plan?.founder && (
              <Chip size="small" label={`🎯 Plano Fundador: restam ${planInfo.plan.founderRemaining} vagas`} sx={{ fontWeight: 800, bgcolor: 'rgba(212,165,116,.18)', color: '#8a5a1f' }} />
            )}
          </Stack>
          <Typography color="text.secondary" sx={{ fontSize: 14, mt: 0.5 }}>
            {crLabel} créditos que <strong>somam</strong> ao seu saldo e <strong>não expiram</strong> — o plano vale 30 dias e você decide se renova. Sem fidelidade.
          </Typography>
          <Box component="ul" sx={{ pl: 2.5, mt: 1.5, mb: 2, lineHeight: 1.8, fontSize: 14 }}>
            <li><strong>{crLabel} créditos de IA</strong> por mês (melhor custo por crédito)</li>
            <li>📄 Relatórios completos <strong>incluídos</strong> — sem gastar créditos</li>
            <li>📅 Histórico completo (exames de anos anteriores)</li>
            <li>👨‍👩‍👧 Família até {planInfo?.premiumPerks?.familyLimit ?? 10} perfis</li>
            <li>📤 Envios de exame sem custo</li>
          </Box>
          <Divider sx={{ mb: 2 }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" justifyContent="space-between" useFlexGap flexWrap="wrap">
            <Box>
              {planInfo?.plan?.founder && planInfo.plan.price !== planInfo.plan.effectivePrice && (
                <Typography sx={{ color: 'text.disabled', textDecoration: 'line-through', fontSize: 16 }}>{fmtBRL(planInfo.plan.price)}</Typography>
              )}
              <Typography variant="h4" sx={{ fontWeight: 800, color: '#178f89', lineHeight: 1 }}>
                {planInfo?.plan ? fmtBRL(planInfo.plan.effectivePrice) : 'R$ —'}
              </Typography>
              <Typography color="text.secondary" sx={{ fontSize: 13 }}>/mês · sem anual · sem fidelidade · PIX ou cartão</Typography>
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
      {/* '__pending__' = retomar PIX existente (não gera ordem nova — o server é idempotente) */}
      <PixModal
        packId={pixPack}
        existingPix={pixPack === '__pending__' ? pendingPix : undefined}
        onClose={() => { setPixPack(null); checkPendingPix(); }}
        onApproved={() => { setPixPack(null); setPendingPix(null); notify('Créditos adicionados! 🎉', { type: 'success' }); load(); }}
      />
        </>
      )}
    </PageContainer>
  );
};
