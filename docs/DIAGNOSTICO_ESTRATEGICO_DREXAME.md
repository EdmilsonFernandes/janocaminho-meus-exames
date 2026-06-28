# Dr. Exame — Diagnóstico Estratégico, Arquitetura de Dados e Roadmap

> Análise feita com **Graphify + Serena + PostgreSQL (read-only) + Prisma + Context7 + Playwright + GSD**.
> **Nenhuma linha de código, migration ou dado foi alterada.** Só leitura + diagnóstico + proposta.
> Data: 2026-06-27. Autor: arquiteto (Claude). Status: **aguardando sua aprovação do escopo MVP**.

---

## T.L;DR. — A tese em 5 linhas

1. O app está **muito mais pronto** do que o briefing sugere. Os gaps reais **não são de features faltando** — são de **UX, confiança e uma camada de dados que ainda não existe**.
2. **Falta uma "camada de estado de saúde por marcador"** (atual + tendência + staleness) entre `ExamItem` e a IA/UI. Hoje a IA é instruída por *prompt* a "priorizar o mais recente" — frágil no GLM/relay. Tem que virar **dado estrutural**.
3. **O médico e o paciente estão desconectados**: o app do paciente tem sistema de prioridade de alertas (M5), mas o **médico só vê um boolean `hasAlerts`**. O portal médico é cego e só-read.
4. Há **bugs de confiança visíveis na tela** (unidades duplicadas, nomes corrompidos na extração, prioridade de alerta não ligada na UI). Estes vêm **antes** de qualquer feature nova.
5. **Não adicionar superfícies novas.** Sim: (a) arrumar a confiança, (b) criar a camada de estado, (c) ligar o que já existe (prioridade → UI + portal médico), (d) tornar o portal médico um **workspace de pré-consulta**. Isso transforma um "arquivo de saúde" em **"estado de saúde vivo"** — que é o motor de retenção e valor.

---

## 1. Diagnóstico estratégico do produto atual

### Pontos fortes (sólido, manter)
- **Modelo de dados no nível marcador**: `ExamItem` com `nameCanonical` + mapa de sinônimos (`HEMOGLOBINA↔HGB`, `utils/normalize.ts`) — a chave que permite cruzar o mesmo analito entre labs/datas. **Isso é raro e muito bom.**
- **Extração estruturada com citação de página** (`extraction-schema.md`, `extractedPage`) — confiável e auditável. Pipeline pdftotext → GLM (sem visão, sem alucinação de PDF).
- **Postura de segurança robusta**: `HEALTH_SYSTEM` (system.ts) proíbe diagnóstico + `diagnosticGuard` (pós-filtro regex) + defesa em profundidade. LGPD/ANVISA-aware.
- **Compartilhamento granular** (`DoctorShare.scopes[]`: exams/evolution/alerts/summary) + **`DoctorNote` já existe**.
- **Lógica de alerta madura e responsável**: `priorityOf` (magnitude relativa à largura da faixa — não alarmista), `isStaleExam` (>12 meses), **cross-alert familiar** (≥2 dependentes com mesmo analito alterado, `patient.routes.ts:132`).
- **Memória de agente em .md** (`agent-memory.ts`) — continuidade + economia de token.
- **Relatório IA rico** (comparativo, perguntas pro médico, metas, interações medicamentosas, nutrição).
- **Amplitude de carteira de saúde**: gamificação, lembretes, medições, vacinas, despesas, cartão de emergência, família.

### Gaps reais (não é invenção — é consertar/conectar o que existe)
- **Sem "estado atual"**: tudo é linha de `ExamItem`; não há "último valor de cada marcador" materializado. Priorização temporal = só prompt.
- **Desconexão paciente×médico**: médico não vê prioridade nem alertas estruturados.
- **Regressões de extração/renderização** (Playwright): unidades lixo, nomes quebrados — **destrói confiança**.
- **Prioridade de alerta construída mas não ligada** na UI (`alertPriority.ts` existe; `/alterados` mostra 🚨 genérico).
- **Portal médico só-read e cego**: sem fila de prioridade, sem "o que mudou", sem perguntas do paciente, sem marcar visto.
- **Categorização e alertas só no front** (`medicalData.ts`, `alertPriority.ts`) — server (mobile, push, IA, médico) não reutiliza.

