import type { Prisma } from '@prisma/client';
import { audit } from '../../lib/audit.js';
import { HttpError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { notify } from '../notifications/service.js';
import { auditContent, scanImage, type AuditResult, type Finding, type ScannableContent } from './scanner.js';

/**
 * Runs the security audit when a project is submitted or a revision is proposed, logs the result,
 * and tells every active Admin when something needs a closer look. The owner is told nothing about
 * the findings: naming the rule that matched would only help someone get around it.
 */

export const contentOf = (p: ScannableContent): ScannableContent => ({
  title: p.title,
  summary: p.summary,
  problem: p.problem,
  overview: p.overview,
  tags: p.tags,
  demoUrl: p.demoUrl,
});

async function alertAdmins(message: string, projectId: string, client: Prisma.TransactionClient = prisma) {
  const admins = await client.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true } });
  for (const a of admins) await notify({ recipientId: a.id, eventType: 'SECURITY_ALERT', message, targetType: 'Project', targetId: projectId }, client);
}

/** Scans the content, logs the result and alerts Admins unless the verdict is WELL. */
export async function recordAudit(
  input: { projectId: string; revisionId?: string | null; title: string; content: ScannableContent; actorId: string },
  client: Prisma.TransactionClient = prisma,
): Promise<AuditResult> {
  const result = auditContent(input.content);
  // The record lives in the audit log: the verdict, which rules matched, and (for a change to a
  // live project) which revision. The review queue always re-checks the content as it stands.
  await audit(
    {
      action: 'SECURITY_AUDIT',
      actorId: input.actorId,
      targetType: 'Project',
      targetId: input.projectId,
      reason: [...new Set(result.findings.map((f) => f.code))].join(',').slice(0, 500) || undefined,
      oldValue: input.revisionId ?? undefined,
      newValue: result.verdict,
    },
    client,
  );
  if (result.verdict !== 'WELL') {
    const what = input.revisionId ? 'A change to' : 'The submission';
    await alertAdmins(`Security audit: ${what} "${input.title}" was marked ${result.verdict.toLowerCase()} (${result.findings.length} finding${result.findings.length === 1 ? '' : 's'}). Review it before approving.`, input.projectId, client);
  }
  return result;
}

/**
 * Images are applied without review, so a dangerous one is refused at the door instead of being
 * reported later. The refusal is logged and Admins are told who tried.
 */
export async function assertSafeImage(input: { projectId: string; title: string; actorId: string; ext: string; data: Buffer }): Promise<void> {
  const findings = scanImage(input.ext, input.data);
  if (findings.length === 0) return;
  await audit({ action: 'UNSAFE_UPLOAD_BLOCKED', actorId: input.actorId, targetType: 'Project', targetId: input.projectId, reason: findings.map((f) => f.code).join(',') });
  await alertAdmins(`Security audit: an image upload to "${input.title}" was blocked (${findings.map((f) => f.code).join(', ')}).`, input.projectId);
  throw new HttpError(400, 'UNSAFE_FILE', 'This image could not be accepted. Export it again as a plain PNG, JPEG or WebP and try once more.');
}

/** What the Admin review queue shows: always worked out from the content as it stands now. */
export function currentAudit(content: ScannableContent): { verdict: AuditResult['verdict']; findings: Finding[] } {
  return auditContent(contentOf(content));
}
