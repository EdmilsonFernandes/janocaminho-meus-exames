import { Capacitor } from '@capacitor/core';

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


/** Fala um texto. No APK usa TTS nativo (voz pt-BR do Android); no web usa speechSynthesis. */
export async function speakText(
  text: string,
  opts: { rate?: number; lang?: string; onDone?: () => void; onFail?: () => void } = {},
): Promise<void> {
  if (!text) return;
  const lang = opts.lang ?? 'pt-BR';
  const rate = opts.rate ?? 1.0;
  if (Capacitor.isNativePlatform()) {
    try {
      const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
      // resolve qdo termina de falar (ou é cancelado por stop)
      await TextToSpeech.speak({ text, lang, rate, pitch: 1.0, volume: 1.0 });
      opts.onDone?.();
    } catch (e) {
      console.warn('[tts] speak falhou:', e);
      opts.onFail?.();
    }
  } else {
    const synth = window.speechSynthesis;
    if (!synth) { opts.onFail?.(); return; }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = rate;
    const v = synth.getVoices().find((vv) => vv.lang?.toLowerCase().startsWith(lang.split('-')[0]));
    if (v) u.voice = v;
    u.onend = () => opts.onDone?.();
    u.onerror = () => opts.onFail?.();
    synth.speak(u);
  }
}

/** Para a fala (qualquer plataforma). */
export async function stopSpeakText(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
      await TextToSpeech.stop();
    } catch { /* */ }
  } else {
    window.speechSynthesis?.cancel();
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
