# Saúde Esportiva no Dr. Exame — Estudo, Diagnóstico e Plano

> Data: 06/10/2026 · Status: **planejamento (nada implementado)** · Restrição nº 1: **paciente normal intocável** (flag default OFF, migrations aditivas, suíte atual verde sem edits).
> Fontes: mapeamento do código real (arquivo:linha) + deep research com verificação adversarial 3-votos por claim (104 agentes; sobreviveram 10 claims; 2 refutadas — ver §3.3).

---

## 1. Recomendação principal e decisões propostas

**Construir "Saúde Esportiva" como modo opt-in orientado a contexto, não a julgamento.** O produto organiza o que o paciente DECLARA (modalidade, treino, substâncias, momento da coleta) para melhorar a interpretação dos exames — nunca normaliza risco, nunca recomenda ciclo/dose/TPC.

Decisões-chave propostas:

| # | Decisão | Fundamento |
|---|---|---|
| D1 | **4 camadas de referência separadas**: régua do lab (intocável) + meta clínica (só médico) + histórico pessoal (tendência, nunca "normal") + regras de alerta (independentes, inalteradas) | Lab ref já vence no código (`ExamItem.refLow/refHigh/refAppliesTo`); diretrizes TRT têm meta ≠ referência (achado 1, high 3-0) |
| D2 | **Substância declarada entra como `Medication`** no MVP (texto em dose/frequência + início) — zero migration, já flui pro contexto da IA | Mapeamento §2: medications-context + interações já existem; teste→hemoglobina já cruza |
| D3 | **Nunca esconder alteração**: flag `isAbnormal` (régua do lab) permanece SEMPRE visível; meta clínica é camada adicional, jamais substitui | Exigência do brief + achado: uso declarado contextualiza, não normaliza |
| D4 | **IA educativa comparativa** — explica achados no contexto declarado, cita diretrizes, monta perguntas pro médico; proibido: faixa segura de AAS, doses, ciclos, TPC, ajustes | Achado 9 (high): NENHUM range seguro validado p/ qualquer AAS; achado 10: educativo puro "fica aquém" → posicionar como organizador de contexto p/ conversa médica |
| D5 | **Bio-idade exclui marcadores de testosterona** p/ usuários com hormônio declarado (variante de pesos — tabela já é data-driven); score padrão intacto p/ demais | Mapeamento §5: `biological-age.ts:40-41` usa T total/livre — inválida sob TRT/exógena |
| D6 | **Perfil esportivo = tabela nova `SportsProfile`** (modalidade/frequência/objetivo/suplementos/contexto de coleta) — aditiva, opcional | Mapeamento §1: Patient não tem nada estruturado; não tocar em Patient |
| D7 | **Escopo de share `sports` NÃO automático** — treinador não existe como papel; nada de hormones/laudos saem sem escopo explícito | Brief §7 + `DoctorShare.scopes` existente |
| D8 | **Enquadramento Anvisa = decisão pendente** com pesquisa jurídica dedicada (o workflow REGULATÓRIO retornou zero claims verificadas — não pesquisado, não confirmado seguro) | Caveat do deep research; não assumir que disclaimer resolve |

**Público inicial recomendado**: pacientes que JÁ usam o app e se declaram em TRT ou musculação com acompanhamento médico (validação interna, menor risco); depois comunidade fitness aberta. **Não** começar pelo público AAS-puro (maior risco regulatório/ético antes do enquadramento fechado).

---

## 2. Diagnóstico do código atual (o que existe / adapta / falta)

