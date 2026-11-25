# Análise UX/UI — 24/11/2026

Escopo: telas mexidas no AAB 622 (Radar Hormonal, Agenda, card de pendências da Home) e o que
apareceu no caminho durante a conferência visual a 390px na produção (`v2.7.372.622`, conta de QA).
São **sugestões** — nada daqui foi implementado, exceto o que está marcado como "feito hoje".

Como ler: cada item diz o que eu **vi** (com a evidência), por que importa e o que eu faria.
O que não revalidei hoje está marcado como tal.

## Quem usa e o que veio fazer

Paciente leigo, no celular, entre uma coisa e outra. No Radar ele vem fazer **uma** coisa por
dia: dizer "apliquei" e conferir se está em dia. Na Agenda: ver o que vence. Na Home: saber se
tem algo para resolver. Toda tela deveria responder isso antes de pedir qualquer outra coisa.

---

## Prioridade 1 — atrapalha a tarefa ou a confiança

### 1. Três modais automáticos disputando a mesma sessão
**Vi:** na conta de QA, sem tocar em nada: "O que você quer entender?" abriu **por cima do Radar**
(entrei direto na tela); "seu primeiro exame virou análise!" cobriu a Home; "Vamos preparar o
Dr. Exame" (altura/peso, tela cheia) cobriu a Agenda e depois a Home de novo. A auditoria de
29/10 já apontava o modal de alerta de saúde abrindo ~3–4s depois em toda rota — seria o quarto.
Evidência: `e2e/screenshots/qa-radar-622/01-grafico-antes.png`, `10-home.png`, `08-agenda-lembretes.png`.

**Por que importa:** a pessoa abriu o app para registrar uma aplicação e recebe uma pergunta de
cadastro. Cada modal é um "fechar" a mais antes da tarefa; quem fecha três aprende a fechar sem
ler — inclusive o de alerta de saúde, que é o único que não pode ser ignorado.

**Sugestão:**
- Uma fila só, com regra: **no máximo um modal automático por sessão** e **nunca** em cima de uma
  tela que a pessoa abriu por link direto/notificação (ela veio fazer outra coisa).
- Ordem da fila: alerta de saúde > comemoração > cadastro. Os de cadastro (objetivo, altura/peso)
  não precisam ser modal: já existe o `NextStepsCard` na Home para isso.
- Alerta de saúde vira faixa fixa no topo da Home (visível, não bloqueante) com "Ver agora".

### 2. Botão desabilitado que parece ativo — e ilegível
**Vi:** "Continuar" e "Concluir" desabilitados aparecem com o gradiente teal da marca e texto teal
escuro por cima (`01-grafico-antes.png`, `08-agenda-lembretes.png`). Parece o botão principal,
mas não responde, e o texto mal se lê.

**Sugestão:** desabilitado = superfície neutra (cinza claro) com texto cinza médio, sem gradiente.
Melhor ainda: deixar habilitado e dizer o que falta ao tocar ("Escolha uma opção para continuar").

### 3. Radar: a ação do dia fica no fim de uma tela de configuração
**Vi:** para registrar a aplicação a pessoa passa por: texto explicativo → período → "Testar
outro protocolo" → legenda → gráfico → leitura do dia → aviso de simulação → "Como ler" →
protocolo → "Quando começou?" → "Ritmo do seu corpo" → só então "Suas aplicações".
A configuração (feita uma vez) vem antes do registro (feito toda semana).

**Sugestão (casa com o pedido "resumo primeiro" de 16/11):**
- Topo da tela = **placar de hoje**: `Última aplicação há 3 dias` · `Próxima em 4 dias` ·
  `Hoje: 32,8 mg/dia (média 38)`. Três números, com o botão "Registrar aplicação" logo abaixo.
- Gráfico em seguida. Protocolo, data de início e ritmo vão para "Ajustar meu protocolo"
  (recolhido), porque quase nunca mudam.
- Atalho na Home quando houver aplicação prevista para hoje: "Aplicação de hoje — registrar".

### 4. Alvos de toque abaixo de 44px no Radar
**Feito hoje:** botões do diário (44px), "Lembrar de fazer os exames" (era 28px) e "Lembrar-me" (era 40px).
**Falta (vi no código, `RadarHormonal.tsx`):** os três presets de "Testar outro protocolo"
(`size="sm"`), o seletor 8/12/16/24 semanas (`size="sm"`), os chips de legenda que escondem
composto (`min-h-8` = 32px) e "Ver 2x por semana" (32px). Em app de saúde isso é requisito
(IEC 62366 / WCAG 2.5.8), não acabamento.

