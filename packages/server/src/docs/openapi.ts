/** OpenAPI 3 da API pública v1 — servida em /api/docs (swagger-ui).
 *  Hand-written (não JSDoc): o spec É o contrato; mudou rota, muda aqui junto. */

const serverUrl = process.env.PUBLIC_API_URL || 'https://drexame.janocaminho.com.br';

export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Dr. Exame API',
    version: '1.2.0',
    description:
      'Preço REAL de medicamentos em farmácias brasileiras + interações D/X + motores de laudo (extração e interpretação) como serviço.\n\n' +
      '**O que esta API é:**\n' +
      '- **Varejo farmacêutico público:** catálogo, preços coletados de 9 farmácias e interações medicamentosas educativas.\n' +
      '- **Ferramentas sobre o SEU dado:** você envia o laudo (PDF/texto) ou os valores — a API estrutura e interpreta por faixa. Somos processador (LGPD): nada é armazenado, nada de pacientes do Dr. Exame sai.\n\n' +
      '**Preço por chamada:** endpoints de dados = 1 chamada · `POST /exams/extract` = **20 chamadas** (motor de IA; falha → reembolso automático).\n\n' +
      '**Como acessar (pré-pago):** 1) crie sua conta no app → 2) `POST /access-request` (empresa + caso de uso) → 3) na aprovação você recebe o **teste grátis de 25 chamadas** e pode criar chaves → 4) recarregue com pacotes pré-pagos (PIX, cartão ou débito) via `POST /api/billing/buy-api-pack`. Sem saldo → `402` com os pacotes disponíveis.\n\n' +
      '**O que ela NÃO é:** nada aqui é diagnóstico ou conduta clínica (ANVISA RDC 657 — ferramenta educativa).',
    contact: { name: 'Dr. Exame', email: 'contato@janocaminho.com.br' },
  },
  servers: [{ url: `${serverUrl}/api/public/v1` }],
  tags: [
    { name: 'Medicamentos', description: 'Catálogo, normalização e preços' },
    { name: 'Interações', description: 'Checagem fármaco-fármaco (D/X)' },
    { name: 'Exames', description: 'Extração de laudo (IA) e interpretação por faixa (determinístico)' },
    { name: 'Chaves', description: 'Gestão self-service das suas API keys' },
  ],
  components: {
    securitySchemes: { ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'x-api-key' } },
    schemas: {
      MedResult: {
        type: 'object',
        properties: {
          name: { type: 'string', example: 'Losartana Potássica' },
          activeIngredient: { type: 'string', example: 'LOSARTANA POTASSICA' },
          brands: { type: 'array', items: { type: 'string' } },
          doses: { type: 'array', items: { type: 'string' } },
          photoUrl: { type: 'string', nullable: true },
          bestPriceCents: { type: 'integer', nullable: true, example: 989 },
          bestPharmacy: { type: 'string', nullable: true, example: 'Pague Menos' },
          ean: { type: 'string', nullable: true },
          offersCount: { type: 'integer' },
        },
      },
      PriceOffer: {
        type: 'object',
        properties: {
          pharmacy: { type: 'string', example: 'Pague Menos' },
          productName: { type: 'string', example: 'Losartana Potássica 50mg 30 Comprimidos Genérico' },
          priceCents: { type: 'integer', example: 989 },
          url: { type: 'string' },
          imageUrl: { type: 'string', nullable: true },
          ean: { type: 'string', nullable: true },
        },
      },
      PricesResponse: {
        type: 'object',
        properties: {
          medicationKey: { type: 'string', example: 'LOSARTANA POTASSICA|50MG|CP|30' },
          lowestPriceCents: { type: 'integer', nullable: true },
          averagePriceCents: { type: 'integer', nullable: true },
          offersCount: { type: 'integer' },
          stale: { type: 'boolean', description: 'true se a coleta tem mais de 6h' },
          collectedAt: { type: 'string', format: 'date-time' },
          offers: { type: 'array', items: { $ref: '#/components/schemas/PriceOffer' } },
        },
      },
      Interaction: {
        type: 'object',
        properties: {
          drugA: { type: 'string', example: 'LOSARTANA' },
          drugB: { type: 'string', example: 'VARFARINA' },
          severity: { type: 'string', enum: ['A', 'B', 'C', 'D', 'X'], description: 'D=requer ajuste, X=contraindicado' },
          effect: { type: 'string' },
          recommendation: { type: 'string' },
          source: { type: 'string', nullable: true },
        },
      },
      Error: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
      NormalizeResult: {
        type: 'object',
        properties: {
          input: { type: 'string', example: 'Levoid 75mcg' },
          brandResolved: { type: 'object', nullable: true, properties: { from: { type: 'string', example: 'levoid' }, to: { type: 'string', example: 'LEVOTIROXINA' } } },
          activeIngredient: { type: 'string', example: 'LEVOTIROXINA' },
          dosage: { type: 'object', nullable: true, properties: { value: { type: 'number', example: 75 }, unit: { type: 'string', example: 'MCG' } } },
          form: { type: 'string', nullable: true, example: 'CP' },
          packQty: { type: 'integer', nullable: true, example: null },
          medicationKey: { type: 'string', nullable: true, example: 'LEVOTIROXINA|75MCG|CP|?' },
          comparable: { type: 'boolean', example: false, description: 'true quando dose+forma+embalagem fecharam a chave — preço comparável honesto' },
          prices: { type: 'object', nullable: true, description: 'includePrices=true e comparable: {lowestPriceCents, offersCount, collectedAt}' },
        },
      },
      ExtractResult: {
        type: 'object',
        properties: {
          exams: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                examTitle: { type: 'string', nullable: true, example: 'HEMOGRAMA + TIREOIDE' },
                sourceLab: { type: 'string', nullable: true, example: 'Lab Central' },
                performedAt: { type: 'string', nullable: true, example: '2026-08-01' },
                patientName: { type: 'string', nullable: true },
                panels: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string', nullable: true },
                      items: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string', example: 'TSH' },
                            valueText: { type: 'string', nullable: true, example: '7,32' },
                            valueNumeric: { type: 'number', nullable: true, example: 7.32 },
                            unit: { type: 'string', nullable: true, example: 'µUI/mL' },
                            references: { type: 'array', items: { type: 'object', properties: { appliesTo: { type: 'string', example: 'Adultos' }, lowNumeric: { type: 'number', nullable: true }, highNumeric: { type: 'number', nullable: true }, unit: { type: 'string', nullable: true } } } },
                            page: { type: 'integer', description: 'Página-fonte da citação (1-indexed)' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          itemCount: { type: 'integer', example: 23 },
          charged: { type: 'integer', example: 20, description: 'Chamadas debitadas' },
          disclaimer: { type: 'string' },
        },
      },
      InterpretResult: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', example: 'TSH' },
                value: { type: 'number', example: 7.32 },
                refLow: { type: 'number', nullable: true },
                refHigh: { type: 'number', nullable: true },
                flag: { type: 'string', enum: ['NORMAL', 'HIGH', 'LOW', 'UNKNOWN'] },
                tone: { type: 'string', enum: ['normal', 'atencao', 'critico', 'neutro', 'contexto'], description: 'Cor sugerida do chip (normal=verde, atencao=âmbar, critico=vermelho)' },
                label: { type: 'string', example: 'Acima da referência' },
              },
            },
          },
          summary: { type: 'object', properties: { total: { type: 'integer' }, altered: { type: 'integer' }, critical: { type: 'integer' } } },
          disclaimer: { type: 'string' },
        },
      },
    },
  },
  paths: {
    '/': {
      get: {
        tags: ['Medicamentos'], summary: 'Info da API (sem key)', security: [],
        responses: { '200': { description: 'Metadados da API (pacotes, como acessar)' } },
      },
    },
    '/access-request': {
      post: {
        tags: ['Chaves'], summary: 'Solicitar acesso (login do app — Bearer token)', security: [{ bearerAuth: [] }],
        description: 'Conte quem você é e o que vai construir. Aprovado = pacote teste grátis + permissão de criar chaves.',
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['company', 'useCase'], properties: { company: { type: 'string', example: 'Portal Saúde XYZ' }, useCase: { type: 'string', example: 'Comparador de preço de remédios no meu portal' } } } } } },
        responses: { '201': { description: 'Solicitação criada (pending) ou auto-aprovada' }, '409': { description: 'Já existe solicitação pendente/aprovada' } },
      },
      get: { tags: ['Chaves'], summary: 'Ver status da sua solicitação', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Solicitação mais recente' } } },
    },
    '/meds': {
      get: {
        tags: ['Medicamentos'], summary: 'Buscar medicamentos no catálogo', security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string' }, example: 'losartana', description: 'Nome, marca ou princípio ativo (mín. 2 caracteres)' },
        ],
        responses: {
          '200': {
            description: 'Resultados do catálogo (com melhor preço cacheado)',
            content: { 'application/json': { schema: { type: 'object', properties: { query: { type: 'string' }, count: { type: 'integer' }, results: { type: 'array', items: { $ref: '#/components/schemas/MedResult' } } } } } },
          },
          '400': { description: 'q ausente/curto', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '401': { description: 'Sem/invalid x-api-key' },
          '429': { description: 'Rate limit (60/min) ou cota mensal' },
        },
      },
    },
    '/meds/prices': {
      get: {
        tags: ['Medicamentos'], summary: 'Preços por farmácia (snapshot)', security: [{ ApiKeyAuth: [] }],
        description: 'Preços coletados das farmácias para o princípio ativo (+apresentação opcional). Lê do cache — coletas têm até 6h; `stale: true` avisa quando passa disso.',
        parameters: [
          { name: 'ingredient', in: 'query', required: true, schema: { type: 'string' }, example: 'losartana potassica' },
          { name: 'dose', in: 'query', required: false, schema: { type: 'string' }, example: '50' },
          { name: 'unit', in: 'query', required: false, schema: { type: 'string', enum: ['MG', 'MCG', 'ML', 'G'] }, example: 'MG' },
        ],
        responses: {
          '200': { description: 'Snapshot + ofertas ordenadas por preço', content: { 'application/json': { schema: { $ref: '#/components/schemas/PricesResponse' } } } },
          '404': { description: 'Sem snapshot para o termo' },
        },
      },
    },
    '/meds/interactions': {
      get: {
        tags: ['Interações'], summary: 'Interações entre remédios (default: só D/X)', security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: 'drugs', in: 'query', required: true, schema: { type: 'string' }, example: 'varfarina,losartana,dipirona', description: '2+ nomes separados por vírgula' },
          { name: 'all', in: 'query', required: false, schema: { type: 'string', enum: ['1'] }, description: 'Inclui severidades A/B/C (default: só D e X)' },
        ],
        responses: {
          '200': { description: 'Interações encontradas entre os pares informados', content: { 'application/json': { schema: { type: 'object', properties: { drugs: { type: 'array', items: { type: 'string' } }, checkedPairs: { type: 'integer' }, count: { type: 'integer' }, interactions: { type: 'array', items: { $ref: '#/components/schemas/Interaction' } } } } } } },
        },
      },
    },
    '/meds/normalize': {
      post: {
        tags: ['Medicamentos'], summary: 'Texto livre → chave canônica do remédio', security: [{ ApiKeyAuth: [] }],
        description:
          'O motor de normalização do app, exposto: recebe um texto sujo ("Dorflex 10cp", linha de receita, "levotirox 75") e devolve ' +
          'princípio ativo + dose + forma + embalagem + `medicationKey` — a MESMA chave que `/meds/prices` usa. Resolve marca → genérico ' +
          '(LEVOID → LEVOTIROXINA). Com `"includePrices": true` já volta o melhor preço junto (funil em 1 chamada).\n\n' +
          '**Quando usar:** você recebe nome de remédio digitado por humano e precisa de uma chave estável pra comparar/preços/banco.',
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object', required: ['text'], properties: { text: { type: 'string', example: 'Dorflex Analgésico e Relaxante Muscular 10 comprimidos' }, packQty: { type: 'integer', nullable: true, example: 10, description: 'Embalagem conhecida (opcional — o parser infere do texto)' }, includePrices: { type: 'boolean', example: false, description: 'true = inclui snapshot de preço do ingrediente' } } },
              example: { text: 'Levoid 75mcg', includePrices: true },
            },
          },
        },
        responses: {
          '200': {
            description: 'Estrutura canônica (comparable=false quando falta dose/embalagem — preço não seria honesto)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/NormalizeResult' } } },
          },
          '400': { description: 'text ausente/curto' },
        },
      },
    },
    '/exams/extract': {
      post: {
        tags: ['Exames'], summary: 'Laudo (PDF/imagem/texto) → JSON estruturado — 20 chamadas', security: [{ ApiKeyAuth: [] }],
        description:
          '**A joia do Dr. Exame como serviço:** envia o laudo laboratorial (do SEU domínio — você é o controlador do documento) e recebe ' +
          'o JSON estruturado: painéis, itens, valores, unidades, faixas de referência e página-fonte de cada dado.\n\n' +
          '**Custo:** consome **20 chamadas** do saldo (motor de IA por trás) — o pack Starter (R$ 19,90 / 1.000) rende 50 extrações ' +
          '(≈ R$ 0,40/exame). Falha nossa/da IA ou documento sem itens → **reembolso automático** (você não paga erro).\n\n' +
          '**Envio:** `multipart/form-data` com campo `file` (PDF ou foto) OU `application/json` `{ "text": "..." }` com o conteúdo textual.\n\n' +
          '**Privacidade:** nada é armazenado — processamos e respondemos; o dado volta pra você (LGPD: você controla, nós processamos).',
        requestBody: {
          content: {
            'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary', description: 'PDF ou imagem do laudo' } } } },
            'application/json': { schema: { type: 'object', properties: { text: { type: 'string', example: 'HEMOGLOBINA 14,0 g/dL (12,0-16,0)\nTSH 7,32 µUI/mL (0,4-4,0)' } } } },
          },
        },
        responses: {
          '200': { description: 'Exames estruturados (pode ser >1 se o PDF tiver datas de coleta distintas)', content: { 'application/json': { schema: { $ref: '#/components/schemas/ExtractResult' } } } },
          '400': { description: 'Sem file/text (mín. 50 caracteres)' },
          '402': { description: 'Saldo < 20 chamadas — resposta traz os pacotes' },
          '422': { description: 'extraction_empty — nenhum item identificado (não cobrado)' },
          '503': { description: 'ai_unavailable — motor indisponível (não cobrado)' },
        },
      },
    },
    '/exams/interpret': {
      post: {
        tags: ['Exames'], summary: 'Valor × faixa → flag/rótulo (determinístico, 1 chamada)', security: [{ ApiKeyAuth: [] }],
        description:
          'O motor determinístico de exibição do app: cada item vira `{flag, tone, label}` — direção **e grau** (>20% além do limite = ' +
          '"Muito acima/abaixo", tom crítico). LDL/Colesterol não-HDL sem faixa → sinaliza "depende do contexto clínico" (metas por risco, SBC). ' +
          'Sem faixa e sem valor → "Referência não informada" — **nunca inventa rótulo**.\n\n' +
          '**Você envia a faixa** (a do laudo de origem) — nós aplicamos a régua. Zero IA na chamada: margem pura, latência mínima.',
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object', required: ['items'], properties: { items: { type: 'array', maxItems: 200, items: { type: 'object', required: ['name', 'value'], properties: { name: { type: 'string', example: 'TSH' }, value: { type: 'number', example: 7.32 }, refLow: { type: 'number', nullable: true, example: 0.4 }, refHigh: { type: 'number', nullable: true, example: 4.0 } } } } } },
              example: { items: [{ name: 'TSH', value: 7.32, refLow: 0.4, refHigh: 4.0 }, { name: 'Hemoglobina', value: 14.0, refLow: 12, refHigh: 16 }, { name: 'LDL', value: 190 }] },
            },
          },
        },
        responses: {
          '200': { description: 'Rótulos por item + resumo (total/alterados/críticos)', content: { 'application/json': { schema: { $ref: '#/components/schemas/InterpretResult' } } } },
          '400': { description: 'items ausente ou >200' },
        },
      },
    },
    '/keys': {
      post: {
        tags: ['Chaves'], summary: 'Criar chave (login do app — Bearer token, não x-api-key)', security: [{ bearerAuth: [] }],
        description: 'Autentique com o JWT do app (`Authorization: Bearer <token>`). A chave volta UMA vez nesta resposta.',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string', example: 'Minha integração' } } } } } },
        responses: { '201': { description: 'Chave criada — guarde agora' }, '429': { description: 'Máx. 5 chaves ativas' } },
      },
      get: {
        tags: ['Chaves'], summary: 'Listar chaves + uso do mês', security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Chaves (prefixo only) + uso mensal' } },
      },
    },
    '/keys/{id}': {
      delete: {
        tags: ['Chaves'], summary: 'Revogar chave', security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Revogada' }, '404': { description: 'Não é sua/inexistente' } },
      },
    },
  },
} as const;
