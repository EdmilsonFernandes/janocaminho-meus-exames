/**
 * Scheduler de INGESTÃO DE EXAME POR E-MAIL (tick 90s).
 *
 * R2 da pesquisa de ativação: 63% dos cadastros sem exame nunca voltaram — o PDF não
 * estava no celular (estava no e-mail do laboratório). Agora: encaminha o e-mail do lab
 * com o código EX-XXXX no assunto → cai no MESMO pipeline do upload HTTP.
 *
 * Cursor uid persistido em app_settings (emailIngestLastUid). Sem código válido no
 * assunto, a mensagem é ignorada (caixa de contato humana permanece intocada).
 */
import { prisma } from '../prisma';
import { fetchNewMessages, examCodeFromSubject, EXAM_CODE_RE } from '../utils/emailInbox';
import { isAllowedUpload } from '../utils/fileMagic';
import { sha256Buffer } from '../utils/crypto';
import { saveExamFile, patientSlug } from '../utils/storage';
import { firstPatientId } from '../middleware/auth';
import { runExtraction } from '../extraction/pipeline';
import { computeUploadCost } from '../utils/credits';
import { sendPushToUser } from '../utils/push';
import { sendEmail } from '../utils/mailer';
import { sendNudgeEmail } from '../utils/nudgeMail';

const TICK_MS = 90 * 1000;
const CURSOR_KEY = 'emailIngestLastUid';

async function getCursor(): Promise<number> {
  const row = await prisma.appSetting.findUnique({ where: { key: CURSOR_KEY } });
  return typeof (row?.value as any) === 'number' ? (row?.value as number) : 0;
}

async function setCursor(uid: number): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: CURSOR_KEY },
    create: { key: CURSOR_KEY, value: uid },
    update: { value: uid },
  }).catch((e) => console.error('[emailIngest] falha ao salvar cursor:', (e as Error).message));
}

export function startEmailIngestJob(): void {
  const tick = async () => {
    try {
      const lastUid = await getCursor();
      const { messages, lastUid: newLast } = await fetchNewMessages(lastUid);
      for (const m of messages) {
        const code = examCodeFromSubject(m.subject);
        if (!code) continue; // não é nosso — deixa a caixa em paz
        await ingestOne(code, m).catch((e) => console.error('[emailIngest] erro processando', code, (e as Error).message));
      }
      if (newLast !== lastUid) await setCursor(newLast);
    } catch (e) {
      console.error('[emailIngest] tick error:', (e as Error).message);
    }
  };
  setInterval(() => { void tick(); }, TICK_MS);
  void tick();
  console.log('[emailIngest] job iniciado (90s — caixa de exames por e-mail)');
}

/** Casa código → usuário → injeta o 1º PDF válido no pipeline (mesmas regras do upload). */
/**
 * Resposta automática a QUEM ENCAMINHOU quando o processamento falha (fluxo por e-mail é
 * assíncrono: sem resposta, o usuário fica no escuro achando que "enviou"). Só pra remetentes
 * humanos (pula mailer-daemon/noreply). Best-effort — falha nunca quebra o tick.
 */
const ROBOT_SENDER = /mailer-daemon|no-?reply|postmaster/i;
async function replyProblem(to: string, code: string, reason: string): Promise<void> {
  if (!to || ROBOT_SENDER.test(to)) return;
  try {
    await sendEmail({
      to,
      subject: `Dr. Exame — não conseguimos processar seu exame (${code})`,
      html: `<p>Olá! Recebemos seu e-mail com o código <b>${code}</b> no assunto, mas não conseguimos processar:</p>
<p style="padding:12px;background:#fdecea;border-left:3px solid #d32f2f;border-radius:6px">${reason}</p>
<p>Abra o app Dr. Exame → <b>Enviar exame</b> → toque em <b>“Está no seu e-mail? Encaminhe pra cá”</b> para ver seu código atual, ou envie o PDF diretamente pelo app.</p>
<p style="color:#666;font-size:12px">Se você não encaminhou nenhum exame, ignore este e-mail.</p>`,
      text: `Recebemos seu e-mail com o código ${code}, mas não conseguimos processar: ${reason} Abra o app Dr. Exame → Enviar exame para ver seu código atual ou enviar o PDF pelo app.`,
    });
    console.log(`[emailIngest] resposta de problema enviada a ${to} (${code})`);
  } catch (e) {
    console.error('[emailIngest] falha ao responder problema:', (e as Error).message);
  }
}

