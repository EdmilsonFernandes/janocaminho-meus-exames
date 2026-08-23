# Deep Dive 23 — Monetização de Apps de Saúde no Brasil (2024–2026)

> Pesquisa profunda 2026-08-23 · 21 fontes, 103 claims, verificação adversária 3-votos (19 confirmados / 6 refutados) · 103 agentes.
> Pergunta: modelos de precificação, tickets, conversão, churn, elasticidade e PIX — para orientar o pricing do Dr. Exame (hoje R$19,90/mês + créditos PIX).

## Achados confirmados

### 1. Seu preço está no PISO do mercado local (2,5–3,5x abaixo) — alta confiança
- **CalcLab**: R$69,90/mês (página p/ profissionais); semestral R$335 (−20%); **anual R$503 (−40% → efetivo ~R$41,92/mês)**; trial grátis 15 dias, 1× por conta; sem créditos avulsos. → R$69,90 = 3,5x o R$19,90 (no anual efetivo, gap cai a ~2,1x).
- **Exames IA** (examesia.net): free limitado (5 exames, histórico 30d); **Básico R$49/mês/50 exames** (R$0,98/exame, "Mais Popular"); Profissional R$149/mês/200. → 2,46x o R$19,90.
- Fontes: calclab.com.br/clinica · examesia.net (verificado ao vivo ago/2026). Ressalva: CalcLab é página B2B; Exames IA é landing early-stage — são preços de lista, não curva de demanda.

### 2. Modelo dominante dos concorrentes: assinatura + desconto progressivo + trial — alta confiança
CalcLab trava recorrência com desconto anual profundo (−40%) e trial de 15 dias sem cobrança. Nenhum pricing por créditos nas páginas — contraste direto com o modelo avulso do Dr. Exame.

### 3. Créditos pré-pagos é validado internacionalmente — e NINGUÉM faz créditos+PIX no BR — alta confiança
**Kantesti** (DE): análise avulsa US$9,99; pacote anual 12 análises US$49,99 (US$4,17/crédito); enterprise p/ clínicas/labs/seguradoras; sem assinatura obrigatória. Cobra em USD/cartão/cripto — **sem PIX/BRL** → o combo créditos+PIX no Brasil é espaço não disputado.

### 4. Hard paywall × freemium — alta confiança (com pegadinha)
- Hard paywall converte **~5x mais** no download→pago (mediana 10,7% vs 2,1%, D35; RevenueCat 2026, 115k apps; 2025: 12,11% vs 2,18%).
- MAS: reembolsos maiores (5,8% vs 3,4%), variância enorme (hard 4,2–38,7% vs free 0,3–8,2%), retenção de 1 ano quase idêntica, e cases próprios da RevenueCat mostram apps que **ganharam LTV migrando hard→freemium** (+75%). Conversão ≠ receita.

### 5. Trial longo converte mais — alta confiança
Trials **17+ dias convertem ~70% melhor** que ≤4 dias (42,5% vs 25,5% trial→pago); **55% dos cancelamentos de trials de 3 dias são no Dia 0**. Alinhado ao padrão CalcLab (15 dias). Dado correlacional (categoria/modelo confundem).

### 6. Plano anual domina Health & Fitness — alta confiança
- Apps com anual dominante geram **~2x receita por install** (RPI D14 US$0,36 vs US$0,18; D60 US$0,46 vs US$0,29).
- Adoção anual na categoria: **67–68%**; share de receita anual 51% (2023) → **61% (2025)** — única categoria do App Store onde anual ganha share.
- Retenção 12m de anuais supera mensal (>50–60%); **~30% dos anuais são cancelados no 1º mês** (antdote: onboarding/valor rápido).

