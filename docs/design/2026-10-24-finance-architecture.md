# Arquitetura do Módulo Financeiro — Fase 1 (Descoberta)

> **Spec de origem:** §18 de `docs/design/2026-10-24-teleconsulta-gaps-spec.md` (dono, 24/10).
> **Papel:** Agente 4 — Engenharia Financeira. **Status: DESCOBERTA — nada implementado.**
> **Regra comercial norteadora:** paciente paga antes; médico elegível SÓ após atendimento cumprido; estorno possível quando o atendimento não ocorre.
> Fontes: código atual (commit a980219b), `git stash@{0}`, docs oficiais Asaas (URLs em cada seção, consultadas 24/10/2026).

---

## 1. Estado atual da integração (inspeção de código)

### 1.1 Como o PIX da teleconsulta é criado hoje

`POST /billing/teleconsulta/:id` em `packages/server/src/routes/billing.routes.ts` (~L504-576):

1. Valida lembrete do dono, type=teleconsulta, `consultPriceCents>0`, `paidAt` nulo.
2. Cria uma **`Subscription` PENDING** (`createSubscriptionCompat`, `periodDays:0`, `amount = priceCents/100`) e marca a **tag** `mpPreferenceId = teleconsulta_<reminderId>`.
3. Chama `createPixCharge` (`payments/pix-provider.ts`) → provedor global `PAYMENT_PROVIDER` (mp | openpix | asaas). No Asaas: `POST /v3/payments` (billingType PIX, value em **reais float**, `externalReference = teleconsulta_<subId>`, dueDate = amanhã — mínimo aceito).
4. QR fica persistido na Subscription (`pixQrCode`/`pixQrBase64`/`pixExpiresAt`) para retomada 1-por-vez (409 devolve o MESMO QR).
5. Aprovação = webhook → `approvePendingSubscription(subId, {type:'teleconsulta', reminderId}, paymentId)` (`utils/billingApproval.ts` L71-84): em UMA transação grava `Reminder.paidAt = now` e **`Reminder.paymentRef = paymentId`** (id do pagamento no provedor, ex. `pay_...` do Asaas) e a Subscription vira `APPROVED`. Idempotente por `paidAt:null` condicional.

**POR QUE Subscription?** Herança deliberada do padrão do relatório avulso (`report_pack`): TODA a malha de pagamentos (webhooks MP/OpenPix/Asaas, `approvePendingSubscription`, retomada de PIX, job `pix-expiry`, conciliação §15.2) é chaveada em `Subscription` + tag — reuso com mudança mínima, sem novo modelo por produto. O `paymentRef` guarda exatamente o **id do pagamento no provedor** (não o id do customer, não o da cobrança interna) — é a chave de refund/consulta no Asaas. O modelo `Payment` (schema `@@map("payments")`, "ledger desacoplado de Subscription") existe mas NÃO é usado pelo fluxo de teleconsulta — candidato a avaliar na Onda 2.

**Gaps do estado atual vs §18:** sem ledger, sem comissão por médico (regra global única), sem entidade de repasse (estado vive em campos do Reminder), sem split de taxas, sem estorno parcial, sem histórico/troca de chave PIX, saldo derivável não existe.

### 1.2 `payments/asaas-provider.ts` (commitado, 240 linhas)

- Base URL: `ASAAS_API_BASE_URL` default `https://api.asaas.com` (**produção**). Sandbox = `https://api-sandbox.asaas.com`.
- Auth: header `access_token: $ASAAS_API_KEY` (sem Bearer — provado ao vivo 03/10).
- Existe hoje: `getOrCreateAsaasCustomer` (cache por userId; CPF obrigatório p/ PIX), `createAsaasPixCharge` (mínimo R$ 5,00), `getAsaasQrCode` (retry ~3s — QR assíncrono), `getAsaasPaymentStatus` (fail-closed: falha → null = NÃO pago), `createAsaasCardCharge` (inline + 3DS), `AsaasApiError` (400 do Asaas traz lista `errors[]`), `ASAAS_RECEIVED_STATUSES` (RECEIVED | RECEIVED_IN_CASH | CONFIRMED | DETERMINED — fonte única webhook + conciliação).
- **NÃO existem (commitado):** refund e transferência.

