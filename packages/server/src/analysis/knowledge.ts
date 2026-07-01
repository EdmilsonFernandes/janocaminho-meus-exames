/**
 * knowledge.ts — Carrega o card de conhecimento clínico (.md) da condição do paciente.
 *
 * RAG simples: lê o markdown curado de `packages/server/knowledge/<cond>.md` e devolve o texto
 * para o risk-action-plan injetar no prompt do GLM. Assim a IA fica mais rica e consistente,
 * e melhora sem retreinar — basta editar o .md (versionado, auditável).
 *
 * Cache só em produção (estático); em dev relê a cada chamada (tsx watch não invalida ao
 * editar .md, então sem cache em dev pega sempre o atual).
 */
import fs from 'fs';
import path from 'path';

// Mapeia conditionKey (do risk-rules/engine) -> arquivo .md em packages/server/knowledge/
const FILE_BY_CONDITION: Record<string, string> = {
  diabetes: 'diabetes.md',
  prediabetes: 'prediabetes.md',
  hypertension: 'hipertensao.md',
  high_cholesterol: 'colesterol-alto.md',
  cardiovascular_risk: 'cardiovascular.md',
  anemia: 'anemia.md',
};

// Candidatos de diretório (dev tsx e dist compilado em prod têm __dirname diferente).
const KB_CANDIDATES = [
  path.resolve(__dirname, '../../knowledge'),       // dev: src/analysis -> packages/server/knowledge
  path.resolve(__dirname, '../../../knowledge'),     // dist/src/analysis
  path.resolve(process.cwd(), 'knowledge'),          // cwd = packages/server
  path.resolve(process.cwd(), 'packages/server/knowledge'),
];

function resolveKbDir(): string | null {
  for (const c of KB_CANDIDATES) if (fs.existsSync(c)) return c;
  return null;
}

const isProd = process.env.NODE_ENV === 'production';
const cache = new Map<string, string>();

/** Devolve o conteúdo do card de conhecimento da condição (ou null se não houver). */
export function knowledgeFor(conditionKey: string): string | null {
  const file = FILE_BY_CONDITION[conditionKey];
  if (!file) return null; // condição sem card (ex.: 'none')
  if (isProd && cache.has(file)) return cache.get(file)!;

  const dir = resolveKbDir();
  if (!dir) return null;
  try {
    const txt = fs.readFileSync(path.join(dir, file), 'utf8');
    if (isProd) cache.set(file, txt);
    return txt;
  } catch {
    return null;
  }
}
