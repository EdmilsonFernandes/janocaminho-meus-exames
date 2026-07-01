import type { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction): void {
  const status = err?.status ?? err?.statusCode ?? 500;
  const message = status >= 500 && config.isProd ? 'Erro interno do servidor' : (err?.message ?? 'Erro interno do servidor');
  if (status >= 500) console.error('[server] erro 500:', err);
  res.status(status).json({ error: message });
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Rota não encontrada' });
}
