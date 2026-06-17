import fs from 'fs';
import path from 'path';

// Cache de explicações de exames (RAG simples, em arquivo — volume /app/data/agent).
// O "?" consulta aqui primeiro; só chama a IA se NÃO tiver. Sobrevive a restart/deploy.
const AGENT_DIR = process.env.AGENT_DIR || './data/agent';
const FILE = path.join(AGENT_DIR, 'exam-explanations.json');

export interface Explanation { titulo?: string; resumo?: string; analogia?: string; alterado?: string }

function readAll(): Record<string, Explanation> {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
}
function writeAll(map: Record<string, Explanation>) {
  try { fs.mkdirSync(AGENT_DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(map)); }
  catch (e) { console.error('[explanationsCache] save falhou:', (e as Error).message); }
}

/** Chave canônica: maiúscula, sem acento, só letras/números/_. */
export function nameKey(name: string): string {
  return (name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // tira acento
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function getCachedExplanation(name: string): Explanation | null {
  const k = nameKey(name);
  const v = readAll()[k];
  return v && v.resumo ? v : null;
}

export function setCachedExplanation(name: string, data: Explanation): Explanation {
  const map = readAll();
  map[nameKey(name)] = data;
  writeAll(map);
  return data;
}
