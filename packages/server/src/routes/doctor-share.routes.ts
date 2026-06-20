import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { sendEmail } from '../utils/mailer';

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
    const { doctorCrm, doctorName, doctorSpecialty, doctorEmail, scopes, convenio, patientId } = req.body ?? {};
    const pids = await userPatientIds(req.userId!);
    const pid = patientId && pids.includes(patientId) ? patientId : pids[0];
    if (!pid) { res.status(400).json({ error: 'Nenhum paciente vinculado.' }); return; }

    // encontra o médico pelo CRM, ou cria se vier nome + CRM
    let doctor = doctorCrm ? await prisma.doctor.findUnique({ where: { crm: String(doctorCrm) } }) : null;
    if (!doctor && doctorName && doctorCrm) {
      doctor = await prisma.doctor.create({
        data: { name: String(doctorName), crm: String(doctorCrm), specialty: doctorSpecialty || null, email: (doctorEmail || `pending-${Date.now()}@invite.com`).toLowerCase(), passwordHash: 'pending-invite' },
      }).catch(() => null);
    }
    if (!doctor) { res.status(404).json({ error: 'Médico não encontrado. Informe nome + CRM pra cadastrá-lo.' }); return; }

    // share (upsert — se já existe, reativa)
    const existing = await prisma.doctorShare.findUnique({ where: { patientId_doctorId: { patientId: pid, doctorId: doctor.id } } });
    if (existing) {
      const updated = await prisma.doctorShare.update({ where: { id: existing.id }, data: { active: true, scopes: scopes || existing.scopes, convenio: convenio != null ? String(convenio) : existing.convenio, revokedAt: null } });
      res.json({ share: updated, doctor }); return;
    }
    const share = await prisma.doctorShare.create({ data: { patientId: pid, doctorId: doctor.id, scopes: scopes || ['exams'], convenio: convenio ? String(convenio) : null } });

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
    res.status(201).json({ share, doctor });
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

export default router;
