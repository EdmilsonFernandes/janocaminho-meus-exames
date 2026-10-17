# Estudo — Life Dashboard Companion × Fitbit × Dr. Exame (Sinais Vitais)

> Data: 2026-10-16 · Contexto: dono pediu estudo do repo
> [owen282000/life-dashboard-companion-app](https://github.com/owen282000/life-dashboard-companion-app)
> + ideia de "clicar na área de conexão → dashboard de saúde estilo Fitbit".

## 1. O que é o Life Dashboard Companion

App Android (Kotlin/Compose, MIT, 1 pessoa, boa parte gerada com Claude Code) que lê o
**Health Connect** (33 tipos) + **screen time por app** e empurra tudo para
**Home Assistant / MQTT / webhook** — sem nuvem, sem conta, sem analytics. O "dashboard"
dele é um dashboard de Home Assistant/Grafana auto-hospedado. É um **pipeline de dados**
para o público *quantified self*, não um produto de consumidor.

**Ecossistema "Life Dashboard"** (4 projetos): app Android, app iOS, integração HA,
stack Grafana (Postgres+receiver com verificação HMAC). Todos os destinos recebem o
mesmo payload.

### Padrões de engenharia dignos de nota
| Padrão | Detalhe |
|---|---|
| Switch por tipo (33) | Consentimento granular = minimização LGPD |
| Backfill 30/90/365d | Em chunks de 3 dias, retomável, respeita quota de leitura do HC |
| Daily totals do próprio HC | Dedup nativo: passeio registrado por phone+watch conta 1× |
| Outbox store-and-forward | Payload espera no aparelho se o server cai; deleta só após ACK |
| Data resolution | Downsampling opcional por tipo (1/5/15/60min, média+min+max) |
| Write-back no HC | Balança/PA do HA entram no HC → Samsung/Google Health leem |
| HMAC-SHA256 + retries + logs | Confiabilidade de entrega auditável |
| DATA_SOURCES.md | "O que cada marca (Garmin/Samsung/Fitbit/Oura) realmente escreve no HC" |
| Deleções propagadas | `deleted_records` no payload |

### O que NÃO copiar
- Destinos MQTT/webhook/HA (nós SOMOS o server do usuário).
- Screen time por app (fora do core clínico; pesado em privacidade — talvez futuro
  opt-in ligado ao módulo PHQ-9/GAD-7).

## 2. Gap encontrado no nosso código

`HealthBridge.kt` lia **6 tipos** (passos, distância, kcal ativa/total, FC,
exercício) — **ZERO sono** (`grep -c Sleep` = 0), enquanto a Landing promete
"ler passos, **sono** e batimentos" (`Landing.tsx:778`). Sono é a peça central do
dashboard Fitbit. **Corrigido neste lote** (SleepSessionRecord no CORE).

## 3. Referência Fitbit (Today)

O padrão que interessa: **cada tile é uma porta** — tile de passos/sono/FC no "Today"
leva à página de tendência (1s/1m/1y). Scores no topo (Readiness/Sleep). Aprendizado:
**portas, não azulejos** — o dashboard inicial não incha; cada card conectado abre
um mundo.

### FitnessView (iOS, ref. macmagazine 07/2021)
Agregador do Apple Health/Saúde: dashboard com anéis, aba Estatísticas
(dia/semana/mês/ano), tendências, gráficos de FC, metas configuráveis (calorias,
passos, cafeína, hidratação), layout personalizável, widgets/complicações **no
premium** (freemium ~R$8/mês). Validações p/ nós: (a) freemium de sinais vitais
sustenta assinatura; (b) "comparativo vs período" e períodos longos são
esperados; (c) metas configuráveis e widget são payload premium natural
(roadmap). Implementado neste lote: **deltas por métrica** (1ª×2ª metade da
janela — honesto com as duas fontes de dado).

**Estratégia**: NÃO clonar Fitbit (commodity — o Google Health/Fitbit é o leitor
oficial do HC). Diferencial Dr. Exame = **correlação clínica** ("exame = foto,
sinais vitais = filme" — copy que já existe na nossa Landing).

## 4. Decisões de produto (acordadas com o dono)

1. **Página "Sinais Vitais" (`/sinais`)** — layout inspirado no Today do Fitbit
   (herói com anel de meta + tiles + tendências), identidade Dr. Exame (teal
   `#20b2aa`, Poppins/Inter, cards radius 16, dark/light).
2. **Exclusiva de quem conecta**: sem Health Connect conectado/sem dado sincronizado
   → página não é porta de entrada (só alcançável pelo ActivityCard conectado);
   URL direta mostra CTA de conexão. "Se não conecta, não tem."
3. **DashboardV2 não ganha card novo** (respeita commit 65e41fde — redução de ruído):
   a porta é um botão discreto no ActivityCard existente.
4. Sono no **CORE_PERMISSIONS** (padrão da casa: TotalCalories igual — quem já
   conectou re-conecta com 1 tap, popup do HC pede só o delta).
5. **Backfill 90 dias no 1º uso pós-conexão** (chunks de 30d ≤31 = cap do server) —
   gráfico nasce cheio (padrão Life Dashboard).
6. Roadmap não executado neste lote: permissões granulares por tipo, background sync
   (WorkManager), write-back de PA/peso no HC, tela sono com estágios.

## 5. Implementação (lote 2026-10-16)

- `HealthBridge.kt`: `SleepSessionRecord` (CORE) + `aggregates(requestId, daysBack,
  offsetDays)` + `sleepMin` no payload diário (minutos "dormidos" = sessões por data
  de acordar, dedup max-por-origem, estágios AWAKE/OUT_OF_BED excluídos).
- `healthConnect.ts`: `fetchActivityDays(days, offsetDays)`, `backfillActivityDays()`
  (3×30d), `syncActivityToServer` com batching ≤30/dia + `sleepMin`.
- `activityStats.ts`: `sleepMin` no contrato + `fmtSleep` + médias.
- `ActivityCard.tsx`: tile Sono, backfill 1× (flag localStorage `dx-hc-backfill-v1`),
  botão "detalhes" → `/sinais`, copy do dialog menciona sono.
- `pages/Sinais.tsx`: herói (anel de passos + sono + FC repouso) + grid de tiles +
  tendências 7/30d com barras interativas + contexto OMS.
- Server: `SLEEP_MINUTES` em `activity-sync`/`activity-summary`/contexto do chat.
- Medições: tipo "Sono" sincronizado.

## 6. Vale a pena? (veredito)

**Sim, com as condições acima.** Motivos: (a) taxa de ativação ~20% com cliff no dia
0 — experiência rica exclusiva do conectado é alavanca de retenção/conversão premium;
(b) custo marginal baixo: todo o encanamento (activity-summary, summarize, ActivityCard)
já existia — falta 1 página + 1 tipo de dado; (c) fundação do hub premium
(90d+/benchmarks/correlação com exames). Risco controlado: página isolada por porta,
não azulejo; sem promessa de diagnóstico (guard ANVISA/LGPD).