### 2.1 Existe e é base sólida
| Área | Onde | Nota |
|---|---|---|
| Patient + clinicalProfile texto | `schema.prisma:224-266`; edição `Profile.tsx:104-115` | Perfil clínico já é ingerido por TODA a IA |
| Medication (nome/dose/freq/início) | `schema.prisma:298-328`; `medication.routes.ts` | Gancho barato p/ substância declarada |
| Fluxo exame: pdftotext→GLM→normaliza | `extraction/claude.ts` (LAB_INSTRUCTIONS), `pipeline.ts:423-440` | Testosterona dupla-unidade e DHT já tratados (L48-49) |
| Régua do lab preservada | `ExamItem` `schema.prisma:532-567` (`refLow/refHigh/refText/refAppliesTo`) | **Lab vence** — base da política D1 |
| Unidades/normalização table-driven | `utils/units.ts:20-21`, `utils/normalize.ts:68-76` (+SYNONYMS) | SHBG/IGF-1/LH/FSH = entradas novas + testes |
| Alertas determinísticos grátis | `jobs/healthNudges.ts` (isAbnormal → Notification+push) | Essencial não depende de crédito ✓ |
| Tendências + banda de referência | `Evolution.tsx:367-405`, `TrendsChart.tsx:165-207` | ReferenceArea = onde desenhar meta clínica |
| Score/PhenoAge/KDM | `health-state.ts:404`, `phenoage.ts:50`, `biological-age.ts:75` | Bio-idade RODA em prod; T é marcador (D5) |
| IA + guard | `analysis/system.ts:5-16`, `diagnosticGuard:19-28` | Guard veta recomendação de suplemento/tratamento |
| Dashboard com precedente de swap | `DashboardV2.tsx:732-749` (modo exemplo) | Padrão pronto p/ modo esportivo |
| Portal médico por scopes | `DoctorPortal.tsx:119-120`, `DoctorShare schema:845-863` | Novo scope = pattern existente |
| Health Connect (passos/kcal/FC/dist/exerc) | `ActivityCard.tsx:24-30`, `measurement.routes.ts:153-179` | Faltam sono e força (§2.3) |
| Feature flags admin live | `settings.ts:8-99`, `/api/public/config app.ts:162-185` | `sportsMode` = cópia do padrão `motd` |
| Monetização | `credits.ts:8` (chat 2/summary 10/consolidated 20) | Alertas grátis; share alerts = 3 créditos |

### 2.2 Adaptável (pequeno)
- `personalized-targets.ts:128` já gera alvos por meds+profile → estender p/ contexto esportivo (fonte: meta clínica).
- `knowledge/` (marcadores + guidelines .md) → novos arquivos esportivos entram no mesmo fluxo de citação.
- `interactions.ts` → pares esportivos (T×Hct existe; add T×HDL, T×LH/FSH, creatina×creatinina como CONTEXTO, não como regra de supressão de alerta).

### 2.3 Falta criar
1. `SportsProfile` (tabela aditiva) — modalidade, frequência, objetivo, suplementos, contexto de coleta (treino <24h?, horário, jejum, doença recente).
2. `ClinicalGoal` (tabela aditiva) — meta por analito: alvo, autor=médico, justificativa, fonte, vigência (`validFrom/validTo`, `supersedesId`), imutável p/ paciente.
3. `DoctorReview` p/ estados "revisado/em acompanhamento/resolvido" de achados (não tocar em `Notification`).
4. Knowledge esportivo (SHBG, LH/FSH, IGF-1, HDL, Hct, ALT/AST/CK, cistatina C, estradiol em andrógenos) — hoje ZERO conteúdo.
5. Variante de pesos da bio-idade sem T (D5).
6. Timeline unificada (exames + substâncias declaradas + atividade) — componente novo.
7. Toggle persistente de dashboard por paciente (hoje só demo de sessão).

---

## 3. Evidências clínicas e limitações (verificadas adversarialmente)

