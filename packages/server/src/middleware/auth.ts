import type { Request, Response, NextFunction } from 'express';
import { verifyToken, signToken } from '../auth/jwt';
import { prisma } from '../prisma';
import { DOCTOR_ACCESS_SELECT, doctorAccessDenial } from '../utils/doctorAccess';

export interface AuthedRequest extends Request {
  userId?: string;
}

/** Janela da SLIDING SESSION: se faltar menos que isto para o token expirar, o middleware
 *  emite um token fresco no header X-Renewed-Token. Usuários ativos nunca perdem a sessão.
 *  Default 2 dias (token dura 7d → renova a partir do 5º dia de uso). */
const RENEW_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

/** Token das rotas de FOTO (servidas em <img src>, que não envia header Authorization):
 *  query ?t= OU header Authorization. */
function photoTokenOf(req: Request): string | null {
  const q = req.query.t;
  return (typeof q === 'string' ? q : null)
    || (typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
}

/** Auth LEVE p/ rotas de FOTO. Só verifica assinatura+expiração do JWT (sem DB/tokenVersion) —
 *  fecha o buraco da "foto pública por CUID" (LGPD facial) sem onerar o DB a cada avatar
 *  renderizado. Qualquer token válido (paciente OU médico) abre; o CUID não-enumerável limita o
 *  risco residual de acesso cruzado. Usada na foto do MÉDICO (vista por pacientes e médicos);
 *  a foto do PACIENTE usa requirePatientPhotoToken (token de médico passa pelo gate KYC + vínculo). */
export function requirePhotoToken(req: Request, res: Response, next: NextFunction): void {
  const tok = photoTokenOf(req);
  if (!tok) { res.status(401).type('html').send('não autorizado'); return; }
  try { verifyToken(tok); next(); } catch { res.status(401).type('html').send('não autorizado'); }
}

/**
 * Vínculo médico↔paciente que autoriza o médico a ver a FOTO do paciente (revisão final do KYC, I8).
 * Vale qualquer um destes — são exatamente as relações que as telas do próprio médico já listam
 * (com o nome do paciente) e que renderizam o avatar:
 *  1. DoctorShare ATIVO e não expirado (lista de pacientes, prontuário, chamada da fila imediata — o
 *     share efêmero 'fila-imediata' existe do match até o fim da chamada);
 *  2. teleconsulta PRÓPRIA (Reminder type='teleconsulta', createdByDoctorId = médico), em qualquer estado:
 *     agendada, ao vivo ou já encerrada (histórico em GET /doctor/teleconsultas; o share efêmero da fila
 *     é revogado no fim da chamada, mas a consulta continua na lista do médico). O match da fila cria o
 *     Reminder na mesma transação da oferta, então "entrada de fila atribuída ao médico" já está aqui;
 *  3. pergunta do paciente a este médico (DoctorQuestion, mesmo fechada/revogada: GET /doctor/questions
 *     lista todas e mostra o avatar).
 * Um CUID de paciente conhecido, sozinho, NÃO é vínculo.
 */
export async function doctorHasPatientLink(doctorId: string, patientId: string, now: Date = new Date()): Promise<boolean> {
  const share = await prisma.doctorShare.findFirst({
    where: { doctorId, patientId, active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    select: { id: true },
  });
  if (share) return true;
  const consult = await prisma.reminder.findFirst({ where: { createdByDoctorId: doctorId, patientId, type: 'teleconsulta' }, select: { id: true } });
  if (consult) return true;
  const question = await prisma.doctorQuestion.findFirst({ where: { doctorId, patientId }, select: { id: true } });
  return !!question;
}

/**
 * Auth da foto do PACIENTE (GET /api/patients/:id/photo). O JWT sozinho NUNCA basta (revisão final I8, 1ª e 2ª rodadas):
 *  - só vale SESSÃO — de usuário ({userId}) ou de médico ({doctorId, type:'doctor'}). Outro JWT assinado com o mesmo
 *    segredo (reset de senha: purpose:'reset'; state do OAuth do Meet: type:'doctor-meet'; tipo desconhecido) → 403 INVALID_TOKEN;
 *  - token de MÉDICO: carrega o médico (DOCTOR_ACCESS_SELECT), aplica a política única (bloqueado → 403 DOCTOR_BLOCKED;
 *    não pode atender → 403 VERIFICATION_REQUIRED) e exige vínculo com o paciente da URL (403 NO_SHARE);
 *  - token de USUÁRIO: só o DONO do paciente (titular ou dependente/familiar — Patient.ownerId; uma consulta indexada,
 *    que já confere conta não bloqueada e tokenVersion como o requireAuth) ou um ADMIN (o painel admin usa token de
 *    usuário). Qualquer outro → 403 NOT_OWNER. Antes qualquer conta de paciente (inclusive gratuita) abria a foto de
 *    qualquer paciente pelo CUID — o cenário original do I8 (médico bloqueado/pendente que aprendeu o patientId) seguia aberto.
 * Falha de banco = fail-closed (500 pelo errorHandler), nunca "abre". O parâmetro da rota é :id.
 */
export async function requirePatientPhotoToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const tok = photoTokenOf(req);
  if (!tok) { res.status(401).type('html').send('não autorizado'); return; }
  let payload: any;
  try { payload = verifyToken(tok); } catch { res.status(401).type('html').send('não autorizado'); return; }
  const isDoctor = payload?.type === 'doctor';
  if (payload?.purpose || (payload?.type != null && !isDoctor)) {
    res.status(403).json({ code: 'INVALID_TOKEN', error: 'Este token não vale para a foto do paciente.' });
    return;
  }
  const patientId = String(req.params.id);
  try {
    if (isDoctor) {
      const doctorId = typeof payload.doctorId === 'string' ? payload.doctorId : '';
      const doc = doctorId ? await prisma.doctor.findUnique({ where: { id: doctorId }, select: DOCTOR_ACCESS_SELECT }) : null;
      if (!doc) { res.status(401).json({ code: 'DOCTOR_NOT_FOUND', error: 'Médico não encontrado.' }); return; }
      const denial = doctorAccessDenial(doc);
      if (denial) { res.status(denial.status).json(denial.body); return; }
      if (!(await doctorHasPatientLink(doc.id, patientId))) {
        res.status(403).json({ code: 'NO_SHARE', error: 'Sem acesso à foto deste paciente.' });
        return;
      }
      next();
      return;
    }
    const userId = typeof payload?.userId === 'string' ? payload.userId : '';
    if (!userId) { res.status(401).type('html').send('não autorizado'); return; }
    // Mesma regra de sessão do requireAuth: conta não bloqueada e, se o token traz `ver`, igual ao tokenVersion atual
    // (senha trocada/resetada derruba o token). Token legado sem `ver` segue tolerado.
    const session = { blocked: false, ...(payload.ver != null ? { tokenVersion: payload.ver } : {}) };
    const owned = await prisma.patient.findFirst({ where: { id: patientId, ownerId: userId, owner: session }, select: { id: true } });
    if (!owned) {
      const admin = await prisma.user.findFirst({ where: { id: userId, role: 'ADMIN', ...session }, select: { id: true } });
      if (!admin) { res.status(403).json({ code: 'NOT_OWNER', error: 'Sem acesso à foto deste paciente.' }); return; }
    }
    next();
  } catch (e) { next(e); }
}

/** Middleware que exige JWT válido e injeta req.userId. */
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Não autenticado' });
    return;
  }
  try {
    const payload: any = verifyToken(header.slice(7));
    // GARANTIA DE ISOLAMENTO: token de MÉDICO (type:'doctor') nunca acessa a área do paciente.
    if (payload?.type === 'doctor') {
      res.status(401).json({ error: 'Use o login de paciente. Conta de médico não acessa esta área.' });
      return;
    }
    const userId: string | undefined = payload?.userId;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, blocked: true, tokenVersion: true } });
    if (!user) {
      res.status(401).json({ error: 'Usuário inválido' });
      return;
    }
    // Conta bloqueada pelo admin → derruba a sessão ativa (401). O app faz logout e, no
    // próximo login, o usuário recebe a mensagem amigável de contato com o suporte.
    if (user.blocked) {
      res.status(401).json({ error: 'Sua sessão expirou. Faça login novamente.' });
      return;
    }
    // Invalida sessões JWT após reset/troca de senha (tokenVersion no DB > ver do token).
    // TOLERANTE a tokens legados (sem ver) — não desloga ninguém no deploy da feature.
    if (payload.ver != null && user.tokenVersion !== payload.ver) {
      res.status(401).json({ error: 'Sua sessão expirou. Faça login novamente.' });
      return;
    }
    req.userId = user.id;
    // SLIDING SESSION transparente: token válido mas perto de expirar → emite um novo no
    // header de resposta. O frontend (utils/fetch-cache.ts) lê e troca no localStorage em
    // TODA resposta (upload, dataProvider, profile…), sem cada página tratar. Assim um
    // usuário ativo nunca toma 401 por token expirado. jwt.verify inclui `exp` (segundos).
    const exp = Number(payload?.exp);
    if (exp && exp * 1000 - Date.now() <= RENEW_WINDOW_MS) {
      try { res.setHeader('X-Renewed-Token', signToken({ userId: user.id })); } catch { /* best-effort */ }
    }
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

/** Devolve os IDs de pacientes pertencentes ao usuário (escopo de dados). */
export async function userPatientIds(userId: string): Promise<string[]> {
  const rows = await prisma.patient.findMany({ where: { ownerId: userId }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** Devolve o paciente TITULAR do usuário (ou o 1º disponível como fallback). */
export async function firstPatientId(userId: string): Promise<string | null> {
  const titular = await prisma.patient.findFirst({ where: { ownerId: userId, relationship: 'Titular' }, select: { id: true } });
  if (titular) return titular.id;
  const any = await prisma.patient.findFirst({ where: { ownerId: userId }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  return any?.id ?? null;
}

/** Middleware que exige plano PREMIUM ativo (para recursos pagos: resumo IA, chat, etc). */
export async function requirePlan(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { planExpiresAt: true } });
  const active = !!user?.planExpiresAt && user.planExpiresAt > new Date();
  if (!active) {
    res.status(402).json({ error: 'plan_required', message: 'Este recurso é Premium. Assine para usar.' });
    return;
  }
  next();
}
