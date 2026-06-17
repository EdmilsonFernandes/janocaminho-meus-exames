/**
 * KB de padrões: valida se um texto extraído é um exame/laudo médico real e
 * classifica documentos comuns que NÃO são exame — com mensagem ESPECÍFICA de
 * rejeição (receita, nota fiscal, RG, rótulo de alimento, etc.).
 *
 * `classifyDoc` devolve { accept, strong, reason }:
 *  - strong=true  → rejeição certeza (categoria conhecida de não-exame). O pipeline
 *                   rejeita logo, antes de chamar a IA (economiza custo).
 *  - accept=true  → sinais fortes de exame/laudo (seguir extração).
 *  - caso geral   → sem sinais fortes (o pipeline decide depois da extração).
 */

const REJECT: { test: RegExp; reason: string }[] = [
  { test: /(receitu[aá]rio|receita m[eé]dica|prescri[cç][aã]o(?! de exame)|uso oral|tomar\s+\d*\s*comprimido|via oral\s*\d|posologia|1 comprimido|de \d+\s*em\s*\d+\s*horas|farm[aá]cia|clorado|xarope)/i,
    reason: 'Isso parece uma RECEITA/PRESCRIÇÃO de medicamento, não um resultado de exame. Envie o exame de sangue, imagem ou laudo.' },
  { test: /(nota fiscal|recibo(?! médico)|cnpj|forma de pagamento|valor (total )?(a )?pagar|linha digit[aá]vel|c[oó]digo de barras(?! de coleta)|d[aá]vida ativa|boleto)/i,
    reason: 'Isso parece uma NOTA FISCAL/RECIBO/COBRANÇA, não um exame médico.' },
  { test: /(carteira (de )?(identidade|trabalho|nacional de habilita)|\bCNH\b|\bRG\b\s*:|portador (do|da)|filia[cç][aã]o|naturalidade|documentos apresentados)/i,
    reason: 'Isso parece um DOCUMENTO PESSOAL (RG/CNH/carteira), não um exame.' },
  { test: /(tabela nutricional|por[cç][aã]o de\s+\d|valor energ[eé]tico|ingredientes|bula|composi[cç][aã]o\s*:|gl[uú]ten|lactose|carboidrato\s+\d|prote[ií]na\s+\d)/i,
    reason: 'Isso parece um RÓTULO DE ALIMENTO/SUPLEMENTO ou BULA de remédio, não um exame.' },
  { test: /(curr[ií]culo(lattes)?|experi[eê]ncia profissional|forma[cç][aã]o acad[eê]mica|resumo profissional|hist[oó]rico profissional)/i,
    reason: 'Isso parece um CURRÍCULO/documento profissional, não um exame.' },
  { test: /(extrato banc[aá]rio|ag[eê]ncia|conta corrente|saldo\s*:|deposito|transfer[eê]ncia (pix|banc))/i,
    reason: 'Isso parece um EXTRATO/COMPROVANTE financeiro, não um exame.' },
];

// Sinais fortes de um exame/laudo real (qualquer um basta pra aceitar).
const VALID_MEDICAL: RegExp = /(valor(es)? de refer[eê]ncia|faixa de refer|refer[eê]ncia\s*:|resultad{o|os}\s*:|h?emograma|glicemia(\s|:|$)|colesterol|triglic[eé]rides|creatinina|hemoglobina|hemat[oó]crito|leuc[oó]citos|plaquetas|linf[oó]citos|neutr[oó]filos|tsh|t4 livre|gama[- ]?gt|tgo|tgp|[pv]sa|ureia|[áa]cido [úu]rico|ferritina|vitamina\s*[db]\s*\d?|laudo m[eé]dico|ultrassonografia|ultrassom|tomografia|resson[aâ]ncia|raio-?x|ecografia|bi[oó]psia|coleta de sangue|posto de coleta|laborat[oó]rio|paciente\s*:|m[eé]dico\s*(solicitante|respons[aá]vel)|crm\s*:|(mg|g|ui|mmol|ng)?\s*\/\s*(dl|l|mm3|ui|hp?f))/i;

export interface DocClass { accept: boolean; strong: boolean; reason?: string }

export function classifyDoc(text: string): DocClass {
  const t = (text || '').trim();
  if (!t) return { accept: false, strong: true, reason: 'Documento vazio ou ilegível. Envie uma foto/scan nítido do exame.' };
  // 1. Rejeição específica (categoria conhecida de não-exame) → strong.
  for (const r of REJECT) if (r.test.test(t)) return { accept: false, strong: true, reason: r.reason };
  // 2. Aceita se há sinais fortes de exame/laudo.
  if (VALID_MEDICAL.test(t)) return { accept: true, strong: false };
  // 3. Caso geral: sem sinais fortes (pipeline decide após a extração da IA).
  return { accept: false, strong: false, reason: 'Não reconhecemos um exame/laudo médico neste documento. Envie um resultado de exame (sangue, imagem ou laudo).' };
}
