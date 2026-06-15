/** Sufixo padrão: força resposta apenas em JSON (relays/modelos sem structured output). */
export const JSON_SUFFIX =
  '\n\nRESPOSTA: devolva APENAS um objeto JSON válido, sem texto antes ou depois, sem cercas markdown (```).';

/** Extrai o primeiro objeto JSON válido do texto (lida com cercas ``` e texto ao redor). */
export function extractJsonObject(text: string): any {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    const err = new Error('A IA não devolveu JSON. Início da resposta: ' + text.slice(0, 400));
    (err as any).status = 502;
    throw err;
  }
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch (e) {
    const err = new Error('JSON inválido: ' + (e as any).message);
    (err as any).status = 502;
    throw err;
  }
  return parsed;
}
