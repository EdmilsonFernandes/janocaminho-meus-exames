import type { ReactNode } from 'react';
import { Typography } from '@mui/material';
import { useTranslate } from 'react-admin';
import { ageText, type Age } from '../../utils/panoramaPresenter';

/**
 * DataAge — a idade de um dado de saúde, sempre traduzida e sempre dentro de um <time>
 * (leitores de tela e buscadores recebem a data absoluta no atributo).
 *
 * Regra do design system: nenhum dado de saúde aparece sem dizer de quando é. A idade é calculada
 * pelo apresentador (`dateAge`/`timeAge` de utils/panoramaPresenter) e chega aqui pronta, para o
 * mesmo número não envelhecer de forma diferente em dois lugares da tela.
 * Sem data válida (ou data futura) não renderiza nada — quem chama decide se mostra outro texto.
 */
export const DataAge = ({ age, iso, prefix, suffix, component = 'span', sx }: {
  age: Age | null | undefined;
  /** ISO da data, para o atributo `datetime`. */
  iso?: string | null;
  prefix?: ReactNode;
  suffix?: ReactNode;
  component?: 'span' | 'p' | 'div' | 'time';
  sx?: object;
}) => {
  const translate = useTranslate();
  const text = ageText(age, translate);
  if (!text) return null;
  return (
    // Herda tipografia de quem está em volta: sem isto a idade saía no tamanho padrão do corpo e
    // ficava MAIOR que a data ao lado ("exame de 21 nov · HÁ 6 DIAS").
    <Typography component={component} sx={{ font: 'inherit', color: 'inherit', fontVariantNumeric: 'tabular-nums', ...sx }}>
      {prefix}
      <time dateTime={iso ?? undefined}>{text}</time>
      {suffix}
    </Typography>
  );
};
