import { z } from 'zod';
import { COPYRIGHT_TARGETS, REPORT_CATEGORIES, REPORT_TARGETS } from '../../domain.js';

const httpUrl = z
  .string()
  .trim()
  .max(500, 'The link must be at most 500 characters.')
  .url('Enter a full link, starting with https://.')
  .refine((v) => /^https?:\/\//i.test(v), 'Enter a link starting with http:// or https://.');

export const createReportSchema = z
  .object({
    targetType: z.enum(REPORT_TARGETS),
    targetId: z.string().trim().min(1).max(100),
    category: z.enum(REPORT_CATEGORIES, { errorMap: () => ({ message: 'Choose what kind of problem this is.' }) }),
    reason: z.string().trim().min(10, 'Explain what is wrong in at least 10 characters.').max(1000),
    // Copyright reports only.
    originalWorkUrl: httpUrl.optional().or(z.literal('').transform(() => undefined)),
    ownsWork: z.boolean().optional(),
  })
  .superRefine((input, ctx) => {
    if (input.category !== 'COPYRIGHT') {
      if (input.originalWorkUrl || input.ownsWork) ctx.addIssue({ code: 'custom', path: ['category'], message: 'A link to the original work and the ownership statement belong to copyright reports only.' });
      return;
    }
    if (!COPYRIGHT_TARGETS.includes(input.targetType)) ctx.addIssue({ code: 'custom', path: ['category'], message: 'Only a project, comment or offer can be reported for copyright.' });
    if (input.ownsWork !== true) ctx.addIssue({ code: 'custom', path: ['ownsWork'], message: 'Confirm that you own the work or are authorised to act for its owner.' });
  });

export const dismissReportSchema = z.object({
  note: z.string({ required_error: 'Give a reason for the decision.' }).trim().min(3, 'Give a reason for the decision.').max(1000),
});
