# Agentes / MCPs — Papéis

Pipeline fixa (ideal): **Graphify → Serena → GSD → Context7 → Implementar → Testar → Atualizar Grafo**.
Cada MCP tem um papel; não pular a ordem sem motivo.

---

## 🕸 Graphify — Entender a arquitetura
- **Sempre executa primeiro.** Mapeia o projeto inteiro (componentes, dependências, impacto).
- Responde "quem usa / quem depende / existe duplicação?" antes de eu tocar no código.
- **Realidade:** CLI = `path`/`explain`/`diagnose multigraph` (sem `query`); grafo em `graphify-out/graph.json`. Ver `.claude/GRAPH_RULES.md`.

## 🔍 Serena — Localizar e editar código (semântica)
- **Nunca editar arquivos de código sem Serena.** Ferramentas simbólicas são mais precisas e baratas que `Read`/`Edit` crus.
- Visão geral: `get_symbols_overview`. Leitura: `find_symbol` (`include_body`). Referências: `find_referencing_symbols`. Edição: `replace_symbol_body` / `replace_content` / `insert_*_symbol`.
- **Realidade:** projeto "Meus Exames" ativado; `initial_instructions` já lido. Funciona (usado em produção nesta sessão).

## 📋 GSD — Planejar (milestones / slices / tasks)
- **Nunca executar tarefas grandes sem planejamento.** `gsd` no terminal do user gera milestones/slices/tasks.
- **Realidade:** CLI presente, mas **sem API key** → `gsd --print` erro "No API key found". O user precisa rodar `gsd` interativo e fazer `/login` num provider. **Fallback enquanto não configurado:** sistema nativo de tasks (`TaskCreate`/`TaskUpdate`) + `EnterPlanMode` para planejar e aprovar.

## 📚 Context7 — Documentação oficial de libs
- **Nunca assumir APIs** de MUI/React/Capacitor/Prisma de cabeça. Consultar quando houver dúvida de API/versão.
- **Realidade:** MCP funcional, sob demanda.

---

## Como combinam na prática
1. **Graphify** — visão de impacto/dependências.
2. **Serena** — símbolo exato, body, referências, edição.
3. **GSD** (ou tasks nativas) — dividir em tarefas e aprovar plano.
4. **Context7** — só quando uma API de lib estiver em dúvida.
5. **Implementar** — Serena para editar; validar com typecheck + testes.
6. **Atualizar o grafo** depois de mudanças estruturais.

> Se um MCP estiver indisponível (ex.: GSD sem key), usar o equivalente que funciona e **anotar** o fallback — não travar a tarefa.
