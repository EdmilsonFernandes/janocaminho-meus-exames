# Home — crítica e ajustes de acabamento (25/11/2026)

> 1º ciclo da elevação da UI "uma tela por vez": **Home** → Exames (lista + detalhe) → Chat → Agenda.
> Dono aprovou o plano em 25/11 ("sim, manda bala") depois de ver a lista do que seria mexido.

## Como a crítica foi feita

1. **Fotos da Home em produção** com a conta de QA (1 exame, de 07/03/2026): celular 390×844 e
   desktop 1280×800, temas claro e escuro, em fatias de uma tela.
2. **Medições no DOM**: alvos de toque, tamanhos de fonte, cores, caixas (borda/sombra), raios,
   contraste, texto cortado, botões com cara de primário.
3. **Crítica adversativa independente** (subagente `design-critic`, só com os prints e o código).
4. Detector de código do impeccable sobre `components/dashboard/`.

- Roteiro (não versionado): `node e2e/qa-home-critique.mjs [m-light,m-dark,d-light,d-dark]`.
  Contra produção usa só GET; com `QA_WWW=<pasta>` serve um build local e `QA_TAG=<nome>`
  guarda o resultado em pasta separada. Prints do "antes": `e2e/screenshots/home-antes-2511/`.
- Baseline da crítica: `.impeccable/critique/2026-11-25T16-27-45Z__kages-web-src-components-dashboard-dashboardv2-tsx.md`
  (Nielsen 14/36, veredito REJECT, 17 achados — 3 críticos).

## Veredito da crítica

Tudo renderiza, nada transborda, o modo escuro se sustenta — e nada disso salvava a página:

1. **Cinco números para o mesmo fato**: herói "1 Leve", bloco "Fora da faixa 5", donut
   "4 de 8 normais · 3 requer atenção", anel "Estáveis 7/8".
2. **Exame de 263 dias como "hoje"**: saudação "como você está hoje", data sem idade, aviso de
   dado antigo só depois de 12 meses.
3. **Sem hierarquia**: 16–17 blocos com o mesmo peso, 4 controles com cara de primário na
   primeira tela, tinta e brilho em cinco cartões, título de seção (13px) menor que título de
   cartão (15px).

## O que mudou

| Tema | Antes | Depois | Onde |
|---|---|---|---|
| Texto cortado | "Sem d…" no tile Risco cardíaco (celular); "HEMATO…"/"HE…" no mapa (desktop); "crédi/tos" nos créditos (desktop); Saúde mental em 5 linhas numa coluna de 119px | Valores inteiros; nome do marcador em até 2 linhas (sem espaço, o valor desce); número e unidade dos créditos em linhas separadas; Saúde mental com texto largo e botão abaixo | `DashboardV2.tsx`, `BiologicalAgeCard.tsx`, `BodyMap.tsx`, `CreditsCard.tsx` |
| Uma ação destaque por tela | 5 botões gradiente: Ver análise completa, Começar, Completar perfil, Responder, mais a pílula de áudio | Só o CTA do herói mantém o gradiente; os outros usam `SecondaryButton` (contorno teal, 44px); áudio vira pílula tonal | `SecondaryButton.tsx` (novo), `GoalQuiz.tsx`, `NextStepsCard.tsx`, `DashboardV2.tsx` |
| Botões gigantes no desktop | "Ver análise completa" com 703px, "Começar" com 910px | Largura natural a partir de `sm` | `DashboardV2.tsx`, `GoalQuiz.tsx` |
| Profundidade (regra do DS) | Borda + sombra no mesmo cartão; malha radial decorativa em 5 cartões; caixa dentro de caixa; faixa lateral de 4px; varredura "laser" infinita | Cartões secundários só com borda; linhas do mapa e de "Seus Marcadores" viram lista com divisória; pontinho colorido marca o nível; moldura e painel sem sombra; a varredura roda uma vez | `AiCard.tsx`, `CreditsCard.tsx`, `NextStepsCard.tsx`, `GamificationBadges.tsx`, `BodyMap.tsx`, `DashboardV2.tsx` |
| Hierarquia dos títulos | Seção 13px abaixo de título de cartão 15px; 72% do texto com menos de 14px | Seção 17–18px, cartão 16px; textos de apoio da Home em 13–14px | `Section.tsx` e os cartões da Home |
| Alvos de toque | 34 de 60 controles abaixo de 44px | 5 de 68 (os 5 restantes são da barra de cima e da barra inferior) | `DashboardV2.tsx`, `BodyMap.tsx`, `PersonaSwitcher.tsx`, `ClinicalActionsCard.tsx`, `CreditsCard.tsx`, `ShareHealthCard.tsx` |
| Teclado e leitor de tela | "Ações rápidas" e "Conquistas" clicáveis só com mouse; chips do mapa sem foco visível | `role=button`, `tabIndex`, Enter/Espaço, foco visível; chips com `aria-pressed` | `QuickActions.tsx`, `GamificationBadges.tsx`, `BodyMap.tsx`, `PersonaSwitcher.tsx` |
| Título órfão | "Atividade física & Dispositivos" aparecia sem card em cima da dica da IA | Some quando não há card (`:has(:empty)`) | `DashboardV2.tsx` |
| Conteúdo pequeno | "2 exames mapeados" (eram marcadores); tile "Sem dados" verde de sucesso; estrelinha de IA em "Ações rápidas"; "Dica personalizada (IA)" que é template; anel de 0% com um ponto; chip selecionado do mapa fora da tela | "2 marcadores mapeados"; tile neutro; ícone neutro na seção; "Dica do Dr. Exame" / "Converse com o Dr. Exame"; anel sem ponto; o chip selecionado rola até ficar visível | `BodyMap.tsx`, `DashboardV2.tsx`, `AiTip.tsx` |
| Modo escuro | Polegar do seletor de lente invisível; rodapé das conquistas em cobre claro; degradê dos chips em azul-marinho | Corrigidos com os pares por modo (`copperText`, `background.paper`) | `PersonaSwitcher.tsx`, `GamificationBadges.tsx`, `BodyMap.tsx`, `DashboardV2.tsx` |
| **Contagem dos marcadores** (decisão 1) | "Seus Marcadores" lia o histórico bruto: 4 de 8 normais, 3 requer atenção | Lê a mesma régua do herói e do bloco "Fora da faixa": 3 de 8 normais, 5 fora da faixa, 0 requer atenção (= nota 38, = "5", = "1 Leve") | `utils/markerBuckets.ts` (+ teste), `DashboardV2.tsx` |
| **Idade do último exame** (decisão 3) | "Último exame: 07/03/2026"; saudação "como você está hoje" | "Último exame: 07/03/2026 · há 8 meses"; aviso "esta leitura mostra aquele momento, não hoje" quando o exame passa de 180 dias; saudação vira "Como você estava no seu último exame" | `utils/homeRecency.ts` (+ teste), `DashboardV2.tsx`, `DashboardHeader.tsx` |

