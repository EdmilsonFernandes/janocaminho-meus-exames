/**
 * Lembrete que já passou não vira aviso (27/11/26, visto no Android): a notificação do lembrete é
 * escrita no momento do envio ("Faltam 5 horas — consulta hoje mais tarde") e o app a mostrava
 * como aviso automático até 7 dias depois, com o texto congelado — "faltam 5 horas" para um
 * compromisso de anteontem.
 *
 * Quando o compromisso foi: `data.dueAt` (notificações novas) ou, nas antigas, hora do envio +
 * antecedência (`data.offset`, em minutos). Passou de 1 hora depois dele, o lembrete não abre
 * sozinho (continua no sino, como histórico).
 */
const GRACE_MS = 60 * 60 * 1000;

export function reminderIsPast(n: { type?: string; createdAt?: string; data?: { type?: string; offset?: string | number; dueAt?: string } | null }, now = Date.now()): boolean {
  const kind = n.type ?? n.data?.type;
  if (kind !== 'reminder') return false;
  const due = n.data?.dueAt ? new Date(n.data.dueAt).getTime() : NaN;
  if (Number.isFinite(due)) return now > due + GRACE_MS;
  const created = n.createdAt ? new Date(n.createdAt).getTime() : NaN;
  const offsetMin = Number(n.data?.offset);
  if (!Number.isFinite(created) || !Number.isFinite(offsetMin)) return false;
  return now > created + offsetMin * 60_000 + GRACE_MS;
}
