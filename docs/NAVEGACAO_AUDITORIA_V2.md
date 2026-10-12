# Auditoria de Navegação — Dr. Exame (plano V2)

> Princípio: *bottom-nav mostra pra onde o usuário normalmente vai; drawer oferece atalhos e organiza o resto; Home mostra o que ele precisa saber agora.* O drawer **não** é uma segunda Home. **Nenhuma funcionalidade é removida.**

---

## A. Auditoria atual — problemas + evidências

### A.1 Arquitetura atual (como está hoje)
- **Bottom nav** (só mobile, `components/MobileBottomNav.tsx`): **Início(/) · Exames(/exams) · Dr. Exame(/chat, avatar 🤖 central) · Evolução(/evolucao) · Mais**(→`openDrawer`). Já premium, sem emojis, filled/outlined no ativo.
- **Menu** (`AppMenu`, `App.tsx:184`) — **fonte única**, renderizado em 2 lugares:
  - Mobile: `<AppDrawer>` overlay (`App.tsx:301`), aberto pelo ☰ do AppBar e pelo "Mais".
  - Desktop: **Sidebar persistente** react-admin (`App.tsx:428` `menu={AppMenu}`, forçada aberta `L421-422`). In-flow, shell centralizado cap 1728px.
- **Estrutura do AppMenu** (`App.tsx:198-266`): grid 9 tiles + 3 acordeões (Minha saúde / Família & Médicos / Conta) + Apoio (Suporte, Sobre, Sair).

### A.2 Problemas encontrados
1. **Redundância com a bottom-nav** — `MobileBottomNav.tsx:17-22` vs `App.tsx:200-208`: **Início, Exames, Evolução** estão no bottom-nav **E** repetidos como tiles do grid. O drawer replica destinos primários em vez de ser complementar.
2. **Redundância interna no drawer** — `App.tsx:198-227` (grid) vs `App.tsx:230-239` (acordeão): **Alterados, Tendências, Linha do Tempo** aparecem como tile **e** como item do acordeão "Minha saúde" — mesma função, dois lugares no mesmo menu.
3. **Inconsistência de ícones**:
   - **Exames**: `Description` no bottom-nav (`MobileBottomNav.tsx:69`) vs `MedicalInformation` no grid (`App.tsx:201`) — 2 ícones p/ a mesma função.
   - **Evolução**: `TrendingUp` no bottom-nav vs `Insights` no grid.
   - **Privacidade e Emergência**: ambas `HealthAndSafety` (`App.tsx:237` e `:250`) — funções distintas, ícone igual.
4. **Grid denso** (`App.tsx:198`): 9 tiles em 3 colunas misturando destinos primários com atalhos.
5. **Drawer mobile longo**: grid(9) + 3 acordeões + apoio → scroll vertical excessivo.
6. **Hierarquia plana**: sem 3 níveis visuais formais; destaque só por cor (highlight teal).

### A.3 Duplicação desnecessária vs acesso contextual legítimo
- **Remover (desnecessária)**: Início/Exames/Evolução no grid (já no bottom-nav); Alterados/Tendências/Linha-do-Tempo duplicados grid↔acordeão.
- **Manter (contextual legítima)**: **Perguntas para o médico** — atalho no drawer (`/perguntas`) **e** contextual dentro de análise/exame/alterados/risco. Contextos diferentes → manter ambos.

---

## B. Navigation Inventory (tudo que existe hoje)

