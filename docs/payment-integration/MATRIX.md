# Payment Matrix — 4 Sistemas (mapeamento completo)

> Gerado 03/10/2026 por inspeção direta dos 4 repos (graphify + grep + leitura de código).
> Fonte de requisitos: `docs/payment-integration/SPEC.md`.
> Convenção: `arquivo:linha` refere-se ao estado do repo na data acima.

## Resumo executivo

| Sistema | Fluxos de cobrança | Providers PIX ativos | Webhooks |
|---|---|---|---|
| Dr. Exame | 4 (créditos PIX, créditos cartão/débito, API-pack PIX, assinatura cartão) | OpenPix (primário) → MP (fallback); Asaas opcional (`PAYMENT_PROVIDER`) | 3 (OpenPix, Asaas, MP legacy) |
| EdEspeto | 12 pontos (pedido PIX/cartão, balcão, entrega, destaque, promo destino, gorjeta, assinatura loja, promo push, OAuth split ×2, terminal Point) | MP OAuth loja (histórico) + OpenPix plataforma (WAVE 2, toggle `PAYMENT_PROVIDER_DEFAULT`) + Asaas webhook | 4 (payment-confirmed, mercadopago, openpix, asaas) + didit |
| PremioX | 10 pontos (4 DROP, cotas raffle, polling, marketplace split, PIX estático fallback, saque embaixador, admin manual) | MP (default, MOCK sem token) ou OpenPix (`PAYMENT_PROVIDER=openpix`) — port única hexagonal | 2 (mercadopago, openpix) |
| KYC | 1 core (fatura mensal usage-based, PIX por fatura) + suspensão anticalote | Asaas (PRIMÁRIO, ≥R$5) → OpenPix → MP (cadeia de fallback) | 0 (polling via mark-paid — sem URL pública) |

---

## 1. Dr. Exame (janocaminho.com.br/minhasaude)

Repo: `C:/Users/esantos/Desktop/Exame Edmilson`. Tabela `subscriptions` = registro unificado de pagamentos (type plan/credits/api) — `subscriptionCompat.ts` blindado contra drift.

### Fluxos

| # | Funcionalidade | Tela/Rota (front) | Endpoint (API) | Serviço (arquivo:linha) | Provider atual | Libera após pagamento | Webhook? |
|---|---|---|---|---|---|---|---|
| 1 | Pacote de CRÉDITOS — PIX (QR inline, copia-e-cola, countdown) | `/planos` (`App.tsx:908` → `pages/Plans.tsx`) + `components/PaymentChooser.tsx` (botão PIX, selo "Instantâneo • via OpenPix (Woovi)" L59) + `components/PixModal.tsx` | `POST /api/billing/buy-credits` `{pack, method:'pix'}` (`routes/billing.routes.ts:130`) | `payments/pix-provider.ts:70` `createPixCharge()` — provider ativo `activePixProvider():46` (`PAYMENT_PROVIDER`: mp\|openpix\|asaas), fallback escolhido→openpix→mp (L61-90) | OpenPix (Woovi) primário; MP fallback; Asaas se `PAYMENT_PROVIDER=asaas` (PIX ≥R$5, senão openpix assume) | Créditos IA (`pixCredits`) no usuário — credita webhook | Sim — `/api/webhooks/openpix` |
| 2 | Pacote de CRÉDITOS — Cartão/Débito (redirect) | `/planos` — `PaymentChooser.tsx:23` `payRedirect('card'\|'debit')` | `POST /api/billing/buy-credits` `{pack, method:'card'\|'debit'}` | MP Checkout Pro preference (mesma rota, ramo card/debit) | Mercado Pago (Checkout Pro `init_point`) | Créditos IA | Sim — `/api/billing/webhook` (IPN MP) |
| 3 | Pacote API pública (pré-pago por chamadas) | `/api` (`App.tsx:913` → `pages/ApiPanel.tsx`) | `POST /api/billing/buy-api-pack` (`billing.routes.ts:289`); `GET /pending-api-pack:405`; `DELETE /pending/:id:465` | `createPixCharge` (`billing.routes.ts:373`) | PIX: mesmo `pix-provider.ts` (OpenPix→MP) | Saldo de chamadas API no ledger (`type:'api', calls`) | Sim — webhooks acima |
| 4 | Assinatura Premium mensal (cartão) | `/planos` — `Plans.tsx` | `POST /api/billing/checkout` (`billing.routes.ts:86`) | MP preference direto `billing.routes.ts:98-122` (`external_reference` = sub.id) | Mercado Pago Checkout Pro | Plano mensal + créditos mensais (`grants.monthly`) | Sim — `/api/billing/webhook` (L501, IPN MP) |

