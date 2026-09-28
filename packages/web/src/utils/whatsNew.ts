/**
 * Novidades da versão (G5) — conteúdo + gatilho PUROS (testáveis sem DOM).
 *
 * O dialog "✨ Novidades do Dr. Exame" mostra 1× por versionCode (build.gradle =
 * fonte única de verdade da versão). Antes a chave era `whatsnew_<major.minor>`:
 * o conteúdo V2/biometria/portal/cartão ficava congelado a linha inteira — quem
 * já tinha dismissado nunca via as novidades seguintes. Agora cada release que
 * TEM conteúdo mostra o seu 1× (chave `whatsnew_vc_<code>`); releases sem entrada
 * no mapa não abrem nada (mesma calma de antes para rebuilds sem novidade).
 *
 * Sem acúmulo de versões não-vistas: mecanismo original mostra 1× e marca visto —
 * mantido (spec G5: "se não faz, mostre só a atual").
 */

export interface ReleaseNote {
  emoji: string;
  title: string;
  desc: string;
  /** Deep-link in-app (rota do HashRouter), ex.: '/chat'. */
  to: string;
}

/** Leva 1 (2.7.194) — features A/B/C patient-facing. */
const LEVA_1: ReleaseNote[] = [
  { emoji: '🧠', title: 'Saúde mental no app', desc: 'PHQ-9 e GAD-7, questionários validados, 2 minutos. Grátis.', to: '/saude-mental' },
  { emoji: '📏', title: 'Curva de crescimento do seu filho', desc: 'Percentis da OMS na Evolução, direto do pediatra.', to: '/evolucao' },
  { emoji: '📚', title: 'Respostas com fonte', desc: 'A IA agora cita as sociedades médicas (SBC, SBD…).', to: '/chat' },
];

/** Novidades por versionCode — manter curtas (máx ~5 itens, lista com scroll).
 *  443 já saiu sem este lote — as notas dele sobem p/ o 444 (AAB do lote G). */
export const RELEASE_NOTES: Record<number, ReleaseNote[]> = {
  442: LEVA_1,
  444: [
    ...LEVA_1,
    { emoji: '⚕️', title: 'Efeitos mais relatados do seu remédio', desc: 'Dados mundiais da FDA, em português.', to: '/medicamentos' },
    { emoji: '🎤', title: 'Fale com o Dr. Exame', desc: 'Ditado por voz em português no chat.', to: '/chat' },
  ],
};

/** Notas da versão atual (vazio = não abre o dialog). */
export function notesForVersion(code: number): ReleaseNote[] {
  return RELEASE_NOTES[code] ?? [];
}

/** Chave de dismiss por versionCode (não mais por major.minor — ver cabeçalho). */
export const whatsNewKey = (code: number): string => `whatsnew_vc_${code}`;

/** Storage mínimo p/ teste (localStorage real ou um Map fake). */
export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** Deve abrir o dialog? Precisa ter conteúdo, estar onboarded, não ter visto
 *  ESTA versão e vencer o slot de cold-dialog (máx 1 modal de 1º load/sessão).
 *  Storage bloqueado (modo privado) não trava a feature — segue pro claim. */
export function shouldShowWhatsNew(code: number, storage: StorageLike, claim: () => boolean): boolean {
  if (notesForVersion(code).length === 0) return false;
  try {
    if (!storage.getItem('onboarded')) return false;
    if (storage.getItem(whatsNewKey(code))) return false;
  } catch { /* storage indisponível: deixa o claim decidir */ }
  return claim();
}

/** Marca a versão como vista (dismiss ou "Ver agora"). */
export function markWhatsNewSeen(code: number, storage: StorageLike): void {
  try { storage.setItem(whatsNewKey(code), '1'); } catch { /* ignora */ }
}
