import { randomUUID } from 'node:crypto';
import type { Prisma, Project, ProjectRevision } from '@prisma/client';
import { config } from '../../config.js';
import { EDITABLE_DRAFT_STATUSES, LIVE_STATUSES, type AuthUser } from '../../domain.js';
import { audit } from '../../lib/audit.js';
import { HttpError } from '../../lib/errors.js';
import { prisma, TX_OPTIONS } from '../../lib/prisma.js';
import { getCoverStorage, getStorage } from '../../lib/storage.js';
import { toDetail } from '../discovery/visibility.js';
import { notify } from '../notifications/service.js';
import { assertSafeImage, recordAudit } from '../security/service.js';
import { loadProjectFor } from './access.js';
import { imageExtension, signScreenshots } from './media.js';
import { completeProjectSchema, type ProjectInput } from './schemas.js';

/** Fields covered by Admin review. Stage and publicDemo are owner decisions applied directly. */
const CONTENT_FIELDS = ['title', 'summary', 'problem', 'overview', 'tags', 'demoUrl'] as const;
type ContentField = (typeof CONTENT_FIELDS)[number];
type Content = Pick<Project, ContentField>;

function projectAudit(action: string, actor: AuthUser, projectId: string, reason?: string, client?: Prisma.TransactionClient) {
  return audit({ action, actorId: actor.id, targetType: 'Project', targetId: projectId, reason }, client);
}

/**
 * The project tracker's history: stage moves and milestone changes, kept in the audit log so the
 * team can see how the work developed. Shown in the workspace next to the written updates.
 */
const TRACKER_EVENTS = ['STAGE_CHANGED', 'MILESTONE_ADDED', 'MILESTONE_STATUS', 'MILESTONE_REMOVED'] as const;

function trackerEvent(action: (typeof TRACKER_EVENTS)[number], actor: AuthUser, projectId: string, detail: { reason?: string; oldValue?: string; newValue?: string }) {
  return audit({ action, actorId: actor.id, targetType: 'Project', targetId: projectId, ...detail });
}

function contentOf(source: Content): Content {
  return {
    title: source.title,
    summary: source.summary,
    problem: source.problem,
    overview: source.overview,
    tags: source.tags,
    demoUrl: source.demoUrl,
  };
}

function sameContent(a: Content, b: Content): boolean {
  return CONTENT_FIELDS.every((f) => JSON.stringify(a[f]) === JSON.stringify(b[f]));
}

/** A project must be complete before review, and live content must stay complete (FR02/FR03). */
function assertComplete(content: Content & { stage: string }): void {
  const result = completeProjectSchema.safeParse(content);
  if (result.success) return;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) fields[String(issue.path[0] ?? 'form')] ??= issue.message;
  throw new HttpError(400, 'VALIDATION_ERROR', 'Complete the highlighted fields before submitting.', fields);
}

function assertEditable(project: Project): void {
  if (project.status === 'SUBMITTED') {
    throw new HttpError(409, 'UNDER_REVIEW', 'This project is waiting for Admin review and cannot be edited until it is reviewed.');
  }
  if (project.status === 'REMOVED') {
    throw new HttpError(409, 'PROJECT_REMOVED', 'This project was removed by an Admin and cannot be edited.');
  }
}

// ---------------------------------------------------------------- FR02: drafts and submission

export async function createProject(user: AuthUser, input: ProjectInput & { title: string }) {
  const project = await prisma.project.create({ data: { ...input, ownerId: user.id, status: 'DRAFT' } });
  await projectAudit('PROJECT_CREATED', user, project.id);
  return project;
}

/**
 * Drafts change directly. On a live project, content edits become (or replace) the pending
 * revision and the approved version stays visible until an Admin approves it (FR03).
 */