### 3.1 O que a evidência sustenta (produto pode citar como diretriz)
- **Meta terapêutica de TRT ≠ referência do lab**: Endocrine Society 2018 (metade da faixa normal), AUA 2018 (~450-600 ng/dL, tercil médio), SBEM/SBU/ABEMSS 2026 (450-600; 400-700 "dentro da meta"). *Nota honesta: graduação fraca/condicional nas próprias diretrizes — consenso, não evidência forte.*
- **Diagnóstico nunca por exame isolado**: sintomas + 2 dosagens matinais (AUA/SBEM). App só sinaliza "abaixo do cutoff → repetir matinal + médico". Cutoffs divergem (<300 AUA; <264/>350 SBEM; 264-350 → T livre calculada).
- **Hematócrito**: Hct >54% em TRT = protocolo de suspensão/retomada menor (SBEM 2026; ES 2018 concorda). **O limiar de risco real é DESCONHECIDO** (ES textual). 48-54% = zona de atenção contextualizada.
- **PSA**: baseline + 3-12 meses; urologia se >4,0 confirmado ou velocidade anormal.
- **Cadência**: T+Hct em 3, 6, 12 meses e anual (SBEM); cessação a discutir se sintomas não melhoram (AUA Stmt 31).
- **Coleta (EFLM 1B)**: evitar exercício intenso **24h** antes; laboratório deve documentar atividade física recente p/ interpretação (rec. 2.6 — adaptação crônica desloca baselines).
- **Renal em endurance**: 40% de finishers de maratona cumpriram AKIN pós-prova, resolução ~24h; **cistatina C preferida sobre creatinina** p/ eGFR em usuários de androgênios (HAARLEM/JCEM jan-2026) — *n=25, endurance-only*.
- **Monitoramento de AAS (JCEM 2026, grupo HAARLEM)**: hemograma+lipídeos+hepáticas+renal é o painel com respaldo; **"estratégias ótimas de monitoramento não foram definidas"** p/ altas doses contínuas; uso crescente + longo prazo mal compreendido → racional de harm-reduction como estratégia clínica legítima (educativo puro "fica aquém").

### 3.2 O que NÃO existe (dizer claramente no produto)
- **Nenhum "range seguro" validado para Masteron/drostanolona ou qualquer AAS** (verificado 2-1 — paywalled, confirmado por snippets + obra correlata).
- Janela temporal pós-treino de FORÇA p/ CK/TGO/TGP: sem claim sobrevivente (só a regra EFLM 24h; literatura aponta CK alta por 5-7 dias).
- Extrapolhar diretrizes de TRT prescrito p/ autodeclarados = **hipótese de produto**, não evidência.

### 3.3 Claims REFUTADAS pela verificação — PROIBIDO entrar no produto
1. "Resolução em 24h define janela mínima universal de coleta" (generalização indevida do estudo renal).
2. "Harm-reduction HARNAS não comprovado" (enquadramento incorreto do estudo).

### 3.4 Lacunas de pesquisa (pendências)
- **Ângulo regulatório brasileiro (Anvisa RDC 660/2022, CFM, LGPD detalhado) e competitivo/WTP: ZERO claims verificadas** — o workflow não os cobriu. Exigir pesquisa dedicada antes de decisões de go-to-market (D8).
- Vigência: fontes até out/2026 — revalidar em 12-18 meses.

---

## 4. Política de referências, metas e permissões

| Camada | Quem edita | O que é | Como aparece |
|---|---|---|---|
| 1. Referência do lab | Ninguém (imutável, vinculada ao laudo) | `ExamItem.ref*` | Banda sólida + badge alto/baixo — **sempre visível** |
| 2. Meta clínica individual | **Só médico** (via portal, escopo clínico) | `ClinicalGoal` com autor/justificativa/fonte/vigência/supersedes | Banda tracejada distinta + chip "fora da meta clínica" — NUNCA substitui o badge da camada 1 |
| 3. Histórico individual | Sistema (derivado) | Percentis do próprio paciente | Linha de tendência "seu histórico" — rotulado como histórico, jamais "normal" |
| 4. Regras de alerta | Sistema (código revisado clinicamente) | `isAbnormal`/healthNudges | Motor atual INALTERADO pelo modo esportivo |

