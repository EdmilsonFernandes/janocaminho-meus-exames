---
target: header mobile do app (AppBar)
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-08-18T15-52-01Z
slug: packages-web-src-app-tsx
---
# Crítica de Design — Header mobile Dr. Exame (AppBar)

Method: dual-agent (A: design-review · B: detector+browser) + ux-expert MCP + skills locais. Superfície Operate.

## Design Health Score: 24/40 (Acceptable)

| # | Heurística | Score | Key issue |
|---|---|---|---|
| 1 | Visibilidade de status | 2 | LoadingIndicator fora da tela ≤390px |
| 2 | Match mundo real | 3 | Metáfora bancária em contexto clínico |
| 3 | Controle e liberdade | 3 | ☰/← ok; 6 alvos = ruído |
| 4 | Consistência | 2 | 2 pílulas com mesmo gradiente teal |
| 5 | Prevenção de erro | 2 | Alvos colados 0px; olho dentro de chip que navega p/ vendas |
| 6 | Reconhecimento | 2 | "⚡71" sem ensino; config escondida no avatar |
| 7 | Flexibilidade | 3 | PTR + drawer auto-close |
| 8 | Estético/minimalista | 1 | 7 elementos, gaps 0px, overflow |
| 9 | Recuperação de erro | 3 | Silêncio no billing |
| 10 | Ajuda | 3 | aria-labels acima da média |

Cognitive load: 6/8 falhas. Especificidade: 4/10 (comentários confessam "preencher espaço vazio" App.tsx:97, CreditsChip.tsx:14).

## Evidência (DOM Playwright + detector)

- 430px: 8px folga, gaps 0–8px. 390px: refresh -18px. 360px: refresh invisível, gap logo→créditos 0. 320px: avatar cortado 41px.
- Touch targets 26–38px (<44). Badge sino 3,8:1; avatar 2,5:1. Gradiente "ciano AI" ×2.
- ☰ e "Mais" abrem o mesmo drawer (redundância boa — thumb reach). Créditos em 3 lugares (header, dashboard, drawer).

## Issues

- P0 cluster direito transborda ≤390px (refresh invisível; avatar amputado a 320; +26px com saldo 5 dígitos)
- P0 touch targets <44px (menu 30, sino 38, chip 26, olho 20)
- P1 duas pílulas com mesmo gradiente competem pela marca
- P1 botão-dentro-de-botão (olho no chip)
- P2 badge contador cru ("36"); P2 greeting 16px do header

## Personas

- Casey: canto direito inalcançável; gaps 0px = toque errado (trocar dependente navega p/ '/')
- Sam: 4/6 alvos <44px; botão aninhado quebra AT; badge 11px
- Jordan (40+): "⚡71" sem ensino; 1º toque acidental = página de vendas; procura engrenagem

## Direções

- A conservadora: re-escala sem remoção — não resolve defeito de princípio.
- **B premium minimalista (VENCEDORA):** `☰ [chip32] Dr. Exame ···· ⚡97,2k 🔔 avatar40` — remove refresh mobile (PTR existe; desktop mantém), olho, seta; chip tonal compacto; wordmark esconde <360px; badge 9+; contrastes corrigidos. Cabe em 320px com folga; monetização a 1 toque preservada; tudo removido tem casa melhor (drawer/dashboard).
- C health premium: créditos saem do header (drawer + nudge contextual) — destino de marca, mas exige instrumentação de funil antes.

Benchmark: Headspace/Calm (B) vs Apple Health/Ada (C) vs Nubank pré-2022 (A).

## Veredito

MVP bem vestido — materiais premium, composição de processo imaturo (controle invisível no iPhone padrão; elementos "para preencher espaço"; comentário "sem refresh duplicado" desmentido pelo código). B shipa agora; C após tracking exposição→conversão.

Decisão: implementar B (convergência dono + assessores + guardian). Regressões cobertas: toolbar desktop mantém LoadingIndicator (PTR é touch-only); navigate('/planos'), listeners e null-safe preservados; menu avatar intacto.
