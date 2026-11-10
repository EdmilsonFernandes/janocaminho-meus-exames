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
  // PEDIDO/SOLICITAÇÃO de exame (o médico PEDIU o exame; usuário sobe achando que é o exame).
  // Caso real recorrente: 2 dos 3 uploads rejeitados de set/26 eram solicitação/guia TISS
  // ("Solicitação de Exame(s)", "Hipótese Diagnóstica", "procedimento solicitado").
  { test: /(solicita[cç][aã]o de exames?|exames? solicitad|hip[oó]tese diagn[oó]stica|procedimento[s]? solicitad|guia de (solicita[cç][aã]o|encaminhamento)|pedido m[eé]dico)/i,
    reason: 'Isso é um PEDIDO de exame (solicitação do médico), não o resultado. Envie o resultado quando estiver pronto — crie um Lembrete para não esquecer de buscá-lo.' },
  // TICKET/COMPROVANTE de agendamento (caso real 10/11, anti-HTLV): o lab entrega um
  // comprovante com preparo/jejum/"exames por agendar" — sem nenhum resultado. O usuário
  // fotografa achando que já é o exame. Frases REAIS do documento.
  { test: /(exames? por agendar|preparo do paciente para realiza|localizador de exames|guarde este documento at[eé][^.\n]{0,40}(entrega|coleta)|resultados? estar[aã]o dispon[ií]veis|documento de identidade ser[aá] exigido para realiza)/i,
    reason: 'Isso é o COMPROVANTE de agendamento do exame (com preparo e jejum), ainda sem resultado. Busque o resultado no portal do laboratório quando estiver pronto e envie ele — crie um Lembrete para não esquecer.' },
  // ATESTADO MÉDICO (afastamento/condição) — frequentemente anexado junto com pedidos.
  { test: /(atestado m[eé]dico|atesto (que|para)|dias? de afastamento|afastamento de \d+ |dever[aá] permanecer afastado)/i,
    reason: 'Isso é um ATESTADO MÉDICO (afastamento/condição de saúde), não um resultado de exame. Guarde-o para apresentação — o Dr. Exame lê resultados de exames.' },
  // CARTEIRINHA/dados do convênio.
  { test: /(cart[eē]irinha|cart[aã]o do (plano|conv[eê]nio)|n[uú]mero da carteira|validade da carteira)/i,
    reason: 'Isso é a CARTEIRINHA/cartão do plano de saúde, não um resultado de exame.' },
  // AUTORIZAÇÃO de procedimento (senha do convênio).
  { test: /(autoriza[cç][aã]o de (procedimento|exame|servi[cç]o)|senha de autoriza[cç][aã]o|procedimento autorizado)/i,
    reason: 'Isso é uma AUTORIZAÇÃO de procedimento (aprovação do convênio), não o resultado. O resultado sai depois de o exame ser realizado — crie um Lembrete.' },
  // CONFIRMAÇÃO de agendamento (e-mail/WhatsApp do lab).
  { test: /(confirma[cç][aã]o de agendamento|seu exame est[aá] agendado|agendamento confirmado|agendado para \d{2}\/\d{2})/i,
    reason: 'Isso é a CONFIRMAÇÃO do agendamento, não o resultado. Envie o resultado quando sair no portal do laboratório.' },
  // COMPROVANTE DE VACINA.
  { test: /(cart[aã]o de vacina|comprovante de vacina|dose aplicada|lote da vacina|fabricante da vacina|imuniza[cç][aã]o realizada)/i,
    reason: 'Isso é um COMPROVANTE DE VACINA, não um exame. Registre suas vacinas na aba Vacinas do app.' },
  // TERMO/CONSENTIMENTO.
  { test: /(termo de consentimento|termo de ci[eê]ncia)/i,
    reason: 'Isso é um TERMO/CONSENTIMENTO, não um resultado de exame.' },
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

// Frases de TICKET/AGENDAMENTO que NUNCA aparecem num resultado — checadas ANTES da
// aceitação por VALID_MEDICAL. Caso real anti-HTLV 10/11: o ticket tem "codigo Paciente:
// 3978245" e o sinal fraco `paciente:` o aceitava como exame (IA gastada à toa até cair
// no guard de 0 itens). Aqui a especificidade é total: resultado não diz "resultados
// estarão disponíveis" nem "guarde este documento até a coleta". OCR pode separar
// "exame (s)" com espaços — os patterns toleram.
const TICKET_STRONG_REASON = 'Isso é o COMPROVANTE de agendamento do exame (com preparo e jejum), ainda sem resultado. Busque o resultado no portal do laboratório quando estiver pronto e envie ele — crie um Lembrete para não esquecer.';
const TICKET_STRONG = /(exames?\s*\(s\)\s*por agendar|exames?\s+por agendar|resultados?\s+estar[aã]o\s+dispon[ií]veis|guarde\s+este\s+documento|localizador\s+de\s+exames)/i;

export function classifyDoc(text: string, opts?: { isPdf?: boolean }): DocClass {
  const t = (text || '').trim();
  if (!t) {
    // Caso real 09/11: PDF de 4,6MB com 3 caracteres extraíveis — FOTO SALVA COMO PDF.
    // A mensagem antiga pedia "envie um PDF"… e o usuário TINHA enviado um PDF.
    if (opts?.isPdf) {
      return { accept: false, strong: true, reason: 'Não conseguimos ler esse PDF 😕 — ele parece ser uma foto de exame salva como PDF (sem texto). Exporte o PDF direto do portal do laboratório, ou use o Escanear (câmera) / foto nítida.' };
    }
    return { accept: false, strong: true, reason: 'Não conseguimos ler seu exame 😕 — a imagem ficou difícil de decifrar. Tente o Escanear (a câmera ajusta borda, luz e nitido pra você) ou envie um PDF.' };
  }
  // 0. Ticket/agendamento ANTES de tudo — "Paciente:" no ticket não pode virar exame.
  if (TICKET_STRONG.test(t)) return { accept: false, strong: true, reason: TICKET_STRONG_REASON };
  // 1. Aceita PRIMEIRO se há sinais fortes de exame/laudo — mesmo que o texto
  //    tenha alguma palavra de rejeição (ex.: exame que cita "CPF"/"RG" do paciente).
  //    (Antes checava REJECT antes → exame real caía em "parece RG" = falso positivo.)
  if (VALID_MEDICAL.test(t)) return { accept: true, strong: false };
  // 2. Sem sinais médicos → rejeição específica (categoria conhecida de não-exame).
  for (const r of REJECT) if (r.test.test(t)) return { accept: false, strong: true, reason: r.reason };
  // 3. Caso geral: sem sinais fortes (pipeline decide após a extração da IA).
  return { accept: false, strong: false, reason: 'Não identificamos um exame neste documento. Se for um exame de verdade, tente o Escanear (câmera) ou envie um PDF mais nítido.' };
}