### Veredito
O produto tem **amplitude** (carteira, família, gamificação, despesas), mas o **loop central** (upload → extrair → estado atual → tendência → insight IA → compartilhar → médico age) tem um elo fraco: **não há um "estado de saúde atual" nítido, e o lado médico é sub-aproveitado.** A alavanca de retenção/valor não é "mais features" — é **fechar esse loop com um estado vivo que paciente e médico acessem e ajam em cima.**

---

## 2. Mapa dos fluxos (Graphify)

Grafo confirma: **24 telas paciente** + portal médico monolítico (`DoctorPortal.tsx`, 1005 linhas) + área admin. Comunidades: extração (153), área médica (63), dashboard (151/7), auth/billing (72/25).

Fluxos principais mapeados:
- **Extração**: `exam.routes.ts` upload → `pipeline.ts runExtractionOnce` → `claude.ts` (GLM) → `flattenLabItems`/`pickReference`/`computeFlag` → `ExamItem`.
- **Categorização**: `medicalData.ts` (CATS, categorize, categorizeExam) — **front-end only**.
- **Alertas**: `alertPriority.ts` (priorityOf, isStaleExam) — **front-end only**.
- **Resumo IA**: `health-summary.ts` (generateHealthSummary / generateConsolidatedSummary) → `prompt-health.md`/`system.ts`.
- **Compartilhamento**: `doctor-share.routes.ts` (upsert DoctorShare) ↔ `doctor.routes.ts` (portal).

**Pontos onde novas features entram sem quebrar**: tudo que é "estado de saúde" é uma **camada de leitura/computação** sobre `ExamItem` — não altera o schema de escrita. Entradas seguras: novo módulo `analysis/health-state.ts` (server) + `components/health/*` (web). O portal médico já é SPA isolado (`/doctor`), evolui sem risco ao app paciente.

---

## 3. Mapa técnico (Serena) — onde estão as coisas

| Fluxo | Arquivo:linha | Nota |
|---|---|---|
| Upload | `server/src/routes/exam.routes.ts:74` | tx atômica + débito crédito + sha256 idempotente; `runExtraction` **fire-and-forget** (falha silenciosa) |
| Extração | `server/src/extraction/pipeline.ts:55` | pdftotext/OCR → classifyDoc → GLM |
| Flatten/flag | `pipeline.ts:169` + `utils/normalize.ts:66` (`computeFlag`) | **faixa hardcoded**, vem do PDF; `appliesTo` só Homens/Mulheres |
| Categorização | `web/src/utils/medicalData.ts:24,46,57` | **front-end only** |
| Referências | `utils/normalize.ts:66` | sem tabela editável por sexo/idade/lab |
| Alertas | `web/src/utils/alertPriority.ts:37,70` | **front-end only**; magnitude + stale |
| Evolução | `routes/item.routes.ts:98` (`/evolution`), `:36` (`/timeseries`) | regressão linear (slope) + **previsão de sair da faixa** |
| Resumo IA | `analysis/health-summary.ts:123` (por exame), `:9` (consolidado) | consolidado: `take:3` + só `isAbnormal:true` + `take:10` |
| IA contexto/prompt | `analysis/system.ts:5` (`HEALTH_SYSTEM`), `prompt-health.md` | priorização temporal **só no prompt** |
| Share | `routes/doctor-share.routes.ts:26` | upsert DoctorShare, cobra créditos na criação |
| CRM/doctor | `routes/doctor.routes.ts:115` (register), `:31` (`normalizeCrmKey`), `utils/cfm.ts:31` | cruzamento por `Doctor.crm @unique` = `numero-UF` |
| Portal médico (web) | `web/src/pages/DoctorPortal.tsx` | monolítico 1005 linhas; re-implementa card de exame (duplicação) |

**Separação histórico×atual?** Parcial: o consolidado prioriza os 3 mais recentes; o por-exame usa só o exame + 1 anterior imediato. **Não existe "snapshot atual" nem "tendência por marcador" como conceitos estruturados.**

