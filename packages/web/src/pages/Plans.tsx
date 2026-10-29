import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Button, Alert, Stack } from '@mui/material';
import CheckIcon from '@mui/icons-material/CheckCircle';
import BoltIcon from '@mui/icons-material/Bolt';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import DiamondIcon from '@mui/icons-material/Diamond';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useNotify, useTranslate } from 'react-admin';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API_URL, token, fetchPublicConfig } from '../config';
import { usePlanInfo, fmtBRL } from '../utils/planInfo';
import { PixModal } from '../components/PixModal';
import { PaymentChooser } from '../components/PaymentChooser';
import { PlanRadioCards } from '../components/PlanRadioCards';
import { PlanComparison } from '../components/PlanComparison';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { tealText } from '../theme';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import AllInclusiveIcon from '@mui/icons-material/AllInclusive';

/** Entrada escalonada dos cards (respeita prefers-reduced-motion). */
const fadeUp = (i: number) => ({
  '@keyframes plFadeUp': { from: { opacity: 0, transform: 'translateY(10px)' }, to: { opacity: 1, transform: 'none' } },
  animation: 'plFadeUp .45s cubic-bezier(.22,1,.36,1) both',
  animationDelay: `${i * 70}ms`,
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
});
const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`;

interface Status { active: boolean; planExpiresAt: string | null; examsCount: number; freeExamLimit: number; credits: number; tokensUsed: number; }
interface Pack { id: string; credits: number; price: number; label: string; popular: boolean; }
interface PlanInfo { plans: { id: string; label: string; price: number; periodDays: number }[]; creditPacks: Pack[]; freeExamLimit: number; mercadoPagoEnabled: boolean; }

export const PlansPage = () => {
  const translate = useTranslate();
  const navigate = useNavigate();
  const notify = useNotify();
  const [params] = useSearchParams();
  const [status, setStatus] = useState<Status | null>(null);
  const [plans, setPlans] = useState<PlanInfo | null>(null);
  // Preço/perks dinâmicos (admin edita live). planInfo nulo = API indisponível → fallback visual.
  const planInfo = usePlanInfo();
  const crLabel = String(planInfo?.plan?.monthlyCredits ?? 250);
  // Régua da linguagem de produto (18/10): 1 leitura = custo do resumo (settings). Packs e
  // mensal falam em LEITURAS na vitrine; créditos 💎 seguem como detalhe (saldo nunca muda).
  const summaryCost = Number(planInfo?.summaryCost ?? 0); // Number(undefined)=NaN sem narrowing — CI pescou
  const rd = Math.max(1, summaryCost > 0 ? summaryCost : 10);
  const monthlyReads = Math.floor((Number(planInfo?.plan?.monthlyCredits) || 250) / rd);
  const [pixPack, setPixPack] = useState<string | null>(null);
  const [chooserPack, setChooserPack] = useState<string | null>(null);
  const [chooserLabel, setChooserLabel] = useState('');
  const [chooserPrice, setChooserPrice] = useState(0);
  // 04/10: cartão/débito INLINE via Asaas religados (default). Kill-switch payments.cardEnabled
  // continua: desligado, o pacote vai DIRETO pro PixModal (1-clique).
  const [cardEnabled, setCardEnabled] = useState(true);
  // PIX PENDENTE (padrão gateway): retoma o mesmo QR/timer se o usuário saiu e voltou.
  const [pendingPix, setPendingPix] = useState<any>(null);
  const [, forceTick] = useState(0); // re-render a cada 1s pro timer do PIX vivo
  // Cupom aplicado no PaymentChooser (T3): o server revalida no checkout de verdade.
  const [coupon, setCoupon] = useState<string | null>(null);
  // Pacote selecionado nos radio cards (#015). Null = default (pendente > popular > 1º).
  const [selPack, setSelPack] = useState<string | null>(null);

  const checkPendingPix = () => {
    fetch(`${API_URL}/billing/pending-payment`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { setPendingPix(d?.hasPending ? d : null); })
      .catch(() => {});
  };

  // Cancelar PIX pendente (dono 03/10): usuário desiste do pack e quer comprar
  // outro SEM esperar o expiry (lock 1-por-vez do server libera após cancelar).
  const cancelPendingPix = async () => {
    if (!pendingPix?.id) return;
    try {
      const r = await fetch(`${API_URL}/billing/pending/${pendingPix.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
      if (!r.ok) throw new Error();
      setPendingPix(null);
      notify('PIX pendente cancelado.', { type: 'info' });
    } catch { notify('Não foi possível cancelar o PIX agora. Tente de novo em instantes.', { type: 'error' }); }
  };

  useEffect(() => { checkPendingPix(); }, []);
  useEffect(() => { fetchPublicConfig().then((c) => setCardEnabled(c.cardEnabled)).catch(() => {}); }, []);

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

  useEffect(() => {
    if (params.get('status') === 'success') notify('Pagamento aprovado! Plano ativo. 🎉', { type: 'success' });
    if (params.get('status') === 'failure') notify('Pagamento não concluído.', { type: 'error' });
  }, [params, notify]);

  // 05/10 URGENTE (dono): assinar Premium pelo fluxo NOVO — PIX inline (Asaas/OpenPix)
  // ou cartão/débito inline (Asaas). O redirect do Checkout Pro (MP) saiu do ar e levava
  // o usuário pra uma página morta. Mesmo PaymentChooser dos créditos, com plan='monthly'.
  const openPlanPay = () => {
    const price = planInfo?.plan?.effectivePrice ?? 19.9;
    setChooserLabel(`👑 Premium Mensal — ${fmtBRL(price)} · 30 dias`);
    setChooserPrice(price);
    setChooserPack('__plan__'); // sentinel: PaymentChooser/PixModal reconhecem como plano
  };

  const fmt = (d: string) => new Date(d).toLocaleDateString('pt-BR');
  const packs = plans?.creditPacks ?? [];
  const mpOn = plans?.mercadoPagoEnabled ?? false;
  // Seleção efetiva do radio (#015): explícita > PIX pendente > popular > primeiro.
  const pendingPackId = pendingPix
    ? (packs.find((p) => p.credits === pendingPix.credits && p.price === pendingPix.price)?.id ?? null)
    : null;
  const selId = selPack ?? pendingPackId ?? packs.find((p) => p.popular)?.id ?? packs[0]?.id ?? null;
  const selPackObj = packs.find((p) => p.id === selId) ?? null;
  // REVERTIDO: compra PIX volta a funcionar no app Android também.
  // (A Play Store rejeita venda de bem digital sem conta de organização — assumido pelo Edmilson.)
  const isNative = false;

  return (
    <PageContainer width={860} sx={{ pb: { xs: 10, sm: 5 } }}>
      <PageHeader icon={<DiamondIcon />} title={translate('page.plans')}
        subtitle={<>Use à vontade: assine o <strong>mensal</strong> ({monthlyReads} leituras por mês) ou compre <strong>leituras avulsas</strong> via PIX.</>} />

      {/* PIX PENDENTE (padrão gateway): banner discreto que retoma o mesmo QR/timer.
          Só aparece se o usuário gerou um PIX e saiu sem pagar — SEM criar ordem nova. */}
      {pendingPix && (
        <Alert severity="info" icon={<QrCode2Icon />} sx={{ mb: 2, borderRadius: '16px', alignItems: 'center' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ width: '100%' }}>
            <Typography sx={{ fontSize: 14 }}>
              Você tem um PIX de <strong>{Math.floor((pendingPix.credits ?? 0) / rd) || 1} leitura(s)</strong> aguardando pagamento
              {' '}({Math.max(0, Math.ceil((new Date(pendingPix.expiresAt).getTime() - Date.now()) / 60000))} min restantes)
            </Typography>
            <Stack direction="row" spacing={1} flexShrink={0}>
              <Button size="small" variant="contained" onClick={() => setPixPack('__pending__')} sx={{ textTransform: 'none', fontWeight: 700 }}>
                Retomar pagamento
              </Button>
              <Button size="small" onClick={() => cancelPendingPix()} sx={{ textTransform: 'none', fontWeight: 700, color: 'text.secondary' }}>
                Cancelar
              </Button>
            </Stack>
          </Stack>
        </Alert>
      )}

      {/* SALDO COMPACTO — o saldo virou CIDADÃO da Carteira (/carteira); aqui só uma linha
          de contexto pra decidir a compra (sem duplicar o hero). 04/10: refactor do dono. */}
      <Stack
        direction="row" alignItems="center" spacing={1.5}
        onClick={() => navigate('/carteira')}
        sx={{
          mb: 2.5, px: 2, py: 1.25, borderRadius: '14px', cursor: 'pointer',
          border: (t) => `1px solid ${t.palette.mode === 'dark' ? 'rgba(95,201,195,.25)' : 'rgba(32,178,170,.3)'}`,
          bgcolor: 'rgba(32,178,170,.07)',
          transition: 'background-color .15s ease',
          '&:hover': { bgcolor: 'rgba(32,178,170,.12)' },
        }}
      >
        <BoltIcon sx={{ color: '#20b2aa', fontSize: 20 }} />
        <Typography sx={{ fontWeight: 700, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
          {/* Créditos primeiro, leituras como conversão (auditoria 29/10: "0 leituras · 7💎"
              com Premium ativo lia como bug — duas moedas sem hierarquia). */}
          {status?.credits != null ? (() => { const n = Math.floor(status.credits / rd) || 0; return `${status.credits.toLocaleString('pt-BR')} 💎 ≈ ${n} ${n === 1 ? 'leitura' : 'leituras'} de exame`; })() : '—'}
        </Typography>
        {status?.active && (
          <Typography sx={{ fontSize: 12, color: (t) => tealText(t.palette.mode), fontWeight: 700 }}>
            👑 Premium até {status.planExpiresAt ? fmt(status.planExpiresAt) : '—'}
          </Typography>
        )}
        <Box sx={{ flexGrow: 1 }} />
        <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: (t) => tealText(t.palette.mode), whiteSpace: 'nowrap' }}>
          Ver carteira →
        </Typography>
      </Stack>


      {isNative ? (
        <Card sx={{ mt: 1, borderRadius: '20px', border: '2px dashed #20b2aa', background: 'rgba(32,178,170,0.08)' }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 800, color: (t) => tealText(t.palette.mode) }}>💎 Premium e Créditos de IA</Typography>
            <Typography sx={{ mt: 1, fontSize: 15 }}>
              O <strong>Plano Premium</strong> ({planInfo?.plan ? fmtBRL(planInfo.plan.effectivePrice) : 'R$ 19,90'}/mês) e os <strong>créditos</strong> para a IA são adquirados pelo nosso <strong>site</strong>, com PIX instantâneo.
            </Typography>
            <Typography sx={{ mt: 2, fontWeight: 700 }}>Acesse pelo navegador:</Typography>
            <Box component="a" href="https://drexame.janocaminho.com.br" target="_blank" rel="noopener noreferrer" sx={{ display: 'block', fontFamily: 'monospace', fontSize: 16, bgcolor: 'background.paper', border: '1px solid #cfe9e5', p: 1, borderRadius: '12px', mt: 0.5, userSelect: 'all', textDecoration: 'none', color: (t) => tealText(t.palette.mode), '&:hover': { textDecoration: 'underline', borderColor: 'primary.main' } }}>
              drexame.janocaminho.com.br
            </Box>
            <Alert severity="info" sx={{ mt: 2, borderRadius: '16px' }} icon={false}>
              Depois de assinar ou comprar créditos no site, entre no app com o <strong>mesmo login</strong> — o saldo e o Premium aparecem aqui automaticamente.
            </Alert>
          </CardContent>
        </Card>
      ) : (
        <>
      {/* ══ PLANO PREMIUM (05/10): sobe pro topo — melhor custo por crédito. Card escuro
          premium (padrão Revolut Metal / Stripe), preço/perks da API (zero hardcode). ══ */}
      {(() => {
        const plan = planInfo?.plan;
        const planCredits = Number(plan?.monthlyCredits ?? 0);
        const ref = packs.find((p) => p.popular) ?? packs[0];
        const savings = plan && ref && planCredits
          ? Math.round((1 - (plan.effectivePrice / planCredits) / (ref.price / ref.credits)) * 100) : 0;
        const scarce = plan?.founder && Number(plan.founderRemaining) < 20;
        const perks = [
          `${Math.floor(planCredits / rd) || monthlyReads} leituras todo mês`,
          'Relatórios completos sem gastar créditos',
          'Histórico completo de exames',
          `Família até ${planInfo?.premiumPerks?.familyLimit ?? 10} perfis`,
          'Créditos somam ao saldo e não expiram',
          'Envio de exames sem custo',
        ];
        return (
          <Box sx={{
            ...fadeUp(0), position: 'relative', overflow: 'hidden', borderRadius: '24px', color: '#fff', mb: 3.5,
            p: { xs: 2.5, md: 3.5 },
            background: 'radial-gradient(120% 140% at 100% 0%, rgba(95,201,195,.30) 0%, transparent 55%), radial-gradient(80% 90% at 0% 100%, rgba(233,196,106,.10) 0%, transparent 60%), linear-gradient(150deg,#0d3330 0%,#09201f 100%)',
            border: '1px solid rgba(95,201,195,.28)',
            boxShadow: '0 24px 60px -24px rgba(15,110,104,.65), inset 0 1px 0 rgba(255,255,255,.06)',
          }}>
            {/* eyebrow */}
            <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap rowGap={1}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Box sx={{ width: 34, height: 34, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'linear-gradient(135deg,#f3d98b,#c9a14a)', boxShadow: '0 4px 14px rgba(201,161,74,.35)' }}>
                  <WorkspacePremiumIcon sx={{ fontSize: 20, color: '#3d2a05' }} />
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.14em', color: '#e9c46a', lineHeight: 1.2 }}>PREMIUM</Typography>
                  <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 19, lineHeight: 1.2 }}>Dr. Exame sem limites</Typography>
                </Box>
              </Stack>
              {savings > 0 && !status?.active && (
                <Box sx={{ px: 1.25, py: 0.5, borderRadius: 99, fontSize: 12, fontWeight: 800, color: '#3d2a05',
                  background: 'linear-gradient(135deg,#f3d98b,#e2b85c)' }}>
                  Economize {savings}% vs avulso
                </Box>
              )}
            </Stack>

            {/* perks */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 3, rowGap: 1, mt: 2.5 }}>
              {perks.map((t) => (
                <Stack key={t} direction="row" spacing={1} alignItems="center">
                  <CheckIcon sx={{ fontSize: 17, color: '#5fc9c3', flexShrink: 0 }} />
                  <Typography sx={{ fontSize: 13.5, color: 'rgba(255,255,255,.86)' }}>{t}</Typography>
                </Stack>
              ))}
            </Box>

            <Box sx={{ height: '1px', my: 2.5, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.14), transparent)' }} />

            {/* preço + CTA */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between">
              <Box>
                <Stack direction="row" alignItems="baseline" spacing={1}>
                  <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 900, fontSize: 36, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                    {plan ? fmtBRL(plan.effectivePrice) : 'R$ —'}
                  </Typography>
                  <Typography sx={{ fontSize: 14, color: 'rgba(255,255,255,.6)', fontWeight: 600 }}>/mês</Typography>
                  {plan?.founder && plan.price !== plan.effectivePrice && (
                    <Typography sx={{ fontSize: 14, color: 'rgba(255,255,255,.4)', textDecoration: 'line-through' }}>{fmtBRL(plan.price)}</Typography>
                  )}
                </Stack>
                <Typography sx={{ fontSize: 12, color: 'rgba(255,255,255,.55)', mt: 0.75 }}>
                  {plan && planCredits ? `${brl(plan.effectivePrice / (planCredits / rd))} por leitura · ` : ''}sem fidelidade · cancele quando quiser
                </Typography>
              </Box>
              <Button
                size="large" disabled={!!status?.active} onClick={openPlanPay}
                endIcon={!status?.active && <ArrowForwardIcon sx={{ transition: 'transform .2s ease' }} />}
                sx={{
                  minWidth: 200, py: 1.5, px: 3, borderRadius: 99, textTransform: 'none',
                  fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 15, color: '#062523',
                  background: 'linear-gradient(135deg,#7ad8d2,#3fb8b0)',
                  boxShadow: '0 8px 24px -6px rgba(95,201,195,.55)',
                  transition: 'transform .15s ease, box-shadow .2s ease, filter .2s ease',
                  '&:hover': { background: 'linear-gradient(135deg,#7ad8d2,#3fb8b0)', filter: 'brightness(1.06)', transform: 'translateY(-1px)', boxShadow: '0 12px 30px -6px rgba(95,201,195,.65)', '& .MuiButton-endIcon': { transform: 'translateX(3px)' } },
                  '&:active': { transform: 'scale(.98)' },
                  '&.Mui-disabled': { background: 'rgba(255,255,255,.1)', color: status?.active ? '#7ad8d2' : 'rgba(255,255,255,.4)', boxShadow: 'none' },
                }}
              >
                {status?.active ? `✓ Ativo até ${status.planExpiresAt ? fmt(status.planExpiresAt) : '—'}` : 'Assinar Premium'}
              </Button>
            </Stack>

            {plan?.founder && (
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 2, px: 1.5, py: 1, borderRadius: '12px',
                bgcolor: scarce ? 'rgba(245,158,11,.14)' : 'rgba(233,196,106,.08)', border: '1px solid', borderColor: scarce ? 'rgba(245,158,11,.35)' : 'rgba(233,196,106,.18)' }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: scarce ? '#f59e0b' : '#e9c46a', flexShrink: 0,
                  '@keyframes plPulse': { '0%,100%': { boxShadow: '0 0 0 0 rgba(245,158,11,.6)' }, '50%': { boxShadow: '0 0 0 6px rgba(245,158,11,0)' } },
                  animation: scarce ? 'plPulse 1.8s ease-in-out infinite' : 'none',
                  '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }} />
                <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: scarce ? '#fcd34d' : '#e9c46a' }}>
                  Preço de Fundador garantido enquanto assinar · restam <strong>{plan.founderRemaining}</strong> vagas
                </Typography>
              </Stack>
            )}
          </Box>
        );
      })()}

      {/* ══ CRÉDITOS AVULSOS — grid; popular em destaque (full-width no mobile). ══ */}
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.75 }}>
        <Typography sx={{ fontFamily: '"Poppins",sans-serif', fontWeight: 800, fontSize: 17, whiteSpace: 'nowrap' }}>Ou compre leituras avulsas</Typography>
        <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
      </Stack>
      <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mb: 2, lineHeight: 1.5 }}>
        Leitura de exame <b>1</b> · relatório completo <b>2</b> leituras · pergunta no chat <b>3</b> 💎. Enviar exame é <b>grátis</b>. Sem mensalidade.
      </Typography>
      {/* ══ CRÉDITOS AVULSOS — radio cards (Lucian #015): frame desliza pro pack
          escolhido, ponto pop, preço acorda no selecionado; setas navegam.
          Fluxos preservados: cardEnabled → PaymentChooser; PIX-only → PixModal
          1-clique; pendente → badge âmbar + retomada do QR no CTA. ══ */}
      {packs.length > 0 && (
        <Box sx={fadeUp(1)}>
          <PlanRadioCards
            label="Pacotes de leituras"
            options={packs.map((p) => {
              const reads = Math.max(1, Math.floor(p.credits / rd));
              const pend = !!pendingPix && pendingPix.credits === p.credits && pendingPix.price === p.price;
              return {
                id: p.id,
                title: `${reads} ${reads === 1 ? 'leitura' : 'leituras'}`,
                badge: pend ? '⏳ Aguardando pagamento' : p.popular ? '⭐ Mais vendido' : undefined,
                badgeTone: pend ? ('amber' as const) : undefined,
                sub: `~${Math.floor(p.credits / 2)} perguntas no chat · entra como ${p.credits} 💎`,
                price: brl(p.price),
                priceSub: `${brl(p.price / reads)} por leitura`,
                icon: <BoltIcon />,
              };
            })}
            value={selId}
            onChange={setSelPack}
            summaryLabel={selPackObj ? (() => { const n = Math.max(1, Math.floor(selPackObj.credits / rd)); return `${n} ${n === 1 ? 'leitura' : 'leituras'} selecionada${n === 1 ? '' : 's'}`; })() : undefined}
            summaryValue={selPackObj ? brl(selPackObj.price) : undefined}
          />
          {/* CTA único da seleção (substitui o botão por card do grid antigo) */}
          {selPackObj && (() => {
            const reads = Math.max(1, Math.floor(selPackObj.credits / rd));
            const isPending = !!pendingPix && pendingPix.credits === selPackObj.credits && pendingPix.price === selPackObj.price;
            const secsLeft = isPending ? Math.max(0, Math.floor((new Date(pendingPix.expiresAt).getTime() - Date.now()) / 1000)) : 0;
            const mmLeft = String(Math.floor(secsLeft / 60)).padStart(2, '0');
            const ssLeft = String(secsLeft % 60).padStart(2, '0');
            if (isPending) {
              return (
                <Stack spacing={1} sx={{ mt: 0.5 }}>
                  <Button variant="contained" fullWidth onClick={() => setPixPack('__pending__')}
                    startIcon={<QrCode2Icon />}
                    sx={{ bgcolor: '#d97706', '&:hover': { bgcolor: '#b45309' }, textTransform: 'none', fontWeight: 800, borderRadius: '999px', py: 1.3, boxShadow: '0 4px 12px rgba(217,119,6,.3)' }}>
                    Abrir QR Code · {mmLeft}:{ssLeft}
                  </Button>
                  <Button size="small" variant="outlined" fullWidth
                    startIcon={<ContentCopyIcon fontSize="small" />}
                    onClick={() => { navigator.clipboard?.writeText(pendingPix.qrCode || ''); notify('Código PIX copiado! Cole no app do banco.', { type: 'success' }); }}
                    sx={{ textTransform: 'none', fontWeight: 700, fontSize: 12, borderRadius: '999px', borderColor: 'rgba(217,119,6,.4)', color: '#b45309', '&:hover': { borderColor: '#d97706', bgcolor: 'rgba(217,119,6,.06)' } }}>
                    Copiar código PIX
                  </Button>
                </Stack>
              );
            }
            return (
              <Button variant="contained" fullWidth disabled={!mpOn}
                endIcon={<ArrowForwardIcon sx={{ fontSize: 18, transition: 'transform .2s ease' }} />}
                onClick={() => {
                  // PIX-only (cardEnabled=false) → 1-clique direto no QR; religado → escolhe forma.
                  if (cardEnabled) { setChooserLabel(`${reads} leituras • ${brl(selPackObj.price)}`); setChooserPrice(selPackObj.price); setChooserPack(selPackObj.id); }
                  else setPixPack(selPackObj.id);
                }}
                sx={{
                  mt: 0.5, borderRadius: '999px', py: 1.4, fontWeight: 800, fontSize: 15, textTransform: 'none',
                  fontFamily: '"Poppins",sans-serif',
                  background: 'linear-gradient(135deg,#20b2aa,#178f89)',
                  boxShadow: '0 8px 24px -6px rgba(32,178,170,.45)',
                  '&:hover': { background: 'linear-gradient(135deg,#20b2aa,#178f89)', filter: 'brightness(1.06)' },
                  '&:hover .MuiButton-endIcon': { transform: 'translateX(3px)' },
                }}>
                Comprar {reads} {reads === 1 ? 'leitura' : 'leituras'} · {brl(selPackObj.price)}
              </Button>
            );
          })()}
        </Box>
      )}

      {/* ══ COMPARATIVO (Lucian #217): Grátis × Premium × Avulsas — header pinado no
          scroll, coluna acende sob o cursor, "só diferenças" dobra linhas iguais nos
          3 planos; mobile vira cartões empilhados com o plano selecionado destacado.
          Dados da API (usePlanInfo/packs) com fallback pro que a vitrine mostra. ══ */}
      {(() => {
        const effPrice = planInfo?.plan?.effectivePrice ?? 29.9;
        const familyLimit = planInfo?.premiumPerks?.familyLimit ?? 10;
        const consolidatedFree = planInfo?.premiumPerks?.consolidatedFree !== false;
        const minPack = packs.length ? Math.min(...packs.map((p) => p.price)) : null;
        return (
          <Box sx={{ ...fadeUp(2), mt: 4 }}>
            <PlanComparison
              title="Compare os planos"
              columns={[
                { name: 'Grátis', period: 'para sempre', price: 'R$ 0' },
                { name: 'Premium', period: '/mês', price: fmtBRL(effPrice), badge: 'MAIS ESCOLHIDO' },
                { name: 'Avulsas', period: 'sem mensalidade', price: minPack != null ? `${brl(minPack)}+` : '—' },
              ]}
              groups={[
                { title: 'IA E LEITURAS', rows: [
                  { label: 'Leituras de exame por mês', cells: ['—', `${monthlyReads} leituras`, 'Por pack'] },
                  { label: 'Relatório completo', cells: ['Gasta leituras', consolidatedFree ? 'Incluído' : 'Gasta leituras', 'Gasta leituras'] },
                  { label: 'Perguntas no chat', cells: ['Consome 💎', 'Consome 💎', 'Consome 💎'] },
                ]},
                { title: 'EXAMES', rows: [
                  { label: 'Envio de exame', cells: ['Grátis', 'Grátis', 'Grátis'] },
                ]},
                { title: 'CONTA E FAMÍLIA', rows: [
                  { label: 'Mensalidade', cells: ['R$ 0', fmtBRL(effPrice), 'Não tem'] },
                  { label: 'Perfis de família', cells: ['—', `Até ${familyLimit}`, '—'] },
                  { label: 'Créditos que sobram', cells: ['—', 'Não expiram', 'Não expiram'] },
                ]},
              ]}
            />
          </Box>
        );
      })()}

      {/* Barra de confiança NA TELA DE DECISÃO (não só no checkout). */}
      <Stack direction="row" justifyContent="center" alignItems="center" flexWrap="wrap" useFlexGap columnGap={2} rowGap={0.75}
        sx={{ mt: 1, mb: 1, '& svg': { fontSize: 15, color: '#20b2aa' } }}>
        {([
          { icon: <LockOutlinedIcon />, label: 'Pagamento seguro' },
          { icon: <BoltIcon />, label: 'PIX cai na hora' },
          { icon: <AllInclusiveIcon />, label: 'Créditos não expiram' },
        ]).map((b) => (
          <Stack key={b.label} direction="row" alignItems="center" spacing={0.5} sx={{ whiteSpace: 'nowrap' }}>
            {b.icon}
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.secondary' }}>{b.label}</Typography>
          </Stack>
        ))}
      </Stack>

      {!mpOn && (
        <Alert severity="info" sx={{ mt: 2 }} icon={<CheckIcon />}>
          Em ambiente de teste os pagamentos podem estar desativados. Em produção usamos o mesmo Mercado Pago da sua loja.
        </Alert>
      )}

      {/* '__plan__' (sentinel) = assinatura Premium: chooser/form/pix cobram o plano mensal
          em vez de pack (05/10 — MP redirect saiu do ar). */}
      <PaymentChooser packId={chooserPack} packLabel={chooserLabel} packPrice={chooserPrice} plan={chooserPack === '__plan__'}
        onClose={() => setChooserPack(null)}
        onPix={(code) => { setCoupon(code ?? null); setPixPack(chooserPack); }}
        onCardApproved={() => { notify(chooserPack === '__plan__' ? 'Premium ativado! 👑' : 'Créditos adicionados! 🎉', { type: 'success' }); load(); checkPendingPix(); }} />
      {/* '__pending__' = retomar PIX existente (não gera ordem nova — o server é idempotente) */}
      <PixModal
        packId={pixPack}
        plan={pixPack === '__plan__'}
        couponCode={pixPack === '__pending__' ? undefined : (coupon ?? undefined)}
        existingPix={pixPack === '__pending__' ? pendingPix : undefined}
        onClose={() => { setPixPack(null); setCoupon(null); checkPendingPix(); }}
        onApproved={() => { setPixPack(null); setPendingPix(null); setCoupon(null); notify(pixPack === '__plan__' ? 'Premium ativado! 👑' : 'Créditos adicionados! 🎉', { type: 'success' }); load(); }}
      />
        </>
      )}
    </PageContainer>
  );
};
