import type { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { Heartbeat } from '@phosphor-icons/react';
import { AppCard } from '../AppCard';
import { SEM } from '../../theme';

/**
 * SINAIS DO CORPO (28/11/26) — base dos tiles "Idade do corpo" e "Risco cardíaco" do Início.
 *
 * Antes os dois eram um número solto ("32a", "Sem dados") num cartão branco: não diziam se o
 * número era bom. Referência de mercado: Whoop (ritmo de envelhecimento), InsideTracker
 * (InnerAge x idade real), Apple Saúde e Samsung Health (medidor em faixas com a palavra do
 * nível). Cada tile agora tem: rótulo + ícone tingido pelo estado, o valor grande, UM medidor
 * que mostra onde a pessoa está, e uma frase curta. O estado é sempre palavra + cor + posição,
 * nunca só cor (IEC 62366, risco "faixa só por cor").
 */
export type SignalTone = 'ok' | 'warn' | 'bad' | 'brand' | 'neutral';

const REDUCED = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const useToneColor = () => {
  const t = useTheme();
  const mode = t.palette.mode === 'dark' ? 'dark' : 'light';
  return (tone: SignalTone) => (tone === 'neutral' ? t.palette.text.secondary : tone === 'brand' ? SEM.tealDeep[mode] : SEM[tone][mode]);
};

export const SignalTile = ({ label, icon, tone, idx = 0, onClick, ariaLabel, children }: {
  label: string; icon: ReactNode; tone: SignalTone; idx?: number; onClick: () => void; ariaLabel: string; children: ReactNode;
}) => {
  const t = useTheme();
  const color = useToneColor()(tone);
  const isDark = t.palette.mode === 'dark';
  return (
    <AppCard kind="interactive" onClick={onClick} role="button" aria-label={ariaLabel} sx={{
      p: { xs: 1.75, sm: 2 }, height: '100%', minHeight: 168,
      display: 'flex', flexDirection: 'column', gap: 1.25, position: 'relative', overflow: 'hidden',
      transition: 'transform .25s cubic-bezier(.16,1,.3,1), border-color .2s ease',
      '@media (hover: hover) and (pointer: fine)': {
        '&:hover': { transform: 'translateY(-2px)', borderColor: alpha(t.palette.primary.main, 0.55) },
      },
      '&:active': { transform: 'scale(.98)' },
      animation: REDUCED ? 'none' : `dxTileSpring .45s cubic-bezier(.16,1,.3,1) ${idx * 0.08}s both`,
      '@keyframes dxTileSpring': {
        from: { opacity: 0, transform: 'translateY(14px) scale(.96)' },
        to: { opacity: 1, transform: 'translateY(0) scale(1)' },
      },
      // Luz do estado no canto: um brilho baixíssimo da cor do nível, não um fundo tingido.
      '&::before': {
        content: '""', position: 'absolute', top: -60, right: -60, width: 140, height: 140, borderRadius: '50%',
        background: `radial-gradient(circle, ${alpha(color, isDark ? 0.18 : 0.12)} 0%, transparent 70%)`,
        pointerEvents: 'none',
      },
    }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ position: 'relative' }}>
        <Typography sx={{ fontSize: 13, lineHeight: 1.25, color: 'text.secondary', fontWeight: 700 }}>{label}</Typography>
        <Box aria-hidden sx={{
          width: 36, height: 36, borderRadius: '12px', flexShrink: 0, display: 'grid', placeItems: 'center',
          color, bgcolor: alpha(color, isDark ? 0.18 : 0.1),
          boxShadow: `inset 0 0 0 1px ${alpha(color, 0.18)}`,
        }}>
          {icon}
        </Box>
      </Stack>
      <Box sx={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>{children}</Box>
    </AppCard>
  );
};

/** Valor grande + unidade pequena alinhados pela base (ex.: "32 anos", "Baixo"). */
export const SignalValue = ({ value, unit, color }: { value: string; unit?: string; color?: string }) => (
  <Stack direction="row" alignItems="baseline" spacing={0.5} sx={{ minWidth: 0 }}>
    <Typography noWrap sx={{
      fontFamily: 'Poppins, sans-serif', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1,
      fontSize: { xs: 'clamp(1.5rem, 7.4vw, 1.875rem)', sm: 30 }, color: color ?? 'text.primary', fontVariantNumeric: 'tabular-nums',
    }}>
      {value}
    </Typography>
    {unit && <Typography sx={{ fontSize: 14, fontWeight: 700, color: 'text.secondary' }}>{unit}</Typography>}
  </Stack>
);

/** Frase curta de rodapé do tile. */
export const SignalNote = ({ children, color }: { children: ReactNode; color?: string }) => (
  <Typography sx={{ fontSize: 13, lineHeight: 1.35, fontWeight: 600, color: color ?? 'text.secondary', mt: 'auto' }}>
    {children}
  </Typography>
);

/**
 * Régua "idade do corpo x idade real": a marca vertical é a idade real (centro), o ponto é a idade
 * do corpo. Esquerda = mais jovem (verde), direita = mais velho (vermelho). ±10 anos cobrem a régua.
 */
export const AgeTrack = ({ diff }: { diff: number }) => {
  const t = useTheme();
  const tone = useToneColor();
  const isDark = t.palette.mode === 'dark';
  const pos = Math.max(6, Math.min(94, 50 + (diff / 10) * 44));
  const dot = diff < 0 ? tone('ok') : diff > 0 ? tone('bad') : t.palette.primary.main;
  return (
    <Box aria-hidden sx={{ position: 'relative', height: 14, mt: 0.25 }}>
      <Box sx={{
        position: 'absolute', left: 0, right: 0, top: 5, height: 4, borderRadius: 2,
        background: `linear-gradient(90deg, ${alpha(tone('ok'), isDark ? 0.55 : 0.45)} 0%, ${alpha(t.palette.text.secondary, 0.16)} 50%, ${alpha(tone('bad'), isDark ? 0.55 : 0.45)} 100%)`,
      }} />
      {/* idade real */}
      <Box sx={{ position: 'absolute', left: '50%', top: 1, width: 2, height: 12, borderRadius: 1, transform: 'translateX(-50%)', bgcolor: 'text.secondary', opacity: 0.55 }} />
      {/* idade do corpo */}
      <Box sx={{
        position: 'absolute', top: 0, left: `${pos}%`, width: 14, height: 14, borderRadius: '50%', transform: 'translateX(-50%)',
        bgcolor: dot, border: '2.5px solid', borderColor: 'background.paper', boxShadow: `0 0 0 1px ${alpha(dot, 0.35)}, 0 2px 6px ${alpha(dot, 0.35)}`,
        transition: REDUCED ? 'none' : 'left .8s cubic-bezier(.16,1,.3,1)',
      }} />
    </Box>
  );
};

/** Precisão da estimativa: 9 tracinhos (os 9 marcadores do PhenoAge), acesos os que vieram dos exames. */
export const PrecisionDots = ({ used, total = 9 }: { used: number; total?: number }) => {
  const t = useTheme();
  const on = Math.max(0, Math.min(total, used));
  return (
    <Stack aria-hidden direction="row" spacing={0.4} sx={{ mt: 0.25 }}>
      {Array.from({ length: total }, (_, i) => (
        <Box key={i} sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: i < on ? t.palette.primary.main : alpha(t.palette.text.secondary, 0.16) }} />
      ))}
    </Stack>
  );
};

