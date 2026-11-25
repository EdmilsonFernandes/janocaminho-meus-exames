---
target: Home do paciente (DashboardV2)
total_score: 14
max_score: 36
na_heuristics: 9
p0_count: 0
p1_count: 17
timestamp: 2026-11-25T16-27-45Z
slug: kages-web-src-components-dashboard-dashboardv2-tsx
---
# Crítica da Home — 25/11/2026 (antes das correções)

Method: dual-agent (A: subagente `design-critic`, só prints + fonte · B: `detect.mjs` + métricas de DOM no navegador)

Alvo: `packages/web/src/components/dashboard/DashboardV2.tsx` (Home do paciente, rota `/#/`).
Render: produção (`v2.7.376.626`, commit 34ec2b4), conta de QA com 1 exame (07/03/2026), 390×844 e 1280×800, claro e escuro.
Roteiro: `e2e/qa-home-critique.mjs` (read-only; só GET sai do navegador).

## Veredito

REJECT. Tudo renderiza, nada transborda, o modo escuro se sustenta — e nada disso salva a página: ela se contradiz sobre o número que o paciente veio ver, mostra um exame de 263 dias como "como você está hoje" e põe "Precisa de cuidados" ao lado de "1 Leve". Abaixo disso: 16–17 blocos com o mesmo peso, 6 controles com cara de primário (4 na primeira tela), cartões com tinta e brilho.

## Design Health Score

| # | Heurística | Nota | Problema-chave |
|---|---|---|---|
| 1 | Visibilidade do status do sistema | 2 | Idade do dado aparece uma vez, como data crua |
| 2 | Correspondência com o mundo real | 2 | Tom acolhedor; seis sinônimos para "fora da faixa"; "exames" para marcadores |
| 3 | Controle e liberdade do usuário | 2 | Popup automático ao abrir; cinco blocos promocionais permanentes |
| 4 | Consistência e padrões | 1 | Profundidade, forma, vocabulário e unidades divergem |
| 5 | Prevenção de erros | 1 | Alvos < 44px; contagens convidam à conclusão errada |
| 6 | Reconhecer em vez de lembrar | 1 | "Em destaque acima"; reconciliar 1/5/4 ao longo de cinco telas |
| 7 | Flexibilidade e eficiência | 2 | Ações rápidas ajudam; 5,3 telas sem atalhos |
| 8 | Estética e design minimalista | 1 | 16–17 blocos, cinco tintas, animação infinita |
| 9 | Recuperação de erros | n/a | Nenhum estado de erro renderizado nesta conta |
| 10 | Ajuda e documentação | 2 | Boa micro-ajuda; o score nunca é explicado |
| **Total** | | **14/36** | **Poor** |

## Os três motivos para rejeitar

1. Gravidade autorretratante: herói, tile, donut, mapa do corpo e anel de meta dão cinco contagens e três percentuais (38, 50, 88) para um exame só.
2. Dado antigo como atual: "Vamos ver como você está hoje" abre um exame de março; a única idade ("há 263 dias") está três telas abaixo. Título diz "Precisa de cuidados", pílula diz "1 Leve".
3. Sem hierarquia: um peso só para os blocos, quatro controles com cara de primário na primeira tela, tinta e brilho em cinco cartões, títulos de seção (13px) menores que títulos de cartão (15px).

## Achados (A = crítico, B = maior, C = menor)

