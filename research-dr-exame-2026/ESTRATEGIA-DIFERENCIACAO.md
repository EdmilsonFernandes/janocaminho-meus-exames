# Dr. Exame — Estratégia de Diferenciação
### Baseada em 22 pesquisas profundas (global + Brasil), ago/2026 · `results/*.json` + `report.md`

> **A pergunta:** o que um projeto pequeno pode oferecer pra competir e sair à frente?
> **A resposta em uma linha:** ninguém — nem os gigantes — ocupa o triângulo **família de verdade + WhatsApp + armar o médico**, com **confiança estrutural** e **preço brasileiro**. O Dr. Exame já tem 70% disso construído.

---

## 1. O campo de batalha (o que a pesquisa mostrou)

| Grupo | Quem | O que eles fazem | O que NÃO fazem |
|---|---|---|---|
| **Labs BR** | Fleury, Dasa/Nav, Sabin, Hermes | Entregam resultado (85% do Fleury sem intervenção humana — em lógica legada); IA 100% back-office; jardins murados (só exames próprios) | Interpretação pro paciente, upload de PDF externo, família além de "ver resultados", tendência entre labs |
| **Intérpretes BR** | CalcLab, BloodGPT, Kantesti, ExamesIA, Dr IA | CalcLab/BloodGPT foram pro **B2B**; Kantesti = freemium agressivo com SEO; ExamesIA/Dr IA = improvisos de tração zero | Família, médico, WhatsApp, LGPD de verdade, PIX (Kantesti cobra em USD/cripto!) |
| **Globais** | Function, Superpower, InsideTracker, Mito, Geviti, Marek, Levels, Oura, SiPhox, Nucleus | Price war nos EUA ($499→$365→$199); margem migrou pro **action-loop** (suplementos/TRT/peptídeos/marketplace); 18+ only; EUA only | Família/dependentes, brief de médico (Superpower nem exporta PDF!), BR, WhatsApp |
| **Plataformas** | Apple, Google | Coach IA da Apple **atrasado** pra iOS 27.4 (2027) e virou grátis; HC Medical Records em beta (FHIR, sem DiagnosticReport) | Trilhos BR vazios — nenhum lab brasileiro escreve FHIR |
| **Governo** | Meu SUS/RNDS | 29M usuários/mês, CPF = chave universal, 75M exames na RNDS; REL só COVID/mpox | Interpretação, tendências, família — e treina a nação a esperar exame no celular |
| **A sombra** | ChatGPT/Gemini grátis | 35,4% dos BR conectados já colaram exame em IA; GPT-5 sem contexto: 79% (vs 93% com); 52% sub-triagem de emergências; 4/6 LLMs piores em não-inglês | Contexto, memória, família, determinismo, responsabilidade LGPD, loop com médico |

**Padrão único nos 22:** a **primeira interpretação** virou commodity (grátis ou quase). O que ninguém entrega é o que vem **antes** (contexto familiar) e **depois** (ação, médico, memória entre exames).

---

## 2. Os 7 diferenciais que NINGUÉM ocupa

### D1 · Família de verdade — o pilar mais raro do mercado
- Function/Superpower/Mito/Levels/Marek/InsideTracker: **18+, single-user**. Zero dependentes, zero cuidador, zero faixa pediátrica.
- Dasa: dependentes = só "ver resultados". Kantesti: assentos de billing. Nucleus: família = planejamento embrião de US$9.999 (e processo federal).
- **O Dr. Exame já tem**: dependentes com histórico próprio, score familiar, comparativo entre membros.
- **Lacuna a fechar**: modo cuidador (mãe gerencia filho+avó), faixas pediátricas nos itens, risco hereditário simples ("filho da mãe com hipotireoidismo → monitorar TSH").

### D2 · WhatsApp como trilho de retenção — o canal que o BR já elegeu
- Prova histórica: Hermes Pardini entrega resultado por WhatsApp **desde 2014** (~25k/mês já em 2019).
- Prova de receita: agentes IA no WhatsApp do Dr. Consulta = **R$1,2M/mês**.
- Nenhum intérprete de exames (BR ou global) tem WhatsApp. Todos os apps de lab são transacionais: abrem no resultado e churnam.
- **A jogada**: resultado pronto → push + **WhatsApp com o resumo de 3 linhas e link pro app**. Lembrete de exame, nudge de tendência, pergunta respondida — tudo no canal onde o brasileiro já vive. (LGPD ok: opt-in, mesmo modelo dos labs.)