### Suporte (não-cobrança, mas parte do ciclo)

| Item | Onde | Função |
|---|---|---|
| Polling de status | `GET /api/billing/payment-status/:id` (`billing.routes.ts:480`); front: `PixModal.tsx` polling 3s + countdown 1s (L72) | Confirma pagamento sem depender só de webhook |
| PIX pendente (lock 1-por-vez) | `GET /pending-payment:427`; 409 com `pendingPix` no buy-credits (L127-129, commit 97245d3e) | Reabre MESMO QR/timer; auto-cancel >24h |
| Webhook OpenPix | `POST /api/webhooks/openpix` (`routes/openpix-webhook.routes.ts:21`) | Casa `correlationID` ↔ `Subscription.mpPaymentId` (server-generated); COMPLETED → credita credits/api/plan; ack 200 p/ desconhecido |
| Webhook Asaas | `POST /api/webhooks/asaas` (`routes/asaas-webhook.routes.ts:29`) | Só `PAYMENT_RECEIVED`/status RECEIVED* (REAIS float → cents); credita |
| Webhook MP legacy | `POST /api/billing/webhook` (`billing.routes.ts:501`) | IPN MP: resgate PIX MP antigo + cartão; derivava credits/api/plan do payload |
| Expiração | `jobs/pix-expiry.ts` (cancela PENDING expirado + push "expirou, gere novo" L57-79) | Estado consistente |
| Providers | `payments/pix-provider.ts` (OpenPix L156 exige `OPENPIX_APP_ID`; MP; chain fallback L61-90), `payments/asaas-provider.ts` (`ASAAS_PIX_MIN_CENTS=500` L15, header `access_token` direto L71) | — |
| Config de preços | `utils/settings.ts` (app_settings `creditCosts`/`pricing`), admin `pages/admin/PricingTab.tsx`, front `utils/planInfo.ts` | Troca de preço sem deploy |
| Aprovação manual | `utils/billingApproval.ts` | Fluxo admin de conferência |

---

## 2. EdEspeto / Já no Caminho (janocaminho.com.br)

Repo: `C:/Users/esantos/projeto-pessoal/EdEspetoHub`. Express + TypeORM; rotas centrais em `backend/src/routes/index.ts`.

### Fluxos

