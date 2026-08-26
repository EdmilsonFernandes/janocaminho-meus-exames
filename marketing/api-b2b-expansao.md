# Expansão da API paga (B2B) — novas APIs monetizáveis

> Análise GSD (goal-backward) 2026-08-26. Parte da API v1.1 JÁ NO AR:
> `/api/public/v1` com `/meds`, `/meds/prices`, `/meds/interactions`,
> keys + packs pré-pagos (R$19,90/1k · R$99/10k · R$399/50k) + saldo por
> chamada + rate limit 60/min + fluxo access-request (empresa + aprovação).

## GOAL

**Receita B2B recorrente expondo capacidades que o projeto já tem, com custo
marginal conhecido e zero PII.**

O que precisa ser TRUE:
1. Cada endpoint novo reusa um MOTOR existente (sem construir do zero).
2. Custo marginal por chamada é medido (0¢ ou custo LLM embutido no preço).
3. Cobrança entra no MEcanismo que já existe (packs/saldo apiCallBalance).
4. LGPD/ANVISA: dado de varejo/conhecimento, nunca PII de paciente nosso.

## O que temos de motores (ativos)

| Motor | Onde | Custo/chamada |
|---|---|---|
| Normalização de remédios | `pricing/normalize.ts` (parse ativo/dose/forma/pack + aliases) | 0¢ |
| Preços 9 farmácias | snapshots VTEX (cache global 6h) | 0¢ (cacheado) |
| Interações A-X | `interactionRule` (curada, D/X) | 0¢ |
| **Extração de laudo** | pdftotext → GLM (pipeline completo) | ~custo LLM (margem no preço) |
| **Interpretação/faixas** | `displayStatus` + faixas pediátricas/adulto + knowledge DB | 0¢ |

## Propostas (ranqueadas por esforço × valor)

### P1 — `POST /v1/meds/normalize` (quick win, ~meio dia)
Texto livre → `{activeIngredient, dosage, unit, form, packQty, medicationKey, aliasesResolvidos}`.
- **Quem paga**: apps de saúde, farmácias, seguradoras — todo mundo que ingere
  nome de remédio sujo ("Dorflex 10cp", "levotirox 75") e precisa de chave canônica.
- **Gancho de funil**: normaliza → chama `/meds/prices` no mesmo fôlego (1 chave,
  2 chamadas cobradas). Normalização é a "isca" que puxa o consumo de preços.
- **Success criteria**: "Dorflex Analgésico e Relaxante Muscular 10 comprimidos"
  → `DORFLEX ANALGESICO E RELAXANTE|10|CP|10` idêntico ao app; teste E2E cobrindo
  os 13 casos do `medication-matching.test.ts`.

### P2 — `POST /v1/exams/extract` (a joia da coroa, ~2-3 fases)
PDF do laudo → JSON estruturado (itens + valor + unidade + faixa + flag).
- **Quem paga**: labs pequenos sem OCR, clínicas, portais de resultado, RH/benefícios.
- **Precificação PRÓPRIA** (custo LLM real): classe de chamada "pesada" — ex. pack
  `extract100` = 100 extrações por R$ 49 (≈R$ 0,49/exame vs custo LLM ~R$ 0,05-0,10).
- **Infra**: `apiCallBalance` precisa de peso por endpoint (hoje 1 call = 1 crédito);
  middleware ganha `cost` por rota.
- **Guardrail**: documento é do CLIENTE da API (B2B processa laudos dele) — ToS
  explícito, nunca laudo de paciente nosso.

### P3 — `POST /v1/exams/interpret` (margem pura, ~1 fase)
`items[]` (+perfil idade/sexo) → flags + status + faixa aplicada + diretriz citada
(ADA/SBC/OMS; pediátrico Harriet Lane). Zero LLM — regras determinísticas.
- **Quem paga**: labs (enriquecer laudo com "ideal" não só referência), plataformas
  de benefício, wearables.
- **Success criteria**: TSH 7,32 (ref 0,4-4,0) → `HIGH/atencao` com a mesma saída
  do app; pediátrico 2-6a aplica banda da idade e marca o item.

### P4 — Portal self-service do dev (só quando tiver 3+ clientes)
Signup → key automática (reviewRequired=0) + dashboard de consumo por key.
Já existe: access-request + aprovação admin. É só tirar o atrito.

## Fases (roadmap GSD)

| Fase | Entrega | Verificação de meta |
|---|---|---|
| 1 | `/v1/meds/normalize` + docs + testes | 13 casos do matching passam via API; key de teste consome 1 crédito |
| 2 | `cost` por endpoint no middleware + packs de extração no settings | chamada extract debita peso N; admin vê no financeiro |
| 3 | `/v1/exams/extract` (upload PDF → JSON) | laudo real de teste → 20+ itens extraídos c/ flag |
| 4 | `/v1/exams/interpret` | mesmo resultado do app p/ 10 casos-espelho |
| 5 | docs públicas `/api/docs` v2 com exemplos + pricing | página carrega sem login com curl copiável |

## Por que NÃO expor (por enquanto)
- **CRM lookup**: cota consultacRM 100/mês — expor queima a cota do app.
- **Chat/IA de saúde**: prompt carrega contexto de paciente — risco LGPD alto.
- **Push/WhatsApp**: infra própria, sem valor pra terceiro hoje.

---
Fontes internas: `public-api.routes.ts` (v1.1 no ar), `middleware/apiKey.ts`
(saldo/packs), `utils/settings.ts` (apiAccess), `pricing/normalize.ts`,
`medication-matching.test.ts`. Ver também `estrategia-remedios-precos.md`
(Lomadee — API paga é a outra perna da mesma estratégia).