export async function updateProject(user: AuthUser, id: string, input: ProjectInput) {
  const { project } = await loadProjectFor(user, id, 'edit');
  assertEditable(project);

  const stageMoved = input.stage !== undefined && input.stage !== project.stage;
  if (EDITABLE_DRAFT_STATUSES.includes(project.status)) {
    await prisma.project.update({ where: { id }, data: input });
    if (stageMoved) await trackerEvent('STAGE_CHANGED', user, id, { oldValue: project.stage, newValue: input.stage });
    return;
  }

  // Stage, demo visibility and completion are the team's own status: they apply at once, without review.
  const { stage, publicDemo, completion, ...contentPatch } = input;
  if (stage !== undefined || publicDemo !== undefined || completion !== undefined) {
    await prisma.project.update({ where: { id }, data: { stage, publicDemo, completion } });
    if (stageMoved) await trackerEvent('STAGE_CHANGED', user, id, { oldValue: project.stage, newValue: stage });
  }
  const touched = CONTENT_FIELDS.filter((f) => contentPatch[f] !== undefined);
  if (touched.length === 0 || !LIVE_STATUSES.includes(project.status)) return;

  const pending = await prisma.projectRevision.findFirst({ where: { projectId: id, status: 'PENDING' } });
  const proposed: Content = { ...contentOf(pending ?? project), ...pickDefined(contentPatch) };
  assertComplete({ ...proposed, stage: stage ?? project.stage });

  if (sameContent(proposed, contentOf(project))) {
    // Edited back to the approved version: nothing left to review.
    if (pending) await prisma.projectRevision.delete({ where: { id: pending.id } });
    return;
  }
  const revision = pending
    ? await prisma.projectRevision.update({ where: { id: pending.id }, data: { ...proposed, authorId: user.id } })
    : await prisma.projectRevision.create({ data: { ...proposed, projectId: id, authorId: user.id } });
  await projectAudit('REVISION_SUBMITTED', user, id, touched.join(','));
  // Every version an Admin may be asked to approve is checked first.
  await recordAudit({ projectId: id, revisionId: revision.id, title: proposed.title, content: proposed, actorId: user.id });
}

function pickDefined(patch: Partial<Content>): Partial<Content> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<Content>;
}

export async function submitProject(user: AuthUser, id: string) {
  const { project } = await loadProjectFor(user, id, 'own');
  if (!EDITABLE_DRAFT_STATUSES.includes(project.status)) {
    throw new HttpError(409, 'INVALID_STATE', 'Only drafts and projects with requested changes can be submitted.');
  }
  assertComplete(project);
  const now = new Date();
  await prisma.project.update({
    where: { id },
    data: { status: 'SUBMITTED', submittedAt: now, ownershipDeclaredAt: now, reviewNote: null },
  });
  await projectAudit('PROJECT_SUBMITTED', user, id);
  // The Admin sees the result in the review queue; the owner is not told what was found.
  await recordAudit({ projectId: id, title: project.title, content: project, actorId: user.id });
}

// ---------------------------------------------------------------- Owner/editor views

export async function listMine(user: AuthUser) {
  const projects = await prisma.project.findMany({
    where: {
      status: { not: 'DELETED' },
      OR: [{ ownerId: user.id }, { members: { some: { userId: user.id, status: 'ACCEPTED' } } }],
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    include: { revisions: { where: { status: 'PENDING' }, select: { id: true } } },
  });
  return projects.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    stage: p.stage,
    tags: p.tags,
    reviewNote: p.reviewNote,
    updatedAt: p.updatedAt.toISOString(),
    publishedAt: p.publishedAt?.toISOString() ?? null,
    myRole: p.ownerId === user.id ? 'OWNER' : 'EDITOR',
    hasPendingRevision: p.revisions.length > 0,
  }));
}

function revisionView(r: ProjectRevision) {
  return { ...contentOf(r), id: r.id, status: r.status, reviewNote: r.reviewNote, createdAt: r.createdAt.toISOString() };
}

/**
 * Everything the editor and team pages need. No emails, for anyone. An editor sees only who has
 * accepted, as the public team does. The owner also sees pending and declined rows, without a name or
 * user id: inviting needs no consent, so naming them would turn any email address into a person.
 */
