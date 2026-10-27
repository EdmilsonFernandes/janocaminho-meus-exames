import { prisma } from '../prisma';
import { CREDIT_COSTS, UPLOAD_RULES } from './credits';
import { BADGES as DEFAULT_BADGES } from './achievements';

// Defaults da config de monetização (categoria → objeto). Usados quando o banco está vazio.
// creditCosts/uploadRules ESPELHAM os objetos vivos de credits.ts — loadSettings/saveSettings
// os sincronizam, então quem já lê `CREDIT_COSTS.chat` continua funcionando (sem mudar imports).
export const DEFAULT_SETTINGS = {
  creditCosts: { extraction: 0, summary: 10, consolidated: 20, chat: 2 },
  uploadRules: { freeCost: 1, premiumFreeQuota: 6, premiumCost: 5 },
  grants: { freeSignup: 60, monthly: 250, freeExamLimit: 2, quiz: 5, mentalScreening: 3, monthlyClaimCap: 150, trialCredits: 100 },
  // ===== Estratégia de pricing (2026-08-23) — tudo editável no Admin, sem deploy =====
  // Preço do plano mensal (era hardcode em 7 lugares). Os créditos do mensal continuam em
  // grants.monthly (fonte única). periodDays/label aqui só p/ a API expor.
  plans: { monthly: { price: 19.9, periodDays: 30, label: 'Mensal' } },
  // Pacotes de créditos avulsos (mesma moeda/saldo — mudar NÃO invalida créditos já comprados).
  // p30 = PRIMEIRA COMPRA (auditoria 18/10): quebrar a barreira do 1º pagamento vale mais
  // que a margem do pack — o dialog 402 sugere o mais barato em 1 toque PIX.
  creditPacks: [
    { id: 'p30', credits: 30, price: 4.9, label: 'Primeira compra', popular: false },
    { id: 'p50', credits: 50, price: 9.9, label: 'Início', popular: false },
    { id: 'p140', credits: 140, price: 24.9, label: 'Popular', popular: true },
    { id: 'p320', credits: 320, price: 49.9, label: 'Bônus', popular: false },
  ],
  // RELATÓRIO AVULSO (auditoria 18/10, item 8): compra única R$9,90 = 1 relatório
  // completo (voucher), sem pensar em créditos — o consolidado é o produto mais consumido.
  // Kill-switch: enabled 0 esconde do dialog 402 e recusa a compra no billing.
  reportPack: { enabled: 1, price: 9.9, label: 'Relatório completo' },
  // Perks premium (além dos créditos mensais): relatório consolidado sem débito e limite
  // familiar maior. Upload grátis usa o knob já existente uploadRules.premiumFreeQuota
  // (subir p/ 999 no admin = "ilimitado"). Leitura por uso — desligar volta a cobrar, sem
  // estado órfão.
  premium: { consolidatedFree: 1, familyLimit: 10 },
  // Promo "Plano Fundador": preço alternativo p/ os primeiros N assinantes. Default DESLIGADO
  // (validação 2026-08-23: zero assinantes mensais reais — nada a preservar). `used` é
  // incrementado pelo webhook a cada aprovação no preço fundador (condicional ao limite).
  founder: { enabled: 0, price: 19.9, limit: 100, used: 0 },
  // "Primeiro grátis" (1 = ligado, 0 = desligado; admin edita live como os demais knobs).
  // Pesquisa ago/2026: a 1ª interpretação virou commodity (35% dos BR colam no ChatGPT) —
  // o freemium ganha se a primeira leitura ser sempre grátis.
  firstFree: { summary: 1 },
  // Faixas pediátricas por banda etária (Lote 2 família): 1 = ligado. Régua do laudo continua
  // vencendo quando o lab imprime faixa própria não-adulta; a banda só entra sem faixa ou
  // contra default adulto óbvio. Kill-switch instantâneo via admin.
  pediatricRanges: { enabled: 1 },
  // Diretrizes clínicas com citação (Feature C): injeta cards de sociedades médicas
  // (knowledge/guidelines/*.md) no prompt do chat/resumo e extrai as fontes citadas
  // [FONTE ANO] da resposta. 1 = ligado. Kill-switch instantâneo via admin, sem deploy.
  guidelines: { enabled: 1 },
  // API pública (Fase 2): acesso mediante solicitação aprovada no admin; aprovação concede
  // o pacote TESTE grátis (freeMonthly calls). Pacotes pré-pagos via PIX/cartão/débito (MP).
  // reviewRequired=0 = auto-aprova (self-serve). Preço/cobertura 100% editável no admin.
  apiAccess: {
    freeMonthly: 25,
    reviewRequired: 1,
    packs: [
      { id: 'api1k', calls: 1000, price: 19.9, label: 'Starter', popular: false },
      { id: 'api10k', calls: 10000, price: 99, label: 'Pro', popular: true },
      { id: 'api50k', calls: 50000, price: 399, label: 'Scale', popular: false },
    ],
    // Extração de laudo (POST /exams/extract) custa N CHAMADAS (LLM real por trás).
    // 20 chamadas → pack Starter (1k) = 50 extrações ≈ R$ 0,40/exame.
    extractCostCalls: 20,
  },
  // Custo por escopo ao compartilhar c/ médico. 'sports' (E5.1): contexto esportivo declarado
  // no portal do médico — OPCIONAL, só entra no custo se o paciente marcar.
  shares: { exams: 5, evolution: 5, alerts: 3, summary: 5, sports: 3 },
  // Faixas temporais (meses) da análise de exames — classificação atual/recente/histórico/antigo
  // e marcação de "desatualizado" (>staleMonths). Defaults = spec clínica. Admin edita live.
  temporalThresholds: { freshMonths: 6, recentMonths: 12, staleMonths: 12, oldMonths: 36 },
  badges: DEFAULT_BADGES.map((b) => ({ id: b.id, emoji: b.emoji, title: b.title, desc: b.desc, metric: b.metric, threshold: b.threshold, reward: b.reward })),
  // 04/10: form de cartão INLINE via Asaas no ar (POST /billing/pay-card) → cartão/débito
  // religados por DEFAULT. Kill-switch segue o mesmo: AppSetting payments.cardEnabled
  // false (admin/SQL) esconde no front — sem deploy.
  payments: { cardEnabled: true },
  // Texto do share de indicação editável no admin (padrão apps maduros: copy testável).
  // Vazio = usa o texto padrão do app. Placeholders: {code} {bonus} {link}.
  // DOIS LADOS (05/10): newUser/recommender são os valores de COPY expostos no
  // /api/public/config ("você ganha X · seu amigo ganha Y"). Defaults = REFERRAL_BONUS
  // atual (10) — NÃO mudam o crédito real (auth.routes continua pagando REFERRAL_BONUS);
  // o admin pode editar os dois lados separadamente sem deploy.
  referral: { shareMessage: '', newUser: 10, recommender: 10 },
  // Mensagem do Dia (MOTD): dialog 1x/dia no boot do app autenticado — anunciar feature,
  // promo, novidade. enabled=0 = desligado. ctaRoute = rota interna (ex.: /carteira).
  motd: { enabled: 0, title: '', message: '', ctaLabel: '', ctaRoute: '' },
  // SAÚDE ESPORTIVA (E1, out/2026): modo opt-in que organiza o CONTEXTO declarado pelo
  // paciente (modalidade, treino, substâncias, coleta) p/ melhorar a interpretação dos
  // exames. Default DESLIGADO — paciente normal intocável. Kill-switch instantâneo via
  // admin (PATCH /admin/config/costs { category: 'sportsMode', enabled: 1 }), sem deploy.
  sportsMode: { enabled: false },
  // TELECONSULTA (24/10/26, spec gaps §1): janela de entrada (min antes do dueDate em
  // que o /join libera a sala) e tempo conjunto mínimo (s) p/ encerrar como 'completed'
  // (remuneração elegível — pago NÃO = realizado). Defaults explícitos; admin edita
  // live como os demais knobs (PATCH /admin/config/costs { category: 'teleconsulta' }).
  // Onda 4 (§18.5): payoutAuto = repasse AUTOMÁTICO sem aprovação admin. Default 0
  // (DESLIGADO — v1 é supervisionado; ligar é decisão do dono no admin, com audit).
  // §19 dono (26/10/26): slotMin = meia-janela de OCUPAÇÃO da agenda do médico (teleconsulta
  // ocupa dueDate ± slotMin; 2 consultas SOBREPOSTAS → 409 SCHEDULE_CONFLICT, mesmo com
  // pacientes diferentes). §5 dono (26/10/26): noShowToleranceMin = tolerância de AUSÊNCIA
  // (dueDate + N min sem a contraparte → no_show com noShowBy = quem faltou). NÃO confundir
  // com o grace de RECONEXÃO (5min, client): tolerância = quem NUNCA apareceu; grace = queda
  // de quem já entrou (ambos presentes → desconexão é caso do /end humano, não de ausência).
  teleconsulta: { entryWindowMin: 5, minJointSeconds: 300, payoutAuto: 0, slotMin: 30, noShowToleranceMin: 10, priceMinCents: 2000 },
};

