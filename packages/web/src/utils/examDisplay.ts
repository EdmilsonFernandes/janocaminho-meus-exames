export interface CleanExtractedLabel {
  text: string;
  original: string;
  suspicious: boolean;
}

const NOISE_CHARS = /[|!�@#$%^*_={}[\]\\<>~`]/g;
const BROKEN_WORDS = /\b(?:jnir|vol!|vo!!|volpi\s+ara|ara\s+vo)/i;

const normalizeExtractedText = (value: unknown) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

export const looksLikeOcrNoise = (value: unknown) => {
  const text = normalizeExtractedText(value);
  if (!text || text.length < 8) return false;

  const compact = text.replace(/\s/g, '');
  const noiseCount = (text.match(NOISE_CHARS) ?? []).length;
  const digitCount = (text.match(/\d/g) ?? []).length;
  const alphaCount = (text.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
  const shortFragments = text.split(/\s+/).filter((part) => /^[A-Za-zÀ-ÿ]{1,2}$/.test(part)).length;

  return (
    BROKEN_WORDS.test(text) ||
    noiseCount >= 2 ||
    noiseCount / Math.max(compact.length, 1) > 0.08 ||
    (shortFragments >= 3 && text.length > 24) ||
    (digitCount > alphaCount && text.length > 18)
  );
};

export const cleanExtractedLabel = (value: unknown, fallback = '', maxLength = 56): CleanExtractedLabel => {
  const original = normalizeExtractedText(value);
  if (!original) return { text: fallback, original, suspicious: false };

  const suspicious = looksLikeOcrNoise(original);
  const base = suspicious ? fallback : original;
  const text = base.length > maxLength ? `${base.slice(0, Math.max(0, maxLength - 1)).trim()}…` : base;

  return { text, original, suspicious };
};