| Função | Rota | Onde aparece hoje | Componente/Página |
|---|---|---|---|
| Início/Dashboard | `/` | bottom-nav + grid | `Dashboard` (V2) |
| Exames | `/exams` | bottom-nav + grid | `ExamList`/`ExamShow` |
| Dr. Exame (chat/IA) | `/chat` | bottom-nav (avatar) | `Chat` |
| Evolução | `/evolucao` | bottom-nav + grid | `Evolution` |
| Valores alterados | `/alterados` | grid + acordeão Minha saúde | `ValoresAlterados` |
| Tendências | `/tendencias` | grid + acordeão | `Trends` |
| Linha do Tempo | `/linha-do-tempo` | grid + acordeão | `Timeline` |
| Perguntas p/ médico | `/perguntas` | grid + contextual | `Questions` |
| Saúde da Família | `/familia` | grid | `Family` |
| Relatório completo | `/relatorio` | grid | `ConsolidatedReport` |
| Medições | `/medicoes` | acordeão Minha saúde | `Measurements` |
| Vacinas | `/vacinas` | acordeão | `Vaccines` |
| Lembretes | `/lembretes` | acordeão | `Reminders` |
| Cartão de Emergência | `/emergencia` | acordeão | `EmergencyCard` |
| Conquistas | `/conquistas` | acordeão | `Conquistas` |
| Dependentes | `/patients` | acordeão Família & Médicos | (family/dependents) |
| Médicos | `/medicos` | acordeão | `Medicos` |
| Despesas | `/despesas` | acordeão | `Expenses` |
| Perfil | `/perfil` | acordeão Conta | `Profile` |
| Segurança | `/seguranca` | acordeão | `Security` |
| Privacidade | `/privacidade` | acordeão | `Privacy` |
| Planos | `/planos` | acordeão | `Plans` |
| Admin | `/admin` | acordeão (só ADMIN) | `Admin` |
| Suporte | `/suporte` | apoio | `Support` |
| Sobre o app | (dialog) | apoio | dialog `App.tsx:269` |
| Sair | (`logout`) | apoio | `useLogout` |
| Notificações | `/notificacoes` | (só acesso programático) | `Notifications` |

---

## C. Arquitetura proposta

**Bottom nav** — mantida (auditoria não achou problema objetivo): Início · Exames · Dr. Exame(avatar) · Evolução · Mais. *(Dr. Exame permanece avatar — marca.)*

**Drawer (`AppMenu` V2)** — deixa de duplicar a bottom-nav:

```
┌─ ACESSO RÁPIDO (grid 2 col) ──┐   ← só atalhos que NÃO estão na bottom-nav
│ ▲ Valores alterados   💬 Perguntas
│ 📈 Tendências         📄 Relatório
│ 🕓 Linha do Tempo     👥 Saúde da Família
└───────────────────────────────┘

▾ MINHA SAÚDE                    ← só o que é acompanhamento pessoal
   🩺 Medições · 💉 Vacinas · 🔔 Lembretes
   🛡 Cartão de Emergência · 🏆 Conquistas
   (sem repetir alterados/tendências/linha-do-tempo — já estão no acesso rápido)

▾ FAMÍLIA & MÉDICOS
   👥 Familiares/Dependentes · 🩺 Médicos
   🔗 Compartilhamento · ✅ Autorizações · 💸 Despesas

▾ CONTA
   👤 Perfil · 🔒 Segurança · 🛡 Privacidade · 💎 Planos
   ⚙ Admin (só ADMIN)

─────────────────
❓ Ajuda & Suporte · ℹ Sobre · ↩ Sair (destrutivo, discreto)
```

Mobile = drawer overlay; Desktop = sidebar persistente (mesmo `AppMenu`).

---

## D. Mapa de equivalência (cada item atual → destino V2 — nada removido)

