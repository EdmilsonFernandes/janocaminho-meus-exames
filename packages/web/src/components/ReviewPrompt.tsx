/**
 * Review nativo (skill in-app-review, revisão 28/09) — `requestReview()` DIRETO no
 * momento positivo, SEM UI própria: o dialog do sistema já faz a pergunta; um dialog
 * custom antes significa que, com a cota do SO esgotada, o usuário clica "Avaliar" e
 * NADA acontece (clique sem resposta). O SO controla a cota (~3x/ano por usuário) e
 * pode não exibir nada — silencioso por design.
 *
 * - Cooldown local de 90d entre TENTATIVAS (chamar demais pode throttlear o prompt do
 *   app inteiro). A key antiga `me_review_asked` (1x na vida) é aposentada.
 * - Quem quer ESCREVER um review usa "Avaliar o app" nas Configurações (Perfil) —
 *   deep link direto pra listagem da Play Store (ver Profile.tsx).
 * - Web: no-op (só nativo).
 */
import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

const LAST_KEY = 'me_review_last_prompted';
const COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;

export const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.janocaminho.drexame';

/** Chama o review nativo se couber (nativo + fora do cooldown). Best-effort, silencioso. */
export async function maybeRequestReview(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  let last = 0;
  try { last = Number(localStorage.getItem(LAST_KEY) ?? 0) || 0; } catch { /* localStorage indisponível */ }
  if (Date.now() - last < COOLDOWN_MS) return;
  try {
    const { InAppReview } = await import('@capacitor-community/in-app-review');
    await InAppReview.requestReview();
  } catch { /* cota/erro do SO — próxima janela em 90d */ }
  try { localStorage.setItem(LAST_KEY, String(Date.now())); } catch { /* ignora */ }
}

/** Gatilho declarativo (mantém o ponto de uso no dashboard intacto): dispara 3s após
 *  o momento positivo — sem interromper a animação/leitura do score na tela. */
export const ReviewPrompt = ({ trigger }: { trigger: boolean }) => {
  useEffect(() => {
    if (!trigger) return;
    const t = setTimeout(() => { void maybeRequestReview(); }, 3000);
    return () => clearTimeout(t);
  }, [trigger]);
  return null;
};
