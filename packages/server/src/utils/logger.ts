// Logger técnico do Meus Exames — níveis configuráveis via LOG_LEVEL/LOG_ENABLED.
// Sem dependência externa (wrapper sobre console). Saída em stdout/stderr (Docker captura).
// Auditoria de LOGIN/ACESSO (LGPD) é separada (utils/audit.ts → tabela audit_logs) e
// NÃO respeita estas chaves — sempre grava. Aqui é só o log de debug/erro do servidor.
import { config } from '../config';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<LogLevel, number> = { trace: 0, debug: 1, info: 2, warn: 3, error: 4 };
const VALID: ReadonlySet<string> = new Set(['trace', 'debug', 'info', 'warn', 'error']);

const configuredRaw = String(config.logLevel ?? 'info').toLowerCase();
export const configuredLevel: LogLevel = VALID.has(configuredRaw) ? (configuredRaw as LogLevel) : 'info';

/** Nível habilitado considerando o kill-switch LOG_ENABLED + LOG_LEVEL. */
export function shouldLog(level: LogLevel): boolean {
  if (!config.logEnabled) return false;
  return ORDER[level] >= ORDER[configuredLevel];
}

function fmt(level: LogLevel, scope: string, msg: string, meta?: unknown): string {
  const ts = new Date().toISOString();
  const head = `${ts} [${level.toUpperCase()}]${scope ? ` [${scope}]` : ''} ${msg}`;
  if (meta === undefined || meta === null) return head;
  try { return `${head} ${JSON.stringify(meta)}`; } catch { return `${head} [meta não-serializável]`; }
}

function write(level: LogLevel, scope: string, msg: string, meta?: unknown): void {
  if (!shouldLog(level)) return;
  const line = fmt(level, scope, msg, meta);
  // error/warn → stderr (padrão de log); demais → stdout.
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

/** Logger raiz (sem escopo). Prefira createLogger('escopo') nos módulos. */
export const logger = {
  trace: (msg: string, meta?: unknown) => write('trace', '', msg, meta),
  debug: (msg: string, meta?: unknown) => write('debug', '', msg, meta),
  info: (msg: string, meta?: unknown) => write('info', '', msg, meta),
  warn: (msg: string, meta?: unknown) => write('warn', '', msg, meta),
  error: (msg: string, meta?: unknown) => write('error', '', msg, meta),
};

/** Cria um logger com escopo fixo (ex.: const log = createLogger('auth'); log.info('...')). */
export function createLogger(scope: string) {
  return {
    trace: (msg: string, meta?: unknown) => write('trace', scope, msg, meta),
    debug: (msg: string, meta?: unknown) => write('debug', scope, msg, meta),
    info: (msg: string, meta?: unknown) => write('info', scope, msg, meta),
    warn: (msg: string, meta?: unknown) => write('warn', scope, msg, meta),
    error: (msg: string, meta?: unknown) => write('error', scope, msg, meta),
  };
}