export type SettingCategory = keyof typeof DEFAULT_SETTINGS;
type AnySettings = typeof DEFAULT_SETTINGS;

const clone = (o: AnySettings): AnySettings => JSON.parse(JSON.stringify(o));

// Cache em memória (DB sobre defaults). getSettings() é síncrono.
let cache: AnySettings = clone(DEFAULT_SETTINGS);

/** Settings atuais (sync). Antes do loadSettings() no boot, devolve os defaults. */
export function getSettings(): AnySettings {
  return cache;
}

/** Sincroniza os objetos vivos CREDIT_COSTS/UPLOAD_RULES (lidos pelos routes antigos). */
function applyToLive(s: AnySettings) {
  Object.assign(CREDIT_COSTS, s.creditCosts);
  Object.assign(UPLOAD_RULES, s.uploadRules);
}

/** Lê app_settings, merge sobre DEFAULT_SETTINGS, cacheia + sincroniza objetos vivos. Chamar no boot. */
export async function loadSettings(): Promise<void> {
  try {
    const rows = await prisma.appSetting.findMany();
    const next = clone(DEFAULT_SETTINGS);
    for (const r of rows) {
      // arrays (badges, creditPacks): substitui INTEIRO (merge de array criaria Frankenstein)
      if (r.key === 'badges' || r.key === 'creditPacks') (next as any)[r.key] = r.value;
      else if (r.key in next) Object.assign((next as any)[r.key], r.value as object);
    }
    cache = next;
    applyToLive(cache);
  } catch (e) {
    console.warn('[settings] loadSettings falhou (usando defaults):', (e as Error).message);
  }
}

