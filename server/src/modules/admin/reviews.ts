import { z } from 'zod';
import type { AuthUser } from '../../domain.js';
import { audit } from '../../lib/audit.js';
import { HttpError } from '../../lib/errors.js';
import { pageNumber, pageWindow, toPage } from '../../lib/paging.js';
import { prisma, TX_OPTIONS } from '../../lib/prisma.js';
import { notify } from '../notifications/service.js';
import { signScreenshots } from '../projects/media.js';
import { currentAudit } from '../security/service.js';
import type { ScannableContent } from '../security/scanner.js';

/** An Admin who approves content the audit marked dangerous must say so, with a reason. */
export interface ApprovalInput {
  overrideSecurity?: boolean;
  reason?: string;
}

/**
 * Re-checks the content being approved, so the decision never rests on a stale scan. Dangerous
 * content is held back unless the Admin explicitly overrides; the override is recorded with the
 * approval in the same transaction.
 */
function securityGate(content: ScannableContent, input: ApprovalInput) {
  const result = currentAudit(content);
  if (result.verdict === 'DANGEROUS' && !(input.overrideSecurity && input.reason && input.reason.trim().length >= 10)) {
    throw new HttpError(409, 'SECURITY_REVIEW_REQUIRED', 'The security audit marked this content dangerous. Request changes, or confirm the override and give a reason of at least 10 characters.');
  }
  return result;
}

/**
 * FR13 review queue: approve submissions and revisions, or send them back with a note. Each decision
 * commits its status change, audit row and owner notice together, or not at all.
 */

const noSubmission = () => new HttpError(404, 'NOT_FOUND', 'No submission waiting for review.');
const noRevision = () => new HttpError(404, 'NOT_FOUND', 'No revision waiting for review.');

const content = (p: { title: string; summary: string; problem: string; overview: string; tags: string[]; demoUrl: string | null }) => ({
  title: p.title,
  summary: p.summary,
  problem: p.problem,
  overview: p.overview,
  tags: p.tags,
  demoUrl: p.demoUrl,
});

export const reviewListQuery = z.object({ submissionsPage: pageNumber, revisionsPage: pageNumber });

/** Oldest first, each list paged on its own. Screenshots are signed only for the page shown. */
export async function listReviews({ submissionsPage, revisionsPage }: z.infer<typeof reviewListQuery>) {
  const [submissions, revisions] = await Promise.all([
    prisma.project.findMany({
      where: { status: 'SUBMITTED' },
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      include: { owner: { select: { name: true, email: true } }, media: true },
      ...pageWindow(submissionsPage),
    }),
    prisma.projectRevision.findMany({
      where: { status: 'PENDING', project: { status: { in: ['PUBLISHED', 'HIDDEN'] } } },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      include: { project: { include: { owner: { select: { name: true, email: true } } } } },
      ...pageWindow(revisionsPage),
    }),
  ]);

  const submissionPage = toPage(submissions, submissionsPage, (p) => p);
  return {
    submissions: {
      ...submissionPage,
      items: await Promise.all(
        submissionPage.items.map(async (p) => ({
          id: p.id,
          ...content(p),
          stage: p.stage,
          owner: p.owner,
          submittedAt: p.submittedAt?.toISOString() ?? null,
          ownershipDeclaredAt: p.ownershipDeclaredAt?.toISOString() ?? null,
          screenshots: await signScreenshots(p.media),
          security: currentAudit(p),
        })),
      ),
    },
    revisions: toPage(revisions, revisionsPage, (r) => ({
      id: r.id,
      projectId: r.projectId,
      owner: r.project.owner,
      submittedAt: r.updatedAt.toISOString(),
      current: content(r.project),
      proposed: content(r),
      security: currentAudit(r),
    })),
  };
}

