import { prisma } from '../prisma';
import { parseAudienceFilter, dispatchCampaign } from '../utils/pushAudience';

/**
 * Scheduler de CAMPANHAS AGENDADAS de push (tick a cada 5 min).
 * PushCampaign com scheduledAt no passado e sentAt null → dispara via dispatchCampaign
 * (mesmo caminho do envio imediato do admin: audiência resolvida NA HORA do envio,
 * merge fields frescos, Notification in-app + FCM por usuário).
 */
const TICK_MS = 5 * 60 * 1000;

export function startPushCampaignScheduler(): void {
  const tick = async () => {
    try {
      const due = await prisma.pushCampaign.findMany({
        where: { scheduledAt: { lte: new Date() }, sentAt: null },
        take: 10,
      });
      for (const c of due) {
        const filter = parseAudienceFilter(c.audienceFilter);
        if (!Object.keys(filter).length) {
          // campanha agendada sem público válido → marca enviada SEM disparar (defesa;
          // "todos" continua sendo exclusivo do /push/global deliberado)
          await prisma.pushCampaign.update({ where: { id: c.id }, data: { sentAt: new Date() } }).catch(() => {});
          continue;
        }
        const { sent } = await dispatchCampaign({ title: c.title, body: c.body, route: c.route ?? undefined, filter });
        await prisma.pushCampaign.update({ where: { id: c.id }, data: { sentAt: new Date(), sentCount: sent } }).catch(() => {});
        console.log(`[pushCampaigns] agendada enviada: "${c.title}" → ${sent} usuário(s)`);
      }
    } catch (e) {
      console.error('[pushCampaigns] tick error:', (e as Error).message);
    }
  };
  setInterval(() => { void tick(); }, TICK_MS);
  void tick();
  console.log('[pushCampaigns] scheduler de campanhas agendadas iniciado (5 min)');
}
