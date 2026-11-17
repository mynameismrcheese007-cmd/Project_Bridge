/**
 * AT03 / FR03: revisions stay behind review, team invitations need acceptance, progress and milestones.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createProject, createUser, prisma, resetDb, signedInAgent } from './helpers.js';

beforeEach(resetDb);

async function publishedSetup() {
  const owner = await createUser();
  const project = await createProject(owner.id);
  const ownerAgent = await signedInAgent(owner.email);
  const pro = await createUser({ role: 'PROFESSIONAL' });
  const proAgent = await signedInAgent(pro.email);
  const admin = await createUser({ role: 'ADMIN' });
  const adminAgent = await signedInAgent(admin.email);
  return { owner, project, ownerAgent, pro, proAgent, adminAgent };
}

describe('Revisions to published content', () => {
  it('keeps the approved overview visible until the revision is approved', async () => {
    const { project, ownerAgent, proAgent, adminAgent } = await publishedSetup();
    const newOverview = `${project.overview} Now with a live pilot in two villages.`;

    const res = await ownerAgent.patch(`/api/projects/${project.id}`).send({ overview: newOverview });
    expect(res.status).toBe(200);
    expect(res.body.revision.status).toBe('PENDING');

    // The public still sees the approved version, and the project stays published.
    let view = await proAgent.get(`/api/projects/${project.id}`);
    expect(view.body.project.overview).toBe(project.overview);

    // The owner's preview shows what is waiting for review.
    const preview = await ownerAgent.get(`/api/projects/${project.id}/preview`);
    expect(preview.body.project.overview).toBe(newOverview);
    expect(preview.body.showsPendingRevision).toBe(true);

    const queue = await adminAgent.get('/api/admin/reviews');
    expect(queue.body.revisions).toHaveLength(1);
    expect(queue.body.revisions[0].current.overview).toBe(project.overview);
    expect(queue.body.revisions[0].proposed.overview).toBe(newOverview);

    await adminAgent.post(`/api/admin/reviews/revisions/${queue.body.revisions[0].id}/approve`);
    view = await proAgent.get(`/api/projects/${project.id}`);
    expect(view.body.project.overview).toBe(newOverview);
  });

  it('leaves the live content unchanged when a revision is rejected, and tells the owner why', async () => {
    const { project, ownerAgent, proAgent, adminAgent } = await publishedSetup();
    await ownerAgent.patch(`/api/projects/${project.id}`).send({ demoUrl: 'https://new-demo.example.com' });
    const revision = await prisma.projectRevision.findFirstOrThrow({ where: { projectId: project.id } });

    await adminAgent.post(`/api/admin/reviews/revisions/${revision.id}/reject`).send({ note: 'Demo link is broken.' });

    const view = await proAgent.get(`/api/projects/${project.id}`);
    expect(view.body.project.demoUrl).toBe(project.demoUrl);
    const ws = await ownerAgent.get(`/api/projects/${project.id}/workspace`);
    expect(ws.body.revision).toMatchObject({ status: 'REJECTED', reviewNote: 'Demo link is broken.' });
  });

  it('rejects a revision that would leave the project incomplete', async () => {
    const { project, ownerAgent } = await publishedSetup();
    const res = await ownerAgent.patch(`/api/projects/${project.id}`).send({ demoUrl: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.demoUrl).toBeDefined();
  });

  it('applies stage changes directly without review', async () => {
    const { project, ownerAgent } = await publishedSetup();
    const res = await ownerAgent.patch(`/api/projects/${project.id}`).send({ stage: 'PILOT' });
    expect(res.body.project.stage).toBe('PILOT');
    expect(res.body.revision).toBeNull();
  });
});

describe('Team membership', () => {
  it('requires acceptance before a member can edit or is credited', async () => {
    const { project, ownerAgent, pro, proAgent } = await publishedSetup();

    expect((await ownerAgent.post(`/api/projects/${project.id}/members`).send({ email: pro.email })).status).toBe(201);

    // Invited but not accepted: no editing, no credit.
    expect((await proAgent.post(`/api/projects/${project.id}/progress`).send({ body: 'Sneaky update' })).status).toBe(404);
    let view = await proAgent.get(`/api/projects/${project.id}`);
    expect(view.body.project.team.map((t: { name: string }) => t.name)).not.toContain(pro.name);

    const invites = await proAgent.get('/api/projects/invites');
    expect(invites.body.items.map((i: { projectId: string }) => i.projectId)).toEqual([project.id]);
    expect((await proAgent.post(`/api/projects/invites/${project.id}/accept`)).status).toBe(200);

    expect((await proAgent.post(`/api/projects/${project.id}/progress`).send({ body: 'Integrated the SMS gateway.' })).status).toBe(201);
    view = await proAgent.get(`/api/projects/${project.id}`);
    expect(view.body.project.team).toEqual(expect.arrayContaining([{ name: pro.name, role: 'EDITOR' }]));
    expect(view.body.project.progress[0].body).toBe('Integrated the SMS gateway.');
  });

  it('only lets the owner invite, and rejects unknown or duplicate invitees', async () => {
    const { project, ownerAgent, pro, proAgent } = await publishedSetup();
    expect((await ownerAgent.post(`/api/projects/${project.id}/members`).send({ email: 'nobody@example.com' })).status).toBe(404);
    await ownerAgent.post(`/api/projects/${project.id}/members`).send({ email: pro.email });
    expect((await ownerAgent.post(`/api/projects/${project.id}/members`).send({ email: pro.email })).status).toBe(409);

    await proAgent.post(`/api/projects/invites/${project.id}/accept`);
    const third = await createUser();
    // Editors cannot invite.
    expect((await proAgent.post(`/api/projects/${project.id}/members`).send({ email: third.email })).status).toBe(404);
  });

  it('answers an invite to an Admin or a blocked account exactly as it does an ordinary one', async () => {
    const { project, ownerAgent, pro } = await publishedSetup();
    const invite = (email: string) => ownerAgent.post(`/api/projects/${project.id}/members`).send({ email });
    const admin = await createUser({ role: 'ADMIN' });
    const banned = await createUser({ status: 'BANNED' });

    const ordinary = await invite(pro.email);
    expect(ordinary.status).toBe(201);
    for (const email of [admin.email, banned.email]) {
      const res = await invite(email);
      expect({ status: res.status, body: res.body }).toEqual({ status: ordinary.status, body: ordinary.body });
    }
    expect((await invite(admin.email)).status).toBe(409);
    expect((await invite(pro.email)).status).toBe(409);

    const { body } = await ownerAgent.get(`/api/projects/${project.id}/workspace`);
    expect(body.members.map((m: { status: string }) => m.status)).toEqual(['INVITED', 'INVITED', 'INVITED']);
    expect((await invite('nobody@example.com')).status).toBe(404);
  });

  it('keeps editor rights after the editor’s role changes', async () => {
    const { project, ownerAgent, pro, proAgent } = await publishedSetup();
    await ownerAgent.post(`/api/projects/${project.id}/members`).send({ email: pro.email });
    await proAgent.post(`/api/projects/invites/${project.id}/accept`);
    await prisma.user.update({ where: { id: pro.id }, data: { role: 'UPLOADER' } });
    expect((await proAgent.post(`/api/projects/${project.id}/milestones`).send({ title: 'Field trial' })).status).toBe(201);
  });
});

describe('Progress and milestones', () => {
  it('lets the owner add and update milestones without review', async () => {
    const { project, ownerAgent, proAgent } = await publishedSetup();
    const created = await ownerAgent.post(`/api/projects/${project.id}/milestones`).send({ title: 'Pilot', status: 'PLANNED' });
    expect(created.status).toBe(201);
    await ownerAgent.patch(`/api/projects/${project.id}/milestones/${created.body.id}`).send({ status: 'DONE' });

    const view = await proAgent.get(`/api/projects/${project.id}`);
    expect(view.body.project.milestones).toEqual([expect.objectContaining({ title: 'Pilot', status: 'DONE' })]);
    expect(await prisma.projectRevision.count()).toBe(0);
  });
});

describe('Bulletin completion', () => {
  it('the team sets it on a live project at once, without review; others cannot', async () => {
    const { ownerAgent: owner, project } = await publishedSetup();
    const url = `/api/projects/${project.id}`;
    const set = await owner.patch(url).send({ completion: 80 });
    expect(set.status).toBe(200);
    expect(set.body.project.completion).toBe(80);
    expect(await prisma.projectRevision.count({ where: { projectId: project.id } })).toBe(0);

    const viewer = await signedInAgent((await createUser({ role: 'UPLOADER' })).email);
    expect((await viewer.get(url)).body.project.completion).toBe(80);
    expect((await viewer.patch(url).send({ completion: 5 })).status).toBe(404);

    for (const bad of [101, -1, 50.5, '80']) expect({ bad, status: (await owner.patch(url).send({ completion: bad })).status }).toEqual({ bad, status: 400 });
    expect((await owner.patch(url).send({ completion: null })).body.project.completion).toBeNull();
  });
});

describe('Project tracker', () => {
  it('records stage moves and milestone changes, and shows them to the team as activity', async () => {
    const { project, ownerAgent } = await publishedSetup();
    const url = `/api/projects/${project.id}`;
    expect((await ownerAgent.patch(url).send({ stage: 'MVP' })).status).toBe(200);
    // Saving the same stage again is not a move.
    await ownerAgent.patch(url).send({ stage: 'MVP' });
    const { body: made } = await ownerAgent.post(`${url}/milestones`).send({ title: 'Pilot on one route' });
    await ownerAgent.patch(`${url}/milestones/${made.id}`).send({ status: 'IN_PROGRESS' });
    // A new title or date alone is not a status change.
    await ownerAgent.patch(`${url}/milestones/${made.id}`).send({ title: 'Pilot on two routes' });
    await ownerAgent.patch(`${url}/milestones/${made.id}`).send({ status: 'DONE' });
    await ownerAgent.delete(`${url}/milestones/${made.id}`);

    const { body } = await ownerAgent.get(`${url}/workspace`);
    expect(body.activity.map((e: { kind: string; from: string | null; to: string | null }) => [e.kind, e.from, e.to])).toEqual([
      ['MILESTONE_REMOVED', 'DONE', null],
      ['MILESTONE_STATUS', 'IN_PROGRESS', 'DONE'],
      ['MILESTONE_STATUS', 'PLANNED', 'IN_PROGRESS'],
      ['MILESTONE_ADDED', null, 'PLANNED'],
      ['STAGE_CHANGED', project.stage, 'MVP'],
    ]);
    expect(body.activity[1]).toMatchObject({ title: 'Pilot on two routes' });
    expect(Object.keys(body.activity[0]).sort()).toEqual(['actorName', 'at', 'from', 'id', 'kind', 'title', 'to']);
    expect(body.stageSince).toBe(body.activity[4].at);
  });

  it('reorders milestones, and refuses an order that is not exactly this project\u2019s milestones', async () => {
    const { project, ownerAgent, proAgent } = await publishedSetup();
    const url = `/api/projects/${project.id}/milestones`;
    const ids: string[] = [];
    for (const title of ['First', 'Second', 'Third']) ids.push((await ownerAgent.post(url).send({ title })).body.id);

    expect((await ownerAgent.put(`${url}/order`).send({ ids: [ids[2], ids[0], ids[1]] })).status).toBe(200);
    const titles = async () => (await ownerAgent.get(`/api/projects/${project.id}/workspace`)).body.milestones.map((m: { title: string }) => m.title);
    expect(await titles()).toEqual(['Third', 'First', 'Second']);
    // A milestone added afterwards goes to the end.
    await ownerAgent.post(url).send({ title: 'Fourth' });
    expect(await titles()).toEqual(['Third', 'First', 'Second', 'Fourth']);

    const all = (await ownerAgent.get(`/api/projects/${project.id}/workspace`)).body.milestones.map((m: { id: string }) => m.id);
    for (const bad of [all.slice(1), [...all.slice(1), all[1]], [...all.slice(1), 'not-a-milestone']]) {
      expect((await ownerAgent.put(`${url}/order`).send({ ids: bad })).status).toBe(400);
    }
    // Someone outside the team cannot tell the project's workspace exists.
    expect((await proAgent.put(`${url}/order`).send({ ids: all })).status).toBe(404);
    expect(await titles()).toEqual(['Third', 'First', 'Second', 'Fourth']);
  });
});
