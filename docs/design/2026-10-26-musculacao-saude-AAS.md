# Blueprint — Saúde de quem treina: acompanhamento educativo com AAS autorrelatado

**Projeto:** Dr. Exame / Meus Exames · **Data:** 26/10/2026 · **Status:** BLUEPRINT PARA REVISÃO DO DONO — nada implementado.
**Insumos:** (1) auditoria do código (fatos com file:line, abaixo); (2) pesquisa clínica `docs/research/2026-10-26-aas-musculacao-research.md` (fontes-âncora ACC 2024, NSW 2022, Einstein/CFM 2.333/2023, ES 2018, AUA 2018, HAARLEM, Baggish 2017, RDC ANVISA 871/846/847-2024).
**Inviolável (do research §3/§5):** IA nunca diagnostica nem orienta conduta; nunca "ciclo seguro"/"dose segura"; nunca endosso de marca; monitoramento não é habilitação — **"acompanhamento transmite uma falsa sensação de segurança"** (Einstein). Disclaimer fixo: **"Exames acompanham; não tornam o uso seguro."**

---

## 1. Diagnóstico + o-que-existe × o-que-falta

**Diagnóstico.** O código já contém ~80% de um "modo esportivo" maduro, isolado por kill-switch (`sportsMode.enabled`, default off, `packages/server/src/utils/settings.ts:90`): perfil (`SportsProfile`, `packages/server/prisma/schema.prisma:358-372`), catálogo de 51 substâncias com impacto educativo (`substanceCatalog.ts:37-93`), 8 cards de conhecimento em DRAFT (`sports-knowledge.ts` + `knowledge/sports/`), addendum de contexto em chat e health-summary (`sports-context.ts`), SportsDashboard com lentes por arquétipo (`sportsDomains.ts:150-260`), prep de consulta, ClinicalGoal e painel médico. O que falta **não é tela nova** — é (i) dado estruturado de uso (hoje `Medication` tem `startedAt`+`active` mas **nenhum fim-de-uso estruturado**), (ii) **propagação do contexto** às superfícies de maior valor (`/check/full`, brief da teleconsulta, push, nudges), e (iii) **conteúdo clínico validado (E6)** — que o research de hoje finalmente fornece com fontes, limiares e limites legais (CFM 2.333/2023 proíbe prescrição estética/esportiva; Einstein: "não existe dose segura"). A tese deste blueprint: **evoluir a camada de medicamentos/exames (conceito c), não criar vertical nova.**

