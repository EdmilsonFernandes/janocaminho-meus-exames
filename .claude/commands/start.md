# Start do Projeto

Antes de executar qualquer tarefa, leia e confirme o contexto carregado.

Leia nesta ordem:

1. `CLAUDE.md`
2. `.claude/STARTUP.md`
3. `.claude/AGENTS.md`
4. `.claude/GRAPH_RULES.md`

Depois verifique se existem (cada skill = `.claude/skills/<nome>/SKILL.md`, com frontmatter `name` + `description`):

- product-designer · ui-ux-reviewer · mobile-first-designer · design-system-guardian · frontend-refactor
- playwright-visual-qa · accessibility-reviewer · performance-reviewer · cybersecurity-reviewer · conversion-copywriter
- health-human-factors · health-compliance-review
- impeccable

Verifique também:

- `graphify-out/graph.json` — e se está atualizado: `Built from commit` no `GRAPH_REPORT.md` × `git rev-parse --short HEAD`
- `graphify-out/wiki/index.md`
- `graphify-out/GRAPH_REPORT.md`
- `.mcp.json`
- `.serena/project.yml`

Responda neste formato:

## Contexto carregado

- CLAUDE.md: lido / não encontrado
- STARTUP.md: lido / não encontrado
- AGENTS.md: lido / não encontrado
- GRAPH_RULES.md: lido / não encontrado

## Skills encontradas

Uma linha por skill da lista acima: ok / ausente / quebrada (frontmatter inválido).

## Ferramentas disponíveis

- Graphify (grafo atualizado? quantos commits atrás):
- Serena:
- Context7:
- GSD:
- Playwright:

## Regras principais carregadas

Liste as principais regras que você deve seguir neste projeto.

## Próximo passo

Não altere código ainda. Apenas confirme que o contexto foi carregado.
