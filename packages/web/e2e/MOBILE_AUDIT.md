# Auditoria Mobile Web — iOS Safari / Chrome Android (10/2026)

> Ferramenta: `node e2e/audit-mobile.mjs` (a partir de `packages/web`, com o stack local
> `docker compose -f docker-compose.local.yml up -d` na porta 4011).
> Mede por ROTA × LARGURA × ENGINE (chromium/webkit): overflow horizontal real do
> documento (scrollWidth−clientWidth, tol. 2px), ofensores fora do viewport (com
> detecção de "contido por design"), interativos sob a bottom nav no fim da
> rolagem, alcance do fim da página e erros de console.

## Matriz de rotas auditadas (43)

### Paciente autenticado (shell AppLayout + MobileBottomNav)
| Rota | Tela | Estado coberto |
|---|---|---|
| `/` | Dashboard | com dados (exames, HC), wallpaper glass |
| `/exams` · `/exams/:id` | Lista + detalhe de exames | chips-categoria c/ scroll próprio, marcadores |
| `/alterados` | Valores alterados | dados reais |
| `/evolucao` · `/tendencias` | Evolução + tendências (Recharts) | gráficos |
| `/linha-do-tempo` | Timeline | histórico |
| `/relatorio` | Relatório consolidado (IA) | gerado |
| `/medicoes` · `/medicoes/historico/:t` | Central de sinais + histórico | Health Connect |
| `/saude-mental` | PHQ-9/GAD-7 | questionário |
| `/medicamentos` | Remédios | lista + ações |
| `/vacinas` | Vacinas | lista |
| `/lembretes` | Lembretes | lista |
| `/emergencia` | Cartão de emergência | cartão único |
| `/conquistas` | Conquistas | progresso |
| `/despesas` | Despesas | lançamentos |
| `/familia` · `/patients` | Família + dependentes | lista |
| `/medicos` | Médicos | compartilhamentos |
| `/perguntas` | Perguntas ao médico | threads + dialog full-screen |
| `/perfil` · `/seguranca` · `/privacidade` | Conta | formulários (inputs 16px) |
| `/planos` | Planos/checkout | preços |
| `/faq` · `/suporte` · `/notificacoes` · `/api` | Apoio | conteúdo |
| `/chat` | Chat IA | compositor + teclado (visualViewport) |
| `/admin` | Backoffice (noLayout, admin) | tabs + rodapé fixo próprio |

### Públicas (noLayout)
`/entrar` · `/entrar/medico` · `/registrar` · `/recuperar-senha` · `/landing` ·
`/termos` · `/como-validamos` · `/api-docs` · `/convite/:token` (inválido) ·
`/doctor` (portal médico) · `/rota-inexistente` (404)

### Estados exerciseitados além do padrão
Carregando (BootSplash/skeletons) · sem dados (empty states) · muitos dados
(listas reais do dev DB) · erro de token (convite inválido) · 404 · texto longo
(nomes de laboratório extraídos de PDF: "VOLPI ara Vol! Jnir BIA…") · dialog aberto
(Questions full-screen, WhatsNew, GoalQuiz) · teclado (chat, via probe manual).

## Causas encontradas → correções (out/2026)

| # | Causa | Onde | Fix |
|---|---|---|---|
| 1 | Compositor do chat: `<input flex:1>` sem `min-width:0` → form 403px num viewport 390 → clip de 13px (botão enviar cortado; um dos empurradores do drift iOS) | `Chat.tsx` | `minWidth: 0` |
| 2 | iOS: rubber-band lateral do root scroller (página "escorrega" mesmo sem overflow de documento) | `index.html` | `overflow-x: clip` em body/#root (não cria scroll container; scrollLeft preso em 0) + dedupe do CSS "nuclear" duplicado |
| 3 | `100vh` em 10 telas = viewport GRANDE no iOS (toolbar dinâmica) → rodapés cortados | App.tsx, ApiDocs, admin, DoctorPortal×5, Landing, Terms, HowWeValidate, InviteLanding×2, ErrorBoundary, ForceUpdate, DashboardV2 | sweep → `100dvh` |
| 4 | Inputs MUI resolviam 15px (`font: inherit` vence regra do CssBaseline) → iOS dá zoom ao focar e NÃO volta | `theme.ts` | `MuiInputBase.styleOverrides.input` piso `max(1rem,1em)` em `pointer:coarse` |
| 5 | Teclado iOS cobre compositor in-flow (dvh não reage a teclado) | `Chat.tsx` + hook novo | `useKeyboardInset` (visualViewport, focus-gated) encolhe a altura e rola p/ última msg |
| 6 | Band-aid mobile vazando pro desktop: `.MuiContainer-* { max-width:100% !important }` GLOBAL quebrava os caps md/lg (900/1200) do MUI em ≥600px | `index.html` | regra escopada `@media (max-width:599px)` |
| 7 | Premium glass: bg chapado — o vidro das barras frostadas não tinha cor atrás p/ ler como vidro | `App.tsx` (`ScreenBackdrop`), `DashboardV2`, `theme.ts` (MuiCard) | wallpaper fixo (div, iOS-safe) + realce 1px nos cards; blur continua SÓ no chrome (perf Android) |

## Validação
- Baseline (pré-fix, build anterior): **84/84 OK** @390 chromium+webkit — documento
  já sem overflow; os problemas relatados eram os COMPORTAMENTOS iOS (itens 1-6) + 2
  cortes reais (chat 403px, caps desktop).
- Pós-fix chromium **320/375/430**: **126/126 OK** (43 rotas × 3 larguras).
- Pós-fix webkit **390**: **42/42 OK**.
- Landscape 844×390 (dashboard/chat/exams/planos): docOvX=0, fim alcançável, nav ok.
- Drift lateral: `scrollLeft` volta a 0 após tentativa programática (chromium+webkit).
- Inputs: 16px computados em todas as telas de login/perfil (chromium+webkit).
- Desktop 1440: caps do Container restaurados (lg=1200, md=900), docOvX=0.
- Unit web (vitest): 174/174. `tsc --noEmit`: 0 erros (local + dentro do build Docker).
- Gate permanente: `overflow.spec.ts` (chromium 320/375 + **webkit 390** + 768 + 1440).
- Ferramentas: `audit-mobile.mjs`, `verify-drift.mjs`, `verify-landscape.mjs`,
  `verify-desktop.mjs`, `probe-inputs.mjs`, `shots-visual.mjs`.
- Limitações (exigem iPhone físico): env(safe-area-inset-*) real, teclado real,
  rotação física, rubber-band por toque, barra do Safari expandida/recolhida,
  revisão visual fina das screenshots (o relay de IA não renderiza PNG).
