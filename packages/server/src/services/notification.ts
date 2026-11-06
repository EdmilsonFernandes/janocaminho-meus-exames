import { sendEmail } from '../utils/mailer';
import { prisma } from '../prisma';

/**
 * NotificationService — email de monitoramento pro DONO do produto.
 * Cada método = UMA ação de negócio (não por tela). Fire-and-forget:
 * nunca bloqueia a rota principal nem derruba o request se o SMTP falhar.
 *
 * Uso: NotificationService.examExtracted({...}) — sem await.
 */

const OWNER_EMAIL = process.env.OWNER_NOTIFY_EMAIL || 'edmls2008@gmail.com';

const template = (title: string, color: string, rows: [string, string][]) => `
<div style="font-family:Inter,system-ui,sans-serif;max-width:420px;margin:0 auto;padding:20px;border-left:4px solid ${color};background:#fafafa;border-radius:8px">
  <h3 style="margin:0 0 12px;color:${color};font-size:15px">${title}</h3>
  ${rows.map(([k, v]) => `<div style="display:flex;gap:8px;margin:4px 0"><span style="color:#64748b;font-size:12px;min-width:80px">${k}:</span><span style="color:#1e293b;font-size:12px;font-weight:600">${v}</span></div>`).join('')}
  <p style="color:#94a3b8;font-size:10px;margin:12px 0 0">Dr. Exame · monitoramento automático</p>
</div>`;

const fire = (subject: string, html: string) => {
  sendEmail({ to: OWNER_EMAIL, subject, html }).catch(() => {});
  // catch vazio: notificação NUNCA derruba a rota
};

async function userName(userId: string | null | undefined): Promise<string> {
  if (!userId) return '—';
  try {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    return u ? `${u.name ?? u.email}` : userId.slice(-8);
  } catch { return userId.slice(-8); }
}

export const NotificationService = {
  /** Exame extraído com sucesso */
  examExtracted: async (opts: { userId?: string; patientName?: string; examTitle: string; itemCount: number }) => {
    const name = await userName(opts.userId);
    fire('✅ Exame extraído',
      template('✅ Exame extraído com sucesso', '#10b981', [
        ['Usuário', name],
        ['Paciente', opts.patientName ?? '—'],
        ['Exame', opts.examTitle],
        ['Itens', String(opts.itemCount)],
      ]));
  },

  /** Exame falhou na extração */
  examFailed: async (opts: { userId?: string; patientName?: string; examTitle: string; reason: string }) => {
    const name = await userName(opts.userId);
    fire('❌ Exame falhou',
      template('❌ Exame falhou na extração', '#ef4444', [
        ['Usuário', name],
        ['Paciente', opts.patientName ?? '—'],
        ['Exame', opts.examTitle],
        ['Motivo', opts.reason.slice(0, 200)],
      ]));
  },

  /** Tentativa de pagamento (sucesso ou falha) */
  paymentAttempted: async (opts: { userId?: string; amountBrl: number; method: string; status: 'approved' | 'pending' | 'failed' | 'refunded' }) => {
    const name = await userName(opts.userId);
    const icons: Record<string, string> = { approved: '✅', pending: '⏳', failed: '❌', refunded: '↩️' };
    fire(`${icons[opts.status] ?? '💳'} Pagamento ${opts.status}`,
      template(`Pagamento ${opts.status}`, opts.status === 'approved' ? '#10b981' : opts.status === 'failed' ? '#ef4444' : '#f59e0b', [
        ['Usuário', name],
        ['Valor', `R$ ${opts.amountBrl.toFixed(2).replace('.', ',')}`],
        ['Método', opts.method],
        ['Status', opts.status],
      ]));
  },

  /** Novo usuário criou conta */
  newUser: async (opts: { userId: string; email: string; name?: string }) => {
    fire('👤 Novo usuário',
      template('Novo usuário no Dr. Exame', '#20b2aa', [
        ['Nome', opts.name ?? '—'],
        ['Email', opts.email],
      ]));
  },
};