async function ingestOne(code: string, m: { subject: string; from: string; pdfs: { filename: string; buffer: Buffer }[] }): Promise<void> {
  const ec = await prisma.emailUploadCode.findUnique({
    where: { code },
    include: { user: { select: { id: true, email: true, name: true, credits: true, planExpiresAt: true, blocked: true } } },
  });
  if (!ec || ec.usedAt || ec.expiresAt < new Date() || ec.user.blocked) {
    console.log(`[emailIngest] código ${code} inválido/usado/expirado (de ${m.from}) — ignorado`);
    await replyProblem(m.from, code, 'o código do assunto não é válido (não existe, já foi usado ou expirou). Códigos valem para <b>1 exame</b> por <b>30 dias</b>.');
    return;
  }
  const pdf = m.pdfs.find((p) => isAllowedUpload(p.buffer));
  if (!pdf) {
    console.log(`[emailIngest] ${code}: sem PDF válido (≤8MB) — ignorado`);
    await replyProblem(m.from, code, 'não encontramos um <b>PDF</b> de até <b>8 MB</b> anexado ao e-mail.');
    return;
  }

  const userId = ec.user.id;
  // PERFIL: o código é POR PERFIL — exame cai na pessoa certa (titular OU dependente;
  // faixa de referência depende disso). Códigos legados (patientId null) → titular.
  const patientId = ec.patientId ?? (await firstPatientId(userId));
  if (!patientId) return;
  const fileSha256 = sha256Buffer(pdf.buffer);

  // idempotência: mesmo arquivo já na conta → avisa (não duplica) — clareza pro usuário
  const existing = await prisma.exam.findFirst({ where: { fileSha256, patient: { ownerId: userId } }, select: { id: true, title: true } });
  if (existing) {
    await prisma.emailUploadCode.update({ where: { id: ec.id }, data: { usedAt: new Date() } }).catch(() => {});
    await sendPushToUser(userId, 'Este exame já estava na sua conta ✅', `O PDF que você encaminhou por e-mail é o mesmo de "${existing.title}" — nada foi duplicado.`, { type: 'email_upload_duplicate', route: `/exams/${existing.id}/show` });
    await sendNudgeEmail({ to: ec.user.email, userId, firstName: (ec.user.name || 'Olá').split(' ')[0], title: 'Este exame já estava na sua conta', body: `O PDF que você encaminhou por e-mail (${code}) é o mesmo documento de "${existing.title}" — por isso nada foi duplicado. Se for um exame NOVO, ele deve ter data diferente; em caso de dúvida, envie pelo app.` }).catch(() => {});
    console.log(`[emailIngest] ${code}: duplicata (${existing.id}) — usuário avisado`);
    return;
  }

  // COBRANÇA: mesmíssimas regras do upload HTTP (1º exame grátis; cota premium/free).
  const active = !!ec.user.planExpiresAt && ec.user.planExpiresAt > new Date();
  const isFirstExamEver = (await prisma.exam.count({ where: { patient: { ownerId: userId } } })) === 0;
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const pCounter = await prisma.patient.findUnique({ where: { id: patientId }, select: { uploadMonth: true, monthlyUploadCount: true } });
  const countSoFar = pCounter?.uploadMonth === monthKey ? (pCounter?.monthlyUploadCount ?? 0) : 0;
  const uploadCost = isFirstExamEver ? 0 : computeUploadCost(active, countSoFar);
  if (uploadCost > 0 && ec.user.credits < uploadCost) {
    await sendPushToUser(userId, 'Exame por e-mail não processado', `Chegou um exame seu por e-mail, mas faltam créditos (${uploadCost}). Abra o app pra recarregar.`, { type: 'email_upload_no_credits', route: '/planos' });
    await replyProblem(m.from, code, `faltam <b>créditos</b> (${uploadCost}) para processar este exame. Recarregue no app e encaminhe de novo — o código continua válido.`);
    return; // NÃO marca usado: o usuário pode recarregar e reencaminhar
  }

  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { fullName: true } });
  const slug = patientSlug(patient?.fullName ?? 'paciente', patientId);
  const ref = await saveExamFile(pdf.buffer, slug, pdf.filename, 'application/pdf');
  const subjectTitle = (m.subject || '').replace(EXAM_CODE_RE, '').replace(/^(fw|fwd|re|enc)\s*:?\s*/i, '').trim().slice(0, 80) || 'Exame por e-mail';

  const exam = await prisma.$transaction(async (tx) => {
    const created = await tx.exam.create({
      data: { patientId, title: subjectTitle, kind: 'OTHER', filePath: ref, fileSha256, fileSizeBytes: pdf.buffer.length },
    });
    await tx.patient.update({ where: { id: patientId }, data: { uploadMonth: monthKey, monthlyUploadCount: countSoFar + 1 } });
    if (uploadCost > 0) {
      const r = await tx.user.updateMany({ where: { id: userId, credits: { gte: uploadCost } }, data: { credits: { decrement: uploadCost } } });
      if (r.count === 0) throw new Error('Sem créditos (race) — reencaminhe depois de recarregar.');
      await tx.creditTransaction.create({ data: { userId, delta: -uploadCost, kind: 'upload', label: `Exame por e-mail: ${created.title}`, refId: created.id } });
    }
    await tx.emailUploadCode.update({ where: { id: ec.id }, data: { usedAt: new Date() } });
    return created;
  });

  await sendPushToUser(userId, 'Exame recebido por e-mail 📧', `"${exam.title}" chegou — a IA já está lendo. Você será avisado quando estiver pronto.`, { type: 'email_upload_received', route: `/exams/${exam.id}/show` });
  // Ciclo completo no MESMO canal: quem encaminhou por e-mail recebe confirmação por e-mail
  // (o push de "pronto" + o e-mail de pronto vêm do pipeline exam_ready).
  await sendNudgeEmail({
    to: ec.user.email, userId, firstName: (ec.user.name || 'Olá').split(' ')[0],
    title: 'Recebemos seu exame por e-mail 📧',
    body: `"${exam.title}" (${code}) chegou e a IA já está lendo. Em instantes você recebe o aviso de que está pronto — com valores, leitura de risco e as perguntas pro médico.`,
    examId: exam.id,
  }).catch(() => { /* best-effort: o push/in-app já garantiram */ });
  runExtraction(exam.id).catch((e) => console.error('[emailIngest] extração falhou:', (e as Error).message));
  console.log(`[emailIngest] ${code} → exam ${exam.id} (user ${userId})`);
}
