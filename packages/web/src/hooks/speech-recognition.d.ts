/**
 * Tipos do Web Speech API (ditado por voz no navegador).
 *
 * AUTOSUFICIENTES: não dependem das interfaces de Web Speech do lib.dom — a
 * presença delas varia entre versões do TypeScript (e `skipLibCheck` esconderia
 * a quebra dentro de .d.ts) — nem de @types externos. Nomes prefixados
 * (WebSpeech*) evitam merge acidental com o lib.
 *
 * A API nativa do APK vem de `@capacitor-community/speech-recognition` (tipada).
 */

interface WebSpeechAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface WebSpeechResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: WebSpeechAlternative;
}

interface WebSpeechResultList {
  readonly length: number;
  readonly [index: number]: WebSpeechResult;
}

interface WebSpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: WebSpeechResultList;
}

interface WebSpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: ((ev: Event) => void) | null;
  onend: ((ev: Event) => void) | null;
  onerror: ((ev: WebSpeechRecognitionErrorEvent) => void) | null;
  onresult: ((ev: WebSpeechRecognitionEvent) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare var SpeechRecognition: {
  prototype: SpeechRecognition;
  new (): SpeechRecognition;
};

interface Window {
  SpeechRecognition?: typeof SpeechRecognition;
  webkitSpeechRecognition?: typeof SpeechRecognition;
}
