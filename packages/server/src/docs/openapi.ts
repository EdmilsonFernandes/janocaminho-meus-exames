/** OpenAPI 3 da API pública v1 — servida em /api/docs (swagger-ui).
 *  Hand-written (não JSDoc): o spec É o contrato; mudou rota, muda aqui junto. */

const serverUrl = process.env.PUBLIC_API_URL || 'https://drexame.janocaminho.com.br';

export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Dr. Exame API',
    version: '1.0.0',
    description:
      'Preço REAL de medicamentos em farmácias brasileiras + checagem de interações D/X.\n\n' +
      '**O que esta API é:** dado público de varejo farmacêutico (catálogo, preços coletados de farmácias, interações medicamentosas educativas) para apps e sites de saúde.\n\n' +
      '**O que ela NÃO é:** não expõe interpretação de exames, nem dado pessoal de saúde (LGPD), e nada aqui é recomendação médica (linha ANVISA RDC 657 — ferramenta educativa).\n\n' +
      '**Tier grátis:** 100 chamadas/mês, 60/min. Crie sua chave com o login do app em `POST /keys`.',
    contact: { name: 'Dr. Exame', email: 'contato@janocaminho.com.br' },
  },
  servers: [{ url: `${serverUrl}/api/public/v1` }],
  tags: [
    { name: 'Medicamentos', description: 'Catálogo e preços' },
    { name: 'Interações', description: 'Checagem fármaco-fármaco (D/X)' },
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
    },
  },
  paths: {
    '/': {
      get: {
        tags: ['Medicamentos'], summary: 'Info da API (sem key)', security: [],
        responses: { '200': { description: 'Metadados da API' } },
      },
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
