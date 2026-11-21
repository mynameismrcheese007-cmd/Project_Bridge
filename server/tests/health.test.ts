/**
 * The health check reports the database, and the API stops cleanly when the host asks it to.
 * The shutdown tests use stand-ins for the server and database, so nothing real is closed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { databaseReachable } from '../src/lib/prisma.js';
import { createShutdown } from '../src/lib/shutdown.js';
import { app, prisma, request } from './helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('GET /api/health', () => {
  it('answers 200 when the database answers', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, database: 'up' });
  });

  it('answers 503 when the database is unreachable, without the error text', async () => {
    vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error("Can't reach database server at db.internal:5432"));
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, database: 'down' });
  });

  it('gives up on a database that does not answer in time', async () => {
    vi.spyOn(prisma, '$queryRaw').mockReturnValueOnce(new Promise(() => {}) as never);
    const started = Date.now();
    expect(await databaseReachable(200)).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

function parts(overrides: { close?: (done: () => void) => void } = {}) {
  const calls: string[] = [];
  return {
    calls,
    server: { close: vi.fn((done: () => void) => (overrides.close ?? ((cb) => cb()))(() => { calls.push('server closed'); done(); })) } as never,
    stops: [() => calls.push('keep-alive stopped'), () => calls.push('cleanup stopped')],
    disconnect: vi.fn(async () => {
      calls.push('database closed');
    }),
    exit: vi.fn((code: number) => {
      calls.push(`exit ${code}`);
    }),
    log: () => undefined,
  };
}

describe('Clean shutdown', () => {
  it('stops the timers, waits for open requests, closes the database, then exits 0', async () => {
    const p = parts();
    await createShutdown(p)('SIGTERM');
    expect(p.calls).toEqual(['keep-alive stopped', 'cleanup stopped', 'server closed', 'database closed', 'exit 0']);
  });

  it('runs once, even when a second signal arrives', async () => {
    const p = parts();
    const shutdown = createShutdown(p);
    await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);
    expect(p.disconnect).toHaveBeenCalledTimes(1);
    expect(p.exit).toHaveBeenCalledTimes(1);
  });

  it('exits 1 when open requests are still running after the wait', async () => {
    vi.useFakeTimers();
    const p = parts({ close: () => {} });
    void createShutdown({ ...p, timeoutMs: 1000 })('SIGTERM');
    await vi.advanceTimersByTimeAsync(1000);
    expect(p.exit).toHaveBeenCalledWith(1);
    expect(p.disconnect).not.toHaveBeenCalled();
  });

  it('still exits 0 when closing the database fails', async () => {
    const p = parts();
    p.disconnect.mockRejectedValueOnce(new Error('already closed'));
    await createShutdown(p)('SIGINT');
    expect(p.exit).toHaveBeenCalledWith(0);
  });
});
