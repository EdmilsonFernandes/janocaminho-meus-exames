# Prompt de extração (visão)

Usado em `packages/server/src/extraction/claude.ts`. É a **fonte de verdade** para transformar o PDF em dados estruturados —
a extração de texto plano embaralha as tabelas dos exames laboratoriais (validado com os PDFs reais), então o Claude lê o
PDF por **visão** (bloco `document` nativo), preservando a estrutura 2D da tabela.

## Dor de cabeça (exemplo real — hemograma)

`pdftotext` devolve algo assim (valor e referência em linhas trocadas):

```
HEMÁCIAS     Resultados    Homens     Mulheres ...
HEMOGLOBINA                4,50 a 6,10
HEMATÓCRITO  5,50 milhoes/mm3   13,0 a 16,5 ...
```

Aqui `5,50` é o valor de **HEMÁCIAS**, não de HEMATÓCRITO. Texto não recupera isso. Visão sim.

## Instrução enviada ao modelo (`claude-opus-4-8`, thinking adaptativo, effort high)

> Você é um especialista em ler resultados de EXAMES LABORATORIAIS brasileiros (sangue, urina, etc.) a partir de um PDF.
>
> LEIA AS TABELAS COM CUIDADO — elas têm estrutura 2D: cada analito tem um valor e várias colunas de valores de
> referência (Homens, Mulheres, Crianças, Acima de 70 anos). NÃO confunda o valor do paciente com a faixa de referência.
>
> PACIENTE: homem adulto, nascido em 30/11/1978 (~47 anos). Use a coluna "Homens" (ou "Adultos") como referência principal.
>
> Para cada analito: `name`, `valueText` (como impresso), `valueNumeric` (vírgula→ponto), `unit`, `references` (TODAS as
> colunas) e **`page`** (página 1-indexada onde leu o valor).
>
> REGRAS CRÍTICAS:
> - NUNCA invente um valor. Se não conseguir ler com confiança, **omita** o analito.
> - Use a estrutura visual da tabela, não linhas soltas de texto.
> - Vírgula decimal brasileira (17,1) vira ponto (17.1).

Saída forçada via **structured output** (`output_config.format` + `zodOutputFormat`) — JSON válido garantido pelo schema
Zod em `schemas.ts`. Cada item traz `page` (citação).

## Observações técnicas

- **Citations (API) × structured output** são incompatíveis (ambos 400 juntos). Por isso não usamos a feature de
  citações do Anthropic — em vez disso exigimos o campo `page` no JSON, e confiamos na **trava anti-alucinação**
  (`pipeline.ts` → `sanityCheckItems`) + na UI, onde cada valor abre o PDF na página de origem para verificação humana.
- PDF enviado como bloco `document` nativo (base64), até 100 páginas. Não rasteriza por padrão.
- Idempotência: `exams(patientId, fileSha256)` único → re-enviar o mesmo arquivo não reprocessa.