1. **A** Cinco números para um fato: "1 Leve", "Fora da faixa 5", "4 de 8 normais", "Requer atenção 3/8", "Estáveis 7/8"; herói 38/100 contra 50% do donut. — `DashboardV2.tsx` (herói, tile, MarkerDistributionCard, GoalRingsCard)
2. **A** Exame de 263 dias como "hoje": título com a data, sem idade; aviso de dado antigo só após 12 meses (`health-state.ts:752`); anel usa 180 dias. — `DashboardV2.tsx:597,830`, `DashboardHeader.tsx`
3. **A** Título briga com a pílula: "Precisa de cuidados" (tom de erro, brilho vermelho) ao lado de "1 Leve"; três "Requer atenção" nunca chegam ao herói. — `DashboardV2.tsx:278-301,738-798`
4. **B** Seis controles parecem primários (pílula de áudio, "Ver análise completa", "Começar", "Completar perfil", "Responder", FAB); quatro na primeira tela. — `GoalQuiz.tsx`, `NextStepsCard.tsx`, MentalCard
5. **B** Borda + sombra em repouso, tinta decorativa em cinco cartões, três caixas aninhadas, faixa lateral de 4px, caixa alta com espaçamento, varredura "laser" infinita. — `AiCard.tsx`, `BodyMap.tsx`, `NextStepsCard.tsx`, `CreditsCard.tsx`
6. **B** Alvos de toque < 44px: pílula de severidade ≈24px, áudio ≈39px, chips de região ≈30px, fechar do cartão mental ≈24px. — `DashboardV2.tsx`, `BodyMap.tsx`
7. **B** Quebras sob estresse: "HEMATO…", "HE…", "crédi/tos" [desktop]; "Sem d…" em 390px; chip selecionado fora da tela; texto do cartão mental numa coluna de 119px. — `BodyMap.tsx`, `CreditsCard.tsx`, MentalCard, IndicatorTile; causa do "crédi/tos": `index.html:136` (`word-break: break-word` global em `.MuiCard-root`)
8. **B** Vocabulário e unidades divergem: seis termos para "fora da faixa"; "2 exames mapeados" (são marcadores) contra "Exames 1"; "+45", "0 créditos", "leituras"; "desbloqueada(s)". — `DashboardV2.tsx:96`, `BodyMap.tsx:1067`, `CreditsChip.tsx`
9. **B** Escala tipográfica plana: seção 13px abaixo de título de cartão 15–16,5px e corpo 14px. — `Section.tsx:26`, `AiTip.tsx:21`
10. **B** 16–17 blocos em 5,3 telas, ~55 alvos; título órfão "Atividade física & Dispositivos" acima de cartão sem relação; a cauda é créditos, conquistas, compartilhar. — `DashboardV2.tsx:1767-1814`
11. **B (shell)** O FAB "+" cobre conteúdo em 5 de 7 fatias no celular e "Relatório" no desktop; duplica "Enviar exame". No desktop, "Sair da conta" cortado com 800px de altura. — `ExamCreateFab.tsx`, `App.tsx`
12. **B** Três famílias de ícones; verde de sucesso em "Sem dados"; estrelinha (IA) em seção que não é IA; anéis em índigo/cobre; anel de 0% desenha um ponto. — `GamificationBadges.tsx`, `DashboardV2.tsx:1654,1791`
13. **B** "Dica personalizada (IA)" é um convite genérico ao chat, montado por template, rotulado como IA. — `AiTip.tsx:21`
14. **B** Teclado e leitor de tela: "Ações rápidas" e "Conquistas" são `Card` clicáveis sem role nem tabIndex; chips de região com `outline: none`; sem `aria-pressed`. — `QuickActions.tsx:35`, `GamificationBadges.tsx:28`, `BodyMap.tsx:731`, `PersonaSwitcher.tsx`
15. **B [desktop]** "Ver análise completa" estica a 703px e "Começar" a 910px; ~550px vazios ao lado do score; "Conversar com a IA" muda de tratamento entre desktop e celular. — `DashboardV2.tsx:885`, `GoalQuiz.tsx:310`
16. **B [dark]** Polegar do seletor de lente invisível (papel sobre papel); rodapé de "Suas conquistas" em cobre claro; degradê do chip em azul-marinho sobre teal-escuro. — `PersonaSwitcher.tsx:69`, `GamificationBadges.tsx:101`, `BodyMap.tsx:677`
17. **C** Popup: título repete o corpo; "Ver depois" contra "Ver detalhes"; conteúdo em cinza secundário; botões-pílula contra raio 12px no resto; raios 20/24 pontuais. — `NotificationPopup.tsx`

## O que funciona

- As linhas de "Quase lá" dizem por que cada dado importa, têm 48px, levam ao campo e o cartão sai quando está pronto.
- Tiles vazios não inventam dado: "Sem dados — sem colesterol, peso ou pressão", "meça em 2 min".
- "Perguntas pro médico" é um toggle de verdade (role, tabIndex, aria-expanded) e o corpo declara "sem IA".

## Carga cognitiva (celular)

16–17 blocos de topo · 6 botões com cara de primário (4 na primeira tela) · ~55 alvos.
Foco único FALHA · Partes ≤ 4 FALHA · Agrupamento FALHA · Hierarquia visual FALHA · Uma coisa por vez FALHA · ≤ 4 escolhas FALHA · Memória de trabalho FALHA · Revelação progressiva PASSA.

## Medições (navegador, tema claro)

| Medida | Celular 390 | Desktop 1280 |
|---|---|---|
| Altura da página | 4.441px (5,3 telas) | 2.636px (3,3 telas) |
| Rolagem horizontal | 0 | 0 |
| Palavras / textos | 341 / 138 | 387 / 162 |
| Tamanhos de fonte distintos | 17 | 21 |
| Pares tamanho-peso | 29 | 38 |
| Textos abaixo de 14px | 99 de 138 (72%) | 111 de 162 (69%) |
| Cores de texto | 16 | — |
| Caixas (borda, sombra ou fundo) | 69 | 88 |
| Borda + sombra no mesmo elemento | 12 | 15 |
| Caixas em 3º nível ou mais | 47 | 64 |
| Raios distintos | 10 | 13 |
| Sombras distintas | 13 | — |
| Controles abaixo de 44px | 34 de 60 | 36 de 66 |
| Texto abaixo de AA (4,5:1) | 19 de 112 medidos (10 são emoji; 26 sobre gradiente não medidos) | 23 de 135 |
| Botões com cara de primário na dobra | 9 | 11 |

Detector de código (`detect.mjs`, `components/dashboard/`): 16 avisos — 10 de easing elástico (`cubic-bezier(.34,1.56,.64,1)`, `dxTileSpring`, `dxSpringChip`) e 6 de animação de `width`/`height`.

## Não avaliado

Nenhum clique (roteiro read-only): armadilha de foco do diálogo, Escape, toggles, áudio com 0 créditos, estados de hover e pressão. Sem render em 320px. `PendenciasCard`, `TeleconsultaCard` e `ActivityCard` não renderizaram para esta conta.
