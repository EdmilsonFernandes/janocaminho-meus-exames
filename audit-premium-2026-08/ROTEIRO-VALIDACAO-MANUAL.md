# 🧪 Roteiro de Validação Manual — Dr. Exame
### Tudo que mudou nestas ondas, com passo a passo do que VOCÊ vê
> **Web:** https://janocaminho.com.br/minhasaude (já no ar)
> **App:** instale a AAB **316 (2.7.75)** — `packages/mobile/android/app/build/outputs/bundle/release/app-release.aab`
> Conta usada nos exemplos: a de teste do paciente (e médico CRM 185642). Dica: no navegador, use uma aba anônima pra ver como um usuário novo vê.

---

## A. LOGIN (web + app)

| # | Passo | O que você deve ver |
|---|---|---|
| A1 | Abra `/#/entrar` | Card com robô respirando, toggle **Paciente / Médico** (ativo verde-escuro chapado), botão **Entrar verde-escuro** (não mais teal claro) |
| A2 | Toque em **Entrar** com campos vazios | Erro **embaixo de cada campo** (borda vermelha + "Digite seu e-mail/senha") — nada de toast que some |
| A3 | Digite a senha com **Caps Lock ligado** | Aviso "Caps Lock ativado" sob o campo |
| A4 | Erre a senha de propósito | Campo senha em vermelho + **"Esqueci minha senha" DENTRO do erro** |
| A5 | Toggle **Médico** | Campo vira "E-mail ou CRM", **sem botão Google** (Google é só paciente) |
| A6 | `/#/entrar/medico` direto | Subtítulo "**Portal do Médico**", link "Entrar como paciente" |

## B. APP ANDROID (só na AAB 316)

| # | Passo | O que você deve ver |
|---|---|---|
| B1 | Abra o app | **Splash com o logo** (não só cor) e **sem flash branco** na transição |
| B2 | Olhe a barra de status | **Teal da marca**, contínua com o app |
| B3 | Com biometria cadastrada | Primeira tela = botão grande "**Entrar com biometria**" + "Usar e-mail e senha" secundário |
| B4 | Abra o teclado no login | A tela **ajusta** (botão Entrar não fica embaixo do teclado) |
| B5 | **Segure o dedo no ícone do app** (launcher) | Atalho "**Cartão de emergência**" → toca → abre direto no cartão ✅ |
| B6 | Botão "Entrar com Google" | Da **largura do card** (não estoura em telas pequenas) |

## C. HOME DO PACIENTE

| # | Passo | O que ver |
|---|---|---|
| C1 | Entre na conta | NO MÁXIMO um modal (novidades da versão **2.7.x**) — **não** "Versão 1.4.4", **não** "envie seu primeiro exame" se você já tem exames |
| C2 | Tile "Idade biológica" | Se não tem nascimento cadastrado: "**cadastre seu nascimento**" (número não aparece sozinho sem dado) |
| C3 | Tile "Seus exames" | Contagem de alterados **igual** à tela Valores Alterados (mesma fonte) |
| C4 | Bloco "Desde seu último exame" | Setas ↑/↓ com nome do marcador |
| C5 | Menu (Mais) | **4 seções**: Exames · Cuidados · Pessoas · Conta — **sem grade de 9 atalhos**, **sem "Minha saúde" repetindo itens**, **botão vermelho "Cartão de emergência" no topo** do drawer |
| C6 | Créditos no drawer | Aparecem **1 vez** (não 💎 e ⚡ duplicados) |

## D. EXAMES / RELATÓRIO / ALTERADOS

