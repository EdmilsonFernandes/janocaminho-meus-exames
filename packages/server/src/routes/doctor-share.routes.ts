import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { sendEmail } from '../utils/mailer';
import { getSettings } from '../utils/settings';
import { chargeCredits } from '../utils/credits';
import { normalizeCrmKey } from './doctor.routes';

const router = Router();
router.use(requireAuth);

// LISTAR compartilhamentos do paciente
router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const shares = await prisma.doctorShare.findMany({
      where: { patientId: { in: pids } },
      include: { doctor: { select: { id: true, name: true, crm: true, specialty: true, photoUrl: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ items: shares });
  } catch (e) { next(e); }
});

// CRIAR compartilhamento (paciente compartilha dados com médico)
router.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const { doctorCrm, doctorUf, doctorName, doctorSpecialty, doctorEmail, scopes, convenio, patientId } = req.body ?? {};
    const pids = await userPatientIds(req.userId!);
    const pid = patientId && pids.includes(patientId) ? patientId : pids[0];
    if (!pid) { res.status(400).json({ error: 'Nenhum paciente vinculado.' }); return; }

    // Normaliza CRM pra chave canônica "12345-SP" (compatível c/ o que já existe na base).
    const norm = normalizeCrmKey(doctorCrm, doctorUf);
    const crmKey = norm?.crm ?? null;
    const uf = norm?.uf ?? null;

    // encontra o médico pelo CRM, ou cria se vier nome + CRM
    let doctor = crmKey ? await prisma.doctor.findUnique({ where: { crm: crmKey } }) : null;
    if (!doctor && doctorName && crmKey) {
      doctor = await prisma.doctor.create({
        data: { name: String(doctorName), crm: crmKey, crmUf: uf, specialty: doctorSpecialty || null, email: (doctorEmail || `pending-${Date.now()}@invite.com`).toLowerCase(), passwordHash: 'pending-invite' },
      }).catch(() => null);
    }
    if (!doctor) { res.status(404).json({ error: 'Médico não encontrado. Informe nome + CRM pra cadastrá-lo.' }); return; }

    // share (upsert — se já existe, reativa)
    const existing = await prisma.doctorShare.findUnique({ where: { patientId_doctorId: { patientId: pid, doctorId: doctor.id } } });
    if (existing) {
      const updated = await prisma.doctorShare.update({ where: { id: existing.id }, data: { active: true, scopes: scopes || existing.scopes, convenio: convenio != null ? String(convenio) : existing.convenio, revokedAt: null } });
      res.json({ share: updated, doctor }); return;
    }
    // Custo de compartilhar = soma dos escopos selecionados (parametrizado em app_settings).
    // Só cobra na CRIAÇÃO nova (reativar existente / editar escopos = grátis, sem fricção).
    const selectedScopes: string[] = Array.isArray(scopes) && scopes.length ? scopes : ['exams'];
    const shareCost = selectedScopes.reduce((sum: number, k: string) => sum + ((getSettings().shares as Record<string, number>)[k] ?? 0), 0);
    if (shareCost > 0) {
      const me = await prisma.user.findUnique({ where: { id: req.userId! }, select: { credits: true } });
      if ((me?.credits ?? 0) < shareCost) { res.status(402).json({ error: 'insufficient_credits', message: `Compartilhar custa ${shareCost} créditos.` }); return; }
      if (!(await chargeCredits(req.userId!, shareCost, 'share', 'Compartilhamento com médico'))) { res.status(402).json({ error: 'insufficient_credits', message: 'Saldo insuficiente.' }); return; }
    }
    const share = await prisma.doctorShare.create({ data: { patientId: pid, doctorId: doctor.id, scopes: selectedScopes, convenio: convenio ? String(convenio) : null, creditsCharged: shareCost } });

    // notifica o médico por e-mail
    if (doctor.email && !doctor.email.includes('@invite.com')) {
      const patient = await prisma.patient.findUnique({ where: { id: pid }, select: { fullName: true } });
      try {
        await sendEmail({
          to: doctor.email,
          subject: `${patient?.fullName ?? 'Paciente'} compartilhou dados com você — Meus Exames`,
          html: `<div style="font-family:Segoe UI,Arial,sans-serif;color:#15233b;max-width:480px;margin:auto">
            <h2 style="color:#178f89">🩺 Novo compartilhamento</h2>
            <p>O paciente <strong>${patient?.fullName}</strong> compartilhou dados de saúde com você.</p>
            <p>Escopo: <strong>${(scopes || ['exams']).join(', ')}</strong>${convenio ? `<br>Convênio: ${convenio}` : ''}</p>
            <p>Acesse o <a href="https://janocaminho.com.br/minhasaude/#/doctor" style="color:#20b2aa;font-weight:700">Portal do Médico</a> para visualizar.</p>
            <p style="font-size:12px;color:#999;margin-top:20px">Meus Exames — Análise educativa, não substitui o médico.</p></div>`,
        });
      } catch (e: any) { console.error('[doctor-share] falha email:', e?.message); }
    }
    res.status(201).json({ share, doctor, chargedCredits: shareCost });
  } catch (e) { next(e); }
});

// ATUALIZAR / REVOGAR compartilhamento
router.patch('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const share = await prisma.doctorShare.findUnique({ where: { id: String(req.params.id) } });
    if (!share || !pids.includes(share.patientId)) { res.status(404).json({ error: 'Compartilhamento não encontrado.' }); return; }
    const { scopes, active } = req.body ?? {};
    const updated = await prisma.doctorShare.update({
      where: { id: share.id },
      data: { scopes: scopes ?? undefined, active: active ?? undefined, revokedAt: active === false ? new Date() : undefined },
    });
    res.json({ share: updated });
  } catch (e) { next(e); }
});

// EXCLUIR compartilhamento (diferente de revogar: REMOVE o registro em vez de só desativar).
// Se o médico for pending-invite (cadastro errado, nunca claimado/registrou) e não tiver outros
// shares, exclui o médico também → limpa o diretório de entradas erradas. Médico CLAIMADO (conta
// real) nunca é excluído aqui — só o share deste paciente.
router.delete('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const share = await prisma.doctorShare.findUnique({ where: { id: String(req.params.id) } });
    if (!share || !pids.includes(share.patientId)) { res.status(404).json({ error: 'Compartilhamento não encontrado.' }); return; }
    const doctorId = share.doctorId;
    await prisma.doctorShare.delete({ where: { id: share.id } });
    // cleanup: médico pending-invite sem outros shares → remove (era só um cadastro de compartilhamento)
    const doctor = await prisma.doctor.findUnique({ where: { id: doctorId }, select: { passwordHash: true } });
    if (doctor?.passwordHash === 'pending-invite') {
      const remaining = await prisma.doctorShare.count({ where: { doctorId } });
      if (remaining === 0) await prisma.doctor.delete({ where: { id: doctorId } }).catch(() => {});
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