**Regras duras**:
- Valor dentro da meta mas fora da referência → mostra AMBOS ("atinge a meta clínica; permanece fora da referência do laboratório").
- IA pode SUGERIR ao médico criar meta ("diretrizes citam alvo 450-600 em TRT — deseja configurar?") — nunca cria sozinha, nunca p/ paciente.
- Referência ausente → "sem régua do laboratório" (sem meta substituta). Unidades incompatíveis/métodos diferentes → bloquear comparação direta na tendência (chip "métodos diferentes") — hoje `method` NÃO existe em ExamItem (§2.3: adicionar coluna aditiva `method` extraída quando o laudo traz).
- Contexto declarado (treino/creatina/hormônio) **aparece como texto de contexto**, nunca como supressor de alerta.
- Auditoria: toda criação/edição de meta → `auditLog` com autor/timestamp/diff.

---

## 5. Dashboard "Saúde Esportiva" + experiência médica (proposta UX)

### Modo paciente (toggle no Perfil, persistido; padrão OFF)
```
┌──────────────────────────────────────┐
│ ⚠️ Alertas e pendências (topo,        │  motor atual — inalterado
│    ícone+texto, não só cor)           │
├──────────────────────────────────────┤
│ HEMATÓCRITO 54,2% ▲ fora da ref      │  badge régua (sempre) +
│ [régua lab ▓▓▓|▓░░] meta clínica ╌╌  │  banda meta tracejada
│ contexto: TRT desde 03/26 · coleta   │  + chip contexto declarado
│ 14h · treino <24h                     │
├──────────────────────────────────────┤
│ Tendências por domínio (chips):       │
│ [Hormonal] [Cardiomet] [Hepático]     │  prioritárias p/ perfil
│ [Renal] [Hemograma]                   │  declarado
├──────────────────────────────────────┤
│ Linha do tempo (exames + substâncias │  componente novo
│ declaradas + atividade HC)            │
├──────────────────────────────────────┤
│ Plano do médico / observações         │  DoctorNote (existe)
├──────────────────────────────────────┤
│ Recuperação/atividade (se HC on)      │  ActivityCard (existe)
└──────────────────────────────────────┘
```
- Mobile-first (320-430px), sem scroll horizontal (Android + Safari iOS — régua do audit mobile 04/10), datas legíveis, alertas com ícone+texto.
- **Sem**: ranking de T, medalhas hormonais, score de "uso seguro". Bio-idade escondida ou com variante sem-T + caveat (D5).
- Estados: sem dados ("declare seu perfil esportivo"), dados antigos (chip temporal — `temporalThresholds` existe), informação não confirmada ("declarado pelo paciente").
- Personalização: reordenação de cards (localStorage por paciente no MVP).

### Modo médico (portal)
- Aba/escopo opcional `sports`: exames com contexto esportivo + histórico de exposição declarado + contexto de coleta.
- CRUD de `ClinicalGoal` com justificativa obrigatória.
- Estados de achado: `revisado` / `em acompanhamento` / `resolvido` (auditável, nunca apaga).
- Plano de acompanhamento (DoctorNote estendido) compartilhável.
- Privacidade: sem share automático de hormônios/sintomas p/ terceiros; escopo explícito só.

---

## 6. Arquitetura e alterações

