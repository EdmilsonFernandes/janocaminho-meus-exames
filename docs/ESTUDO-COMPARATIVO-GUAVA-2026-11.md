# Estudo Comparativo: Dr. Exame × Guava Health

> **Data:** 21/11/2026 · **Fontes Guava:** guavahealth.com (home, health-insights, prepare-for-visits, provider-dashboard, faq, plans, emergency-card — lidas em 21/11/26) · **Fontes Dr. Exame:** código-fonte (44 rotas server, 83 telas web) + memórias de sessão

---

## 0. Resumo Executivo (30 segundos)

**Guava é um app de *tracking* com IA por cima. Dr. Exame é um app de *interpretação* com IA no núcleo.**

O produto deles vive de: log diário (sintoma/comida/med) → correlações estatísticas → sync com 100k+ portais/labs dos EUA. O nosso vive de: upload de exame → extração+interpretação IA → chat contextual + loop com médico.

**Onde ganhamos:** interpretação profunda em PT-BR, teleconsulta, portal médico brasileiro (CRM/PIX), radar hormonal, preço, monetização flexível, CID-10 DATASUS.
**Onde perdemos:** camada de dados diários (sintomas, humor, comida), motor de correlações, cartão de emergência com QR público, visit prep empacotado, ciclo menstrual, sync com laboratórios.

**A jogada estratégica:** nós já temos o que eles NÃO têm — IA que raciocina sobre o prontuário inteiro (labs + meds + perfil clínico). O que falta é **dados diários entrando** para essa IA racionar. O Diário de Sintomas + Correlações com IA (topos 1 e 2 abaixo) transforma nosso maior ativo (motor de IA) no diferencial que estatística deles não alcança.

---

## 1. O que é a Guava (perfil do concorrente)

| Dimensão | Guava Health |
|---|---|
| Posicionamento | "Personal health tracker" para crônicos, cuidadores, busca de diagnóstico e wellness |
| Plataforma | iOS + Android + Web + **PWA** |
| Modelos | Freemium (Free + Premium + Family Plan; preço não capturado — página renderiza JS) |
| Idiomas | 20+, extração de exames em "qualquer idioma principal" via IA generativa |
| Públicos-alvo declarados | 4 personas ilustradas: doença crônica / cuidar de alguém / buscando diagnóstico / otimizar saúde |
| Mercado | EUA-first (sync Quest, Labcorp, MyChart, Epic, Cerner, Medicare, VA); "worldwide" como fallback |
| Prova social | Depoimentos fortes (comunidade crônica/Lyme/POTS), 100k+ pacientes citados na página B2B |

**Funcionalidades nucleares (todas citadas nas páginas oficiais):**
1. **Lab Results** — extração de PDF/foto "em milhares de formatos e múltiplos idiomas"
2. **Symptom tracking diário** + mood/energy + bowel etc.
3. **Medications** — uso e lembretes
4. **Cycle & Pregnancy**
5. **Imaging** — MRI/X-ray/CT guardados
6. **Doctor Notes** — notas de consulta
7. **Device Metrics** — steps, HR, sono, glicose, BP (Fitbit, Garmin, Withings, Oura, WHOOP, Dexcom, Apple, Google)
8. **Health Insights** — correlações sintoma×fator (café, clima/pressão atmosférica, comida, yoga, álcool×HRV…), Auto-Correlations no Premium, "pin" correlações monitoradas
9. **Visit Prep** — resumo imprimível para consulta, tradução de sintomas em "termos de médico", priorização de perguntas
10. **Emergency Card** — cartão físico de carteira com **QR code** que socorrista escaneia SEM app (meds, alergias, condições, contatos; auto-atualiza)
11. **Guava Tags** (etiquetas personalizadas de organização)
12. **Provider Dashboard** (B2B) — timeline por paciente, highlights próativos, correlações, **Guava Assistant** IA, **custom health scores e target ranges definidos pelo médico por paciente**, relatórios
13. **Guava Assistant** (Premium) — IA que prepara visita, entra dados, navega os dados
14. **Photo AI** detecta nutrientes de comida (Premium)
15. **Community Insights Hub** — correlações públicas anonimizadas
16. **Import CCDA** (formato de intercâmbio médico EUA)
17. **Export CSV** de tudo que foi logado
18. **Guia/clipping de despesas** (insurance bills citadas no FAQ)

