import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { normalizeCrmKey } from './doctor.routes';
import { shareState } from '../utils/share-status';

// ── MEUS MÉDICOS (28/10/26, spec §1) ──────────────────────────────────────────────
// Vínculo PRIVADO paciente↔médico (PatientDoctorLink). CONTRATO:
//  - Salvar NÃO concede acesso a exames — acesso é SEMPRE o DoctorShare (ato separado,
//    cobrado e revogável). A resposta do GET carrega os dois lados p/ o front montar.
//  - Notas do paciente vivem no vínculo — nunca no catálogo público (Doctor).
//  - Remover o vínculo NÃO exclui o cadastro público NEM revoga share (avisa o front).
//  - Shares criados ANTES da feature (sem link) entram como itens "órfãos" — a lista
//    do paciente continua completa numa chamada só.
//  - Isolamento: userPatientIds (família multi-paciente) em TODA rota.

const router = Router();
router.use(requireAuth);

// Campos públicos do médico no contexto paciente. passwordHash NUNCA sai — vira `claimed`
// (true = conta real no portal → dados publicados pelo próprio médico).
const DOCTOR_SELECT = {
  id: true, name: true, crm: true, crmUf: true, specialty: true, photoUrl: true,
  phone: true, clinicName: true, clinicCity: true, bio: true, consultPriceCents: true,
  blocked: true, passwordHash: true,
} as const;

function serializeDoctor(d: { passwordHash: string } & Record<string, unknown>) {
  const { passwordHash, ...rest } = d;
  return { ...rest, claimed: passwordHash !== 'pending-invite' };
}

function serializeShare(s: { id: string; scopes: string[]; examIds: string[]; convenio: string | null; active: boolean; expiresAt: Date | null; revokedAt: Date | null }) {
  return {
    id: s.id,
    scopes: s.scopes,
    examIds: s.examIds,
    convenio: s.convenio,
    expiresAt: s.expiresAt,
    revokedAt: s.revokedAt,
    state: shareState(s), // active | expired | revoked — §1 "compartilhamentos ativos, expirados e revogados"
  };
}

// LISTAR — vínculos + shares órfãos + contagem de consultas + convênios informados
router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    if (!pids.length) { res.json({ items: [] }); return; }

    const [links, shares, consultRows] = await Promise.all([
      prisma.patientDoctorLink.findMany({
        where: { patientId: { in: pids } },
        include: { doctor: { select: DOCTOR_SELECT } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.doctorShare.findMany({ where: { patientId: { in: pids } } }),
      prisma.patientConsultation.groupBy({
        by: ['doctorId'],
        where: { patientId: { in: pids }, doctorId: { not: null } },
        _count: { _all: true },
      }),
    ]);

    const doctorIds = [...new Set(links.map((l) => l.doctorId))];
    const insurances = doctorIds.length
      ? await prisma.doctorInsurance.findMany({ where: { doctorId: { in: doctorIds } }, orderBy: { operator: 'asc' } })
      : [];
    const insByDoctor = new Map<string, typeof insurances>();
    for (const i of insurances) {
      const arr = insByDoctor.get(i.doctorId) ?? [];
      arr.push(i);
      insByDoctor.set(i.doctorId, arr);
    }

    const shareByKey = new Map(shares.map((s) => [`${s.patientId}|${s.doctorId}`, s]));
    const consultsByDoctor = new Map(consultRows.map((r) => [r.doctorId, r._count._all]));

    const items: any[] = links.map((l) => ({
      id: l.id,
      patientId: l.patientId,
      source: l.source,
      sourceInfo: l.sourceInfo,
      patientNotes: l.patientNotes,
      createdAt: l.createdAt,
      linked: true,
      doctor: serializeDoctor(l.doctor as any),
      share: shareByKey.has(`${l.patientId}|${l.doctorId}`)
        ? serializeShare(shareByKey.get(`${l.patientId}|${l.doctorId}`)!)
        : null, // §1: "Adicionar não concede acesso" — null = médico salvo SEM compartilhamento
      consultationCount: consultsByDoctor.get(l.doctorId) ?? 0,
      insurances: insByDoctor.get(l.doctorId) ?? [],
    }));

    // Órfãos: share sem vínculo (criado antes da feature) — entra como médico com acesso.
    const linkedKeys = new Set(links.map((l) => `${l.patientId}|${l.doctorId}`));
    const orphanShares = shares.filter((s) => !linkedKeys.has(`${s.patientId}|${s.doctorId}`));
    if (orphanShares.length) {
      const orphanDoctors = await prisma.doctor.findMany({
        where: { id: { in: orphanShares.map((s) => s.doctorId) } },
        select: DOCTOR_SELECT,
      });
      const docById = new Map(orphanDoctors.map((d) => [d.id, d]));
      for (const s of orphanShares) {
        const d = docById.get(s.doctorId);
        if (!d) continue;
        items.push({
          id: null,
          patientId: s.patientId,
          source: 'share',
          sourceInfo: null,
          patientNotes: null,
          createdAt: s.createdAt,
          linked: false,
          doctor: serializeDoctor(d as any),
          share: serializeShare(s),
          consultationCount: consultsByDoctor.get(s.doctorId) ?? 0,
          insurances: insByDoctor.get(s.doctorId) ?? [],
        });
      }
    }

    res.json({ items });
  } catch (e) { next(e); }
});

