/**
 * CountUp — número que conta ao entrar na tela / ao mudar de valor (padrão CountUp
 * do react-bits, portado sobre o hook caseiro do projeto).
 *
 * O hook anima do último valor exibido até o alvo (não volta a zero quando o valor
 * muda — drag de slider fica suave) e respeita prefers-reduced-motion (snap no final).
 * A formatação (pt-BR, decimais, sufixo) é de quem usa — este componente só anima.
 */
import { type CSSProperties } from 'react';
import { useCountUp } from '../../hooks/useCountUp';

interface CountUpProps {
  value: number | null;
  /** Formata o valor animado p/ exibição (ex.: n1, n0 do Radar — toLocaleString pt-BR). */
  format?: (v: number) => string;
  duration?: number;
  className?: string;
  style?: CSSProperties;
}

export function CountUp({ value, format = String, duration, className, style }: CountUpProps) {
  const animated = useCountUp(value, duration);
  return (
    <span className={className} style={style}>
      {animated == null ? '—' : format(animated)}
    </span>
  );
}
