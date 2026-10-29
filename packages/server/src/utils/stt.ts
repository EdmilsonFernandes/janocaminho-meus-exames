// STT (speech-to-text) das teleconsultas — F3 premium (20/10/26).
// Áudio é EFÊMERO (D1 LGPD): vive em disco só até virar transcript cifrado; NUNCA vai pro
// banco. Contrato: docs/research/2026-10-20-f3-arquitetura.md §2.
//
// STT_PROVIDER fica RESERVADO p/ um futuro 'whisper-local' (self-hosted, zero egress de
// áudio) — por ora só 'groq' existe; qualquer outro valor desliga o STT (degradação da
// casa: upload responde 202 pending e o job transcriptionQueue finaliza quando houver
// provider válido na env).
import { config } from '../config';

const GROQ_STT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_STT_MODEL = 'whisper-large-v3-turbo';

/** Limite por requisição do free tier Groq (25MB). Client grava em 24kbps (≈15,5MB/90min —
 *  D2); o server aceita 80MB de teto e falha AQUI com código tipado — sem ffmpeg p/ split. */
export const STT_MAX_BYTES = 25 * 1024 * 1024;

export type SttErrorCode =
  | 'STT_DISABLED'      // sem provider/chave na env (rota vira 202 pending)
  | 'STT_TOO_LARGE'     // áudio > 25MB → abort terminal (arquivo fora, paciente avisado)
  | 'STT_TIMEOUT'       // 120s estourados ou falha de rede (transiente → job retria)
  | 'STT_HTTP_ERROR'    // provedor respondeu erro HTTP
  | 'STT_BAD_RESPONSE'; // 200 sem texto parseável

export class SttError extends Error {
  constructor(readonly code: SttErrorCode, message: string, readonly status?: number) {
    super(message);
    this.name = 'SttError';
  }
}

/** STT disponível? (env degradada → false: rota responde 202 pending, job retria depois). */
export function hasStt(): boolean {
  return config.sttProvider === 'groq' && config.groqApiKey.trim().length > 0;
}

/** Erro transiente = vale o retry 1x (rede/timeout/429/5xx/resposta ruim). 4xx do Groq
 *  (auth/parâmetro) é definitivo — não insiste. */
function isTransient(e: unknown): boolean {
  if (!(e instanceof SttError)) return true; // AbortError/rede
  if (e.code === 'STT_TIMEOUT' || e.code === 'STT_BAD_RESPONSE') return true;
  return e.code === 'STT_HTTP_ERROR' && (e.status === 429 || (e.status ?? 0) >= 500);
}

/** Transcreve áudio da chamada (webm/opus do MediaRecorder) → texto plano pt-BR.
 *  FormData com Blob (fetch nativo do Node 20), timeout 120s POR TENTATIVA + 1 retry em
 *  erro transiente. Erros SEMPRE tipados (SttError) — o chamador decide pending vs abort. */
export async function transcribeAudio(
  buf: Buffer,
  opts: { language?: string; mime?: string; filename?: string } = {},
): Promise<string> {
  if (!hasStt()) throw new SttError('STT_DISABLED', 'STT não configurado (GROQ_API_KEY/STT_PROVIDER ausentes).');
  if (buf.byteLength > STT_MAX_BYTES) {
    throw new SttError('STT_TOO_LARGE', `Áudio de ${(buf.byteLength / 1048576).toFixed(1)}MB excede o limite de 25MB do provedor.`);
  }
  const mime = opts.mime ?? 'audio/webm';
  const filename = opts.filename ?? 'teleconsulta.webm';

  let lastErr: SttError | undefined;
  for (let attempt = 1; attempt <= 2; attempt++) { // 1 tentativa + 1 retry
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    try {
      const fd = new FormData();
      fd.append('file', new Blob([buf], { type: mime }), filename);
      fd.append('model', GROQ_STT_MODEL);
      // Anti-alucinação (bug 29/10, teste real): Whisper INVENTA frases em ruído/
      // silêncio. verbose_json traz os sinais por segmento (no_speech_prob/
      // avg_logprob/compression_ratio — heurística do cookbook OpenAI) e
      // temperature 0 corta o sampling criativo. Segmento suspeito é descartado.
      fd.append('response_format', 'verbose_json');
      fd.append('temperature', '0');
      fd.append('language', opts.language ?? 'pt');

      const res = await fetch(GROQ_STT_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.groqApiKey}` },
        body: fd,
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new SttError('STT_HTTP_ERROR', `Groq ${res.status}: ${body.slice(0, 200)}`, res.status);
      }
      const data: any = await res.json();
      if (Array.isArray(data?.segments)) {
        const kept = data.segments.filter((s: any) =>
          typeof s?.text === 'string' && s.text.trim() &&
          !(Number(s.no_speech_prob ?? 0) > 0.6) &&          // "provavelmente não é fala"
          !(Number(s.avg_logprob ?? 0) < -0.8) &&            // confiança baixa demais
          !(Number(s.compression_ratio ?? 1) > 2.4));        // texto repetitivo = loop alucinado
        // Nada sobrou = só ruído → '' (o chamador trata como STT_EMPTY, honesto).
        return kept.map((s: any) => String(s.text).trim()).join(' ').trim();
      }
      if (typeof data?.text !== 'string' || !data.text) {
        throw new SttError('STT_BAD_RESPONSE', 'Provedor devolveu resposta sem texto.');
      }
      return data.text;
    } catch (e) {
      const err = e instanceof SttError
        ? e
        : new SttError('STT_TIMEOUT', `STT falhou (rede/timeout): ${e instanceof Error ? e.message : String(e)}`);
      if (!isTransient(err) || attempt === 2) throw err;
      lastErr = err;
      console.warn(`[stt] tentativa ${attempt} falhou (${err.code}) — retentando 1x`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr ?? new SttError('STT_HTTP_ERROR', 'STT falhou.');
}
