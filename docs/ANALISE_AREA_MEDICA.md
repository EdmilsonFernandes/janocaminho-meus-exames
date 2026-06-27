# Análise da Área Médica — Meus Exames

> Gerado em 27/06/2026 via Graphify + Serena + Context7 + Playwright. **Não altera código** — é diagnóstico + plano, sujeito à aprovação do Edmilson.
> Stack fixa: React 19 + react-admin 5 + MUI 7 + **recharts 3** + Vite 8 (web) · Express 5 + Prisma 6 + Postgres (server) · IA GLM-4.6 via `pdftotext → texto` (relay Z.ai).

---

## TL;DR — o que eu achei (surpresa importante)

O app está **muito mais pronto** do que o briefing sugere. A maior parte do "maquinário médico" já existe:

- **Categorias já existem** (13, em `utils/medicalData.ts` → `CATS` + `categorize()`) com emoji + cor + keywords.
- **Evolução já é organizada por categoria** (`pages/Evolution.tsx`), com filtros de status (Fora da faixa / Em mudança / Estável) e busca.
- **Detalhe do exame já agrupa por painel** (Leucograma/Série Vermelha/Plaquetas), destaca valores alterados, gera **resumo de IA** e tem **"Preparar visita ao médico"**.
- **Compartilhamento já é granular** (escopos `exams/evolution/alerts/summary`, revogar/reativar/excluir) e o **Portal do Médico** já está wired (`DoctorPortal.tsx`).
- **Motor de IA comparativo** já existe no server (`analysis/health-summary.ts` → `loadPriorExam`, `generateConsolidatedSummary`).

**Os problemas reais são de superfície/consistência, não de ausência:**

1. A **Lista de Exames** é "plana" (só agrupa por ano) — não usa as categorias que já existem, nem filtros/busca/tags. (Inconsistência: Evolução e Alertas usam categorias; a Lista não.)
2. A categoria exibida por exame sai **errada ("Outro")** porque o `categorize()` casa nomes de *itens*, e na lista ele recebe o *título*.
3. **Alertas sem prioridade**: todos aparecem com o mesmo 🚨, embora o `flag` (enum) já tenha `CRITICAL`. Falta **mudança brusca / tendência de piora / exame antigo / retorno médico** e níveis leve-moderada-importante.
4. Falta um **resumo simples "o que melhorou / o que piorou"** no topo da evolução e **perguntas prontas pra consulta**.
5. Compartilhamento é só por **conta de médico** — não há **QR/link público temporário** para um envio rápido (existe o padrão `shareToken+sharePin` no `AiAnalysis`, reaproveitável).

> Conclusão: o trabalho é de **reaproveitar + conectar + polir**, não de construir do zero. Isso reduz muito o risco.

---

## 1. Resultado do Graphify (grafo da área médica)

Rodei 4 traversais (BFS depth=2) a partir de `upload`, `evolucao/trends/alertas`, `doctor portal/share` e `extracao/IA`. Comunidades detectadas:

| Comunidade | Função | Nós-chave |
|---|---|---|
| 13 | Fluxo de exame/paciente | `exam.routes`, `patient.routes`, `item.routes`, `upload` (middleware), `serializeExam`, `crypto` |
| 31 | Médico/storage/auth | `doctor.routes`, `storage.ts` (saveExamFile/deleteExamFile), `jwt`, `mfa`, `cfm` (lookup CRM) |
| 65 | Créditos + compartilhamento | `doctor-share.routes`, `credits.ts` (chargeCredits, UPLOAD_RULES), `billing.routes`, `chat.routes` |
| 10 | Extração (pdftotext→GLM) | `extraction/pipeline.ts`, `claude.ts`, `schemas.ts`, `pdfutil.ts` |
| 15 | Análise/IA saúde | `analysis/health-summary.ts`, `agent-memory.ts`, `chat-router.ts`, `extractJsonObject` |
| 16 | E-mail/push/nudges | `mailer`, `emailTemplate`, `push`, `healthNudges`, `reminderEmails`, `nudgeMail` |
| 63 | Telas médico/evolução/alertas (web) | `Evolution`, `ValoresAlterados`, `Medicos`, `DoctorPortal`, `medicalData.ts` |
| 120 | Lista/timeline/premium (web) | `ExamList`, `Timeline`, `groupByYear`, `PremiumGate/usePremium` |
| 68 | Detalhe/resumo/IA (web) | `ExamShow`, `ConsolidatedReport`, `ExplainItem`, `examDictionary`, `HealthSummary` |
| 34 | Trends + flags | `Trends`, `Flag.tsx` (COLORS/LABELS) |

