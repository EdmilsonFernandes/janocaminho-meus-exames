/**
 * "Onde eu estou?" no menu lateral (27/11/26).
 *
 * Duas reclamações do dono, em momentos diferentes, que pareciam opostas:
 *  - 04/11: "o menu abre com a opção no MEIO da tela — confuso" (guardava a rolagem da última
 *    visita, que não tinha relação com a tela aberta);
 *  - 27/11: "escolhi Perfil, que fica no fim; abro o menu e ele está no topo — tenho que descer
 *    para lembrar onde eu estava".
 *
 * A regra que atende as duas: o menu abre sempre ANCORADO NA TELA ATUAL. Se o item atual cabe na
 * primeira tela do menu, abre no topo (previsível); se fica abaixo da dobra, abre com ele no meio.
 */

import { createContext } from 'react';

/** Posição de rolagem do menu para o item da tela atual ficar à vista. Medidas em px. */
export function menuScrollFor(p: { itemTop: number; itemHeight: number; viewHeight: number; contentHeight: number }): number {
  const { itemTop, itemHeight, viewHeight, contentHeight } = p;
  if (!(viewHeight > 0) || !(itemHeight > 0)) return 0;
  // Cabe na primeira tela (com folga de 12 px embaixo): fica no topo.
  if (itemTop + itemHeight <= viewHeight - 12) return 0;
  const centered = itemTop - (viewHeight - itemHeight) / 2;
  const max = Math.max(0, contentHeight - viewHeight);
  return Math.round(Math.min(Math.max(centered, 0), max));
}

/** Escolha manual de abrir/fechar um grupo: vale só enquanto a situação em que foi feita durar. */
export type GroupChoice = { epoch: number; current: boolean; open: boolean } | null;

/**
 * Um grupo do menu está aberto?
 * Regra: o grupo da tela atual abre sozinho e os outros fecham. O toque da pessoa no cabeçalho
 * manda — até o menu ser aberto de novo (`epoch` muda) ou o grupo deixar de ser/passar a ser o
 * da tela atual. Assim cada abertura do menu mostra UM caminho: o de onde a pessoa está.
 */
export function groupOpen(choice: GroupChoice, epoch: number, hasCurrent: boolean): boolean {
  if (choice && choice.epoch === epoch && choice.current === hasCurrent) return choice.open;
  return hasCurrent;
}

/** `epoch` sobe a cada abertura do menu no celular; `syncing` = primeiros instantes da abertura,
 *  em que os grupos se ajustam SEM animação (o menu já aparece arrumado). */
export const MenuSyncContext = createContext<{ epoch: number; syncing: boolean }>({ epoch: 0, syncing: false });