### 1.3 Chave do .env dev — realidade

`packages/server/.env` (dev) **NÃO tem `ASAAS_API_KEY` nem `PAYMENT_PROVIDER`** → dev roda com default `mp` (Mercado Pago; token prefixo `APP_USR` = produção do MP). A key do Asaas vive só no `.env.prod` da EC2 (fora do repo) e, segundo comentário do próprio provider e do stash, **é chave de PRODUÇÃO** (api.asaas.com). **Não existe key sandbox (prefixo `$aact_`) em lugar nenhum do repo.** Consequências:

- Zero chamadas de escrita ao Asaas nesta descoberta (respeitado — só leitura de documentação).
- **Pendência operacional: criar conta sandbox Asaas + key `$aact_` para homologar refund/transfer sem dinheiro real** (§18.10 exige sandbox).

### 1.4 WIP preservado — inventário do `stash@{0}` (wip-agents-fin-admin-p3-mortos-20261024)

**NÃO aplicado** — só inventariado; reaproveitar seletivamente nas Ondas 2/4:

| Arquivo | O que esboça | Avaliação |
|---|---|---|
| `schema.prisma` | `Reminder.refundedAt` / `Reminder.paidOutAt`; `Doctor.pixKey` / `pixKeyType` | Boa semente, mas estado-de-repasse-no-Reminder NÃO cobre o §18 (precisa entidade `Payout` com máquina de estados); campos migram para o novo modelo |
| `asaas-provider.ts` (+73) | `refundAsaasPayment` (POST `/v3/payments/{id}/refund`, corpo vazio = total), `createAsaasPixTransfer` (POST `/v3/transfers`, chave PIX, min R$ 5), `ASAAS_PIX_KEY_TYPES` (cpf/cnpj/telefone/email/aleatoria → CPF/CNPJ/PHONE/EMAIL/EVP) | Shape correto vs docs (validado nesta descoberta). Mínimo de R$ 5 em TRANSFERÊNCIA não confirmado na doc (o confirmado é o da COBRANÇA) — testar em sandbox. Faltam `externalReference` (idempotência oficial) e estorno PARCIAL (`value`) |
| `jobs/reconciliation.ts` (+200) | `runRefundPass` (paga + no_show/technical → refund; falha → fila manual) e `runPayoutPass` (completed + jointMs≥min + pixKey → transfer; guarda `updateMany` condicional; sem chave → `payout_pending_pixkey`); `runFinancePass` no mesmo tick §15.2 | Arquitetura idempotente correta (padrão do repo). Gaps: sem reserva de valor, sem reconciliação pós-timeout por `externalReference`, sem webhook TRANSFER_*, `payoutShareBcp` **default 1500 = 15%** (spec propõe 20% — divergência a decidir), regra global única (sem por médico) |
| `admin.routes.ts` (+106) | Central de exceções `GET /admin/exceptions` + resolve manual (join manual reminder/paciente) | Aproveitar direto na Onda 3 |
| `utils/settings.ts` | `teleconsulta.payoutShareBcp` (bps, 0–9900, default 1500) | Reaproveitar como regra GLOBAL (seed); regra por médico = nova tabela |

Base já commitada que a fundação consome: `Reminder.teleStatus` (scheduled|in_progress|completed|no_show|cancelled|technical), `Reminder.jointMs`, `Reminder.createdByDoctorId`, `Doctor.consultPriceCents`, `ExceptionQueue` (dedup kind+reminderId+open), job `reconciliation` §15.2 (cenários 1 e 4), webhook Asaas com re-verificação server-side do pagamento.

---

## 2. Capacidades do Asaas (docs oficiais — consultadas 24/10/2026)

