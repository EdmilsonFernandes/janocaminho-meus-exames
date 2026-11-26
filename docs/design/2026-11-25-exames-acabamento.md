# Exames (lista + detalhe) — acabamento (25/11/2026)

> 2º ciclo da elevação da UI "uma tela por vez": Home → **Exames** → Chat → Agenda.
> Dono pediu "um mock antes, como vai ser real", aprovou o esboço e mandou implementar, rodar os testes e
> conferir no Playwright ("se achar merda, corrija").

## Como foi feito

1. **Esboço realista sobre a tela de produção** (CSS/JS por cima do app, sem mexer no código) — celular e
   computador, antes × depois. Aprovado pelo dono em 25/11.
2. **Implementação no padrão que o app já usa** — `AppCard`, `IconTile` (variante `soft`), `SecondaryButton`,
   tokens `SEM`/`RADIUS`. Nenhuma biblioteca nova.
3. **Conferência no navegador** (Playwright, conta de QA, só GET — nada foi gravado): celular 390 e 360,
   computador 1280, temas claro e escuro. Mede o DOM de verdade: alvo de toque (inclusive a área extra de
   `::before`), contraste, caixas (borda/sombra), raios, texto cortado, interações (filtros, busca, abrir
   exame, master/detail, excluir → cancelar, "?", seções).
4. **Três rodadas.** A primeira achou 19 ajustes que o mock não mostrava (o esboço é CSS por cima da tela
   antiga e não exercita largura real, toque nem estados); tudo foi corrigido em dois lotes e a rodada final
   passou: **64 de 64 verificações**, sem erro de JavaScript, sem rolagem horizontal.

## O que mudou — lista

| Tema | Antes | Depois |
|---|---|---|
| Cartão de exame | Gradiente, faixa lateral colorida e sombra no descanso | Cartão limpo, só borda. Quem diz que há valor fora da faixa é o chip do rodapé e o tom do ícone |
| Título no celular | Quebrava em duas linhas ("Hemograma / completo"): a seta e o "?" comiam 54px da largura | Seta some no celular; "?" vai para o rodapé; palavras curtas não quebram no hífen ("25-OH" ficava "25-" / "OH") |
| Rodapé do cartão | Faixa pintada com caixinhas + chip "Pronto" | Uma linha: "22 resultados · Todos na faixa". "Pronto" sumiu (todo exame da lista está pronto) |
| Vocabulário | "N alterados" / "Nada alterado" | "N fora da faixa" / "Todos na faixa" — o mesmo termo da Home |
| Nomes | Médico e laboratório em CAIXA ALTA, com emoji, 10,5px na cor da marca (3,25:1) | "Dr. Daniel Cesar Shirane" e o laboratório em cinza AA, 12,5–13px (`prettyName`) |
| Títulos de grupo | Emoji dentro do texto traduzido, 14–15px | Ícone do conjunto + 17px/700: "Em processamento", "Não foi possível ler", ano, categoria |
| Tempo de processamento | "há 86853:52" (exame preso há meses) | "há 3:20" → "há 2 h 05 min" → "há mais de 1 dia" / "há N dias". Preso há mais de um dia ganha aviso próprio (`elapsedLabel`) |
| Etapas do processamento | "Extraind…", "Analisan…" com emoji | Nome inteiro em até 2 linhas, sem emoji |
| "Último exame" (celular) | Sem data | "Último exame · 21 nov 2026 · há 4 dias" |
| Filtros | Chips com 32px, alternador com 38px de largura, busca com 40px | 44px e 48px |
| "Ver planos" / "Ver análise" | Botões com cara de primário | Ação discreta (`SecondaryButton`). O destaque da lista é o "+" de enviar exame |
| Grupos por ano/categoria | Cartão dentro de cartão (e tudo isso dentro do cartão do react-admin) | Títulos soltos sobre o fundo da página; a lista assenta direto na página |
| Desktop: hover e seleção | Card levantava com brilho; selecionado com sombra por fora | Só a borda acende; selecionado = anel teal |
| Desktop: linha do tempo (até 6 exames) | Repetia o título em duas linhas e usava outro formato de data | Linha de baixo com o número de resultados; mesma data do resto da lista |

## O que mudou — detalhe do exame

