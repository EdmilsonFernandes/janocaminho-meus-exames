# Redesign da Home — Health Command Center (V2)

> Norteador: a Home não responde "tudo sobre minha saúde" — responde **"o que eu preciso saber agora?"**
> Em 5s: como estou. Em 30s: o que mudou / o que merece atenção. No resto: investigação e ação.

## Diagnóstico (no código `pages/Dashboard.tsx`)

A Home legacy renderiza **13 blocos em coluna única vertical**, com **5 cards contando a mesma história** de formas diferentes (score, leitura de risco, cardiometabólico, estado atual, distribuição) → o usuário fica "afinal, tô bem ou mal?". Desktop = coluna "wide" com espaço ocioso nas laterais.

## Princípios
1. Home = **painel de decisão**, não relatório.
2. **Uma só hierarquia de saúde** (collapsar os 5 cards de status).
3. **Progressive disclosure** (níveis 5s / 30s / investigação / ação).
4. **Reuso total** dos componentes existentes — sem reescrever lógica clínica/cálculos nem backend.
5. **Zero mudança de API/regra médica.** Dados novos ("Desde seu último exame") já vêm do `/patients/:id/health-summary` (`topAttention`, `improving`, `byPriority`, `staleWarning`).

## Implementação
- `components/dashboard/DashboardV2.tsx` — composição nova, **isolada**.
- `pages/Dashboard.tsx` — só ganhou um **wrapper de flag** (`DashboardLegacy` intacto):
  - `localStorage['me:newHome'] !== '0'` → V2 (default ON). `= '0'` → legacy.
- Primitiva `AppCard` (two-tone/glow) do design-system aplicada no hero.

## Matriz funcional — nada se perde

| Bloco legacy | Destino V2 | Onde |
|---|---|---|
| `DashboardHeader` (saudação) | mantido | topo |
| `FailedExamsAlert` | mantido (banner cond.) | topo |
| `HealthScoreCard` (score) | **HERO hierarquia única** (score + prioridades + última análise + CTA) | Home above-fold |
| `NextBestActionCard` | (V2 usa o hero + IA; CTA "Ver análise" cobre o caminho) | Home |
| `RiskCard` (leitura de risco) | compactado no hero ("importantes/moderados"); leitura completa | Home hero → `/tendencias` |
| `AiCard` (Dr. Exame) | **"Dr. Exame"** insight + CTA chat | Home |
| `CardiometabolicRiskCard` | **Tile ❤️** (nível + n fatores) → detalhe | Home indicadores → `/tendencias` |
| `CurrentStateCard` | foldado no hero (contagem de atenção) | Home hero |
| `BiologicalAgeCard` | **Tile 🧬** (reuso do card) | Home indicadores |
| `DistributionCard` (donut) | **sai da Home** (analítico) | `/exames` · `/evolucao` |
| `MetricCard ×4` | **Tiles 🩸 Exames / 📈 Evolução** + "Seus exames" compacto | Home indicadores |
| `QuickActions` | mantido | Home rodapé |
| `CreditsCard` | mantido | Home rodapé |
| `ShareHealthButton` / `ReviewPrompt` / biometria | mantidos (overlays cond.) | Home |
| **NOVO "Desde seu último exame"** | ↑pioraram / ↓melhoraram (topAttention + improving) | Home |

## Layout
- **Mobile:** hero → mudanças → Dr. Exame IA → indicadores (2×2) → ações.
- **Desktop:** grid responsivo (hero 7 + mudanças 5; IA full; indicadores 1×4).

## Validação
- `tsc --noEmit` (web) — ✅ limpo.
- Playwright: render mobile (390) + desktop (1366); fluxos (score→/tendencias, indicadores→rotas, chat); toggle legacy.
- Regression: fluxos funcionais preservados (login→home→alterados→risco→chat→exame→evolução).

## Rollout
Feature flag default ON → ship AAB 306. Reverte com `localStorage['me:newHome']='0'`. Legacy removível após confirmação de equivalência.