### 7. Brasil/LatAm: cresce mais, converte pior — confiança média
- LatAm = maior crescimento de MRR mediano (**+17,2%** vs 5,3% global).
- MAS converte pior: trial→pago **22,8%** vs 34,2% (NA); download→pago D35 **1,5%** (vs 2,9% H&F global); e a **maior preferência do mundo por planos SEMANAIS (29%)**.
- ⇒ Benchmarks globais devem ser DESCONTADOS p/ BR. Funil de referência: install→trial ~11,2% (global).

### 8. Pix Automático (BCB, oficial jun/2025) — alta confiança
- Rail viável de assinatura recorrente **sem cartão**: pagador PF/PJ **não paga tarifa**; tarifa de recebimento depende do PSP. Casos: churn **−28%** (Fazenda Jotacê), 45% dos novos assinantes escolhem PIX (Weasy), 38% dos assinantes PIX eram clientes NOVOS.
- **Cuidado no pricing**: o pagador autoriza 1× e **define teto por cobrança** — se o preço subir acima do teto, a cobrança NÃO é agendada (FAQ BCB Q4.7/Q7.3). Reajuste = fricção (cliente precisa subir o limite).
- Adoção ainda pequena (mai/2026: 2,87M transações/mês vs bilhões de Pix normais) — cartão ainda domina recorrência.

### 9. Híbrido assinatura+créditos (dado de blog RevenueCat, não passou no crivo adversarial — usar como direção)
Compradores híbridos (assinatura + compras no app) = **7% dos compradores, 25% da receita**. Valida a direção do Dr. Exame (mensal + créditos).

## Refutados — NÃO usar como benchmark
1ª renovação ~59% → 45%; mensal retém 43% (90d) / 17% (1a); hard paywall +21% LTV; trials +64% LTV; install→pago sem trial 18–38%. (Todos de blogs Adapty; verificação 0-3/1-2.)

## Contexto de WTP
Survey HK (n=577, JMIR 2024): 58,9% dispostos a pagar por app de saúde; mediana **~US$6,4/mês (~R$35)** — não-BR, direção apenas.

## O que isso significa para o Dr. Exame (R$19,90/mês + créditos PIX)
1. **Headroom real de preço**: você está 2,5–3,5x abaixo dos comparáveis. Testar **R$29,90** (A/B; ainda 40–57% abaixo) — e/ou posicionar o atual R$19,90 como "plano de entrada" com tier familiar R$34,90 (dependentes).
2. **Lançar anual com desconto profundo** (padrão de mercado −40%): R$19,90 → **R$143/ano (~R$11,90/mês)**. Evidência: ~2x RPI, 61% do share da categoria, retenção >50% em 12m.
3. **Formalizar trial de 15 dias do premium** (você já dá a 1ª leitura grátis — estender para trial explícito). Trials 17+ convertem ~70% mais.
4. **Manter créditos+PIX** — validado (Kantesti) e **sem concorrente BR** = diferenciação; híbrido = minoria de compradores, desproporcional na receita.
5. **Pix Automático como rail da assinatura** (churn involuntário ↓, 38% dos assinantes PIX são novos) — com regra clara: reajuste de preço exige campanha pro cliente revisar o teto.
6. **Metas realistas BR**: download→pago ~1,5% (D35), trial→pago ~23%. Calcular LTV com LatAm, não com mediana global.

## Fontes principais
CalcLab (ao vivo) · Exames IA (ao vivo) · Kantesti (ao vivo) · BCB Pix Automático + FAQ oficial · RevenueCat State of Subscription Apps 2025/2026 (75–115k apps) · Adapty H&F Benchmarks 2026 · PagBrasil (case Fazenda Jotacê) · Mercado Pago/iugu blogs · JMIR WTP study.

## Perguntas abertas (medição própria)
Churn/LTV real mensal×anual×créditos em app de saúde BR (não existe benchmark local sobrevivente); elasticidade real (A/B R$19,90×R$29,90×anual R$143); LTV paywall×freemium com custo marginal de IA por análise; tarifas reais/falhas de Pix Automático pós-reajuste por PSP.