### 2.1 Refund — CONFIRMADO
Fonte: https://docs.asaas.com/docs/estornar-cobranca · referência: https://docs.asaas.com/reference/estornar-cobranca.md
- `POST /v3/payments/{id}/refund`. Aplicável a PIX e cartão (cobrança recebida/CONFIRMED).
- **PIX permite estorno TOTAL e PARCIAL — inclusive múltiplos parciais** (soma ≤ total). Corpo vazio = total; `{value}` = parcial; `{splitRefunds[]}` quando há split.
- **Taxas da cobrança NÃO são devolvidas** (compensação/notificação) — quem assume a diferença é decisão comercial (D8).
- **Exige saldo disponível na conta** (o valor sai de volta por PIX). Sem saldo → **erro 400** ("é necessário disponibilizar saldo suficiente"). → manter reserva operacional + fila manual.
- PIX devolve por transação Pix (resposta traz `endToEndIdentifier` + `effectiveDate`); cartão volta na fatura (até 10 dias úteis).
- Status: cobrança `REFUND_REQUESTED` → `REFUND_IN_PROGRESS` → `REFUNDED`; objeto do estorno: `PENDING` … `AWAITING_CRITICAL_ACTION_AUTHORIZATION` … `DONE`. → "Estornado" no app só quando `REFUNDED`/refund `DONE`.

