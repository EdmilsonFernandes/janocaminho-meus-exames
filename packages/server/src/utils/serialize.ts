import { mediaTypeFromRef } from './storage';

/** O que o front precisa saber sobre o arquivo de um exame: se é FOTO ou PDF. */
export type ExamFileKind = 'image' | 'pdf';
export type SerializedExam<T extends Record<string, any>> = Omit<T, 'filePath'> & { fileKind?: ExamFileKind };

/**
 * Remove campos internos (caminho do disco / chave do S3) antes de enviar ao cliente e, no lugar,
 * expõe SÓ se o arquivo é foto ou PDF (`fileKind`) — a miniatura do card de falha precisa disso
 * (o download continua sendo sempre por /exams/:id/file, atrás de auth + posse).
 *
 * BUG que isto fecha (21/11): a miniatura do card de falha testava `r.filePath`, que esta função
 * sempre removeu → a preview nunca apareceu em produção.
 */
export function serializeExam<T extends Record<string, any>>(exam: T): SerializedExam<T> {
  if (!exam) return exam as SerializedExam<T>;
  const { filePath, ...rest } = exam;
  if (!filePath) return rest as SerializedExam<T>;
  return { ...rest, fileKind: mediaTypeFromRef(filePath).startsWith('image/') ? 'image' : 'pdf' };
}