| # | Funcionalidade | Tela/Rota (front) | Endpoint (API) | Serviço (arquivo:linha) | Provider atual | Libera após pagamento | Webhook? |
|---|---|---|---|---|---|---|---|
| 1 | Pedido cliente — PIX | `pages/StorePage.tsx` (checkout) → `pages/PaymentPage.tsx` (QR via `utils/pixPayload.ts`, polling `hooks/usePollingPaymentStatus`); status em `pages/OrderTracking.tsx` | `POST /stores/:storeId/orders`, `POST /stores/slug/:slug/orders`; `POST /payments/:paymentId/renew` | `services/OrderPaymentService.ts:29-55` (`correlationID` = `order_payment:{id}` na via plataforma) | WAVE 2 (03/10): `PAYMENT_PROVIDER_DEFAULT=openpix` → PIX pela conta OpenPix da PLATAFORMA (loja recebe repasse); senão MP OAuth da loja. Erro OpenPix → fallback MP. Cartão sempre MP OAuth loja | Pedido confirmado/produção | Sim — `/webhooks/openpix` + `/webhooks/payment-confirmed` |
| 2 | Pedido cliente — Cartão | Mesma tela, método CREDIT_CARD | Mesmos endpoints | `OrderPaymentService.ts` (OAuth loja) | Mercado Pago (conta do lojista) | Pedido confirmado | Sim — `/webhooks/mercadopago` |
| 3 | Cobrança no balcão (presencial) | Painel da loja (`StorePage`/admin pedidos) | `POST /stores/:storeId/orders/:orderId/charge`, `.../charge/cancel`; `GET /stores/:storeId/orders/:orderId/payment-audit` | `services/BalcaoChargeService.ts:133-226` (MP + OpenPix + Point) | PIX: OpenPix plataforma (mesma filosofia REQ-21) ou MP; terminal físico: MP Point | Cobrança presencial do cliente | Sim — webhooks plataforma |
| 4 | Taxa de entrega (motoboy) | `pages/MotoboyCurrent.tsx` / painel loja | `GET /stores/:storeId/delivery-billing`; `POST /stores/:storeId/delivery-billing/pay` | `services/DeliveryBillingService.ts:44-177` (sempre token da PLATAFORMA; L171-177 OpenPix se toggle, falha → MP) | OpenPix plataforma → fallback MP | Fatura/credita entregas do motoboy | Sim |
| 5 | Produto em destaque (sponsored) | Loja: `GET /public/featured-products`; admin: `pages/AdminHighlights.tsx` | `POST /stores/:storeId/featured-requests`; `GET /stores/:storeId/featured-pricing`; admin `GET /admin/featured-requests`, `PATCH .../review` | `services/FeaturedProductService.ts:23-78` (preços `hub_sponsored_daily/week/month_price`; PIX\|CREDIT_CARD) | MP + OpenPix (toggle) | Produto destacado por dia/semana/mês após aprovação admin | Sim |
| 6 | Promoção de destino | Parceiro destino: `/destination-partner/promotions*`; admin `/admin/destination-promotions` | `POST /destination-partner/promotions(+/:id/cancel\|refresh)`; admin review | `services/DestinationPromotionService.ts` (PIX\|CREDIT_CARD) | MP + OpenPix (toggle) | Divulgação em destino turístico | Sim |
| 7 | Gorjeta (tip) | Review pós-entrega: `POST /orders/:orderId/review` (`pages/OrderTracking.tsx`) | `POST /orders/:orderId/review`; payouts `GET /stores/:storeId/reviews/tip-payouts`, `/motoboy/reviews/tip-payouts` | `services/OrderReviewService.ts:140-216` `ensureTipPayment()` — WAVE 2: gorjeta migrou INTEGRA p/ OpenPix plataforma quando toggle (L204-216) | OpenPix plataforma (toggle) senão MP | Repasse gorjeta motoboy/loja | Sim |
| 8 | Assinatura da loja (planos SaaS lojista) | `pages/AdminRenewal.tsx` / onboarding `CreateStore.tsx` | `POST /subscriptions`, `POST /subscriptions/:id/renew`, `POST /stores/:storeId/subscription/renew`; `GET /stores/:storeId/subscription` | `services/SubscriptionService.ts` (planos `PlanRepository`, founder plans `utils/founderPlans`) | Mercado Pago | Plano da loja (comissão reduzida/fundador) | Sim — MP |
| 9 | Promo Push pago | Painel loja | `POST /stores/:storeId/promo-pushes/:pushId/refresh-payment` | `controllers/PromoPushController.ts:26` → `PromoPushService.refreshPayment` | MP/OpenPix conforme charge | Disparo de push promocional | Sim |
| 10 | OAuth split Mercado Pago (loja) | `CreateStore.tsx` / config loja | `POST /stores/:storeId/payment-accounts/mercadopago/connect`; `GET /payment-accounts/mercadopago/callback`; `DELETE .../mercadopago` | `services/MercadoPagoConnectedAccountService.ts` | MP OAuth (recebimento direto na conta do lojista) | Loja recebe pagamentos direto | — |
| 11 | OAuth split Mercado Pago (motoboy) | `pages/MotoboyProfile.tsx` | `POST/GET/DELETE /motoboy/payment-accounts/mercadopago*` | `services/MotoboyPaymentAccountService.ts:9-39` | MP OAuth | Motoboy recebe gorjetas/entregas | — |
| 12 | Terminal físico MP Point | Balcão da loja | `GET /stores/:storeId/payment-accounts/mercadopago/point/terminals` | `services/MercadoPagoPointService.ts` | MP Point | Cobrança presencial cartão/PIX no terminal | — |