| Área | O que existe (file:line) | O que falta (lacuna da auditoria + research) |
|---|---|---|
| Flag/kill-switch | `sportsMode.enabled` default off (`settings.ts:90`); rotas 403 quando off | Decisão de ligar (pilot → geral) — engenharia pronta |
| Perfil | `SportsProfile` (`schema.prisma:358-372`): modality, supplements, collectionContext, `declaredSubstances` (só nomes), toggle `active` server-side | Fim-de-uso estruturado, última administração, médico acompanhante, "não sei" persistente em todos os campos |
| Substância declarada | Vira `Medication` "[Hormônio] Nome" (DeclaredSubstanceForm); `Medication` tem dosage texto + `startedAt`+`active` | **(Lacuna 3)** fim-de-uso/ciclo estruturado no Medication; quantidade autorrelatada opcional sem recomendar; status regulatório (C5/C1) no catálogo |
| Catálogo | 51 substâncias + aliases + unitHint + impacto HAARLEM/ANVISA (`substanceCatalog.ts:37-93`) | Conciliar com research §1: trembolona/drostanolona/oximetolona/boldenona/exemestano entraram na C5 pela RDC 847/2024; GH = **C1**; SARMs/pró-hormonais NÃO são suplemento (§1.5); gírias só com validação de especialistas (§7.2) |
| Knowledge | 8 cards TRT/Hct/HDL/E2/LH-FSH/SHBG/CK-ALT/cistatinaC — DRAFT | **(Lacuna 2)** desbloqueio por revisão médica E6 + cards novos: PA, PSA, glicemia/HbA1c, GGT/FA/bilirrubina, eco/ECG (§5) |
| Contexto IA | `sports-context.ts` addendum em chat + health-summary (flag+perfil) | `/check/full` cruza meds×12 exames **sem** sportsContext; **brief da teleconsulta sem substâncias** (lacunas 4 e 5 da auditoria) |
| Dashboard | SportsDashboard: banner, quick stats, filtro por domínio, marker cards, timeline, prep consulta, substâncias | Tiles "o que mudou/o que falta/o que levar pro médico"; timeline exames × **janelas de uso** (precisa fim-de-uso); distinção alterado/ausente/não-realizado |
| Alertas | SportsAlertBanner (CK×treino, HDL×andrógeno, linguagem hematócrito) | Intensidades proporcionais 3 níveis + limiares com fonte + regra de coexistência (§6); **nunca score de segurança** |
| Push/nudges | `pushAudience` (plan/engagement); `healthNudges` alerta 30d + dica IA 2x/sem — tema hormonal **em implementação** (`tipEngine.ts:50-60,98-100,147`) | **(Lacuna 1)** segmento esportivo no pushAudience; textos de nudge hormonal sob gate de linguagem §6 |
| Landing | `/saude-esportiva` (E1 no ar): simulador régua + FAQ | 3 alternativas testáveis (§8), anunciando só o que existe |
| Compliance | Research traz a linguagem central (Einstein/CFM/ACC/NSW) | Disclaimer fixo em TODAS as superfícies esportivas; lint de linguagem proibida; conferir RDC 871/846/847 no DOU antes de citar em texto público (research §6.12) |

---

## 2. Conceito recomendado

**Recomendação: (c) Acompanhamento contextual em medicamentos/exames** — a substância declarada vira `Medication` estruturado de primeira classe e **todo consumidor existente** (interações A-X, `/check/full`, chat, health-summary, brief da teleconsulta, nudges, push, ConsolidatedReport) herda o contexto. O SportsDashboard permanece como **lente de apresentação** para esse público; a landing "Saúde de quem treina" é o framing de aquisição (§8).

**Por quê (critérios do dono):**
- **Menor duplicação:** `declaredSubstances` já se materializa como `Medication "[Hormônio] Nome"` — evoluir essa ponta elimina a duplicação Nome-no-perfil × Medication. `SportsProfile` encolhe para o que é de fato perfil (modalidade, frequência, contexto de coleta, suplementos).
- **Menor manutenção:** uma fonte de verdade (Medication). Nada de caminho paralelo "de academia" que envelhece separado das interações/check/brief que todo usuário usa.
- **Integração premium:** o diferencial defensável não é "app de academia" — é **o exame lido com contexto declarado**. Nenhum concorrente BR cruza laudo × uso relatado × portal do médico. ACC 2024: usuários raramente revelam uso espontaneamente; ambiente não julgador aumenta a revelação → mais contexto → IA melhor → mais retenção.

**Por que não (a) evoluir o perfil do atleta:** empurraria ciclo/datas para dentro do `SportsProfile` Jsonb, duplicando Medication e mantendo o esporte como gueto atrás da flag — exatamente a arquitetura que as lacunas 3-5 revelam frágil. **Por que não (b) painel "Saúde de quem treina":** o SportsDashboard já é esse painel; criar outro é duplicar superfície. (b) sobrevive como copy de landing.

### Regra de ouro — 3 perfis, sempre distinguidos, nunca presumidos

| Perfil | Como o app reconhece (SÓ declaração) | O que muda |
|---|---|---|
| **Musculação sem hormônios** | Perfil esportivo ativo, nenhuma substância hormonal declarada | Lentes strength/endurance (`sportsDomains.ts:150-260`), conhecimento geral, sem addendum hormonal, nudges de rotina |
| **TRT prescrito** | Hormônio declarado **com** médico acompanhante | ClinicalGoal do médico (ex.: T 450-600, SBEM), template TRT do painel médico, cadência baseline→3-6m→anual citada como **referência** ES/AUA (nunca protocolo) |
| **Uso não prescrito (autorrelatado)** | Hormônio declarado **sem** prescritor | Badge "DECLARADO — não verificado", linguagem Einstein ("não existe dose segura"), ênfase no convite à avaliação médica |

