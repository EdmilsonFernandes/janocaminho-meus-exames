import { describeRecency } from '@/components/charts/recency';

/**
 * Idade do último exame na Home — lógica pura (sem React), testada em homeRecency.test.ts.
 *
 * Risco que isto fecha (IEC 62366, "dado velho parecendo atual"): a Home abria com "Vamos ver
 * como você está hoje" sobre um exame de 9 meses, com a idade do dado três telas abaixo. Agora o
 * herói diz a idade ao lado da data e avisa quando os exames saíram da janela de "em dia".
 *
 * Duas réguas já existentes no app, nenhuma nova:
 *  - o texto relativo vem de `describeRecency` (mesma redação de "há N meses" dos gráficos);
 *  - "em dia" é a janela de 180 dias do anel "Exames em dia" da própria Home. Não é a régua de
 *    "pode estar desatualizado" (12 meses, `LAB_STALE_AFTER_DAYS`), que continua intacta.
 */
export const EXAMS_IN_DAY_WINDOW_DAYS = 180;

export interface HomeExamRecency {
  /** "hoje", "ontem", "há 12 dias", "há 8 meses"; null para data futura ou inválida. */
  relative: string | null;
  /** Dias de calendário desde o exame; null para data futura ou inválida. */
  days: number | null;
  /** O último exame saiu da janela de "exames em dia"? */
  due: boolean;
}

/** Frase do aviso do herói quando os exames não estão em dia. */
export const examDueNote = (relative: string, lastUploadFailed = false): string =>
  lastUploadFailed
    // O envio mais recente falhou: pedir "um exame recente" seria pedir o que a pessoa acabou de mandar.
    ? `Seus valores são de um exame de ${relative} e o seu último envio não pôde ser lido — reenvie para atualizar.`
    : `Seu último exame foi ${relative} — esta leitura mostra aquele momento, não hoje.`;

export function homeExamRecency(lastExamAt: string | number | Date | null | undefined, now: number = Date.now()): HomeExamRecency {
  const r = describeRecency(lastExamAt, { now });
  if (!r || r.relative == null) return { relative: null, days: null, due: false };
  return { relative: r.relative, days: r.days, due: r.days > EXAMS_IN_DAY_WINDOW_DAYS };
}
