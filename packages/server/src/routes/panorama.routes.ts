/**
 * GET /api/patients/:id/panorama — fatos da saúde do paciente por área, para a tela `/relatorio`.
 * Contrato: packages/shared/src/panorama.ts. Cálculo: analysis/panorama.ts.
 *
 * - Mesma autenticação e a mesma checagem de posse dos outros endpoints do paciente
 *   (/patients/:id/health-summary): paciente que não é do usuário → 403.
 * - Determinístico, grátis: não chama IA nem cobra crédito.
 * - Grátis e barato NÃO é a mesma coisa: a montagem toca ~20 consultas → cache em memória de
 *   5 min por paciente (analysis/hs-cache.ts), invalidado por quem já invalida o health-summary.
 *   A posse é conferida ANTES de ler o cache; o corpo guardado já é o JSON final.
 * - Uma área que falha volta `unavailable`; a resposta só é 500 se a montagem inteira falhar.
 */
import { Router } from 'express';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { getCachedPanorama } from '../analysis/hs-cache';
import { buildPanorama, hasUnavailableArea } from '../analysis/panorama';

const router = Router();
router.use(requireAuth);

router.get('/:id/panorama', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const id = String(req.params.id);
    if (!pids.includes(id)) { res.status(403).json({ error: 'Paciente não pertence ao usuário' }); return; }
    const body = await getCachedPanorama(id, async () => {
      const panorama = await buildPanorama(id);
      // Área que falhou não fica 5 min como "indisponível": essa resposta não entra no cache.
      return { body: JSON.stringify(panorama), cacheable: !hasUnavailableArea(panorama) };
    });
    res.type('json').send(body);
  } catch (e) { next(e); }
});

export default router;