### D3 · Armar o médico, não competir com ele — o inverso dos EUA
- STAT (jan/2026): clínicos americanos **frustrados** com o despejo de exames D2C sem contexto. Superpower: sem export de PDF, sem portal. Function: sem portal. Oura: "Oura for Providers" sumido.
- **O Dr. Exame já tem**: portal do médico com brief de pré-consulta, top-3 mudanças, SOAP rascunho, perguntas do paciente, atividade Health Connect.
- **Lacuna a fechar**: transformar o brief em **PDF de 1 página** que o médico recebe antes da consulta (imprimível/WhatsApp) — o "produto" que o médico sente falta nos EUA.

### D4 · Confiança estrutural — o anti-sombra (e o anti-Kantesti)
A sombra (ChatGPT) é **grátis e perigosa**: 16,7% de casos complexos classificados "normais", pior em português. Kantesti grita 98,71% sem metodologia (empresa de 5 meses). Oura: ação coletiva por claim de acurácia. Nucleus: comparações com Theranos.
- **A jogada do Dr. Exame** (já 80% feita por design):
  - **Determinístico primeiro, IA depois** — checagem de faixa por regras (nunca alucina valor), a IA só explica; valores saem do laudo, não da imaginação.
  - **PT-BR nativo** — os LLMs genéricos são piores em português; o Dr. Exame é PT-first.
  - **Não-diagnóstico por design** (linha ANVISA SaMD RDC 657) — o mesmo cuidado que Function/Levels declaram, e que Kantesti ignora vendendo "disease prediction scores".
  - **Transparência que ninguém publica**: página pública "como validamos" — cada regra com citação, disclaimer honesto, LGPD/PII criptografada. Contra o marketing de fachada deles, **honestidade é posicionamento**.
- A 35,4% que já cola no ChatGPT não é perdido: é o **topo do funil** — o app ganha no dia em que o usuário quer **memória, família e médico** no mesmo lugar.

### D5 · Longitudinal de QUALQUER laboratório — a ingestão agnóstica
- Dasa/Fleury: murados (só exames próprios). Nenhum global aceita PDF de lab externo como produto central (InsideTracker **cobra $119** só pra isso; SiPhox fez do free-upload o funil "Sai").
- O paciente brasileiro troca de lab todo ano (convênio, preço, promoção) — **ninguém guarda a história completa**.
- **O Dr. Exame já tem**: PDF de qualquer lab + foto, split multi-exame, dedup cross-day.
- **Lacuna a fechar (janela de 6-12 meses)**: implementar **reader/writer do Health Connect Medical Records (FHIR)** ainda em beta — quando o GA vier (e quando os labs BR começarem a escrever), o Dr. Exame já é o app que "pega tudo". E monitorar RNDS/REL pra ingerir exames do SUS no dia em que saírem da fase COVID.

### D6 · Preço brasileiro, PIX e "cobrar pelo trabalho, não pela primeira leitura"
- Âncoras de mercado: Kantesti grátis/€9,99-relatório; Dr. Consulta telemed **R$9,90/mês**; InsideTracker $119 só pro upload; Function $365/ano; Marek $2.5-5.4k/ano.
- **O mercado decidiu**: a primeira interpretação é grátis. **O que se cobra** é o trabalho em volta — histórico, família, brief, tendências, plano.
- **O Dr. Exame já tem**: R$19,90/mês + créditos PIX + free generoso. É o único do planeta com essa combinação (interpretação IA + PIX + família) a preço BR.
- **Ajuste fino**: primeira leitura SEMPRE grátis (matar a desculpa do ctrl+c), paywall no que o grátis não faz (consolidado, família ilimitada, brief pro médico).

