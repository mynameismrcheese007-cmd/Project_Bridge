/**
 * Old sign-ins, guest sessions, email links and unconfirmed sign-ups are deleted on a schedule,
 * without signing anyone out early or giving a guest a fresh card budget.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { config } from '../src/config.js';
import { deleteStaleSessions } from '../src/lib/cleanup.js';
import { hashToken, randomToken } from '../src/lib/tokens.js';
import { app, createProject, createUser, prisma, request, resetDb, signedInAgent } from './helpers.js';

beforeEach(resetDb);

const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms);
const fromNow = (ms: number) => new Date(Date.now() + ms);

describe('Session cleanup', () => {
  it('deletes expired sign-ins and keeps live ones, which still work', async () => {
    const user = await createUser();
    const agent = await signedInAgent(user.email);
    const expired = await prisma.session.create({ data: { userId: user.id, tokenHash: hashToken(randomToken()), expiresAt: ago(HOUR) } });

    const result = await deleteStaleSessions();

    expect(result.sessions).toBe(1);
    expect(await prisma.session.findUnique({ where: { id: expired.id } })).toBeNull();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
    expect((await agent.get('/api/auth/me')).status).toBe(200);
  });

  it('deletes guest sessions only once their cookie has expired', async () => {
    const stale = await prisma.guestSession.create({ data: { tokenHash: hashToken(randomToken()), createdAt: ago(config.guestSessionTtlMs + HOUR) } });
    const recent = await prisma.guestSession.create({ data: { tokenHash: hashToken(randomToken()), createdAt: ago(config.guestSessionTtlMs - HOUR) } });

    const result = await deleteStaleSessions();

    expect(result.guestSessions).toBe(1);
    expect(await prisma.guestSession.findUnique({ where: { id: stale.id } })).toBeNull();
    expect(await prisma.guestSession.findUnique({ where: { id: recent.id } })).not.toBeNull();
  });

  it('never resets a guest’s card budget while their cookie lives', async () => {
    const owner = await createUser();
    await createProject(owner.id);
    const guest = request.agent(app);
    const first = await guest.get('/api/projects/feed');
    expect(first.body.guest.cardsServed).toBe(1);

    // Idle for weeks, but still inside the cookie's lifetime.
    await prisma.guestSession.updateMany({ data: { createdAt: ago(config.guestSessionTtlMs - HOUR), lastSeenAt: ago(config.guestSessionTtlMs - HOUR) } });
    await deleteStaleSessions();

    expect(await prisma.guestSession.count()).toBe(1);
    const again = await guest.get('/api/projects/feed');
    expect(again.body.guest.cardsServed).toBe(1);
  });

  it('deletes expired email links and keeps ones that can still be used', async () => {
    const user = await createUser();
    await prisma.emailToken.createMany({
      data: [
        { userId: user.id, type: 'RESET', tokenHash: hashToken(randomToken()), expiresAt: ago(HOUR) },
        { userId: user.id, type: 'RESET', tokenHash: hashToken(randomToken()), expiresAt: fromNow(HOUR) },
      ],
    });

    const result = await deleteStaleSessions();

    expect(result.emailTokens).toBe(1);
    expect(await prisma.emailToken.count({ where: { userId: user.id } })).toBe(1);
  });

  it('deletes sign-ups whose link expired unused, and keeps ones still waiting', async () => {
    const pending = (email: string, expiresAt: Date) => ({ email, name: 'Someone', passwordHash: 'x', tokenHash: hashToken(randomToken()), expiresAt });
    await prisma.pendingRegistration.createMany({ data: [pending('old@example.com', ago(HOUR)), pending('new@example.com', fromNow(HOUR))] });

    const result = await deleteStaleSessions();

    expect(result.pendingRegistrations).toBe(1);
    expect((await prisma.pendingRegistration.findMany()).map((p) => p.email)).toEqual(['new@example.com']);
  });

  it('does nothing when there is nothing stale', async () => {
    expect(await deleteStaleSessions()).toEqual({ sessions: 0, guestSessions: 0, emailTokens: 0, pendingRegistrations: 0 });
  });
});