**Nós principais (alto impacto):** `ExamList.tsx`, `ExamShow.tsx`, `Evolution.tsx`, `ValoresAlterados.tsx`, `Medicos.tsx`, `DoctorPortal.tsx`, `utils/medicalData.ts`, `components/Flag.tsx`, `analysis/health-summary.ts`, `extraction/pipeline.ts`, `routes/exam.routes.ts`, `routes/item.routes.ts`, `routes/doctor-share.routes.ts`.

**Relações críticas (edges):**
- `Evolution`/`ValoresAlterados`/`ExamShow` → importam `categorize`/`CATS` de `medicalData.ts` (qualquer mudança em CATS propaga pra 3 telas).
- `ExamList` → usa `groupByYear` (NÃO usa `medicalData`).
- `DoctorPortal` → `DrExame`, `PhotoUpload`, recharts.
- `health-summary.ts` → `loadExamContext` + `loadPriorExam` (comparação atual×anterior) → `generateHealthSummary`/`generateConsolidatedSummary`.

**Arquivos críticos (alto risco de alteração):** `utils/medicalData.ts` (compartilhado), `extraction/pipeline.ts` + `schemas.ts` (extração), `analysis/health-summary.ts` (IA), `doctor-share.routes.ts` (compartilhamento/auth), `ExamList.tsx` (react-admin List — contrato de dataProvider/filtros).

**Ponto de entrada mais seguro:** começar pela **Lista de Exames** (M2) — é isolada, não toca em extração/IA/auth, e já tem `categorize()` pronto pra pluguar. Depois **Alertas com prioridade** (M5, runtime, sem schema). Por último **Compartilhamento com link/QR** (M4, toca auth/shareToken).

---

## 2. Mapa da área médica

### Telas do paciente (rotas em `App.tsx`)
| Rota | Tela | Função |
|---|---|---|
| `/` | Dashboard | Score de saúde, dica Dr. Exame, atalhos |
| `/#/exams` | ExamList | Lista de exames (grupo por **ano**) |
| `/#/exams/:id/show` | ExamShow | Itens por **painel**, alterados, resumo IA, preparar visita |
| `/#/alterados` | ValoresAlterados | **Alertas** (fora da faixa), grupo por exame |
| `/#/evolucao` | Evolution | **Evolução por categoria** + status + busca |
| `/#/tendencias` | Trends | Gráfico de marcador (recharts) |
| `/#/linha-do-tempo` | Timeline | Linha do tempo |
| `/#/relatorio` | ConsolidatedReport | Relatório consolidado (1 página) |
| `/#/medicos` | Medicos | **Compartilhamento** com médico (CRM + escopos) |
| `/#/medicoes`, `/vacinas`, `/emergencia`, `/despesas`, `/lembretes` | — | Medições, vacinas, cartão de emergência, etc. |

### Telas do médico
| Rota | Tela | Estado |
|---|---|---|
| `/#/doctor` | DoctorPortal | **Implementado e wired** (login próprio `verifyDoctorToken`). Tem `DoctorDashboard`, `DoctorExamDetail`, `EvolutionCharts`, `NotesTab`, `DoctorProfile`, `SCOPE_META`. O `docs/DOCTOR_PORTAL_PLAN.md` diz "não implementado" — **doc desatualizado**. |

