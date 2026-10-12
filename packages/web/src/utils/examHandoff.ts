/**
 * Handoff de arquivos dashboard → tela de envio (first-exam flow).
 * O dashboard vazio tem zona de drag&drop real: quem solta um PDF lá não pode
 * perder o arquivo ao navegar. File não vive em rota/sessionStorage — vive aqui,
 * em memória do módulo, e o ExamCreate consome no mount (1× só, depois limpa).
 */
let pending: File[] = [];

/** Guarda arquivos soltos no dashboard (ou em qualquer zona de atalho). */
export const stashExamFiles = (files: File[] | FileList | null) => {
  if (!files) return 0;
  const arr = Array.from(files);
  pending = arr;
  return arr.length;
};

/** ExamCreate: resgata (e limpa) arquivos pendentes do handoff. */
export const takeExamFiles = (): File[] => {
  const arr = pending;
  pending = [];
  return arr;
};
