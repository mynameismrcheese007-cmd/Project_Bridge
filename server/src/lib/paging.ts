import { z } from 'zod';
import { HttpError } from './errors.js';

/** Rows per page on every Admin list. */
export const PAGE_SIZE = 20;

export const pageNumber = z.coerce.number().int().min(1).max(1000).default(1);
export const pageQuery = z.object({ page: pageNumber });

/** Reads a list's query string, answering 400 for a bad page number or filter. */
export function parseQuery<T extends z.ZodTypeAny>(schema: T, query: unknown, message = 'Invalid page number.'): z.infer<T> {
  const parsed = schema.safeParse(query);
  if (!parsed.success) throw new HttpError(400, 'VALIDATION_ERROR', message);
  return parsed.data;
}

/** skip and take for a page: one row more than the page holds, so `toPage` can tell whether more follow. */
export const pageWindow = (page: number) => ({ skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE + 1 });

/** Cuts the extra row off and says whether there is another page. */
export function toPage<T, V>(rows: T[], page: number, view: (row: T) => V) {
  return { page, items: rows.slice(0, PAGE_SIZE).map(view), hasMore: rows.length > PAGE_SIZE };
}
