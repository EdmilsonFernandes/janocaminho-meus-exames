import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { doctorMayPractice } from '../utils/doctorAccess';

// ── ENCONTRAR ESPECIALISTAS (28/10/26, spec §3/§4) ────────────────────────────────
// Busca no DIRETÓRIO PRÓPRIO — 100% desenvolvimento nosso (decisão do dono 28/10/26:
// NENHUMA integração paga, nenhum scraping). Fontes do diretório:
//   - médicos CLAIMADOS (conta no portal QUE PODE ATUAR — doctorMayPractice) → dados publicados por eles = "confirmado"
//   - conta real ainda NÃO verificada (pendente/recusada/legado vencido) → "cadastro do médico em verificação": sem selo
//     do portal e sem subir no ranking (revisão final do KYC, I7 — os dados são auto-declarados)
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

/** Cidade sem acento/case ("São José dos Campos" ↔ "sao jose") — comparação de proximidade
 *  textual da V1 (diretório pequeno; coluna normalizada quando escalar). */
const deaccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

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
    if (withPrice) where.consultPriceCents = { not: null };
    // Cidade NÃO entra no where: comparação é pós-query com deaccent (ILIKE não tira
    // acento e unaccent pode não estar instalado) — com folga de 300 rows quando filtra.

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

    // cityNorm: deaccent + strip do sufixo " (UF)" (o combo IBGE manda "Nome (SP)").
    const cityNorm = city ? deaccent(city.replace(/\s*\([A-Za-z]{2}\)\s*$/, '').trim()) : null;
    const [doctorsRaw, cityFacetRows] = await Promise.all([
      prisma.doctor.findMany({
        where,
        take: cityNorm ? 300 : take, // folga p/ compensar o filtro de cidade em JS
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, crm: true, crmUf: true, specialty: true, photoUrl: true,
          phone: true, clinicName: true, clinicCity: true, bio: true, consultPriceCents: true,
          createdAt: true, passwordHash: true, blocked: true, verificationStatus: true,
          insurances: { orderBy: [{ verificationStatus: 'asc' }, { operator: 'asc' }] },
        },
      }),
      // Facets de cidade (do diretório inteiro, não do filtro): o usuário vê ONDE tem
      // médico antes de digitar — contra a frustação de buscar cidade sem resultado.
      // Une CNES (directory) + doctors — só a coluna cidade (barato).
      prisma.directoryFacility.findMany({ select: { city: true }, take: 80000 })
        .then(async (dirRows) => {
          const docRows = await prisma.doctor.findMany({ where: { blocked: false, clinicCity: { not: null } }, select: { clinicCity: true } });
          return [...dirRows.map((r) => ({ clinicCity: r.city })), ...docRows];
        }),
    ]);

    const cities = Object.entries(
      cityFacetRows.reduce<Record<string, number>>((acc, d) => {
        const c = (d.clinicCity ?? '').trim();
        if (c) acc[c] = (acc[c] ?? 0) + 1;
        return acc;
      }, {}),
    )
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, 'pt-BR'))
      .slice(0, 8);

    const doctors = cityNorm
      ? doctorsRaw.filter((d) => d.clinicCity && deaccent(d.clinicCity).includes(cityNorm))
      : doctorsRaw;

    const now = new Date();
    const items = doctors
      // blocked/verificationStatus servem só p/ decidir `claimed` — NUNCA saem na resposta (o paciente não vê o KYC do médico).
      .map(({ passwordHash, insurances, blocked, verificationStatus, ...d }) => {
        const realAccount = passwordHash !== 'pending-invite'; // placeholder de paciente não tem senha
        // "Reivindicado" = conta real QUE PODE ATUAR (revisão final I7). Conta com senha mas pendente/recusada/legado
        // vencido tem nome/telefone/bio auto-declarados: não é "perfil publicado do médico" e não sobe no ranking.
        const claimed = realAccount && doctorMayPractice({ blocked, verificationStatus }, now);
        return {
          ...d,
          claimed,
          // Provenance (§3 "fonte e data"): o que existe no diretório é publicado pelo
          // médico (portal), cadastro do médico ainda em verificação ou informado por pacientes. Sem inventar dado ausente.
          provenance: claimed
            ? { source: 'portal_do_medico', label: 'Dados publicados pelo médico no Dr. Exame', updatedAt: d.createdAt }
            : realAccount
              ? { source: 'cadastro_em_verificacao', label: 'Cadastro do próprio médico, ainda em verificação de identidade — confirme os dados com o consultório', updatedAt: d.createdAt }
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

    // ── CNES/DATASUS (V1.3, 28/10/26): catálogo oficial de DESCOBERTA — entra DEPOIS
    // dos internos (dado confirmado > dado oficial bruto > crowdsourced). Filtros que
    // só existem no produto (convênio/preço/portal) excluem o bloco CNES. Tabela é
    // opcional no deploy (import por região) — ausência nunca quebra a busca.
    let cnesItems: any[] = [];
    let cnesMore = false;
    try {
      const hasCnes = await prisma.directoryFacility.findFirst({ select: { id: true } }).then((r) => !!r).catch(() => false);
      if (hasCnes && !operator && !withPrice && !claimedOnly) {
        // Filtro de cidade: comparação pós-query com deaccent (Postgres ILIKE não
        // remove acentos sem unaccent) — compatível com acentos nos testes e em produção.
        const facs = await prisma.directoryFacility.findMany({
          select: { id: true, cnesCode: true, name: true, city: true, uf: true, address: true, district: true, phone: true, lat: true, lng: true },
          take: 20000,
        });
        const facsIn = cityNorm
          ? facs.filter((f) => f.city && deaccent(f.city).includes(cityNorm))
          : facs;
        const facById = new Map(facsIn.map((f) => [f.id, f]));
        if (facsIn.length) {
          let profs = await prisma.directoryProfessional.findMany({
            where: {
              facilityId: { in: [...facById.keys()] },
              ...(text ? { name: { contains: text, mode: 'insensitive' } } : {}),
            },
            take: 400,
          });
          if (specialty) {
            const s = deaccent(specialty);
            profs = profs.filter((p) => p.cboName && deaccent(p.cboName).includes(s));
          }
          cnesMore = profs.length >= 400;
          cnesItems = profs.slice(0, 15).map((p) => {
            const f = facById.get(p.facilityId)!;
            // tbConselhoClasse: '10' = CR MEDICINA → o vínculo traz o nº do CRM + UF.
            const isCrm = String(p.councilType ?? '').padStart(2, '0') === '10';
            return {
              origin: 'cnes',
              id: p.id,
              name: p.name,
              specialty: p.cboName,
              cboCode: p.cboCode,
              crm: isCrm ? p.councilReg : null,
              crmUf: isCrm ? p.councilUf : null,
              clinicName: f.name,
              clinicCity: `${f.city} - ${f.uf}`,
              address: [f.address, f.district].filter(Boolean).join(' · ') || null,
              phone: f.phone,
              lat: f.lat,
              lng: f.lng,
              provenance: {
                source: 'cnes_datasus',
                label: 'CNES/DATASUS — base oficial do Ministério da Saúde',
                updatedAt: p.importedAt,
              },
            };
          });
        }
      }
    } catch (e: any) {
      console.error('[specialists] bloco CNES falhou (segue só interno):', e?.message);
    }

    const internal = filtered.slice(0, take);
    const allEmpty = internal.length === 0 && cnesItems.length === 0;

    res.json({
      items: [...internal, ...cnesItems],
      total: filtered.length,
      cities,
      cityNote: cityNorm && allEmpty
        ? 'Nenhum médico com esta cidade no diretório. Tente sem cidade — ou cadastre seu médico com a cidade dele pra ajudar o próximo paciente.'
        : null,
      cnesCount: cnesItems.length,
      cnesMore,
    });
  } catch (e) { next(e); }
});

export default router;
