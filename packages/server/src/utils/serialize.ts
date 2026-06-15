/** Remove campos internos (path do arquivo no disco) antes de enviar ao cliente. */
export function serializeExam<T extends Record<string, any>>(exam: T): Omit<T, 'filePath'> {
  if (!exam) return exam;
  const { filePath, ...rest } = exam;
  return rest as Omit<T, 'filePath'>;
}
