/**
 * Rótulo de recência do último ponto de um gráfico: "Último resultado: há 3 meses (12/08/2026)".
 *
 * É a saída para gráfico de eixo categórico (um ponto por exame) ou quando estender o eixo
 * até hoje esmagaria os dados — ali uma linha "hoje" mentiria sobre a distância no tempo.
 * Quando o dado é antigo, diz em PALAVRAS que pode estar desatualizado (nunca só por cor).
 *
 * Sem estilo próprio de cor/tamanho: herda do texto em volta (Typography do MUI ou
 * classes Tailwind), para servir às telas antigas e às novas. A lógica está em ./recency.
 */
import { describeRecency, DEFAULT_STALE_NOTE, type RecencyOptions } from './recency';

export function LastDataLabel({
  date,
  noun = 'Último resultado',
  staleNote = DEFAULT_STALE_NOTE,
  ...options
}: Omit<RecencyOptions, 'noun' | 'staleNote'> & {
  date: string | number | Date | null | undefined;
  noun?: string;
  staleNote?: string;
}) {
  const recency = describeRecency(date, { ...options, noun, staleNote });
  if (!recency) return null;
  return (
    <span data-stale={recency.stale ? 'true' : undefined} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {noun}:{' '}
      {recency.relative ? (
        <>
          <strong style={{ fontWeight: 700 }}>{recency.relative}</strong> ({recency.absolute})
        </>
      ) : (
        <strong style={{ fontWeight: 700 }}>{recency.absolute}</strong>
      )}
      {recency.stale ? (
        <>
          {' · '}
          <strong style={{ fontWeight: 700 }}>{staleNote}</strong>
        </>
      ) : null}
    </span>
  );
}