---

## 2. Inventario Dr. Exame (o que EXISTE hoje — verificado no código)

### Server (44 rotas em `packages/server/src/routes/`)
`exam` (extração IA) · `analysis` (resumo/dashboards) · `chat` (IA contextual) · `risk` (fatores) · `doctor` + `doctor-share` + `doctor-verification` + `doctor-question` (perguntas ao médico) · `teleconsulta` + `teleconsultaQueue` + `my-consultations` + `consult-summary` · `medication` (interações) · `vaccine` · `measurement` (peso/altura/PA) · `body-composition` (bioimpedância) · `sinais`/device (Health Connect: sono, passos, FC, calorias) · `mental-screening` (PHQ-9/GAD-7) · `hormone-dose` + radar hormonal · `sports` (saúde esportiva) · `expense` (gastos médicos) · `collection`/`item` (exames solicitados) · `examRequest` · `labs`/`pharmacy`/`specialists` (diretórios) · `my-doctors` (vínculo privado) · `reminder` · `notification` (push) · `billing` + Asaas/OpenPix + `public-api` (ledger pré-pago) · `decifre` (funil público) · `uaiid-webhook` (KYC) · `family` (multi-perfil)

### Web (83 telas)
Dashboard V2 · Evolution (timeline por marcador) · ValoresAlterados · Trends · Timeline · ConsolidatedReport · **EmergencyCard** (ficha com meds/alergias/SOS/impressão — **sem QR público**) · Questions (perguntas pro médico) · Chat · DoctorPortal (espelho paciente + brief clínico) · MinhasConsultas · Teleconsulta · Family · Expenses · Vaccines · Measurements · Sinais · RadarHormonal · SaudeMental · BodyComposition · Medications · Conquistas · Reminders · Notifications · Landing/Features/Plans/Faq…

### Capacidades transversais
Extração pdftotext/OCR→GLM com Zod guards · multi-exame por PDF · split/merge · CID-10 DATASUS (12.451) · brief clínico pré-consulta com carimbo IA (CFM 2.454) · failover multi-provider IA (GLM⇄Gemini) · 2ª opinião automática na extração · LGPD (PII pgcrypto, PDFs fora do DB, export via `data.routes`) · push FCM · offline-first (fetch-cache) · API pública v1

---

## 3. Matriz Comparativa

Classificação: **A** = temos e somos melhores · **B** = temos equivalente · **C** = temos parcial/inferior · **D** = não temos, viável · **E** = não temos, inviável/alto risco no BR · **F** = não temos e **não devemos** (foco)