### Webhooks (montagem `routes/index.ts:139-145`)

| Rota | Handler | Provider |
|---|---|---|
| `POST /webhooks/payment-confirmed` | `PaymentController.confirm:48` | interno (app → app) |
| `POST /webhooks/mercadopago` | `PaymentController.mercadoPagoWebhook:81` | MP |
| `POST /webhooks/openpix` | `PaymentController.openPixWebhook:170` | OpenPix |
| `POST /webhooks/asaas` | `PaymentController.asaasWebhook:208` | Asaas (novo 03/10) |
| `POST /webhooks/didit` | `DiditWebhookController` | KYC provider (não cobrança) |

Audit trail: `utils/paymentAudit.ts` (entidade/fluxo/estágio) — `GET /admin/payment-events`, `GET .../payment-audit`.

---

## 3. PremioX (premiox.com.br)

Repo: `C:/Users/esantos/projeto-pessoal/projeto-brunoprado`. Fastify + Prisma; **port única hexagonal** `PaymentProviderPort` (`apps/api/src/shared/payment/types.ts`) decorada em `app.payment` (`plugins/payment.ts`).

### Providers

- `PAYMENT_PROVIDER=mp` (default) → `shared/payment/mp.ts:17` `MercadoPagoAdapter` (MOCK se sem `MERCADO_PAGO_ACCESS_TOKEN`)
- `PAYMENT_PROVIDER=openpix` → `shared/payment/openpix.ts:48` `OpenPixAdapter` (exige `OPENPIX_APP_ID`)
- Fallback offline: `shared/pix-static.ts` — BR Code EMV gerado na chave do OPERADOR (`PIX_FALLBACK_KEY`) com CRC16, zero deps
- Marketplace: `shared/payment/marketplace.ts:15` `resolveMarketplace()` — campanha de parceiro com MP conectado → cobra na conta DELE com `application_fee` (fee `platformFeeBps` / `accessFeeSplitBps`)

### Fluxos

