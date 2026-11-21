import { config } from '../config.js';
import { prisma } from './prisma.js';

const CLEANUP_MS = 60 * 60_000;

/**
 * Deletes rows nobody can use any more, so the tables stop growing without limit: sign-ins past
 * their expiry, guest sessions older than the guest cookie (every cookieless visitor, bots included,
 * creates one), expired email links and sign-ups whose link expired unused. A guest's card budget is never reset early, because only
 * sessions whose cookie has already expired are removed.
 */
export async function deleteStaleSessions(now = new Date()) {
  const [sessions, guestSessions, emailTokens, pendingRegistrations] = await Promise.all([
    prisma.session.deleteMany({ where: { expiresAt: { lte: now } } }),
    prisma.guestSession.deleteMany({ where: { createdAt: { lte: new Date(now.getTime() - config.guestSessionTtlMs) } } }),
    prisma.emailToken.deleteMany({ where: { expiresAt: { lte: now } } }),
    prisma.pendingRegistration.deleteMany({ where: { expiresAt: { lte: now } } }),
  ]);
  return { sessions: sessions.count, guestSessions: guestSessions.count, emailTokens: emailTokens.count, pendingRegistrations: pendingRegistrations.count };
}

/** Runs the cleanup once at start-up and then every hour. Called by the API server, not tests. */
export function scheduleCleanup(): () => void {
  const run = () => void deleteStaleSessions().catch((error) => console.error(`Session cleanup failed: ${(error as Error).message}`));
  run();
  const timer = setInterval(run, CLEANUP_MS);
  timer.unref();
  return () => clearInterval(timer);
}