```
FLAG: AppSetting sportsMode {enabled:false} (kill-switch live, padrão motd)
OPT-IN: SportsProfile 1:1 Patient (nullable → paciente normal = NULL)
                │
   ┌────────────┼─────────────────────────┐
   ▼            ▼                         ▼
Contexto IA  Dashboard modo            ClinicalGoal (médico-only)
(system-prompt   (swap por flag,        (camada 2; portal+API com
 ADDENDUM só     padrão demo)            requireRole doctor + audit)
 com modo on)
```
- **APIs novas**: `GET/PUT /sports/profile` (paciente, opt-in), `GET/POST /doctor/clinical-goals` (+`DELETE` = expira, não remove), `GET /doctor/reviews`. Todas atrás de auth; metas rejeitam papel paciente (teste E2E).
- **Motor**: camadas 1/3/4 existem; camada 2 = nova (query ClinicalGoal vigente por analito; render como banda extra). Alertas intocados.
- **IA**: addendum de system prompt (só modo on): contexto declarado + regras reforçadas (proibido doses/ciclos/TPC/faixas seguras; sempre preparar perguntas pro médico). `knowledge/sports/*.md` no fluxo de citação existente. Testes de guard novos (casos negativos do §10).
- **Bio-idade**: `BIO_AGE_MARKERS` vira função do perfil (excluir T quando hormônio declarado) — tabela data-driven já existe.
- **Compatibilidade**: tudo aditivo; `SELECT` explícito em queries novas (drift gate); agregados filtram `status:'EXTRACTED'`.
- **Rollback**: `sportsMode.enabled=false` desliga tudo (UI + addendum IA) sem deploy; dados declarados permanecem guardados (LGPD: usuário pode excluir via fluxo existente).

## 7. Backlog — ver `BACKLOG.md` (épicos E1-E6, stories com AC, MVP/Fase2/Futuro, estimativas com premissas)

## 8. Piloto, métricas e validação
- **Piloto**: 20-50 pacientes auto-declarados (TRT acompanhado + musculação), 4-8 semanas, flag account-level. Gate clínico: revisão por médico parceiro de TODO conteúdo esportivo (knowledge + prompts + copy) antes do piloto.
- **Métricas de produto**: ativação do modo, retenção D30, nº de metas criadas por médico, perguntas de consulta geradas, CSAT. **Métricas de segurança** (mais importantes): zero alerta suprimido (teste automático), zero resposta de IA com dose/ciclo (guard+auditoria amostral semanal), taxa de "fora da referência" exibida = 100%.
- **Testes**: ver BACKLOG E6 (10 famílias do §10 do brief mapeadas em vitest/E2E/Playwright + checklist de revisão clínica).

## 9. Riscos, dependências e decisões pendentes
| Risco/pendência | Mitigação |
|---|---|
| **Enquadramento Anvisa/CFM não pesquisado** (D8) | Pesquisa jurídica dedicada ANTES de go-to-market; piloto interno com consentimento; conteúdo revisado por médico |
| Guard da IA colide com wording esportivo | Guard permanece; conteúdo nasce "educativo-comparativo"; testes negativos no CI |
| Unidades/escala (SHBG nmol/L, IGF-1) | Testes de unidade ANTES de tendência/score (padrão normalize.test.ts) |
| Relay GLM: contexto maior trunca resumo | Medir tokens; knowledge esportivo entra sob demanda por analito, não wholesale |
| Extrapolação TRT→AAS | Product copy explícito: "diretrizes citadas referem-se a uso prescrito" |
| Bio-idade/score sem validação no público | Variante sem-T + caveat; métrica de confusão no piloto |

## 10. Fontes (consultadas 06/10/2026; verificação 3-votos)
- Endocrine Society TRT Guideline — JCEM 2018 (Bhasin et al.) — academic.oup.com/jcem/article/103/5/1715/4939465
- AUA Testosterone Deficiency Guideline 2018 — auanet.org/guidelines-and-quality/guidelines/testosterone-deficiency-guideline
- SBEM/SBU/ABEMSS 2026 — pmc.ncbi.nlm.nih.gov/articles/PMC13124176/
- Smit et al., "Approach to the Young Male Patient Who Abuses Androgens: Harm Reduction as a Clinical Strategy" — JCEM jan/2026 (grupo HAARLEM)
- Smit 2024, Performance Enhancement & Health (racional de monitoramento)
- EFLM-COLABIOCLI, recomendações de coleta venosa — Clin Chem Lab Med 2018 (rec. 2.4 grau 1B; 2.6)
- McCullough 2011 (maratona/AKIN, n=25)
- Código: mapeamento interno com arquivo:linha (§2)