| Tema | Antes | Depois |
|---|---|---|
| Ações do topo | Três botões com cara de primário | Discretas (contorno), em duas linhas no celular. O único destaque é "Gerar resumo" |
| Cabeçalho | Chip "Pronto"; data sem idade; nomes em caixa alta com emoji | Sem "Pronto"; "07 mar 2026 · há 8 meses"; nomes em caixa normal |
| Aviso de CPF | Dois parágrafos repetindo "Por segurança"; texto de apoio 4,19:1; vermelho 4,26:1 | Texto enxugado (o que aconteceu + o que fazer) e cores AA |
| Exame bloqueado por CPF | Oferecia "Gerar resumo", que o app recusa na hora | No lugar do botão, o motivo. O destaque fica com "Acredito que houve um erro" |
| "N valores fora da faixa" | Faixa lateral grossa; título com emoji; chips dos valores com 32px | Borda completa do aviso + ícone de bandeira; chips com 44px |
| Seções (Enzimas, Hormônios…) | Um cartão por seção | Uma lista só, com divisórias |
| Valor fora da faixa dentro da seção | Faixa lateral de 5px | Só a lavagem da linha (é um estado, não uma caixa) |
| Links pequenos | "pág. N" com ~20px; lápis de emoji para corrigir o valor | Área de toque de 44px; lápis do conjunto de ícones |
| Títulos de cartão | "Análise de saúde" num tamanho, "Preparar visita" noutro | Um nível só (17px/700) |
| "Preparar visita ao médico" | Fundo verde + botão destaque | Cartão limpo, ação discreta. "Valores alterados" → "valores fora da faixa" |
| "Regenerar resumo" | Botão de 30px com "↻" | 44px, contorno discreto |

**Estados que a conta de QA não tem** (conferidos só por typecheck, não no navegador): o aviso "Confirme o
titular antes da análise" (ganhou o mesmo tratamento do aviso de CPF) e os botões do detalhe de um exame que
falhou ("Re-extrair" / "Entender o que houve", agora com 44px).

## O que vale para o app todo

- `LabBadge`: nome do laboratório legível (era 10,5px na cor da marca).
- `ProcessingStages`: nome das etapas inteiro e sem emoji — vale também para a faixa "Em processamento" da Home.
- `utils/names.ts` (`prettyName`) e `utils/elapsed.ts` (`elapsedLabel`), com testes unitários.

## Medições: antes × depois

Mesma conta, mesma lista (7 exames de exemplo), mesma régua. "Antes" = produção em 25/11; "depois" = build de teste.

| Medida | Celular 390 | Computador 1280 |
|---|---|---|
| **Lista** — controles abaixo de 44px dentro da tela | 11 → **0** | 9 → **0** |
| **Lista** — textos abaixo de AA (4,5:1) | 8 de 40 → **2 de 85** | 12 de 89 → **6 de 134** (todos da barra lateral) |
| **Lista** — altura da página | 2148px → **2084px** | 923px → 921px |
| **Lista** — caixas com sombra / raios distintos | 9 → **4** / 9 → **6** | 33 → **26** / 13 → **12** |
| **Detalhe** — controles abaixo de 44px | 5 → **0** | 4 → **0** |
| **Detalhe** — textos abaixo de AA | 7 de 31 → **0 de 37** | 11 de 60 → **4 de 66** (todos da barra lateral) |
| **Detalhe** — altura da página | 1911px → **1790px** | 1285px → **1193px** |

Os 2 que restam na lista do celular são a inicial do laboratório dentro do círculo da marca (4,47:1 — a cor
é do cadastro da marca, não do app).

## O que NÃO mudou

- Nenhuma regra: extração, agrupamento, filtros ("Recentes" = 90 dias), bloqueio de CPF, limite do plano,
  custos em crédito, exclusão. Nenhuma rota nova.
- O botão "Agendar com …" dentro de cada valor fora da faixa (`TelemedicineButton`, compartilhado com outras telas).
- O alerta de triagem ("Procure atendimento médico URGENTE") continua com o emoji.
- Barra de cima, botão "+" e barra de baixo (são da casca do app, iguais em todas as telas).

## Pendências para o dono decidir

1. **"Agendar com Cardiologista"** aparece dentro de cada valor fora da faixa, como botão escuro. Numa seção
   com vários valores, eles competem com "Gerar resumo".
2. **Botão "+"** cobre o canto dos cartões no celular (mesma pendência da Home).
3. **Emoji em textos educativos**: "💡" e "⚠️" na explicação do "?" e no alerta de triagem.

## Como reproduzir a conferência

```bash
# build de teste fora do pacote do celular (não mexe em packages/mobile/www)
MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' VITE_BASE=./ VITE_API_URL=https://drexame.janocaminho.com.br/api \
  npm run build --workspace packages/web -- --outDir "$TEMP/dr-qa/exames/www" --emptyOutDir
# roteiro (64 verificações) e fotos inteiras — só GET
QA_WWW="$TEMP/dr-qa/exames/www" node e2e/qa-exames-funcional.mjs
QA_WWW="$TEMP/dr-qa/exames/www" QA_MOCK=1 QA_FULL=1 node e2e/qa-tela.mjs m-light,d-light "lista=/exams;detalhe=/exams/{id}/show"
```

Roteiros (`e2e/qa-exames-funcional.mjs`, `e2e/qa-tela.mjs`, `e2e/mock-exames.mjs`) e as pastas de prints ficam
fora do repositório: leem a credencial da conta de QA e as fotos trazem o nome do dono.
