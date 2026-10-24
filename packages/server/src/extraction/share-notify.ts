import { prisma } from '../prisma';
import { sendPushToUser } from '../utils/push';

/**
 * §4 (spec teleconsulta 24/10): exame novo + share POR-EXAME ficava congelado.
 *
 * O portal do médico filtra exames por `share.examIds` (vazio = TODOS, doctor.routes):
 * em share "todos" um exame NOVO entra sozinho; em share por-exame o recorte é estático
 * e o médico só veria o novo se o paciente re-compartilhar tudo. Aqui, quando um exame
 * novo termina de extrair, o paciente recebe 1 notificação in-app por share por-exame
 * ativo ("compartilhar com Dr. X?") — 1 toque (POST /doctor-shares/:id/exams) adiciona
 * só esse exame ao share, sem re-compartilhar.
 *
 * Anti-spam (1x por exame × share): chamada só no primeiro EXTRAÍDO do exame (guard
 * `exam.status !== 'EXTRACTED'` no pipeline) + dedup na tabela de notificações
 * (data.examId + data.shareId — sem schema novo).
 */
export async function notifyNewExamShares(patientId: string, ownerId: string, examId: string, examTitle: string): Promise<void> {
  try {
    const shares = await prisma.doctorShare.findMany({
      where: { patientId, active: true, examIds: { isEmpty: false } },
      select: { id: true, scopes: true, examIds: true, doctor: { select: { id: true, name: true } } },
    });
    if (!shares.length) return;
    // Dedup: prompts já enviados p/ ESTE exame (por share) — sobrevive a reprocessamentos.
    const already = await prisma.notification.findMany({
      where: { userId: ownerId, type: 'share_exam_prompt', data: { path: ['examId'], equals: examId } },
      select: { data: true },
    });
    const promptedShares = new Set(already.map((n) => (n.data as any)?.shareId).filter(Boolean));
    for (const s of shares) {
      if (!s.scopes.includes('exams')) continue;   // share sem escopo de exames: nada a oferecer
      if (s.examIds.includes(examId)) continue;    // exame já no recorte do share
      if (promptedShares.has(s.id)) continue;      // 1x por exame × share
      await sendPushToUser(
        ownerId,
        'Novo exame processado',
        `"${examTitle}" — compartilhar com ${s.doctor.name}?`,
        { type: 'share_exam_prompt', examId, shareId: s.id, doctorId: s.doctor.id },
      );
    }
  } catch (e: any) {
    // best-effort: falha aqui NUNCA pode derrubar a extração
    console.error('[extraction] prompt de share (exame novo) falhou:', e?.message);
  }
}
