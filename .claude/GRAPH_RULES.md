# Graphify Rules

> **Graphify é o mapa principal. Toda alteração começa por ele.**
> Nunca alterar código sem antes consultar o grafo — saber o impacto ANTES de editar.

## O que descobrir antes de criar/alterar um componente
- **Quem usa** este componente? (`graphify explain "<simbolo>"`)
- **Quem depende** dele? (`graphify path "<componente>" "<alvo>"`)
- **Quem será impactado** pela mudança? (mobile vs desktop vs server)
- **Existe componente semelhante** ou duplicação?
- **Existe padrão** compartilhado que devo seguir?

## Princípios
- **Reuso primeiro.** Nunca criar componente novo se já existir um semelhante — estender o existente.
- **Sem duplicação.** Se duas peças fazem o mesmo, consolidar.
- **Atualizar o grafo** após grandes alterações (muito depois de adicionar/remover componentes relevantes), para a próxima sessão já ter o mapa certo.

## CLI real do Graphify
| Comando | Uso |
|---|---|
| `graphify query "<pergunta>"` | busca orientada no grafo para perguntas amplas |
| `graphify path "A" "B"` | caminho mais curto entre dois nós no grafo (relações de dependência) |
| `graphify explain "X"` | explicação em linguagem natural de um nó e seus vizinhos |
| `graphify diagnose multigraph` | detecta risco de colapso de arestas same-endpoint |
| `graphify install/uninstall` | instala/desinstala a skill nas plataformas |

- O grafo vive em `graphify-out/graph.json` (versionado no repo). Se faltar, reconstruir antes de usar.
- Graphify não está declarado em `.mcp.json` neste projeto; o uso padrão aqui é CLI/skill. Se quiser expor como MCP, rodar/configurar o modo `graphify --mcp`.

## No dia-a-dia deste projeto
- Para localização precisa de código, combinamos: **Graphify** (relações/impacto amplo) → **Serena** (símbolo exato, body, referências). Os dois se complementam.
- Se o Graphify não responder rápido o suficiente, Serena + `Grep`/`Glob` resolvem a localização; Graphify brilha no "quem depende de quem".
