import { Capacitor } from '@capacitor/core';

/**
 * Tokens de movimento do app (fonte ÚNICA — padrão de app nativo premium).
 * Duração bifurcada por plataforma: Android espera resposta rápida; iOS brilha com
 * transições mais longas. Curva de assinatura com desaceleração forte no fim
 * ("assenta" o elemento) — mesma família das curvas nativas de sheet/menu.
 * Usar em TODA transição nova (sx transition, keyframes, framer-motion) em vez de
 * números mágicos espalhados.
 */
export const DUR = Capacitor.getPlatform() === 'android' ? 150 : 300;
export const EASE = 'cubic-bezier(.38,.47,0,1)';
