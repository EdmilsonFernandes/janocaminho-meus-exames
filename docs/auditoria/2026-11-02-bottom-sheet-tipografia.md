# Auditoria · Bottom Sheet de insight clínico × tipografia dinâmica (02/11/26)

## 1. Componente e fluxo encontrados

- **Componente**: `packages/web/src/components/clinical/CrossInsightBottomSheet.tsx` — MUI `Drawer anchor="bottom"` (papel com `maxHeight 90dvh`, rolagem interna) + `Badge` do ReUI (`@/components/reui/badge`) + Tailwind da ilha (`doctor-v2/tw.css`). Não existe ReUI "bottom-sheet" instalado; o padrão do projeto para sheets é Drawer/SwipeableDrawer do MUI.
- **Fluxo real**: `/#/notificacoes` → toque/Enter na notificação cujo `data.crossInsight` (ou `data.insight_id`) existe → `setCrossInsightView` → sheet. Fechar = botão principal ("Entendido"), Esc, backdrop; o fechamento grava `dx_cross_insight_dismissed_<signature>` (anti-spam) e marca a notificação como lida.
- **Caminho controlado**: a página já escuta `window` `openCrossInsight` (código de produção pré-existente, usado pelo push em foreground). Os testes disparam esse evento com fixtures — nenhum evento global foi adicionado para teste.
- **Referências do briefing**: `DR_EXAME_OPEN_INSIGHT` não existe (o evento real é `openCrossInsight`); `data-reui-component="bottom-sheet"` não existe (o papel ganhou `data-testid="cross-insight-sheet"`); `bottomsheet-primary-btn` e `metric-chip`/`metric-status` foram adicionados ao componente.
- **Fontes/unidades**: Inter/Poppins via Google Fonts; `body { -webkit-text-size-adjust: 100% }` no `index.html`; MUI em rem (`htmlFontSize` default); Tailwind v4 em rem; "Texto grande" do app = raiz 16→18px. Capacitor 7, `adjustMarginsForEdgeToEdge: 'auto'`, `androidScheme https`.

## 2. Defeitos encontrados e correções

