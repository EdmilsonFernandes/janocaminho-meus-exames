---
name: Dr. Exame
description: Assistente de saúde com IA — interpretador clínico conversacional com memória
colors:
  teal-consultorio: "#20b2aa"
  teal-profundo: "#178f89"
  teal-nevoa: "#5fc9c3"
  cobre-premium: "#d4a574"
  cobre-profundo: "#b88a54"
  indigo-pro: "#6366f1"
  verde-referencia: "#059669"
  ambar-atencao: "#f59e0b"
  vermelho-clinico: "#ef4444"
  severa-importante: "#b91c1c"
  severa-moderada: "#9a3412"
  severa-leve: "#92400e"
  papel-luz: "#ffffff"
  neblina-luz: "#FAFBFC"
  tinta-luz: "#1a202c"
  tinta-secundaria-luz: "#64748b"
  vidro-luz: "rgba(255,255,255,0.72)"
  papel-escuro: "#1a2424"
  sombra-funda: "#0f1818"
  tinta-escura: "#e8eef0"
  tinta-secundaria-escura: "#94a3b8"
  fio-luz: "#e6f1f0"
  fio-escuro: "#2a3636"
typography:
  display:
    fontFamily: "Poppins, Inter, system-ui, sans-serif"
    fontSize: "clamp(2rem, 5vw, 3rem)"
    fontWeight: 800
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Poppins, Inter, system-ui, sans-serif"
    fontSize: "clamp(1.6rem, 4vw, 2.25rem)"
    fontWeight: 800
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Poppins, Inter, system-ui, sans-serif"
    fontSize: "1.35rem"
    fontWeight: 700
    letterSpacing: "-0.01em"
  section:
    fontFamily: "Poppins, Inter, system-ui, sans-serif"
    fontSize: "1.1rem"
    fontWeight: 700
  body:
    fontFamily: "Inter, Segoe UI, Roboto, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, Segoe UI, Roboto, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.2
rounded:
  card: "16px"
  section: "14px"
  control: "12px"
  pill: "99px"
spacing:
  page: "16px"
  page-desktop: "24px"
  group: "8px"
  block: "16px"
  section: "24px"
components:
  button-primary:
    backgroundColor: "linear-gradient(135deg, #20b2aa, #178f89)"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "linear-gradient(135deg, #1ba39c, #137a74)"
  button-secondary:
    backgroundColor: "linear-gradient(135deg, #d4a574, #b88a54)"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
  card:
    backgroundColor: "{colors.papel-luz}"
    rounded: "{rounded.card}"
    padding: "16px"
  chip-severity:
    backgroundColor: "rgba(146, 64, 14, 0.15)"
    textColor: "{colors.severa-leve}"
    rounded: "{rounded.pill}"
  input-outlined:
    backgroundColor: "{colors.papel-luz}"
    rounded: "{rounded.control}"
    height: "40px"
  tab-portal:
    height: "58px"
    textColor: "{colors.tinta-secundaria-luz}"
---

# Design System: Dr. Exame

## Overview

**Creative North Star: "O Consultório de Vidro"**

O Dr. Exame se veste como um consultório moderno de vidro fosco: superfícies claras e translúcidas que deixam o conteúdo passar por trás (AppBar e navegação em frosted glass), calma clínica no ritmo e na densidade, e transparência que constrói confiança — o atributo que o produto mais precisa (dados de saúde, LGPD, "educa, nunca diagnostica"). O robô mascote Dr. Exame e a estrelinha ✨ da IA são a assinatura de marca: amigáveis sem infantilizar, presentes sem gritar.

A filosofia de profundidade é **"vidro e sussurro"**: camadas tonais em teal translúcido (alpha .07–.20) fazem a hierarquia; sombras em repouso são quase inaudíveis (≤ `0 4px 10px rgba(0,0,0,.06)`); o brilho teal (`rgba(32,178,170,.30)`) é gasto exclusivamente em CTA primário e hover. O caráter dos componentes é **refinado e contido**: um gradiente por tela, chips tonais discretos, press-states que sussurram (`scale(.98)`), foco visível sempre (anel teal 2px).

Público: paciente leigo 40+, mobile-first Android (APK + web), contexto de ansiedade com exames. Tudo aqui existe para que os NÚMEROS clínicos respirem e sejam inconfundíveis.

**Key Characteristics:**
- Frosted glass só no shell (AppBar `blur(18px) saturate(160%)`, bottom nav `blur(20px)`) — conteúdo nunca é vidro
- Teal `#20b2aa` é a única voz da marca; cobre e indigo são acentos de papéis especiais
- Duas superfícies por modo (luz/escuro); cores de marca idênticas nos dois modos
- Tipografia Poppins (títulos 700–800, tracking apertado) + Inter (corpo 14) — sem caixa alta decorativa
- Cards hairline (borda 1px `#e6f1f0`) com sombra-sussurro; listas usam divisor, não caixa

