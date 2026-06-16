import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { patientSlug } from '../utils/storage';

/**
 * "Memória" do agente por paciente: um arquivo historico.md que acumula cada análise.
 * O agente lê um digest disso antes de gerar uma nova análise (continuidade + economia de token —
 * não re-deriva do zero, parte do que já concluiu). Aproximação leve de RAG/memory, factível.
 */

const memoryPath = (slug: string): string => path.join(path.resolve(config.agentDir), slug, 'historico.md');

export function readPatientMemory(slug: string): string {
  try {
    const p = memoryPath(slug);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  } catch {
    return '';
  }
}

/** Digest compacto das últimas N análises (p/ injetar no prompt e economizar token). */
export function memoryDigest(slug: string, maxEntries = 2): string {
  const full = readPatientMemory(slug);
  if (!full) return '';
  const entries = full.split(/\n## /).filter(Boolean).slice(-maxEntries);
  return entries.map((e) => '## ' + e).join('\n').slice(0, 2500);
}

/** Acrescenta uma entrada datada no histórico do paciente. */
export function appendPatientMemory(slug: string, heading: string, body: string): void {
  try {
    const p = memoryPath(slug);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const stamp = new Date().toLocaleString('pt-BR');
    fs.appendFileSync(p, `\n## ${heading} — ${stamp}\n${body}\n`, 'utf8');
  } catch (e) {
    console.warn('[agent-memory] falhou ao gravar:', (e as Error).message);
  }
}

export { patientSlug };
