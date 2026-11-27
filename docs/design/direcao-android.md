# Direção visual Android — "Clínico sereno"

Rascunho para revisão (27/11/26). Vale para o app Android (`com.janocaminho.drexame`) e, por
tabela, para a web no celular — é a mesma interface dentro do WebView.

## Para quem e para quê

Quem abre o Dr. Exame acabou de receber um resultado ou está voltando a ele, quase sempre com
alguma ansiedade e com o celular numa mão só. Nos primeiros segundos a pessoa quer duas
respostas: **tem algo errado?** e **o que eu faço agora?** Tudo o mais vem depois.

O tom é o de um bom laudo explicado por alguém calmo: preciso nos números, gentil no texto,
sem alarme decorativo. Material 3 é a referência de **comportamento** (alvos de toque, estados,
voltar, barras do sistema, teclado). A **aparência** continua sendo do Dr. Exame: teal
`#20b2aa`, cobre `#d4a574`, o robô e a estrelinha de IA (regras de `.claude/DESIGN_SYSTEM.md`).

## Tipografia

| Papel | Fonte | Tamanho / linha | Peso | Uso |
|---|---|---|---|---|
| Número de resultado | Poppins, algarismos tabulares | 28 / 32 | 800 | o valor de cada exame |
| Título de tela | Poppins | 22 / 28 | 800 | um por tela |
| Título de seção | Poppins | 17 / 24 | 700 | "Fora da faixa", "Todos os resultados" |
| Corpo | Inter | 16 / 24 | 400 | texto corrido — 16 é o mínimo legível no Android |
| Rótulo | Inter | 14 / 20 | 600–700 | nome do item, faixa de referência, datas |
| Legenda | Inter | 13 / 18 | 500 | só informação secundária, nunca dado de saúde |

- Nada de dado de saúde abaixo de 14 px.
- Com fonte ampliada do sistema (Ajustes › Tamanho da fonte), o WebView escala o texto. Layouts
  usam quebra de linha, nunca altura fixa para texto; número e unidade quebram juntos.

## Espaçamento

Grade de 4 dp. Margem da tela 16; respiro dentro do cartão 16; entre seções 24; entre itens
de lista 12. Alvo de toque **48 dp** (Material; o mínimo antigo do projeto era 44 px).

## Cor

A cor nunca é a única pista: todo estado de resultado tem **ícone + texto + cor**.

| Estado | Texto (claro / escuro) | Ícone | Rótulo |
|---|---|---|---|
| Na faixa | `#047857` / `#34d399` | ✓ círculo | "Na faixa" |
| Acima | `#b45309` / `#fbbf24` | seta para cima | "Acima" |
| Abaixo | `#b45309` / `#fbbf24` | seta para baixo | "Abaixo" |
| Crítico | `#b91c1c` / `#f87171` | alerta | "Crítico" |
| Sem referência | `#475569` / `#94a3b8` | traço | "Sem faixa do laboratório" |

- Teal é identidade e ação (botão principal, item ativo). Não é usado para dizer "normal".
- Fundo tingido só em estado (regra de profundidade do projeto), com 7–12% de opacidade.
- Contraste de texto ≥ 4,5:1 nos dois temas.

## Superfícies

Fundo `#eef7f6` / `#0f1818`; cartão `#ffffff` / `#1a2424` com borda de 1 px; sombra só no que
flutua (barra inferior, botão flutuante, folhas). No máximo dois níveis de caixa; lista dentro de
cartão usa divisória.

## Ícones

Família única Material Rounded (`@mui/icons-material/*Rounded`), 24 dp em ações, 20 dp em
linhas de lista. Emoji não entra em rótulo de estado.

## Estados de componente

- **Pressionado:** camada de estado de 10% aparece no toque (não no soltar), sem esperar a ondulação.
- **Foco (teclado/leitor de tela):** anel de 2 px teal com folga de 2 px.
- **Desabilitado:** superfície cinza clara e texto cinza legível, sem gradiente.
- **Carregando:** esqueleto com o formato do conteúdo que vai chegar (título, linhas de valor) —
  nada de círculo girando no meio da tela vazia.
- **Vazio:** frase do que falta + uma ação.
- **Erro:** o que aconteceu em linguagem simples + "Tentar de novo" + uma saída.

## Navegação

- Tela nova começa no topo; **Voltar devolve a pessoa exatamente onde ela estava**.
- Voltar na tela inicial manda o app para segundo plano (não prende a pessoa).
- Barra inferior para o que se usa toda semana; menu lateral para o resto (ver relatório de medição).
