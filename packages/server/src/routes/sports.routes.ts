import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds, firstPatientId } from '../middleware/auth';
import { sportsModeEnabled } from '../utils/settings';
import { doctorWithCrm } from '../utils/doctorTitle';

/**
 * SAÚDE ESPORTIVA (E1) — perfil DECLARADO pelo paciente (opt-in, 1:1 com o titular).
 * O que o paciente declara aqui é CONTEXTO para a interpretação dos exames — nunca
 * normaliza risco nem suprime alerta (isAbnormal/healthNudges seguem intocados).
 *
 * Gate: GET responde sempre (perfil null quando nunca declarado); PUT exige a flag
 * global ligada (AppSetting sportsMode.enabled) — kill-switch admin sem deploy.
 */

const router = Router();
router.use(requireAuth);

// Limites de validação (payload enxuto — é contexto, não prontuário).
const LIMITS = { modality: 60, trainingFreq: 30, goals: 300, jsonItems: 20 } as const;

/** String opcional: trim + limite + '' → null (limpa o campo).
 *  undefined = campo não enviado (não mexe); null explícito no JSON = limpa. */
const optStr = (v: unknown, max: number): string | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (s.length > max) throw new Error(`FIELD_TOO_LONG:${max}`);
  return s;
};

/** Jsonb opcional: aceita array (≤20 itens, itens string/objeto pequenos) ou null.
 *  Objeto avulso também passa (contexto de coleta é um objeto) — só validar tamanho.
 *  null explícito no JSON → DbNull (limpa a coluna). */
const optJson = (v: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined => {
  if (v === undefined) return undefined;
  if (v === null) return Prisma.DbNull;
  if (Array.isArray(v)) {
    if (v.length > LIMITS.jsonItems) throw new Error(`JSON_TOO_MANY_ITEMS:${LIMITS.jsonItems}`);
    return v.map((it) => (typeof it === 'string' ? it.trim().slice(0, 120) : it)) as Prisma.InputJsonValue;
  }
  if (typeof v === 'object') return v as Prisma.InputJsonObject; // collectionContext etc.
  if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 300);
  return Prisma.DbNull; // '', false, etc. → limpa
};

// PERFIL do paciente TITULAR (null quando nunca declarado — resposta leve).
router.get('/profile', async (req: AuthedRequest, res, next) => {
  try {
    const pid = await firstPatientId(req.userId!);
    if (!pid) { res.status(400).json({ error: 'Nenhum paciente vinculado.' }); return; }
    const profile = await prisma.sportsProfile.findUnique({ where: { patientId: pid } });
    res.json({ profile, enabled: sportsModeEnabled() });
  } catch (e) { next(e); }
});

// METAS CLÍNICAS do(s) paciente(s) do user (E2.3 — camada 2, RELATORIO §4).
// Paciente LÊ, NUNCA escreve (criação/expiração é exclusiva do portal médico). Só metas
// VIGENTES (validTo null ou futuro), com autoria visível ("Dr. Nome (CRM)") + justificativa
// + fonte. A meta NUNCA altera isAbnormal/flag/healthNudges — o front desenha banda/chip
// SEPARADOS da régua do laboratório (camada 1 permanece sempre visível).
router.get('/clinical-goals', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    if (!pids.length) { res.json({ goals: [] }); return; }
    const goals = await prisma.clinicalGoal.findMany({
      where: { patientId: { in: pids }, OR: [{ validTo: null }, { validTo: { gt: new Date() } }] },
      include: { setByDoctor: { select: { name: true, crm: true } } },
      orderBy: { validFrom: 'desc' },
    });
    res.json({
      goals: goals.map((g) => ({
        id: g.id,
        patientId: g.patientId,
        analyte: g.analyte,
        unit: g.unit,
        targetLow: g.targetLow,
        targetHigh: g.targetHigh,
        setBy: doctorWithCrm(g.setByDoctor.name, g.setByDoctor.crm),
        justification: g.justification,
        source: g.source,
        validFrom: g.validFrom,
      })),
    });
  } catch (e) { next(e); }
});

// UPSERT do perfil (cria vazio quando o toggle liga no front). Default = TITULAR;
// patientId explícito só vale se for do próprio user (padrão das rotas de exames).
router.put('/profile', async (req: AuthedRequest, res, next) => {
  try {
    if (!sportsModeEnabled()) {
      res.status(403).json({ error: 'sports_mode_disabled', message: 'Saúde Esportiva está desativada no momento.' });
      return;
    }
    const pids = await userPatientIds(req.userId!);
    const pid = await firstPatientId(req.userId!);
    if (!pid) { res.status(400).json({ error: 'Nenhum paciente vinculado.' }); return; }
    const wanted = req.body?.patientId ? String(req.body.patientId) : pid;
    if (wanted !== pid && !pids.includes(wanted)) {
      res.status(403).json({ error: 'Sem permissão para este paciente.' });
      return;
    }

    const b = req.body ?? {};
    try {
      const data: Record<string, unknown> = {
        modality: optStr(b.modality, LIMITS.modality),
        trainingFreq: optStr(b.trainingFreq, LIMITS.trainingFreq),
        goals: optStr(b.goals, LIMITS.goals),
        supplements: optJson(b.supplements),
        collectionContext: optJson(b.collectionContext),
        declaredSubstances: optJson(b.declaredSubstances),
      };
      // Toggle do paciente persistido no SERVIDOR (coerência com contexto IA/dashboard)
      if (b.active !== undefined) data.active = Boolean(b.active);
      const profile = await prisma.sportsProfile.upsert({
        where: { patientId: wanted },
        update: data,
        create: { patientId: wanted, ...data },
      });
      res.json({ profile });
    } catch (ve: any) {
      if (String(ve?.message).startsWith('FIELD_TOO_LONG:')) {
        res.status(400).json({ error: `Campo longo demais (máx. ${String(ve.message).split(':')[1]} caracteres).` });
        return;
      }
      if (String(ve?.message).startsWith('JSON_TOO_MANY_ITEMS:')) {
        res.status(400).json({ error: `Lista longa demais (máx. ${String(ve.message).split(':')[1]} itens).` });
        return;
      }
      throw ve;
    }
  } catch (e) { next(e); }
});

export default router;
