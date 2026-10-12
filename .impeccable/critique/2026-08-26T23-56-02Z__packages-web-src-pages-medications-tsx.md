---
target: Medications
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-08-26T23-56-02Z
slug: packages-web-src-pages-medications-tsx
---
# Critique — Remédios (Operate) · 2026-08-26
Method: dual-agent (A · B isolados)

Scores: 4,3.5,2,2.5,2,2,3,2,2,3 = 26/40 (Acceptable+) — heurísticas 6-10 derivadas na síntese
SPECIFICITY: 7/10 — craft próprio (PriceBig, logos, MedAvatar) em chassi Shopee; diferencial clínico subaposto.
DETECTOR: 0 no path (DESIGN.md não alcança packages/web); latente 25 advisory (16 cores farmácia + radius 20) — documentar pharmacy-brands no DESIGN.md.

PRIORITY ISSUES:
- [P1] Nome truncado esconde DOSE (clamp 2 linhas / dose em linha própria) → clarify
- [P1] Delete sem confirmação/undo (alvo ≥44px) → harden
- [P1] Hierarquia invertida preço>remédio (9 elementos; preço 16px; meta-row silenciosa) → layout
- [P2] Rows clicáveis div sem role/teclado/chevron → audit
- [P2] Fronteira grátis×pago em interações sem copy → clarify

OPORTUNIDADE: delta de economia ('você economiza R$ X') no dialog = argumento de marca.
PERSONAS: Casey — delete 28px na zona do polegar; Jordan — 'uso contínuo' afirmado sem perguntar; Riley — nome gigante ilegível sem tooltip.
MINOR: fmtBRL×PriceBig no dialog; triplo MELHOR; 'Fechar' contained; EAN jargão; farmácia truncada com logo.
QUESTIONS: delete é soft? preço>nome é posição de produto? vender a economia entra no roadmap?