---

## Prioridade 2 — clareza

### 5. Gráfico: o que é previsão ainda é quase invisível
**Vi:** as aplicações **registradas** ficaram claras (bolinha de 8,5px na curva + linha "hoje",
`06-grafico-recorte.png`). As **previstas** continuam riscos de ~1,5px na base. A legenda promete
"Aplicação prevista" para algo que mal se vê, e a bolinha da legenda é preta enquanto no gráfico
ela tem a cor do composto.

**Sugestão:** previsão como triângulo pequeno vazado na base (forma diferente de "registrada",
não só tamanho); legenda usando a mesma forma e um exemplo colorido. Marcar a **próxima**
prevista com rótulo ("próxima") — é a única previsão que interessa hoje.

### 6. Diário: três níveis de caixa e texto de apoio longo
**Vi:** cartão "Suas aplicações" → painel do composto → lista com borda (`04-diario-depois.png`).
São três bordas aninhadas para uma lista de 3 linhas; a descrição do cabeçalho ocupa 3 linhas.

**Feito hoje:** tirei a data repetida do cabeçalho do composto, "Outra data" ocupa a linha
inteira quando está sozinha e o aviso "Registrado hoje" perdeu o vazio embaixo.
**Sugestão:** lista sem borda própria (só divisórias), descrição em uma linha
("Registre quando aplicar — o gráfico usa suas datas reais.").

### 7. Lembrete do Radar só repete em intervalos "redondos"
**Vi (código):** o servidor conhece diário/semanal/mensal/semestral/anual. Protocolo a cada 3,5
ou 14 dias gera lembrete avulso — depois da primeira data ele fica parado em "Atrasados".

**Sugestão:** recorrência "a cada N dias" no servidor; ou, mais simples e mais certo para um
diário: ao **registrar** uma aplicação, o app move o lembrete daquele composto para a nova
"próxima prevista". Assim o lembrete segue o que a pessoa fez de verdade, não o calendário ideal.

### 8. Agenda: três abas, três lógicas de tempo
**Vi (código + conferência):** Lembretes agora tem Atrasados / Hoje / Amanhã / 7 dias / Depois /
Concluídos. Remédios ficou só ordenado (pendentes primeiro), sem grupos. Consultas tem a sua
própria divisão (próximas/histórico). Quem quer saber "o que eu tenho hoje?" abre três abas.

**Sugestão:** uma primeira aba **"Hoje"** que junta tudo que vence hoje ou está atrasado, de
qualquer tipo, com a ação certa em cada linha (Tomar dose / Marcar feito / Entrar na consulta).
As três abas continuam para quem quer ver tudo de um tipo.

### 9. Home: pendência deveria se resolver ali mesmo
**Feito hoje:** vencido há mais de 7 dias sai da Home; atrasado ocupa no máximo 1 linha.
**Sugestão:** "Marcar como feito" direto na linha do card (hoje é preciso ir até a Agenda).
Lembrete é a tarefa mais barata do app — resolver sem navegar é o que faz a pessoa manter o hábito.

### 10. Chat: dizer de onde veio a resposta
Com a economia de token (cache + resposta sem IA), há três origens de resposta.
**Sugestão:** selo discreto sob a resposta — "dos seus exames, sem IA" quando a IA estava fora —
e, na resposta reaproveitada, um "Gerar de novo" (que aí sim gasta crédito). Mantém a pessoa no
controle e evita a sensação de "ela repetiu a mesma coisa".

---

## Prioridade 3 — identidade e acabamento