### Componentes compartilhados
`Flag.tsx` (badge normal/alto/baixo/crítico), `ExplainItem` (explicar IA), `HealthSummary`, `PremiumGate`/`usePremium`, `PatientSwitcher`/`useSelectedPatient`, `ExamCreateFab` (FAB upload no `AppLayout`), `MobileBottomNav`, `report/DestaqueCard`, `report/ReportHero`.

### Services / APIs
`exam.routes` (CRUD + extração), `item.routes` (itens, `?abnormal=true`, `/flag-summary`), `analysis.routes` (IA), `doctor.routes` (login/lookup CRM), `doctor-share.routes` (CRUD de share), `chat.routes`, `measurement.routes`, `vaccine.routes`, `billing.routes`.

### Hooks/Contexto
`patient-context.ts` (`useSelectedPatient` — chave pra família/dependentes), `useRefresh` (react-admin — NÃO usar `reload`), `useListContext` (filtros/lista).

### Fluxo de upload
`ExamCreateFab` → `ExamCreate` → `POST /api/exams` (multipart, middleware `upload`) → `saveExamFile` (storage) → status `EXTRACTING` → `extraction/pipeline.ts` (`runExtraction` → `pdfutil` extrai texto → `claude.ts`/GLM via `schemas` → `ExamItem[]` com `flag`/`isAbnormal`/`extractedPage`) → status `EXTRACTED`.

### Fluxo de leitura dos exames
`ExamList` (GET /api/exams) → `ExamShow` (GET /api/exams/:id + items) → itens agrupados por `panel`, com `Flag` (cor por `flag`) e `refLabel` (faixa de referência).

### Fluxo de alertas
**Não há modelo `Alert`.** Derivado em runtime: `ExamItem.isAbnormal`/`flag` → `ValoresAlterados` (GET `/api/items?abnormal=true` + `/flag-summary`) agrupa por exame→categoria.

### Fluxo de compartilhamento
Paciente: `Medicos` → `POST /api/doctor-shares` (CRM+UF+specialty+email+scopes+convenio, cobra créditos) → médico é pré-cadastrado (`lookupCfm`). Médico: `DoctorPortal` (login) → vê só os escopos autorizados.

### Fluxo da IA
`analysis.routes` → `health-summary.ts`: `loadExamContext` + `loadPriorExam` (contexto + exame anterior) → prompt → GLM → `HealthSummarySchema`/`ConsolidatedSummary` → render (`HealthSummary.tsx` / `ConsolidatedReport`).

### Onde os dados médicos são exibidos
Dashboard (score + dica), ExamShow (itens + IA), ValoresAlterados (alertas), Evolution/Trends (gráficos), ConsolidatedReport (relatório), DoctorPortal (visão médica).

---

## 3. Fluxo paciente atual (observado no Playwright)

1. Login → Dashboard (score, dica Dr. Exame, atalhos, bottom-nav: Início/Exames/Dr.Exame/Evolução/Mais).
2. **Exames** (`/exams`): lista agrupada por ano (📅 2026), card por exame (título, lab, "Outro • s/d • 20 itens • Enviado …", status Pronto). FAB "Enviar exame".
3. **Detalhe** (`/exams/:id/show`): título + status; ⚠️ checagem de **titularidade** (nome do doc ≠ perfil); 🚩 "10 valores fora da faixa" (chips clicáveis); itens por **painel** (Leucograma 3 alt/12, Plaquetas 1/1, Série Vermelha 6/7); **"Análise de saúde"** (Gerar resumo, 10 💎); **"📋 Preparar visita ao médico"** (Gerar documento, 1 pág).
4. **Alertas** (`/alterados`): "Valores fora da faixa", acordeão por exame (🚨 HEMOGRAMA • 10 alterados), itens por categoria ao expandir, botão **Agendar** por item, rodapé "Educativo. Sempre confirme com seu médico".
5. **Evolução** (`/evolucao`): grupos por categoria (🩸 Hemograma 🔴15, 🫀 Função Hepática ✅2, 📋 Outros ✅3), filtros Todos/Fora da faixa/Em mudança/Estável, busca.
6. **Compartilhar** (`/medicos`): "Meus Médicos" → "Compartilhar" (dialog: CRM, UF, especialidade, e-mail, escopos, convênio) ou estado vazio.

