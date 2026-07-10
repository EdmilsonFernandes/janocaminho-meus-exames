import { getLlm, getModel } from '../llm';
import {
  LabExtractionSchema,
  ImagingExtractionSchema,
  type LabExtraction,
  type ImagingExtraction,
} from './schemas';
import { JSON_SUFFIX, extractJsonObject } from '../utils/json';
import { withRateLimitRetry } from '../utils/retry';
import { pdfToText } from './pdfToText';
import { imageToText } from './imageToText';

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

FAIXA DE REFERÊNCIA NA MESMA ESCALA DO VALOR (CRÍTICO): lowNumeric/highNumeric DEVEM estar na MESMA unidade e escala decimal do valueNumeric. Ex.: se valueNumeric=15.0 (g/dL), a faixa deve ser ~13.0–17.0 — NUNCA 130–170 (escala ×10 errada) nem 1.3–1.7. Preserve VÍRGULAS decimais: "4,50" vira 4.5 (não 450); "13,5" vira 13.5 (não 135).
AUTO-VERIFICAÇÃO DE ESCALA: depois de extrair, confira se valueNumeric é compatível em magnitude com lowNumeric/highNumeric. Se valueNumeric estiver ordens de magnitude fora da faixa (ex.: valor 5.8 com faixa 450–550, ou valor 15 com faixa 130–170), você leu a faixa na escala errada — RECORRIJA a faixa para a mesma escala/ordem de grandeza do valor do paciente antes de devolver.

UM VALOR POR ANALITO: se o laudo traz o MESMO analito em duas unidades equivalentes (ex.: "Testosterona Livre 2,05 nmol/L = 591 pg/mL"), reporte APENAS UMA linha — a que corresponde à faixa de referência do paciente (sexo/idade). NÃO crie dois itens pro mesmo valor (cruzaria escalas na evolução do paciente).
ANALITOS DISTINTOS: "DHT" / "Dihidrotestosterona" NÃO é Testosterona — é um analito SEPARADO (metabólito ativo da 5α-redutase). Reporte com o nome exato impresso ("DHT" ou "DIHIDROTESTOSTERONA"), nunca o renomeie para "Testosterona".

NÃO PULE PAINÉIS CLÍNICOS (CRÍTICO): em PDFs grandes com vários painéis, NÃO pule a BIOQUÍMICA/FUNÇÃO HEPÁTICA. Marcadores importantes que costumam vir juntos e DEVEM ser extraídos SE o laudo os traz: Albumina, Creatinina, Glicose, Fosfatase Alcalina (ALP), TGO (AST), TGP (ALT), GAMA-GT, PCR / Proteína C Reativa (ultrasensível), Leucócitos totais, Linfócitos %, VCM, RDW. Se há painel hepático/bioquímico, extraia TODOS os analitos dele — eles alimentam o cálculo da idade biológica.

ATENÇÃO À DATA (PRECISÃO): performedAt deve ser a DATA DO ATENDIMENTO/COLETA do exame (ex.: campo "Atendimento: 08/04/2026", "Data da coleta" ou "Data de realização"), no formato dd/mm/aaaa. NUNCA use a data de impressão, emissão, liberação ou entrega do laudo — use SEMPRE a data em que o exame foi feito/coletado.

ATENÇÃO AOS NOMES E CPF (PRECISÃO): patientName = o nome do PACIENTE, lido SEMPRE do campo "Nome:" do cabeçalho do documento. patientCpf = CPF do PACIENTE quando aparecer no cabeçalho/documento, com ou sem pontuação. Se o CPF não aparecer ou estiver ilegível, devolva string vazia. NUNCA use o CPF de médico/convênio/responsável/assinante. NUNCA use o nome de quem assinou o laudo (ex.: "assinado eletronicamente por Dr. Fulano") nem o nome do médico como patientName. requestingDoctor = o nome do campo "Médico:" do cabeçalho.

NUNCA invente valor. Se não conseguir ler com confiança, omita o analito. Agrupe em "panels" pelo título da seção.

CRÍTICO — ANTI-ALUCINAÇÃO: leia SEMPRE do documento real. Os valores/nomes/CPF do exemplo acima são SÓ exemplos — nunca os copie. Se o documento estiver ilegível/vazio ou você não conseguir ler os dados do paciente, devolva { patientName: "", patientCpf: "", requestingDoctor: "", panels: [] } — NUNCA invente um nome, CPF (ex.: "000.000.000-00") ou valores. Para o VALOR de cada analito, leia a coluna RESULTADO/RESULTADO DO PACIENTE (não a coluna de referência/valor de referência).

