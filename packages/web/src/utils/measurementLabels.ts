import { fmtNum } from './format';

/**
 * Rótulos PT-BR dos tipos de medição — fonte única (Timeline mostrava "BLOOD_PRESSURE:"
 * / "WEIGHT:" crus em inglês; Measurements.tsx já traduzia mas mantinha mapa próprio).
 * `synced` = só entra via Health Connect (não aparece no form manual).
 */
export const MEASUREMENT_TYPES: { v: string; l: string; emoji: string; synced?: boolean }[] = [
  { v: 'BLOOD_PRESSURE', l: 'Pressão arterial', emoji: '🩸' },
  { v: 'WEIGHT', l: 'Peso', emoji: '⚖️' },
  { v: 'HEIGHT', l: 'Altura', emoji: '📏' },
  { v: 'GLUCOSE', l: 'Glicose', emoji: '🍬' },
  { v: 'HEART_RATE', l: 'Frequência cardíaca', emoji: '❤️' },
  { v: 'STEPS', l: 'Passos', emoji: '👟', synced: true },
  { v: 'CALORIES', l: 'Calorias', emoji: '🔥', synced: true },
  { v: 'DISTANCE', l: 'Distância', emoji: '📍', synced: true },
  { v: 'OTHER', l: 'Outra medição', emoji: '📌' },
];

const BY_TYPE = new Map(MEASUREMENT_TYPES.map((t) => [t.v, t]));

/** "BLOOD_PRESSURE" → "🩸 Pressão arterial" (desconhecido → "📌 {tipo}" capitalizado). */
export function measurementLabel(type: string): string {
  const t = BY_TYPE.get(type);
  if (t) return `${t.emoji} ${t.l}`;
  const cap = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase().replace(/_/g, ' ');
  return `📌 ${cap}`;
}

/** Valor p/ exibição: pressão vira "120/80"; floats cortados (14 casas nunca mais). */
export function measurementValue(m: { value: number; valueSecondary?: number | null }): string {
  const v = fmtNum(m.value, 1);
  return m.valueSecondary != null ? `${v}/${fmtNum(m.valueSecondary, 1)}` : v;
}