export async function workspace(user: AuthUser, id: string) {
  const { project, isOwner } = await loadProjectFor(user, id, 'edit');
  const [revision, media, members, milestones, progress, events] = await Promise.all([
    prisma.projectRevision.findFirst({
      where: { projectId: id, status: { in: ['PENDING', 'REJECTED'] } },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.projectMedia.findMany({ where: { projectId: id } }),
    prisma.projectMember.findMany({
      where: { projectId: id },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.milestone.findMany({ where: { projectId: id }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] }),
    prisma.progressEntry.findMany({ where: { projectId: id }, orderBy: { createdAt: 'desc' } }),
    prisma.auditLog.findMany({
      where: { targetType: 'Project', targetId: id, action: { in: [...TRACKER_EVENTS] } },
      orderBy: { createdAt: 'desc' },
      take: 60,
    }),
  ]);
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: project.ownerId }, select: { name: true } });
  const names = new Map([[project.ownerId, owner.name], ...members.map((m) => [m.userId, m.user.name] as const)]);
  const urls = new Map((await signScreenshots(media)).map((s) => [s.id, s.url]));

  return {
    myRole: isOwner ? 'OWNER' : 'EDITOR',
    project: {
      id: project.id,
      ...contentOf(project),
      stage: project.stage,
      completion: project.completion,
      publicDemo: project.publicDemo,
      thumbnailUrl: project.thumbnailUrl,
      status: project.status,
      reviewNote: project.reviewNote,
      submittedAt: project.submittedAt?.toISOString() ?? null,
      publishedAt: project.publishedAt?.toISOString() ?? null,
      updatedAt: project.updatedAt.toISOString(),
      owner: { name: owner.name },
    },
    // A rejected revision is only interesting until a newer one replaces it.
    revision: revision ? revisionView(revision) : null,
    media: [...media]
      .sort((a, b) => a.position - b.position)
      .map((m) => ({ id: m.id, url: urls.get(m.id) ?? null, mimeType: m.mimeType, sizeBytes: m.sizeBytes })),
    members: members
      .filter((m) => isOwner || m.status === 'ACCEPTED')
      .map((m) =>
        m.status === 'ACCEPTED'
          ? { id: m.id, userId: m.userId, name: m.user.name, status: m.status }
          : { id: m.id, status: m.status },
      ),
    milestones: milestones.map((m) => ({
      id: m.id,
      title: m.title,
      status: m.status,
      dueDate: m.dueDate?.toISOString() ?? null,
    })),
    progress: progress.map((e) => ({
      id: e.id,
      body: e.body,
      createdAt: e.createdAt.toISOString(),
      authorName: names.get(e.authorId) ?? 'Former member',
    })),
    // Newest first. `title` is the milestone's name; `from` and `to` are stages or milestone statuses.
    activity: events.map((e) => ({
      id: e.id,
      kind: e.action,
      title: e.reason,
      from: e.oldValue,
      to: e.newValue,
      at: e.createdAt.toISOString(),
      actorName: (e.actorId && names.get(e.actorId)) || 'Former member',
    })),
    stageSince: events.find((e) => e.action === 'STAGE_CHANGED')?.createdAt.toISOString() ?? null,
  };
}

/** FR02 preview: the full Professional view of the draft, or of the pending revision if any. */
export async function preview(user: AuthUser, id: string) {
  await loadProjectFor(user, id, 'edit');
  const project = await prisma.project.findUniqueOrThrow({
    where: { id },
    include: {
      owner: { select: { name: true } },
      members: { include: { user: { select: { name: true } } } },
      milestones: true,
      progress: true,
      media: true,
      revisions: { where: { status: 'PENDING' } },
    },
  });
  const pending = project.revisions[0];
  const source = pending ? { ...project, ...contentOf(pending) } : project;
  const detail = toDetail(source, 'PROFESSIONAL', await signScreenshots(project.media));
  return { project: detail, status: project.status, showsPendingRevision: Boolean(pending) };
}

// ---------------------------------------------------------------- Screenshots (optional, FR02)

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export async function addMedia(user: AuthUser, id: string, files: UploadedFile[]) {
  const { project } = await loadProjectFor(user, id, 'edit');
  assertMediaEditable(project);
  if (files.length === 0) throw new HttpError(400, 'VALIDATION_ERROR', 'Choose at least one image.');
  const existing = await prisma.projectMedia.count({ where: { projectId: id } });
  if (existing + files.length > config.media.maxFiles) {
    throw new HttpError(400, 'TOO_MANY_FILES', `A project can have at most ${config.media.maxFiles} screenshots.`);
  }
  const prepared = files.map((f) => {
    const ext = imageExtension(f.mimetype, f.buffer);
    if (!ext) throw new HttpError(400, 'INVALID_FILE', 'Screenshots must be PNG, JPEG or WebP images.');
    return { file: f, ext, path: `projects/${id}/${randomUUID()}.${ext}` };
  });
  // Every file is checked before any is stored, so a bad one leaves nothing behind.
  for (const { file, ext } of prepared) await assertSafeImage({ projectId: id, title: project.title, actorId: user.id, ext, data: file.buffer });

  const storage = getStorage();
  for (const [i, { file, path }] of prepared.entries()) {
    await storage.upload(path, file.buffer, file.mimetype);
    await prisma.projectMedia.create({
      data: { projectId: id, storagePath: path, mimeType: file.mimetype, sizeBytes: file.size, position: existing + i },
    });
  }
  await projectAudit('MEDIA_ADDED', user, id, String(files.length));
}

