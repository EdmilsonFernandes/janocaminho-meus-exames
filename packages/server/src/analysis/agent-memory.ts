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

const patientDir = (slug: string): string => path.join(path.resolve(config.agentDir), slug);
const conversaPath = (slug: string): string => path.join(patientDir(slug), 'conversa.md');

/**
 * Salva o relatório consolidado COMPLETO em markdown (arquivo próprio, datado).
 * Assim o conteúdo integral persiste em disco — pode ser relido/reenviado ao médico
 * sem regenerar (economia de tokens + nada se perde).
 */
export function saveFullReport(slug: string, title: string, fullMd: string): void {
  try {
    const dir = patientDir(slug);
    fs.mkdirSync(dir, { recursive: true });
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 16);
    fs.writeFileSync(
      path.join(dir, `relatorio-${stamp}.md`),
      `# ${title}\n\n_Gerado em ${now.toLocaleString('pt-BR')}_\n\n${fullMd}\n`,
      'utf8',
    );
  } catch (e) {
    console.warn('[agent-memory] falhou ao salvar relatório completo:', (e as Error).message);
  }
}

/** Acrescenta um turno de conversa (usuário + Dr. Exame) em conversa.md (persistência). */
export function appendConversation(slug: string, message: string, reply: string): void {
  try {
    const p = conversaPath(slug);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const stamp = new Date().toLocaleString('pt-BR');
    fs.appendFileSync(p, `\n### ${stamp}\n**Você:** ${message}\n\n**Dr. Exame:** ${reply}\n`, 'utf8');
  } catch (e) {
    console.warn('[agent-memory] falhou ao gravar conversa:', (e as Error).message);
  }
}

/** Digest das últimas conversas (mantém contexto no RAG mesmo se o banco for resetado). */
export function conversationDigest(slug: string, maxEntries = 4): string {
  try {
    const p = conversaPath(slug);
    if (!fs.existsSync(p)) return '';
    const full = fs.readFileSync(p, 'utf8');
    const entries = full.split(/\n### /).filter(Boolean).slice(-maxEntries);
    return entries.map((e) => '### ' + e).join('\n').slice(0, 2500);
  } catch {
    return '';
  }
}

export { patientSlug };