### 2.2 Transferência PIX — CONFIRMADO (com ressalvas operacionais)
Fontes: https://docs.asaas.com/docs/transferencia-para-contas-de-outra-instituicao-pix-ted.md · https://docs.asaas.com/docs/transferencias.md · referência: https://docs.asaas.com/reference/transferir-para-conta-de-outra-instituicao-ou-chave-pix.md
- `POST /v3/transfers`: `value` (**reais float**), `pixAddressKey`, `pixAddressKeyType` ∈ CPF|CNPJ|EMAIL|PHONE|EVP (CPF/CNPJ sem pontuação; telefone 11 dígitos com DDD), `operationType` PIX|TED, `description`, **`externalReference`** (id no nosso sistema), `scheduleDate` (ausente = **instantânea**), `recurring` (só PIX).
- Limite factual: valor ≤ **saldo disponível**; taxa no campo `transferFee` (tabela de preço não é pública — depende do plano/contrato → D6c).
- Status: PENDING → SCHEDULED → BANK_PROCESSING → DONE | FAILED (com `failReason`) | CANCELLED | BLOCKED. Resposta traz `netValue`, `effectiveDate`, `endToEndIdentifier`, `transactionReceiptUrl`.
- **AÇÃO CRÍTICA / Token SMS — atenção máxima:** resposta tem `authorized:false` quando a transferência aguarda autorização por **token SMS** (ação crítica). Doc de ações críticas (https://docs.asaas.com/docs/como-testar-ações-críticas.md) confirma: transferências/saiques podem exigir token conforme **configuração da conta**; sandbox usa token `000000`; **a dispensa é via suporte Asaas e não é a configuração recomendada de produção**. → Repasse AUTOMÁTICO depende de resolver isso contratualmente (D6b).
- Validar em sandbox: valor mínimo de transferência (não documentado; R$ 5 é da COBRANÇA) e titularidade (docs NÃO documentam validação automática de titular da chave — conferir chave×médico/PJ é responsabilidade nossa, §18.5).
- Acompanhamento por webhook: `TRANSFER_DONE` / `TRANSFER_FAILED` / `TRANSFER_CANCELLED` (+ intermediários) — https://docs.asaas.com/docs/webhook-para-transferencias.
- Nota: este fluxo NÃO é iniciação Open Finance (ITP).

### 2.3 Split / subcontas — CONFIRMADO (e ELIMINA a tese B)
Fontes: https://docs.asaas.com/docs/split-de-pagamentos.md · subcontas: https://docs.asaas.com/docs/subcontas.md
- Split "distribui automaticamente parte do valor recebido entre **outras contas Asaas**" — **cada recebedor precisa de conta Asaas** (`walletId`, tipicamente **subconta** criada por nós → KYC/onboarding por médico).
- **A distribuição dispara na LIQUIDAÇÃO da cobrança** (sobre `netValue`, taxas já descontadas; webhook `PAYMENT_SPLIT_DONE`). **NÃO existe mecanismo documentado de retenção/agendamento do repasse** — a única forma de segurar valor é NÃO incluí-lo no split (fica na conta criadora). **→ CONFIRMA a tese: split NÃO retém a parcela do médico até a "conclusão do atendimento".**
- Estorno de cobrança com split **reverte automaticamente os repasses** dos participantes — mas se o recebedor já sacou, a doc não detalha recuperação (mesmo problema do pós-repasse, sem controle nosso).
- Variação **Conta Escrow** (https://docs.asaas.com/docs/bloqueio-dos-valores.md): retém o valor recebido numa **subconta** por `daysToExpire`, com liberação manual via API. Resolveria a retenção, MAS exige subconta+escrow POR MÉDICO (onboarding, taxa por subconta, gestão de garantias) — custo/complexidade altos para ganho que o ledger interno + repasse já entrega com UMA conta.
- Splits: soma ≤ `netValue`; percentual 4 casas; bloqueio por divergência com 2 dias úteis para corrigir (`PAYMENT_SPLIT_DIVERGENCE_BLOCK`).

### 2.4 Webhooks — CONFIRMADO
Fonte: https://docs.asaas.com/docs/sobre-os-webhooks.md
- Autenticação: **header `asaas-access-token`** com token definido na CONFIGURAÇÃO do webhook (não é HMAC/assinatura; docs mandam NÃO usar API key como token). Validar header antes de processar. **Gap atual: nosso webhook Asaas não valida esse header** — mitiga hoje com re-verificação server-side + match de valor + payment.id conhecido; manter as DUAS camadas ao adicionar o header.
- Entrega **at-least-once**; idempotência pelo `id` do EVENTO (`evt_...`); até 10 webhooks/conta; após 15 falhas consecutivas a **fila pausa**; eventos retidos 14 dias.
- → Nosso processador precisa de tabela de eventos-vistos: a idempotência atual por status da Subscription serve para PAGAMENTO, mas é INSUFICIENTE para transferências (vários eventos distintos na mesma transfer; duplicado não pode avançar estado duas vezes).
- Eventos: `PAYMENT_RECEIVED*` (cobranças), `TRANSFER_DONE|FAILED|CANCELLED` (transferências), bloqueios de saldo (página própria), `PAYMENT_SPLIT_*`. Nomes exatos dos eventos de REFUND: conferir em https://docs.asaas.com/docs/webhook-para-cobrancas na homologação (não confirmados na descoberta — item da Onda 4).

### 2.5 Idempotência na API — NÃO CONFIRMADO server-side
Fonte: https://docs.asaas.com/docs/retries-e-idempotência.md
- **Não há header de idempotency key documentado na API.** O mecanismo oficial é o campo **`externalReference`** (existe em transfers e payments) + verificação prévia antes de reenviar + controle de concorrência no integrador.
- → Antiduplicação §18.6 é 100% nossa: **reserva atômica no banco ANTES da chamada** + `externalReference = payoutId` + pós-timeout CONSULTAR transferências por externalReference (nunca reenviar cego) + lock/status interno.

---

## 3. DECISÃO DE ARQUITETURA — **(A) Recebimento na conta única + repasse posterior via transferência PIX**

**Recomendada: (A).** Rejeitada: (B) split/subcontas (inclusive a variante Conta Escrow) para o fluxo atual.

| Requisito (§18) | (A) conta única + repasse PIX | (B) split/subcontas |
|---|---|---|
| Reter parcela do médico até atendimento cumprido | **Sim** — dinheiro fica na conta; "retenção" é OBRIGAÇÃO no ledger interno, liberada por evento nosso | **Não** — split distribui na LIQUIDAÇÃO (confirmado §2.3); exigiria escrow+subconta por médico |
| Onboarding do médico | Chave PIX que ele já tem (validação nossa chave×titular) | Conta Asaas/subconta por médico (KYC, walletId, taxa por subconta) |
| Estorno sem atendimento | Refund PIX da própria cobrança (total/parcial) — volta pro mesmo pagador | Estorno reverte splits; se médico sacou → recuperação fora do sistema |
| Estorno pós-repasse | Problema REAL (decisão D4), mas sob nosso controle/visibilidade | Idem e PIOR (sem visibilidade do saque) |
| Conciliação | 1 conta: cobranças × transferências × saldo vs ledger | N contas + garantias escrow + splits por cobrança |
| Custos | transferFee por repasse (rateio = D2) | taxa por subconta + saída equivalente |
| Compatibilidade com o existente | Stash já esboça refund/transfer; webhook/approval intactos | Reescreve a cobrança (walletId por médico) |

**Justificativa em 3 linhas (§18.4):** a regra "elegível só pós-atendimento" exige retenção por evento sob NOSSO controle — a doc confirma que split distribui na liquidação e não retém; em (A) a retenção é o ledger de obrigações (controle operacional, NÃO custódia/escrow anunciado — §18.3), com estorno do próprio PIX quando o atendimento não ocorre. (B) só alcançaria retenção via subconta+Conta Escrow por médico, multiplicando onboarding, taxas e superfície de conciliação sem eliminar o problema do estorno pós-saque.

**Guard-rails obrigatórios de (A)** (viram critérios de aceite): saldo interno nunca apresentado como custódia/escrow (tela e jurídico — §18.3/§18.4); refund depende de SALDO DISPONÍVEL → reserva operacional explícita + fila manual quando faltar; transferência pode exigir Token SMS (D6b); `externalReference=payoutId` como idempotência oficial; estado de transferência acompanhado por webhook `TRANSFER_*` — "Repassado" só com confirmação confiável (solicitado ≠ concluído, §14.4/§18.6).

---

## 4. Modelo de dados proposto (DESENHO — nada implementado)

Migration **aditiva** (padrão do repo: IF NOT EXISTS, drift-gate). Sketch Prisma:

```prisma
// PARTIDA DUPLA — imutável, só INSERT; correção = lançamento compensatório (§18.3)
model LedgerEntry {
  id          String   @id @default(cuid())
  txnId       String   // agrupa as partidas de UM evento (balanceamento por txn)
  reminderId  String?  // consulta (null p/ ajustes globais)
  doctorId    String?
  // contas: recebido | vinculado | obrigacao_medico | receita_plataforma | taxa_provedor |
  //         repasse_processando | repasse_concluido | estorno | reserva | ajuste
  account     String
  debitCents  Int      @default(0) // centavos INTEIROS (§18.3) — nunca float
  creditCents Int      @default(0)
  refType     String?  // payment | refund | transfer | subscription | commission_rule | payout
  refId       String?  // id no provedor/app (paymentRef, transferId, payoutId…)
  ruleSnapshot Json?   // regra comercial CONGELADA no evento
  createdAt   DateTime @default(now())
  @@unique([txnId, account, refId])
  @@index([reminderId])
  @@index([doctorId, createdAt])
}

// Regra comercial (§18.2): geral OU específica por médico; precedência: específica vigente > geral vigente
model CommissionRule {
  id                String    @id @default(cuid())
  doctorId          String?   // null = regra GERAL
  platformBps       Int       // 2000 = 20% plataforma (D1 confirma)
  payerOfPaymentFee String    @default("platform") // platform | doctor | split
  payerOfPayoutFee  String    @default("platform") // platform | doctor | split (D2)
  releaseDelayDays  Int       @default(7)           // D+N (D3)
  refundPolicy      Json      // total/parcial, janela, quem assume taxas não devolvidas (D8)
  validFrom         DateTime
  validUntil        DateTime?
  active            Boolean   @default(true)
  createdAt         DateTime  @default(now())
  @@index([doctorId, active, validFrom])
}

// REPASSE — máquina de estados §18.6 (estado SAI do Reminder: paidOutAt vira referência)
model Payout {
  id            String    @id @default(cuid())
  reminderId    String    @unique          // 1 consulta → no máx 1 repasse (antiduplicação estrutural)
  doctorId      String
  grossCents    Int       // valor pago pelo paciente (snapshot)
  platformCents Int       // comissão (snapshot da regra)
  feeCents      Int       @default(0)      // taxas do provedor rateadas conforme regra
  netCents      Int       // o que efetivamente sai
  status        String    @default("solicited") // solicitado|processando|concluido|falhou|cancelado|desconhecido
  reservedAt    DateTime? @default(now())  // RESERVA ATÔMICA antes da chamada ao provedor
  transferId    String?   @unique          // id Asaas da transfer
  externalRef   String    @unique          // = id deste payout → externalReference no Asaas (idempotência)
  attempts      Int       @default(0)
  lastError     String?
  ruleSnapshot  Json
  confirmedAt   DateTime? // só com TRANSFER_DONE (webhook ou GET confiável) — §18.6
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  @@index([doctorId, status])
}

// Dados de recebimento do médico — separado de Doctor p/ histórico de troca (§18.5)
model DoctorPayoutAccount {
  id         String    @id @default(cuid())
  doctorId   String
  pixKey     String    // exibição SEMPRE mascarada (API devolve mask, nunca a chave cheia)
  pixKeyType String    // cpf|cnpj|telefone|email|aleatoria → enum Asaas
  holderName String    // titular declarado p/ conferência chave×médico/PJ
  holderDoc  String?   // CPF/CNPJ do titular (criptografado — padrão pgcrypto do repo)
  verifiedAt DateTime?
  active     Boolean   @default(true)
  createdAt  DateTime  @default(now())
  @@index([doctorId, active])
}
```

**Snapshot no agendamento (§18.2/§15.3):** ao agendar a consulta com preço, resolver a regra (específica vigente > geral vigente) e gravar o JSON congelado **no Reminder** (`commissionSnapshot Json?`, campo novo aditivo): `{ruleId, platformBps, payerOfPaymentFee, payerOfPayoutFee, releaseDelayDays}`. Toda escrita de ledger copia desse snapshot — mudança de regra NUNCA recalcula o passado. Aprovação do resumo clínico (§14) fica em estado DISTINTO (não é elegibilidade financeira, §18.5).

**Fluxo de contas por evento (centavos, txn sempre balanceada):**
- Pagamento confirmado: D recebido 10000 / C vinculado 10000 (consulta ainda não realizada).
- Atendimento cumprido (completed + jointMs ≥ mínimo): D vinculado / C obrigacao_medico 8000 + C receita_plataforma 2000 + C taxa_provedor (conforme regra).
- Repasse: D obrigacao_medico / C repasse_processando → TRANSFER_DONE: D repasse_processando / C repasse_concluido.
- No_show/technical sem atendimento: D vinculado / C estorno + refund no provedor.
- Estorno pós-repasse (D4): lançamento `ajuste` a débito do médico (conta a receber) — nunca desconto silencioso de honorários futuros (§18.7).

**Reaproveitamento do stash:** `pixKey/pixKeyType` → DoctorPayoutAccount; `refundedAt` → derivável do ledger (coluna opcional como cache de leitura); `payoutShareBcp` global → seed da CommissionRule geral; passes refund/payout do reconciliation → reescritos sobre Payout na Onda 4.

---

## 5. Decisões comerciais PENDENTES (dono — bloqueiam ativação de regra real)

| # | Decisão | Contexto/Opções | Impacto se não decidir |
|---|---|---|---|
| D1 | **Split 20/80?** | Spec propõe 20% plataforma; stash esboçou default **15%** (divergência explícita). Base = valor bruto ou líquido de taxas? | Sem regra ativa real (§18.2 proíbe ativação silenciosa) |
| D2 | **Quem paga a taxa de REPASSE (transferFee)?** | Taxa por transferência (valor exato depende do contrato Asaas — não público). Plataforma / médico / rateio | Muda cálculo de netCents e o ledger |
| D3 | **Prazo de liberação (D+N) e periodicidade do job** | Proposta inicial: D+7, job diário, previsão visível pro médico | UX "previstos × liberados" e janela de estorno |
| D4 | **Estorno pós-repasse: como recuperar?** | Docs confirmam: taxas nunca voltam; valor já sacado/transferido não é revertido por nós. Opções: cobrança ao médico / ajuste contratual / bloqueio de repasses futuros COM aviso (nunca silencioso) | Risco financeiro ilimitado em contestação tardia |
| D5 | **Responsabilidade fiscal do comprovante** | §18.9: comprovante ≠ documento fiscal. Médico PJ emite NFS-e dos honorários? Plataforma se enquadra como quê (intermediação)? | Jurídico/contábil — bloqueia repasse automático real |
| D6 | **Enquadramento operacional com Asaas** | (a) conta atual autoriza transferências via API? (b) transferências vão exigir Token SMS por operação (ação crítica)? Existe dispensa/whitelist p/ automação? (c) taxa real da transfer PIX; (d) criar conta SANDBOX (`$aact_`) p/ homologação — hoje só existe key de produção | Sem isso NÃO existe repasse automático em prod (só supervisionado manual) |
| D7 | **Valor mínimo de repasse ("repasse mingau")** | Mínimo da transfer PIX não documentado (R$ 5 é da cobrança). Acumular até piso por médico? Exceção manual? | Repasse de consulta barata pode falhar em 400 |
| D8 | **Estorno parcial: janela e quem assume taxas não devolvidas** | PIX suporta parcial múltiplo; taxas nunca voltam (§2.1) | Política de reembolso ao paciente incoerente |
| D9 | **Teleconsulta passa a ser Asaas-only?** | Refund/transfer só existem na nossa camada Asaas; consulta paga por MP/OpenPix vira fila manual. Travar cobrança de teleconsulta no Asaas quando financeiro ativo? | Fila de exceções perpétua no mix atual de provedores |

---

## 6. Plano de ondas (Fases 2-4) — dependências e critérios de aceite

**Onda 2 — Fundação financeira (ledger + comissões)** — depende: aprovação deste doc. NÃO depende de Asaas.
- Migration aditiva (LedgerEntry, CommissionRule, Payout, DoctorPayoutAccount, Reminder.commissionSnapshot) + seed da regra geral INATIVA.
- Motor double-entry (escritor por evento: pagamento→vinculado; completed→obrigação+receita+taxa; repasse; estorno; ajuste) + snapshot no agendamento + cálculo de repasse puro (função unit).
- Testes §18.10 (subset): geral×específica; mudança de % sem retroativo; arredondamento/centavos; estorno parcial; **ledger balanceado em todo evento**.
- **Aceite:** toda escrita financeira passa pelo ledger; saldo derivado = soma de lançamentos; zero quebra de balanceamento na suíte; snapshot imutável comprovado por teste de mudança de regra.

**Onda 3 — Interfaces médico/admin/paciente** — depende: Onda 2 + D1/D3.
- Área financeira do médico (§18.1): previstos/em validação/liberados/em processamento/repassados/bloqueios com justificativa + extrato por consulta (valor contratado, descontos, base, %, taxas, honorários, situação) + dados de recebimento com chave MASCARADA + troca de chave com auth reforçada e histórico (não retroativo).
- Admin (§18.8): volume bruto · a devolver · obrigações · receita plataforma · taxas · margem de contribuição · caixa Asaas · comprometido + divergências · config de comissões (geral/específica com vigência) · auditoria · central de exceções estendida (kinds financeiros; base do stash admin.routes).
- Transparência paciente (§18.9): valor, pagamento, id da consulta, comprovantes, andamento de estorno — SEM extrato do médico.
- **Aceite:** mobile-first 320→1440 sem scroll horizontal; estados completos (loading/vazio/falha/pendência/bloqueio — nunca R$ 0,00 no lugar de "não carregado"); sem jargão em tela (ledger/webhook/payoutId proibidos); médico só vê o próprio; export sem dado clínico; contraste/foco/rotulagem/44px; screenshots de revisão antes de entregar.

**Onda 4 — Repasses e estornos (supervisionado → automático)** — depende: Ondas 2+3 + D2/D4/D6/D7 resolvidos + sandbox criado.
- Máquina de estados do Payout: reserva atômica → `POST /v3/transfers` (`externalReference=payoutId`) → webhook `TRANSFER_*` com validação de header `asaas-access-token` → `concluido` SÓ com confirmação confiável; `desconhecido` = congelar + investigar por externalReference (nunca reenviar).
- Refund total/parcial com reserva de saldo; 400-sem-saldo → fila manual; concorrência estorno×repasse (reserva nunca compartilhada); conciliação periódica Asaas×ledger (cobranças/transferências/saldo) com data da última passada e divergências abertas.
- Primeiro SUPERVISIONADO (cada transferência exige aprovação admin), depois automático com TODOS os gates §18.5.
- **Aceite (§18.10 completo, sandbox, sem dinheiro real):** 2 repasses simultâneos; timeout pós-aceite do provedor; webhook duplicado/atrasado/ausente; transferência rejeitada/desconhecida; troca de chave PIX durante processamento; estorno antes/depois do repasse; recuperação pós-restart; jornada §18.12 demonstrada ponta a ponta (paga→registrado→consulta→elegível→repasse solicitado→confirmado→extratos conciliados); relatório final implementado × testado em sandbox × dependente de habilitação contratual.

---

## 7. Notas de conformidade

- Este doc NÃO apresenta saldo interno como custódia/escrow (§18.4) — o enquadramento definitivo é pergunta ao Asaas (D6), ANTES de qualquer movimentação real.
- Nenhuma chamada de escrita ao Asaas foi feita nesta fase (só leitura de documentação; a única key existente é de produção).
- Controle operacional ≠ escrituração contábil/fiscal (§18.3) — o ledger serve decisão e conciliação, não contabilidade formal.

## DECISÕES COMERCIAIS — APROVADAS PELO DONO (24/10, "ok pra tudo")
- D1: **20% plataforma / 80% médico** (default dos params)
- D2: **taxa de transferência PIX: plataforma** (feeBearer=platform)
- D3: **liberação D+3** pós-consulta elegível
- D4: recuperação pós-repasse: **manual via combinação com o médico** (nunca desconto silencioso)
- D5: responsabilidade fiscal → **definir com contador** (pendente externo)
- D6: enquadramento Asaas (transferências/Token SMS/sandbox/taxa exata) → **dono pergunta ao suporte Asaas** (pendente externo — bloqueia só a onda 4 real)
- D7: **mínimo de repasse R$ 20,00**
- D8: estorno parcial: **plataforma absorve taxas não devolvidas**
- D9: teleconsulta: **Asaas-only**
Blocos externos restantes: D5 (contador) e D6 (suporte Asaas) — não travam ondas 2-3.

## D6 RESOLVIDO (24/10, verificação real na API pela EC2)
- GET /v3/transfers → 200 (habilitado; totalCount 0). Key .env `$$` = escape docker-compose (runtime sadio, `$aact_p…` produção). Token SMS: só um envio real revela — Onda 4 trata falha como estado 'unknown' → ExceptionQueue (nunca reenvia cego).

## D5 RESOLVIDO PELO DONO (24/10): intermediação — o MÉDICO emite a nota; plataforma (MEI do dono) é intermediadora de pagamento, zero burocracia adicional. Comprovante no app = transação (Asaas). Sem retenção de imposto do médico na plataforma.
