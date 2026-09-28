import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
// Alias p/ não colidir com a interface global SpeechRecognition (Web Speech API)
import { SpeechRecognition as NativeSpeechRecognition } from '@capacitor-community/speech-recognition';
import { useNotify } from 'react-admin';
import { appendTranscript } from './append-transcript';

/** Construtor do Web Speech API no navegador (Chrome: webkitSpeechRecognition).
 *  Firefox/Safari não têm → botão de ditado NÃO renderiza (isVoiceAvailable=false). */
const WEB_SR = typeof window !== 'undefined'
  ? (window.SpeechRecognition ?? window.webkitSpeechRecognition)
  : undefined;

/**
 * Ditado por voz pt-BR pro input do chat.
 *
 * - APK: plugin nativo `@capacitor-community/speech-recognition` (partialResults
 *   com popup:false — no Android partial NÃO funciona com popup ligado).
 * - Navegador: Web Speech API (interim results).
 *
 * A transcrição NUNCA é enviada automática: parcial/final só preenchem o input
 * (via `setText`) — o usuário revisa (ASR erra termo médico) e envia. Se já
 * havia texto, anexa com espaço (ver `appendTranscript`).
 *
 * @param setText setter do estado do input do Chat (recebe o valor COMPLETO).
 */
export function useVoiceInput(setText: (value: string) => void) {
  const notify = useNotify();
  const [isRecording, setIsRecording] = useState(false);
  const [isVoiceAvailable, setIsVoiceAvailable] = useState<boolean>(
    () => Capacitor.isNativePlatform() || !!WEB_SR,
  );
  // Snapshot do input no início do ditado (texto já "commitado") e último valor
  // exibido (base + parcial). Parciais sempre recalculam a partir do base —
  // nunca acumulam um sobre o outro.
  const baseRef = useRef('');
  const displayRef = useRef('');
  const webRecRef = useRef<SpeechRecognition | null>(null);

  // Nativo: disponibilidade é assíncrona — checa 1x no mount (emulgador sem
  // serviço de reconhecimento / aparelho sem suporte → botão some).
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let alive = true;
    NativeSpeechRecognition.available()
      .then(({ available }) => { if (alive) setIsVoiceAvailable(available); })
      .catch(() => { if (alive) setIsVoiceAvailable(false); });
    return () => { alive = false; };
  }, []);

  // Unmount (troca de tela) durante gravação: solta o microfone e limpa listeners.
  useEffect(() => () => {
    if (Capacitor.isNativePlatform()) {
      NativeSpeechRecognition.stop().catch(() => {});
      NativeSpeechRecognition.removeAllListeners().catch(() => {});
    }
    webRecRef.current?.abort();
    webRecRef.current = null;
  }, []);

  const startNative = async () => {
    // Permissão: RECORD_AUDIO no Android. Se negou uma vez, o SO não reprompta —
    // avisa e aponta pras configurações.
    const perm = await NativeSpeechRecognition.checkPermissions();
    if (perm.speechRecognition !== 'granted') {
      const req = await NativeSpeechRecognition.requestPermissions().catch(() => null);
      if (!req || req.speechRecognition !== 'granted') {
        notify('Permissão de microfone negada. Ative nas configurações do aparelho para ditar.', { type: 'warning' });
        return;
      }
    }
    await NativeSpeechRecognition.addListener('partialResults', (data) => {
      const partial = (data.matches ?? [])[0] ?? '';
      const display = appendTranscript(baseRef.current, partial, '');
      displayRef.current = display;
      setText(display);
    });
    await NativeSpeechRecognition.start({ language: 'pt-BR', partialResults: true, popup: false, maxResults: 1 });
    setIsRecording(true);
  };

  const startWeb = () => {
    if (!WEB_SR) return;
    const rec = new WEB_SR();
    rec.lang = 'pt-BR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: WebSpeechRecognitionEvent) => {
      let finals = '';
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) finals += transcript;
        else interim += transcript;
      }
      // Final "commita" no base; interim só aparece na tela (pode ser revisto).
      if (finals) baseRef.current = appendTranscript(baseRef.current, '', finals);
      const display = appendTranscript(baseRef.current, interim, '');
      displayRef.current = display;
      setText(display);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        notify('Permissão de microfone negada pelo navegador.', { type: 'warning' });
      } else {
        notify('Não consegui ouvir agora. Tente de novo.', { type: 'warning' });
      }
      setIsRecording(false);
    };
    // Silêncio encerra a escuta sozinho — o texto ditado FICA no input.
    rec.onend = () => setIsRecording(false);
    try {
      rec.start();
    } catch {
      notify('Não foi possível iniciar o ditado agora.', { type: 'warning' });
      return;
    }
    webRecRef.current = rec;
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (Capacitor.isNativePlatform()) {
      NativeSpeechRecognition.stop().catch(() => {});
      NativeSpeechRecognition.removeAllListeners().catch(() => {});
    } else {
      webRecRef.current?.stop();
      webRecRef.current = null;
    }
    // Congela o que está na tela: o parcial vira texto normal do input. Commita
    // no base p/ um próximo ditado anexar DEPOIS dele.
    baseRef.current = displayRef.current;
    setIsRecording(false);
  };

  /** Para a gravação se ativa (no-op caso contrário). P/ chamar antes de enviar. */
  const stop = () => { if (isRecording) stopRecording(); };

  /** Liga/desliga o ditado. `currentText` = valor ATUAL do input (p/ snapshot do base). */
  const toggle = (currentText: string) => {
    if (isRecording) { stopRecording(); return; }
    baseRef.current = currentText;
    displayRef.current = currentText;
    if (Capacitor.isNativePlatform()) {
      startNative().catch(() => {
        NativeSpeechRecognition.removeAllListeners().catch(() => {});
        setIsRecording(false);
        notify('Ditado por voz indisponível neste aparelho agora.', { type: 'warning' });
      });
    } else {
      startWeb();
    }
  };

  return { isVoiceAvailable, isRecording, toggle, stop };
}