/** Medidor em 3 faixas (Baixo · Moderado · Alto). `level` null = sem leitura (faixas tracejadas). */
export const LevelMeter = ({ level }: { level: 'baixo' | 'moderado' | 'alto' | null }) => {
  const t = useTheme();
  const tone = useToneColor();
  const steps: { key: 'baixo' | 'moderado' | 'alto'; c: string }[] = [
    { key: 'baixo', c: tone('ok') }, { key: 'moderado', c: tone('warn') }, { key: 'alto', c: tone('bad') },
  ];
  const idx = level ? steps.findIndex((s) => s.key === level) : -1;
  return (
    <Stack aria-hidden direction="row" spacing={0.5} sx={{ mt: 0.25 }}>
      {steps.map((s, i) => (
        <Box key={s.key} sx={{
          flex: 1, height: 6, borderRadius: 3,
          ...(idx < 0
            ? { border: '1px dashed', borderColor: alpha(t.palette.text.secondary, 0.35) }
            : { bgcolor: i === idx ? s.c : alpha(s.c, t.palette.mode === 'dark' ? 0.22 : 0.16) }),
          ...(i === idx ? { boxShadow: `0 0 0 2px ${alpha(s.c, 0.18)}` } : {}),
        }} />
      ))}
    </Stack>
  );
};

type CardioRisk = { level?: string; factors?: { label: string; risk: boolean }[] } | null | undefined;

/** Tile "Risco cardíaco" — nível em palavra + medidor de 3 faixas + quantos fatores. */
export const CardioRiskTile = ({ risk, loaded, hasExams, idx = 3, onClick }: {
  risk: CardioRisk; loaded: boolean; hasExams: boolean; idx?: number; onClick: () => void;
}) => {
  const tone = useToneColor();
  const level = risk?.level === 'alto' || risk?.level === 'moderado' || risk?.level === 'baixo' ? risk.level : null;
  const factors = (risk?.factors ?? []).filter((f) => f.risk).length;
  const tTone: SignalTone = level === 'alto' ? 'bad' : level === 'moderado' ? 'warn' : level === 'baixo' ? 'ok' : 'neutral';
  const word = level === 'alto' ? 'Alto' : level === 'moderado' ? 'Moderado' : level === 'baixo' ? 'Baixo' : null;
  const note = level
    ? (factors > 0 ? `${factors} fator${factors > 1 ? 'es' : ''} de risco` : 'nenhum fator de risco')
    : !loaded ? '' : hasExams ? 'Falta colesterol, peso ou pressão' : 'Envie um exame para calcular';
  return (
    <SignalTile
      idx={idx}
      label="Risco cardíaco"
      tone={tTone}
      icon={<Heartbeat size={21} weight="duotone" />}
      onClick={onClick}
      ariaLabel={word ? `Risco cardíaco ${word}${note ? ` — ${note}` : ''}. Ver fatores` : `Risco cardíaco sem leitura — ${note}`}
    >
      {word
        ? <SignalValue value={word} color={tone(tTone)} />
        : <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 18, lineHeight: 1.2, color: 'text.secondary' }}>{loaded ? 'Sem leitura' : '…'}</Typography>}
      <LevelMeter level={level} />
      {note && <SignalNote color={level && factors > 0 ? tone(tTone) : undefined}>{note}</SignalNote>}
    </SignalTile>
  );
};