| # | Passo | O que ver |
|---|---|---|
| D1 | `/#/exams` | Hero "Último exame" com **Ver análise + Abrir laudo**; chips por categoria com **ícones desenhados** (gota, gota de sangue, grão…) — não mais emojis 🍩🩸🧈 |
| D2 | `/#/alterados` | **🔴 antes de 🟡** (ordem por prioridade, como promete o subtítulo). Subtítulo sem "Agendar" |
| D3 | `/#/relatorio` | Resumo **SEM "[data não informada no contexto]"** — aparece a data real ("exames de fevereiro de 2025") |
| D4 | `/#/relatorio` → pontinhos | "O que consome: 💬 chat 2 · ✨ resumo 10 · 🧾 relatório 20" |
| D5 | `/#/evolucao` | Linha de glossário sob os filtros explicando 🟠 Em mudança |
| D6 | `/#/tendencias` | Abre no **marcador alterado mais relevante** (não "Basofilos"); siglas certas (CHCM, TSH) |
| D7 | `/#/linha-do-tempo` | Filtros **Tudo/Exames/Medições/Vacinas**; eventos de medição (âmbar 💓) e vacina (roxo 💉); tocar num EXAME abre popup com "Abrir exame completo →" |
| D8 | `/#/familia` | "✅ **Nada relevante agora**" (não "tudo dentro da faixa" quando há leves) + botão "Gerenciar dependentes" |
| D9 | `/#/despesas` | Subtítulo explicando o propósito (imposto de renda etc.) |
| D10 | `/#/seguranca` | 2FA + card de **Biometria** (no navegador explica que é no app Android) |
| D11 | `/#/planos` | Saldo + packs PIX + linha do que consome créditos |

## E. PORTAL DO MÉDICO (desktop 1440)

| # | Passo | O que ver |
|---|---|---|
| E1 | Login CRM | Home com pacientes (idade·sexo·plano), filtro "Só alerta" |
| E2 | Clique numa paciente | **Desktop: lista de pacientes CONTINUA à esquerda** (rail) + paciente aberto à direita — dá pra trocar de paciente sem Voltar |
| E3 | Aba **Tendências** | Seletor de **período** (6 meses/1 ano/2 anos/Todo histórico) — mude e veja o gráfico recortar |
| E4 | Aba Exames → abra um exame | Botão "**Abrir laudo**" (era "PDF") |
| E5 | Clique em **Trocar** (ou outro paciente do rail) | Header/idade/contagens/abas trocam **imediatamente** para o novo paciente — sem resíduo do anterior ✅ (item 20) |
| E6 | Perguntas | Respostas com "**Dr. Nome**" (não "Dr. Dr.") |
| E7 | Títulos de exame | Exames que eram "EXAMES LABORATORIAIS" aparecem como os **painéis reais** ("Hormônios + Hemograma") |

## F. LANDING

| # | Passo | O que ver |
|---|---|---|
| F1 | Página inicial (anônimo) | **Sem seção de depoimentos**; seção Pro **sem** "Exportar PES com CID-10" |
| F2 | Console (F12) na landing | Bem menos erros 401 no boot |
| F3 | Rodapé | Links clicáveis por teclado (Tab percorre) |

---

## ⚠️ O que NÃO mudou (de propósito)
- Emoji de severidade 🔴🟠🟡 e conquistas — são semânticos/voz da marca, não ícone de sistema.
- Sidebar desktop sempre aberta — decisão de produto (o menu novo a deixa enxuta).
- Testes/vacinas/medições da timeline são informativos (sem popup de valores).

## 📞 Se algo NÃO bater
Anote o item (ex.: "C3") e me fala — cada linha deste roteiro mapeia 1:1 a um commit verificável.

---

# RODADA 8 — Feedback manual do dono (E3–E5, C5, conquistas, painel do médico)
**Commit:** `d4dfae3` · **AAB:** 318 (2.7.77) · referência do menu: `audit-premium-2026-08/refs/`

## G. APP DO PACIENTE (Android/mobile 390)

| # | Passo | O que ver |
|---|---|---|
| G1 | Menu (☰) → seções "Exames/Cuidados/Pessoas/Conta" | Header de seção virou **BARRA COLORIDA teal** com ícone dentro de um chip — aberta = chip com gradiente e ícone BRANCO + fundo mais forte; fechada = tudo suave. Impossível confundir header com item (ref. Loteria da Caixa) |
| G2 | Expandir/colapsar seção | Itens ficam **pendurados numa linha teal** (rail) saindo do header — pertencimento visual claro |
| G3 | `/alterados` → exame com MUITOS alterados | Mostra **4 + botão "Ver todos os N alterados"** (expande/colapsa inline) — não é mais um muro |
| G4 | `/conquistas` | Seção nova **"♻️ Desafios do mês (mês atual)"** com 4 desafios (📤 1 exame, 🧪 3 exames, 🔥 10 dias, 🤝 compartilhar c/ médico) — **renovam todo mês**; permanentes separadas embaixo. Quem completou tudo SEMPRE tem o que fazer |

