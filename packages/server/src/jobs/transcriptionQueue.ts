// Job F3 (20/10/26): fila de TRANSCRIÇÕES PENDENTES das teleconsultas (D4).
// Reminder com `recordingAt≠null ∧ transcriptAt=null` tem áudio em
// `<teleconsultaDir>/<id>.webm` esperando STT — chega aqui quando o GROQ_API_KEY faltou no
// upload (202 pending) ou a transcrição falhou na hora (rede/timeout). Varre a cada 2 min,
// finaliza (passo 5 da rota 3b) e ainda limpa ARQUIVOS ÓRFÃOS (sem row pendente = lixo,
// ex.: crash entre write e update, ou roll de recorrência que resetou o estado F3).
import fs from 'fs';
import path from 'path';
import { prisma } from '../prisma';
import { config } from '../config';
import { audit } from '../utils/audit';
import { sendPushToUser } from '../utils/push';
import { encryptPII } from '../utils/crypto';
import { hasStt, transcribeAudio, SttError } from '../utils/stt';

const MS_MIN = 60_000;

/** Caminho canônico do áudio efêmero de uma teleconsulta (rota e job usam o mesmo). */
export function audioPathFor(reminderId: string): string {
  return path.join(config.teleconsultaDir, `${reminderId}.webm`);
}

export interface TranscriptReminderRef {
  id: string;
  ownerId: string; // User dono do paciente → destino da Notification (D7: médico não tem canal push)
}

/** Finaliza UMA transcrição (passo 5 da rota 3b, compartilhado com o job):
 *  transcreve → CIFRA (encryptPII, igual CPF) → persiste → DELETA o áudio → notifica o
 *  paciente → audit (AWAIT — família void-audit extinta). Lança SttError para o chamador
 *  decidir pending (rede) vs abort (STT_TOO_LARGE). `ctx` identifica o ator do audit
 *  (rota = médico que subiu o áudio; job = SYSTEM). */
export async function finalizeTranscription(
  reminder: TranscriptReminderRef,
  ctx: { req?: any; actorType?: string; actorId?: string | null } = {},
): Promise<Date> {
  const buf = await fs.promises.readFile(audioPathFor(reminder.id));
  const text = await transcribeAudio(buf, { mime: 'audio/webm', filename: `${reminder.id}.webm` });
  const cipher = encryptPII(text);
  const transcriptAt = new Date();
  await prisma.reminder.update({
    where: { id: reminder.id },
    // `?? undefined` (não null): input de update do Prisma p/ String? só aceita undefined.
    data: { transcriptEnc: cipher?.enc ?? undefined, transcriptIv: cipher?.iv ?? undefined, transcriptAt, recordingAt: null },
  });
  // Áudio efêmero (D1 LGPD): o permanente é o transcript cifrado — o webm sai do disco.
  await fs.promises.unlink(audioPathFor(reminder.id)).catch(() => {});
  await sendPushToUser(
    reminder.ownerId,
    '📄 Transcrição disponível',
    'A transcrição da sua teleconsulta está pronta na área de teleconsultas.',
    { type: 'teleconsulta', reminderId: reminder.id },
  ).catch((e: any) => console.error('[teleconsulta-stt] push falhou:', e?.message));
  await audit('TELECONSULTA_TRANSCRIPT', ctx.req ?? null, {
    actorType: ctx.actorType ?? 'SYSTEM',
    actorId: ctx.actorId ?? undefined,
    targetType: 'REMINDER',
    targetId: reminder.id,
    after: { reminderId: reminder.id, transcriptAt: transcriptAt.toISOString(), chars: text.length },
  });
  return transcriptAt;
}