**Proibições estruturais:** nunca presumir uso a partir do laudo (HDL/LH/FSH baixos geram **pergunta aberta** tipo NSW — "você usa algo para ganho muscular, inclusive injetáveis?" — nunca acusação); nunca o app sugere otimização de uso (CFM 2.333/2023); nunca o paciente edita `isAbnormal` ou meta clínica.

---

## 3. Jornada do usuário (reaproveitando telas existentes)

| # | Passo | Onde vive (hoje) | Especificação |
|---|---|---|---|
| 1 | **Descoberta → cadastro** | Landing `/saude-esportiva` (E1 no ar, simulador régua + FAQ) → signup existente | Pós-signup, 1 pergunta onboarding: "Você treina para hipertrofia/força?" (regex `musculação|bodybuilding` já em `sportsDomains.ts:150-260`) → cria `SportsProfile` `active:true`. Skippável. |
| 2 | **Registro rápido do stack** | Modal `DeclaredSubstanceForm` (evoluído — §7) | Autocomplete no catálogo de 51 (`substanceCatalog.ts:37-93`) por nome comercial OU princípio ativo. Tudo opcional; **"Não sei" válido em todos os campos**; suplementos em campo separado; última administração opcional. Alvo ≤90s. Persiste em Medication estruturado + mirror em `declaredSubstances`. |
| 3 | **Importar exame** | Fluxo de upload existente (pdftotext → texto → GLM; nunca visão) | Parser reconhece nomes comerciais/princípios ativos (aliases) se citados no laudo; **gírias só após validação de especialistas** (research §7.2). Após 1º exame com perfil ativo: banner "contexto aplicado aos seus marcadores". |
| 4 | **Entender mudanças** | SportsDashboard + chat | Quick stats, filtro por domínio (`hormonal|hemograma|cardio|musculo_figado|renal`), marker cards com fonte+laudo original, SportsAlertBanner, timeline exames×uso (§4). Chat e health-summary já recebem addendum (`sports-context.ts`). |
| 5 | **Preparar conversa médica → teleconsulta** | `SportsConsultPrep` (≤5 perguntas) → `ConsolidatedReport` (interações + perguntas ao médico + share) → agendamento de teleconsulta com brief clínico | **Fechar lacuna:** brief da teleconsulta inclui seção "uso relatado" (substâncias declaradas, janelas de uso, contexto de coleta, badge não-verificado) + ClinicalGoal quando existir. |

Toggle `SportsProfile.active` (server-side, já no schema) desliga contexto IA/dashboard sem apagar dados — respeitado por TODOS os consumidores, inclusive os novos.

---

## 4. Dashboard — "o que mudou / o que falta / o que levar pro médico" (spec)

**Princípios:** sem score de segurança, sem % de risco, sem semáforo vermelho de urgência (ênfase = copy + intensidade tipográfica, §6). Cada valor citado mostra **faixa do laboratório de origem** e link para o **laudo original** (PDF em `/api/files`). Uso relatado sempre rotulado "DECLARADO — não verificado".

**Tiles:**
1. **"O que mudou"** — últimos marcadores alterados vs. anterior (delta + direção). Estados visuais distintos e consistentes: `ALTERADO` (chip cobre + seta), `DENTRO DA FAIXA` (verde discreto, colapsável), `AUSENTE` (nunca dosado no histórico — contorno tracejado cinza: "não consta no seu histórico"), `NÃO-REALIZADO` (marcador que o contexto esportivo avalia mas sem exame — cinza + CTA "importar / levar na próxima").
2. **"O que falta"** — matriz clínica do perfil (§5) ∩ histórico real → chips ausentes/não-realizados, cada um com 1 linha de fonte ("ACC 2024 avalia este marcador em uso relatado de AAS"). Nunca agenda impositiva: CTA é "conversar com meu médico".
3. **"O que levar pro médico"** — recap do `SportsConsultPrep` (≤5 perguntas) + share do `ConsolidatedReport` (que já embute interações medicamentosas e perguntas ao médico).

