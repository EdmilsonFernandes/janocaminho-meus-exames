# Startup Sequence

> Sequência obrigatória ao iniciar qualquer conversa neste projeto, **antes de alterar código**.
> Objetivo: entender o projeto inteiro antes de tocar em qualquer arquivo (nada "no escuro").

## PASSO 1 — Graphify (mapear o projeto)
- Garantir que o grafo existe: `graphify-out/graph.json` (já versionado no repo).
- Se faltar, reconstruir: `graphify` (skill) ou o comando de build do grafo.
- Usar para enxergar: pastas, componentes, hooks, providers, services, rotas, contextos, stores, tema, assets, navegação.
- **Nota de realidade:** Graphify funciona aqui como CLI/skill, não como MCP declarado no projeto. Comandos úteis: `graphify query "<pergunta>"`, `graphify path "A" "B"`, `graphify explain "X"`, `graphify diagnose multigraph`. Ver `.claude/GRAPH_RULES.md`.

## PASSO 2 — Serena (indexar o que importa)
- Projeto "Meus Exames" já ativado. `initial_instructions` já lido.
- Visão geral simbólica dos pontos onde vou trabalhar: `get_symbols_overview` → `find_symbol` (body) só do que preciso.
- Foco típico: Dashboard, rotas (App.tsx), Theme, Providers, recurso sendo alterado.

## PASSO 3 — Ler a base de conhecimento (on-demand, conforme relevância)
- `CLAUDE.md` (raiz — always-on, já carregado automaticamente).
- `.claude/ARCHITECTURE.md` — stack/arquitetura/decisões.
- `.claude/DESIGN_SYSTEM.md` — identidade visual e tokens.
- `.claude/TASK_RULES.md` — pipeline e validação.
- `.ai/SKILL.md` — ops profundo (SSH, migrations, emergência) só se a tarefa tocar deploy/infra.

## PASSO 4 — Relatório de inicialização
Antes de executar alterações, resumir:
- O que entendi do escopo.
- Arquivos/componentes impactados (com `file:line`).
- Plano em tarefas (GSD se configurado, senão sistema nativo de tasks).
- Riscos e dependências (quem usa o componente? impacto no mobile/desktop?).

## ⚠️ Estado atual das ferramentas (realidade)
| MCP | Status | Observação |
|---|---|---|
| **Graphify** | ✅ Funciona | Grafo em `graphify-out/`; CLI/skill com `query`, `path`, `explain`, `diagnose`. Não está em `.mcp.json`. |
| **Serena** | ✅ Funciona | MCP do projeto em `.mcp.json`; ferramentas semânticas disponíveis. |
| **GSD** | ⚠️ Global | Config global detectada; pode exigir login/provider para planejamento. Fallback = plano nativo do agente. |
| **Context7** | ✅ Global | MCP global para docs de libs (MUI, React, Prisma, etc.) sob demanda. |

> **Regra:** não executar nenhuma alteração de código antes de concluir o relatório (Passo 4).
