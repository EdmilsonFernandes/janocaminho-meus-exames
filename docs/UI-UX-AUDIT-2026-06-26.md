# Auditoria de UI/UX — Meus Exames

**Data:** 2026-06-26 · **Ambiente:** localhost:4011 (app completo, build de produção) · **Conta:** edmilson@exemplo.com (99→79 créditos, plano grátis)
**Viewport analisada:** Mobile 390×844 e Desktop 1440×900 · **Identidade preservada:** teal `#20b2aa` + cobre `#d4a574`, Poppins/Inter, cards raio 16

> **Metodologia:** navegação real com Playwright (login programático via API), captura de **screenshots** (mobile+desktop) + **accessibility snapshots** estruturais + medições de layout via DOM + leitura dos tokens de tema (`theme.ts`). A visão automatizada pelo relay GLM é instável (limitação conhecida do relay), então os achados se apoiam em snapshots estruturais + medições de caixas (mais rigorosos que "olhômetro") + análise visual onde disponível.

---

## 🔴 Achados globais (valem para quase toda tela)

| # | Problema | Prioridade | Impacto |
|---|----------|-----------|---------|
| G1 | **AppBar congestionada no mobile** — até **8 ações lado a lado**: ☰ Menu, ← Voltar, 💎 99, switcher "E", 🌙 Modo escuro, 🔔 0, ⋯ Mais opções, ↻ Atualizar. Alvos de toque pequenos, poluição visual, risco de toque acidental. | **Alta** | Alto — afeta toda navegação mobile |
| G2 | **Texto secundário abaixo de WCAG AA** — `text.secondary = #718096` tem ≈4.0:1 sobre branco (limite AA = 4.5:1 p/ texto pequeno). Usado em legendas, disclaimers, metadados (`"Educativo..."`, `"20 itens"`, `"/mês"`). | **Média** | Médio — acessibilidade/percepção de qualidade |
| G3 | **Sem `maxWidth` no conteúdo desktop** — medição: `main` ocupa **1425px** de largura (left 0). Texto de parágrafos e relatório estica demais → baixa legibilidade e ar "não premium". | **Média-Alta** | Alto em desktop/tablet |
| G4 | **Botão flutuante "Pergunte ao Dr. Exame"** presente em ~toda tela autenticada, sobre o conteúdo (e potencialmente sobre o FAB/rodapé). Compete com a ação primária de cada tela. | **Média** | Médio — ruído visual |
| G5 | **Dados extraídos corrompidos visíveis** — `"VOLPI ara Vol! Jnir BIANCARDI LABORATÓRIO..."` aparece no card de Exame **e** no MetaCard do Relatório. É bug de extração, mas expõe baixa qualidade na UI. | **Alta** | Alto — confiança do usuário |
| G6 | **Emojis como ícones principais** (📋📊🩸🫀💉✅🔴) em vez de ícones consistentes. Emojis mudam de aparência por dispositivo (Android/iOS/web) e destoam de um visual "premium" coeso. | **Média** | Médio — coesão/premium |
| G7 | **"Voltar" e "☰" duplicados** no mobile: o ← do AppBar e o gesto/botão nativo fazem o mesmo papel do menu; em telas internas há ← **e** ☰ juntos. | **Baixa** | Baixo |

---

## Por tela

### 1. Landing (`/landing`) — Vitrine pública
**Estado:** mobile + desktop capturados (desktop = página longa, 1425×6187).

**Problemas**
- Página **muito longa e densa**: hero, 8 cards de feature, mockups, compartilhamento c/ médico, portal do médico, "como funciona", planos, indicação, CTA final, footer. Risco de TL;DR — o usuário que só quer entrar fica rolando.
- **CTAs redundantes**: "Entrar"/"Criar conta" no header **e** "Começar grátis"/"Já tenho conta" no hero **e** CTAs repetidos ao longo da página.
- Blocos de planos e portal do médico podem confundir o paciente comum (público duplo: paciente + médico na mesma vitrine).
- Footer com CNPJ/disclaimer bem longo.