**Timeline exames × uso relatado:** eixo de tempo com exames (pontos coloridos por domínio) sobreposto a **janelas de uso** (`Medication.startedAt → endedAt`; borda tracejada quando fim aberto ou "não sei"). Hover em marcador: valor, faixa do lab, contexto de coleta (`collectionContext`: treino <24h? jejum? última administração?). Quantidade/dose autorrelatada exibida apenas como registro, jamais como parâmetro de cálculo ou sugestão.

---

## 5. Matriz clínica condensada (do research §2/§4/§5)

Freqüência (linha única, replicada em toda superfície): **ES/AUA (TRT) baseline → 3-6m → anual é REFERÊNCIA, não protocolo**; ACC/NSW não fixam intervalo ("durante e após"); nenhuma diretriz internacional define seguimento para uso recreacional → o app oferece **lembretes, nunca agenda impositiva**.

| Marcador | Por que importa (1 linha) | Âncora/limiar com fonte | Já em card knowledge? | Novo → E6? |
|---|---|---|---|---|
| Hematócrito/Hb | Eritrocitose → viscosidade/risco trombótico | Hct ≥54% = valor de ação médica em TRT (AUA/ES 2018); 52-53,9% zona cinzenta (AUA ">50 investigar") | Sim — card Hct (DRAFT) | Limiar numérico + texto → E6 |
| Lipídios (HDL/LDL/TG) | Orallis 17-AA suprimem HDL 30-50%+ | HDL <20 mg/dL ou queda ≥50% vs baseline (ACC 2024); TG ≥500 mg/dL (limiar consagrado) | Sim — card HDL (DRAFT) | Limiares → E6 |
| ALT/AST | Hepatotoxicidade (orais 17-AA) | >3× LSR (padrão DILI/FDA); AST↑ por lesão muscular do treino = confusor | Parcial — card CK-ALT | Confusor + limiar → E6 |
| GGT + FA + bilirrubina | Distinguir colestase de origem muscular | Complementa ALT/AST (>3× + bili >2× = Hy's Law → intensidade 3) | **Não** | **Novo → E6** |
| Creatinina/eGFR/ureia | Função renal; confusores dominantes: massa muscular, creatina, treino recente | KDIGO 2024: cistatina C em extremos de porte corporal | Sim — card cistatinaC | Reforço de confusores → E6 |
| PSA | Próstata em uso androgênico, >40-50a | >4,0 ng/mL ou velocidade >1,0/ano (AUA 2018) | **Não** | **Novo → E6** |
| LH/FSH | Eixo suprimido; recuperação de meses | ACC/NSW (marcador indireto de uso) | Sim — card LH-FSH (DRAFT) | E6 ratifica |
| T total/livre + SHBG + E2 | Estado farmacológico; SHBG rebaixada = marcador indireto ACC | ES 2018 (dosagem matinal, espectrometria se disponível) | Sim — cards TRT/E2/SHBG | E6 ratifica |
| Prolactina | Diferenciar ginecomastia/disfunção sexual | Painéis BR (Posenato — comercial) | **Não** | Novo → E6 decidir (research: "talvez") |
| Glicemia jejum + HbA1c | AAS pioram sensibilidade à insulina (atuais E ex-usuários) | Rasmussen 2017 (PMID 28500659); Di Girolamo 2024; ≥126 mg/dL / HbA1c ≥6,5% = "fora da faixa, converse" | **Não** | **Novo → E6** |
| Insulina/HOMA-IR | Quantificar resistência | Não validado como marcador de seguimento (Rasmussen) | **Não** | Novo opcional → E6 decidir ("talvez") |
| CK | Treino intenso × rabdomiólise | NSW 2022; CK alta isolada pós-treino ≠ doença | Sim — card CK-ALT (DRAFT) | E6 ratifica |
| Pressão arterial | HAARLEM: ciclo elevou PA +6,87/+3,17 mmHg (média 24h) | ≥140/90 repetida (domiciliar) | **Não** | **Novo → E6** + definir entrada (manual/HC se existir) |
| ECG + ecocardiograma | Baggish 2017: FEVE↓, strain↓, troponina↑ em longa duração | ACC: eco em uso crônico | **Não** | Novo → E6 (sempre "conversa com médico", nunca agendar) |

Todos os cards: fonte citada por card, fechamento com direcionamento médico + disclaimer de não-diagnóstico. Publicação só após E6 assinar card a card.

---

## 6. Alertas/push proporcionais — regras e linguagem exata

**3 intensidades:** (1) informativo — dentro da faixa, contexto AAS; (2) destaque educativo — fora da faixa → mostrar + sugerir conversa médica; (3) destaque forte — limiar consagrado OU coexistência → "procure avaliação médica com prioridade". **Coexistência eleva ênfase e urgência do convite, nunca linguagem de gravidade diagnóstica.** Nenhum alerta determina conduta.

**Regras (gatilho → intensidade, todas com revisão clínica E6):** Hct ≥54% → 3 · Hct 52-53,9% → 2 · HDL <20 ou queda ≥50% → 2-3 · TG ≥500 ou LDL ≥190 → 3 · AST/ALT >3× LSR → 3 · Hy's Law (>3× + bili >2×) → 3 urgência · PSA >4,0 ou +1,0/ano → 3 · PA domiciliar repetida ≥140/90 → 2-3 · glicemia ≥126 / HbA1c ≥6,5 → 2-3 · CK muito elevada + mialgia/urina escura relatadas → 3 · **combinação Hct ≥54% + HDL <20 + PA ≥140/90 → 3 com texto de prioridade médica** · red flags contextuais (uso relatado <21 anos, mulheres — NSW) → sempre 3.

**Linguagem modelo (exata, do research §3 — base de copy, aprovada em E6):**
- ✅ "Você relatou uso de esteroides. Estes resultados combinados (hematócrito X% e HDL Y mg/dL) estão fora das faixas habituais — em quem usa AAS, essa combinação é conhecida e pode estar ligada ao uso. **Leve este resumo ao seu médico**; ele vai avaliar o contexto completo."
- ✅ "Este padrão costuma ser reversível com tempo e acompanhamento médico — a decisão sobre continuar, pausar ou ajustar qualquer coisa é sempre médica."
- ✅ Disclaimer fixo em toda superfície esportiva: **"Exames acompanham; não tornam o uso seguro."**
- ❌ **Nunca** (vetados por lint de CI): "pause o ciclo", "reduza a dose", "faça uma sangria", "comece TPC", "troque X por Y", "ciclo seguro", "dose segura", "você está com X" (diagnóstico), endosso/ Sugestão de marca.

**Push:** título neutro ("Novo exame no seu histórico — 2 marcadores fora da faixa"), **corpo SEM valores clínicos** (LGPD: notificação = metadado; conteúdo só no app). Segmento esportivo via `pushAudience` (fecha lacuna 1). **Nudges hormonais** (tema `hormonal` já em implementação no `tipEngine.ts:50-60,98-100,147` — prioridade máxima quando há uso declarado): textos 2x/sem passam pelo MESMO gate de linguagem deste parágrafo, com revisão E6 de spot-check.

---

## 7. Cadastro de substâncias evoluído (DeclaredSubstanceForm → spec de campos)

Persistência: **Medication estruturado** como fonte de verdade + mirror de nomes em `SportsProfile.declaredSubstances` (contexto rápido p/ IA). Migration aditiva `IF NOT EXISTS`; queries com `select` explícito (drift gate do projeto).

| Campo | Spec |
|---|---|
| **Substância** | Autocomplete do catálogo (51) por nome comercial OU princípio ativo (aliases). Texto livre se não achar. Se "não sei o nome": escolher **categoria** (andrógeno injetável / andrógeno oral / peptídeo / antigonádico-antiestrogênio / outro). |
| **Apresentação/via** | Vinda do catálogo (IM/SC/VO/gel) — não digitável quando do catálogo. Badge educativo da lista ANVISA (C5 maioria; **GH = C1**), sem julgamento. |
| **Quantidade/frequência** | **OPCIONAL, autorrelatada, texto livre** ("300mg/semana" ou "não sei"); `unitHint` do catálogo como placeholder. Nunca validar, nunca sugerir, nunca usar em cálculo. Dado sensível (criptografia como PII). |
| **Início** | Mês/ano suficiente. "Não sei" válido. |
| **Fim de uso (novo no Medication)** | Enum `{em uso, interrompi, não sei}` + `endedAt` (mês/ano, opcional). Hoje só existe `startedAt`+`active` — este campo fecha a lacuna 3 e alimenta a timeline §4. |
| **Última administração** | Data opcional → alimenta `collectionContext` ("coleta 3 dias após última dose relatada") para a IA contextualizar. **Nunca** calcular meia-vida nem derivar conduta. |
| **Médico acompanhante** | Opcional: link para DoctorShare existente ou texto livre. Preenchido → perfil "TRT prescrito"; vazio + hormônio → "uso não prescrito" (badge, sem julgamento — nunca presumir). |
| **Suplementos** | Campo **separado** (`SportsProfile.supplements`), nunca misturado com medicamentos. SARMs/pró-hormonais **não** entram como suplemento — categoria própria "não aprovados ANVISA" com aviso educativo (research §1.5). |
| **"Não sei"** | Válido em TODOS os campos. Registro parcial > registro ausente (ACC: revelação parcial aumenta em ambiente não julgador). |
| **Fotos** | **Genéricas ilustrativas por categoria/via do catálogo** (ampola, frasco-ampola, comprimido, caneta SC): SVG/vetor neutro, sem logotipo, sem paleta de marca real, sem imitar embalagem. Alt-text obrigatório (a11y). |

LGPD: exclusão 1-tap + export; minimização; nunca inferir "abuso"; relato de uso + exames = dado sensível (art. 11) — cifrado, fora de logs.

---

## 8. Landing ×3 alternativas (evolução de `/saude-esportiva`; só anunciar o que EXISTE)

Restrições: zero "ciclo seguro", zero marca, zero promessa de resultado/saúde. Alt C só ao ar quando a flag esportiva estiver ligada (depende de ClinicalGoal/portal). Simulador régua + FAQ atuais reaproveitados nas três. Robô oficial (robô+escudo) na visual, conforme regra de marca.

### Alternativa A — ângulo CARGA (frase do dono 1)
- **Título:** "Você acompanha suas cargas. E seus exames?"
- **Sub:** "O Dr. Exame organiza seus exames e o que você usa — declarado por você, lido com contexto — para a próxima conversa com seu médico render mais."
- **3 benefícios:** (1) Importe o PDF do laboratório e veja o que mudou desde o último; (2) Registre suplementos e medicamentos (inclusive hormonais) — você decide o que declara; (3) Saia da consulta com perguntas prontas e histórico compartilhável.
- **CTA primário:** "Criar minha conta grátis" · **secundário:** "Ver como funciona" (scroll → simulador régua).
- **Visual:** mock 390px da timeline do SportsDashboard (exames × janelas de uso) + card "o que levar pro médico"; robô mascote ao lado do hero.
- **Porquê converte:** fala a língua do treino (carga = progressão), aponta dor real (exame solto, sem contexto, sem médico), CTA de baixo compromisso. Público mais amplo — musculação com ou sem hormônios.

### Alternativa B — ângulo HISTÓRICO (frase do dono 2)
- **Título:** "Seu histórico de exames também faz parte do treino."
- **Sub:** "Consistência constrói músculo — e exame. Centralize laudos, acompanhe marcadores ao longo do tempo e chegue à consulta com o histórico completo."
- **3 benefícios:** (1) Todos os laudos num só lugar, com o PDF original sempre à mão; (2) Linha do tempo de marcadores mostrando o que mudou; (3) Resumo compartilhável antes da consulta ou teleconsulta.
- **CTA primário:** "Começar agora — grátis" · **secundário:** "Ver exemplo real" (modo exemplo/demo).
- **Visual:** screenshot real da timeline de evolução (DashboardV2/SportsDashboard) + card de resumo do robô.
- **Porquê converte:** apela à identidade de consistência de quem treina; não menciona hormônio no hero → menor barreira e menor risco de leitura de endosso; forte p/ SEO "histórico de exames".

### Alternativa C — ângulo CONVERSA MÉDICA (trust / TRT acompanhado)
- **Título:** "Seus exames, seu médico, na mesma página."
- **Sub:** "Faz TRT ou outro tratamento hormonal? O Dr. Exame organiza exames e uso relatado — com metas definidas pelo SEU médico — para a consulta ser sobre você, não sobre papéis."
- **3 benefícios:** (1) Contexto hormonal nos seus marcadores (educativo, nunca diagnóstico); (2) Metas clínicas definidas pelo seu médico (ex.: faixa de testosterona); (3) Brief completo para teleconsulta ou presencial.
- **CTA primário:** "Organizar meus exames" · **secundário:** "Indicar ao meu médico" (funil médico existente).
- **Visual:** split-screen portal médico (SportsPanel: template TRT + badge "DECLARADO — não verificado") × app do paciente.
- **Porquê converte:** posiciona premium (ClinicalGoal + portal médico), atrai TRT prescrito — público de maior retenção e zero risco CFM — e abre dual-funnel paciente+médico. **Gate:** só quando flag esportiva ligada.

**Teste recomendado:** A ao ar primeiro (amplo), C como variante segmentada/paga; B como controle/híbrido. Medição ver §10.

---

## 9. MVP priorizado (impacto × esforço × dependência)

### P0 — Backbone de dados + integração (sem conteúdo clínico novo → NÃO depende de E6; destrava tudo)
1. **Medication estruturado:** `endedAt`/`endStatus` + `lastAdministeredAt` + médico acompanhante. Migration aditiva `IF NOT EXISTS`; API compatível com registros antigos (default "não sei"). [alto × M × nenhuma]
2. **DeclaredSubstanceForm evoluído** (§7): "não sei" em tudo, suplementos separados, fotos genéricas, badge C5/C1. [alto × M × depende 1]
3. **`/check/full` com sportsContext:** interações e cruzamento meds×12 exames passam a considerar substâncias declaradas + contexto de coleta. [alto × P × depende 1]
4. **Brief da teleconsulta com "uso relatado":** substâncias, janelas de uso, contexto de coleta, badge não-verificado, ClinicalGoal. [alto × P × depende 1]
5. **`pushAudience` com segmento esportivo** (plan/engagement × esportivo). [médio × P × nenhuma]

**Critérios de aceite P0:** migration idempotente e aplicável em prod com drift gate (`select` explícito); registro antigo sem fim-de-uso continua válido; `/check/full` cita interação contextualizada quando há substância declarada (teste E2E supertest); brief imprime seção "uso relatado"; push segmenta sem valor clínico no payload; `tsc --noEmit` limpo (server+web) + vitest workspace server; campos sensíveis cifrados/fora de logs.

### P1 — Superfície + clínica validada (**GATE E6**: revisão médica assina card a card)
6. **Matriz clínica (§5):** cards novos (PSA, glicemia/HbA1c, GGT/FA/bili, PA) + limiares nos existentes, fonte por card.
7. **Alertas proporcionais** 3 intensidades + coexistência (§6) no SportsAlertBanner; knowledge DRAFT→publicado; **lint de linguagem proibida no CI** (grep de termos vedados nos textos).
8. **Dashboard §4:** tiles mudou/faltou/médico + timeline exames×janelas de uso.

**Critérios de aceite P1:** checklist de revisão médica preenchido por card (arquivado no repo); nenhum card sem fonte; dashboard sem score/percentual de risco; QA Playwright 390px e 768px; flag `sportsMode` ligada primeiro em cohorte pilot definida no admin.

### P2 — Crescimento + refinamento
9. Landing ×3 em teste (UTM first-party, ver §10). [médio × P × depende flag ligada]
10. Nudges hormonais completos (`tipEngine` tema hormonal já em curso) — textos sob gate §6. [médio × P]
11. Prolactina / HOMA-IR e sugestão eco/ECG ("conversa com médico") se o revisor aprovar. [baixo × P × E6]
12. Conciliação catálogo×research: status C5/C1 pós-RDC 846/847-2024, GH=C1, SARMs fora de suplementos; **conferir DOU/AnvisaLegis antes de citar números de resolução em texto público** (research §6.12).

**Critérios de aceite P2:** conversão da landing ≥ baseline em 4 semanas; opt-out de nudge hormonal disponível; zero incidente LGPD; rollback testado (flag off = tudo volta ao estado atual — garantia já desenhada em `sports-context.ts`: flag off → prompt byte-idêntico).

### Plano de validação (todas as fases)
(i) **E6 = gate formal** de toda fase com conteúdo clínico novo (P1 inteira; spot-check dos textos de P0 em brief/check). (ii) **Privacy pass:** minimização, criptografia, sem inferência de abuso, sem dado de saúde em analytics. (iii) **Engenharia:** tsc server+web, `npm test --workspace packages/server`, Playwright 390/768, prisma drift gate. (iv) **Pilot:** flag on para cohorte pequena via admin → NPS in-app → rollout. (v) **Rollback:** kill-switch `settings.ts:90` (já existe, testado).

---

## 10. Métricas (sem dado de saúde em ferramentas de publicidade)

| Métrica | Definição | Instrumentação |
|---|---|---|
| **Ativação do perfil hormonal** | % de contas com `SportsProfile.active` que declararam ≥1 substância hormonal (ou TRT) | Evento first-party `sports_substance_declared` — **sem nome/concentração da substância** no evento |
| **% exames importados com perfil ativo** | Exames pós-ativação ÷ total do cohort — mede se o contexto está entregando valor | Join interno (DB), jamais exportado |
| **NPS segmento** | Pesquisa in-app segmentada: perfil hormonal ativo × inativo | Dado bruto fica no app/DB |
| **Conversão landing→cadastro→1º exame** | utm_landing (A/B/C) → signup → `exam_imported` | PostHog/analytics com **eventos comportamentais apenas**; UTM só na landing |
| Guardrails | Opt-out push/nudge; % de relatos com "não sei" (qualidade do onboarding); taxa de exclusão de substância; tempo até rollback (flag) | Internos |

**Regras LGPD (art. 11 — dado sensível):** PROIBIDO enviar nomes de substâncias, valores de exames, metas clínicas ou qualquer inferência de uso como propriedade de evento/analytics; públicos personalizados em plataformas de publicidade **jamais** construídos a partir de dado de saúde; segmentação só via `pushAudience` interno (first-party).

---

## Pendências de decisão do dono
1. Aprovar conceito (c) e o desenho P0 (fechar as 3 lacunas comprovadas sem E6).
2. Contratar/confirmar o revisor médico do E6 (gate de P1) — a pesquisa Anvisa/CFM (gate anterior, memória 06/10) está agora atendida por este research.
3. Escolher landing inicial (recomendação: A) e o momento de ligar `sportsMode.enabled` (pilot).
4. Antes de publicar textos com números de RDC: conferir RDC 871/2024 e 846/847/2024 no DOU (portal AnvisaLegis fora do ar na sessão do research).
