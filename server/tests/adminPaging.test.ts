/**
 * Every Admin list loads at most one page (20 rows) at a time, with `hasMore` saying whether another
 * page follows, so the queues stay fast as data grows and every item stays reachable.
 */
import type { Agent } from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { PAGE_SIZE } from '../src/lib/paging.js';
import { COMPLETE_PROJECT, createProject, createUser, prisma, resetDb, signedInAgent } from './helpers.js';

beforeEach(resetDb);

const TOTAL = PAGE_SIZE + 1;
type Page = { page: number; items: Array<{ id: string }>; hasMore: boolean };

async function adminAgent() {
  const admin = await createUser({ role: 'ADMIN' });
  return signedInAgent(admin.email);
}

/** Walks every page of a list and checks the 20 + 1 split, the empty page after it, and a stable order. */
async function expectPaged(agent: Agent, url: string, ids: string[], param = 'page', pick = (body: unknown) => body as Page) {
  const get = async (n: number) => {
    const res = await agent.get(`${url}${url.includes('?') ? '&' : '?'}${param}=${n}`);
    expect(res.status).toBe(200);
    return pick(res.body);
  };
  const first = await get(1);
  expect(first).toMatchObject({ page: 1, hasMore: true });
  expect(first.items).toHaveLength(PAGE_SIZE);
  // Rows sharing a timestamp still come back in the same order every time.
  expect((await get(1)).items.map((i) => i.id)).toEqual(first.items.map((i) => i.id));

  const second = await get(2);
  expect(second).toMatchObject({ page: 2, hasMore: false });
  expect(second.items).toHaveLength(1);

  const seen = [...first.items, ...second.items].map((i) => i.id);
  expect(new Set(seen).size).toBe(TOTAL);
  expect([...seen].sort()).toEqual([...ids].sort());
  expect((await get(3)).items).toEqual([]);
}

// A revision carries the content fields only; the stage is not revised.
const { stage: _stage, ...REVISION_CONTENT } = COMPLETE_PROJECT;
const project = (ownerId: string, i: number, extra: Record<string, unknown> = {}) => ({ ...COMPLETE_PROJECT, title: `Paged project ${i}`, ownerId, ...extra });

describe('Admin lists load one page at a time', () => {
  it('review queue: submissions page on their own', async () => {
    const agent = await adminAgent();
    const owner = await createUser();
    // One shared timestamp, so the order rests on the id tie-break.
    const submittedAt = new Date();
    await prisma.project.createMany({ data: Array.from({ length: TOTAL }, (_, i) => project(owner.id, i, { status: 'SUBMITTED', submittedAt })) });
    const ids = (await prisma.project.findMany({ where: { status: 'SUBMITTED' }, select: { id: true } })).map((p) => p.id);

    await expectPaged(agent, '/api/admin/reviews', ids, 'submissionsPage', (body) => (body as { submissions: Page }).submissions);
    const res = await agent.get('/api/admin/reviews');
    expect(res.body.revisions).toEqual({ page: 1, items: [], hasMore: false });
  });

  it('review queue: changes to live projects page on their own', async () => {
    const agent = await adminAgent();
    const owner = await createUser();
    const live = await createProject(owner.id);
    await prisma.projectRevision.createMany({
      data: Array.from({ length: TOTAL }, () => ({ projectId: live.id, authorId: owner.id, ...REVISION_CONTENT })),
    });
    const ids = (await prisma.projectRevision.findMany({ select: { id: true } })).map((r) => r.id);

    await expectPaged(agent, '/api/admin/reviews', ids, 'revisionsPage', (body) => (body as { revisions: Page }).revisions);
  });

  it('paid offers waiting for review', async () => {
    const agent = await adminAgent();
    const pro = await createUser({ role: 'PROFESSIONAL' });
    const live = await createProject(pro.id);
    await prisma.paidOffer.createMany({
      data: Array.from({ length: TOTAL }, (_, i) => ({
        projectId: live.id,
        authorId: pro.id,
        title: `Offer ${i}`,
        skills: ['react'],
        type: 'FIXED',
        compensation: '100',
        currency: 'USD',
        applicationRoute: 'Send a message through ProjectBridge.',
      })),
    });
    const ids = (await prisma.paidOffer.findMany({ select: { id: true } })).map((o) => o.id);

    await expectPaged(agent, '/api/admin/offers', ids);
  });

  it('removed projects, newest removal first', async () => {
    const agent = await adminAgent();
    const owner = await createUser();
    const removedAt = new Date();
    await prisma.project.createMany({ data: Array.from({ length: TOTAL }, (_, i) => project(owner.id, i, { status: 'REMOVED', removedAt })) });
    const ids = (await prisma.project.findMany({ where: { status: 'REMOVED' }, select: { id: true } })).map((p) => p.id);

    await expectPaged(agent, '/api/admin/projects/removed', ids);
  });

  it('Professional role requests', async () => {
    const agent = await adminAgent();
    const people = await Promise.all(Array.from({ length: TOTAL }, () => createUser()));
    await prisma.roleRequest.createMany({ data: people.map((p) => ({ userId: p.id, reason: 'I mentor student teams at a local software company.' })) });
    const ids = (await prisma.roleRequest.findMany({ select: { id: true } })).map((r) => r.id);

    await expectPaged(agent, '/api/admin/role-requests', ids);
  });

  it('one account’s history, newest first', async () => {
    const agent = await adminAgent();
    const user = await createUser();
    await prisma.auditLog.createMany({ data: Array.from({ length: TOTAL }, () => ({ action: 'PAGING_TEST', actorId: user.id, targetType: 'User', targetId: user.id })) });
    const ids = (await prisma.auditLog.findMany({ where: { action: 'PAGING_TEST' }, select: { id: true } })).map((a) => a.id);

    await expectPaged(agent, `/api/admin/users/${user.id}/audit`, ids, 'page', (body) => {
      const { user: who, ...page } = body as Page & { user: { id: string } };
      expect(who.id).toBe(user.id);
      return page;
    });
  });

  it.each([
    '/api/admin/offers',
    '/api/admin/projects/removed',
    '/api/admin/role-requests',
    '/api/admin/users',
    '/api/admin/reports',
  ])('%s refuses a page number that is not a whole number from 1 to 1000', async (url) => {
    const agent = await adminAgent();
    for (const bad of ['0', '-1', 'abc', '1.5', '1001']) {
      const res = await agent.get(`${url}?page=${bad}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('the review queue refuses a bad page number for either list', async () => {
    const agent = await adminAgent();
    for (const query of ['submissionsPage=0', 'revisionsPage=abc']) {
      expect((await agent.get(`/api/admin/reviews?${query}`)).status).toBe(400);
    }
  });
});