// SALVAR — por doctorId (resultado da busca no diretório) ou CRM+nome (cadastro manual,
// dedupe §5 prioriza CRM/UF; cria pending-invite igual doctor-share POST — sem cobrar).
router.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const { patientId, doctorId, doctorCrm, doctorUf, doctorName, doctorSpecialty, source } = req.body ?? {};
    const pid = patientId && pids.includes(patientId) ? patientId : pids[0];
    if (!pid) { res.status(400).json({ error: 'Nenhum paciente vinculado.' }); return; }

    let doctor: { id: string } | null = null;
    if (doctorId) {
      doctor = await prisma.doctor.findUnique({ where: { id: String(doctorId) }, select: { id: true, blocked: true } });
      if (!doctor || (doctor as any).blocked) { res.status(404).json({ error: 'Médico não encontrado ou indisponível.' }); return; }
    } else {
      const norm = normalizeCrmKey(doctorCrm, doctorUf);
      if (!norm?.crm || !String(doctorName ?? '').trim()) {
        res.status(400).json({ error: 'Informe CRM+UF e nome, ou salve direto de um resultado da busca.' });
        return;
      }
      doctor = await prisma.doctor.findUnique({ where: { crm: norm.crm }, select: { id: true } });
      if (!doctor) {
        doctor = await prisma.doctor.create({
          data: {
            name: String(doctorName).trim().slice(0, 120),
            crm: norm.crm,
            crmUf: norm.uf,
            specialty: doctorSpecialty ? String(doctorSpecialty).slice(0, 60) : null,
            email: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@invite.com`,
            passwordHash: 'pending-invite',
          },
          select: { id: true },
        });
      }
    }

    // Idempotente: salvar 2× o mesmo médico = mesmo vínculo (unique patientId+doctorId).
    const existing = await prisma.patientDoctorLink.findUnique({
      where: { patientId_doctorId: { patientId: pid, doctorId: doctor.id } },
    });
    if (existing) { res.json({ item: existing, created: false }); return; }

    const src = typeof source === 'string' && source.length <= 20 ? source : 'manual';
    const item = await prisma.patientDoctorLink.create({
      data: { patientId: pid, doctorId: doctor.id, source: src },
    });
    res.status(201).json({ item, created: true });
  } catch (e) { next(e); }
});

// EDITAR — anotações particulares do paciente (§1). Só o dono do vínculo.
router.patch('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const link = await prisma.patientDoctorLink.findUnique({ where: { id: String(req.params.id) } });
    if (!link || !pids.includes(link.patientId)) { res.status(404).json({ error: 'Médico não encontrado na sua lista.' }); return; }
    const notes = req.body?.patientNotes;
    const item = await prisma.patientDoctorLink.update({
      where: { id: link.id },
      data: { patientNotes: typeof notes === 'string' ? (notes.trim() ? notes.trim().slice(0, 2000) : null) : undefined },
    });
    res.json({ item });
  } catch (e) { next(e); }
});

// REMOVER VÍNCULO — não toca no cadastro público nem no share (§1). A resposta diz se
// o share segue ATIVO p/ o front oferecer a revogação como passo separado.
router.delete('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const link = await prisma.patientDoctorLink.findUnique({ where: { id: String(req.params.id) } });
    if (!link || !pids.includes(link.patientId)) { res.status(404).json({ error: 'Médico não encontrado na sua lista.' }); return; }
    const share = await prisma.doctorShare.findUnique({
      where: { patientId_doctorId: { patientId: link.patientId, doctorId: link.doctorId } },
    });
    await prisma.patientDoctorLink.delete({ where: { id: link.id } });
    res.json({ ok: true, shareStillActive: !!share && shareState(share) === 'active', shareId: share?.id ?? null });
  } catch (e) { next(e); }
});

export default router;
