import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Button, Chip, Alert, Stack, Divider } from '@mui/material';
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
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { PixModal } from '../components/PixModal';
import { PaymentChooser } from '../components/PaymentChooser';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { tealText } from '../theme';

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
  const [subLoading, setSubLoading] = useState(false);
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
          {status?.credits?.toLocaleString('pt-BR') ?? '—'} créditos
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
      {/* PACOTES DE CRÉDITOS */}
      <Typography variant="h6" sx={{ mt: 1, mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}><BoltIcon color="secondary" /> Comprar créditos (PIX instantâneo)</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5, lineHeight: 1.5 }}>
        O que consome: 💬 pergunta no chat <b>2</b> · ✨ resumo do exame <b>10</b> · 🧾 relatório completo <b>20</b>. Enviar exame é <b>grátis</b>.
      </Typography>
      <Stack spacing={2} sx={{ mb: 3, width: '100%' }}>
        {packs.map((p) => {
          const isPending = pendingPix && pendingPix.credits === p.credits && pendingPix.price === p.price;
          const secsLeft = isPending ? Math.max(0, Math.floor((new Date(pendingPix.expiresAt).getTime() - Date.now()) / 1000)) : 0;
          const mmLeft = String(Math.floor(secsLeft / 60)).padStart(2, '0');
          const ssLeft = String(secsLeft % 60).padStart(2, '0');
          return (
          <Card key={p.id} sx={{
            borderRadius: '20px',
            border: isPending ? '2px solid #d97706' : p.popular ? '2px solid #20b2aa' : '1px solid',
            borderColor: isPending ? undefined : p.popular ? undefined : 'divider',
            width: '100%', position: 'relative',
            bgcolor: isPending ? 'rgba(217,119,6,0.04)' : undefined,
            boxShadow: p.popular ? '0 8px 24px rgba(32,178,170,.15)' : 'none',
            transition: 'transform .18s ease, box-shadow .2s ease',
            '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 8px 28px rgba(0,0,0,.08)' },
          }}>
            {isPending && <Box sx={{ textAlign: 'center', pt: 1.5 }}><Chip label="⏳ Aguardando pagamento" size="small" sx={{ fontWeight: 700, bgcolor: 'rgba(217,119,6,.15)', color: '#92400e' }} /></Box>}
            {!isPending && p.popular && <Box sx={{ textAlign: 'center', pt: 1.5 }}><Chip color="primary" label="MAIS VENDIDO" size="small" sx={{ fontWeight: 800, borderRadius: '999px' }} /></Box>}
            <CardContent sx={{ textAlign: 'center', pt: isPending || p.popular ? 1 : 2 }}>
              <Typography sx={{ fontWeight: 800, fontSize: 28, color: 'primary.main', lineHeight: 1.1 }}>{p.credits}</Typography>
              <Typography color="text.secondary">créditos</Typography>
              <Typography variant="h5" sx={{ my: 1, fontWeight: 800 }}>R$ {p.price.toFixed(2).replace('.', ',')}</Typography>
              {isPending ? (
                <Stack spacing={0.75}>
                  <Button variant="contained" fullWidth onClick={() => setPixPack('__pending__')}
                    startIcon={<QrCode2Icon />}
                    sx={{ bgcolor: '#d97706', '&:hover': { bgcolor: '#b45309' }, textTransform: 'none', fontWeight: 800, borderRadius: '999px', boxShadow: '0 4px 12px rgba(217,119,6,.3)' }}>
                    Abrir QR Code · {mmLeft}:{ssLeft}
                  </Button>
                  <Button size="small" variant="outlined" fullWidth
                    startIcon={<ContentCopyIcon fontSize="small" />}
                    onClick={() => { navigator.clipboard?.writeText(pendingPix.qrCode || ''); notify('Código PIX copiado! Cole no app do banco.', { type: 'success' }); }}
                    sx={{ textTransform: 'none', fontWeight: 700, fontSize: 12, borderRadius: '999px', borderColor: 'rgba(217,119,6,.4)', color: '#b45309', '&:hover': { borderColor: '#d97706', bgcolor: 'rgba(217,119,6,.06)' } }}>
                    Copiar código PIX
                  </Button>
                </Stack>
              ) : (
                <Button variant={p.popular ? 'contained' : 'outlined'} fullWidth disabled={!mpOn} sx={{ borderRadius: '999px', fontWeight: 800, textTransform: 'none' }} onClick={() => {
                  // PIX-only (cardEnabled=false) → 1-clique direto no QR; religado → escolhe forma.
                  if (cardEnabled) { setChooserLabel(`${p.credits} créditos • R$ ${p.price.toFixed(2).replace('.', ',')}`); setChooserPrice(p.price); setChooserPack(p.id); }
                  else setPixPack(p.id);
                }}>Comprar</Button>
              )}
            </CardContent>
          </Card>
          );
        })}
      </Stack>

      <Typography align="center" color="text.secondary" sx={{ my: 2, fontWeight: 600 }}>— ou assine —</Typography>

      {/* PLANO MENSAL — preço/perks da API (admin edita live; zero hardcode). */}
      <Card sx={{ borderRadius: '20px', background: 'rgba(32,178,170,0.06)', border: '2px solid #20b2aa', boxShadow: '0 8px 30px rgba(32,178,170,.12)' }}>
        <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
            <Typography variant="h6" sx={{ fontWeight: 800, color: (t) => tealText(t.palette.mode) }}>💎 Premium Mensal</Typography>
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
              <Typography variant="h4" sx={{ fontWeight: 800, color: (t) => tealText(t.palette.mode), lineHeight: 1 }}>
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

      <PaymentChooser packId={chooserPack} packLabel={chooserLabel} packPrice={chooserPrice}
        onClose={() => setChooserPack(null)}
        onPix={() => setPixPack(chooserPack)}
        onCardApproved={() => { notify('Créditos adicionados! 🎉', { type: 'success' }); load(); checkPendingPix(); }} />
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
