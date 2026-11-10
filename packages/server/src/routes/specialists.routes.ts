import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { doctorMayPractice, practiceStatuses } from '../utils/doctorAccess';

// ── ENCONTRAR ESPECIALISTAS (28/10/26, spec §3/§4) ────────────────────────────────
// Busca no DIRETÓRIO PRÓPRIO — 100% desenvolvimento nosso (decisão do dono 28/10/26:
// NENHUMA integração paga, nenhum scraping). Fontes do diretório:
//   - médicos CLAIMADOS (conta no portal QUE PODE ATUAR — doctorMayPractice) → dados publicados por eles = "confirmado"
//   - conta real ainda NÃO verificada (pendente / em revisão / legado vencido) → só campos NEUTROS (nome, CRM/UF,
//     especialidade), rótulo "Cadastro ainda não verificado", sem subir no ranking; `rejected` nem aparece (revisão
//     final do KYC, I7 e 2ª rodada — os dados são texto livre de quem registrou o CRM)
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

/** FACET DE CIDADES em cache (perf 02/11): a rota puxava ~80k linhas do CNES
 *  (directoryFacility) + reduce em JS a CADA busca — dado que muda a cada meses.
 *  Cache module-level TTL 6h: a 1ª request após expiry paga o custo, as demais
 *  servem da memória. Erro no refresh → mantém o cache velho (degrada sem quebrar). */
const CITY_FACET_TTL_MS = 6 * 60 * 60 * 1000;
let cityFacetCache: { at: number; rows: { clinicCity: string | null }[] } | null = null;
async function getCityFacetRows(selfDeclaredOk: any): Promise<{ clinicCity: string | null }[]> {
  if (cityFacetCache && Date.now() - cityFacetCache.at < CITY_FACET_TTL_MS) return cityFacetCache.rows;
  try {
    const [dirRows, docRows] = await Promise.all([
      prisma.directoryFacility.findMany({ select: { city: true }, take: 80000 }),
      prisma.doctor.findMany({ where: { blocked: false, clinicCity: { not: null }, ...selfDeclaredOk }, select: { clinicCity: true } }),
    ]);
    const rows = [...dirRows.map((r) => ({ clinicCity: r.city })), ...docRows];
    cityFacetCache = { at: Date.now(), rows };
    return rows;
  } catch {
    return cityFacetCache?.rows ?? []; // sem cache ainda e DB falhou → facet vazio (lista segue)
  }
}

/** Testes: o cache module-level sobrevive entre requests do MESMO processo (vitest
 *  roda vários cenários com bancos diferentes) — beforeEach zera pra não vazar facet. */
export const __resetCityFacetCache = (): void => { cityFacetCache = null; };

