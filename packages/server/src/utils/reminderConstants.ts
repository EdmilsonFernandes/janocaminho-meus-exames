/** Fonte ÚNICA dos valores válidos de lembrete (lote "estilo Teams" 18/10/26).
 *  Antes haviam 4 cópias (reminder.routes, doctor.routes, reminderEmails, web) que
 *  precisavam ser sincronizadas na mão — review 18/10 pescou o risco. Rotas e jobs
 *  importam daqui; o web mantém a sua (labels/ícones por motivo de UI). */
export const REMINDER_TYPES = ['exame', 'consulta', 'medicamento', 'teleconsulta'] as const;
export const REMINDER_RECURRENCES = ['diario', 'semanal', 'mensal', 'semestral', 'anual'] as const;
export type ReminderRecurrence = (typeof REMINDER_RECURRENCES)[number];