**Melhorias**
- Encurtar para 3 dobras: hero → provas/mockups → planos/CTA. Mover "Portal do Médico" para rota dedicada (já existe `/doctor`).
- Unificar CTAs (um botão primário "Criar conta grátis" + secundário "Entrar").
- Âncora/navegação suave entre seções.

**Prioridade:** Média · **Impacto:** Conversão de cadastro.

---

### 2. Login (`/entrar`)
**Problema crítico de fluxo:** em **web**, `loginPage={LandingPage}` → acessar `/entrar` mostra **a Landing**, **não o formulário**. O form só aparece clicando "Já tenho conta". A rota dedicada `/entrar` (definida em `CustomRoutes`) é sobreposta pela `loginPage` do react-admin. Quem cola um link `/entrar` direto não cai no login.
- During boot, o `BootSplash` renderizou uma página de **11953px de altura** (captura full-page explodiu) — indica que o splash infla altura (provável `100vh` mal resolvido no contêiner).

**Melhorias**
- Fazer `/entrar` renderizar o `LoginPage` de fato (não a Landing), ou remover a rota ambígua e usar a Landing com estado `?login`.
- Conferir altura do `BootSplash` (usar `100dvh`/`fixed inset:0` em vez de expandir o documento).

**Prioridade:** Alta (fluxo de entrada) · **Impacto:** Direto em conversão/primeiro uso.

---

### 3. Dashboard (`/`)
**Estado:** mobile analisado (visão + snapshot). Há **overlay de Onboarding** no 1º login ("Sua saúde centralizada" → Próximo/Pular).

**Problemas**
- Score card: **"50 de 100 — Atenção: Vários valores fora da faixa"** é a informação mais importante, mas divide atenção com a dica de IA, créditos e 4 contadores logo abaixo. Hierarquia fraca.
- **4 cards de contador** (Exames 1, Alterados 10, Dependentes 1, Última atualização —) + 4 action cards (Enviar/Evolução/Família/Relatório) + donut + conquistas = muita informação na primeira dobra.
- Cartões de ação 2×2 com **gap apertado** (confirmado na análise visual) e ícones pequenos.
- Texto *"Toque nos cards de contador para navegar."* como instrução solta — affordance fraca.
- Onboarding: "Pular" pouco visível (texto minúsculo no topo).

**Melhorias**
- Dar **destaque único** ao Score (card maior, gauge animado) e mover créditos/contadores para uma segunda dobra ou chips compactos.
- Aumentar gap dos action cards (8→12px) e ícone (→24px); tornar todo o card clicável (não só o ícone).
- Onboarding: botão "Pular" como chip visível; indicador de progresso (1/N).

**Prioridade:** Alta · **Impacto:** Alto — é a tela de retenção.

---

### 4. Exames (`/exams`)
**Problemas**
- **AppBar com 8 botões** (G1).
- Cabeçalho de grupo lê **"📅 2026 1"** (ano + contagem colados) — confuso.
- Card do exame exibe **nome de laboratório corrompido** ("VOLPI ara Vol! Jnir...") — G5.
- Metadados muito densos numa linha: `"Outro • s/d • 20 itens • Enviado 22/06/2026"` + status "Pronto" + botão "Excluir" + "O que é este exame?".
- Só **1 exame** → tela parece vazia; sem estado vazio/ilustrativo nem CTA "Enviar primeiro exame" em destaque (o "+" é discreto).
- "s/d" (sem data) aparece porque o exame não tem data extraída.

**Melhorias**
- Separar "ano" e "quantidade" no cabeçalho do grupo (ex.: `2026 · 1 exame`).
- Sanitizar/encurtar nome do laboratório no card (truncate com tooltip; corrigir extração).
- Estado vazio amigável quando não há exames.
- Priorizar a ação "Enviar exame" (FAB já existe — garantir que não conflite com o "+" da lista).

**Prioridade:** Alta · **Impacto:** Alto — tela central do produto.

---

### 5. Valores Alterados (`/alterados`)
**Problemas**
- Tela **quase vazia**: só 1 acordeão colapsado ("🚨 HEMOGRAMA 📅 s/d 10 alterado(s)") + disclaimer + botão flutuante.
- A informação mais útil (quais os 10 valores alterados) está **escondida** dentro do acordeão — obriga um toque a mais.
- "📅 s/d" (sem data) repete a falta de data do exame.