export async function approveProject(admin: AuthUser, id: string, input: ApprovalInput = {}) {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.status !== 'SUBMITTED') throw noSubmission();
  const security = securityGate(project, input);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.project.updateMany({
      where: { id, status: 'SUBMITTED' },
      data: { status: 'PUBLISHED', publishedAt: project.publishedAt ?? new Date(), reviewNote: null },
    });
    if (count === 0) throw noSubmission();
    await audit({ action: 'PROJECT_APPROVED', actorId: admin.id, targetType: 'Project', targetId: id, oldValue: 'SUBMITTED', newValue: 'PUBLISHED' }, tx);
    if (security.verdict === 'DANGEROUS') await audit({ action: 'SECURITY_OVERRIDE', actorId: admin.id, targetType: 'Project', targetId: id, reason: input.reason!.trim(), newValue: security.findings.map((f) => f.code).join(',') }, tx);
    await notify({ recipientId: project.ownerId, eventType: 'PROJECT_APPROVED', message: `"${project.title}" was approved and is now published.`, targetType: 'Project', targetId: id }, tx);
  }, TX_OPTIONS);
}

export async function requestChanges(admin: AuthUser, id: string, note: string) {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.status !== 'SUBMITTED') throw noSubmission();
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.project.updateMany({ where: { id, status: 'SUBMITTED' }, data: { status: 'CHANGES_REQUESTED', reviewNote: note } });
    if (count === 0) throw noSubmission();
    await audit({ action: 'PROJECT_CHANGES_REQUESTED', actorId: admin.id, targetType: 'Project', targetId: id, reason: note, oldValue: 'SUBMITTED', newValue: 'CHANGES_REQUESTED' }, tx);
    await notify({ recipientId: project.ownerId, eventType: 'PROJECT_CHANGES_REQUESTED', message: `An Admin asked for changes to "${project.title}".`, targetType: 'Project', targetId: id }, tx);
  }, TX_OPTIONS);
}

/** Copies the proposed content onto the live project in one transaction. */
export async function approveRevision(admin: AuthUser, revisionId: string, input: ApprovalInput = {}) {
  const revision = await prisma.projectRevision.findUnique({ where: { id: revisionId }, include: { project: true } });
  if (!revision || revision.status !== 'PENDING' || !['PUBLISHED', 'HIDDEN'].includes(revision.project.status)) throw noRevision();
  const security = securityGate(revision, input);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.projectRevision.updateMany({ where: { id: revisionId, status: 'PENDING' }, data: { status: 'APPROVED', reviewNote: null } });
    if (count === 0) throw noRevision();
    await tx.project.update({ where: { id: revision.projectId }, data: content(revision) });
    await audit({ action: 'REVISION_APPROVED', actorId: admin.id, targetType: 'Project', targetId: revision.projectId, reason: revisionId, oldValue: 'PENDING', newValue: 'APPROVED' }, tx);
    if (security.verdict === 'DANGEROUS') await audit({ action: 'SECURITY_OVERRIDE', actorId: admin.id, targetType: 'Project', targetId: revision.projectId, reason: input.reason!.trim(), newValue: security.findings.map((f) => f.code).join(',') }, tx);
    await notify({ recipientId: revision.project.ownerId, eventType: 'REVISION_APPROVED', message: `Your changes to "${revision.title}" were approved and are now live.`, targetType: 'Project', targetId: revision.projectId }, tx);
  }, TX_OPTIONS);
}

/** The previously approved content simply stays live. */
export async function rejectRevision(admin: AuthUser, revisionId: string, note: string) {
  const revision = await prisma.projectRevision.findUnique({ where: { id: revisionId }, include: { project: { select: { ownerId: true, title: true } } } });
  if (!revision || revision.status !== 'PENDING') throw noRevision();
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.projectRevision.updateMany({ where: { id: revisionId, status: 'PENDING' }, data: { status: 'REJECTED', reviewNote: note } });
    if (count === 0) throw noRevision();
    await audit({ action: 'REVISION_REJECTED', actorId: admin.id, targetType: 'Project', targetId: revision.projectId, reason: note, oldValue: 'PENDING', newValue: 'REJECTED' }, tx);
    await notify({ recipientId: revision.project.ownerId, eventType: 'REVISION_REJECTED', message: `Your changes to "${revision.project.title}" were not approved.`, targetType: 'Project', targetId: revision.projectId }, tx);
  }, TX_OPTIONS);
}