Devolva EXATAMENTE este formato JSON:
{
  "patientName": "NOME COMPLETO do PACIENTE (campo 'Nome:' no cabeçalho — nunca o assinante/médico)",
  "patientCpf": "CPF do PACIENTE se constar no documento; vazio se não constar",
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
  "patientName": "nome do paciente se constar no laudo",
  "patientCpf": "CPF do paciente se constar no laudo; vazio se não constar",
  "examTitle": "TC ABDOME SUPERIOR",
  "performedAt": "24/10/2025",
  "sourceLab": "...",
  "findings": [ { "text": "achado do laudo", "page": 1 } ],
  "impression": "conclusão, se houver"
}
Copie fielmente o texto. Não invente achados nem nomes.`;

/** Chamada base — usa STREAMING (necessário para max_tokens altos + evita timeout de 10min). */
async function createJson(buffer: Buffer, mediaType: string, instruction: string, maxTokens = 16000, precomputedText?: string): Promise<any> {
  const response = await withRateLimitRetry(async () => {
    // PDF: pdftotext. Imagem/foto: OCR (tesseract). Em ambos manda TEXTO ao modelo (o relay GLM
    // NÃO enxerga imagem/PDF; e content como TEXTO funciona em QUALQUER provider da abstração llm/).
    // precomputedText: OCR já feito no pre-check do pipeline → reusa (não roda tesseract 2x).
    const isPdf = mediaType === 'application/pdf';
    let text = precomputedText ?? '';
    if (isPdf) {
      if (!text || text.trim().length < 50) { try { text = await pdfToText(buffer); } catch { /* não é PDF válido */ } }
      if (!text || text.trim().length < 50) { try { const ocr = await imageToText(buffer); if (ocr && ocr.trim().length > 50) { console.log('[extraction] PDF sem texto → OCR fallback,', ocr.length, 'chars'); text = ocr; } } catch { /* sem tesseract */ } }
    } else {
      if (!text) { try { text = await imageToText(buffer); } catch (e) { console.warn('[extraction] OCR falhou:', (e as Error).message); } }
      if (text && text.trim().length > 50) console.log('[extraction] imagem OCRizada,', text.length, 'chars');
    }
    const label = isPdf ? 'CONTEÚDO EXTRAÍDO DO EXAME' : 'CONTEÚDO EXTRAÍDO DO EXAME via OCR';
    const content = instruction + `\n\n=== ${label} (use EXATAMENTE estes dados; NUNCA invente valores/nomes) ===\n` + (text && text.trim().length > 0 ? text : '(não foi possível extrair texto legível)') + '\n' + JSON_SUFFIX;
    const s = await getLlm().stream({ model: getModel(), maxTokens, messages: [{ role: 'user', content }] });
    return s.final();
  });

  if (response.stopReason === 'max_tokens') {
    const err = new Error('Exame grande demais para extrair em uma chamada (limite de saída).');
    (err as any).status = 413;
    throw err;
  }
  // diagnóstico: input_tokens pequeno => o PDF/documento não chegou ao modelo (relay dropou)
  console.log('[extraction] model:', getModel(), '| usage:', JSON.stringify(response.usage));
  return extractJsonObject(response.text);
}

export async function extractLabPanel(buffer: Buffer, mediaType = 'application/pdf', precomputedText?: string): Promise<LabExtraction> {
  const json = await createJson(buffer, mediaType, LAB_INSTRUCTIONS, 16000, precomputedText);
  const z = LabExtractionSchema.safeParse(json);
  if (!z.success) console.warn('[extraction] Zod estrito falhou, usando JSON bruto:', z.error.issues.slice(0, 3));
  return (z.success ? z.data : json) as LabExtraction;
}

export async function extractImaging(buffer: Buffer, mediaType = 'application/pdf', precomputedText?: string): Promise<ImagingExtraction> {
  const json = await createJson(buffer, mediaType, IMAGING_INSTRUCTIONS, 6000, precomputedText);
  const z = ImagingExtractionSchema.safeParse(json);
  if (!z.success) console.warn('[extraction/imaging] Zod estrito falhou, usando JSON bruto');
  return (z.success ? z.data : json) as ImagingExtraction;
}