## H. PORTAL DO MÉDICO (mobile e desktop)

| # | Passo | O que ver |
|---|---|---|
| H1 | Entrar no portal | **Abre no PAINEL** (não mais na lista): saudação "Bom dia, Dr. X 👋" + manchete do dia ("N pacientes com valores alterados"), 4 tiles (Pacientes / Com alerta / Perguntas / Convites) |
| H2 | Painel → fila "Precisam de atenção agora" | Pacientes 🔴/🟠 com o **porquê** ("🟠 Alterações moderadas · exame há 12 dias") — **1 toque abre DIRETO na aba Alterados** |
| H3 | Painel → "Exames para renovar" | Quem está há +1 ano sem exame (ou sem nenhum) — deixa o médico pedir atualização |
| H4 | Tendências → dropdown de marcador → troque o período p/ **6 meses** | Os contadores **"(N exames)" mudam com o período** (ex.: Hemoglobina 3→2) e marcadores sem 2 pontos na janela saem da lista — coerente |
| H5 | Aba Exames → abrir exame (mobile) | Título ocupa a linha toda (2 linhas se precisar); **Voltar** é botão redondo; "Abrir laudo" fica na **linha de baixo** — nada cortado |
| H6 | Ícones das abas | **Exames** = fita de laudo (ReceiptLong) · **Alterados** = bandeira 🚩 · **Relatório** = sumário — visualmente distintos |
| H7 | Botão **Trocar** paciente | Ícone de **troca ⇄** na frente do campo de seleção (desktop e no dialog mobile) |

## Pendências conhecidas (não-bloqueantes)
- Dialog aninhado no "Trocar" mobile (dialog abre outro dialog) — UX ok mas pode virar sheet única no futuro.
- Console dev mostra `RangeError` do trio Sentry×MUI×react-admin ao empilhar modais (drawer+WhatsNew) — pré-existente, instrumentação de dev, página segue funcional.

## I. RODADA 9 — Tendências com entrada própria (00c3fe0, AAB 319)

| # | Passo | O que ver |
|---|---|---|
| I1 | Menu ☰ → seção Exames | **"Tendências" com entrada própria** (ícone de gráfico QueryStats), logo abaixo de "Evolução" — não precisa mais entrar em Evolução e caçar link |
| I2 | `/evolucao` | Botão destacado (borda teal, full-width no celular) "**Gráfico por marcador (pontos por data) →**" — 1 toque abre o gráfico |
| I3 | `/tendencias` | Gráfico do marcador com os pontos por data renderizando direto |

## J. RODADA 10 — Auditoria chat/Libras/EC2 (d32d65e, AAB 320)

| # | Passo | O que ver |
|---|---|---|
| J1 | Ícone de **Libras** (qualquer tela) | Agora no **canto inferior ESQUERDO**, menor (72%), acima do rodapé — não flutua mais no meio-direita sobre o conteúdo (bug: plugin trocou prefixo de classe e nosso CSS morreu) |
| J2 | No **chat** | Libras sobe um pouco mais (acima da barra de input) — não cobre o botão "+" |
| J3 | Chat → mandar pergunta | Se a IA demorar: em até 35s volta "**A IA demorou demais… seu crédito foi devolvido**" (antes: dots infinitos com input travado E crédito perdido) |
| J4 | Durante a resposta | Botão de enviar vira **⏹ Parar** |
| J5 | Histórico (🕒) | Conversas feitas em OUTRO aparelho aparecem como "Conversa anterior (outros dispositivos)" |
| J6 | Rodapé do chat | "2 crédito**s** por pergunta" (plural) e badge do histórico não mostra "0" |
| J7 | Extrato (painel usuário) | Saldos agora BATEM com o extrato: regularizamos 23 linhas "legacy_adjustment" em prod; ajustes do admin a partir de agora deixam rastro (delta + auditoria) |
