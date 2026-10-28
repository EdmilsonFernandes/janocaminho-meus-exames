import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest } from '../middleware/auth';

// ── ENCONTRAR ESPECIALISTAS (28/10/26, spec §3/§4) ────────────────────────────────
// Busca no DIRETÓRIO PRÓPRIO — 100% desenvolvimento nosso (decisão do dono 28/10/26:
// NENHUMA integração paga, nenhum scraping). Fontes do diretório:
//   - médicos CLAIMADOS (conta no portal) → dados publicados por eles = "confirmado"
//   - médicos PENDING (cadastrados por pacientes via CRM) = "informado por pacientes"
// Provenance SEMPRE visível por item; ausência de convênio ≠ não aceita (§5):
// quando não há informação, o front mostra "não informado — confirme com o consultório".
//
// Extensão futura (estrutura pronta): se um dia houver provedor externo PERMITIDO e
// GRÁTIS, esta rota chama uma camada provider e mescla resultados com provenance —
// os filtros/contrato de resposta já são agnósticos de origem.

const router = Router();
router.use(requireAuth);

const INS_VERIFICATION_LABEL: Record<string, string> = {
  confirmed: 'Confirmado pelo médico/clínica',
  external: 'Informado em fonte externa',
  patient_reported: 'Informado por paciente — sem confirmação independente',
};

router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const text = (q.q ?? '').trim();
    const specialty = (q.specialty ?? '').trim();
    const city = (q.city ?? '').trim();
    const operator = (q.operator ?? '').trim();
    const plan = (q.plan ?? '').trim();
    const withPrice = q.withPrice === 'true';   // particular: preço publicado
    const claimedOnly = q.claimedOnly === 'true'; // teleconsulta: médico com portal ativo
    const take = Math.min(Number(q.take ?? 20) || 20, 30);

    const where: any = { blocked: false };
    if (text) {
      where.OR = [
        { name: { contains: text, mode: 'insensitive' } },
        { clinicName: { contains: text, mode: 'insensitive' } },
      ];
    }
    if (specialty) where.specialty = { equals: specialty, mode: 'insensitive' };
    if (city) where.clinicCity = { contains: city, mode: 'insensitive' };
    if (withPrice) where.consultPriceCents = { not: null };

    // Convênio: filtra por aceitação REGISTRADA (médico+operadora[+plano]). Ausente no
    // filtro = todos (o paciente entende que a lista não cobre o universo médico).
    if (operator) {
      const ins = await prisma.doctorInsurance.findMany({
        where: {
          operator: { equals: operator, mode: 'insensitive' },
          ...(plan ? { plan: { equals: plan, mode: 'insensitive' } } : {}),
        },
        select: { doctorId: true },
      });
      where.id = { in: [...new Set(ins.map((i) => i.doctorId))] };
    }

    const [total, doctors] = await Promise.all([
      prisma.doctor.count({ where }),
      prisma.doctor.findMany({
        where,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, crm: true, crmUf: true, specialty: true, photoUrl: true,
          phone: true, clinicName: true, clinicCity: true, bio: true, consultPriceCents: true,
          createdAt: true, passwordHash: true,
          insurances: { orderBy: [{ verificationStatus: 'asc' }, { operator: 'asc' }] },
        },
      }),
    ]);

    const items = doctors
      .map(({ passwordHash, insurances, ...d }) => {
        const claimed = passwordHash !== 'pending-invite';
        return {
          ...d,
          claimed,
          // Provenance (§3 "fonte e data"): o que existe no diretório é publicado pelo
          // médico (portal) ou informado por pacientes. Sem inventar dado ausente.
          provenance: claimed
            ? { source: 'portal_do_medico', label: 'Dados publicados pelo médico no Dr. Exame', updatedAt: d.createdAt }
            : { source: 'cadastro_pacientes', label: 'Cadastro feito por pacientes (CRM informado) — confirme os dados com o consultório', updatedAt: d.createdAt },
          insurances: insurances.map((i) => ({
            operator: i.operator,
            plan: i.plan,
            verificationStatus: i.verificationStatus,
            verificationLabel: INS_VERIFICATION_LABEL[i.verificationStatus] ?? i.verificationStatus,
            verifiedAt: i.verifiedAt,
          })),
        };
      })
      // Claimed primeiro (dados melhores), depois alfabético — sem preço de "relevância".
      .sort((a, b) => (a.claimed === b.claimed ? a.name.localeCompare(b.name, 'pt-BR') : a.claimed ? -1 : 1));

    // claimedOnly aplicado pós-query p/ manter o count total honesto do filtro bruto.
    const filtered = claimedOnly ? items.filter((i) => i.claimed) : items;

    res.json({ items: filtered, total: claimedOnly ? filtered.length : total });
  } catch (e) { next(e); }
});

export default router;
