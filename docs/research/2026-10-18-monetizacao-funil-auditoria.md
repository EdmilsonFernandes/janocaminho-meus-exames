# Auditoria de monetização & funil — dados de produção (18/10/2026)

> Estudo solicitado pelo dono: "está tendo criação de contas, mas não consigo monetizar".
> Fontes: queries SQL read-only no banco de prod (18/10 ~11h), leitura do código
> (`credits.ts`, `settings.ts`, `admin.routes.ts`, `achievements.ts`, `InsufficientCreditsDialog.tsx`,
> `auth.routes.ts` DELETE /account), memories de pesquisa (ativação 08/09, pricing 23/08).

---

## 1. O que os dados dizem (snapshot prod)

### Crescimento é REAL — dobrou
Signups OWNER por semana: **ago = 4-7/sem → set-out = 9-16/sem** (semana atual 10-12: 16, ainda correndo).
Exames EXTRAÍDOS por semana: 2-6 antes → **7-9-5-13** nas últimas 4. Recorde na semana atual.

### Funil histórico (124 contas)
| Etapa | N | % do anterior |
|---|---|---|
| Signups OWNER | 124 | — |
| E-mail verificado | 106 | 85% |
| Ativou (1º exame EXTRAÍDO) | 31 | 29% |
| Usou IA (dos ativados) | 17 | **55%** |
| Esgotou TODOS os bônus orgânicos | 7 | 41% dos que usaram |
| Comprou algo (packs R$9,90) | ~5 reais | — |
| Premium ativo | **1** (= conta demo do dono) | 0% |

- Coorte pós-15/09 (49 novos): 41 verificados, **16 com exame = 33% de ativação** (era 20-23% na pesquisa de 08/09 → R1-R3 FUNCIONARAM), 0 premium.
- Exames por usuário: **94 com 0** · 17 com 1 · ~13 com 2+ · 1 com 24 (teste).
- Uso de IA (créditos debitados/mês): **jun 1112 · jul 1938 · ago 530 · set 179 · out 120**. Despencou do pico de jul (testes + primeiros users). Out: 6 usuários distintos, e o top gastador 30d é o próprio dono (220 créditos).
- Saldo: **72/124 zerados** — mas a maioria zerada NUNCA ativou (cadastro = 0 créditos, sem bônus). Só **7 esgotaram de verdade** o que ganharam. 8 zerados voltaram ativos na última semana (provável demanda reprimida invisível).
- Receita real da história: **R$118,80** em 12 APPROVED (metade = testes do dono). CANCELLED=62 é ruído de PIX expirado/testes. **Zero receita recorrente.**

### A economia que roda hoje (settings VIVOS em prod ≠ defaults do código)
| Knob | Prod | Default código |
|---|---|---|
| Plano mensal | **R$29,90** / 300 créditos | R$19,90 / 250 |
| Custo: chat / resumo / consolidado / extração | 3 / 10 / 20 / **0** | 2 / 10 / 20 / 0 |
| Upload: free / premium-quota / premium-excedente | **5** / 6/mês / 8 | 1 / 6 / 5 |
| Bônus 1º exame (CPF bate) | 45 | 60 |
| Conquistas permanentes + mensais | 52 + até 14/mês | idem |
| Quiz / screening mental / referral | 5 / 3 / 10+10 | idem |
| Packs | 50=R$9,90 · 140=R$24,90 · 320=R$49,90 | idem |
| Founder / firstFree summary | OFF / ON | OFF / ON |

**Matemática do usuário free engajado:** 45 (1º exame) + ~7 (conquistas fáceis) + 5 (quiz) + 14/mês (mensais) ≈ 60 forever + 14/mês → **~4-5 chats + 1 resumo por mês, grátis para sempre**, sem nunca precisar pagar. E o que zera primeiro quem só sobe PDF é o UPLOAD (5 cada, 74 uploads = -282 créditos) — a parede cobra exatamente o gancho que o produto quer (upload), antes do valor (IA).

---

## 2. Diagnóstico — 5 causas de não monetizar

1. **Volume**: 124 contas, ~6 usuários de IA/mês. Mesmo conversão ótima (5%) = 6 pagantes. O crescimento novo é o ativo — protegê-lo importa mais que extrair receita agora.
2. **Paywall no lugar errado**: upload custa 5 (fricção no gancho, "Modelo A" dizia extração grátis); leitura pontual é quase commodity (ChatGPT grátis) — o que o app cobra caro (consolidado 20) é justamente o mais usado.
3. **Créditos acumuláveis + mensais renováveis = fundo infinito para uso leve.** Quem engaja nunca esgota (só 7 esgotaram); quem esgota não tem ponte: o 402 abre diálogo que vende o pack mais barato (R$9,90) — sem trial, sem mensal como opção comparada, sem oferta de resgate.
4. **Premium empacotado como "300 créditos"** (metered disfarçado de assinatura). Uso real do app inteiro é ~120 créditos/mês — o premium nunca é "necessário", é "maior". Falta o empacotamento por CONTINUIDADE (o que só existe aqui: histórico completo + tendências + sinais diários + relatório pro médico + família).
5. **Cegueira de funil**: paywall-hit (402) não é logado; deleção de conta não deixa trilha (cascade puro, sem audit); top gastador de IA = dono (sem flag isTest distorce tudo); coorte só mensal; sem fonte de aquisição (16/sem... de onde?). "Coloca e exclui" é invisível: `EXAM_DELETED`=24 no audit, mas conta apagada = 0 rastro.

