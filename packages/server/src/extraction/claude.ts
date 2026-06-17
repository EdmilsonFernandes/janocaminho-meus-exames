import { getAnthropic, MODEL } from '../claude/client';
import {
  LabExtractionSchema,
  ImagingExtractionSchema,
  type LabExtraction,
  type ImagingExtraction,
} from './schemas';
import { JSON_SUFFIX, extractJsonObject } from '../utils/json';
import { withRateLimitRetry } from '../utils/retry';
import { pdfToText } from './pdfToText';

import { pdfToImages } from './pdfToImages';

/**
 * Cria os blocos de conteúdo (image) a partir do buffer.
 * PDF é rasterizado em PNGs (o relay Z.ai descarta blocos "document" de PDF — só lê "image").
 */
async function contentBlocksFromBuffer(buffer: Buffer, mediaType: string): Promise<any[]> {
  const data = buffer.toString('base64');
  if (mediaType === 'application/pdf') {
    try {
      const imgs = await pdfToImages(buffer, 12, 150);
      if (imgs.length) {
        console.log('[extraction] PDF rasterizado em', imgs.length, 'imagem(ns) PNG');
        return imgs.map((b) => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: b.toString('base64') } }));
      }
    } catch (e) {
      console.warn('[extraction] pdftoppm falhou, caindo p/ bloco document:', (e as Error).message);
    }
    return [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }];
  }
  return [{ type: 'image', source: { type: 'base64', media_type: mediaType, data } }];
}

const LAB_INSTRUCTIONS = `Você é um especialista em ler resultados de EXAMES LABORATORIAIS brasileiros a partir de um documento.

LEIA TODAS AS PÁGINAS do documento. Extraia TODOS os analitos de TODOS os painéis/seções (hemograma, urina, bioquímica, hormônios, coagulação, etc.). NÃO pule nenhum painel. NÃO pare antes de extrair tudo.

LEIA AS TABELAS COM CUIDADO: cada analito tem um valor e colunas de valores de referência (Homens, Mulheres, Crianças...). NÃO confunda o valor do paciente com a faixa de referência.

Para cada analito: nome, valor (como impresso), valor numérico (vírgula→ponto, sem unidade), unidade, faixas de referência e a PÁGINA onde leu o valor.

ATENÇÃO À DATA (PRECISÃO): performedAt deve ser a DATA DO ATENDIMENTO/COLETA do exame (ex.: campo "Atendimento: 08/04/2026", "Data da coleta" ou "Data de realização"), no formato dd/mm/aaaa. NUNCA use a data de impressão, emissão, liberação ou entrega do laudo — use SEMPRE a data em que o exame foi feito/coletado.

ATENÇÃO AOS NOMES (PRECISÃO): patientName = o nome do PACIENTE, lido SEMPRE do campo "Nome:" do cabeçalho do documento. NUNCA use o nome de quem assinou o laudo (ex.: "assinado eletronicamente por Dr. Fulano") nem o nome do médico como patientName. requestingDoctor = o nome do campo "Médico:" do cabeçalho.

NUNCA invente valor. Se não conseguir ler com confiança, omita o analito. Agrupe em "panels" pelo título da seção.

CRÍTICO — ANTI-ALUCINAÇÃO: leia SEMPRE do documento real. Os valores/nomes do exemplo acima são SÓ exemplos — nunca os copie. Se o documento estiver ilegível/vazio ou você não conseguir ler os dados do paciente, devolva { patientName: "", requestingDoctor: "", panels: [] } — NUNCA invente um nome (ex.: "TESTE LABORATORIAL", "MÉDICO SOLICITANTE") nem valores. Para o VALOR de cada analito, leia a coluna RESULTADO/RESULTADO DO PACIENTE (não a coluna de referência/valor de referência).

Devolva EXATAMENTE este formato JSON:
{
  "patientName": "NOME COMPLETO do PACIENTE (campo 'Nome:' no cabeçalho — nunca o assinante/médico)",
  "examTitle": "HEMOGRAMA COMPLETO",
  "performedAt": "12/06/2026",
  "sourceLab": "nome do laboratório/unidade",
  "requestingDoctor": "nome do médico SOLICITANTE (campo 'Médico:' no cabeçalho)",
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

/** Chamada base — usa STREAMING (necessário para max_tokens altos + evita timeout de 10min). */
async function createJson(buffer: Buffer, mediaType: string, instruction: string, maxTokens = 16000): Promise<any> {
  const client = getAnthropic();
  const response = await withRateLimitRetry(async () => {
    // PDF: extrai o TEXTO (pdftotext) e manda como texto — o relay GLM NAO enxerga imagem/PDF.
    // Imagem (foto): visão (best-effort; relay limitado).
    let content: any[];
    if (mediaType === 'application/pdf') {
      const text = await pdfToText(buffer);
      content = [{ type: 'text', text: instruction + '\n\n=== CONTEÚDO EXTRAÍDO DO EXAME (use EXATAMENTE estes dados; NUNCA invente valores/nomes) ===\n' + text + '\n' + JSON_SUFFIX }];
    } else {
      content = [...(await contentBlocksFromBuffer(buffer, mediaType)), { type: 'text', text: instruction + JSON_SUFFIX }];
    }
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content }],
    } as any);
    return stream.finalMessage();
  });

  if (response.stop_reason === 'max_tokens') {
    const err = new Error('Exame grande demais para extrair em uma chamada (limite de saída).');
    (err as any).status = 413;
    throw err;
  }
  // diagnóstico: input_tokens pequeno => o PDF/documento não chegou ao modelo (relay dropou)
  console.log('[extraction] model:', MODEL, '| usage:', JSON.stringify(response.usage));
  const text = (response.content as any[])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  return extractJsonObject(text);
}

export async function extractLabPanel(buffer: Buffer, mediaType = 'application/pdf'): Promise<LabExtraction> {
  const json = await createJson(buffer, mediaType, LAB_INSTRUCTIONS, 16000);
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
