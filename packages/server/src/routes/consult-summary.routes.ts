// §14.1 RESUMO PÓS-CONSULTA (24/10/26) — spec docs/design/2026-10-24-teleconsulta-gaps-spec.md.
// A IA prepara um RASCUNHO estruturado com os dados AUTORIZADOS da consulta encerrada
// (motivo, exames do share, doctorNote, transcript decifrado, pedidos de exame); o
// rascunho é do MÉDICO: revisar/editar/aprovar. SÓ a versão aprovada chega ao paciente
// (a leitura do paciente vive no GET /teleconsulta/:id/summary de teleconsulta.routes.ts,
// que injeta `consultSummary` role-aware — ver consultSummaryFor abaixo).
//
// Rotas (router montado em /api — SEM overlap com teleconsulta.routes.ts, padrão D8 do
// examRequest.routes.ts):
//   POST /api/teleconsulta/:id/summary/generate  — médico gera rascunho com IA (upsert)
//   PUT  /api/teleconsulta/:id/summary           — médico salva edição do rascunho (sem aprovar)
//   POST /api/teleconsulta/:id/summary/approve   — médico aprova: draft→summaryMd, version++
//
// Regras do spec: NUNCA inventar diagnóstico/prescrição/dose; diferenciar [relatado pelo
// paciente]×[exame]×[avaliação médica]; transcript ausente/incompleto → seção "Transcrição
// indisponível — registro manual"; falha de geração NÃO apaga rascunho/edições (503 + retry).
// Auth: `requireDoctorIdentity` LOCAL (padrão requireJoinIdentity/examRequest — o
// middleware/auth.ts original rejeita token de médico, isolamento de área).
import { Router, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../prisma';
import { type AuthedRequest } from '../middleware/auth';
import { audit } from '../utils/audit';
import { decryptPII } from '../utils/crypto';
import { extractJsonObject } from '../utils/json';
import { getLlm, getModel } from '../llm';
import { appendAiFooter } from '../utils/aiFooter';
import { DOCTOR_ACCESS_SELECT, doctorAccessDenial } from '../utils/doctorAccess';

const router = Router();

interface ConsultSummaryRequest extends AuthedRequest {
  doctorId?: string;
}

/** Revisão rastreável (coluna revisions Json) — histórico de {md, at, by, kind}.
 *  Index signature: Prisma Json input exige InputJsonObject (objeto "aberto"). */
interface CsRevision { [k: string]: any; md: string; at: string; by: string | null; kind: 'generate' | 'draft' | 'approve' }
const MAX_REVISIONS = 50;

/** Auth de MÉDICO local (~padrão requireJoinIdentity/examRequest). Valida existência no DB. */
async function requireDoctorIdentity(req: ConsultSummaryRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) { res.status(401).json({ error: 'Não autenticado' }); return; }
  let payload: any;
  try { payload = jwt.verify(header.slice(7), config.jwtSecret); } catch { res.status(401).json({ error: 'Token inválido ou expirado' }); return; }
  if (payload?.type !== 'doctor' || !payload?.doctorId) { res.status(401).json({ error: 'Token médico inválido.' }); return; }
  const doc = await prisma.doctor.findUnique({ where: { id: payload.doctorId }, select: DOCTOR_ACCESS_SELECT });
  if (!doc) { res.status(401).json({ error: 'Token médico inválido.' }); return; }
  const denial = doctorAccessDenial(doc); // spec §7: antes nem checava bloqueio
  if (denial) { res.status(denial.status).json(denial.body); return; }
  req.doctorId = doc.id;
  next();
}

interface SummaryReminderRef {
  id: string;
  patientId: string;
  ownerId: string;
  title: string;
  endedAt: Date | null;
  doctorNote: string | null;
  cid10Code: string | null;
  cid10Desc: string | null;
  transcript: string | null; // DESCRIPTOGRAFADO aqui (só para o prompt — nunca persistido em texto)
}

/** Carrega a teleconsulta + checa share ATIVO do médico (cópia local do padrão join).
 *  Responde (404/403/400) e devolve undefined quando NÃO deve seguir. Drift-safe nas
 *  colunas F3 (transcriptEnc/doctorNote) como o resto do módulo teleconsulta. */
