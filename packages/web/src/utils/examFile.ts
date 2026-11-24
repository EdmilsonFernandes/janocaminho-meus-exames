import { Capacitor } from '@capacitor/core';
import { API_URL, token } from '../config';
import { openBlobFile } from './nativeDoc';

/**
 * Baixa um arquivo de exame por uma rota que só aceita `Authorization: Bearer`
 * (em prod a rota redireciona para o S3 e o fetch segue até devolver o blob).
 *
 * Devolve `null` quando falha, quando está offline (o fetch-cache responde 200 com um JSON vazio e o
 * cabeçalho `X-Offline-Empty`) ou quando o blob veio vazio. É o caminho único de download: quem abre
 * o laudo e quem mostra a miniatura usam este.
 */
export async function fetchExamFileBlob(fileUrl: string): Promise<Blob | null> {
  try {
    const r = await fetch(fileUrl, { headers: { Authorization: `Bearer ${token()}` } });
    if (!r.ok || r.headers.get('X-Offline-Empty')) return null;
    const blob = await r.blob();
    return blob.size > 0 ? blob : null;
  } catch {
    return null;
  }
}

/**
 * Abre um blob de exame:
 * - Web: object URL → window.open (suporta `#page=N` para ir direto a uma página).
 * - APK (nativo): `openBlobFile` (grava em cache + Share → abre no visualizador do SO).
 */
export async function openExamFileBlob(blob: Blob, fileName: string, page?: number): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      await openBlobFile(blob, fileName);
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

/**
 * Abre o laudo/PDF original de um exame — GET /api/exams/:id/file (Bearer).
 *
 * Retorna `true` em sucesso, `false` em falha (o caller decide como notificar).
 * Espelha o fluxo robusto do `openCitation` do ExamShow, agora compartilhado.
 */
export async function openExamFile(id: string, page?: number): Promise<boolean> {
  const blob = await fetchExamFileBlob(`${API_URL}/exams/${id}/file`);
  return blob ? openExamFileBlob(blob, `exame-${id}.pdf`, page) : false;
}

/**
 * Admin: arquivo de QUALQUER exame (não só do próprio usuário). A rota é restrita ao admin e auditada
 * no servidor; quem só mostra miniatura usa esta URL direto no ExamFilePreview.
 */
export const adminExamFileUrl = (examId: string) => `${API_URL}/admin/exams/${examId}/file`;
export async function openAdminExamFile(examId: string): Promise<boolean> {
  const blob = await fetchExamFileBlob(adminExamFileUrl(examId));
  return blob ? openExamFileBlob(blob, `exame-${examId}.${blob.type.startsWith('image/') ? 'jpg' : 'pdf'}`) : false;
}