**Melhorias**
- Pré-expandir o exame quando há só um, ou mostrar os itens críticos já abertos (top 3 alterados).
- Adicionar um resumo no topo ("10 valores fora da faixa — 5 merecem atenção").

**Prioridade:** Média · **Impacto:** Médio — clareza da ação.

---

### 6. Relatório Consolidado (`/relatorio`) ⭐ **Prioridade — tela recém-redesenhada**
**Estado:** mobile, relatório **gerado** (custou 20 créditos: 99→79). Visão confirmada. Componentes: `ReportHero`, `MetaCard`, `DestaqueCard`, `ReportSectionCard`.

**Problemas**
- **Seção "💊 Interações com medicação" VAZIA** — renderiza literalmente `"× :"` (strong vazio + "× :"). Seção sem conteúdo não deveria aparecer; passa impressão de erro/incompleto.
- **Badge "💎 20 créditos" persiste no hero mesmo APÓS gerar** — sugere que cobrará de novo ao interagir. Confuso.
- **Nomes truncados** nos DestaqueCards: `"VCM (Volume Corpuscular Médio)…mais"`, `"CHCM (Conc. Hemoglob. Corpuscular Média)…mais"`. O "…mais" cru não é elegante.
- **Nome do laboratório corrompido** no MetaCard ("VOLPI ara Vol! Jnir...") — G5.
- **Dois "Atualizar"** na mesma tela: o `↻ Atualizar` do hero do relatório **e** o `↻ Atualizar` da AppBar.
- **Texto muito denso/longo**: intro, pontos de atenção, positivos, nutrição, metas, leitura final, perguntas — vários blocos corridos de parágrafo. Falta respiro visual (ícones, espacamento entre seções, cards para os pontos).
- Hero com 4 actions (Ouvir/Compartilhar/Imprimir/Atualizar) que no mobile podem ficar apertadas.

**Melhorias**
- **Ocultar seções vazias** (`Interações com medicação`) ou mostrar placeholder "Nenhuma interação relevante identificada".
- Trocar o badge de custo pós-geração por algo como "✓ Gerado" ou removê-lo.
- Truncação elegante: `line-clamp` + tooltip com o nome completo (sumir com o "…mais").
- Fundir/eliminar o "Atualizar" duplicado.
- **Hierarquizar**: dar cards distintos aos "Pontos de atenção" (cada ponto como mini-card com ícone de severidade) e aumentar `spacing` entre seções (ex.: `mb: 3`).
- Sanitizar nome do laboratório.

**Prioridade:** Alta · **Impacto:** Alto — é o produto pago (custa créditos) e o carro-chefe "premium".

---

### 7. Evolução (`/evolucao`)
**Problemas**
- **4 chips de filtro** (Todos 20 / Fora da faixa 10 / Em mudança 0 / Estável 10) podem quebrar/wraps feio em telas estreitas (390px) — ver wrap.
- Cards de categoria (Hemograma 🔴 15, Função Hepática ✅ 2, Outros ✅ 3) com emoji + número; clique leva ao gráfico.
- Só **1 exame no perfil** → "evolução ao longo do tempo" tem pouco a mostrar; sem estado vazio explicativo ("envie outro exame para ver a evolução").

**Melhorias**
- Garantir wrap limpo dos chips (flex-wrap, gap) ou torná-los scroll horizontal.
- Estado vazio/quase-vazio: "Você precisa de 2+ exames para ver tendências".

**Prioridade:** Média · **Impacto:** Médio.

---

### 8. Dr. Exame Chat (`/chat`)
**Problemas**
- **Cabeçalho duplo**: a AppBar global (com ☰/Voltar/créditos/etc.) **+** o header próprio do chat (←, avatar "Dr. Exame / Assistente de saúde", "Nova conversa", sininho). Dois headers empilhados desperdiçam espaço vertical no mobile.
- **8 chips de ação rápida** — bom, mas verificar se wrappam bem.
- Badge "💎 2 crédito por pergunta" no topo do chat — bom alerta de custo.
- Botão de envio **desabilitado** até digitar (ok), mas sem hint.

