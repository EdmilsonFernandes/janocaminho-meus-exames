import { useEffect, useState } from 'react';
import { Card, CardContent, Typography, Stack, Box, TextField, Button, CircularProgress, Switch, Chip, Divider, Alert } from '@mui/material';
import { useNotify } from 'react-admin';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { API_URL, token } from '../../config';
import { confirmDialog } from '../../components/ConfirmDialog';
import { TabLoader, SectionError } from './parts';

/**
 * ADMIN — Monetização (redesign 2026-08: clareza operacional > densidade).
 * Agrupado por assunto, cada seção explica O QUE faz, mostra PREVIEW da regra resultante e
 * salva sozinha. Mudança de preço/fundador exige confirmação (alto impacto em cobrança).
 * Fonte única: /admin/config (settings do banco) → PATCH /admin/config/costs.
 */

const fmtBRL = (v: number) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`;

interface Pack { id: string; credits: number; price: number; label: string; popular: boolean }

export const PricingTab = () => {
  const notify = useNotify();
  const [config, setConfig] = useState<any>(null);
  const [badges, setBadges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Rascunhos editáveis (não tocam no banco até "Salvar" da seção)
  const [plan, setPlan] = useState({ price: 0, credits: 0 });
  const [founder, setFounder] = useState({ enabled: 0, price: 0, limit: 0, used: 0 });
  const [packs, setPacks] = useState<Pack[]>([]);
  const [premium, setPremium] = useState({ consolidatedFree: 0, familyLimit: 0 });
  const [uploadRules, setUploadRules] = useState({ freeCost: 0, premiumFreeQuota: 0, premiumCost: 0 });
  const [creditCosts, setCreditCosts] = useState<any>({});
  const [grants, setGrants] = useState({ freeSignup: 0 });

  const load = async () => {
    setLoading(true); setError(false);
    try {
      const r = await fetch(`${API_URL}/admin/config`, { headers: { Authorization: `Bearer ${token()}` } });
      if (r.ok) {
        const c = await r.json();
        setConfig(c);
        setBadges(Array.isArray(c?.badges) ? c.badges : []);
        setPlan({ price: Number(c?.plans?.monthly?.price ?? 0), credits: Number(c?.grants?.monthly ?? 0) });
        setFounder({ enabled: Number(c?.founder?.enabled ?? 0), price: Number(c?.founder?.price ?? 0), limit: Number(c?.founder?.limit ?? 0), used: Number(c?.founder?.used ?? 0) });
        setPacks(Array.isArray(c?.creditPacks) ? c.creditPacks : []);
        setPremium({ consolidatedFree: Number(c?.premium?.consolidatedFree ?? 0), familyLimit: Number(c?.premium?.familyLimit ?? 0) });
        setUploadRules({ freeCost: Number(c?.uploadRules?.freeCost ?? 0), premiumFreeQuota: Number(c?.uploadRules?.premiumFreeQuota ?? 0), premiumCost: Number(c?.uploadRules?.premiumCost ?? 0) });
        setCreditCosts({ chat: 0, summary: 0, consolidated: 0, extraction: 0, ...(c?.creditCosts ?? {}) });
        setGrants({ freeSignup: Number(c?.grants?.freeSignup ?? 0) });
      } else setError(true);
    } catch { setError(true); }
    setLoading(false);
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  const patch = async (key: string, body: any): Promise<boolean> => {
    setSavingKey(key);
    try {
      const r = await fetch(`${API_URL}/admin/config/costs`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify(body) });
      const d = r.ok ? null : await r.json().catch(() => ({}));
      if (r.ok) return true;
      notify(d?.error || 'Erro ao salvar.', { type: 'error' });
      return false;
    } catch { notify('Erro de rede ao salvar.', { type: 'error' }); return false; }
    finally { setSavingKey(null); }
  };

  if (loading) return <TabLoader />;
  if (error) return <SectionError message="Não foi possível carregar a configuração de monetização." onRetry={() => void load()} />;

  const priceCr = plan.price > 0 ? (plan.credits / plan.price) : 0;
  const bestPack = packs.length ? Math.max(...packs.map((p) => p.credits / p.price)) : 0;

  const savePlan = async () => {
    if (plan.price <= 0 || plan.credits < 0) { notify('Preço deve ser maior que zero.', { type: 'error' }); return; }
    const priceChanged = plan.price !== Number(config?.plans?.monthly?.price);
    if (priceChanged && !(await confirmDialog({
      title: 'Mudar o preço do plano?',
      message: `Novas assinaturas passarão a cobrar ${fmtBRL(plan.price)}/mês (antes ${fmtBRL(config.plans.monthly.price)}). Assinaturas já pagas NÃO são afetadas — o valor fica gravado em cada cobrança. O checkout, a landing e o app atualizam na hora.`,
      confirmLabel: 'Mudar preço', tone: 'primary',
    }))) return;
    if (await patch('plans', { category: 'plans', value: { monthly: { price: plan.price, periodDays: config?.plans?.monthly?.periodDays ?? 30, label: config?.plans?.monthly?.label ?? 'Mensal' } } })) {
      if (await patch('grants', { category: 'grants', monthly: plan.credits })) { notify('Plano mensal salvo ✅', { type: 'success' }); await load(); }
    }
  };

  const saveFounder = async () => {
    if (founder.enabled === 1 && (founder.price <= 0 || founder.price >= plan.price)) {
      notify(`Preço fundador deve ser menor que o plano cheio (${fmtBRL(plan.price)}).`, { type: 'error' }); return;
    }
    if (founder.enabled === 1 && !(await confirmDialog({
      title: 'Ativar o Plano Fundador?',
      message: `Checkouts novos cobrarão ${fmtBRL(founder.price)} até ${founder.limit} aprovações (${founder.used} já usadas). Depois, voltam ao preço cheio sozinhos.`,
      confirmLabel: 'Ativar promo', tone: 'primary',
    }))) return;
    if (await patch('founder', { category: 'founder', value: { enabled: founder.enabled, price: founder.price, limit: founder.limit, used: founder.used } })) {
      notify('Promo fundador salva ✅', { type: 'success' }); await load();
    }
  };

  const savePacks = async () => {
    if (!packs.length || !packs.every((p) => p.id && p.credits > 0 && p.price > 0)) { notify('Todo pacote precisa de id, créditos e preço > 0.', { type: 'error' }); return; }
    if (packs.filter((p) => p.popular).length > 1) { notify('Apenas 1 pacote pode ser o "Popular".', { type: 'error' }); return; }
    if (await patch('creditPacks', { category: 'creditPacks', value: packs })) { notify('Pacotes salvos ✅', { type: 'success' }); await load(); }
  };

  const savePremium = async () => {
    if (await patch('premium', { category: 'premium', value: { consolidatedFree: premium.consolidatedFree, familyLimit: premium.familyLimit } })) { notify('Perks premium salvos ✅', { type: 'success' }); await load(); }
  };

  const saveUpload = async () => {
    if (await patch('uploadRules', { category: 'uploadRules', ...uploadRules })) { notify('Regras de envio salvas ✅', { type: 'success' }); await load(); }
  };

  const saveCosts = async () => {
    if (await patch('creditCosts', { category: 'creditCosts', ...creditCosts })) { notify('Custos de IA salvos ✅', { type: 'success' }); await load(); }
  };

  const saveSignup = async () => {
    if (await patch('grants', { category: 'grants', freeSignup: grants.freeSignup })) { notify('Bônus salvo ✅', { type: 'success' }); await load(); }
  };

  const Section = ({ title, desc, children, saving, onSave, dirty }: any) => (
    <Card sx={{ borderRadius: '12px' }}>
      <CardContent>
        <Typography variant="h6">{title}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2, lineHeight: 1.5, maxWidth: 640 }}>{desc}</Typography>
        {children}
        <Box sx={{ mt: 2.5, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Button variant="contained" size="small" onClick={onSave} disabled={saving || !dirty}
            startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}>
            Salvar seção
          </Button>
          {dirty ? <Typography variant="caption" color="warning.main">● não salvo</Typography> : <Typography variant="caption" color="text.secondary">salvo</Typography>}
        </Box>
      </CardContent>
    </Card>
  );

  const dirtyPlan = plan.price !== Number(config?.plans?.monthly?.price) || plan.credits !== Number(config?.grants?.monthly);
  const dirtyFounder = JSON.stringify(founder) !== JSON.stringify({ enabled: Number(config?.founder?.enabled ?? 0), price: Number(config?.founder?.price ?? 0), limit: Number(config?.founder?.limit ?? 0), used: Number(config?.founder?.used ?? 0) });
  const dirtyPacks = JSON.stringify(packs) !== JSON.stringify(config?.creditPacks ?? []);
  const dirtyPremium = JSON.stringify(premium) !== JSON.stringify({ consolidatedFree: Number(config?.premium?.consolidatedFree ?? 0), familyLimit: Number(config?.premium?.familyLimit ?? 0) });
  const dirtyUpload = JSON.stringify(uploadRules) !== JSON.stringify({ freeCost: Number(config?.uploadRules?.freeCost ?? 0), premiumFreeQuota: Number(config?.uploadRules?.premiumFreeQuota ?? 0), premiumCost: Number(config?.uploadRules?.premiumCost ?? 0) });
  const dirtyCosts = JSON.stringify(creditCosts) !== JSON.stringify({ chat: 0, summary: 0, consolidated: 0, extraction: 0, ...(config?.creditCosts ?? {}) });
  const dirtySignup = grants.freeSignup !== Number(config?.grants?.freeSignup ?? 0);

  return (
    <Stack spacing={3}>

      {/* ESTADO ATUAL — o que está valendo AGORA (uma olhada e o admin sabe onde está) */}
      <Alert severity="info" icon={false} sx={{ borderRadius: '12px', '& .MuiAlert-message': { width: '100%' } }}>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ alignItems: 'center' }}>
          <Chip size="small" label={`Plano: ${fmtBRL(config?.plans?.monthly?.price ?? 0)}/mês · ${config?.grants?.monthly ?? 0} créditos`} sx={{ fontWeight: 700, bgcolor: 'rgba(32,178,170,.14)', color: '#178f89' }} />
          <Chip size="small" label={Number(config?.founder?.enabled) === 1 ? `🎯 Fundador ATIVO: ${fmtBRL(config?.founder?.price)} · ${config?.founder?.used}/${config?.founder?.limit} vagas` : 'Fundador desligado'} sx={{ fontWeight: 700 }} color={Number(config?.founder?.enabled) === 1 ? 'warning' : 'default'} variant="outlined" />
          <Chip size="small" label={`${(config?.creditPacks ?? []).length} pacotes avulsos`} variant="outlined" />
          <Chip size="small" label={Number(config?.premium?.consolidatedFree) === 1 ? 'Relatório incluído no premium' : 'Relatório custa créditos p/ todos'} variant="outlined" />
        </Stack>
      </Alert>

      <Section title="💎 Plano mensal" desc="O preço que NOVOS assinantes pagam (cobranças já feitas mantêm o valor gravado — nada é alterado retroativamente). Os créditos entram no saldo do assinante todo mês e não expiram."
        saving={savingKey === 'plans'} onSave={savePlan} dirty={dirtyPlan}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} flexWrap="wrap">
          <TextField label="Preço mensal (R$)" type="number" size="small" value={plan.price} onChange={(e) => setPlan({ ...plan, price: Number(e.target.value) })} sx={{ width: { xs: '100%', sm: 180 } }} inputProps={{ step: 0.5, min: 0.5 }} />
          <TextField label="Créditos por mês" type="number" size="small" value={plan.credits} onChange={(e) => setPlan({ ...plan, credits: Number(e.target.value) })} sx={{ width: { xs: '100%', sm: 180 } }} />
        </Stack>
        <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'text.secondary' }}>
          📐 Regra resultante: <b>{plan.credits} créditos por {fmtBRL(plan.price)}</b> = <b>{priceCr.toFixed(1)} créditos/R$</b>
          {bestPack > 0 && <> — melhor pacote avulso: {bestPack.toFixed(1)} cr/R$ {priceCr > bestPack * 1.15 ? '✅ assinatura claramente melhor' : priceCr > bestPack ? '⚠️ vantagem pequena sobre o avulso' : '🚨 AVISO: pacote avulso vale mais que a assinatura'}</>}
        </Typography>
      </Section>

      <Section title="🎯 Promo Plano Fundador" desc="Preço promocional para os primeiros assinantes (urgência real de lançamento). O contador de vagas é consumido a cada aprovação de pagamento no preço fundador; esgotado, o checkout volta ao preço cheio sozinho. Desligar a promo encerra novas vagas sem afetar quem já pagou."
        saving={savingKey === 'founder'} onSave={saveFounder} dirty={dirtyFounder}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} flexWrap="wrap" alignItems="center">
          <Stack direction="row" spacing={1} alignItems="center">
            <Switch checked={founder.enabled === 1} onChange={(e) => setFounder({ ...founder, enabled: e.target.checked ? 1 : 0 })} color="primary" />
            <Typography sx={{ fontSize: 14 }}>{founder.enabled === 1 ? 'Ligada' : 'Desligada'}</Typography>
          </Stack>
          <TextField label="Preço fundador (R$)" type="number" size="small" disabled={founder.enabled !== 1} value={founder.price} onChange={(e) => setFounder({ ...founder, price: Number(e.target.value) })} sx={{ width: { xs: '100%', sm: 180 } }} inputProps={{ step: 0.5 }} />
          <TextField label="Total de vagas" type="number" size="small" disabled={founder.enabled !== 1} value={founder.limit} onChange={(e) => setFounder({ ...founder, limit: Number(e.target.value) })} sx={{ width: { xs: '100%', sm: 140 } }} />
          <Chip size="small" label={`${founder.used} usadas · restam ${Math.max(0, founder.limit - founder.used)}`} variant="outlined" />
        </Stack>
      </Section>

      <Section title="🎁 Pacotes de créditos (avulsos)" desc="Compra pontual por PIX/cartão — sem mensalidade. Créditos são saldo: mudar pacotes NÃO invalida créditos já comprados. Mantenha o pacote mais caro com melhor custo por crédito; a assinatura deve vencer todos (veja o aviso na seção do plano)."
        saving={savingKey === 'creditPacks'} onSave={savePacks} dirty={dirtyPacks}>
        <Stack spacing={1.5}>
          {packs.map((p, i) => (
            <Stack key={i} component="div" spacing={1.5} sx={{ p: { xs: 1.5, sm: 0 }, borderRadius: { xs: '12px' }, bgcolor: { xs: 'background.default' } }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }} flexWrap="wrap" useFlexGap>
              <TextField label="Créditos" type="number" size="small" value={p.credits} onChange={(e) => setPacks(packs.map((x, j) => j === i ? { ...x, credits: Number(e.target.value) } : x))} sx={{ width: { xs: '50%', sm: 120 } }} />
              <TextField label="Preço (R$)" type="number" size="small" value={p.price} onChange={(e) => setPacks(packs.map((x, j) => j === i ? { ...x, price: Number(e.target.value) } : x))} sx={{ width: { xs: '50%', sm: 130 } }} inputProps={{ step: 0.5 }} />
              <TextField label="Nome" size="small" value={p.label} onChange={(e) => setPacks(packs.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} sx={{ width: { xs: '50%', sm: 130 } }} />
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Switch size="small" checked={!!p.popular} onChange={(e) => setPacks(packs.map((x, j) => j === i ? { ...x, popular: e.target.checked && !(packs.some((y, k) => k !== j && y.popular)) } : { ...x, popular: false }))} color="primary" />
                <Typography variant="caption">Popular</Typography>
              </Stack>
              <Typography variant="caption" sx={{ color: 'text.secondary', minWidth: 90 }}>{(p.credits / (p.price || 1)).toFixed(1)} cr/R$</Typography>
              <Button size="small" color="error" onClick={() => setPacks(packs.filter((_, j) => j !== i))} disabled={packs.length <= 1}><DeleteOutlineIcon fontSize="small" /></Button>
            </Stack>
            </Stack>
          ))}
          <Button size="small" startIcon={<AddIcon />} onClick={() => setPacks([...packs, { id: `p${Date.now() % 100000}`, credits: 50, price: 9.9, label: 'Novo', popular: false }])} sx={{ alignSelf: 'flex-start' }}>Adicionar pacote</Button>
        </Stack>
      </Section>

      <Section title="⭐ Benefícios do plano Premium (perks)" desc="O que o assinante ganha ALÉM dos créditos. Ligar/desligar aqui muda na hora, para todos — sem estado órfão (leitura por uso)."
        saving={savingKey === 'premium'} onSave={savePremium} dirty={dirtyPremium}>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Switch checked={premium.consolidatedFree === 1} onChange={(e) => setPremium({ ...premium, consolidatedFree: e.target.checked ? 1 : 0 })} color="primary" />
            <Box>
              <Typography sx={{ fontSize: 14 }}>📄 Relatório consolidado incluído no plano</Typography>
              <Typography variant="caption" color="text.secondary">Ligado: assinante gera sem gastar créditos. Desligado: paga {creditCosts.consolidated} créditos como qualquer usuário.</Typography>
            </Box>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
            <TextField label="Limite de perfis da família (premium)" type="number" size="small" value={premium.familyLimit} onChange={(e) => setPremium({ ...premium, familyLimit: Number(e.target.value) })} sx={{ width: { xs: '100%', sm: 240 } }} />
            <Typography variant="caption" color="text.secondary">Free continua com 4 perfis (extra custa créditos).</Typography>
          </Stack>
        </Stack>
      </Section>

      <Section title="📤 Envio de exames" desc="Free paga créditos por envio. Premium tem uma cota mensal grátis por dependente — use 999 para 'praticamente ilimitado' (o custo real de envio é baixo; a IA de interpretação é cobrada à parte)."
        saving={savingKey === 'uploadRules'} onSave={saveUpload} dirty={dirtyUpload}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} flexWrap="wrap">
          <TextField label="Free: créditos por envio" type="number" size="small" value={uploadRules.freeCost} onChange={(e) => setUploadRules({ ...uploadRules, freeCost: Number(e.target.value) })} sx={{ width: { xs: '100%', sm: 200 } }} />
          <TextField label="Premium: envios grátis/mês" type="number" size="small" value={uploadRules.premiumFreeQuota} onChange={(e) => setUploadRules({ ...uploadRules, premiumFreeQuota: Number(e.target.value) })} sx={{ width: { xs: '100%', sm: 210 } }} />
          <TextField label="Premium: créditos após a cota" type="number" size="small" value={uploadRules.premiumCost} onChange={(e) => setUploadRules({ ...uploadRules, premiumCost: Number(e.target.value) })} sx={{ width: { xs: '100%', sm: 230 } }} />
        </Stack>
      </Section>

      <Section title="🤖 Custos de IA (em créditos)" desc="Quanto cada ação de IA debita do saldo. 0 = grátis. O app sincroniza esses valores sozinho."
        saving={savingKey === 'creditCosts'} onSave={saveCosts} dirty={dirtyCosts}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} flexWrap="wrap">
          {[['chat', '💬 Chat (por pergunta)'], ['summary', '📄 Resumo do exame'], ['consolidated', '🧾 Relatório consolidado'], ['extraction', '📤 Upload (0 = grátis)']].map(([k, l]) => (
            <TextField key={k} label={l} type="number" size="small" value={creditCosts[k] ?? 0} onChange={(e) => setCreditCosts({ ...creditCosts, [k]: Number(e.target.value) })} sx={{ width: { xs: '100%', sm: 210 } }} />
          ))}
        </Stack>
      </Section>

      <Section title="🎁 Bônus do 1º exame" desc="Créditos dados quando o usuário extrai o primeiro exame com CPF válido (anti-farm). É o 'grátis pra testar' da landing."
        saving={savingKey === 'grants'} onSave={saveSignup} dirty={dirtySignup}>
        <TextField label="Créditos do bônus" type="number" size="small" value={grants.freeSignup} onChange={(e) => setGrants({ freeSignup: Number(e.target.value) })} sx={{ width: { xs: '100%', sm: 180 } }} />
      </Section>

      <Divider />
      {/* CONQUISTAS — inalterado (gamificação) */}
      <Card sx={{ borderRadius: '12px' }}>
        <CardContent>
          <Typography variant="h6">🏆 Conquistas (gamificação)</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            Edite nomes, valores e dificuldade. Salva tudo de uma vez no banco.
          </Typography>
          <Stack spacing={2}>
            {badges.map((b: any, i: number) => (
              <Stack key={b.id ?? i} direction={{ xs: 'column', sm: 'row' }} spacing={1.5} useFlexGap flexWrap="wrap" alignItems={{ xs: 'stretch', sm: 'center' }}
                sx={{ pb: 1.5, borderBottom: i < badges.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                <TextField label="Emoji" size="small" sx={{ width: { xs: '100%', sm: 70 } }} value={b.emoji ?? ''} onChange={(e) => setBadges(prev => prev.map((x, j) => j === i ? { ...x, emoji: e.target.value } : x))} />
                <TextField label="Título" size="small" sx={{ flex: { sm: '1 1 140px' }, width: { xs: '100%', sm: 'auto' } }} value={b.title ?? ''} onChange={(e) => setBadges(prev => prev.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
                <TextField label="Descrição" size="small" sx={{ flex: { sm: '1 1 200px' }, width: { xs: '100%', sm: 'auto' } }} value={b.desc ?? ''} onChange={(e) => setBadges(prev => prev.map((x, j) => j === i ? { ...x, desc: e.target.value } : x))} />
                <TextField label="Meta" type="number" size="small" sx={{ width: { xs: '100%', sm: 80 } }} value={b.threshold ?? 0} onChange={(e) => setBadges(prev => prev.map((x, j) => j === i ? { ...x, threshold: Number(e.target.value) } : x))} />
                <TextField label="💎 Recompensa" type="number" size="small" sx={{ width: { xs: '100%', sm: 90 } }} value={b.reward ?? 0} onChange={(e) => setBadges(prev => prev.map((x, j) => j === i ? { ...x, reward: Number(e.target.value) } : x))} />
              </Stack>
            ))}
          </Stack>
          <Box sx={{ mt: 2.5 }}>
            <Button variant="contained" onClick={async () => {
              const ok = await patch('badges', { category: 'badges', value: badges });
              if (ok) { notify('Conquistas salvas!', { type: 'success' }); await load(); }
            }}>Salvar conquistas</Button>
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
};
