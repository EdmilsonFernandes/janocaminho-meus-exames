import { getAnthropic, MODEL } from '../claude/client';
import {
  LabExtractionSchema,
  ImagingExtractionSchema,
  type LabExtraction,
  type ImagingExtraction,
} from './schemas';
import { JSON_SUFFIX, extractJsonObject } from '../utils/json';

/**
 * Cria o bloco de conteúdo (document p/ PDF, image p/ JPEG/PNG) a partir do buffer.
 * O modelo lê por VISÃO, preservando a estrutura 2D das tabelas.
 */
function contentBlockFromBuffer(buffer: Buffer, mediaType: string): any {
  const data = buffer.toString('base64');
  if (mediaType === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } };
  }
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
}

const LAB_INSTRUCTIONS = `Você é um especialista em ler resultados de EXAMES LABORATORIAIS brasileiros a partir de um documento.

LEIA TODAS AS PÁGINAS do documento. Extraia TODOS os analitos de TODOS os painéis/seções (hemograma, urina, bioquímica, hormônios, coagulação, etc.). NÃO pule nenhum painel. NÃO pare antes de extrair tudo.

LEIA AS TABELAS COM CUIDADO: cada analito tem um valor e colunas de valores de referência (Homens, Mulheres, Crianças...). NÃO confunda o valor do paciente com a faixa de referência.

Para cada analito: nome, valor (como impresso), valor numérico (vírgula→ponto, sem unidade), unidade, faixas de referência e a PÁGINA onde leu o valor.

NUNCA invente valor. Se não conseguir ler com confiança, omita o analito. Agrupe em "panels" pelo título da seção.

Devolva EXATAMENTE este formato JSON:
{
  "patientName": "NOME COMPLETO do paciente como está no documento",
  "examTitle": "HEMOGRAMA COMPLETO",
  "performedAt": "12/06/2026",
  "sourceLab": "nome do laboratório/unidade",
  "requestingDoctor": "nome do médico solicitante (se houver)",
  "panels": [
    {
      "name": "HEMOGRAMA",
      "items": [
        {
          "name": "HEMOGLOBINA",
          "valueText": "17,1 g/dL",
          "valueNumeric": 17.1,
          "unit": "g/dL",
          "references": [ { "appliesTo": "Homens", "lowNumeric": 13.0, "highNumeric": 16.5 } ],
          "page": 1
        }
      ]
    }
  ]
}`;

const IMAGING_INSTRUCTIONS = `Você está lendo o LAUDO de um exame (tomografia, ECG, ultrassom, etc.). Devolva JSON:
{
  "examTitle": "TC ABDOME SUPERIOR",
  "performedAt": "24/10/2025",
  "sourceLab": "...",
  "findings": [ { "text": "achado do laudo", "page": 1 } ],
  "impression": "conclusão, se houver"
}
Copie fielmente o texto. Não invente achados nem nomes.`;

/** Chamada base (relay-compatível: sem thinking/effort/output_config; JSON pedido no prompt). */
async function createJson(buffer: Buffer, mediaType: string, instruction: string, maxTokens = 12000): Promise<any> {
  const client = getAnthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [
      {
        role: 'user',
        content: [contentBlockFromBuffer(buffer, mediaType), { type: 'text', text: instruction + JSON_SUFFIX }],
      },
    ],
  } as any);

  if (response.stop_reason === 'max_tokens') {
    const err = new Error('Exame grande demais para extrair em uma chamada (limite de saída).');
    (err as any).status = 413;
    throw err;
  }
  const text = (response.content as any[])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  return extractJsonObject(text);
}

export async function extractLabPanel(buffer: Buffer, mediaType = 'application/pdf'): Promise<LabExtraction> {
  const json = await createJson(buffer, mediaType, LAB_INSTRUCTIONS, 32000);
  const z = LabExtractionSchema.safeParse(json);
  if (!z.success) console.warn('[extraction] Zod estrito falhou, usando JSON bruto:', z.error.issues.slice(0, 3));
  return (z.success ? z.data : json) as LabExtraction;
}

export async function extractImaging(buffer: Buffer, mediaType = 'application/pdf'): Promise<ImagingExtraction> {
  const json = await createJson(buffer, mediaType, IMAGING_INSTRUCTIONS, 6000);
  const z = ImagingExtractionSchema.safeParse(json);
  if (!z.success) console.warn('[extraction/imaging] Zod estrito falhou, usando JSON bruto');
  return (z.success ? z.data : json) as ImagingExtraction;
}
