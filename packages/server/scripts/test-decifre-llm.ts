/**
 * Validação LOCAL do "decifre" contra o relay REAL (sem tocar no .env): usa model override
 * válido (glm-4.6) + o MESMO system prompt + o MESMO parser da rota.
 *   npx tsx scripts/test-decifre-llm.ts
 */
import { getLlm } from '../src/llm';
import { extractJsonObject } from '../src/utils/json';
import { toPublicItems } from '../src/routes/decifre.routes';

const SYSTEM = [
  'Você é um extrator de valores de exames laboratoriais brasileiros.',
  'Recebe o TEXTO de um exame e devolve APENAS um JSON, sem nenhum texto fora dele:',
  '{"items":[{"name":"Hemoglobina","value":13.5,"unit":"g/dL","refLow":12,"refHigh":16}]}',
  'Regras: name = nome do analito como está no laudo; value = número (vírgula vira ponto); unit = unidade ou null;',
  'refLow/refHigh = faixa de referência impressa NO LAUDO (número) ou null se não vier;',
  'máximo 15 itens, priorize os principais (hemograma, lipídicos, glicose, tireoide, rins, fígado);',
  'NUNCA inclua opinião, diagnóstico, recomendação ou texto explicativo. Só os valores.',
].join('\n');

const EXAME = `LABORATÓRIO UNIMED — RESULTADO
Hemoglobina 13,5 g/dL (12,0 - 16,0)
Hematócrito 41,2 % (36,0 - 46,0)
Leucócitos 7.800 /mm³ (4.000 - 11.000)
LDL colesterol 178 mg/dL (< 130)
Triglicerídeos 245 mg/dL (< 150)
HDL colesterol 38 mg/dL (> 40)
TSH 3,10 µUI/mL (0,40 - 4,00)
Glicose 99 mg/dL (70 - 99)
Creatinina 1,8 mg/dL (0,6 - 1,2)
Ácido úrico 3,2 mg/dL (3,5 - 7,2)`;

async function main() {
  const result = await getLlm().complete({
    system: SYSTEM,
    messages: [{ role: 'user', content: `Extraia os valores deste exame:\n\n${EXAME}` }],
    maxTokens: 1200,
    model: 'glm-5.3', // override: o .env dev está com experimento da sessão paralela (glm-5.x[1m])
  });
  console.log('=== raw da IA (primeiros 400):', result.text.slice(0, 400));
  let items: ReturnType<typeof toPublicItems> = [];
  try { items = toPublicItems(extractJsonObject(result.text)); } catch { items = []; }
  console.log(`\n=== ${items.length} itens extraídos:`);
  for (const it of items) {
    console.log(`  ${it.flag.padEnd(7)} ${it.name.padEnd(22)} ${it.value} ${it.unit ?? ''} (faixa ${it.refLow ?? '—'}–${it.refHigh ?? '—'})`);
  }
  const abnormal = items.filter((i) => i.flag === 'HIGH' || i.flag === 'LOW').length;
  console.log(`\nResumo pro card da landing: ${items.length} valores · ${abnormal} pedem atenção`);
  if (items.length === 0) { console.error('FALHOU: 0 itens'); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