---

## 4. Mapa do banco (PostgreSQL, read-only)

DB atual (dev/test, porta 5433) **quase vazio**: 3 users, 3 patients, **2 exams, 23 exam_items, 5 ai_analyses, 0 doctors, 0 shares, 0 doctor_notes**. → confirma estrutura, não permite inferir uso real (uso real está no EC2/prod).

Tabelas (20): `users, patients, exams, exam_items, ai_analyses, doctors, doctor_shares, doctor_notes, reminders, measurements, vaccines, expenses, subscriptions, notifications, device_tokens, credit_transactions, app_settings, achievement_grants, device_claims, mfa_challenges`.

**Confirmações estruturais**:
- **`alerts` NÃO é tabela** — calculado em runtime (`isAbnormal`/`flag` em `ExamItem`).
- **Não existe** snapshot/estado-atual, marker_trends, patient_questions, health_alerts persistido.
- **Existe** marker-level (`exam_items`), share granular (`doctor_shares`), notes (`doctor_notes`).

### Lacunas do modelo
1. Sem "estado atual por marcador" (latest value + trend + staleness).
2. Sem perguntas paciente→médico (engajamento bidirecional ausente).
3. Alertas não persistidos (sem histórico/acknowledged/visto-pelo-médico).
4. `DoctorShare` sem `expiresAt`.
5. Faixas de referência não versionadas (hardcoded; se a IA ler errado, o flag erra silencioso).

---

## 5. Análise Prisma — mapeamento das entidades que você propôs

| Entidade proposta | Já existe? | Veredito |
|---|---|---|
| `exam_documents` | ✅ = `Exam` | manter (arquivo em disco + sha256) |
| `exam_results` / `exam_markers` | ✅ = `ExamItem` | manter (nameCanonical/valueNumeric/ref/flag/page) |
| `exam_categories` | ❌ front-only | **mover p/ `shared`/server** (não precisa de tabela — mapa estático) |
| `patient_health_snapshot` / `current_health_summary` | ❌ | **CRIAR (computado, cacheável)** — peça-chave do MVP |
| `patient_health_timeline` | ⚠️ implícito | não precisa de tabela; é query de `ExamItem` ordenada |
| `ai_reports` | ✅ = `AiAnalysis` | manter |
| `ai_report_sections` | ⚠️ | usar `AiAnalysis.structured` (Json?) — sem tabela nova |
| `doctor_patient_shares` | ✅ = `DoctorShare` | manter (+ adicionar `expiresAt` em V1) |
| `doctor_notes` | ✅ = `DoctorNote` | manter |
| `patient_questions` | ❌ | **CRIAR** — alto valor (loop paciente↔médico) |
| `health_alerts` | ❌ (computado) | **persistir em V1** (histórico/ack/visto); MVP mantém computado |
| `marker_trends` | ❌ | **CRIAR** — a **peça central** (estado+tendência+staleness por marcador) |
| `current_health_summary` | ❌ | **CRIAR** — roll-up do snapshot (dashboard + visão médico + contexto IA) |

**Líquido**: a maioria já existe. **Novas estruturas justificadas**: `MarkerState` (ou função), `CurrentHealthSummary` (função/cache), `PatientQuestion` (V1), `HealthAlert` persistido (V1), `expiresAt` em share (V1). **Nenhuma aplicada — aguardando aprovação.**

---

## 6. Auditoria visual (Playwright) — evidências

Screenshots em `audit-01..13-*.png` na raiz. Portal médico **não-auditável** (sem dados). Top problemas:

| # | Problema | Tela | Sev |
|---|---|---|---|
| 1 | **Unidades duplicadas/lixo**: "5,78 milhões/mm*milhões/mm*", "46,7 %%", "26,0 pgpg" | `/alterados`, detalhe | **ALTA** |
| 2 | **Nome lab/paciente corrompido** na extração ("VOLPI ara Vol! Jnir…") | lista/detalhe | **ALTA** |
| 3 | **Prioridade de alerta NÃO ligada** — só 🚨 genérico (`alertPriority.ts` existe, não plugado) | `/alterados` | **ALTA** |
| 4 | "Agendar com Hematologista" repetido em cada item (10×) | `/alterados` | MÉD |
| 5 | Mensagem alarmista "Atenção: vários valores fora da faixa" + score 50/100 sem contexto | dashboard | MÉD |
| 6 | Modais de onboarding/conquista sobrepostos no 1º login | dashboard | MÉD |
| 7 | Header com 6 ícones sem label (apertado em 375px) | todas | MÉD |
| 8 | Resumo IA = parede de texto (8 seções) no mobile | `/relatorio` | MÉD |
| 9 | Data "s/d" + agrupamento por ano inútil; categoria "Outro" em hemograma | lista | BAIXA |
| 10 | **Zero CTA p/ atualizar exames antigos** | dashboard | BAIXA |

---