**O que os dados REFUTAM**: "ninguém quer pagar porque não gostam" — falso. 55% dos que ativam usam IA; ativação subiu p/ 33%; exames/semana em recorde. **Gostam. O produto entrega o valor principal de graça e cobra o errado.**

---

## 3. Instruções — o que o admin JÁ tem vs. o que falta

**Já existe (rotas admin):** `/metrics` (funil signups→verified→premium, MRR, churn no vencimento, coorte MENSAL, receita/mês), `/feature-usage` (funil de ativação + 12 features + ativos 7/30d + últimos 5 users), `/credit-usage`, `/ia-usage` (custo tokens), `/payments`, `/referrals`, `/users`, `/exams`, `audit_logs` (REGISTER, LOGIN, EXAM_DELETED, BOT_BLOCKED...). É bastante — o problema não é falta de dashboard, é **granularidade e 3 eventos ausentes**.

**Falta (P0, 1-2 dias de trabalho):**
| # | O quê | Por quê |
|---|---|---|
| 1 | Logar `paywall_hit` (feature, saldo, userId) quando o 402 ocorre | Sinal nº1 de disposição a pagar; hoje 100% invisível. 8 zerados ativos 7d = demanda reprimida não medida |
| 2 | `audit('ACCOUNT_DELETED', { reason })` + dialog "por quê?" antes de excluir + contador global | "Coloca e exclui" deixa de ser fantasma |
| 3 | Flag `isTest` no User (dono/equipe) e excluir das métricas | Top gastador de IA é o dono; receita "orgânica" mistura testes |
| 4 | Coorte SEMANAL + retenção D0/D7/D30 no `/metrics` | Coorte mensal é cega com base de 6 semanas e growth semanal |
| 5 | Guardar origem (UTM/referrer/play/push) no signup | 16/sem sem saber de onde = marketing no escuro |
| 6 | Conferir cobertura de `ai_usage_logs` (ledger mostra 13 chat-users na história; ai_usage_logs 6 em 30d) | Se o log de uso está furado, `/ia-usage` mente |

---

## 4. Estratégia recomendada

### P0 — agora (settings + instrumentação, sem quebrar nada)
1. **Upload freeCost 5 → 1** (admin, sem deploy). Parede sai do gancho. `freeExamLimit=2/mês` continua como régua de uso justo.
2. **Pack primeira compra R$4,90 / 30 créditos** (admin: creditPacks). O `InsufficientCreditsDialog` já sugere o mais barato em 1 toque PIX — quebrar a barreira do 1º pagamento vale mais que a margem do pack.
3. **LIGAR o Plano Fundador** (R$19,90, 100 vagas — já implementado, OFF). Growth ativo = urgência real; early adopters viram depoimento e caso.
4. Instrumentação da tabela acima (os 6 itens).

### P1 — 2-6 semanas (a ponte esgotou→pagou)
5. **Trial de resgate**: ao bater 402 com histórico de uso (≥3 ações de IA), oferecer UMA vez "7 dias Premium grátis" (sem cartão) no lugar do pack. Momento de máxima intenção — não no cadastro.
6. **Upgrades no dialog 402**: além do pack barato, mostrar a conta comparativa ("1 mês = 300 créditos ≈ 6x este pack + upload premium") — hoje só existe o pack; quem consome consolidado (20/uso) queima R$9,90 em 2 leituras e desiste.
7. **Recompensas mensais viram "créditos do mês"** (não acumulam além de 30): quem engaja mantém o hábito grátis moderado, mas não forma poupança infinita. Permanentes (52) intactos. *Única mudança P1 que exige código + migration leve.*

### P1.5 — o reposicionamento (decisão estratégica, ~30-60d)
8. **Premium deixa de ser "300 créditos" e vira "acompanhamento completo"**: IA ilimitada no app (fair-use invisível server-side), família até 10, relatório médico ilimitado, tendências/sinais. Créditos continuam existindo SÓ para free e packs. Argumento de dado: uso real total ≈ 120 créditos/mês — ninguém precisa de 300; "ilimitado" vende continuidade, "300 créditos" vende matemática que o usuário faz e percebe que não precisa.
   - Mensal mantém (decisão do dono 16/06: sem anual). Testar preço R$19,90 vs R$29,90 via founder primeiro.

### P2 — ticket alto com base pequena (paralelo, quando os gates abrirarem)
9. **Relatório avulso "Check-up p/ levar ao médico" R$9,90** (PDF bonito + QR de veracidade). Consolidado é o produto mais consumido (114 usos, -2180 créditos) — venda avulsa captura quem não assina.
10. **Plano Família R$39,90** (familyLimit=10 já existe no premium; empacotar).
11. **Médico premium R$49-99/mês** quando N pacientes/médico (portal já espelha o app; funil médico já mapeado). B2B é o que paga a conta com base pequena de pacientes.
12. **API pública** (packs já configurados) — falta o 1º piloto (segurar até demanda real).

