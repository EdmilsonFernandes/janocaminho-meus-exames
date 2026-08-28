# Meus Exames — Regras do Projeto

> **Guia completo (ops profundo)**: `.ai/SKILL.md` (stack, deploy, gotchas, SSH EC2, emergência, monetização).

## 📂 Framework `.claude/` + ops — carregados AUTOMATICAMENTE toda sessão
Os arquivos abaixo são importados no contexto base via `@` (a cada início de sessão, sem precisar ler on-demand).
Skills de UI/UX (`.claude/skills/`) continuam **sob demanda** — lidas só em tarefa de tela (ver seção de Skills abaixo).

**Docs modulares:**
@.claude/STARTUP.md
@.claude/AGENTS.md
@.claude/GRAPH_RULES.md
@.claude/ARCHITECTURE.md
@.claude/DESIGN_SYSTEM.md
@.claude/TASK_RULES.md

**Ops profundo (deploy/SSH/migrations/emergência/monetização):**
@.ai/SKILL.md
@.ai/agent-rules.md

**Comando `/start`:**
@.claude/commands/start.md

## Workflow do Agente (SEMPRE seguir)
1. **Procurar resposta**: Graphify CLI/skill (`graphify query "<pergunta>"`, `graphify explain "<nó>"`, `graphify path "<A>" "<B>"`) → se não achar → Context7 (docs de libs) → Serena (análise de código) → AI token (relay Z.ai, se precisar raciocínio extra).
2. **Planejar trabalho complexo**: usar GSD (`gsd` no terminal) pra milestones/slices/tasks → depois implementar aqui.
3. **No início de cada sessão**: ler CLAUDE.md (auto) + `.ai/SKILL.md` + memories (auto).
4. **Antes de commitar**: typecheck + testes (ver tabela abaixo) + confirmar deploy.
5. **Ferramentas disponíveis**:
   - **Graphify**: CLI/skill com knowledge graph em `graphify-out/` → `query`/`explain`/`path` para código/relações. Não está declarado como MCP em `.mcp.json`.
   - **Serena**: MCP do projeto para análise semântica de código → `.mcp.json` + `.serena/project.yml`.
   - **Context7**: MCP global para documentação atualizada de libs/frameworks.
   - **GSD**: MCP/CLI global para planejamento quando autenticado; fallback = plano nativo do agente.

## Stack (NÃO MUDAR)
- **Node 20** + Prisma 6 (não 7) + Capacitor 7 (não 8) + react-admin 5.14 + MUI ^7 (não 9)
- **IA**: GLM-4.6 via relay Z.ai (`ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic`). NUNCA `ANTHROPIC_API_KEY` real. Relay NÃO suporta structured output / effort. `thinking:{type:'disabled'}` PASSOU a ser aceito (validado 28/08/26, stream+ não-stream) — o adapter envia p/ glm-5* (sem isso o 5.3 "pensa" minutos e come o max_tokens).
- **Extração**: pdftotext → texto → GLM. NUNCA visão (relay alucina em PDF).
- **Portas**: backend 4001, Postgres 5433 (janocaminho ocupa 4000/5432).

## Validação OBRIGATÓRIA antes de commitar
- **Server**: `cd packages/server && npx tsc --noEmit && npm test` (vitest + supertest).
- **Web**: `cd packages/web && npx tsc --noEmit` (vite build NÃO type-checka — CI pega e quebra deploy).
- **Schema**: `npx prisma generate` + `DATABASE_URL=...test... npx prisma db push` + `npm test`.
- **Drift gate (Prisma/prod)**: se mexer em `schema.prisma`, billing, admin financeiro, `subscriptions` ou qualquer campo Prisma recém-adicionado, comparar `schema.prisma` x `packages/server/prisma/migrations/`. Se a coluna existe no schema e não existe em migration aplicável, parar: criar migration aditiva ou implementar fallback compatível antes do push.
- **Query rule p/ produção**: em tabelas sujeitas a drift (`subscriptions`, `payments`, features novas), evitar `findMany/findFirst/findUnique` implícitos que leem todas as colunas. Preferir `select` explícito e degradar com segurança quando a coluna opcional não existir no banco.
- **NUNCA** `npx vitest` da raiz (CWD vaza → pode truncar DB dev). Sempre `npm test --workspace packages/server`.