| # | Funcionalidade | Guava | Dr. Exame | Nota | Fonte Guava |
|---|---|---|---|---|---|
| 1 | Extração de exames (PDF/foto) | ✅ multi-idioma | ✅ multi-exame, guards, 2ª opinião | **B** (eles: mais idiomas; nós: qualidade PT-BR + split) | home "Centralize your lab results" |
| 2 | **Interpretação IA do exame** (o que significa p/ VOCÊ) | ⚠️ Assistant genérico | ✅ chat contextual + radar + score | **A** — nosso núcleo, eles não interpretam labs | provider-dashboard (só B2B) |
| 3 | Evolução por marcador + faixas | ✅ charts interativos | ✅ Evolution + Trends | **B** | home |
| 4 | **Sintomas: log diário** | ✅ núcleo do produto | ❌ não existe | **D** — maior gap | health-insights |
| 5 | **Humor/energia diário** | ✅ | ⚠️ PHQ-9 esporádico | **C→D** | faq |
| 6 | **Correlações sintoma×fator** | ✅ estatístico + Auto | ❌ | **D** — e podemos fazer MELHOR (IA sobre labs+contexto) | health-insights |
| 7 | Clima/pressão atmosférica | ✅ automático | ❌ | **D** (Open-Meteo grátis) | health-insights |
| 8 | Comida/café/álcool (log) | ✅ + Photo AI nutrientes | ❌ FoodGuide é conteúdo | **D** (começar leve) | plans/faq |
| 9 | Ciclo & gravidez | ✅ | ❌ | **D** — público feminino >60% engajamento | home |
| 10 | Medicamentos + interações | ✅ lista | ✅ **+ alertas de interação** | **A** | faq |
| 11 | Vacinas | ✅ | ✅ | **B** | faq |
| 12 | Wearables/devices | ✅ 15+ fontes | ⚠️ Health Connect (Android) | **C** — iOS/Apple Health falta | home |
| 13 | Sync portais/labs (EHR) | ✅ 100k+ provedores | ❌ | **E** — TISS/RNDS fechados no BR; upload manual é o plano | home |
| 14 | Import CCDA | ✅ | ❌ | **F** — padrão EUA, irrelevante no BR | faq |
| 15 | **Emergency card com QR público** | ✅ cartão físico, socorrista sem app | ⚠️ ficha no app + print, sem QR | **D** — esforço baixo, impacto alto | emergency-card |
| 16 | **Visit Prep empacotado** | ✅ produto dedicado | ⚠️ peças soltas (Questions + ConsolidatedReport + brief) | **C→D** — montar o pacote | prepare-for-visits |
| 17 | Teleconsulta | ❌ zero | ✅ vídeo+fila+PIX+recorrência | **A** — não concorrem | — |
| 18 | Portal médico | ⚠️ B2B (Provider Dashboard) | ✅ CRM brasileiro, convite, cobre | **A** no BR | provider-dashboard |
| 19 | **Custom health scores pelo médico** | ✅ targets por paciente | ⚠️ score fixo da IA | **C→D** — diferencial Pro | provider-dashboard |
| 20 | AI Assistant conversacional | ⚠️ Premium, nav de dados | ✅ chat com prontuário inteiro | **A** | plans |
| 21 | Multi-idioma | ✅ 20+ | ⚠️ PT-BR + EN | **C** — ES é a expansão natural | faq |
| 22 | PWA instalável | ✅ | ⚠️ APK + web | **C** | faq |
| 23 | Export CSV/PDF | ✅ CSV tudo + PDF por seção | ⚠️ export LGPD + relatório consolidado | **C** | faq |
| 24 | Compartilhar com médico/família | ✅ email/link dinâmico | ✅ DoctorShare com escopos+PIN+expira | **B** | faq |
| 25 | Multi-perfil família | ✅ (Premium: managers ilimitados) | ✅ Family | **B** | plans |
| 26 | Photo AI de nutrientes | ✅ Premium | ❌ | **F** por enquanto (foco) | plans |
| 27 | Community insights públicos | ✅ Hub | ❌ | **F** — risco LGPD/reputação, não copiar | health-insights |
| 28 | Gastos de saúde | ⚠️ insurance bills | ✅ Expenses | **A** no BR (nossas despesas são out-of-pocket) | faq |
| 29 | Saúde mental | ❌ | ✅ PHQ-9/GAD-7 | **A** | — |
| 30 | Bioimpedância/composição | ❌ | ✅ BodyComposition | **A** | — |
| 31 | Radar hormonal | ❌ | ✅ | **A** | — |
| 32 | CID-10 DATASUS integrado | ❌ | ✅ 12.451 códigos | **A** | — |
| 33 | Monetização | Free/Premium/Family | Créditos + planos + pacotes + API pré-paga | **A** em flexibilidade | plans |
| 34 | Diretório de especialistas | ❌ | ✅ EncontrarEspecialistas | **A** | — |
| 35 | API pública | ⚠️ "API/Health Wallet" (link) | ✅ v1 + ledger | **B** | footer |

**Placar:** A=12 · B=6 · C=6 · D=7 · E=1 · F=3 (dentro dos D, os topos 1-2 abaixo são a jogada)

---

## 4. Ícones e linguagem visual (o que o dono pediu de estudar)