| # | Defeito | Correção | Arquivo |
|---|---|---|---|
| 1 | Papel do Drawer sem `role="dialog"`, `aria-modal`, `aria-labelledby/describedby` (leitor de tela não anunciava diálogo nem título) | `slotProps.paper` com role/aria + `id` no título e no resumo | `CrossInsightBottomSheet.tsx` |
| 2 | Classes Tailwind do componente podiam não ser geradas (`components/clinical` fora do `@source`) | `@source "../components/clinical"` | `doctor-v2/tw.css` |
| 3 | A 200% o texto da pergunta ao médico virava 1 palavra/linha: `px-5`/`p-3.5` em rem dobravam e o botão "Copiar" espremia o texto | padding com teto em px (`px-[min(1.25rem,20px)]`, `p-[min(0.875rem,14px)]`), card com `flex-wrap`, texto `min-w-[180px] flex-1 basis-0` (o botão desce de linha) | `CrossInsightBottomSheet.tsx` |
| 4 | A 85% os botões caíam para 37px (alvo de toque em rem) | `min-h-[44px]`/`min-h-[48px]`, `min-w-[44px]` em px | `CrossInsightBottomSheet.tsx` |
| 5 | Rótulos `text-[10px]` em px (não escalavam) | `text-[0.625rem]` | `CrossInsightBottomSheet.tsx` |
| 6 | Status sem `label` no payload ficava só pela cor | fallback `STATUS_LABEL[status]` ("Elevado/Normal/Baixo") | `CrossInsightBottomSheet.tsx` |
| 7 | Botão "Copiar" sem nome acessível (só `title`) | `aria-label` + `aria-live` | `CrossInsightBottomSheet.tsx` |
| 8 | Sem safe-area inferior | `pb-[max(1.5rem,env(safe-area-inset-bottom))]` | `CrossInsightBottomSheet.tsx` |
| 9 | **Fundo rolava 400px com o sheet aberto**: `html, body { overflow-x: hidden !important }` no `index.html` — qualquer overflow no `html` impede que o `overflow:hidden` que o MUI põe no `body` (lock de Dialog/Drawer) propague ao viewport. Afetava todos os modais do app | `overflow-x` só no `body` (html sem overflow); proteção horizontal mantida (body/#root) | `index.html` |
| 10 | Chips de métrica com valor longo estouravam | `max-w-full min-w-0`, `break-words`, `rounded-2xl` | `CrossInsightBottomSheet.tsx` |

Não feito de propósito: nenhuma redução de fonte, nenhum `overflow:hidden` global, nenhum corte de conteúdo. A ação principal continua DEPOIS do conteúdo (padrão do componente) e é alcançável por rolagem interna em todos os cenários (verificado).

## 3. Arquivos alterados/criados

- `packages/web/src/components/clinical/CrossInsightBottomSheet.tsx`, `packages/web/index.html`, `packages/web/src/doctor-v2/tw.css`
- Testes: `packages/web/e2e/insight-sheet.spec.ts`, `insight-sheet.config.ts`, `fixtures/cross-insight.ts`, `fixtures/sheet-geometry.mjs` (geometria compartilhada), `insight-sheet-android.mjs` (WebView real), baselines em `e2e/__screenshots__/insight-sheet/<projeto>/`.

## 4. Matriz executada

Config própria (`insight-sheet.config.ts`): projetos = larguras **360 / 390 / 412**, **360×640** (pouca altura), **Pixel 5** (descritor Android do Playwright: UA Chrome Android, DPR 2,75) e **desktop 1440**. Em cada um, escalas **85 / 100 / 125 / 150 / 200%** (html.fontSize) × **7 fixtures** (base do briefing, título longo, resumo longo, métrica/valor extensos, 8 métricas, opcionais ausentes, conteúdo curto).

| Bloco | O que verifica | Resultado |
|---|---|---|
| A · escala CSS (30 combos × 7 fixtures) | corte X/Y, texto fora do sheet, ancestral cortando, sobreposição chips/botões/badge, overflow do sheet e da página, botões ≥40px, status legível além da cor, h2 realmente escalou (rem), ação principal visível/habilitada/`click({trial})`/não encoberta, último conteúdo alcançável por rolagem | 6/6 projetos verdes |
| B · text-size-adjust | cenário separado; Chromium emulado ignora (h2 20→20px) — registrado como anotação, não substitui o Android | 6/6 |
| Rolagem | lock do fundo (roda sobre backdrop), rolagem interna até o fim, safe-area (≥36px a 150%), posição preservada ao fechar (tolerância 12px: layout tardio da página), abrir/fechar ×5 sem overlay duplicado | 6/6 (após fix #9) |
| A11y | role/aria-modal/nome/descrição resolvem ao título/resumo, foco inicial dentro, Tab ×6 contido, nomes nos botões, alvos ≥44px, Esc fecha | 6/6 |
| Jornada real | notificação inserida no banco dev → `/notificacoes` → Enter no item → sheet com 3 métricas e badge → "Entendido" fecha, foco volta ao item, dispensa persistida, notificação lida | 6/6 |
| Visual | `toHaveScreenshot` do sheet (base 100%, título longo 200%, 8 métricas 150%, métrica longa 200%, curto 85%) + viewport (base 100%), `maxDiffPixelRatio 0.002`, animações desligadas, `fonts.ready` | baselines revisadas a olho; 6/6 |

Total: 84 testes verdes (14 × 6 projetos).

## 5. Validação por CSS/navegador × Android/WebView real

- **CSS/navegador (A)**: `html.fontSize` escala rem/em (Tailwind, MUI, theme). Não escala px fixos; não é a configuração do Android.
- **Android/WebView real (C)**: emulador Samsung (API 37, `sdk_gphone16k_x86_64`), APK **debug** apontando para o preview na LAN (config temporária, revertida), Playwright `_android` conectado ao WebView, `settings put system font_scale` 1.0 → 1.3 → 1.5 → 2.0, mesma geometria compartilhada, screenshots `e2e/screenshots/android-fontscale-<escala>-<fixture>.png`, resultados em `android-fontscale-results.json`. `font_scale` restaurado para 1.0 ao final.
  - Resultado (360 CSS px de largura no WebView): font_scale 1.0 → h2 20px/chip 12px; 1.3 → 26/15,6px; 1.5 → 30/18px; 2.0 → 40/24px. Em todas as escalas × fixtures (base, métrica longa, 8 métricas): 0 cortes/sobreposições e ação principal alcançável. Em dois passes a fixture de 8 métricas falhou de forma intermitente no harness (sheet fechando entre passos sob carga do emulador; 1.3 e 1.5); no passe diagnóstico a 1.5 e no passe a 2.0 passou com clique — sem defeito de layout.

## 6. Screenshots representativas

`packages/web/e2e/__screenshots__/insight-sheet/w390/sheet-base-100.png`, `w360/sheet-longTitle-200.png`, `w412/sheet-longMetric-200.png`, `w390/sheet-manyMetrics-150.png`, `w360-short/viewport-base-100.png`, `android-pixel5/viewport-base-100.png`, `desktop-1440/sheet-short-85.png`; jornada real: `e2e/screenshots/insight-journey-<projeto>.png`; Android real: `e2e/screenshots/android-fontscale-*.png`.

## 7. Limitações e observações

- Chromium desktop/emulado ignora `-webkit-text-size-adjust`; a escala do sistema só foi validada de verdade no WebView do emulador (seção 5).
- O emulador exige CPU livre: com build/Gradle em paralelo o QEMU trava threads e o `adb install` não conclui.
- Fora do escopo (não alterado): na página de notificações o título "Notificações" quebra no meio da palavra em 393px (Pixel 5) — ver `android-pixel5/viewport-base-100.png`.
- Android validado em emulador (não em aparelho físico); o APK usado é debug apontando para o preview na LAN (config revertida antes do AAB). Intermitência do harness no emulador na fixture mais alta (ver seção 5).
