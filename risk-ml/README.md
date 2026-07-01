# risk-ml — Módulo de Classificação de Risco (Dr. Exame)

Camada Python de **classificação de risco** a partir de biomarcadores de exames.
**Regras clínicas explicáveis = primárias; modelo ML = 2ª opinião.** Nunca diagnóstico.

> ⚠️ Treinado no dataset `health_markers_dataset.csv`, que é **sintético/baseado-em-regras**
> (acurácia ~100% que **não generaliza**). Por isso o modelo só corrobora — a camada de
> regras (`config/clinical_rules.yaml`) é a fonte primária e auditável. Ver
> [`../docs/RISK_MODULE_DESIGN.md`](../docs/RISK_MODULE_DESIGN.md).

## Estrutura
```
risk-ml/
├── config/
│   ├── clinical_rules.yaml   # regras configuráveis (bandas, severidade, mensagens PT)
│   └── marker_aliases.json   # normalização de nomes (PT/EN/abrev) + conversão de unidades
├── src/
│   ├── normalize.py          # nome→canônico + conversão de unidade (Task #7)
│   ├── rules_engine.py       # MVP explicável (Task #3) — findings + riskLevel
│   ├── infer.py              # inferência ML (Task #4) — 2ª opinião
│   ├── schema.py             # linguagem segura + contrato da resposta (Task #5/#8)
│   ├── risk_service.py       # orquestrador: normalize→regras→ML→resposta
│   ├── train.py              # pipeline de treino (RF/LR/DT, métricas, CV)
│   └── serve.py              # endpoint interno FastAPI (Task #10)
├── models/                   # rf_pipeline.joblib + model_meta.joblib (gerados por train.py)
├── examples/                 # 1 JSON de saída por condição
└── tests/test_rules.py       # 21 checks (rode sem pytest)
```

## Quickstart
```bash
pip install -r requirements.txt

# 1) treinar (gera models/*.joblib) — opcional, o modelo já vem commitado
python src/train.py --csv caminho/para/health_markers_dataset.csv

# 2) testes de comportamento
python tests/test_rules.py

# 3) exemplos de saída por condição
python examples/generate_examples.py

# 4) endpoint interno (porta 4051 p/ não colidir c/ backend 4001 / dev 4011)
uvicorn src.serve:app --port 4051 --host 127.0.0.1
#   POST /assess  { "markers": [ {"name":"Glicemia de jejum","value":168,"unit":"mg/dL"}, ... ] }
```

## Decisão de fusão (segurança)
- `predictedCondition` e `riskLevel` vêm das **regras** (explicáveis).
- O ML só vira `basis="ml_only"` em **painel escasso** (<5 marcadores) e confiável.
- Se o painel está cheio e limpo mas o ML dispara → `meta.mlSuspect=true` (**só auditoria
  clínica**, não alarme de usuário) — proteção contra a superconfiança do modelo sintético.

## Integração com o app
O servidor Node já produz o input deste módulo: `MarkerState[]` (`packages/server/src/analysis/health-state.ts`)
e os nomes canônicos (`packages/server/src/utils/normalize.ts`). Um adapter TS traduz
`nameCanonical → ts_canonical` (ver `config/marker_aliases.json`) e chama `POST /assess`.
Detalhes completos em [`../docs/RISK_MODULE_DESIGN.md`](../docs/RISK_MODULE_DESIGN.md).