/** Grava uma categoria no banco (upsert) + atualiza cache + objetos vivos.
 *  badges/creditPacks = array (substitui inteiro). Demais = merge raso.
 *  `replaceObject: true` substitui a categoria inteira (usado p/ plans/premium/founder no admin,
 *  que manda o objeto pronto em vez de patch — evita chaves fantasmas de edições antigas). */
export async function saveSettings(category: SettingCategory, patch: Record<string, number> | any[], replaceObject = false): Promise<AnySettings> {
  if (Array.isArray(patch)) {
    (cache as any)[category] = patch;
  } else if (replaceObject) {
    (cache as any)[category] = { ...patch };
  } else {
    (cache as any)[category] = { ...(cache as any)[category], ...patch };
  }
  const value = (cache as any)[category];
  await prisma.appSetting.upsert({
    where: { key: category },
    update: { value },
    create: { key: category, value },
  });
  applyToLive(cache);
  return cache;
}

// ───────────────── helpers da estratégia de pricing (fallbacks defensivos) ─────────────────

/** Preço/ciclo do plano mensal (settings; nunca mais hardcode nas rotas). */
export function getMonthlyPlan(): { price: number; periodDays: number; label: string } {
  const m = (getSettings() as any).plans?.monthly;
  const price = Number(m?.price);
  return {
    price: Number.isFinite(price) && price > 0 ? price : 19.9,
    periodDays: Number(m?.periodDays) > 0 ? Number(m?.periodDays) : 30,
    label: String(m?.label || 'Mensal'),
  };
}

