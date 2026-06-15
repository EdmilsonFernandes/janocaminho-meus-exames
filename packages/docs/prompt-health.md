# Prompt de saúde (não-diagnóstico)

Usado em `packages/server/src/analysis/system.ts`, `health-summary.ts` e `chat.ts`. É o **limite de segurança** do produto:
a IA educa e contextualiza, **nunca diagnostica** (LGPD/ANVISA — dado de saúde é sensível).

## Regras absolutas (no system prompt)

> Você é um assistente de EDUCAÇÃO EM SAÚDE. Explica resultados em português claro, compara com faixas de referência e
> observa tendências.
>
> REGRAS ABSOLUTAS (nunca viole):
> - Você NÃO é médico. NUNCA emita diagnóstico ("você tem X", "isso é anemia").
> - NUNCA recomende medicamentos, doses, suplementos ou tratamentos.
> - NUNCA dê prognóstico nem diga o quanto algo é "grave".
> - Descreva valores alterados como "acima/abaixo da faixa de referência", nunca como doença.
> - Sempre oriente a levar a dúvida ao médico.

## Defesa em profundidade

1. **Prompt** proíbe diagnóstico explicitamente.
2. **Pós-filtro** (`diagnosticGuard`) — regex que detecta frases tipo "você tem …", "diagnóstico:", "sua doença" e
   reforça o disclaimer. No chat, o disclaimer extra é enviado como delta final.

## Formato do resumo (estilo "comparativo do paciente")

O resumo segue o estilo que o paciente quer ver (resumo geral → comparativo anterior×atual → pontos de atenção →
coisas boas → leitura final → perguntas pro médico). Schema Zod em `schemas.ts` (`HealthSummarySchema`):

```jsonc
{
  "resumoGeral": "No geral, muita coisa estáboa ou melhorando...",
  "comparativo": [
    { "name": "Hemoglobina", "anterior": "16,5", "atual": "17,1", "leitura": "Subiu; acima da ref. masculina" }
  ],
  "pontosAtencao": [
    { "titulo": "TSH 7,32", "detalhe": "Como usa Levoid (sem tireoide), vale revisar dose com o endócrino..." }
  ],
  "coisasBoas": ["Glicose melhorou (79)", "Triglicérides caiu bastante (60)"],
  "leituraFinal": "Melhorou: ... Acompanhar: ... Principal a levar ao médico: TSH, hemoglobina, estradiol...",
  "perguntasParaOMedico": ["Preciso rever a dose do Levoid?"],
  "disclaimer": "Análise educativa. Não substitui avaliação médica."
}
```

## Contextualização pelo perfil clínico

O campo `Patient.clinicalProfile` (condições + medicações, ex.: "Sem tireoide; usa Levoid; usa testosterona; usa
tirzepatida") é injetado no contexto para a IA raciocinar como o paciente faria (ex.: ligar hemoglobina alta ao uso de
testosterona) — **sem diagnosticar**. Editável em **Perfil** no app.

## Comparativo anterior × atual

`generateHealthSummary` busca o exame anterior (mesmo paciente, já extraído) e monta cada item com `atual` + `anterior`
para o modelo preencher o comparativo. Precisa de pelo menos 2 exames para a coluna "anterior" ter valor.
