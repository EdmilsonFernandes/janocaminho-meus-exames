import { Capacitor } from '@capacitor/core';
import { API_URL, token } from '../config';
import { openBlobFile } from './nativeDoc';

/**
 * Abre o laudo/PDF original de um exame — GET /api/exams/:id/file (Bearer).
 *
 * - Web: blob → object URL → window.open (suporta `#page=N` p/ ir direto a uma página).
 * - APK (nativo): blob → `openBlobFile` (grava em cache + Share → abre no visualizador do OS).
 *
 * Retorna `true` em sucesso, `false` em falha (o caller decide como notificar).
 * Espelha o fluxo robusto do `openCitation` do ExamShow, agora compartilhado.
 */
export async function openExamFile(id: string, page?: number): Promise<boolean> {
  try {
    const r = await fetch(`${API_URL}/exams/${id}/file`, { headers: { Authorization: `Bearer ${token()}` } });
    if (!r.ok) return false;
    const blob = await r.blob();
    if (Capacitor.isNativePlatform()) {
      await openBlobFile(blob, `exame-${id}.pdf`);
    } else {
      const url = URL.createObjectURL(blob);
      window.open(page ? `${url}#page=${page}` : url);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    return true;
  } catch {
    return false;
  }
}
