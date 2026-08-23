# Auditoria de Assinaturas + Arquitetura de Pricing + Cenários (2026-08-23)

> Pré-requisito da mudança de estratégia (R$19,90→R$29,90 + perks premium + configs no Admin).
> Tudo validado por leitura direta em produção (read-only) e no código.

## PARTE 1 — Assinantes reais hoje (validação em prod)

### 1.1 Assinaturas do PLANO MENSAL (periodDays=30): **ZERO aprovadas na história**
Nenhuma cobrança de R$19,90 jamais foi aprovada. As 42 linhas de `subscriptions` se dividem:
- **10 APPROVED** — todas são **compras de pack de créditos** (`periodDays=0`, R$9,90 cada):
  - `edmls2008@gmail.com` (dono/ADMIN) ×7 — **testes próprios do gateway** (17/06→14/08);
  - `danielsjk11@gmail.com` ×1 (20/06) — usuário real, 2 exames;
  - `gifevi9408@fivejm.com` ×1 (03/07) — domínio descartável, 0 exames → **provável bot**;
  - `caioaltomare@hotmail.com` ×1 (28/07) — **cliente real** (6 exames, entrou 28/07).
- **32 CANCELLED** — 28 do próprio dono (testes PIX) + 4 de `alvino62@gmail.com` (PIX gerados e nunca pagos, 20/08).

### 1.2 Usuários com `planExpiresAt`
| Email | Papel | Vigência | Origem |
|---|---|---|---|
| edmls2008@gmail.com | ADMIN | 2099-12-31 (vitalício) | concessão manual |
| demo.revisao@janocaminho.com.br | OWNER | 2027-06-23 | conta demo (Play review), manual |
| marcelo.sudo@gmail.com | OWNER | expirou 2026-07-31 | manual/teste (0 exames) |
| melissaf81736@hotmail.com | OWNER | expirou 2026-06-23 | manual/teste (2 exames) |

### 1.3 Veredito
**Não existe nenhum assinante real do plano mensal.** Existem 2 clientes reais de pack avulso (danielsjk11, caioaltomare; +1 bot) — **créditos são saldo, nada é invalidado por qualquer mudança de preço/pack**.
→ **Cenário confirmado para prosseguir sem preservação da regra "100 primeiros"** (mecânica de fundador entra como config **desligável**, default OFF).
→ Trial: **não existe entidade/coluna de trial** no sistema. Renovação: **manual** (job `planExpiry` só avisa 5d antes por e-mail/push/in-app; **não há auto-renew** — logo o risco do "teto do Pix Automático" não se aplica ao modelo atual).

## PARTE 2 — Arquitetura atual (mapa de dependências)

### Entidades
- `User.planExpiresAt` (premium = >now), `User.credits` (saldo único, nunca expira), `firstExamBonusGranted`.
- `Subscription` (colunas: mpPaymentId, mpPreferenceId, amount, periodDays, status PENDING/APPROVED/CANCELLED, pixExpiresAt/qr/qrBase64, pixCredits, pixNotifiedAt, rawWebhook) — **mesma tabela** serve mensal (periodDays=30, external_reference=subId) e packs (periodDays=0, external_reference=`subId|credits`).
- `CreditTransaction` (extrato: kind purchase/plan_monthly/ai_chat/ai_consolidated/…).
- `AppSetting` (chave → JSON): `creditCosts`, `uploadRules`, `grants`, `shares`, `badges`. Cache em memória (`getSettings`); `saveSettings` persiste e sincroniza.

### Fluxos de dinheiro
1. **Mensal**: `POST /billing/checkout` → cria Subscription PENDING com `amount=PLANS.monthly.price (19.90 HARDCODE)` → MP Checkout Pro (redirect) → **webhook público `POST /billing/webhook`** (HMAC x-signature obrigatório em prod; sem secret só dev) → busca pagamento no MP → se approved e sub≠APPROVED: `planExpiresAt=+30d` + `credits += grants.monthly (250, settings)` + extrato `plan_monthly`. **Idempotente** pelo status do sub. `doctor_sub_<id>` (Pro médico R$29,90) é branch separado — **não mexer**.
2. **Packs**: `POST /billing/buy-credits` (pix|card|debit) → PIX inline **idempotente** (reusa PENDING não-expirado) ou Checkout Pro → webhook credita via `external_reference=subId|credits`. **Packs HARDCODED em `CREDIT_PACKS`** (billing.routes:19).
3. **Webhook sempre responde 200** ao MP (senão re-tenta); erros só logados.
4. **Job planExpiry** (1h, janela 8-11h): nudge 5d antes, dedupe 7d, e-mail+push+in-app. Sem renovação automática.

### Regras de crédito/limite (consumidores)
- `CREDIT_COSTS` (settings): extraction=0, summary=10, consolidated=20, chat=2, actionPlan=8, question=2.
- `UPLOAD_RULES`: **quirk — inicializa de ENV e "volta ao padrão se reiniciar"** (comentário no código): free=1/upload; premium 6 grátis/mês por dependente → 5 cada. ⚠️ Editar no admin NÃO sobrevive a restart → **a migrar para settings persistidas**.
- `grants.freeSignup=45` em prod (bônus do 1º exame extraído; landing coerente ✓), `grants.monthly=250`, `freeExamLimit=2` (**legado** — o paywall real é por ano no ExamList; billing/status ainda expõe).
- Família: limite 4 perfis grátis; extra = 50 créditos (patient.routes).
- Gates premium reais hoje: **apenas histórico de anos anteriores** (ExamList/Timeline).

