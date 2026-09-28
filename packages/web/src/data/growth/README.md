# Tabelas LMS OMS (vendorizadas)

- **0-5 anos** (arquivos `*-0-5.json`): WHO Child Growth Standards — linhas **diárias**, campo `age` em **dias** (0–1856).
- **5-19 anos** (`hfa-*/bfa-*` e `wfa-*-5-10`): WHO Growth Reference 2007 — linhas mensais, `age` em **meses** (61–228; peso-para-idade termina aos 120 — limite OMS).
- Campos por linha: `{ age, L, M, S }` (modelo LMS — box-cox).

## Fonte e licença
Extraídos do pacote [`@pedi-growth/core` 1.1.2](https://github.com/iurileao-hub/pedi-growth) (MIT), que os publica a partir dos dados oficiais da OMS (domínio público). Vendorizados em 28/09/2026 porque o pacote carrega os JSONs via `import()` dinâmico com atributo `with:{type:'json'}`, que o Vite não serve em dev (ver `src/utils/growthData.ts`).

## Atualização
Se a OMS revisar tabelas: substituir os JSONs aqui, manter os nomes, e conferir `growth.test.ts` (roundtrip z↔valor valida integridade).