**Guava:** personas ilustradas (4 cards na home: crônico/cuidador/diagnóstico/wellness com ilustração própria), ícones de categoria coloridos e arredondados por tipo (labs/ciclo/imaging/meds/sintomas), Poppins como fonte (mesma família que já usamos!), páginas de marketing com mockups de phone reais.

**Dr. Exame:** robô mascote (identidade MAIS forte e memorável que a deles — não mexer), ReUI frame/badge/icon-tile já padronizados, teal #20b2aa assinatura, MUI icons v7.

**Veredito ícones:**
1. **Não copiar os ícones deles.** O mascote robô é um ativo superior — Guava é visualmente genérica (parece template SaaS health). Nosso problema nunca foi identidade, é descoberta.
2. **Roubar o padrão, não o desenho:** os 4 cards de persona da home deles são um ótimo padrão de ONBOARDING — "Você está aqui para…" (Entender meus exames / Cuidar de alguém / Acompanhar tratamento / Melhorar saúde). Adaptar com nosso robô nas 4 poses. Custo baixo (já temos piloto Lottie).
3. **Category icons por tipo de dado** (como eles fazem labs/ciclo/imaging): nosso Menu já usa IconTile — padronizar 1 ícone+cor por domínio (exame=teal, sinais=azul, meds=cobre, menta=roxo) e repetir em TODAS as telas do domínio. Consistência > novidade.

---

## 5. As 10 Oportunidades Priorizadas (impacto × esforço × encaixe)