## Colors

Paleta clínica controlada: um teal de marca, três acentos de papel, três tons de severidade AA, dois neutros de superfície por modo.

### Primary
- **Teal Consultório** (#20b2aa): a voz da marca — CTA primário (em gradiente), ativos de navegação, links, foco. Dark variant **Teal Profundo** (#178f89) para texto sobre claro e gradiente; **Teal Névoa** (#5fc9c3) para texto sobre escuro.
- **Lavagens tonais** (rgba(32,178,170, .07/.12/.15/.20)): hover, item ativo, chip tonal, superfície destacada. É a ferramenta de hierarquia mais usada do sistema — preferida a sombra.

### Secondary
- **Cobre Premium** (#d4a574, profundo #b88a54): conquistas, recompensas, acentos "especiais". Raro de propósito.
- **Índigo Pro** (#6366f1): exclusivo de recursos Dr. Exame Pro / IA premium.

### Tertiary (severidade clínica — sempre AA sobre lavagem .15)
- **Vermelho Importante** (#b91c1c), **Laranja Moderada** (#9a3412), **Âmbar Leve** (#92400e): texto/borda dos badges de prioridade. Tons 800 garantem ≥4,5:1 sobre a lavagem própria.

### Neutral
- **Papel** (#ffffff) / **Neblina** (#FAFBFC): superfícies light; tinta **#1a202c** e secundária **#64748b**.
- **Papel Escuro** (#1a2424) / **Sombra Funda** (#0f1818): superfícies dark; tinta **#e8eef0** / **#94a3b8**.
- **Fio** (#e6f1f0 light, #2a3636 dark): borda hairline de card; **divisor** rgba(0,0,0,.06) / #2a3636.
- Semânticas MUI: sucesso #059669, atenção #f59e0b, erro #ef4444, info #0ea5e9 (contraste verificado em texto grande/ícone; texto pequeno usa os tons 800 acima).

### Named Rules
**The One Gradient Rule.** O gradiente `linear-gradient(135deg, #20b2aa, #178f89)` pertence à MARCA e ao CTA primário — no máximo um por tela. Chips, dados e badges são tonais (lavagem + tom 800), nunca gradiente: dois gradientes gêmeos competindo foi o maior "tell" corrigido na auditoria.
**The Glass Edges Rule.** `backdrop-filter` existe em AppBar, bottom navigation e modais/sticky bars — em nenhum outro lugar. Card de conteúdo é sólido.
**The Color-is-Cavalry Rule.** Cor nunca é o único canal de severidade: sempre emoji + rótulo textual + tom (padrão SeverityBadge). Verde não significa "tudo bem em geral" e vermelho não é alarme visual — é uma das três vozes.

## Typography

**Display Font:** Poppins (fallback Inter, system-ui)
**Body Font:** Inter (fallback Segoe UI, Roboto)

**Character:** Poppins geométrica e arredondada dá o rosto amigável-premium dos títulos (pesos 700–800, tracking apertado −0.01 a −0.03em); Inter neutra e legível carrega o corpo clínico. Números de exame usam peso 800 em tamanho display — o dado é o herói.

### Hierarchy
- **Display** (Poppins 800, clamp 2–3rem, ls −0.03em): landing/login, número-herói.
- **Headline** (Poppins 800, clamp 1.6–2.25rem): título de relatório, preço em destaque.
- **Title** (Poppins 700, 1.35rem): título de página (`PageHeader`).
- **Section** (Poppins 700, 1.1rem): títulos de card/seção.
- **Body** (Inter 400, 14px base; body1 16/1.6, body2 14/1.5): leitura clínica, medida ≤75ch.
- **Label** (Inter 600, 12px, sentence case): eyebrows de estatística, captions. **Piso de 12px em toda a UI** (público 40+).

### Named Rules
**The Quiet Label Rule.** Labels em sentence case. Caixa alta com letter-spacing largo é cara de painel administrativo — banida (ex-“SEUS CRÉDITOS” ls 2.4px → 0.4px). Se um eyebrow precisar de caixa alta: 11–12px/600/ls ≤0.4px, no máximo um por seção.

## Layout

Mobile-first: coluna única 100% até `sm`; shell desktop centrado em cap **1728px** com sidebar docked (264px). Larguras de página via `PageContainer`: **content 1280** (listas/config), **wide 1440** (data-heavy: Dashboard, Trends), **narrow 480** (cartão único, Emergência). Padding de página 16px (`xs`) / 24px (`md`); ritmo entre blocos 16–24px; listas usam divisor 1px, não card por item. O rodapé móvel reserva `calc(var(--me-bottom-nav-h) + 14px)` no shell — páginas nunca somam o próprio padding inferior. Flex column mobile: `align-items: stretch` (flex-start faz filho virar fit-content e corta a direita — lição do portal).

## Elevation & Depth

Híbrido tonal-first: hierarquia vem de lavagens teal e hairlines; sombra sussurra. Escada light: `0 1px 2px` (repouso card: dupla `0 2px 6px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.03)`), `0 4px 10px` (elevado), `0 8px 18px` (dropdown), `0 20px 40px rgba(32,178,170,.12)` (glow de marca máximo). Dark usa pretos .4–.65. **Glow teal** (`rgba(32,178,170,.30) 0 4px 12px`) só em CTA primário. Press universal: `scale(.985)` em 120ms.

### Named Rules
**The Whisper Shadow Rule.** Em repouso, sombra ≤ `0 4px 10px` e quase invisível. Sombra alta/glow é resposta a interação (hover/CTA/modal) — nunca decoração de estado parado.

## Shapes

Linguagem arredondada-clínica: cards 16px, seção/accordion 14px, controles (botão, input, chip retangular, tab, tile) 12px, pílula 99px para filtros/badges. Raios SEMPRE string com px em `sx` (numérico é multiplicado por `shape.borderRadius` 14 → blob). Cantos de 50% reservados a avatar/emoji-círculo. Hairline 1px `#e6f1f0` substitui sombra na definição do card.

## Components

### Buttons
- **Shape:** 12px (RADIUS.button), Poppins 700, sem caixa alta, padding 10×20px.
- **Primary:** gradiente One-Gradient + glow teal; hover escurece e aprofunda glow; `:active scale(.96-.98)`.
- **Secondary:** gradiente cobre (raríssimo). **Tonal/ghost:** lavagem teal .12 + texto Teal Profundo (ações secundárias). **Destructive:** vermelho clínico, sempre com confirmação em dado de saúde.

### Chips
- **Severity:** pílula 22–26px, lavagem 15% do tom + texto tom-800 (AA), emoji+palavra (🟡 Leve).
- **Toggle/filtro:** `component="button"` + `aria-pressed`, altura 40px no touch, preenchido=ativo/outline=inativo.

### Cards / Containers
- **AppCard:** 16px, Papel, hairline #e6f1f0, sombra-sussurro, press .985. Variedades `tinted/tone` usam lavagem em vez de borda lateral colorida (side-tab é tell de UI-de-IA, banido — dot + espaço).
- **Listas:** ListItem sem card + divisor 1px (Notificações é o padrão-ouro).

### Inputs / Fields
- **Outlines 12px, 40px de altura, label 14px; foco = anel teal 2px offset 2 (global).** Formulários de rotina vivem colapsados (lista primeiro, form em Collapse).

### Navigation
- **AppBar glass** (sticky, safe-area, ⚡ créditos tonal compacto, badge 9+): identidade à esquerda, conta/ações à direita, 44px de alvo.
- **Bottom nav glass** 5 itens + robô central; drawer = fonte única do menu ( emergencies em Cuidados).
- **Tabs do portal:** 4 destinos clínicos, 58px, ícone sobre rótulo sempre visível; Perguntas/Anotações acessadas por tiles do resumo.

### Signature: DrExame + ✨
Robô mascote (ícone oficial `app-icon.png`, componente `DrExame`) e estrelinha branca da IA sobre teal. Nunca remover; nunca sobre fundo da própria cor.

## Do's and Don'ts

### Do:
- **Do** usar lavagem teal (alpha .07–.20) como primeira ferramenta de hierarquia antes de sombra ou borda.
- **Do** garantir ≥4,5:1 em texto pequeno sobre lavagens (tons 800 de severidade).
- **Do** testar toda tela em 320px de largura — é o canário de corte e toque.
- **Do** manter alvos ≥40px no touch (ghost-hitbox cobre icon-buttons pequenos).
- **Do** escrever raios como string px em `sx` ("12px", nunca 12).

### Don't:
- **Don't** aplicar gradiente teal fora de marca/CTA; **don't** usar `backdrop-filter` fora do shell/modal/sticky.
- **Don't** criar card-dentro-de-card; lista com divisor resolve.
- **Don't** usar caixa alta decorativa com tracking largo, nem fonte <12px.
- **Don't** comunicar severidade só por cor; **don't** vermelho alarmista em contexto leve.
- **Don't** introduzir hex novo fora desta paleta sem antes checar se uma lavagem/ton existente resolve (censo atual: dívida de ~180 hex — o alvo é redução).
