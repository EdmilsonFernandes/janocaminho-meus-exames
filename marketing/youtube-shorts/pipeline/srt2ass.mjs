// srt2ass — converte o srt do edge-tts em ASS estilizado p/ queimar no short 1080x1920.
import { readFileSync, writeFileSync } from 'node:fs';

const [inp, out] = process.argv.slice(2);
const raw = readFileSync(inp, 'utf8').replace(/\r/g, '');
const ts = (t) => {
  // 00:00:01,234 -> 0:00:01.23
  const m = t.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  const [, h, m2, s, ms] = m;
  return `${Number(h)}:${m2.padStart(2, '0')}:${s.padStart(2, '0')}.${(ms + '0').slice(0, 2)}`;
};
const lines = [];
for (const block of raw.split('\n\n')) {
  const b = block.trim();
  if (!b) continue;
  const mm = b.match(/(\d{2}:\d{2}:\d{2}[,.]\d+)\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d+)([\s\S]*)/);
  if (!mm) continue;
  const text = mm[3].split('\n').map((l) => l.trim()).filter(Boolean).join('\\N');
  lines.push(`Dialogue: 0,${ts(mm[1])},${ts(mm[2])},Cap,,0,0,0,,{\\fad(90,90)}${text}`);
}
const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Arial,62,&H00FFFFFF,&H00FFFFFF,&H00000000,&HA0101010,-1,0,0,0,100,100,0,0,3,8,0,2,90,90,330,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${lines.join('\n')}
`;
writeFileSync(out, ass, 'utf8');
console.log(`ass ok: ${lines.length} blocos`);