async function loadEndedTeleconsultaForDoctor(req: ConsultSummaryRequest, res: Response): Promise<SummaryReminderRef | undefined> {
  const id = String(req.params.id);
  const row: any = await prisma.reminder.findUnique({
    where: { id },
    select: { id: true, type: true, patientId: true, ownerId: true, title: true, endedAt: true, doctorNote: true, cid10Code: true, cid10Desc: true, transcriptEnc: true, transcriptIv: true },
  }).catch((e: any) => /column .* does not exist/i.test(String(e?.message))
    ? prisma.reminder.findUnique({ where: { id }, select: { id: true, type: true, patientId: true, ownerId: true, title: true, endedAt: true } })
    : Promise.reject(e));
  if (!row || row.type !== 'teleconsulta') { res.status(404).json({ error: 'Teleconsulta não encontrada' }); return; }

  const share = await prisma.doctorShare.findFirst({
    where: { doctorId: req.doctorId!, patientId: row.patientId, active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    select: { id: true, examIds: true },
  });
  if (!share) { res.status(403).json({ error: 'Sem permissão.' }); return; }

  if (!row.endedAt) {
    // §14.2: resumo é pós-CONSULTA — encerramento da CHAMADA é pré-requisito (mas não
    // suficiente p/ "concluída"; o resumo não decide teleStatus, apenas exige endedAt).
    res.status(400).json({ code: 'CONSULTA_NAO_ENCERRADA', error: 'Encerre a consulta antes de gerar o resumo.' });
    return;
  }
  (req as any).__shareExamIds = share.examIds ?? [];
  return {
    id: row.id,
    patientId: row.patientId,
    ownerId: row.ownerId,
    title: row.title ?? '',
    endedAt: row.endedAt,
    doctorNote: row.doctorNote ?? null,
    cid10Code: (row as any).cid10Code ?? null,
    cid10Desc: (row as any).cid10Desc ?? null,
    transcript: row.transcriptEnc != null ? decryptPII(row.transcriptEnc, row.transcriptIv) : null,
  };
}

/** Payload role-aware do resumo (injetado no GET /teleconsulta/:id/summary pelo
 *  teleconsulta.routes.ts — ÚNICA leitura do paciente).
 *  MÉDICO: draft + approved + versions/revisions. PACIENTE: SOMENTE approved (senão
 *  null — o rascunho nunca vaza). Drift-safe: tabela nova ausente no legado → null. */
export async function consultSummaryFor(reminderId: string, role: 'doctor' | 'patient'): Promise<any | null> {
  const row: any = await prisma.consultSummary.findUnique({ where: { reminderId } }).catch(() => null);
  if (!row) return null;
  const approvedBy = row.approvedByDoctorId
    ? await prisma.doctor.findUnique({ where: { id: row.approvedByDoctorId }, select: { name: true } }).catch(() => null)
    : null;
  const iso = (d: any) => (d ? new Date(d).toISOString() : null);
  if (role === 'doctor') {
    return {
      status: row.status,
      draftMd: row.draftMd ?? null,
      summaryMd: row.summaryMd ?? null,
      generatedAt: iso(row.generatedAt),
      approvedAt: iso(row.approvedAt),
      approvedBy: approvedBy ? { name: approvedBy.name } : null,
      version: row.version ?? 1,
      revisions: Array.isArray(row.revisions) ? row.revisions : [],
    };
  }
  if (row.status !== 'approved' || !row.summaryMd) return null; // rascunho nunca vaza
  return {
    status: 'approved',
    summaryMd: row.summaryMd,
    approvedAt: iso(row.approvedAt),
    approvedBy: approvedBy ? { name: approvedBy.name } : null,
    version: row.version ?? 1,
  };
}

/** Concatena revisão (cap MAX_REVISIONS — histórico recente, sem crescer sem limite). */
function withRevision(revisions: unknown, rev: CsRevision): CsRevision[] {
  const list: CsRevision[] = Array.isArray(revisions) ? (revisions as CsRevision[]) : [];
  return [...list, rev].slice(-MAX_REVISIONS);
}

// ── Prompt §14.1 ────────────────────────────────────────────────────────────────
const SUMMARY_SYSTEM = `Você redige o RASCUNHO do resumo de uma consulta médica por telemedicina, para revisão do médico antes de chegar ao paciente. Regras INVIOLÁVEIS:
1. NUNCA invente diagnóstico, prescrição, medicamento ou dose. Se algo não consta nos dados, escreva "não registrado".
2. Diferencie a origem de cada afirmação: [relatado pelo paciente], [exame] (dado de laboratório) ou [avaliação médica] (dita/escrita pelo médico).
3. Use SOMENTE as informações fornecidas — nada de conhecimento externo sobre o caso.
4. Se a transcrição estiver ausente ou incompleta, inclua a seção "Transcrição indisponível — registro manual" e NÃO especule sobre o que foi dito.
5. Português do Brasil, markdown simples (títulos com ## e negrito **). Texto clínico sóbrio, sem adjetivos de marketing.
Responda SOMENTE com JSON no formato {"summaryMd": "..."} contendo exatamente estas seções em markdown:
## Motivo da consulta
## Pontos discutidos
## Exames avaliados
## Avaliação e conduta
## Orientações e próximos passos
## Exames e encaminhamentos solicitados
## Retorno e pendências`;

function buildSummaryUserPrompt(r: SummaryReminderRef, examRequests: any[], exams: any[], ctx?: { allergies: string | null; medications: { name: string; dosage: string | null; frequency: string | null }[] }): string {
  const fmtDate = (d: any) => (d ? new Date(d).toLocaleDateString('pt-BR') : 'data não registrada');
  const lines: string[] = [];
  lines.push(`MOTIVO DA CONSULTA (título do agendamento): ${r.title || 'não registrado'}`);
  lines.push(`NOTA DO MÉDICO SOBRE ESTA CONSULTA (QuickNote): ${r.doctorNote || 'não registrada'}`);
  lines.push(`CID-10 REGISTRADO PELO MÉDICO (código oficial): ${r.cid10Code ? `${r.cid10Code}${r.cid10Desc ? ` — ${r.cid10Desc}` : ''}` : 'não registrado'}`);
  lines.push(`TRANSCRIÇÃO DA CHAMADA: ${r.transcript ? r.transcript.slice(0, 12_000) : 'AUSENTE — inclua a seção "Transcrição indisponível — registro manual"'}`);
  // Brief v2: registro estruturado do app — diferenciar [registro do app] de [relatado pelo
  // paciente]; a IA não inventa medicação/alergia que não consta aqui.
  if (ctx) {
    lines.push(`MEDICAÇÕES ATIVAS REGISTRADAS NO APP: ${ctx.medications.length ? ctx.medications.map((m) => `${m.name}${m.dosage ? ` ${m.dosage}` : ''}${m.frequency ? ` (${m.frequency})` : ''}`).join('; ') : 'nenhuma registrada'}`);
    lines.push(`ALERGIAS REGISTRADAS NO APP: ${ctx.allergies?.trim() || 'não informadas'}`);
  }
  lines.push(`PEDIDOS DE EXAME/ENCAMINHAMENTOS DESTA CONSULTA: ${
    examRequests.length
      ? examRequests.map((er) => `${er.title} (status: ${er.status}${er.respondedAt ? `, respondido em ${fmtDate(er.respondedAt)}` : ''})`).join(' · ')
      : 'nenhum registrado'}`);
  lines.push(`EXAMES DO PACIENTE COMPARTILHADOS COM ESTE MÉDICO (mais recentes primeiro): ${
    exams.length
      ? exams.map((e) => `${e.title} · ${fmtDate(e.performedAt)} · ${e.abnormalCount > 0 ? `${e.abnormalCount} item(ns) alterado(s)` : 'sem alterações'}`).join(' · ')
      : 'nenhum compartilhado'}`);
  lines.push('\nRedija o rascunho do resumo seguindo as regras e as seções pedidas.');
  return lines.join('\n');
}

/** Exames avaliáveis = recorte do SHARE (mesma query do doctor.routes.ts:569:
 *  status EXTRACTED + examIds allowlist). take=10 mais recentes — insumo de prompt, não prontuário. */
async function loadShareExams(patientId: string, examIds: string[] | null): Promise<{ title: string; performedAt: Date | null; abnormalCount: number }[]> {
  const rows = await prisma.exam.findMany({
    where: { patientId, status: 'EXTRACTED', ...(examIds?.length ? { id: { in: examIds } } : {}) },
    orderBy: [{ performedAt: 'desc' }, { createdAt: 'desc' }],
    take: 10,
    select: { title: true, performedAt: true, items: { where: { isAbnormal: true }, select: { id: true } } },
  }).catch(() => []);
  return rows.map((e: any) => ({ title: e.title, performedAt: e.performedAt, abnormalCount: e.items?.length ?? 0 }));
}

/** POST /api/teleconsulta/:id/summary/generate — médico gera rascunho com IA.
 *  Upsert (regerar não duplica); falha de LLM → 503 SEM tocar no registro anterior
 *  (draft/edições/aprovação anteriores preservados — retry é sempre seguro). */
router.post('/teleconsulta/:id/summary/generate', requireDoctorIdentity, async (req: ConsultSummaryRequest, res, next) => {
  try {
    const r = await loadEndedTeleconsultaForDoctor(req, res); if (!r) return;
    // Brief v2: meds ativas + alergias (drift-safe — ver /doctor/patients/:id/context).
    const ctx = await (async () => {
      try {
        const [medications, p] = await Promise.all([
          (prisma as any).medication.findMany({ where: { patientId: r.patientId, active: true }, orderBy: { createdAt: 'desc' }, take: 15, select: { name: true, dosage: true, frequency: true } }).catch(() => []),
          (prisma.patient.findUnique({ where: { id: r.patientId }, select: { allergies: true } }) as Promise<any>)
            .catch((e: any) => /column .* does not exist/i.test(String(e?.message)) ? null : Promise.reject(e)),
        ]);
        return { allergies: p?.allergies ?? null, medications };
      } catch { return { allergies: null, medications: [] }; }
    })();
    const [examRequests, exams] = await Promise.all([
      (prisma as any).examRequest.findMany({ where: { reminderId: r.id }, orderBy: { createdAt: 'asc' } }).catch(() => []),
      loadShareExams(r.patientId, (req as any).__shareExamIds ?? null),
    ]);

    let draftMd: string;
    try {
      const result = await getLlm().complete({
        system: SUMMARY_SYSTEM,
        messages: [{ role: 'user', content: buildSummaryUserPrompt(r, examRequests, exams, ctx) }],
        // 16000 = número PROVADO do pipeline (prod, glm-4.6): com menos, o thinking
        // consome o budget e o text vem vazio (ver decifre.routes.ts).
        maxTokens: 16000,
        model: getModel(),
      });
      const parsed = extractJsonObject(result.text);
      draftMd = String(parsed?.summaryMd ?? '').trim();
      if (!draftMd) throw new Error('summaryMd vazio');
    } catch (e: any) {
      // 503 (retry possível) — NÃO 500: a falha é do provedor de IA, e o registro
      // anterior (se houver) continua intacto no banco.
      res.status(503).json({
        code: 'SUMMARY_LLM_FAILED',
        error: 'Não foi possível gerar o rascunho agora. Tente novamente em instantes — suas anotações não foram afetadas.',
        detail: String(e?.message ?? e).slice(0, 300),
      });
      return;
    }
    draftMd = appendAiFooter(draftMd.slice(0, 20_000));

    const existing = await prisma.consultSummary.findUnique({ where: { reminderId: r.id }, select: { id: true, version: true, status: true, summaryMd: true, revisions: true } }).catch(() => null);
    const now = new Date();
    const revision: CsRevision = { md: draftMd, at: now.toISOString(), by: req.doctorId!, kind: 'generate' };
    const saved = existing
      ? await prisma.consultSummary.update({
          where: { reminderId: r.id },
          // status NÃO muda aqui: aprovado anterior continua visível ao paciente até uma
          // NOVA aprovação (nunca sobrescreve o aprovado silenciosamente).
          data: { draftMd, generatedAt: now, version: { increment: 1 }, revisions: withRevision(existing.revisions, revision) },
        })
      : await prisma.consultSummary.create({
          data: { reminderId: r.id, status: 'draft', draftMd, generatedAt: now, version: 1, revisions: [revision] },
        });
    await audit('TELECONSULTA_SUMMARY_GENERATE', req, {
      actorType: 'DOCTOR', actorId: req.doctorId, targetType: 'REMINDER', targetId: r.id,
      after: { reminderId: r.id, version: saved.version, chars: draftMd.length, regenerate: !!existing },
    });
    res.json(await consultSummaryFor(r.id, 'doctor'));
  } catch (e) {
    next(e);
  }
});

/** PUT /api/teleconsulta/:id/summary — médico salva edição do rascunho (salvar e
 *  continuar depois). NÃO aprova e NÃO mexe no summaryMd aprovado. */
router.put('/teleconsulta/:id/summary', requireDoctorIdentity, async (req: ConsultSummaryRequest, res, next) => {
  try {
    const r = await loadEndedTeleconsultaForDoctor(req, res); if (!r) return;
    const draftMd = String(req.body?.draftMd ?? req.body?.summaryMd ?? '').trim().slice(0, 20_000);
    if (!draftMd) { res.status(400).json({ error: 'Rascunho vazio — escreva ou gere com IA antes de salvar.' }); return; }

    const existing = await prisma.consultSummary.findUnique({ where: { reminderId: r.id }, select: { version: true, status: true, summaryMd: true, revisions: true } }).catch(() => null);
    if (!existing) { res.status(404).json({ code: 'NO_DRAFT', error: 'Gere o rascunho com IA antes de editar.' }); return; }

    const now = new Date();
    const revision: CsRevision = { md: draftMd, at: now.toISOString(), by: req.doctorId!, kind: 'draft' };
    await prisma.consultSummary.update({
      where: { reminderId: r.id },
      data: { draftMd, version: { increment: 1 }, revisions: withRevision(existing.revisions, revision) },
    });
    await audit('TELECONSULTA_SUMMARY_DRAFT', req, {
      actorType: 'DOCTOR', actorId: req.doctorId, targetType: 'REMINDER', targetId: r.id,
      after: { reminderId: r.id, chars: draftMd.length },
    });
    res.json(await consultSummaryFor(r.id, 'doctor'));
  } catch (e) {
    next(e);
  }
});

/** POST /api/teleconsulta/:id/summary/approve — médico aprova: copia draft→summaryMd,
 *  status=approved, approvedAt/by, version++ + revisão registrada. NÃO muda teleStatus
 *  (aprovar resumo ≠ concluir atendimento — §14.2). */
router.post('/teleconsulta/:id/summary/approve', requireDoctorIdentity, async (req: ConsultSummaryRequest, res, next) => {
  try {
    const r = await loadEndedTeleconsultaForDoctor(req, res); if (!r) return;
    const existing = await prisma.consultSummary.findUnique({ where: { reminderId: r.id }, select: { draftMd: true, status: true, version: true, summaryMd: true, revisions: true } }).catch(() => null);
    if (!existing?.draftMd) { res.status(400).json({ code: 'NO_DRAFT', error: 'Gere ou escreva o rascunho antes de aprovar.' }); return; }

    const now = new Date();
    const revision: CsRevision = { md: existing.draftMd, at: now.toISOString(), by: req.doctorId!, kind: 'approve' };
    await prisma.consultSummary.update({
      where: { reminderId: r.id },
      data: {
        status: 'approved',
        summaryMd: appendAiFooter(existing.draftMd), // disclosure obrigatório (CFM 2.454): mesmo que o médico o remova ao editar o rascunho, a versão que chega ao paciente carrega o carimbo
        approvedAt: now,
        approvedByDoctorId: req.doctorId,
        version: { increment: 1 },
        revisions: withRevision(existing.revisions, revision),
      },
    });
    await audit('TELECONSULTA_SUMMARY_APPROVE', req, {
      actorType: 'DOCTOR', actorId: req.doctorId, targetType: 'REMINDER', targetId: r.id,
      after: { reminderId: r.id, approvedAt: now.toISOString() },
    });
    res.json(await consultSummaryFor(r.id, 'doctor'));
  } catch (e) {
    next(e);
  }
});

export default router;
