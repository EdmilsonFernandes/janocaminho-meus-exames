# Base de Conhecimento Clínico (RAG)

Cards de conhecimento **curado, leigo e educativo**, um por condição que a engine de risco
detecta. O servidor (`src/analysis/knowledge.ts`) lê o card da condição ativa do paciente e
**injeta no prompt do GLM** ao gerar o Plano de Ação (e, futuramente, o resumo). Assim a IA fica
mais rica e **consistente** — e melhora sem retreinar: basta editar o `.md` aqui.

## Por que arquivos `.md` (e não banco)
- **Versionado** (git diff: quem mudou o quê, quando) — auditoria clínica.
- **Revisão por PR** antes de ir ao ar.
- **Sem migration**; deploy normal via `git push`.

## Condições x arquivos
| conditionKey | arquivo |
|---|---|
| `diabetes` | `diabetes.md` |
| `prediabetes` | `prediabetes.md` |
| `hypertension` | `hipertensao.md` |
| `high_cholesterol` | `colesterol-alto.md` |
| `cardiovascular_risk` | `cardiovascular.md` |
| `anemia` | `anemia.md` |

## Regras de edição
- **Educativo, nunca diagnóstico** (sem "você tem X", sem prescrever).
- Baseado em diretrizes (cite fontes ao final de cada card).
- Linguagem simples; seções fixas: *O que é · Valores · Fatores · Hábitos · Alertas · Perguntas · Fontes*.
- O GLM usa o card como **fato**, mas continua proibido de inventar valores/condições novas.
