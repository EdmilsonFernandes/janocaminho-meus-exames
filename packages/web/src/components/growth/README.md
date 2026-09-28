# Curvas de Crescimento Infantil (percentis OMS)

## Fonte dos dados LMS

- **Pacote**: [`@pedi-growth/core`](https://www.npmjs.com/package/@pedi-growth/core) v1.1.2 — **licença MIT** (dados WHO são domínio público; pacote redistribui com NOTICE).
- **Tabelas** (LMS oficiais, embutidas no pacote):
  - **WHO Child Growth Standards (0-5 anos)** — peso/comprimento-altura/IMC-para-idade, índice em dias.
  - **WHO Reference 2007 (5-19 anos)** — altura/IMC-para-idade (e peso-para-idade **até 10 anos**), índice em meses.
- Decisão: **família OMS ponta a ponta (0-19 anos)** — uma única fonte coerente, em vez de misturar CDC 2-20.
- Limite conhecido: a OMS **não publica peso-para-idade acima de 10 anos** — a UI omite a curva de peso a partir daí (degrada para Altura/IMC) em vez de inventar percentil.

## Motor de cálculo

`packages/web/src/utils/growth.ts` — z-score LMS (`z=((v/M)^L−1)/(L·S)`, `L≈0: ln(v/M)/S`), inverso (`v(z)=M·(1+L·S·z)^(1/L)`) e percentil via CDF normal Abramowitz-Stegun 26.2.17 (`normalCdf` do próprio pacote, erro máx 7,5e-8). Testes: `growth.test.ts` (identidades matemáticas + roundtrip nas tabelas reais + guardas estruturais de unidades/sexo/limites).

## Persistência

Peso/altura são **medições comuns** (`Measurement`, tipos `WEIGHT`/`HEIGHT`, unidade kg/cm) — mesmas rotas `GET/POST /measurements` e ownership por `patientId`. Nenhuma tabela/migration nova.

## UI

`GrowthSection.tsx` — seção da página **Evolução**, renderizada apenas para perfis criança (< 19 anos com data de nascimento; gênero no perfil define a tabela OMS menino/menina). Faixas percentílicas 3/15/50/85/97 (convenção dos gráficos OMS) + pontos da criança em teal. Aviso educativo obrigatório: interpretação é do pediatra.

Data de adoção: 2026-09-28.