| # | Oportunidade | Por quê | Esforço | Class. atual→alvo |
|---|---|---|---|---|
| **1** | **Diário de Sintomas + Humor (1-tap)** — chips de sintomas comuns + intensidade, mood 5 faces, 15s/dia | Fundação de TUDO: sem dados diários não há correlação, não há contexto pro chat, não há retenção diária (nosso cliff é dia 0). Guava construiu o produto inteiro em cima disso. | Médio (model + tela + push streak) | D→A |
| **2** | **"Por que me sinto assim?" — Correlações com IA** | Nosso diferencial vs Guava: eles fazem estatística sobre logs; nós cruzamos logs COM LABS + MEDS + PERFIL CLÍNICO via IA. Pergunta em linguagem natural → análise "seu cansaço sobe 2 dias depois de dormir <6h e seu ferritin está no fundo da faixa". Estatística deles não chega lá. | Médio (usa chat existente + contexto) | D→A |
| **3** | **Cartão de Emergência com QR público** — PDF/cartela imprimível + QR → página pública read-only (meds/alergias/contatos/sangue) sem login | Guava tem (e é o hit de marketing deles — socorristas recomendam). No Brasil com mães/idosos/viagem isso é compartilhável em grupo de família. Já temos TODOS os dados e a ficha — falta só a rota pública + QR + PDF. | **Baixo** | C→A |
| **4** | **"Preparar Consulta" empacotado** — juntar Questions + ConsolidatedReport + brief clínico num fluxo único: escolhe médico/data → gera resumo 1 página + perguntas priorizadas → imprime/PDF/share | Visit Prep é o produto mais elogiado da Guava ("advocado no bolso"). Nós temos as peças soltas — empacotar é barato e o valor percebido é altíssimo (e alimenta o loop médico, que é nosso funil Pro). | **Baixo** | C→A |
| **5** | **Clima × sintomas automático** — Open-Meteo/INMET grátis, geo do CEP, correlação com dor de cabeça/artrose/asma | Fator que a Guava usa como argumento (pressão atmosférica×enxaqueca é o depoimento #1 deles). Depende do topo 1. | Baixo (após #1) | D→B |
| **6** | **Ciclo menstrual** — log leve (fluxo/sintomas), correlaciona com humor e labs (radar hormonal já é nosso!) | Público feminino = maioria de health apps; radar hormonal fica 2× mais útil. Guava tem, nós temos o diferencial hormonal pronto. | Médio | D→B |
| **7** | **Export PDF por seção** — lista de meds ativos, carteirinha de vacinas, resumo de alterados | Guava exporta PDF por tipo; nós só o consolidado. É "imprimir pra levar no médico" = mesma jornada do topo 4. | Baixo | C→B |
| **8** | **Targets personalizados pelo médico (Pro)** — médico define faixas-alvo por marcador do paciente (ex.: ferritin ótimo >50, não só "na faixa") | Guava vende isso pro provider B2B. Para nós é diferencial do plano Pro do médico (retenção B2B) e usa portal existente. | Médio | C→A |
| **9** | **Onboarding por persona** (padrão Guava com nosso robô) | 4 tiles na primeira sessão → personaliza dashboard e copy. Melhora ativação (20% hoje) e marketing. | Baixo | — |
| **10** | **Apple Health / iOS** | Hoje só Health Connect (Android). iOS é ~40% do Brasil urbano classe A (nosso público pagante). Capacitor tem plugin HealthKit. | Alto | C→B |

**Descartadas deliberadamente (F):** sync com portais/labs BR (TISS/RNDS fechados, E no mapa), CCDA (padrão EUA), Community insights públicos (risco LGPD/reputação sem ganho real), Photo AI nutrientes (escopo).

---

## 6. Top 3 Recomendadas (ordem de execução)

### 🥇 1+2 juntos: Diário + Correlações com IA
É a única lacuna que muda a CATEGORIA do produto (de "aplicativo de exame" a "companheiro diário de saúde"). Sem ela, somos consulta-esporádica; com ela, temos razão para abrir o app TODOS os dias — e a IA que já construímos (chat, radar, contexto) vira o motor de um insight que a Guava estruturalmente não entrega (estatística sem labs). Começar MVP: 8 sintomas-chip + mood + nota, tela única, streak leve.

### 🥈 3: Cartão QR de emergência
Esforço baixíssimo para o estoque de dados que já existe, apelo emocional altíssimo, marketing orgânico (todo grupo de família jáPrinta). Único cuidado: página pública read-only com token opaco + rate-limit, SEM dados identificáveis além do necessário (nome+sangue+alergias+meds+contato).

### 🥉 4: Preparar Consulta
Cola o paciente no loop médico (nosso funil Pro), usa 100% de peças existentes, e compete de igual pra igual com o produto mais amado da concorrente.

---

## 7. Riscos e Salvaguardas

| Risco | Salvaguarda |
|---|---|
| Correlações virarem "diagnóstico" (CFM/ANVISA) | Disclaimer padrão + diagnosticGuard (já existe no chat) — correlação ≠ causalidade, sempre com "levarei ao médico" |
| Diário virar app de produtividade abandoned | Streak leve + push contextual + integração IMEDIATA no chat ("como você está hoje?" contextual) |
| QR público vazar dados | Token opaco unguessable + expiry renovável + campo "mostrar no cartão" opt-in por item + zero CPF/diagnósticos |
| Escopo explodir (Guava tem 5 anos de produto) | Fazer 1+2+3+4 e PARAR. Os topos 5-10 só entram com dado de uso justificando |

---

## 8. Fontes Guava (verificação)

Todas as claims da Guava citam as páginas oficiais lidas em 21/11/2026:
- `guavahealth.com/` — features, personas, 100k+ provedores, idiomas, privacidade HIPAA/GDPR
- `guavahealth.com/health-insights` — correlações, fatores (clima/café/comida/yoga/álcool×HRV), Auto-Correlations Premium, Insights Hub
- `guavahealth.com/prepare-for-visits` — Visit Prep, priorização de perguntas, depoimentos
- `guavahealth.com/provider-dashboard` — Provider Dashboard B2B, custom health scores, Guava Assistant, highlights
- `guavahealth.com/faq` — tipos de dado, CCDA, dispositivos, idiomas, formas de share, CSV
- `guavahealth.com/plans` — Free vs Premium (Emergency Card, auto insights, detecção de labs, Assistant, Photo AI), Family Plan (preço renderiza via JS — não capturado)
- `guavahealth.com/emergency-card` — cartão QR, socorrista sem app, comparativo vs papel/brinco
