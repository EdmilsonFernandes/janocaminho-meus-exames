---
target: login do app (packages/web/src/pages/Auth.tsx)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-08-14T11-59-12Z
slug: packages-web-src-pages-auth-tsx
---
# Critique — Login (Auth.tsx) — 2026-08-14

Method: dual-agent (A: design review · B: detector CLI + overlay browser)

## Design Health Score

| # | Heurística | Score | Key Issue |
|---|---|---|---|
| 1 | Visibilidade de status | 3 | Spinner no CTA ok; bioLogin sem loading state (duplo-tap) |
| 2 | Match com o mundo real | 3 | CRM com exemplo; subtítulo "IA" abstrato pro 50+ |
| 3 | Controle e liberdade | 3 | Voltar/Reenviar/toggle reversíveis; MFA fechável |
| 4 | Consistência e padrões | 2 | Drift de tokens (radius 8 vs 12/16, gradientes/links fora da paleta); WCAG 2.6:1 no CTA |
| 5 | Prevenção de erro | 2 | Zero validação inline; sem caps-lock hint |
| 6 | Reconhecimento > memória | 3 | Labels persistentes; cadastro usa placeholder que some |
| 7 | Flexibilidade/aceleradores | 3 | Biometria nativa, Google, password managers, deep-links |
| 8 | Estético e minimalista | 3 | Rodapé empilha 3 blocos de confiança + 5 ações simultâneas |
| 9 | Recuperação de erro | 3 | Biometria expirada exemplar; senha errada genérica |
| 10 | Ajuda e documentação | 2 | Sem suporte/FAQ visível na porta |
| | **Total** | **27/40** | Acceptable→Good (borda) |

## Design Specificity Verdict

LLM: média-alta — terço superior inconfundível (mascote respirando, aura teal, toggle CRM), resto recai em login de fintech genérica sem evocar o ritual central (exames/labs/PDF). Deterministic: CLI 0 findings; overlay 14 warnings → 1 genuíno (contraste 2.6:1 branco/#20b2aa no CTA+Google), 12 FPs de marca/MUI (cyan palette=assinatura vinculante, max-width=MUI, text-occlusion=self-referente).

## Priority Issues

1. [P1] Contraste CTA branco/#20b2aa 2.6:1 (WCAG 4.5:1). Superfície com texto precisa do intervalo escuro da rampa (#00796b≈5.3:1 ✓; #00897b≈4.3 ✗) ou texto ≥18.66px bold. → colorize
2. [P1] Botão Google width:320 fixo estoura card (~293px internos @375; transborda ≤360). Fix width:100% maxWidth:320; idem GIS web. → adapt
3. [P1] Validação só via toast efêmero; campos nunca entram em erro; sem caps-lock hint. Fix error/helperText inline + aria-live + getModifierState. → harden
4. [P2] Toggle ativo disputa primário com CTA (mesmo gradiente+shadow = duas ações primárias); radius 8 vs sistema 12/16/20; gradiente 180deg #009688 e links #00897b fora dos tokens. Fix: toggle chapado sem shadow + adotar tokens. → layout
5. [P3] Aba Médico: comentário diz Google só-paciente mas código passa isDoctor; decisão "qual sou eu?" taxa 95% das sessões. Fix: esconder Google na aba; melhor: link "Sou médico" → rota própria. → shape

## Login nativo Android

Tela 100% Kotlin não compensa (duplicaria máquina de estados OTP/MFA/bloqueio/sliding/invite; web precisa existir; biometria+Google JÁ são nativos). Compensa: splash com logo segurando até pintar, @capacitor/keyboard (CTA sob teclado), @capacitor/status-bar teal, biometria como 1ª ação com enrolment; futuro passkeys.

## Persona Red Flags

Jordan: cadastro placeholder-como-label; sem autoComplete no cadastro; 409 manda usar "entrar com token" oculto e redireciona à Landing. Sam: OtpInput 6 inputs sem aria-label/autoComplete one-time-code/autoFocus; aria-label do olho fixo; disclaimer 12px. Casey: card ~660-700px > 635px úteis @375×667 (scroll); teclado cobre Entrar; 100vh+flex-center = risco clip topo. Dona Marlene (50+): sem caps-lock hint (espiral autodúvida); subtítulo não diz que exames moram aqui; biometria visualmente secundária.

## Minor Observations

PT hardcoded vaza p/ EN; bioLogin sem setLoading; 🔐+Shield duplicado; radius card 20 vs 16; 5 ações simultâneas no rodapé com bio+Google.

## Questions to Consider

Esqueci-senha inline no momento do erro? "Protegido pela LGPD" em vez de "servidores seguros"? Biometria como 1º botão quando enrolada?

## Run Notes

Dual-agent isolado. A: fontes completas + screenshot 375px cross-checkado com código (claims de layout por matemática). B: CLI limpo; overlay com cleanup confirmado. Sem ignore list. Slug packages-web-src-pages-auth-tsx.
