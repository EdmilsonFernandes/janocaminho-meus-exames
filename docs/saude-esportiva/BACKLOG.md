# BACKLOG — Saúde Esportiva (épicos, stories, critérios de aceite)

> Premissa de estimativa: 1 dev-agent dedicado, código mapeado, padrões existentes. P=dias. Toda story: suíte atual verde SEM edit + `tsc` server/web limpos + novos testes.

## MVP (piloto interno)

### E1 — Fundação (flag + perfil declarado) — ~3P
- [ ] E1.1 `AppSetting sportsMode{enabled}` + kill-switch `sportsModeEnabled()` (settings.ts:8-77 padrão motd; NÃO expor em public/config ainda) · **AC**: default false; admin liga/desliga live; teste de default.
- [ ] E1.2 Migration aditiva `SportsProfile` (patientId unique, modality, trainingFreq, goals, supplements Jsonb, collectionContext Jsonb, updatedAt) · **AC**: `IF NOT EXISTS`; nada em Patient; prisma db push test ok.
- [ ] E1.3 `GET/PUT /sports/profile` (requireAuth, dono apenas) · **AC**: paciente A não lê perfil de B (403); campos opcionais; teste E2E.
- [ ] E1.4 Substância declarada via `Medication` (form no modo esportivo: princípio ativo/nome comercial/formulação/via/período/última dose — texto em dosage/notes; categoria "hormônio/suplemento" como prefixo de name) · **AC**: aparece em medications-context do chat; interação T×Hb já cruza; zero migration.
- [ ] E1.5 Toggle "Saúde Esportiva" no Perfil (persistido por paciente, `useStore`) · **AC**: off = dashboard idêntico ao atual (screenshot diff); on = nada quebra em 390px.

### E2 — Política de referências (4 camadas) — ~4P
- [ ] E2.1 Migration `ClinicalGoal` (patientId, analyte, unit, targetLow/High, setByDoctorId, justification, source, validFrom/To, supersedesId) · **AC**: aditiva; auditoria em audit.ts.
- [ ] E2.2 API médico: `GET/POST /doctor/clinical-goals`, expiração via validTo (nunca DELETE físico) · **AC**: **paciente recebe 403** (teste E2E explícito); médico só do share ativo; justificativa obrigatória (400 sem).
- [ ] E2.3 Render: banda meta tracejada + chip "fora da meta clínica" em Evolution/Trends/ExamShow, SEM remover badge régua · **AC**: valor fora da ref E dentro da meta mostra os DOIS; teste Playwright do duplo-estado; teste unitário: meta nunca altera `isAbnormal`/healthNudges.
- [ ] E2.4 Coluna `method` (String?) em ExamItem (aditiva; extração preenche quando laudo traz) + chip "métodos diferentes" bloqueando comparação na tendência · **AC**: migration IF NOT EXISTS; teste de não-comparação.
- [ ] E2.5 Sugestão de meta pela IA → aparece como card ao MÉDICO ("diretriz TRT cita 450-600 — configurar?") · **AC**: paciente não vê; IA nunca escreve a meta sozinha.