## 7. Problemas principais (consolidados)
1. **Bug de confiança** (#1, #2, #3) — usuário perde fé no dado. **Bloqueante p/ retenção.**
2. **Sem estado de saúde atual** — núcleo conceitual faltando.
3. **IA com peso temporal frágil** (prompt-only; só anormais; truncado).
4. **Portal médico cego/só-read** — médico sem razão pra abrir antes da consulta.
5. **Lógica duplicada/só-front** (categoria, alerta) — não escala p/ mobile/push/IA/médico.
6. **Extração fire-and-forget** — falha silenciosa.
7. **Riscos LGPD** (CRM chave única, share sem expiração, auditoria parcial, JWT na query do PDF).

## 8. Oportunidades reais
1. **Estado de saúde vivo** (camada MarkerState + CurrentHealthSummary) — habilita TUDO (dashboard, médico, IA).
2. **Conectar prioridade de alerta** na UI + portal médico — **já construído, só ligar**.
3. **Portal médico como pré-consulta** — fila de prioridade + "o que mudou" + perguntas.
4. **Perguntas paciente→médico** — loop de engajamento dos dois lados.
5. **Relatório IA progressivo** + versão médico — reuso do que já existe.
6. **Movimentação de categoria/alerta p/ server** — desbloqueia mobile/push/IA.

## 9. Features que valem AGORA (MVP) — ver Roadmap M0–M5.
## 10. Features pra DEPOIS (V1) — ver Roadmap.
## 11. Features que parecem boas, mas NÃO valem agora
- ❌ **Chat em tempo real médico×paciente** — custo alto, uso esporádico. Defer p/ Futuro.
- ❌ **Acompanhamento por objetivo/meta de lifestyle** — é outro produto. Defer.
- ❌ **Sincronização Apple Health/Google Fit** — escopo enorme, valerá só com massa de uso.
- ❌ **IA médica diagnóstica/segunda-opinião clínica** — fronteira regulatória (ANVISA). Fora.
- ❌ **Módulo B2B clínica/lab completo** — antes, provar o B2C. Light-version só em V2.
- ⚠️ **Carteira de cripto/pagamento in-app extra** — distrai do core. Evitar.

---

## 12. Nova arquitetura conceitual dos dados de saúde

**3 camadas lógicas sobre o mesmo `ExamItem` físico:**

```
Layer 2 — CURRENT HEALTH SUMMARY  (roll-up, computado/cacheável)
   ↑ consome: dashboard, "visão 1-min do médico", CONTEXTO DA IA
   |
Layer 1 — MARKER STATE  (por paciente + nameCanonical)  ← A PEÇA QUE FALTA
   { latestValue, priorValue, deltaPct, trend, stale, ageMonths, priority, confidence }
   ↑ consome
   |
Layer 0 — RAW FACTS  (existe, imutável)
   Exam (documento) ──< ExamItem (marcador num ponto no tempo)  =  HISTÓRICO COMPLETO
```

- **Layer 0** = histórico completo (imutável). Já existe.
- **Layer 1** = **estado atual + tendência** por marcador. **NOVO.** MVP = função `buildMarkerState(patientId)` (leitura, **sem migration**). V1 = tabela materializada `MarkerState` (refresh no pós-extração) p/ indexar/fila de alerta.
- **Layer 2** = **snapshot do paciente** (score, #alterações por prioridade, categorias em atenção, "o que mudou"). **NOVO.** Função `buildCurrentHealthSummary(patientId)` (cache curto).

**Princípio:** estado é **por marcador, não por exame**. Um hemograma 2026 é "atual" p/ hemoglobina; mas um TSH medido só em 2023 é "desatualizado" mesmo que o paciente tenha exame 2026. A abordagem "take 3 exams" atual perde isso.

### Resolução de exames antigos (2013, 2018, 2023, 2026)
- **Todos retidos** (histórico).
- **Estado atual** = valor do `ExamItem` mais recente **por marcador**, com `ageMonths`.
- **Atual** se ≤12 meses; **Desatualizado** se >12 (badge + nudge p/ refazer).
- Se a **única** medição de um marcador é de 2013 → mostrar "última medição 2013 (desatualizada)", **não** como estado atual.
- **Tendência** = slope dos últimos N pontos (já existe em `/evolution`): Melhorando/Piorando/Estável/Primeiro exame.
- **Contexto histórico** = antigos alterados que normalizaram (mostrar como "melhorou/resolvido") ou antigos normais que pioraram (mostrar delta).

---

## 13. Estratégia: estado atual × histórico × tendência

| Conceito | Regra | Fonte |
|---|---|---|
| **Estado atual** | último valor por marcador (≤12m = atual; >12m = desatualizado) | Layer 1 |
| **Histórico completo** | todos os `ExamItem` do marcador | Layer 0 |
| **Tendência** | direção (slope) dos últimos N pontos + forecast p/ sair da faixa | Layer 1 + `/evolution` |
| **Atenção recente** | anormais no exame mais recente, ranqueados por prioridade | Layer 1/2 |
| **Contexto histórico** | antigos vs atuais (melhoras/pioras), só se relevante | Layer 0×1 |

**Regra de ouro**: o "estado atual" **nunca** é determinado pelo exame mais recente globalmente — é **por marcador**. Isso resolve exames de 2013/2018/2023/2026 convivendo sem confusão.

---

## 14. Estratégia de contexto para IA

**Hoje** (frágil): prompt instrui "priorize o mais recente"; só `isAbnormal:true`; `take:3`/`take:10`; o modelo deriva o delta ("caiu de 110 pra 98").

**Proposta** (peso temporal **estrutural**, robusto no GLM/relay): montar **server-side** um objeto de contexto **rotulado** e passá-lo junto aos dados:

```jsonc
PATIENT_CONTEXT = {
  "perfil": "<clinicalProfile>",
  "estadoAtual":      [ {marker, value, unit, ref, flag, priority, measuredAt, ageMonths, stale} ],  // último por marcador
  "alteracoesRecentes":[ ...anormais no último, por prioridade ],
  "tendencias":       [ {marker, direction, deltaPct, points, forecast, confidence} ],
  "melhoras":         [ marcadores que melhoraram/resolvidos ],
  "contextoHistorico":[ antigos alterados agora normais, com ano ],
  "perguntasRecorrentes":[ ...de patient_questions, se houver ]
}
```

Prompt vira: **"ESTADO ATUAL (verdade presente): …; TENDÊNCIAS (use p/ direção, não repita): …; CONTEXTO HISTÓRICO (mencione só se relevante): …"**. A priorização **vem dos dados rotulados**, não de instrução. O modelo não precisa inferir recência.

**Regras adicionais**:
- **delta% computado server-side** (não deixar o modelo derivar → evita alucinação de número).
- **`confidence: low`** quando <2 pontos recentes ou marcador desatualizado → prompt: *"não conclua tendência sem ≥2 exames recentes"*.
- **Evitar conclusões fortes sem exame recente** → explícito no prompt.
- Manter `diagnosticGuard` + `HEALTH_SYSTEM` (segurança).

---

## 15. Proposta — Painel do Médico (workspace de pré-consulta)

Hoje: lista + `hasAlerts` bool + exams/PDF/evolution/summaries + notes (só-read, cego).

**Propor** (consume a MESMA Layer 1/2 + prioridade do app paciente — acaba a desconexão):
1. **Fila de prioridade**: pacientes ordenados por prioridade máx. de alerta → "quem precisa de atenção hoje". (server: mover `priorityOf` p/ server.)
2. **Visão de 1 minuto**: snapshot (Layer 2) — score, #alterações por prioridade, top-3 marcadores a investigar, últimos exames por categoria.
3. **"O que mudou desde o último exame"**: delta% + trend por marcador. **A feature mais útil.**
4. **Alertas estruturados** (não boolean): mesma `priorityOf`, com scope.
5. **Perguntas do paciente** (`PatientQuestion`): paciente prepara; médico marca "respondi na consulta".
6. **Anotações** (existe) + **marcar visto/ack** em alerta/exame (novo).
7. **PDF original** (existe, 1 clique) — **trocar JWT da query p/ header** (LGPD).
8. **Comparativo atual × anterior** lado-a-lado.
9. **Alerta de dado antigo**: "TSH não medido desde 2023".

**Descartar/adiar**: chat em tempo real (Futuro), médico criar exame (fora), IA diagnóstica (fora).

---

## 16. Proposta — Área do Paciente (motivo pra voltar)

**Geradores de uso recorrente** (priorizados):
1. **"Meu estado atual"** (Layer 2) no topo do dashboard — a resposta a "como estou?". Substitui a msg alarmista.
2. **"O que mudou no último exame"** (delta%) — o gancho p/ abrir o app após novo exame.
3. **"O que perguntar ao médico"** — checklist compartilhável + integra `PatientQuestion`.
4. **Lembrete de exame desatualizado** ("hemograma há 14 meses — refazer?") — scheduler existe (`healthNudges`); ligar staleness por marcador.
5. **Carteira + linha do tempo** (Timeline, EmergencyCard) — já existe, é o "por que guardo tudo aqui".
6. **Cards de tendência por categoria** (sparkline recharts com banda de referência — Context7 confirmou `ComposedChart`+`Area`+`Line`).
7. **Upload fácil pelo celular** (FAB/câmera) — manter sem atrito.
8. **Explicação simples do marcador** (ExplainItem) — manter.

**Fórmula de retenção**: cada novo exame → **instantaneamente** "o que mudou" + estado atual atualizado + insight IA fresco + perguntas pro médico. Esse é o hook.

**Descartar/adiar**: goal-tracking lifestyle (outro produto), mais gamificação (já basta).

---

## 17. Proposta — Relatórios IA (progressivo + 2 audiências)

Hoje: 8 seções, parede de texto no mobile.

**Versão PACIENTE** (progressivo/accordion):
Resumo executivo (3 bullets) → "Meu estado atual" (snapshot) → "O que mudou" → Pontos de atenção (por prioridade) → Melhorou ✅ → Perguntas pro médico → Metas → *(colapsável)* Nutrição / Interações medicamentosas / Comparativo detalhado / Histórico → Disclaimer.

**Versão MÉDICO** (objetiva, tom clínico):
Estado atual objetivo → Alterações por prioridade → Tendência por categoria → **"Pontos para investigar na consulta"** → Perguntas do paciente → link PDF. Sem "parabéns/coisas boas" (tom clínico).

**Impl**: armazenar seções estruturadas em `AiAnalysis.structured` (Json?); parametrizar `audience: 'patient'|'doctor'`; renderer accordion no mobile.

---

## 18. Proposta — Alertas

**Classificação** (manter + estender):
- Fora da referência (HIGH/LOW/ABNORMAL) — existe.
- **Piora vs anterior** — derivar (trend). **add.**
- **Melhora** — add (reforço positivo).
- **Mudança bruta** (delta > threshold) — add.
- **Exame antigo / marcador sem atualização** — `isStaleExam` existe; expor **por marcador**.
- **Prioridade leve/moderada/importante** — existe (magnitude). **MANTER e LIGAR na UI** (#3).

**Tom (inviolável, já no system prompt)**: nunca "grave/perigoso"; sempre "acima/abaixo da referência"; sempre "converse com seu médico". A msg alarmista do dashboard (#5) viola — corrigir.

**Persistência**: MVP = computado; V1 = `HealthAlert` persistido (histórico/ack/visto-pelo-médico + não re-alertar).

---

## 19 + 20. Plano GSD + Roadmap

### MVP — "consertar + ligar o que existe" (sem reinventar)
| Milestone | Entrega | Migration? |
|---|---|---|
| **M0 — Confiança** | Fix #1 unidades, #2 nomes, #3 ligar prioridade na UI, #4 botão agendar, #5 msg alarmista | ❌ não |
| **M1 — Camada de estado (peça-chave)** | `buildMarkerState` + `buildCurrentHealthSummary` (server, leitura) | ❌ não (função) |
| **M2 — Contexto IA estrutural** | reescrever contexto p/ Layer 1/2 rotulado + delta% server-side | ❌ não |
| **M3 — Estado atual do paciente** | "Meu estado atual" + "o que mudou" no dashboard + nudge de staleness por marcador | ❌ não |
| **M4 — Portal médico útil** | fila prioridade + visão 1-min + "o que mudou" + alertas estruturados (consome Layer 1/2) | ❌ não |
| **M5 — Relatório progressivo + versão médico** | accordion + audience | ❌ não |

> M0–M5 = **zero migration**. Tudo é camada de leitura/computação + UI. Pode ir a produção incrementalmente.

### V1 — próximas versões (com schema, mediante aprovação)
- `PatientQuestion` (loop paciente↔médico) — **maior alavanca de engajamento**.
- `HealthAlert` persistido (ack/visto/não-re-alertar).
- `DoctorShare.expiresAt` + auditoria completa (LGPD) + JWT no header do PDF.
- Mover categorização/alerta p/ `shared`/server (reuso mobile/push/IA).
- `MarkerState` materializado (escala) + marcar visto no portal.
- Faixas de referência versionadas (base de conhecimento — item do `roadmap-backlog.md`).

### V2 — futuro próximo (validar uso antes)
- Comparativo lado-a-lado; knowledge base clínica; "pontos p/ investigar" auto; cross-analysis familiar expandida; B2B light (dashboard clínica).

### Futuro estratégico (só com uso real comprovado)
- Chat tempo real médico×paciente; parcerias lab/clínica + B2B; sync Apple Health/Google Fit; módulo de metas lifestyle.

---

## 21. Riscos técnicos
- **Relay Z.ai/GLM**: sem structured output/thinking → **não** depender do modelo p/ raciocinar recência (daí a camada estrutural). Sem visão de PDF (já mitigado: pdftotext).
- **ExamItem monolítico** → difícil versionar faixas.
- **Categoria/alerta só no front** → mobile/push/IA não reutilizam (mover p/ server).
- **`runExtraction` fire-and-forget** → falha silenciosa (patient vê FAILED só no reload).
- **Performance** da Layer 1 on-read: OK na escala atual (poucos exames/paciente); cache/materializar em V1.

## 22. Riscos de UX
- **Bugs de confiança** (#1/#2/#3) — prioridade máxima, **antes** de qualquer feature.
- Densidade info (dashboard 10 cards; relatório IA parede de texto).
- Header clutter mobile (6 ícones sem label).
- Portal médico cego à prioridade.

## 23. Riscos de privacidade / LGPD
- **CRM como única chave de cruzamento** (ambiguidade por UF; `normalizeCrmKey` sem UF não casa).
- **pending-invite sem verificação de identidade** → squatting de CRM / DoS (paciente cria `Doctor` órfão com CRM alheio + e-mail fake).
- **Share sem expiração** (ativo p/ sempre até revogar manual).
- **Auditoria parcial** (PDF baixado, notes, login, share criado/revogado — **sem log**).
- **JWT na query string do PDF** → vaza em logs proxy/history/referrer.
- ✅ PII já criptografada (CPF AES-256-GCM). `clinicalProfile` é texto livre (não-PII estrito), aceitável.

---

## 24. Próximos passos recomendados

1. **Aprovar o escopo MVP (M0–M5)** — especialmente M1 (camada de estado) como pedra angular.
2. **Começar por M0** (trust-fixes) — **hoje**, sem migration, retorno imediato de confiança.
3. **Desenhar M1 em GSD** (milestone → slices → tasks) antes de codar: `buildMarkerState` / `buildCurrentHealthSummary` / onde cached.
4. **M2–M5 fluem de M1** (todos consomem a camada).
5. **V1 com schema** (PatientQuestion, HealthAlert, expiresAt, auditoria) — **mediante sua aprovação**, com migrations via `prisma migrate` (nunca `db push` em prod).

**Sugestão de ordem de execução**: M0 (paralelo, Trust) → M1 (keystone) → M3 (paciente vê valor) → M4 (médico vê valor) → M2 (IA estrutural) → M5 (relatório). Posso quebrar M1 em slices no GSD assim que você der o sinal verde.

---

## Status de execução (2026-06-28)

| Milestone | Status | Verificação |
|---|---|---|
| **M0 — Confiança** | ✅ commitado (`6582f90`) | units dedup (`unitSuffix`, provado), 1 botão Agendar/exame, msg não-alarmista, prioridade já ligada |
| **M1 — Camada de estado (keystone)** | ✅ commitado (`6582f90`) | `health-state.ts` + rota `GET /patients/:id/health-summary`; 24 testes; rota 200 + ownership 403 em dado real |
| **M3 — "Meu estado atual" (paciente)** | ✅ commitado (`6582f90`) | `CurrentStateCard` no dashboard; screenshot `m3-current-state-card-mobile.png` |
| **M2 — IA estrutural** | ✅ feito (working tree) | `generateConsolidatedSummary` usa snapshot → contexto rotulado (ESTADO ATUAL/TENDÊNCIAS/MELHORAS/PIORAS/CONTEXTO HISTÓRICO) + regras de peso temporal; 7 testes + 24 health-state; server+web tsc ✅ |

**Tese central realizada**: a IA deixou de ser instruída por prompt ("priorize o mais recente") e passou a receber um **contexto rotulado por recência** (peso temporal estrutural). `delta%` é computado server-side (não fica a cargo do LLM).

**Pendências / próximas**:
- **M2 sem commit em main**: outro dev ativo no mesmo repo — trabalho está no working tree, pronto p/ commit quando ele parar (evita sweep/conflict). Não deployado (sem verificação prod + dev ativo).
- **Verificação final do M2**: gerar 1 relatório real em `/relatorio` (custa token GLM) p/ checar a qualidade da saída — estrutura do contexto provada via teste.
- **shared-buildable (V1)**: unificar runtime code (priority/categorize/trend) server+web exige tornar `@meus-exames/shared` buildável (tsc→dist). Tentado; cold rebuild killed 2x em ambiente ativo. Deferido p/ janela de build estável. Hoje: trend canônico no shared (consumido pelo web/vite); server espelha local (drift documentado).
- **M4 (portal médico)**: bloqueado — dev DB sem doctors/shares p/ validar + `DoctorPortal.tsx` monolito 1005 linhas (UX médica).
- **M5 (relatório progressivo)**: web, futuro.

---

## Questão central do produto — resposta direta

> *Como transformar o Dr. Exame numa plataforma onde paciente sempre atualiza, médico consulta antes da consulta, IA ajuda sem substituir, histórico ajuda mas estado atual fica claro, app simples/confiável/útil, sem complexidade desnecessária?*

- **Paciente sempre atualiza**: cada upload → "o que mudou" + estado atual vivo + insight fresco + perguntas pro médico + nudge de marcador desatualizado. (M1+M3.)
- **Médico consulta antes**: fila de prioridade + visão 1-min + "o que mudou" + perguntas do paciente. (M4 + V1 PatientQuestion.)
- **IA ajuda sem substituir**: contexto estrutural rotulado + `diagnosticGuard` + disclaimer. (M2; segurança já existe.)
- **Histórico ajuda, estado atual claro**: Layer 0 (histórico) × Layer 1 (atual+tendência por marcador) × regra de staleness. (M1.)
- **Simples/confiável/útil**: M0 (confiança) + relatório progressivo + estado atual no topo. (M0+M5+M3.)
- **Sem complexidade**: ~3 funções novas (sem migration no MVP), reaproveitando prioridade/categorização/evolução já construídas. Sem features "bonitas" sem uso.
