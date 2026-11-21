// Cartão de emergência com QR público (estudo Guava 21/11 — gap #3).
// Fluxo: paciente gera um token opaco (POST /api/emergency/token) → o QR do
// cartão impresso aponta para /#/emergencia/<token> → um socorrista SEM login
// lê os dados essenciais via GET /api/public/emergency/:token.
//
// SEGURANÇA (mesma filosofia do share /api/public/shared/:token):
//   - token = 24 bytes aleatórios (crypto), unguessable; NULL até o paciente
//     pedir o cartão (rota pública responde 404 silencioso p/ token inexistente);
//   - payload MÍNIMO: nome, idade, gênero, alergias, condições, remédios ATIVOS.
//     NADA de CPF (nem cifrado), e-mail, endereço, exames ou laudos;
//   - rate-limit no mount (app.ts) — brute-force de token não escala;
//   - revogável a qualquer momento (DELETE do token invalida o QR impresso).
import { Router } from 'express';
import crypto from 'crypto';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';

// ── Router AUTENTICADO (dono do perfil) ──
export const emergencyRouter = Router();
emergencyRouter.use(requireAuth);

// Gera (ou devolve o existente) token do cartão público do paciente selecionado.
emergencyRouter.post('/token', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const { patientId } = req.body ?? {};
    const pid = patientId && pids.includes(patientId) ? patientId : pids[0];
    if (!pid) { res.status(400).json({ error: 'Nenhum paciente vinculado.' }); return; }
    const patient = await prisma.patient.findUnique({ where: { id: pid }, select: { emergencyToken: true } });
    if (patient?.emergencyToken) { res.json({ token: patient.emergencyToken }); return; }
    const token = crypto.randomBytes(24).toString('hex');
    await prisma.patient.update({ where: { id: pid }, data: { emergencyToken: token } });
    res.status(201).json({ token });
  } catch (e) { next(e); }
});

// Revoga o QR impresso (o cartão antigo para de funcionar imediatamente).
emergencyRouter.delete('/token', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const q = req.query as Record<string, string | undefined>;
    const pid = q.patientId && pids.includes(q.patientId) ? q.patientId : pids[0];
    if (!pid) { res.status(400).json({ error: 'Nenhum paciente vinculado.' }); return; }
    await prisma.patient.updateMany({ where: { id: pid }, data: { emergencyToken: null } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── Router PÚBLICO (socorrista, sem login — rate-limit no mount do app.ts) ──
export const emergencyPublicRouter = Router();

emergencyPublicRouter.get('/:token', async (req, res, next) => {
  try {
    const token = String(req.params.token ?? '');
    // Formato esperado: 48 hex — rejeita barato antes de tocar o banco
    if (!/^[0-9a-f]{48}$/.test(token)) { res.status(404).json({ error: 'Cartão inexistente.' }); return; }
    const patient = await prisma.patient.findUnique({
      where: { emergencyToken: token },
      select: {
        id: true, fullName: true, gender: true, dateOfBirth: true, allergies: true,
        clinicalProfile: true,
      },
    });
    if (!patient) { res.status(404).json({ error: 'Cartão inexistente.' }); return; }
    const meds = await prisma.medication.findMany({
      where: { patientId: patient.id, active: true },
      select: { name: true, dosage: true },
      take: 30,
    });
    const age = patient.dateOfBirth
      ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 86400000))
      : null;
    res.json({
      name: patient.fullName,
      age,
      gender: patient.gender ?? null,
      allergies: patient.allergies?.trim() || null,
      conditions: patient.clinicalProfile?.trim() || null,
      medications: meds.map((m) => ({ name: m.name, dosage: m.dosage ?? null })),
      generatedAt: new Date().toISOString(),
    });
  } catch (e) { next(e); }
});