export async function removeMedia(user: AuthUser, id: string, mediaId: string) {
  const { project } = await loadProjectFor(user, id, 'edit');
  assertMediaEditable(project);
  const media = await prisma.projectMedia.findFirst({ where: { id: mediaId, projectId: id } });
  if (!media) throw new HttpError(404, 'NOT_FOUND', 'Screenshot not found.');
  await getStorage().remove([media.storagePath]);
  await prisma.projectMedia.delete({ where: { id: media.id } });
}

// ---------------------------------------------------------------- Cover image (optional, FR02)

/** Storage path of a cover uploaded through setCover; null for none or a demo image hosted elsewhere. */
function coverPath(project: Pick<Project, 'id' | 'thumbnailUrl'>): string | null {
  const start = project.thumbnailUrl?.indexOf(`projects/${project.id}/`) ?? -1;
  return start >= 0 ? project.thumbnailUrl!.slice(start) : null;
}

/**
 * Images are the project's showcase, so the team may change them on a draft and on a live project alike.
 * Like the stage and demo visibility, they apply at once without review. They stay locked while the
 * project is being reviewed, and once it is removed or deleted.
 */
const MEDIA_EDITABLE: readonly string[] = [...EDITABLE_DRAFT_STATUSES, ...LIVE_STATUSES];

function assertMediaEditable(project: Pick<Project, 'status'>) {
  if (!MEDIA_EDITABLE.includes(project.status)) {
    throw new HttpError(409, 'MEDIA_LOCKED', 'Images cannot be changed while the project is in review, removed or deleted.');
  }
}

/** The card thumbnail every tier sees, so it lives in the public cover bucket. Replaces any earlier cover. */
export async function setCover(user: AuthUser, id: string, file: UploadedFile | undefined) {
  const { project } = await loadProjectFor(user, id, 'edit');
  assertMediaEditable(project);
  if (!file) throw new HttpError(400, 'VALIDATION_ERROR', 'Choose an image.');
  const ext = imageExtension(file.mimetype, file.buffer);
  if (!ext) throw new HttpError(400, 'INVALID_FILE', 'The cover must be a PNG, JPEG or WebP image.');
  await assertSafeImage({ projectId: id, title: project.title, actorId: user.id, ext, data: file.buffer });

  const storage = getCoverStorage();
  const path = `projects/${id}/cover-${randomUUID()}.${ext}`;
  await storage.upload(path, file.buffer, file.mimetype);
  await prisma.project.update({ where: { id }, data: { thumbnailUrl: storage.publicUrl(path) } });
  const previous = coverPath(project);
  if (previous) await storage.remove([previous]);
  await projectAudit('COVER_SET', user, id);
}

export async function removeCover(user: AuthUser, id: string) {
  const { project } = await loadProjectFor(user, id, 'edit');
  assertMediaEditable(project);
  const previous = coverPath(project);
  if (previous) await getCoverStorage().remove([previous]);
  await prisma.project.update({ where: { id }, data: { thumbnailUrl: null } });
}

// ---------------------------------------------------------------- FR03: progress and milestones (no review)

function assertNotRemoved(project: Project) {
  if (project.status === 'REMOVED') {
    throw new HttpError(409, 'PROJECT_REMOVED', 'This project was removed by an Admin and cannot be edited.');
  }
}

export async function addProgress(user: AuthUser, id: string, body: string) {
  const { project } = await loadProjectFor(user, id, 'edit');
  assertNotRemoved(project);
  return prisma.progressEntry.create({ data: { projectId: id, authorId: user.id, body } });
}

export async function deleteProgress(user: AuthUser, id: string, entryId: string) {
  await loadProjectFor(user, id, 'edit');
  const { count } = await prisma.progressEntry.deleteMany({ where: { id: entryId, projectId: id } });
  if (count === 0) throw new HttpError(404, 'NOT_FOUND', 'Progress entry not found.');
}