## Deploy (automático: git push → GHCR → EC2 pull)
- **CI gate**: vitest roda ANTES do build (falhou = não deploya).
- **Migrations**: `prisma migrate deploy` no boot do container. NUNCA `db push` em prod.
- **502 (migration P3009)**: `UPDATE _prisma_migrations SET finished_at=now() WHERE finished_at IS NULL;` + restart.

## APK/AAB
- **versionCode +1 SEMPRE** antes de AAB (`app/build.gradle`). Nunca reusar.
- **VITE_BASE './'** (relativa) — imune ao MSYS path-mangling no Windows.
- **navigate(0)/reload() CRASHA o APK** → usar `useRefresh()`.
- **Push**: `channel_id` NUNCA custom (Android 8+ descarta se canal não existe).
- Build: `cd packages/mobile && npm run sync && cd android && ./gradlew bundleRelease`.

## Top Gotchas
| Sintoma | Causa | Fix |
|---|---|---|
| Push não chega | `channel_id: 'meus-exames'` inexistente | Remover channel_id |
| React #310 | Hook depois de early-return | Todos hooks antes de return |
| APK tela branca | VITE_BASE '/' manglado pelo MSYS | VITE_BASE './' |
| Container restart loop | Migration P3009 (falhou) | Marcar aplicada + restart |
| `@capacitor/core@8` warning | Hoisting do monorepo | Ignorar (cosmético; runtime usa 7.6.7) |

## Convenções
- **CRM**: normalizado `${numero}-${UF}` (`normalizeCrmKey()` em `doctor.routes.ts`).
- **DB tabela**: `users` (minúscula via @@map). Schema DB: `public`.
- **DB URL p/ psql**: tira `?schema=public` (psql não aceita).
- **normalizeKey**: stripa acentos → regex patterns SEM acento (MEDICO, ATENCAO).

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

---

# Skills de UI/UX e Produto

Quando a tarefa envolver tela, layout, app, mobile, web, desktop, painel admin, design, responsividade ou experiência visual, carregar as skills abaixo conforme necessidade:

- `.claude/skills/product-designer.md`
- `.claude/skills/ui-ux-reviewer.md`
- `.claude/skills/mobile-first-designer.md`
- `.claude/skills/design-system-guardian.md`
- `.claude/skills/frontend-refactor.md`
- `.claude/skills/playwright-visual-qa.md`
- `.claude/skills/accessibility-reviewer.md`
- `.claude/skills/performance-reviewer.md`
- `.claude/skills/cybersecurity-reviewer.md`
- `.claude/skills/conversion-copywriter.md`
- `.claude/skills/impeccable` (design/UI craft de alto nível — junction p/ `.agents/skills/`; instalada via `npx skills`. **Sempre disponível**, ativa em tarefas de UI/redesign/polimento. Invocar: `/impeccable`)

## Ordem recomendada para tarefas de tela

1. Graphify para mapear componentes, rotas, estilos, services e dependências.
2. design-system-guardian para preservar identidade visual.
3. product-designer para avaliar jornada e objetivo da tela.
4. ui-ux-reviewer para revisar layout, hierarquia, contraste, espaçamento e estados.
5. mobile-first-designer para garantir responsividade.
6. accessibility-reviewer para revisar contraste, labels, foco e navegação.
7. frontend-refactor para implementar com código limpo.
8. performance-reviewer quando houver lentidão, listas grandes ou tela pesada.
9. cybersecurity-reviewer quando houver login, dados sensíveis, exames, upload, IA, admin ou API.
10. playwright-visual-qa para validar visualmente.

## Antes de alterar código de tela

Sempre listar:

- arquivos envolvidos;
- fluxo atual;
- problemas encontrados;
- riscos;
- plano de alteração;
- validação prevista.

Não alterar nada grande sem plano.

## Como usar as skills

Quando eu pedir melhoria de tela, layout, mobile, desktop, web, painel admin ou UX, o agente deve:

1. Ler esta seção.
2. Abrir as skills relevantes em `.claude/skills/`.
3. Usar Graphify antes de mexer no código.
4. Usar Serena para localizar arquivos reais.
5. Usar Playwright para validar visualmente quando houver alteração de tela.