| Item atual | Destino V2 | Observação |
|---|---|---|
| Início (grid) | **removido do grid** (fica só bottom-nav) | dedup |
| Exames (grid) | **removido do grid** (só bottom-nav) | dedup |
| Evolução (grid) | **removido do grid** (só bottom-nav) | dedup |
| Valores alterados | acesso rápido (grid) | tira do acordeão (dedup interna) |
| Tendências | acesso rápido (grid) | tira do acordeão |
| Linha do Tempo | acesso rápido (grid) | tira do acordeão |
| Perguntas | acesso rápido (grid) + mantém contextual | legítimo |
| Relatório | acesso rápido (grid) | — |
| Saúde da Família | acesso rápido (grid) + detalhe em Família & Médicos | acesso rápido + categoria |
| Medições, Vacinas, Lembretes, Emergência, Conquistas | acordeão **Minha Saúde** | — |
| Dependentes, Médicos, Despesas | acordeão **Família & Médicos** (+ Compartilhamento/Autorizações se existirem) | — |
| Perfil, Segurança, Privacidade, Planos, Admin | acordeão **Conta** | — |
| Suporte, Sobre, Sair | **Apoio** (rodapé, Sair destrutivo discreto) | — |
| Notificações | mantém acesso programático (só se preciso adicionar atalho) | — |

**Zero itens "removidos".**

---

## E. Sistema de ícones (atual → proposto · biblioteca `@mui/icons-material`)

> Não instalar Lucide. Mapeamento das preferências semânticas → **Material icons** (a família já instalada). Ver comparação visual em **`docs/icon-matrix.html`** (abra no navegador). Dr. Exame = avatar (fora da matrix).

| Função | Atual | Proposto (topo) | Alternativas Material |
|---|---|---|---|
| Início | Home/HomeOutlined | **HomeOutlined** | CottageOutlined, DashboardOutlined |
| Exames | Description (nav) / MedicalInformation (grid) ❗ | **FactCheckOutlined** | MedicalInformationOutlined, DescriptionOutlined, RuleOutlined |
| Dr. Exame | avatar 🤖 | **avatar (manter)** | — |
| Evolução | TrendingUp (nav) / Insights (grid) ❗ | **InsightsOutlined** | TrendingUpOutlined, ShowChartOutlined, StackedLineChartOutlined |
| Mais | Menu | **Menu** | MoreHoriz, Apps |
| Valores alterados | WarningAmber | **WarningAmberOutlined** | ReportProblemOutlined (não alarmista) |
| Perguntas | QuestionAnswer | **QuestionAnswerOutlined** | ForumOutlined, ContactSupportOutlined |
| Tendências | AutoGraph | **AutoGraphOutlined** | ShowChartOutlined, QueryStatsOutlined |
| Relatório | Summarize | **AssessmentOutlined** | DescriptionOutlined, ArticleOutlined |
| Linha do Tempo | History | **HistoryOutlined** | ScheduleOutlined, RestoreOutlined |
| Saúde da Família | Diversity3 | **Diversity3Outlined** | GroupsOutlined, FamilyRestroomOutlined |
| Minha Saúde (cat.) | MonitorHeart | **MonitorHeartOutlined** | FavoriteOutlined |
| Medições | MonitorHeart | **SpeedOutlined** | MonitorHeartOutlined, ScaleOutlined |
| Vacinas | Vaccines | **VaccinesOutlined** | MedicalServicesOutlined |
| Lembretes | EventAvailable | **NotificationsOutlined** | EventAvailableOutlined, AlarmOutlined |
| Cartão de Emergência | HealthAndSafety ❗(=Privacidade) | **ContactEmergencyOutlined** | ShieldOutlined, HealthAndSafetyOutlined |
| Conquistas | EmojiEvents | **EmojiEventsOutlined** | MilitaryTechOutlined, WorkspacePremiumOutlined |
| Familiares | Diversity3 | **GroupsOutlined** | PeopleOutlined |
| Médicos | MedicalServices | **MedicalServicesOutlined** | HealthAndSafetyOutlined |
| Compartilhamento | (novo atalho) | **IosShareOutlined** | ShareOutlined |
| Autorizações | (novo atalho) | **HowToRegOutlined** | VerifiedUserOutlined |
| Conta | AccountCircle | **ManageAccountsOutlined** | AccountCircleOutlined |
| Ajuda & Suporte | HelpOutline | **SupportOutlined** | ContactSupportOutlined |
| Sobre | Info | **InfoOutlined** | — |
| Sair | Logout | **Logout** | LogoutOutlined |

