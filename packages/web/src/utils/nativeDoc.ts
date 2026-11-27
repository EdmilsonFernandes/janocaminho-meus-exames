import { Capacitor } from '@capacitor/core';
import { DEFAULT_SPEECH_RATE, engineSpeechRate, normalizeSpeechRate, prepareSpeech } from './speechText';

/**
 * Imprimir / salvar documento.
 * - **APK (nativo):** o WebView não tem diálogo de impressão → grava o HTML num arquivo
 *   temporário (Filesystem) e abre a **folha de compartilhamento** (Share). O usuário abre
 *   no navegador/PDF e imprime ou salva. Padrão natural de "exportar" no celular.
 * - **Web/PWA:** popup + window.print() (comportamento de sempre).
 */
export async function printDocument(title: string, html: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const slug = (title || 'documento').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const file = `${slug || 'documento'}-${Date.now()}.html`;
      const r = await Filesystem.writeFile({ path: file, data: html, directory: Directory.Cache, encoding: Encoding.UTF8 });
      await Share.share({ title, dialogTitle: title, files: [r.uri] }).catch(() => {});
      await Filesystem.deleteFile({ path: file, directory: Directory.Cache }).catch(() => {});
    } catch (e) {
      console.warn('[printDocument] falha no share nativo:', e);
    }
  } else {
    const w = window.open('', '_blank', 'width=820,height=940');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }
}

/**
 * Imprimir a página atual (para os botões que usavam window.print() direto).
 * No APK compartilha o conteúdo principal (main) como HTML.
 */
export async function printPage(title = 'Documento'): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const inner = document.querySelector('main')?.innerHTML || document.body.innerHTML;
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:'Segoe UI',Arial,sans-serif;padding:20px;line-height:1.55;color:#15233b}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #ddd;padding:6px 8px;text-align:left}h1,h2,h3{color:#0f172a}</style></head><body>${inner}</body></html>`;
    return printDocument(title, html);
  }
  window.print();
}


// Cada chamada de fala recebe um número; parar (ou começar outra) invalida a anterior, e o laço
// de trechos percebe e sai. Sem isso, "parar" só interrompia o trecho atual e o próximo começava.
let speechRun = 0;
const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

/** Escolhe a voz pt-BR do navegador, preferindo feminina quando o sistema informa o nome. */
function pickWebVoice(synth: SpeechSynthesis, lang: string): SpeechSynthesisVoice | undefined {
  const voices = synth.getVoices().filter((v) => v.lang?.toLowerCase().startsWith(lang.split('-')[0].toLowerCase()));
  const exact = voices.filter((v) => v.lang?.toLowerCase() === lang.toLowerCase());
  const pool = exact.length ? exact : voices;
  return pool.find((v) => /francisca|maria|luciana|let[ií]cia|fernanda|female|feminin/i.test(v.name)) ?? pool[0];
}

// ───────── Velocidade da fala: uma preferência só, guardada no aparelho, para todos os áudios ─────────
const RATE_KEY = 'drx.speechRate';
const readStoredRate = (): number => {
  try { return normalizeSpeechRate(localStorage.getItem(RATE_KEY) ?? DEFAULT_SPEECH_RATE); } catch { return DEFAULT_SPEECH_RATE; }
};
let liveRate: number | null = null; // carregada na primeira leitura
/** Muda a cada troca de velocidade: o laço de trechos compara antes/depois de falar um trecho. */
let rateEpoch = 0;
/** Há uma fala em andamento (para saber se a troca de velocidade precisa interromper o trecho). */
let speakingNow = false;
type TtsPlugin = typeof import('@capacitor-community/text-to-speech')['TextToSpeech'];
let ttsPlugin: TtsPlugin | null = null;
let ttsLoading: Promise<void> | null = null;
/**
 * Carrega o plugin nativo UMA vez. Devolve `Promise<void>` de propósito: o plugin do Capacitor é um Proxy que
 * responde a QUALQUER propriedade — inclusive `then`. Se o objeto for devolvido por uma função `async` (ou
 * passado a `Promise.resolve`), o JavaScript o trata como "thenable", chama `TextToSpeech.then()` e o Capacitor
 * responde `"TextToSpeech.then()" is not implemented on android`. Foi o que quebrou o áudio do app em 26/11/26
 * (AAB 635/636): toda leitura falhava antes de começar. O proxy só sai daqui por `getTts()`.
 */
const loadTts = (): Promise<void> => {
  if (!ttsLoading) {
    ttsLoading = import('@capacitor-community/text-to-speech').then((m) => { ttsPlugin = m.TextToSpeech; });
  }
  return ttsLoading;
};
const getTts = (): TtsPlugin => {
  if (!ttsPlugin) throw new Error('plugin de voz ainda não carregado');
  return ttsPlugin;
};

/** A velocidade escolhida pela pessoa (1 = normal). */
export function getSpeechRate(): number {
  if (liveRate == null) liveRate = readStoredRate();
  return liveRate;
}

/**
 * Troca a velocidade — vale para todos os áudios e fica guardada.
 * Com uma fala em andamento, ela NÃO recomeça: só a frase atual é dita de novo, já na
 * velocidade nova, e o resto segue de onde estava.
 */
