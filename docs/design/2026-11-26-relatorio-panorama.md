# Relatório completo → Panorama da saúde (26/11/2026)

> Pedido do dono (26/11): o "Relatório completo" não pegava tudo que o app tem (menu Rotina de saúde:
> saúde mental, diário, sinais vitais…). Virar o **resumo de tudo que o app sabe sobre a minha saúde** —
> visual, interativo, sem ser um livro. Dono aprovou o esboço (`design-lab/mocks/panorama-saude-v1.html`,
> não versionado) e decidiu: cartões e histórias **grátis**; análise da IA por **3 créditos**, configurável no
> admin; menu passa a chamar **"Panorama completo"**; história **não avança sozinha**.

## O que a pessoa vê (rota `/relatorio`)

1. **Herói "como você está"** — o placar da Home (mesmo número, mesma régua), o que mais puxa o placar para
   baixo e "9 de 12 áreas do panorama preenchidas".
2. **O que mudou** — até 3 cartões que rolam de lado. Sem mudança real, diz "nada mudou".
3. **Suas áreas** — um azulejo por área: número grande, unidade, **de quando é o dado** e uma frase curta.
4. **Modo história** — ao tocar num azulejo: folha com barra de progresso, "área n de 9", 3–4 cartões
   (número → gráfico ou lista → próximo passo). No fim, o convite para a análise do Dr. Exame.
5. **Para completar o panorama** — o que o app ainda não sabe, com o atalho para a tela certa.
6. **Análise do Dr. Exame** — o relatório consolidado que já existia (texto, áudio, PDF, perguntas), agora
   como última parte da página.

## Áreas e de onde vêm os dados

Tudo determinístico e grátis — nenhum crédito, nenhuma chamada de IA no panorama.

| Área | De onde vem |
|---|---|
| Exames e sangue | `Exam`/`ExamItem` (CPF divergente fica de fora), `/retest` |
| Coração e pressão | medições de pressão + snapshot do `health-state` (risco cardiometabólico, idade do corpo) |
| Peso e corpo | medições de peso, IMC, `BodyComposition` |
| Hormônios e vitaminas | TSH, T4 livre e vitamina D dos exames |
| Mente e humor | questionários PHQ-9 e GAD-7 (rastreio — nunca diagnóstico) |
| Diário de saúde | logs dos últimos 7 e 90 dias, sequência, sintomas mais marcados |
| Sono e atividade | `activity-summary` (Health Connect) |
| Remédios | medicamentos ativos + checagem de interações críticas |
| Consultas e perguntas | lembretes/consultas, perguntas para o médico |
| Vacinas, composição, cartão de emergência | status — sem dado entram em "Para completar" |

Contrato: `packages/shared/src/panorama.ts`. O servidor devolve **fatos** (`status`, `asOf`, `data`); as
**frases** são compostas na tela (`packages/web/src/utils/panoramaPresenter.ts`).

## Regras de segurança que o desenho respeita

- Toda área com dado mostra a idade do dado. Dado antigo (mais de 180 dias para exames e medidas, 90 para
  rastreio) aparece como antigo — e vence "pede atenção": valor de um ano atrás não é estado atual.
- Fora da faixa tem cor **e** seta **e** texto; faixa de referência sempre visível junto do valor.
- Saúde mental é "rastreio, não diagnóstico". Se o item 9 do PHQ-9 vier marcado, o cartão mostra o aviso
  de crise com o CVV 188 — mesmo com o rastreio antigo.
- Correlação não é contada como causa. "O que mudou" só lista o que os números mostram.
- Uma área que falha (tabela ainda não criada, erro, fonte lenta) volta `unavailable` sem derrubar as outras;
  resposta com área indisponível não entra no cache.
- Posse do paciente conferida antes do cache (403 para paciente de outra conta).

## Modo história — acessibilidade

Nunca avança sozinho. Botões de 44px, setas do teclado e Esc. Cartões fora de vista ficam `inert` e
`aria-hidden`; a trilha é região focável com rótulo "Exames e sangue — cartão 1 de 4"; o progresso é
`progressbar`; respeita `prefers-reduced-motion`; o cartão não tem altura fixa (rola com zoom); ao fechar,
o foco volta ao azulejo.