---

## 4. Fluxo médico atual

- O médico **não tem cadastro próprio até o paciente convidar** (indica pelo CRM → `lookupCfm` pré-cadastra → e-mail de aviso).
- Médico finaliza cadastro com o **mesmo CRM** → login próprio (`verifyDoctorToken`, suporta MFA) → `DoctorPortal`.
- No portal: `DoctorDashboard` (pacientes que compartilharam), `DoctorExamDetail` (exame + valores alterados + PDF original), `EvolutionCharts` (evolução por marcador), `NotesTab` (`DoctorNote` — anotações clínicas), `DoctorProfile`/`DoctorChangePassword`.
- Vê **apenas os escopos autorizados** (`SCOPE_META`: exams/evolution/alerts/summary).
- **Pendências observadas (a confirmar no código):** resumo objetivo "1-toque" do paciente, histórico por categoria, atalho "perguntas pra consulta", QR/quick-share.

---

## 5. Problemas de usabilidade (evidentes no Playwright)

| # | Problema | Onde | Evidência |
|---|---|---|---|
| P1 | Lista de exames sem agrupar por **categoria**, sem filtro/busca/tag | ExamList | só acordeão por ano; `ExamList.tsx` não importa `CATS`/`categorize` |
| P2 | Categoria do exame sai **"Outro"** errada | ExamList | título "HEMOGRAMA" não casa keyword `hemoglo` |
| P3 | Alertas **sem prioridade** (tudo 🚨 igual) | ValoresAlterados | `flag` tem `CRITICAL` mas a UI não diferencia |
| P4 | Sem **resumo "melhorou/piorou"** na evolução | Evolution | só lista por categoria; sem comparativo de rede |
| P5 | Evolução **vazia com 1 exame** sem guiar o usuário | Evolution | "Em mudança (0)" sem call-to-action |
| P6 | Sem **perguntas prontas pra consulta** | — | "Preparar visita" gera doc, mas não lista dúvidas guiadas |
| P7 | Compartilhamento **só por conta de médico** (sem QR/link rápido) | Medicos | nenhum `shareToken`/QR exposto ao paciente |
| P8 | "Sintomas" leves aparecem no mesmo nível de críticos | ValoresAlterados | pode soar alarmante |
| P9 | Descoberta: Evolução/Alertas usam categorias, mas a Lista não → **inconsistência** | cross | UX fragmentado |

> **Não achei** overflow horizontal (desktop/mobile OK), nem botões confusos graves, nem info crítica escondida. O app é responsivo e acessível (VLibras, "Pular pro conteúdo", responsabilidade clínica no rodapé).

---

## 6. Oportunidades de melhoria (priorizadas)

1. **Unificar categorias em toda a área médica** (Lista + Evolução + Alertas + Detalhe) e adicionar **filtro + busca + tags** na Lista. (Alto impacto, baixo risco — `categorize()` já existe.)
2. **Corrigir categoria do exame** derivando do item dominante (não do título). Adicionar keyword `hemograma`/`hemogram` ao grupo hemo.
3. **Alertas com prioridade** (Leve/Moderada/Importante) + novos tipos (mudança brusca, tendência de piora, exame antigo, retorno médico). Runtime, sem schema.
4. **Resumo de evolução** (card "X melhoraram, Y pioraram, Z estáveis") + comparativo atual×anterior em destaque + previsão (Premium).
5. **Perguntas pra consulta** geradas a partir de itens alterados/em tendência.
6. **Compartilhamento rápido com QR/link+PIN** (reaproveitar `shareToken`+`sharePin` do `AiAnalysis`) com validade + revogação.
7. **Portal do médico**: resumo objetivo "1-toque", histórico por categoria, economizar tempo pré-consulta.
8. **Empty-states guiados** ("envie outro exame pra ver evolução", "compartilhe com seu médico pra receber retorno").