export function setSpeechRate(rate: number): void {
  const next = normalizeSpeechRate(rate);
  if (next === getSpeechRate()) return;
  liveRate = next;
  try { localStorage.setItem(RATE_KEY, String(next)); } catch { /* sem armazenamento: vale só nesta sessão */ }
  rateEpoch += 1;
  if (!speakingNow) return;
  // Interrompe só o trecho atual (o laço continua vivo e o repete na velocidade nova).
  try {
    if (Capacitor.isNativePlatform()) void ttsPlugin?.stop().catch(() => {});
    else window.speechSynthesis?.cancel();
  } catch { /* ignore */ }
}

/**
 * Fala um texto. No APK usa TTS nativo (voz pt-BR do Android); no web usa speechSynthesis.
 * O texto é dito em TRECHOS (frase a frase), com pausa entre eles e unidades por extenso
 * (utils/speechText). A velocidade é a escolhida pela pessoa (`getSpeechRate`), lida a cada
 * trecho — por isso trocar a velocidade no meio não volta ao começo. O "1x" real é um pouco
 * mais lento que o padrão do motor de voz, que soava corrido.
 */
export async function speakText(
  text: string,
  opts: { lang?: string; onDone?: () => void; onFail?: () => void } = {},
): Promise<void> {
  if (!text) return;
  const lang = opts.lang ?? 'pt-BR';
  const chunks = prepareSpeech(text);
  if (!chunks.length) { opts.onDone?.(); return; }
  const run = ++speechRun;
  const alive = () => run === speechRun;
  speakingNow = true;
  const finish = (how: 'done' | 'fail') => {
    if (!alive()) return;
    speakingNow = false;
    if (how === 'done') opts.onDone?.(); else opts.onFail?.();
  };

  let speakOne: (chunkText: string, rate: number) => Promise<void>;
  if (Capacitor.isNativePlatform()) {
    try { await loadTts(); } catch (e) { console.warn('[tts] plugin indisponível:', e); finish('fail'); return; }
    const tts = getTts();
    // resolve quando termina de falar o trecho (ou quando é interrompido por stop)
    speakOne = (chunkText, rate) => tts.speak({ text: chunkText, lang, rate, pitch: 1.0, volume: 1.0 });
  } else {
    const synth = window.speechSynthesis;
    if (!synth) { finish('fail'); return; }
    synth.cancel();
    const voice = pickWebVoice(synth, lang);
    speakOne = (chunkText, rate) => new Promise<void>((resolve, reject) => {
      const u = new SpeechSynthesisUtterance(chunkText);
      u.lang = lang;
      u.rate = rate;
      if (voice) u.voice = voice;
      u.onend = () => resolve();
      u.onerror = (ev) => (ev.error === 'canceled' || ev.error === 'interrupted' ? resolve() : reject(new Error(ev.error)));
      synth.speak(u);
    });
  }

  for (let i = 0; i < chunks.length;) {
    if (!alive()) return; // parado ou substituído por outra fala
    const epoch = rateEpoch;
    try {
      await speakOne(chunks[i].text, engineSpeechRate(getSpeechRate()));
    } catch (e) {
      if (!alive()) return;
      // interrompido pela troca de velocidade: não é falha, o trecho é dito de novo
      if (epoch === rateEpoch) { console.warn('[tts] speak falhou:', e); finish('fail'); return; }
    }
    if (!alive()) return;
    if (epoch !== rateEpoch) continue; // a velocidade mudou durante este trecho: repete só ele
    if (chunks[i].pauseMs) await sleep(chunks[i].pauseMs);
    i += 1;
  }
  finish('done');
}

/** Para a fala (qualquer plataforma). */
export async function stopSpeakText(): Promise<void> {
  speechRun += 1; // invalida o laço de trechos em andamento
  speakingNow = false;
  try {
    if (Capacitor.isNativePlatform()) {
      try { await loadTts(); await getTts().stop(); } catch { /* ignore */ }
    } else {
      window.speechSynthesis?.cancel();
    }
  } catch {
    /* ignore */
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onloadend = () => { const s = String(fr.result || ''); resolve(s.includes(',') ? s.split(',')[1] : s); };
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

/** Abre um arquivo blob (ex.: PDF do exame).
 *  - APK (nativo): grava em cache + Share (usuário abre no visualizador de PDF).
 *  - Web: object URL + window.open. */
export async function openBlobFile(blob: Blob, filename: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const b64 = await blobToBase64(blob);
      const r = await Filesystem.writeFile({ path: filename, data: b64, directory: Directory.Cache, recursive: true });
      await Share.share({ title: filename, dialogTitle: 'Abrir documento', files: [r.uri] }).catch(() => {});
      setTimeout(() => { Filesystem.deleteFile({ path: filename, directory: Directory.Cache }).catch(() => {}); }, 60000);
    } catch (e) { console.warn('[openBlobFile] falhou:', e); }
  } else {
    const url = URL.createObjectURL(blob);
    window.open(url);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