### Front — onde o preço/preços vivem (HARDCODE)
`Landing.tsx:88` (card planos), `Plans.tsx:325` (card mensal), `ConsolidatedReport.tsx:413` (CTA), `FaqSection.tsx:32` (texto) + server `billing.routes.ts:14` (PLANS) + `admin.routes.ts:209/228` (GET/PATCH config resposta) + `admin.routes.ts:454` (MRR ×19.9). **7 pontos.**
`GET /billing/plans` (público, sem auth) já retorna `plans[].price` + `creditPacks` + `creditCosts` — **o front simplesmente não usa o price**.

### Prod-specific
MP webhook exige HTTPS público para notification_url; `MP_WEBHOOK_SECRET` em prod (HMAC); `webBasePath=/minhasaude` nas back_urls; PIX expira e tem job de warning/cancel (`startPixExpiryJob`).

## PARTE 3 — Cenários (sucesso / falha / borda)

### Sucesso
| # | Cenário | Esperado |
|---|---|---|
| S1 | Novo usuário vê planos | preço/preços vindos da API (settings), nunca hardcode |
| S2 | Compra mensal aprovada | +30d premium + créditos do settings + extrato |
| S3 | Compra pack aprovada | +créditos saldo (idempotente) |
| S4 | Renovação manual | novo +30d (empilha sobre hoje? — ver B5) + nova cota |
| S5 | Premium gera relatório consolidado | sem débito de créditos (perk novo) |
| S6 | Premium envia 7º exame do mês | sem cobrança (cota settings alta) |
| S7 | Premium cria 5º-10º dependente | permitido, sem cobrança |
| S8 | Admin muda preço | checkout NOVO usa novo valor; PENDINGs antigos continuam válidos no valor antigo (MP já criou a preferência) |
| S9 | Admin muda packs | novas compras usam novo pack; créditos antigos intactos |
| S10 | Usuário criado antes da regra (free) | comportamento idêntico (nada retroativo) |
| S11 | Fundador ON + dentro do limite | checkout cobra preço fundador |
| S12 | Fundador esgota limite | checkout volta ao preço cheio automaticamente |

### Falha
| # | Cenário | Esperado |
|---|---|---|
| F1 | Pagamento recusado | sub fica não-APPROVED; webhook não credita; nada quebra |
| F2 | Webhook duplicado (MP re-tenta) | idempotente via `status !== 'APPROVED'` (já existe) |
| F3 | Webhook atrasado/fora de ordem | busca pagamento atual no MP; estado final prevalece |
| F4 | Assinatura HMAC inválida | 401, não processa (já existe em prod) |
| F5 | MP fora do ar no webhook | catch → 200 ao MP; MP re-tenta (estado se resolve) |
| F6 | Config inválida no admin (preço 0/negativo, textos) | validação server + UI; preço ≤0 rejeitado |
| F7 | Banco indisponível | erro 500 nos fluxos; sem estados parciais (transações) |
| F8 | PIX expirado | job cancela + push (já existe); nova compra = novo QR |
| F9 | Duas compras simultâneas do mesmo user | PIX: idempotência reusa PENDING; mensal: 2 subs PENDING possíveis, webhook aprova as que pagarem (créditos somam; premium empilha +30d por aprovação — comportamento existente aceitável) |

### Borda
| # | Cenário | Esperado |
|---|---|---|
| B1 | Virada de data na vigência | planExpiresAt é timestamp absoluto (imune a TZ do job) |
| B2 | Timezone do job 8-11h | usa hora do server (UTC em prod) — janela pode correr 5-8h BRT (comportamento atual, sem mudança) |
| B3 | Exatamente no limite do fundador (última vaga, 2 checkouts simultâneos) | contagem atômica por webhook (`updateMany` condicional) — no máximo N aprovam com preço fundador |
| B4 | Acima do limite | preço cheio |
| B5 | Regra alterada com usuário premium ativo | nada retroativo: vigência/créditos permanecem; perks novos valem imediatamente (são leituras de settings + status) |
| B6 | Remoção de benefício (ex.: consolidado volta a custar) | leitura por geração — próximo relatório volta a cobrar (sem estado órfão) |
| B7 | Usuário com `legacy_adjustment`/dados antigos | saldo continua válido (int touching) |
| B8 | Webhook de pagamento ANTES da transação local | webhook grava rawWebhook em PENDING; aprovação posterior normal |
| B9 | Restart do container no meio | transações atômicas; PENDINGs recuperáveis; PIXs re-renderizados pelo job existente |
| B10 | Cache de settings desatualizado | saveSettings sincroniza em memória no mesmo processo; novo processo lê do banco no boot |

### Rollback
Toda a estratégia é **dados, não código**: reverter preço/packs/perks = editar settings no admin (sem deploy). Código-fonte mantém defaults antigos se a linha de settings for removida. Nenhuma migration destrutiva (nenhuma migration necessária — ver implementação).
