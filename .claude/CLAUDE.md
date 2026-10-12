# graphify
- **graphify** (`.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
When the user types `/graphify`, invoke the Skill tool with `skill: "graphify"` before doing anything else.

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