## O que mais mudou

- **Preço da análise completa:** padrão de 20 → **3 créditos** (`utils/credits.ts`, `utils/settings.ts`,
  `CreditBadge.tsx`). O valor salvo no banco vence o padrão — em produção ele é editado no admin
  (aba Preços → Custos de IA → Relatório consolidado).
- **Nome:** item de menu "Panorama completo" (em inglês "Full overview"), atalho da Home e rótulo do painel
  de uso. O produto comprado (pacote "Relatório completo") mantém o nome.
- **Rolagem:** toda troca de tela começa no topo (`components/ScrollToTopOnNavigate.tsx`). Antes, no app
  Android, quem estava no meio de Exames e abria Diário de saúde caía no meio do diário. Se a navegação
  sair da gaveta do menu (que trava a rolagem do corpo), o topo é aplicado assim que a trava sai.
- Extraídas para reuso, sem mudar comportamento: a conta do resumo de atividade
  (`analysis/activity-summary.ts`) e os utilitários do diário (`analysis/daily-log-utils.ts`).

## Verificação

| Verificação | Resultado |
|---|---|
| Typecheck do web / do servidor | 0 erros / 0 erros |
| Testes do servidor (12 arquivos: panorama, créditos, monetização, precificação, uso de IA, relatório do médico e rotas extraídas) | 113 de 113 |
| Testes do web (frases do panorama + rolagem) | 52 de 52 |
| Lint de ordem de hooks e linguagem vedada | ok / nenhum termo |
| Navegador, build local com dados de exemplo (`e2e/qa-panorama-funcional.mjs`, só GET) | **25 de 25** |
| Navegador, produção (conta de teste) | 18 de 19 — a "falha" era o roteiro esperar 9 áreas; a conta só tem 2 com dado. Ajustado. |

Em produção desde 26/11 13:58 (`c52e18f7`). Na conta de teste o endpoint responde em ~190 ms (166 ms com
cache). Preço da análise completa em produção: **3 créditos** — a linha salva em `app_settings.creditCosts`
tinha 20 e vencia o padrão do código; foi atualizada no banco na hora do deploy.

O roteiro cobre 390, 360, 390 escuro e 1280: azulejos, idade do dado em todos, alvos de 44px, história
manual (6 s parado continua no cartão 1), `inert`, percurso das 9 áreas até o fim, Esc + foco, nada gravado,
rolagem direta e pela gaveta do menu, e as variantes "exame antigo" e "PHQ-9 nunca respondido".
Fixture de dados de exemplo (pessoa fictícia): `e2e/fixtures/panorama.sample.json`.

## Pacote do app

**AAB 636 (2.7.386)** — `packages/mobile/android/app/build/outputs/bundle/release/app-release-636-v2.7.386.aab`
(17.671.762 bytes, sha256 `4da31ac6fbe13d477ae6ad72c1aa66a6728f138a7ddd60c0903ab767aa0964e6`), gerado em 26/11
14:19 a partir do commit `002176c`. Conferido por dentro: `build-info` com a versão 636, a tela do panorama
em `PanoramaPage-*.js`, sem `dist/`, sem "Program Files". O AAB 635 foi montado num checkout sem estes
arquivos e **não** tem o panorama. Subida no Play Console: manual.

## O que ficou de fora

- Botão "Voltar" do Android com a folha de história aberta não fecha a folha (mesmo comportamento das
  outras folhas do app).
- Horário de dose dos remédios e a lista de perguntas para o médico não entram no panorama (o contrato
  ainda não traz); os cartões mostram a contagem.
- Diário, rastreio, remédios, vacinas e lembretes não invalidam o cache de 5 min do panorama.
- A consulta de exames lê o JSON de extração de todos os exames só para o filtro de CPF — fica pesada
  para quem tem centenas de exames. Mitigação futura: gravar o flag no exame (exige migration).
- Despesas médicas, conquistas e alimentação não contam como áreas (decisão do dono).