/** Abort terminal (ex.: STT_TOO_LARGE): arquivo fora, estado limpo, paciente avisado. */
export async function abortTranscription(reminder: TranscriptReminderRef, code: string): Promise<void> {
  await fs.promises.unlink(audioPathFor(reminder.id)).catch(() => {});
  await prisma.reminder.update({ where: { id: reminder.id }, data: { recordingAt: null } }).catch(() => {});
  await sendPushToUser(
    reminder.ownerId,
    'Transcrição indisponível',
    'Não foi possível transcrever a gravação desta teleconsulta (áudio muito longo).',
    { type: 'teleconsulta', reminderId: reminder.id },
  ).catch((e: any) => console.error('[teleconsulta-stt] push falhou:', e?.message));
  await audit('TELECONSULTA_TRANSCRIPT', null, {
    actorType: 'SYSTEM',
    targetType: 'REMINDER',
    targetId: reminder.id,
    after: { reminderId: reminder.id, error: code },
  });
}

/** Varre as pendências (D4) e finaliza o que der. Devolve qtde transcrita neste tick. */
export async function processPendingTranscriptions(): Promise<number> {
  if (!hasStt()) return 0; // degradação: sem provider, nada a fazer (áudio segue no disco)
  const pending: TranscriptReminderRef[] = await prisma.reminder.findMany({
    where: { type: 'teleconsulta', recordingAt: { not: null }, transcriptAt: null },
    select: { id: true, ownerId: true },
    take: 10,
  });
  let done = 0;
  for (const r of pending) {
    if (!fs.existsSync(audioPathFor(r.id))) {
      // Row pendente SEM arquivo = estado encalhado (crash pós-update) → limpa o marcador.
      await prisma.reminder.updateMany({ where: { id: r.id }, data: { recordingAt: null } }).catch(() => {});
      continue;
    }
    try {
      await finalizeTranscription(r, { actorType: 'SYSTEM' });
      done++;
    } catch (e: any) {
      if (e instanceof SttError && e.code === 'STT_TOO_LARGE') {
        await abortTranscription(r, e.code).catch(() => {});
      } else {
        // Rede/timeout: mantém arquivo + recordingAt → próximo tick retria.
        console.error(`[teleconsulta-stt] pendência ${r.id} segue pendente:`, e?.message);
      }
    }
  }
  await sweepOrphanAudioFiles();
  return done;
}

/** Remove arquivos do diretório SEM row pendente correspondente (órfãos de crash/roll D5).
 *  Re-confere a row ANTES de cada delete (janela de corrida com upload em andamento). */
async function sweepOrphanAudioFiles(): Promise<void> {
  let files: string[] = [];
  try { files = await fs.promises.readdir(config.teleconsultaDir); } catch { return; }
  for (const f of files) {
    if (!f.endsWith('.webm')) continue;
    const id = f.slice(0, -'.webm'.length);
    // reviewer-H: upload escreve o arquivo ANTES de setar recordingAt (ordem D4 anti-
    // corrida) — nessa janela o arquivo é "óbvio órfão". Só varre arquivos VELHOS (>5min).
    try {
      const st = await fs.promises.stat(path.join(config.teleconsultaDir, f));
      if (Date.now() - st.mtimeMs < 5 * 60_000) continue;
    } catch { continue; }
    const stillPending = await prisma.reminder.findFirst({
      where: { id, type: 'teleconsulta', recordingAt: { not: null }, transcriptAt: null },
      select: { id: true },
    }).catch(() => null);
    if (stillPending) continue;
    await fs.promises.unlink(path.join(config.teleconsultaDir, f)).catch(() => {});
    console.log(`[teleconsulta-stt] órfão removido: ${f}`);
  }
}

/** Boot do job (index.ts): tick imediato (~15s) + intervalo de 2 min. */
export function startTranscriptionQueueJob(): void {
  // reviewer-F: um tick pode levar ~40min (10 itens × até 240s de STT); sem a trava,
  // o próximo intervalo re-selecionava as MESMAS rows (retranscrição duplicada).
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const n = await processPendingTranscriptions();
      if (n) console.log(`[teleconsulta-stt] job finalizou ${n} transcrição(ões)`);
    } catch (e: any) {
      console.error('[teleconsulta-stt] job error:', e?.message);
    } finally {
      running = false;
    }
  };
  setInterval(tick, 2 * MS_MIN);
  setTimeout(tick, 15_000);
  console.log('[teleconsulta-stt] job iniciado (transcrições pendentes · a cada 2 min)');
}