---

## 7. Sugestão de organização por categoria

As **13 categorias atuais (`CATS`) são clinicamente corretas** — manter. Comparativo com a lista sugerida:

| Sugerido por você | Hoje (`CATS`) | Recomendação |
|---|---|---|
| Hemograma/sangue | 🩸 Hemograma | ✓ manter |
| Hormônios | ⚗️ Hormônios | ✓ (Tireoide está aqui — pode **separar** se crescer) |
| Tireoide | (dentro de Hormônios) | Opcional: **split** `tsh/t4/t3/tireo*` → "Tireoide" |
| Fígado | 🫀 Função Hepática | ✓ |
| Rins | 🫘 Função Renal | ✓ |
| Coração/colesterol | ❤️ Cardíacos + 🧈 Lipídios | ✓ (já separado — melhor) |
| Diabetes/glicose/insulina | 🍩 Glicemia e Diabetes | ✓ |
| Vitaminas e minerais | 💊 Vitaminas + ⚡ Eletrólitos | ✓ (já separado — melhor) |
| Inflamação | 🛡️ Inflamação e Ferro | ✓ |
| **Urina** | ❌ **não existe** | **ADICIONAR** (EAS/urocultura) |
| **Imagem** | ❌ (só `ExamKind.IMAGING`) | **ADICIONAR** categoria/tie ao `kind` |
| **Laudos médicos** | 📋 Outros | Tratar via `kind=OTHER`/laudo (não é analito) |
| Outros documentos | 📋 Outros | ✓ |

**Ajuste mínimo recomendado:** adicionar `Urina` e `Imagem`; corrigir keyword do hemo (`hemograma`); (opcional) separar `Tireoide`. Tudo em `medicalData.ts` (1 arquivo) — mas **testar Evolution + ValoresAlterados + ExamShow** que consomem `CATS`.

> Obs.: `ExamKind` (LAB_PANEL / IMAGING / OTHER) é **ortogonal** a `CATS` (que é sobre o analito). Imagem/laudo são melhor tratados por `kind`; urina/análitos por `CATS`.

---

## 8. Sugestão de evolução da saúde

**Já existe** (bom): agrupamento por categoria, status `out/change/stable` (`statusOf`), filtros, busca, gráfico recharts por marcador.

**Adicionar:**
- **Card "Resumo da evolução"** no topo: `🟢 3 melhoraram · 🔴 2 pioraram · ✅ 5 estáveis` (computado do `direction` entre exames) + frase "Sua saúde está X" (educativa, não diagnóstica).
- **Comparativo atual × anterior** em destaque por categoria (delta % + seta + cor), reaproveitando `loadPriorExam`.
- **Previsão** (Premium — já prometido no landing): "tendência a sair da faixa em ~X" com disclaimer claro.
- **Empty-state guia** quando <2 exames na categoria: "Envie outro exame de [categoria] pra acompanhar a evolução."
- **Linha do tempo clínica** integrada (já há `Timeline.tsx`): marcar marcos (exame alterado, início de medicação via `Medications`).

---

## 9. Sugestão de alertas

**Prioridade (não alarmar — linguagem responsável):**

| Nível | Cor | Gatilho (runtime) | Tom |
|---|---|---|---|
| 🔴 **Importante** | vermelho | `flag=CRITICAL` ou muito fora da faixa (ex: >2× limite) | "Leve ao médico com prioridade" |
| 🟠 **Moderada** | laranja | `HIGH`/`LOW` fora da faixa, ou **mudança brusca** (delta > X% vs anterior) | "Comente com seu médico" |
| 🟡 **Leve** | amarelo | levemente fora, ou **tendência de piora** (N exames seguidos subindo) | "Acompanhe" |

**Novos tipos de alerta (sem criar diagnóstico):**
- **Exame antigo**: categoria sem exame há >12 meses → "Considere renovar [categoria]".
- **Retorno médico**: item marcado "Agendar"/pendente de follow-up.
- **Mudança brusca** / **tendência de piora** (acima).