| # | Funcionalidade | Tela/Rota (front) | Endpoint (API) | Serviço (arquivo:linha) | Provider atual | Libera após pagamento | Webhook? |
|---|---|---|---|---|---|---|---|
| 1 | Taxa de acesso DROP (leilão) | `app/oferta/[slug]` / `app/loja/[slug]` | `POST /campaigns/:id/participations` (idempotência via `makeIdempotency`) | `modules/participations/service.ts:23` `createDropAccess()` (`amountCents = accessFeeCents`) | `app.payment` (MP ou OpenPix) + marketplace split | Participação na campanha DROP | Sim — MP/OpenPix |
| 2 | Checkout do arremate DROP | `app/pedidos/[id]` | `POST /drop/claims/:id/checkout` | `modules/drop/service.ts:144` `checkoutClaim()` — atômico `FOR UPDATE`, reusa payment ativo, ref determinística | `app.payment` + marketplace | Arremate consolidado (quota do usuário) | Sim |
| 3 | Caução DROP | `app/grupo/[id]` / `app/pedidos/[id]` | `POST /drop/claims/:id/caution` | `modules/drop/service.ts:113-121` (split caution/remainder por membros do grupo) | `app.payment` | Trava participação do grupo | Sim |
| 4 | Restante do valor DROP | idem | `POST /drop/claims/:id/remainder` | `modules/drop/service.ts` (mesma engine) | `app.payment` | Quitação do arremate | Sim |
| 5 | Compra de cotas (RAFFLE) | `app/loja/[slug]` (modal cotas) | `POST /raffles/:id/tickets` | `modules/raffles/service.ts:26` — janela de pagamento 15min (era 5, L13-14); retoma pagamento pendente, libera cotas vencidas | `app.payment` + marketplace | Cotas numeradas alocadas ao usuário | Sim |
| 6 | Polling de status | `app/pedidos/[id]` | `GET /payments/:id/status` (`modules/participations/routes.ts:40`); `POST /payments/:id/proof-claimed:67` | ParticipationService | — | Confirma sem webhook | — |
| 7 | Webhook Mercado Pago | — | `POST /webhooks/mercadopago` (`modules/webhooks/routes.ts:31`, rate-limit off) | `modules/webhooks/service.ts:53` `handleMercadoPago()` (idempotência: mesma tx + FOR UPDATE) | MP | Confirma todos os pagamentos acima | — |
| 8 | Webhook OpenPix | — | `POST /webhooks/openpix` (L54) | `modules/webhooks/service.ts:95` `handleOpenPix()` — **defesa de valor**: webhook diz 100, provedor confirma MESMO valor registrado (L117) | OpenPix | idem | — |
| 9 | Conexão MP do parceiro (split) | `app/parceiro` | `GET /mp/connect`, `GET /mp/callback`, `POST /partner/mp/disconnect`, `GET /partner/mp/status` | `modules/mp/routes.ts` + `marketplace.ts` | MP OAuth | Campanhas do parceiro cobradas na conta dele com fee | — |
| 10 | Comissões + saque embaixador | `app/embaixador` | `GET /ambassador/commissions\|transactions`; `POST /ambassador/withdrawals` (`routes.ts:161-190`); admin `GET /admin/ambassadors`, `PATCH /admin/withdrawals/:id` | `modules/ambassador/commission-service.ts`; wallet/withdrawal em tx única | Manual: PIX p/ chave = CPF do próprio usuário (anti-fraude L169-172); status REQUESTED → admin paga → PAID | Crédito wallet + saque | — |
| 11 | Admin manual | `app/admin` | `GET /admin/payments`; `POST /admin/payments/:id/refund`, `/approve`, `/approve-manual`, `/reject-manual` | `modules/admin/routes.ts:161-229` | — | Reembolso/aprovação manual | — |

---

## 4. KYC / uai-id (uaiid.com.br)

Repo: `C:/Users/esantos/projeto-pessoal/kyc-janocaminho`. FastAPI + Next.js. **SaaS B2B usage-based**: verificação consome quota inclusa; excedente vira fatura mensal.

### Fluxos