/** Preço EFETIVO no checkout: fundador ligado e com vagas → preço fundador; senão, cheio. */
export function getEffectivePlanPrice(): { price: number; founder: boolean } {
  const full = getMonthlyPlan().price;
  const f = (getSettings() as any).founder;
  if (Number(f?.enabled) === 1 && Number(f?.used) < Number(f?.limit) && Number(f?.price) > 0 && Number(f?.price) < full) {
    return { price: Number(f.price), founder: true };
  }
  return { price: full, founder: false };
}

/** Pacotes avulsos (fallback pros defaults se o banco tiver algo inválido). */
export function getCreditPacks(): { id: string; credits: number; price: number; label: string; popular: boolean }[] {
  const packs = (getSettings() as any).creditPacks;
  if (Array.isArray(packs) && packs.length && packs.every((p: any) => p && p.id && Number(p.credits) > 0 && Number(p.price) > 0)) return packs;
  return DEFAULT_SETTINGS.creditPacks;
}

/** Perks premium (1 = ligado). */
export function getPremiumPerks(): { consolidatedFree: boolean; familyLimit: number } {
  const p = (getSettings() as any).premium ?? {};
  return {
    consolidatedFree: Number(p.consolidatedFree) === 1,
    familyLimit: Number(p.familyLimit) > 0 ? Number(p.familyLimit) : 10,
  };
}

/** Diretrizes com citação (Feature C): 1 = ligado (default). Admin desliga via PATCH
 *  /admin/config/costs { category: 'guidelines', enabled: 0 } — sem deploy. */
export function guidelinesEnabled(): boolean {
  const g = (getSettings() as any).guidelines;
  // default LIGADO: ausência da chave (banco antigo) não pode desligar a feature.
  return g == null || Number(g.enabled) !== 0;
}

/** Modo esportivo (Saúde Esportiva): default DESLIGADO. Inversão proposital do padrão
 *  do guidelinesEnabled — aqui a ausência da chave (banco antigo/parcial) NÃO liga:
 *  a feature só existe com enabled explícito (1/true). Aceita boolean ou 0/1 (o admin
 *  edita live como os demais knobs). */
export function sportsModeEnabled(): boolean {
  const s = (getSettings() as any).sportsMode;
  return s != null && Number(s.enabled) === 1;
}

/** Config da teleconsulta (spec gaps §1): fallback defensivo pros defaults se o banco
 *  tiver algo inválido/ausente (mesma família do getMonthlyPlan — nunca hardcode na rota). */
export function getTeleconsultaConfig(): { entryWindowMin: number; minJointSeconds: number; slotMin: number; noShowToleranceMin: number; priceMinCents: number } {
  const t: any = (getSettings() as any).teleconsulta ?? {};
  return {
    entryWindowMin: Number(t.entryWindowMin) > 0 ? Number(t.entryWindowMin) : 5,
    minJointSeconds: Number(t.minJointSeconds) > 0 ? Number(t.minJointSeconds) : 300,
    // §19/§5 dono (26/10/26): janela de agenda (±min) e tolerância de ausência (min).
    slotMin: Number(t.slotMin) > 0 ? Number(t.slotMin) : 30,
    noShowToleranceMin: Number(t.noShowToleranceMin) > 0 ? Number(t.noShowToleranceMin) : 10,
    // Estorno Asaas (26/10): a tarifa do PIX NÃO volta no estorno — consulta barata
    // demais nasce sem saldo pra se devolver (doc Asaas). Default R$20 dá folga.
    priceMinCents: Number(t.priceMinCents) >= 100 ? Number(t.priceMinCents) : 2000,
  };
}

/** Repasse AUTOMÁTICO (Onda 4 §18.5): default DESLIGADO (v1 supervisionada — cada
 *  transferência exige aprovação admin). Ausência da chave NUNCA liga (mesma inversão
 *  do sportsModeEnabled): só ligam 1/true explícitos, setados pelo admin com audit. */
export function payoutAutoEnabled(): boolean {
  const t: any = (getSettings() as any).teleconsulta ?? {};
  return t != null && (t.payoutAuto === true || Number(t.payoutAuto) === 1);
}
