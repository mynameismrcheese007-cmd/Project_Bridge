import { Prisma, PrismaClient } from '@prisma/client';

/**
 * The Supabase pooler closes connections that sit idle, and the server only finds out when a query
 * on a dead connection gets no answer. With long timeouts that wait added up to about 90 seconds on
 * the first request after a quiet spell (three read attempts plus the wait for a free connection).
 * A short socket timeout gives up on a dead connection after a few seconds, the read is retried on a
 * fresh one, and keepConnectionsAlive() stops connections going idle in the first place.
 * Opening a connection can still be slow on a bad network, so the connect timeout stays generous.
 * Writes are never retried, so nothing happens twice. Any of these already in the URL are kept.
 */
export const URL_DEFAULTS: Record<string, string> = { socket_timeout: '6', connect_timeout: '30', pool_timeout: '15' };
const READ_ATTEMPTS = 3;
const RETRYABLE = new Set(['P1001', 'P1008', 'P1017', 'P2024']);
const READS = new Set(['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy']);

export function withTimeouts(url: string | undefined): string | undefined {
  if (!url) return url;
  const extra = Object.entries(URL_DEFAULTS).filter(([key]) => !url.includes(`${key}=`));
  if (!extra.length) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${extra.map(([key, value]) => `${key}=${value}`).join('&')}`;
}

/** How many connections Prisma keeps open: the URL's connection_limit, or 1 when it is missing or invalid. */
export function connectionLimit(url: string | undefined): number {
  const limit = Number(url?.match(/[?&]connection_limit=(\d+)/)?.[1]);
  return Number.isInteger(limit) && limit > 0 ? limit : 1;
}

const retryable = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && RETRYABLE.has(err.code);

// The cast keeps the plain client type, so transaction clients stay Prisma.TransactionClient everywhere.
export const prisma = new PrismaClient({ datasourceUrl: withTimeouts(process.env.DATABASE_URL) }).$extends({
  query: {
    async $allOperations({ operation, args, query }) {
      if (!READS.has(operation)) return query(args);
      for (let attempt = 1; ; attempt++) {
        try {
          return await query(args);
        } catch (err) {
          if (!retryable(err) || attempt >= READ_ATTEMPTS) throw err;
        }
      }
    },
  },
}) as unknown as PrismaClient;

// Prisma's interactive defaults (2s to get a connection, 5s to finish) are too tight for the remote database.
export const TX_OPTIONS = { maxWait: 15_000, timeout: 20_000 };

const KEEP_ALIVE_MS = 3 * 60_000;

/**
 * Runs one SELECT 1 per pooled connection every few minutes, all at once so each uses its own
 * connection, so none sits idle long enough for the pooler to close it. A failed ping only drops
 * that connection; the next ping or request opens a new one. Called by the API server, not tests.
 */
export function keepConnectionsAlive(): () => void {
  const count = connectionLimit(process.env.DATABASE_URL);
  const timer = setInterval(() => {
    for (let i = 0; i < count; i++) prisma.$queryRaw`SELECT 1`.catch(() => {});
  }, KEEP_ALIVE_MS);
  timer.unref();
  return () => clearInterval(timer);
}