### E3 — Interpretação esportiva (IA + knowledge) — ~5P *(gate: revisão médica prévia)*
- [ ] E3.1 `knowledge/sports/`: HEMATOCRITO_TRt, TESTOSTERONA_TRt, SHBG, LH_FSH, HDL_ANDROGENOS, ALT_AST_CK_EXERCICIO, CISTATINA_C, ESTRADIOL_ANDROGENOS — formato guidelines/*.md com citação e vigência · **AC**: cada arquivo cita fonte+data; revisão médica assinada (checklist).
- [ ] E3.2 System-prompt ADDENDUM só com modo on: injeta perfil esportivo+substâncias declaradas+contexto de coleta; reforça proibições (doses/ciclos/TPC/faixa segura AAS); "diretrizes citadas referem-se a uso prescrito" quando aplicável · **AC**: guard passa; testes negativos (§E6.4).
- [ ] E3.3 Bloco de contexto no resumo (health-summary): "CONTEXTO ESPORTIVO DECLARADO" separado de condições clínicas · **AC**: sem token overflow (medir); off = prompt byte-idêntico ao atual (teste).
- [ ] E3.4 Bio-idade variante sem marcadores de T quando hormônio declarado + caveat textual · **AC**: paciente normal = resultado idêntico (teste); esportivo c/ T declarada = sem T nos pesos.
- [ ] E3.5 Canônicos/unidades: SHBG, IGF-1, LH, FSH, cistatina C (SYNONYMS + factors + testes normalize.test.ts) · **AC**: escala falsa coberta; régua do lab preservada.

### E4 — Dashboard "Saúde Esportiva" — ~4P
- [ ] E4.1 Swap por flag (padrão demo DashboardV2:732): SportsDashboard com alertas topo (motor atual), cards de domínio (hormonal/cardiomet/hepático/renal/hemograma), tendências prioritárias por perfil · **AC**: 320/390/768/1440 sem overflow; alertas 100% presentes; dark/light.
- [ ] E4.2 Card de resultado com 3 camadas visuais (régua sólida + meta tracejada + histórico) + chips de contexto (coleta/treino<24h/última dose) · **AC**: contraste AA; não-só-cor (ícone+texto); datas legíveis.
- [ ] E4.3 Timeline unificada (exames + substâncias + atividade HC) · **AC**: vazio elegante; dados antigos marcados; HC ausente ≠ zero (teste).
- [ ] E4.4 Reordenação de cards (localStorage por paciente) + estados vazios · **AC**: persiste; reset funciona.
- [ ] E4.5 Wireframes → QA Playwright (webkit-390/mobile-320 specs existentes do audit 04/10) · **AC: zero scroll horizontal Android+iOS Safari**.

### E5 — Portal médico esportivo — ~3P
- [ ] E5.1 Escopo opcional `sports` (scopes + gate DoctorPortal:119) · **AC**: sem o escopo, médico não vê contexto esportivo; custo em créditos se optar (padrão settings shares).
- [ ] E5.2 `DoctorReview` (revisado/em acompanhamento/resolvido) por achado · **AC**: nunca apaga; auditável; filtra pendências.
- [ ] E5.3 Plano de acompanhamento (DoctorNote estendido) + checklist educativo de monitoramento TRT (3/6/12m Hct+PSA — como sugestão de AGENDA, citando diretriz) · **AC**: wording revisado por médico; sem prescrição.

## Fase 2 (~após piloto)
- Sonografia/recolha de sono e treino de força (HC tipos novos) · Metas sugeridas por padrão de resposta (longitudinal) · Compartilhamento seletivo de contexto p/ educador físico (SEM hormônios/laudos) · PWA offline dos cards esportivos · i18n EN dos textos novos.

> **Decisão (dono, 06/10)**: Saúde Esportiva é **PREMIUM desde o dia 1** (E1.5 já gated por `usePremium()`; "modo esportivo" entra nos perks premium em settings `premium.perks`).

## Futuro
- Pesquisa jurídica Anvisa/CFM → eventual registro · Parcerias c/ clínicas de TRT e medicina esportiva · Estudo observacional publicado (dados anonimizados, LGPD/consentimento).

## E6 — Validação (por família do brief §10)
| Teste | Tipo | Onde |
|---|---|---|
| Ativar modo não esconde alteração | unit+E2E | healthNudges/health-state intocados c/ sportsProfile ativo; 100% flags preservadas |
| Meta ≠ referência | unit+Playwright | E2.3 duplo-estado |
| Paciente não edita config clínica | E2E 403 | /doctor/clinical-goals como paciente |
| Permissões/revogação | E2E | share sports revoke |
| Conversão/OCR errado não conclui | unit | units/normalize esportivos (scale falsa) |
| Métodos diferentes não comparam | unit | E2.4 |
| Treino/creatina não cancela alerta | unit+E2E | contexto é texto, nunca supressor |
| IA não inventa faixa/dose | guard tests | casos negativos: masteron range, TPC, dose semanal → bloqueados |
| Wearable ausente ≠ zero | unit | timeline |
| Dashboard multiplataforma | Playwright | webkit-390/mobile-320 (specs existentes) |
| **Revisão clínica** | checklist humano | TODO conteúdo E3/E5 assinado por médico antes do piloto |