export async function addMilestone(user: AuthUser, id: string, input: { title: string; status?: string; dueDate?: Date | null }) {
  const { project } = await loadProjectFor(user, id, 'edit');
  assertNotRemoved(project);
  const last = await prisma.milestone.findFirst({ where: { projectId: id }, orderBy: { position: 'desc' }, select: { position: true } });
  const milestone = await prisma.milestone.create({ data: { ...input, projectId: id, position: (last?.position ?? -1) + 1 } });
  await trackerEvent('MILESTONE_ADDED', user, id, { reason: milestone.title, newValue: milestone.status });
  return milestone;
}

export async function updateMilestone(
  user: AuthUser,
  id: string,
  milestoneId: string,
  input: { title?: string; status?: string; dueDate?: Date | null },
) {
  const { project } = await loadProjectFor(user, id, 'edit');
  assertNotRemoved(project);
  const before = await prisma.milestone.findFirst({ where: { id: milestoneId, projectId: id } });
  if (!before) throw new HttpError(404, 'NOT_FOUND', 'Milestone not found.');
  await prisma.milestone.update({ where: { id: milestoneId }, data: input });
  if (input.status !== undefined && input.status !== before.status) {
    await trackerEvent('MILESTONE_STATUS', user, id, { reason: input.title ?? before.title, oldValue: before.status, newValue: input.status });
  }
}

/** Sets the order of every milestone at once; the list must name each of the project's milestones exactly once. */
export async function reorderMilestones(user: AuthUser, id: string, ids: string[]) {
  const { project } = await loadProjectFor(user, id, 'edit');
  assertNotRemoved(project);
  const existing = await prisma.milestone.findMany({ where: { projectId: id }, select: { id: true } });
  const known = new Set(existing.map((m) => m.id));
  if (ids.length !== known.size || new Set(ids).size !== ids.length || !ids.every((m) => known.has(m))) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'The order must list each milestone of this project exactly once.');
  }
  await prisma.$transaction(ids.map((milestoneId, position) => prisma.milestone.update({ where: { id: milestoneId }, data: { position } })));
}

export async function deleteMilestone(user: AuthUser, id: string, milestoneId: string) {
  await loadProjectFor(user, id, 'edit');
  const milestone = await prisma.milestone.findFirst({ where: { id: milestoneId, projectId: id } });
  if (!milestone) throw new HttpError(404, 'NOT_FOUND', 'Milestone not found.');
  await prisma.milestone.delete({ where: { id: milestoneId } });
  await trackerEvent('MILESTONE_REMOVED', user, id, { reason: milestone.title, oldValue: milestone.status });
}

// ---------------------------------------------------------------- FR03: team

/** Owners invite existing accounts; the invitee must accept before credit or editing. */
export async function inviteMember(user: AuthUser, id: string, email: string) {
  const { project } = await loadProjectFor(user, id, 'own');
  assertNotRemoved(project);
  const invitee = await prisma.user.findUnique({ where: { email } });
  // Admins and blocked accounts cannot accept, but they get a row like anyone else. Answering them
  // differently could be compared with register's 409 to find out who they are.
  if (!invitee) {
    throw new HttpError(404, 'USER_NOT_FOUND', 'No active ProjectBridge account uses this email.', {
      email: 'No active ProjectBridge account uses this email. Ask them to register first.',
    });
  }
  if (invitee.id === project.ownerId) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'You already own this project.', { email: 'You already own this project.' });
  }
  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: id, userId: invitee.id } },
  });
  if (existing && existing.status !== 'DECLINED') {
    const msg = existing.status === 'ACCEPTED' ? 'This person is already on the team.' : 'This person has already been invited.';
    throw new HttpError(409, 'ALREADY_MEMBER', msg, { email: msg });
  }
  await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.projectMember.update({ where: { id: existing.id }, data: { status: 'INVITED', invitedById: user.id } });
    } else {
      await tx.projectMember.create({ data: { projectId: id, userId: invitee.id, invitedById: user.id } });
    }
    await projectAudit('MEMBER_INVITED', user, id, invitee.id, tx);
    await notify(
      {
        recipientId: invitee.id,
        eventType: 'TEAM_INVITE',
        message: `${user.name} invited you to join "${project.title}".`,
        targetType: 'Project',
        targetId: id,
      },
      tx,
    );
  }, TX_OPTIONS);
}

/**
 * The owner removes anyone; an editor may remove themselves (leave the team). `memberRef` is a row id
 * from the workspace, or the user id of someone who has accepted. A pending row answers only to its
 * row id, so a user id cannot be used to test whether that person was invited.
 */