A régua de "pode estar desatualizado" (12 meses, `LAB_STALE_AFTER_DAYS`) **não mudou**. O aviso
novo usa a janela de 180 dias que o anel "Exames em dia" já usava — nenhuma régua nova.

## Medições: antes × depois

| Medida | Celular 390 | Desktop 1280 |
|---|---|---|
| Controles abaixo de 44px | 34 de 60 → **5 de 68** | 36 de 66 → **8 de 74** |
| Cartões com borda + sombra | 12 → **5** | 15 → **8** |
| Cartões com sombra | 19 → **8** | 34 → **23** |
| Raios distintos | 10 → **8** | 13 → **11** |
| Sombras distintas | 13 → **7** | 22 → **16** |
| Botões com gradiente | 5 → **2** | 6 → **3** |
| Textos abaixo de 14px | 72% → **62%** | 69% → **60%** |
| Rolagem horizontal | 0 → 0 | 0 → 0 |
| Erros de JavaScript | 0 → 0 | 0 → 0 |

Os que sobraram abaixo de 44px são todos da barra de cima (Menu, "+45", Notificações, Conta) e da
barra inferior/lateral. Os 2 gradientes do celular são o do herói e o do card "Hora de rever seu
exame" (frente "próximo exame", feita em paralelo).

## O que continua aberto (decisão do dono)

1. **Título do herói × pílula**: "Precisa de cuidados" (nota 38) ao lado de "1 Leve". Mantém, ou o
   título passa a acompanhar o achado mais sério?
2. **Shell (app todo)**: ícones da barra de cima com 40px, botão "+" cobrindo conteúdo, "🎁 +45"
   parecendo saldo ao lado do cartão "0 créditos".
3. **Tamanho e ordem da página**: 16–17 blocos em ~5,8 telas. Proposta: juntar Créditos com
   Conquistas e transformar Compartilhar em rodapé.
4. **Texto sobre fundo claro**: 8 textos da Home em 4,3–4,45:1 (mínimo 4,5) — cinza secundário da
   paleta sobre fundos levemente coloridos. Resolve na paleta, vale para o app todo.
5. **Emoji como ícone** (regiões do mapa, medalhas das conquistas): trocar por ícones do conjunto
   em uso junto com as telas `/conquistas`.

## Observação para a frente "próximo exame"

O `NextExamCard` entrou na Home em paralelo a este trabalho. Para manter "uma ação destaque por
tela" e o contraste: o botão "Enviar novo exame" é `variant="contained"` (gradiente) → trocar por
`SecondaryButton`; o link "Ver o último" usa `color="primary"` cru (#20b2aa, 2,62:1 sobre papel) →
usar `tealText(mode)`.
