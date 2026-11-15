/**
 * Prepara um texto para ser FALADO (resumo em áudio).
 *
 * Problema que resolve: o texto ia inteiro, num bloco só, para a voz do aparelho. Ela lia rápido,
 * sem respirar entre frases, e tropeçava em unidades ("mg/dL"), siglas e símbolos. Aqui o texto vira
 * uma lista de trechos curtos, cada um com a pausa que vem depois dele, e as unidades são escritas
 * por extenso. NENHUM número é alterado: só a forma de dizer a unidade e os símbolos.
 */
export interface SpeechChunk { text: string; pauseMs: number }

/** Velocidade real do motor de voz para o "1x" da tela: a voz padrão do Android a 1.0 soa corrida. */
export const SPEECH_BASE_RATE = 0.88;

const PAUSE_SENTENCE = 380;
const PAUSE_PARAGRAPH = 750;
const PAUSE_CLAUSE = 180;
const MAX_CHUNK = 220;

// Unidades de laudo → como se fala. Ordem importa: as compostas vêm antes das simples.
const UNITS: Array<[RegExp, string]> = [
  [/\bmg\s*\/\s*dL\b/gi, 'miligramas por decilitro'],
  [/\bg\s*\/\s*dL\b/gi, 'gramas por decilitro'],
  [/(?<![A-Za-z])(?:µg|mcg|ug)\s*\/\s*dL\b/gi, 'microgramas por decilitro'],
  [/\bng\s*\/\s*dL\b/gi, 'nanogramas por decilitro'],
  [/\bng\s*\/\s*mL\b/gi, 'nanogramas por mililitro'],
  [/\bpg\s*\/\s*mL\b/gi, 'picogramas por mililitro'],
  [/(?<![A-Za-z])(?:µUI|mcUI|uUI|µIU|uIU)\s*\/\s*mL\b/gi, 'micro unidades por mililitro'],
  [/\bmUI\s*\/\s*mL\b/gi, 'mili unidades por mililitro'],
  [/\bmUI\s*\/\s*L\b/gi, 'mili unidades por litro'],
  [/\bU\s*\/\s*L\b/g, 'unidades por litro'],
  [/\bUI\s*\/\s*L\b/g, 'unidades por litro'],
  [/\bmmol\s*\/\s*L\b/gi, 'milimols por litro'],
  [/\bmEq\s*\/\s*L\b/gi, 'miliequivalentes por litro'],
  [/\bmg\s*\/\s*L\b/gi, 'miligramas por litro'],
  [/\bg\s*\/\s*L\b/gi, 'gramas por litro'],
  [/\bmL\s*\/\s*min\b/gi, 'mililitros por minuto'],
  [/\bmm\s*\/\s*h\b/gi, 'milímetros por hora'],
  [/\bmmHg\b/g, 'milímetros de mercúrio'],
  [/\bkg\s*\/\s*m²/gi, 'quilos por metro quadrado'],
  [/\/\s*mm³/gi, ' por milímetro cúbico'],
  [/\/\s*µL\b/gi, ' por microlitro'],
  [/\bfL\b/g, 'fentolitros'],
  [/(\d)\s*%/g, '$1 por cento'],
  [/(\d)\s*kg\b/gi, '$1 quilos'],
  [/(\d)\s*cm\b/gi, '$1 centímetros'],
];

// Símbolos e marcações que a voz lê literalmente ("asterisco", "maior que").
const SYMBOLS: Array<[RegExp, string]> = [
  [/\*\*|__|`|#+\s?/g, ''],
  [/[•●▪◦→✓✔✗✨⚠️🧬💎🎁😕]/gu, ''],
  [/\s*[–—]\s*/g, ', '],
  [/≥/g, ' maior ou igual a '],
  [/≤/g, ' menor ou igual a '],
  [/(\d)\s*-\s*(\d)/g, '$1 a $2'],
  [/\s>\s*(\d)/g, ' acima de $1'],
  [/\s<\s*(\d)/g, ' abaixo de $1'],
  [/\s*\((?:\s*)\)/g, ''],
];

/** Normaliza um trecho para fala. Números ficam exatamente como estão. */
export function normalizeForSpeech(text: string): string {
  let s = String(text ?? '');
  for (const [re, to] of UNITS) s = s.replace(re, to);
  for (const [re, to] of SYMBOLS) s = s.replace(re, to);
  // "7,9" a voz pt-BR já lê "sete vírgula nove"; "1.234" (milhar) vira "1234" para não ler "um ponto".
  s = s.replace(/(\d)\.(\d{3})(?!\d)/g, '$1$2');
  return s.replace(/[ \t]+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
}

/** Quebra uma frase longa demais nas vírgulas, sem cortar no meio de número ("7,9"). */
function splitLong(sentence: string): string[] {
  if (sentence.length <= MAX_CHUNK) return [sentence];
  const parts = sentence.split(/(?<=[,;:])\s+/);
  const out: string[] = [];
  let cur = '';
  for (const p of parts) {
    if (cur && (cur + ' ' + p).length > MAX_CHUNK) { out.push(cur); cur = p; }
    else cur = cur ? `${cur} ${p}` : p;
  }
  if (cur) out.push(cur);
  return out;
}

/** Texto → trechos falados em sequência, com a pausa que segue cada um. */
export function prepareSpeech(text: string): SpeechChunk[] {
  const chunks: SpeechChunk[] = [];
  const paragraphs = String(text ?? '').split(/\n\s*\n|\n(?=\s*[-•\d])/).map((p) => p.trim()).filter(Boolean);
  for (const para of paragraphs) {
    const clean = normalizeForSpeech(para.replace(/\n+/g, ' '));
    // fim de frase: ponto/!/? seguido de espaço e maiúscula ou dígito (não quebra "7.5" nem "Dr. Exame")
    const sentences = clean.replace(/\bDr\.\s/g, 'Doutor ').replace(/\bDra\.\s/g, 'Doutora ')
      .split(/(?<=[.!?])\s+(?=[A-ZÀ-Ú0-9"“])/).map((x) => x.trim()).filter(Boolean);
    sentences.forEach((sentence, si) => {
      const pieces = splitLong(sentence);
      pieces.forEach((piece, pi) => {
        const lastPiece = pi === pieces.length - 1;
        const lastSentence = si === sentences.length - 1;
        chunks.push({ text: piece, pauseMs: !lastPiece ? PAUSE_CLAUSE : lastSentence ? PAUSE_PARAGRAPH : PAUSE_SENTENCE });
      });
    });
  }
  if (chunks.length) chunks[chunks.length - 1].pauseMs = 0;
  return chunks;
}