// PERF (dono 10/11: "melhorar a performance do especialista"): o bloco CNES carregava
// até 20k unidades completas do Postgres em TODA busca. Cache em memória por 6h — a
// base muda apenas nos imports mensais (mesma premissa do cache de facets de cidade).
type FacRow = { id: string; cnesCode: string | null; name: string; city: string | null; uf: string | null; address: string | null; district: string | null; phone: string | null; lat: string | null; lng: string | null; cityNorm: string };
let facCache: { at: number; rows: FacRow[] } | null = null;
const FAC_CACHE_MS = 6 * 3600_000;
async function loadFacilitiesCached(): Promise<FacRow[]> {
  if (facCache && Date.now() - facCache.at < FAC_CACHE_MS) return facCache.rows;
  const rows = await prisma.directoryFacility.findMany({
    select: { id: true, cnesCode: true, name: true, city: true, uf: true, address: true, district: true, phone: true, lat: true, lng: true },
    take: 20000,
  });
  const out = { at: Date.now(), rows: rows.map((f) => ({ ...f, cityNorm: deaccent(f.city ?? '') })) };
  facCache = out;
  return out.rows;
}

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
    // PAGINAÇÃO (dono 10/11: "aparece 2.000 e traz só 10 — cadê o resto?"): a lista é
    // amostra paginada (internos take + CNES 15/página); `page` 0-based, `hasMore` diz
    // se tem próxima. `total` continua sendo o universo do filtro (contagem honesta).
    const page = Math.max(0, Number(q.page ?? 0) || 0);

    const now = new Date();
    // Quem pode exibir dado AUTO-DECLARADO (telefone, clínica, cidade, preço, convênios): placeholder de paciente (não tem
    // conta) ou conta que ATUA. Conta real que não atua (pendente, em revisão, legado vencido) só sai com o neutro —
    // nome/CRM/UF/especialidade — e por isso também NÃO casa busca por clínica, cidade, preço ou convênio (2ª rodada,
    // Important #6: no caso de squatting, "Dra. Alice" aparecia com o WhatsApp de quem registrou o CRM dela).
    const selfDeclaredOk = { OR: [{ passwordHash: 'pending-invite' }, { verificationStatus: { in: practiceStatuses(now) } }] };

    // `rejected` (KYC recusado) nem entra no diretório.
    const where: any = { blocked: false, verificationStatus: { not: 'rejected' }, AND: [] as any[] };
    if (text) {
      where.OR = [
        { name: { contains: text, mode: 'insensitive' } },
        { AND: [{ clinicName: { contains: text, mode: 'insensitive' } }, selfDeclaredOk] }, // clínica só vale p/ quem pode exibi-la
      ];
    }
    if (specialty) where.specialty = { equals: specialty, mode: 'insensitive' };
    if (withPrice) { where.consultPriceCents = { not: null }; where.AND.push(selfDeclaredOk); }
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
      where.AND.push(selfDeclaredOk);
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
      // Une CNES (directory) + doctors — via CACHE 6h (ver getCityFacetRows: era 80k
      // rows no Postgres a cada busca, dado que muda a cada meses).
      getCityFacetRows(selfDeclaredOk),
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

    const mapped = doctorsRaw
      // blocked/verificationStatus servem só p/ decidir `claimed` — NUNCA saem na resposta (o paciente não vê o KYC do médico).
      .map(({ passwordHash, insurances, blocked, verificationStatus, ...d }) => {
        const realAccount = passwordHash !== 'pending-invite'; // placeholder de paciente não tem senha
        // "Reivindicado" = conta real QUE PODE ATUAR (revisão final I7). Conta com senha mas pendente/em revisão/legado
        // vencido é auto-declarada: não é "perfil publicado do médico" e não sobe no ranking.
        const claimed = realAccount && doctorMayPractice({ blocked, verificationStatus }, now);
        const unverified = realAccount && !claimed;
        // Conta real que NÃO atua: só campos NEUTROS (nome, CRM/UF, especialidade). Telefone/WhatsApp, bio, foto, preço,
        // clínica/cidade e convênios são texto livre de quem registrou o CRM — canal de phishing se saírem aqui.
        const shown = unverified ? { ...d, photoUrl: null, phone: null, clinicName: null, clinicCity: null, bio: null, consultPriceCents: null } : d;
        return {
          ...shown,
          claimed,
          // Provenance (§3 "fonte e data"): o que existe no diretório é publicado pelo médico (portal), informado por
          // pacientes ou cadastro ainda NÃO verificado (rótulo que não afirma autoria). Sem inventar dado ausente.
          provenance: claimed
            ? { source: 'portal_do_medico', label: 'Dados publicados pelo médico no Dr. Exame', updatedAt: d.createdAt }
            : unverified
              ? { source: 'cadastro_nao_verificado', label: 'Cadastro ainda não verificado — confirme os dados com o consultório', updatedAt: d.createdAt }
              : { source: 'cadastro_pacientes', label: 'Cadastro feito por pacientes (CRM informado) — confirme os dados com o consultório', updatedAt: d.createdAt },
          insurances: unverified ? [] : insurances.map((i) => ({
            operator: i.operator,
            plan: i.plan,
            verificationStatus: i.verificationStatus,
            verificationLabel: INS_VERIFICATION_LABEL[i.verificationStatus] ?? i.verificationStatus,
            verifiedAt: i.verifiedAt,
          })),
        };
      });

    // Filtro de cidade DEPOIS de neutralizar (conta não verificada não tem cidade p/ casar).
    const items = (cityNorm
      ? mapped.filter((d) => d.clinicCity && deaccent(d.clinicCity).includes(cityNorm))
      : mapped
    )
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
    let cnesTotalSample = 0;
    try {
      const hasCnes = await prisma.directoryFacility.findFirst({ select: { id: true } }).then((r) => !!r).catch(() => false);
      if (hasCnes && !operator && !withPrice && !claimedOnly) {
        // PERF (dono 10/11): carregar até 20k unidades COMPLETAS do Postgres em TODA
        // busca era o gargalo da tela. Cache em memória 6h (mesmo padrão do
        // getCityFacetRows — a base muda só em import mensal) + cityNorm pré-computado.
        const facs = await loadFacilitiesCached();
        const facsIn = cityNorm
          ? facs.filter((f) => f.cityNorm.includes(cityNorm))
          : facs;
        const facById = new Map(facsIn.map((f) => [f.id, f]));
        if (facsIn.length) {
          // IN gigante (20k ids) derruba o planner: quando a lista segue grande, o
          // filtro de facility é redundante (~todas) — consulta sem ele e casa depois.
          const useFacilityFilter = facsIn.length <= 2000;
          let profs = await prisma.directoryProfessional.findMany({
            where: {
              ...(useFacilityFilter ? { facilityId: { in: [...facById.keys()] } } : {}),
              // SÓ MÉDICOS (dono 02/11): sem isto a busca trazia técnico de enfermagem
              // (203k!), enfermeiro, assistente administrativo etc. CNES grava o CBO em
              // CAIXA ALTA SEM ACENTO ("MEDICO CLINICO"); cargas podem vir acentuadas —
              // o OR cobre as duas grafias (gotcha normalizeKey/acentos do projeto).
              ...(specialty ? {} : { OR: [
                { cboName: { startsWith: 'medico', mode: 'insensitive' } },
                { cboName: { startsWith: 'médico', mode: 'insensitive' } },
              ] }),
              ...(text ? { name: { contains: text, mode: 'insensitive' } } : {}),
            },
            take: 400,
          });
          if (specialty) {
            const s = deaccent(specialty);
            profs = profs.filter((p) => p.cboName && deaccent(p.cboName).includes(s));
          }
          cnesMore = profs.length >= 400;
          cnesTotalSample = profs.length;
          cnesItems = profs.slice(page * 15, page * 15 + 15).map((p) => {
            const f = facById.get(p.facilityId);
            if (!f) return null; // sem filtro de facility (lista grande): prof de unidade fora do cache — pula
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
          }).filter(Boolean);
        }
      }
    } catch (e: any) {
      console.error('[specialists] bloco CNES falhou (segue só interno):', e?.message);
    }

    const internal = filtered.slice(page * take, page * take + take);
    const allEmpty = internal.length === 0 && cnesItems.length === 0;
    const hasMore = (page + 1) * take < filtered.length || cnesItems.length > 0 && (page + 1) * 15 < cnesTotalSample;

    res.json({
      items: [...internal, ...cnesItems],
      total: filtered.length,
      cities,
      cityNote: cityNorm && allEmpty
        ? 'Nenhum médico com esta cidade no diretório. Tente sem cidade — ou cadastre seu médico com a cidade dele pra ajudar o próximo paciente.'
        : null,
      cnesCount: cnesItems.length,
      cnesMore,
      page,
      hasMore,
    });
  } catch (e) { next(e); }
});

export default router;