### D7 · Action-loop saudável — sem vender remédio
- Marek monetiza TRT/peptídeos/GLP-1 (não replicável: CFM/ANVISA). Function/Geviti empurram re-teste e add-ons de imagem.
- **O action-loop do Dr. Exame é ético e já existe**: plano de ação (hábitos, quando refazer) + perguntas prontas pro médico + lembretes + conquistas. Monetiza com plano/créditos, não com remédio.
- Caminho futuro alinhado: parceria com **nutricionistas/educadores** (o funil que o CalcLab provou com cursos da fundadora — distribuição por educação, CAC ~zero).

---

## 3. Roadmap de projeto pequeno (o que faz a diferença nos primeiros 90 dias)

### Já construído e raro (não refazer — comunicar)
Split multi-exame · faixa ideal vs referência · leitura de risco · portal do médico com SOAP · família/dependentes · Health Connect (passos/kcal) · PIX + créditos · LGPD (PII criptografada, PDF fora do banco).

### 30 dias — quick wins de alto impacto
1. **Reviver o PhenoAge** (idade biológica). Já está no código, dormente por canonicals. InsideTracker cobra **$249** por isso; Oura/Dasa não têm. É o número mais viralizável de um exame.
2. **WhatsApp: entrega de resultado** — "Seu exame do dia X está lido: 3 valores mudaram → toque pra ver". (Push já existe; WhatsApp é o multiplicador BR.)
3. **Brief do médico em PDF de 1 página** (imprimível/enviável) — transforma o portal em produto que o médico *quer* receber.
4. **FAQ/link do /faq na landing + Play Store** (já construído na sessão de hoje).

### 60 dias — fosso
5. **Modo cuidador + faixas pediátricas** (D1) — o diferencial que nenhum concorrente global pode copiar rápido (18+ é decisão de produto deles).
6. **Quiz-first onboarding de 60s** (licença Mito): "o que você quer entender?" → valor instantâneo antes do upload.
7. **Página pública "Como validamos"** (D4) — regras com citação, o que a IA faz e não faz. Arma de confiança contra Kantesti/ChatGPT.

### 90 dias — distribuição e trilhos
8. **SEO de biomarcador honesto em PT** — Kantesti planta ~960 artigos fake em 75 línguas; o Dr. Exame responde com conteúdo REAL (cada página de biomarcador amarra o item ao app: "cole seu exame e veja o seu"). 50 páginas > 960 fake.
9. **Health Connect Medical Records (FHIR) reader/writer** — pronto pro GA do Google (janela confirmada pela pesquisa).
10. **Funil de educação** (licença CalcLab/Marek): 1 curso/parceria com nutricionistas → acesso bundling → canal B2B2C barato.

### Watchlist (sinais de ameaça — monitorar trimestral)
- Apple iOS 27.4 (coach IA grátis no Health) — primavera 2027
- HC Medical Records saindo de beta (DiagnosticReport)
- RNDS/REL expandindo pra exames de rotina
- SiPhox chipdoméstico chegando ao BR (2027+)
- Kantesti adicionando PIX/localização BR

---

## 4. O que NÃO fazer (armadilhas identificadas na pesquisa)
- ❌ Competir em preço com o grátis (Kantesti/ChatGPT) — vencer por estrutura, não por desconto
- ❌ Cruzar a linha de diagnóstico (Kantesti vende "disease prediction" sem CE/UKCA — é o passivo regulatório deles, não um modelo a copiar)
- ❌ Vender suplemento/peptídeo/protocolo (Marek) — CFM/ANVISA + quebra da posição de confiança
- ❌ Excluir menor de idade do produto (18+ dos EUA) — família é o fosso
- ❌ Dark pattern de consulta paga no meio do fluxo (Superpower removeu a 1:1 silenciosamente e foi pego)
- ❌ Construir muro (exames só de parceiros) — o Dr. Exame vence por ser a **casa comum** de todos os labs

---

## 5. O posicionamento em uma frase
> **"O lugar onde os exames de TODOS os laboratórios da sua família viram uma história que o seu médico entende — em português, com sigilo e por preço de assinatura de streaming."**

Nenhuma das 22 empresas pesquisadas consegue dizer essa frase hoje.