### O que NÃO fazer
- **Não apertar o free agora** para forçar pagamento — mataria o growth que começou (16/sem). Guardrail: qualquer mudança de régua não pode derrubar ativação D0 (rollback = settings, 1 clique).
- **Sem anúncios** (posicionamento clínico premium; receita irrisória).
- **Sem A/B de preço antes dos eventos de funil** (lição já documentada da pesquisa de landing).
- **Não cobrar o upload de novo** — a parede volta pro lugar certo (IA de continuidade).

---

## 5. Métricas-alvo 90 dias (com os instrumentos do P0)

| Métrica | Hoje | Meta 90d |
|---|---|---|
| Signups/semana | 16 | 25 |
| Ativação D0/D30 da coorte | 33% | 45% |
| Usuários com ≥1 ação IA/semana | ~1,5 | 8 |
| Paywall hits/semana | ? (invisível) | baseline sem. 1 → converter 15% |
| 1ª compra orgânica/semana | ~0 | 1-2 |
| Deleções de conta/semana | ? (invisível) | baseline + -50% com trial de resgate |
| Premiums orgânicos ativos | 0 | 10 (founder ajuda) |

**North star sugerido:** "ativos semanais com ≥1 ação de IA" — é o único número que junta aquisição (crescendo), ativação (boa) e valor percebido (o gargalo real).

---

## 6. Como reproduzir os números

```bash
ssh -i /tmp/jano.pem ec2-user@janocaminho.com.br
cd ~/meus-exames/janocaminho-meus-exames
DBC=$(grep '^DATABASE_URL' .env.prod | head -1 | sed 's/^DATABASE_URL=//; s/?.*//')
docker exec janocaminho-postgres psql "$DBC" -c "<query>"
# queries completas no histórico desta sessão; funil:
#   /api/admin/metrics e /api/admin/feature-usage já expõem quase tudo
```

**Nota de honestidade:** `ai_usage_logs` parece subnotificar vs. `credit_transactions` (6 vs 13 chat-users); onde os dois divergem, este estudo usa o LEDGER (fonte financeira). Confirmar antes de mexer no `/ia-usage`.

---

## 7. IMPLEMENTADO (18/10, lote P0 — branch `worktree-monetizacao-p0`)

Decisão do dono: **ações 1-6 + 8**. O que entrou:

| # | O quê | Onde |
|---|---|---|
| 1 | Upload `freeCost` 5→1 (prod) | `scripts/monetizacao-p0-prod.sql` (app_settings) |
| 2 | Pack **p30 R$4,90/30** na frente dos 3 existentes (p50/p140/p320 mantidos) | `settings.ts` DEFAULT_SETTINGS.creditPacks |
| 3 | **Fundador LIGADO** R$19,90/100 vagas (preserva `used`) | `scripts/monetizacao-p0-prod.sql` |
| 4a | **paywall_hits**: tabela nova + `logPaywallHit()` nos 9 pontos de 402 | migration `20261018150000_monetizacao-p0` + `utils/paywall.ts` + 7 routes |
| 4b | **ACCOUNT_DELETED com motivo** (dialog 1 clique na Privacidade → `reason` → audit_logs) | `auth.routes.ts` DELETE /account + `Privacy.tsx` |
| 4c | **isTest** (dono/demo/testes fora das métricas) | coluna + `/metrics` filtra + SQL de marcação |
| 4d | **Coorte semanal** (signups → 1º exame → usou IA → voltou D7) | `/metrics` + OverviewTab |
| 4e | **Origem do cadastro** (utm/referrer, localStorage entre páginas) | `utils/signupSource.ts` + register + `/metrics` |
| 5 | **Dialog 402 escalonado**: trial 7d grátis (+100cr, quem tem 3+ usos de IA) → relatório avulso → pack mais barato → comparativo mensal | `InsufficientCreditsDialog.tsx` + `POST /billing/trial` |
| 6 | **Cap dos mensais** (`monthlyClaimCap=150`): mensal não paga com saldo ≥ cap; abaixo paga até o cap; permanente intacto; kill-switch no admin | `achievement.routes.ts` claim |
| 8 | **Relatório avulso R$9,90** (voucher `reportVouchers`, compra 1-toque PIX no 402 do consolidado; webhooks Asaas/OpenPix/MP marcam `report_pack`/`REPORT`; voucher volta se IA falhar) | `billing.routes.ts` + `billingApproval.ts` + 2 webhooks + `analysis.routes.ts` |

De 8, ficam como próximo gate: família R$39,90 (SKU sem diferencial claro ainda — dependentes já compartilham créditos) e médico premium (webhook `doctor_sub_` já existe; falta checkout/gates do portal). Testes: `test/monetization-p0.test.ts` (paywall, voucher, trial, cap, origem, deleção).
