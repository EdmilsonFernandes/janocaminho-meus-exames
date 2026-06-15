import type { Request, Response } from 'express';

export interface ListParams {
  start: number;
  end: number;
  take: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

/** Lê paginação/ordem no formato do react-admin (suporta tanto query `_start/_end` quanto header `Range`). */
export function parseListParams(req: Request): ListParams {
  const q = req.query as Record<string, string | undefined>;
  let start = q._start != null ? Number(q._start) : NaN;
  let end = q._end != null ? Number(q._end) : NaN;

  if (Number.isNaN(start) || Number.isNaN(end)) {
    const range = req.headers['range'];
    if (typeof range === 'string' && range.includes('=')) {
      const [a, b] = range.split('=')[1].split('-');
      start = Number(a);
      end = Number(b) + 1; // Range é inclusivo-inclusivo; _end é exclusivo
    } else {
      start = 0;
      end = 25;
    }
  }

  const sort = q._sort ? String(q._sort) : undefined;
  let order: 'asc' | 'desc' | undefined;
  if (q._order) order = String(q._order).toUpperCase() === 'ASC' ? 'asc' : 'desc';

  return { start, end, take: Math.max(0, end - start), sort, order };
}

/** Define os headers que o react-admin lê: `Content-Range` e `X-Total-Count`. */
export function setListHeaders(res: Response, start: number, end: number, total: number): void {
  const last = total > 0 ? Math.min(end - 1, total - 1) : 0;
  res.setHeader('Content-Range', `items ${start}-${last}/${total}`);
  res.setHeader('X-Total-Count', String(total));
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, X-Total-Count');
}

/** Filtro padrão de busca (campo `q` = busca livre no título). */
export function buildTextFilter(q: string | undefined, field = 'title') {
  if (!q) return undefined;
  return { [field]: { contains: q, mode: 'insensitive' as const } };
}