**Regra de família**: tudo **Outlined** (mesma família visual, peso consistente), exceto estado ativo (filled) na bottom-nav. Resolve a mistura filled/outline aleatória.

**Hierarquia em 3 níveis** (sem depender só de cor):
- **N1 navegação principal** (bottom-nav): 22px filled no ativo.
- **N2 ações importantes** (tiles do acesso rápido): 22px em container teal-tint (AppCard interactive).
- **N3 secundária** (acordeões + apoio): 19px monocromático neutro.

---

## F. Wireframe textual

**Mobile — drawer fechado**: só bottom-nav visível.
**Mobile — drawer aberto** (overlay ~84% largura, backdrop):
```
[✕]                              ← fechamento intuitivo (top-right)
╭──────────────────────╮
│ ACESSO RÁPIDO         │
│ [▲ Alterados][💬 Perg.]│  ← grid 2 col, tiles c/ container N2
│ [📈 Tend.][📄 Relat.]  │
│ [🕓 Timeline][👥 Fam.] │
╰──────────────────────╯
▾ Minha Saúde            ← acordeão (smart-expand na rota ativa)
▾ Família & Médicos
▾ Conta
────────────────
❓ Suporte   ℹ Sobre
↩ Sair (vermelho discreto)
```
Estados: default/hover/pressed/focus-visible/active(disabled). Touch target ≥44px. aria-expanded nos acordeões, aria-current no ativo, aria-label em todo ícone.

**Desktop** — mesma árvore, mas **sidebar persistente** (não overlay), largura fixa do paper docked, conteúdo flui ao lado.

---

## G. Plano técnico

Arquivos a alterar (todos no `packages/web/src`):
1. **`App.tsx`** — reescrever o `AppMenu` (`L184-296`): grid só com 6 atalhos (2-col N2), 3 acordeões limpos (Minha Saúde sem repetir alterados/tendências/timeline), Apoio. Adicionar `Compartilhamento`/`Autorizações` se as rotas existirem (validar). Unificar ícones (outlined).
2. **`MobileBottomNav.tsx`** — alinhar ícones da bottom-nav com a matrix (Exames→FactCheck, Evolução→Insights) p/ consistência grid↔nav.
3. **(opcional) i18n** — chaves novas (`menu.share`, `menu.authorizations`) se addItem.
4. **Feature flag** — `localStorage['me:navV2']` (default ON), legacy `AppMenu` guardado, análogo ao Home V2.

**Incremental**: atrás de flag, typecheck a cada passo, Playwright (mobile+desktop) comparando antes/depois, sem remover o legado até validar equivalência.

---

## H. Riscos + proteção

| Risco | Proteção |
|---|---|
| Perder acesso a uma rota ao reorganizar | Mapa de equivalência (seção D) + inventário (B) conferem item-a-item; regression test de cada rota no Playwright. |
| Quebrar desktop (sidebar persistente) | Mesmo `AppMenu` alimenta os dois; validar 1366/1440/1920 no Playwright. |
| Acordeão smart-expand regressivo | Manter lógica `MenuSectionAccordion` (`routes`+pathname) — só reorganizar itens. |
| Ícone trocado confundir usuário | Icon matrix aprovada antes; mudança consistente (1 família outlined). |
| Touch target/contraste/a11y | Check accessibility (aria-expanded/current, focus-visible, ≥44px, contraste AA). |
| Overlap drawer↔bottom-nav | Drawer overlay com backdrop; bottom-nav fica abaixo do z-index do drawer (já é assim). |

**Ordem de execução (só após aprovação)**: icon matrix → aprovar ícones → `AppMenu` V2 atrás de flag → bottom-nav alinhada → Playwright (8 viewports + 13 fluxos) → a11y → remover flag.
