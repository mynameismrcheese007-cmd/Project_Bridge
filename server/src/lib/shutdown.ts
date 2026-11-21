import type { Server } from 'node:http';

interface ShutdownParts {
  server: Pick<Server, 'close'>;
  /** Stops the background timers (keep-alive pings, cleanup). */
  stops: Array<() => void>;
  disconnect: () => Promise<void>;
  exit: (code: number) => void;
  /** Requests still running after this long are cut off, so a stuck one cannot block a restart. */
  timeoutMs?: number;
  log?: (message: string) => void;
}

/**
 * Builds the handler for SIGTERM and SIGINT: stop taking requests, let the running ones finish,
 * stop the timers, close the database connections, then exit. A second signal does nothing more.
 */
export function createShutdown({ server, stops, disconnect, exit, timeoutMs = 10_000, log = console.log }: ShutdownParts) {
  let started = false;
  return async (signal: string): Promise<void> => {
    if (started) return;
    started = true;
    log(`${signal} received: finishing open requests, then stopping the API.`);
    const force = setTimeout(() => {
      log('Requests still open after the wait; stopping anyway.');
      exit(1);
    }, timeoutMs);
    force.unref?.();
    for (const stop of stops) stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnect().catch(() => undefined);
    clearTimeout(force);
    exit(0);
  };
}
