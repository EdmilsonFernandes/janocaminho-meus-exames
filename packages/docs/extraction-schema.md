# Contrato JSON da extração

Schema Zod canônico: `packages/server/src/extraction/schemas.ts`. O Claude é forçado a devolver este formato
(structured output via `output_config.format`).

## Painel laboratorial (`LabExtractionSchema`)

```jsonc
{
  "patientName": "EDMILSON ...",
  "examTitle": "HEMOGRAMA COMPLETO",
  "performedAt": "2026-06-12",          // data da coleta (ISO ou dd/mm/yyyy)
  "sourceLab": "SJC - BACABAL",
  "requestingDoctor": "...",
  "panels": [
    {
      "name": "HEMOGRAMA COMPLETO",
      "material": "SANGUE",
      "items": [
        {
          "name": "HEMOGLOBINA",
          "valueText": "17,1 g/dL",       // exatamente como impresso
          "valueNumeric": 17.1,           // vírgula→ponto, sem unidade
          "unit": "g/dL",
          "references": [                 // TODAS as colunas demográficas do PDF
            { "appliesTo": "Homens",  "lowNumeric": 13.0, "highNumeric": 16.5, "unit": "g/dL" },
            { "appliesTo": "Mulheres","lowNumeric": 12.0, "highNumeric": 15.8, "unit": "g/dL" }
          ],
          "page": 1                        // CITAÇÃO — página 1-indexada onde o valor foi lido
        }
      ]
    }
  ]
}
```

## Imagem / laudo (`ImagingExtractionSchema`)

```jsonc
{
  "examTitle": "TC ABDOME SUPERIOR E PELVE",
  "performedAt": "2025-10-24",
  "sourceLab": "...",
  "findings": [
    { "text": "Hérnia epigástrica com alça em seu interior, colo 2,1 cm.", "page": 1 }
  ],
  "impression": "...",
  "technique": "..."
}
```

## Normalização (pós-extração, em `pipeline.ts`)

- `nameCanonical`: o nome é normalizado (maiúsculas, sem acento) e casado com um **mapa de sinônimos**
  (`utils/normalize.ts` — HEMOGLOBINA↔HGB, LEUCOCITOS↔WBC, …). É a chave que permite cruzar o mesmo analito entre
  exames de labs/datas diferentes para a **evolução temporal**.
- `valueNumeric`: se o Claude não trouxer, é derivado de `valueText` (lida com decimal BR e milhares).
- `flag`: `NORMAL` / `HIGH` / `LOW` / `ABNORMAL` / `CRITICAL` / `UNKNOWN`, calculada comparando `valueNumeric` à faixa
  de referência da coluna demográfica do paciente ("Homens").
- `extractedPage`: citação (vem do JSON).

## Resumo de saúde (`HealthSummarySchema`) — ver `prompt-health.md`