**Melhorias**
- No chat, esconder a AppBar global (ou unificar num header só) — aproveitar a tela cheia para a conversa.
- Manter os chips; garantir contraste do botão desabilitado.

**Prioridade:** Média · **Impacto:** Médio — é a feature de IA (engajamento).

---

### 9. Perfil (`/perfil`)
**Problemas**
- **Avatar com placeholder "?"** quando não há foto — deveria usar a inicial "E" (como faz o drawer). Inconsistente.
- **Formulário muito longo** numa página só (dados clínicos + notificações + trocar senha + indicação + meus dados). Carga cognitiva alta.
- **Label verboso**: `"Sexo (define a faixa de referência dos exames)"` como label de campo é longo; a explicação deveria ser `helperText`.
- Campos `Telefone`, `Sexo`, `Nascimento`, `Perfil clínico` vazios (sem dados) — sensação de incompleto.

**Melhorias**
- Avatar fallback com inicial; padronizar com o drawer.
- Quebrar em seções/abas (Perfil / Segurança / Indicações / Dados) ou usar accordions.
- Mover a explicação de "Sexo" para `helperText`; encurtar o label.

**Prioridade:** Média · **Impacto:** Médio.

---

### 10. Planos e Créditos (`/planos`)
**Problemas**
- **3 cards de pacote (PIX) em linha** no mobile (390px) → ~120px cada, provável aperto; o do meio ("MAIS VENDIDO") com badge.
- Cards de crédito + assinatura + histórico numa página só.
- "Seus créditos: 79 · Sem assinatura" bom e claro.

**Melhorias**
- Em telas estreitas, empilhar os pacotes (1 coluna) ou scroll horizontal com snap; destacar o "MAIS VENDIDO".
- Confirmar contraste do badge/preço.

**Prioridade:** Baixa-Média · **Impacto:** Médio — monetização.

---

## Desktop / Responsividade
- **Sidebar persistente** (drawer 264px, `AppMenu` com seções) — bom.
- AppBar larga mostra **nome completo** no switcher (bom uso do espaço).
- **Sem `maxWidth`** no conteúdo (G3): em 1440px o `main` mediu **1425px**. Recomendar **container centralizado ~1080–1200px** para páginas de leitura (Relatório, Perfil, Planos), mantendo o Dashboard em grid fluido.
- Dark mode existe e troca só superfícies (marcas iguais) — sólido; validar contraste do `#718096` também no dark.

---

## 🏆 Top quick-wins (ordenado por esforço×impacto)
1. **Ocultar seção vazia "Interações com medicação"** no Relatório + remover badge de custo pós-geração. *(30 min, impacto alto na percepção "premium")*
2. **Descongestionar a AppBar mobile**: mover "Modo escuro"/"Atualizar" para o menu "⋯ Mais opções" (já existe), deixar só ☰/Voltar + créditos + sininho. *(1h, alto)*
3. **Sanitizar/truncar nome do laboratório** corrompido nos cards (Exames + Relatório). *(extração + UI; alto p/ confiança)*
4. **`maxWidth` de leitura** centralizado nas páginas de conteúdo no desktop. *(1h, médio-alto)*
5. **Escurecer `text.secondary`** para ≥4.5:1 (ex.: `#5f6b7a` a `#64748b`). *(5 min, acessibilidade)*
6. **Avatar com inicial** no Perfil (consistir com o drawer). *(10 min)*
7. **Truncação elegante** (`line-clamp` + tooltip) nos DestaqueCards do Relatório. *(30 min)*
8. **Unificar header do Chat** (remover AppBar duplicada). *(1–2h)*
9. **Pré-expandir / resumir** Valores Alterados quando há poucos exames. *(30 min)*

---

*Auditoria somente de UI/UX — nenhuma alteração de código foi feita. Achados baseados em snapshots estruturais + medições de layout DOM + análise visual (parcial, via relay) + leitura de `theme.ts`.*
