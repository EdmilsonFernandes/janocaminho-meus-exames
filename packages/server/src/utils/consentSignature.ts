import fs from 'fs';
import path from 'path';
import { config } from '../config';

/**
 * Assinatura desenhada do consentimento de teleconsulta (Art. 15 — lote ReUI 04/11/26).
 * O PNG vive FORA do banco (mesmo princípio dos PDFs de exame): data/uploads/consents/.
 * Path relativo gravado no Reminder.consentSignaturePath; leitura valida basename
 * (anti path-traversal — só o nome, nunca um path arbitrário do cliente).
 */

const CONSENTS_DIR = path.join(config.uploadDir, 'consents');

/** Grava o PNG e devolve o path RELATIVO a gravar no banco (basename apenas). */
export function saveConsentSignature(reminderId: string, buffer: Buffer): string {
  fs.mkdirSync(CONSENTS_DIR, { recursive: true });
  const name = `${reminderId}-${Date.now()}.png`;
  fs.writeFileSync(path.join(CONSENTS_DIR, name), buffer);
  return name;
}

/** Lê o PNG pela referência do banco. Só aceita basename simples — recusa paths. */
export function readConsentSignature(ref: string): Buffer | null {
  if (!ref || ref.includes('/') || ref.includes('\\') || ref.includes('..')) return null;
  const file = path.join(CONSENTS_DIR, ref);
  if (!file.startsWith(CONSENTS_DIR)) return null;
  try {
    return fs.readFileSync(file);
  } catch {
    return null;
  }
}