### 11. A "linha do hoje" pode virar a assinatura do app
O que funcionou no gráfico do Radar foi responder "onde eu estou agora?". Evolução de exames,
Medições e Composição corporal têm a mesma pergunta. Uma linha vertical teal com o rótulo
"hoje", igual em todo gráfico de tempo, é barata e vira marca registrada: nenhum dado de saúde
aparece sem dizer se é de hoje ou de quando (o que também atende à regra "nunca mostrar dado
velho como atual").

### 12. Uma estratégia de profundidade só
**Vi:** convivem cartões com borda, cartões com sombra teal, a barra inferior em vidro e alertas
com fundo tingido. Funciona, mas cada tela nova escolhe uma combinação. Sugestão: borda sutil
para conteúdo, sombra só para o que flutua (barra inferior, FAB, modal), fundo tingido só para
estado (sucesso/aviso). Vale escrever em `.claude/DESIGN_SYSTEM.md` como regra.

---

## Não revalidei hoje (da auditoria de 29/10 — conferir se ainda valem)
- Contagens de "atenção" divergentes na mesma tela (7 no herói, 13 no bloco).
- Cartões com "Fora da referência" e "Sem faixa de referência informada" juntos.
- React #310 no dashboard desktop.

## Ordem que eu seguiria
1. Fila única de modais (item 1) — maior ganho por menor risco; é regra, não tela nova.
2. Botão desabilitado (item 2) e alvos de toque restantes (item 4) — uma tarde.
3. Placar no topo do Radar + registro acima da configuração (item 3).
4. Aba "Hoje" na Agenda (item 8) e lembrete que segue o registro (item 7).

---

## Estado em 25/11/2026 — o que foi implementado (AAB 624, commits `9e6634ef` e `a4c762b1`)

| Item | Estado | Observação |
|---|---|---|
| 1. Fila de modais | Feito | `utils/autoModalQueue.ts`: só na Home, um por sessão, saúde > comemoração > cadastro. Alerta de saúde vira faixa na Home quando não abre. **Fora da fila:** novidades (WhatsNew), recado do dia (Motd) e patrocinador — dividem a mesma vaga de sessão, mas sem prioridade nem "só na Home". |
| 2. Botão desabilitado | Feito | No tema (`theme.ts`), vale para o app todo. |
| 3. Radar: ação no topo | Feito | Placar "Seu dia" → Suas aplicações → gráfico → leitura → "Ajustar meu protocolo" (recolhido a partir da 2ª visita). |
| 4. Alvos de 44px no Radar | Feito | Verificado por roteiro: nenhum controle visível abaixo de 44px. |
| 5. Previsão no gráfico | Feito | Triângulo vazado + rótulo "próxima"; legenda com as mesmas formas. |
| 6. Diário enxuto | Feito | Lista só com divisórias; descrição em uma linha. |
| 7. Lembrete segue o registro | Feito | Ao registrar, move o lembrete aberto do composto para a nova prevista. Só atualiza, nunca cria. |
| 8. Aba "Hoje" na Agenda | Feito | Consulta em andamento → Atrasados (até 7 dias) → Hoje. Remédios ganhou grupos. |
| 9. Resolver na Home | Feito | "Marcar como feito" com Desfazer; atalho "Aplicação prevista" só para quem usa o diário. |
| 10. Origem da resposta no chat | Feito | Selo + "Gerar de novo · N créditos". |
| 11. Linha do "hoje" | Parcial | Linha em Composição corporal e Tendências; rótulo "Último resultado: há N" em Evolução e Histórico de medição. Medições (miniaturas) e curva de crescimento infantil não foram tocadas. |
| 12. Profundidade | Regra escrita | Em `.claude/DESIGN_SYSTEM.md` ("Regras de composição"). Telas existentes NÃO foram refeitas para segui-la. |

### Da auditoria de 29/10
- **Contagens divergentes:** o bloco "Fora da faixa" da Home passou a usar a mesma régua do herói, com rótulo de escopo; Evolução ganhou legenda do escopo dela. O donut "Seus Marcadores" continua contando o histórico bruto e chamando LOW de "Leve" — **não corrigido**.
- **"Fora da referência" + "sem faixa":** corrigido para faixa de um lado só (painel esportivo) e explicado no mapa do corpo.
- **React #310:** o do mapa do corpo já estava corrigido; havia outro no painel esportivo (2 hooks depois de `return`) — corrigido.
- **Lista de alterados:** passou a ignorar exame com CPF divergente.

### Ficou em aberto (decisão do dono)
- A comemoração do primeiro exame pode ser adiada para a sessão seguinte quando outro modal já usou a vaga; com 2+ exames na sessão seguinte, ela se perde.
- O card "O que fazer: dividir em 2 aplicações por semana" do Radar sugere mudança de esquema de aplicação. Já existia; vale revisão clínica (o app não deveria sugerir conduta).
- Não há ESLint com `react-hooks/rules-of-hooks` no repositório — é por isso que hook fora de ordem chega à produção. Recomendado adicionar ao CI.
- `DashboardErrorBoundary` só faz `console.error`: erro de tela provavelmente não chega ao Sentry.