**Implementação:** sem modelo `Alert` — computar em runtime no `ValoresAlterados`/novo helper (ex.: `utils/alertPriority.ts`) a partir de `flag`, `valueNumeric`, `refLow/refHigh` e histórico. Ordenar por prioridade; "Leve" discreto.

---

## 10. Sugestão de compartilhamento médico

**Já existe** (bom): convite por CRM, escopos granulares, revogar/reativar/excluir/editar, portal do médico.

**Adicionar:**
- **Quick-share por QR + link + PIN** (snapshot de 1 relatório, com **validade** e **revogação instantânea**): estender o padrão `AiAnalysis.shareToken` + `sharePin`. Útil pra "mostrar rápido na recepção/WhatsApp" sem obrigar o médico a criar conta.
- **"Perguntas pra consulta"** auto-geradas (itens alterados/em tendência → 3–5 perguntas em linguagem leiga) no "Preparar visita".
- **Resumo médico compartilhável** (1 tela): perfil clínico + top alterados + evolução resumida + PDF original.
- No **Portal do Médico**: resumo objetivo "1-toque", histórico por categoria/tempo, destacar mudanças desde a última visita (economiza tempo da consulta).

---

## 11. Plano GSD (milestones → slices → tarefas)

> Organizado no formato GSD (milestone → slice → task). **Sem código ainda** — após aprovação, posso bootstrapar no `gsd` CLI pra tracking de execução. Ordem por risco crescente: telas isoladas primeiro, auth/schema por último.

### M1 — Diagnóstico (✅ concluído nesta análise)
- S1 Mapa + fluxos + problemas → **este documento**.

### M2 — Organização dos exames (baixo risco, alto impacto)
- S1 Categorias na Lista
  - T1.1 Corrigir `categorize` em nível de exame (item dominante) + keyword `hemograma` em `medicalData.ts`.
  - T1.2 `ExamList`: trocar/plugar agrupamento por categoria (além do ano) via `ListBase`+`WithListContext`+`categorize` (padrão react-admin 5 confirmado no Context7).
  - T1.3 Adicionar **Filtro** por categoria (`useListContext().setFilters` / `ListFilter`) + **busca** + **tags/chips** de categoria.
  - T1.4 Responsivo (`useMediaQuery`: cards mobile / colunas desktop).
- S2 Detalhe mais claro
  - T2.1 Badge de categoria no header do `ExamShow`; resumo "N alterados / N estáveis".
  - T2.2 (opcional) Agrupar por categoria além do `panel`.

### M3 — Evolução da saúde (médio risco — toca `medicalData` + IA)
- S1 Resumo de evolução
  - T3.1 Helper `utils/evolutionSummary.ts` (melhorou/piorou/estável a partir de `direction`).
  - T3.2 Card "Resumo da evolução" no topo de `Evolution`.
- S2 Comparativo atual×anterior
  - T3.3 Reaproveitar `loadPriorExam`; card de delta por categoria.
- S3 Tendências/previsão
  - T3.4 Previsão (Premium) com disclaimer; T3.5 empty-state guiado.

### M4 — Médico × Paciente (maior risco — auth/shareToken)
- S1 Quick-share
  - T4.1 Endpoint/rota de **link temporário + PIN + QR** (estender `shareToken`/`sharePin`), com validade + revogação.
  - T4.2 UI de QR/link em `Medicos` e no "Preparar visita".
- S2 Perguntas pra consulta
  - T4.3 Gerador de perguntas (itens alterados/tendência) → prompt GLM (texto, não visão).
- S3 Portal do médico
  - T4.4 Resumo objetivo "1-toque" + histórico por categoria + "mudanças desde a última visita".

### M5 — Alertas inteligentes (médio risco — runtime)
- S1 Prioridade
  - T5.1 `utils/alertPriority.ts` (flag+delta+ref → Leve/Moderada/Importante).
  - T5.2 UI em `ValoresAlterados` (cor/ícone/ordenação) sem alarmar.