| # | Funcionalidade | Tela/Rota (front) | Endpoint (API) | Serviço (arquivo:linha) | Provider atual | Libera após pagamento | Webhook? |
|---|---|---|---|---|---|---|---|
| 1 | Fatura mensal (usage-based) — resumo e listagem | `platform/web/app/dashboard/billing/page.tsx` (`BillingPage:182`, `InvoiceDetail:34`) | `GET /v1/billing/summary` (`api/billing.py:60`); `GET /v1/billing/invoices:107`; `GET /v1/billing/invoices/{id}:121` | `services/billing.py` (usage `record_usage:105`, `month_usage_cents:140`, `generate_invoice:167`, spend limit `check_spend_limit:152`) | — | — | — |
| 2 | Gerar fatura do mês | Dashboard billing | `POST /v1/billing/invoices/generate` (`api/billing.py:153`) | `services/billing.py:167` `generate_invoice()` | — | Fatura `open` pronta p/ PIX | — |
| 3 | PIX da fatura | Dashboard billing (QR + copia-e-cola) | `POST /v1/billing/invoices/{id}/pix` (`api/billing.py:170`) | `services/billing.py:351` `create_pix_charge()` → cadeia `pix_provider():347`: **Asaas PRIMÁRIO** (≥R$5, `_asaas_charge:363` → `services/asaas_billing.py:147` create_charge) → **OpenPix** (`services/openpix_billing.py:153` get_charge; correlationID idempotente por minuto `correlation_id_for:54`) → **MP** (`mp_create_pix:233`) | Asaas → OpenPix → MP (L344-345) | QR/copia-e-cola da fatura (status normalizado MP-like) | **Não** — sem URL pública; confirmação por polling |
| 4 | Confirmar pagamento (mark-paid) | Dashboard billing (polling) | `POST /v1/billing/invoices/{id}/mark-paid` (`api/billing.py:229`) | `get_pix_payment:362` / `check_pix_payment:370` (normaliza MP/OpenPix/Asaas); `pix_still_valid:387` | — | Fatura `paid` — quota/limite regularizados | Não (polling) |
| 5 | Suspensão anticalote | (402 na criação de verificação) | — | `services/billing.py` — avisos 5/2/1/0 dias antes do vencimento (`AVISO_DIAS`); 1 dia após vencer sem pagar → acesso/API suspensos (`402 tenant_suspended`); pagou → reativa na hora (check lazy 20h, sem cron) | — | Cobrança em atraso bloqueia tenant | — |

### Notas KYC

- Asaas service: `services/asaas_billing.py` — PIX dinâmico na conta da PLATAFORMA, API validada ao vivo 03/10 (`api.asaas.com/v3`), header `access_token` sem Bearer.
- Webhooks: **nenhum** — `openpix_billing.py:18` documenta: sem URL pública nesta stack, o mark-paid consulta direto o PSP (sem assinatura HMAC; segurança = correlationID server-generated + valor).

---

## Comparativo de arquitetura (p/ padronização SPEC)

| Dimensão | Dr. Exame | EdEspeto | PremioX | KYC |
|---|---|---|---|---|
| Camada provider | `payments/pix-provider.ts` (chain na função) | Services instanciam MP/OpenPix por fluxo + toggles `isOpenPixPlatformPixEnabled()` | Port hexagonal única (`app.payment`) — mais limpo | `pix_provider()` + 3 módulos de serviço |
| Fallback PIX | escolhido→openpix→mp | por-fluxo (OpenPix→MP na maioria) | não há chain (1 provider por env) + PIX estático offline | asaas→openpix→mp (chain completa) |
| Idempotência | lock 1-PIX-por-vez + correlationID server | correlationID `order_payment:{id}` | makeIdempotency + FOR UPDATE + defesa de valor | correlationID por minuto |
| Webhook | 3 rotas ack-defensivo | 4 rotas + audit | 2 rotas idempotentes | nenhum (polling) |
| Card | MP Checkout Pro | MP OAuth loja / Point | MP adapter | não há |

## Pendências vistas durante o mapeamento (não bloqueiam a matriz)

1. Dr. Exame: `/api/billing/webhook` (MP legacy) e `/api/webhooks/*` convivem — creditação dupla é evitada só por status-guard (`já PENDING→ACTIVE`); confirmar teste de idempotência cross-webhook.
2. EdEspeto: `OrderPaymentService` PIX plataforma muda FLUXO DE DINHEIRO (repasse manual loja) — documentado L50-55; Asaas só tem webhook, sem service de charge visto.
3. PremioX: MP adapter entra MOCK sem token — ambientes sem `MERCADO_PAGO_ACCESS_TOKEN` "aprovam" pagamento falso (dev only; cuidado em staging).
4. KYC: sem webhook = confirmação depende do cliente chamar mark-paid (ou painel aberto).