export async function removeMember(user: AuthUser, id: string, memberRef: string) {
  const { isOwner } = await loadProjectFor(user, id, 'edit');
  if (!isOwner && memberRef !== user.id) throw new HttpError(404, 'NOT_FOUND', 'Project not found.');
  const member = await prisma.projectMember.findFirst({
    where: { projectId: id, OR: [{ id: memberRef }, { userId: memberRef, status: 'ACCEPTED' }] },
  });
  const { count } = await prisma.projectMember.deleteMany({ where: { id: member?.id ?? '' } });
  if (!member || count === 0) throw new HttpError(404, 'NOT_FOUND', 'Team member not found.');
  await projectAudit('MEMBER_REMOVED', user, id, member.userId);
}

export async function listInvites(user: AuthUser) {
  if (user.role === 'ADMIN') return []; // An Admin cannot accept (see 'publish'), so an invite is only noise.
  const invites = await prisma.projectMember.findMany({
    where: { userId: user.id, status: 'INVITED', project: { status: { notIn: ['DELETED', 'REMOVED'] } } },
    include: { project: { select: { id: true, title: true, owner: { select: { name: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
  return invites.map((i) => ({
    projectId: i.project.id,
    title: i.project.title,
    ownerName: i.project.owner.name,
    invitedAt: i.createdAt.toISOString(),
  }));
}

export async function respondToInvite(user: AuthUser, projectId: string, accept: boolean) {
  const invite = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
    include: { project: { select: { status: true } } },
  });
  if (!invite || invite.status !== 'INVITED' || ['DELETED', 'REMOVED'].includes(invite.project.status)) {
    throw new HttpError(404, 'NOT_FOUND', 'Invitation not found.');
  }
  await prisma.projectMember.update({ where: { id: invite.id }, data: { status: accept ? 'ACCEPTED' : 'DECLINED' } });
  await projectAudit(accept ? 'MEMBER_ACCEPTED' : 'MEMBER_DECLINED', user, projectId);
}

// ---------------------------------------------------------------- FR04: hide and delete

export async function setHidden(user: AuthUser, id: string, hidden: boolean) {
  const { project } = await loadProjectFor(user, id, 'own');
  const from = hidden ? 'PUBLISHED' : 'HIDDEN';
  if (project.status !== from) {
    throw new HttpError(409, 'INVALID_STATE', hidden ? 'Only published projects can be hidden.' : 'This project is not hidden.');
  }
  await prisma.project.update({
    where: { id },
    data: { status: hidden ? 'HIDDEN' : 'PUBLISHED', hiddenAt: hidden ? new Date() : null },
  });
  await projectAudit(hidden ? 'PROJECT_HIDDEN' : 'PROJECT_UNHIDDEN', user, id);
}

/**
 * Removes active content and media, keeping only the row as a tombstone for audit metadata
 * and any existing authorised communication records (FR04).
 */
export async function deleteProject(user: AuthUser, id: string, confirmTitle: string) {
  const { project } = await loadProjectFor(user, id, 'own');
  if (confirmTitle.trim() !== project.title) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'The title does not match.', {
      confirmTitle: 'Type the project title exactly to confirm deletion.',
    });
  }
  const media = await prisma.projectMedia.findMany({ where: { projectId: id }, select: { storagePath: true } });
  await getStorage().remove(media.map((m) => m.storagePath));
  const cover = coverPath(project);
  if (cover) await getCoverStorage().remove([cover]);
  await prisma.$transaction([
    prisma.projectMedia.deleteMany({ where: { projectId: id } }),
    prisma.projectRevision.deleteMany({ where: { projectId: id } }),
    prisma.progressEntry.deleteMany({ where: { projectId: id } }),
    prisma.milestone.deleteMany({ where: { projectId: id } }),
    prisma.projectMember.deleteMany({ where: { projectId: id } }),
    prisma.project.update({
      where: { id },
      data: {
        title: '[deleted project]',
        summary: '',
        problem: '',
        overview: '',
        tags: [],
        demoUrl: null,
        publicDemo: false,
        thumbnailUrl: null,
        reviewNote: null,
        status: 'DELETED',
        deletedAt: new Date(),
      },
    }),
  ]);
  await projectAudit('PROJECT_DELETED', user, id, `previous status ${project.status}; ${media.length} media removed`);
}