- S2 Novos tipos
  - T5.3 Mudança brusca + tendência de piora + exame antigo + retorno médico.

### M6 — UX/UI premium (polimento)
- S1 Hierarquia/consistência
  - T6.1 Unificar tokens de categoria (emoji/cor) em todas as telas; T6.2 empty-states guiados; T6.3 a11y (contraste, foco, VLibras já OK).

### M7 — Testes (gate de deploy — vitest roda antes do build)
- S1 Unit/E2E
  - T7.1 `medicalData.test.ts` (categorias novas + hemograma); T7.2 `alertPriority.test.ts`; T7.3 E2E share/QR; T7.4 **Playwright**: fluxos de upload/lista/evolução/alertas/compartilhamento (mobile+desktop) + checagem de overflow.

---

## 12. O que validar com Playwright

- **Lista de exames**: grupo por categoria + filtro + busca + tags (mobile 390 + desktop 1440) + **sem overflow horizontal**.
- **Detalhe**: badge de categoria correto (não "Outro"); agrupamento por painel intacto.
- **Evolução**: card "resumo da evolução" + comparativo + gráfico de tendência + empty-state com <2 exames.
- **Alertas**: 3 níveis de prioridade visuais + ordenação + tom não-alarmante + "Agendar".
- **Compartilhamento**: fluxo QR/link+PIN + validade + revogação instantânea + portal do médico carregando resumo.
- **Regressão crítica**: upload→extração→IA, alertas, compartilhamento por CRM (não quebrar).
- Acessibilidade: foco, contraste, "Pular pro conteúdo", VLibras.

---

## 13. Riscos técnicos

| Risco | Impacto | Mitigação |
|---|---|---|
| Mudar `CATS` em `medicalData.ts` propaga pra Evolution/Alertas/Detalhe | Alto | Rodar `medicalData.test.ts` + validar 3 telas; mudança aditiva |
| `ExamList` (react-admin List) quebrar dataProvider/filtros/paginação | Alto | Usar `ListBase`+`WithListContext`+`useListContext` (não reescrever o iterator); manter contrato |
| Quick-share (shareToken) tocar auth | Alto | Reaproveitar padrão `AiAnalysis.shareToken`+`sharePin`; PIN hash; validade curta; revoke |
| Alertas virarem "diagnóstico" / alarmistas | Reputação/LGPD | Linguagem "educativa, confirme com seu médico"; "Leve" discreto; sem predição absoluta |
| Adicionar campo no DB (se prioridade for persistida) | Migração P3009 | Preferir **runtime** (sem schema); se persistir, `ADD COLUMN IF NOT EXISTS` + `db push` no teste |
| Quebrar extração/IA ao tocar `health-summary`/`pipeline` | Alto | Não mexer no schema de extração; só consumir saídas |
| `navigate(0)`/`reload` crashar APK | Mobile | Usar `useRefresh()` |
| recharts 3 (ReferenceArea/ResponsiveContainer) | Baixo | Já usado — manter padrão |

---

## 14. Próximos passos

1. **Sua aprovação** deste diagnóstico + priorização dos milestones (sugiro **M2 → M5 → M3 → M4 → M6 → M7**).
2. Confirmar **decisões em aberto**: (a) separar "Tireoide" da categoria Hormônios? (b) Quick-share QR é escopo deste ciclo? (c) prioridade de alerta **runtime** vs persistida?
3. Após aprovação, implementar **M2 primeiro** (isolado, baixo risco) com typecheck + testes + Playwright antes de commitar.
4. Não esquecer: `npm run typecheck` (web), `npm test --workspace packages/server`, e **AAB só se patient-facing mudar**.

> **Linguagem responsável (fixa em todo o trabalho):** a IA organiza e explica; **a decisão final é do médico**. Sem diagnóstico automático, sem promessa de cura/previsão absoluta, sem tom alarmista.
