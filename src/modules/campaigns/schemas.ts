import { z } from 'zod';

export const CampaignStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']);
export const AdStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'CLOSED']);
export const ProspectStatusSchema = z.enum([
  'NEW',
  'SCREENED',
  'CONVERTED_TO_CANDIDATE',
  'RETAINED_IN_POOL',
  'NOT_SUITABLE',
]);

const optionalUuid = z.string().uuid().optional().or(z.literal(''));
const reason = z
  .string()
  .trim()
  .min(3, 'Give a reason of at least 3 characters')
  .max(500, 'Keep the reason under 500 characters');

/**
 * R4 — create / edit a campaign's details. Status is never set here: new
 * campaigns start as DRAFT and move only through TransitionCampaignSchema.
 * Two kinds (owner decision 7): a talent pool (no job, no employer) or a
 * job campaign (an advertisable job). The campaign stores only the job;
 * its employer is the job's employer. `employerId` is an optional
 * cross-check only — it must match the job's employer and is refused
 * without a job.
 */
export const SaveCampaignSchema = z.object({
  id: z.string().uuid().optional(),
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(200, 'Keep the name under 200 characters'),
  employerId: optionalUuid,
  jobRequisitionId: optionalUuid,
  notes: z.string().max(2000).optional().or(z.literal('')),
});

export const TransitionCampaignSchema = z
  .object({
    campaignId: z.string().uuid(),
    /** ACTIVE from PAUSED is "resume". */
    to: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']),
    reason: z.string().max(500).optional().or(z.literal('')),
  })
  .superRefine((v, ctx) => {
    if (v.to === 'CANCELLED' && (v.reason ?? '').trim().length < 3) {
      ctx.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'Give a reason of at least 3 characters',
      });
    }
  });

export const UpsertAdSchema = z.object({
  id: z.string().uuid().optional(),
  campaignId: z.string().uuid(),
  country: z.string().trim().min(2, 'Enter a country').max(80),
  platform: z.string().max(120).optional().or(z.literal('')),
  targetApplicants: z.number().int().min(1, 'Target must be at least 1').max(9999),
  startDate: z.string().date('Enter a start date'),
  expiryDate: z.string().date('Enter an expiry date'),
  reminderOn: z.string().date().optional().or(z.literal('')),
  status: AdStatusSchema,
  notes: z.string().max(2000).optional().or(z.literal('')),
});

/** Capture a prospect: an existing person, or a new one (duplicate-checked). */
export const CreateProspectSchema = z
  .object({
    advertisementId: z.string().uuid('Choose an advertisement'),
    personId: optionalUuid,
    newPerson: z
      .object({
        firstName: z.string().trim().min(1, 'Enter a first name').max(100),
        lastName: z.string().trim().min(1, 'Enter a last name').max(100),
        email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
        phone: z.string().trim().max(40).optional().or(z.literal('')),
      })
      .optional(),
    notes: z.string().max(1000).optional().or(z.literal('')),
    /** The user confirmed a same-name match is a different person (audited). */
    confirmDifferentPerson: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    const hasPerson = Boolean(v.personId);
    if (hasPerson === Boolean(v.newPerson)) {
      ctx.addIssue({
        code: 'custom',
        path: ['personId'],
        message: 'Choose an existing person or enter a new one',
      });
    }
    if (v.newPerson && !v.newPerson.email && !v.newPerson.phone) {
      ctx.addIssue({
        code: 'custom',
        path: ['newPerson', 'email'],
        message: 'Enter an email or phone so duplicates can be checked',
      });
    }
  });

/** Manual status moves. Conversion has its own hand-off (ConvertProspectSchema). */
export const UpdateProspectStatusSchema = z
  .object({
    prospectId: z.string().uuid(),
    status: z.enum(['NEW', 'SCREENED', 'RETAINED_IN_POOL', 'NOT_SUITABLE']),
    notes: z.string().max(500).optional().or(z.literal('')),
  })
  .superRefine((v, ctx) => {
    if (v.status === 'NOT_SUITABLE' && (v.notes ?? '').trim().length < 3) {
      ctx.addIssue({
        code: 'custom',
        path: ['notes'],
        message: 'Give a reason of at least 3 characters',
      });
    }
  });

export const AddProspectNoteSchema = z.object({
  prospectId: z.string().uuid(),
  note: z
    .string()
    .trim()
    .min(3, 'Write at least 3 characters')
    .max(1000, 'Keep the note under 1000 characters'),
});

/** Set or clear (dueOn = '') the prospect's follow-up, kept as a task. */
export const SetProspectFollowUpSchema = z.object({
  prospectId: z.string().uuid(),
  dueOn: z.string().date('Enter a valid date').or(z.literal('')),
  assignedUserId: optionalUuid,
});

export const ConvertProspectSchema = z.object({
  prospectId: z.string().uuid(),
  confirmed: z.literal(true, { error: 'Tick the confirmation to convert this prospect' }),
  /** Also shortlist on the campaign's job (R2 shortlist path). Never creates an application. */
  shortlistOnJob: z.boolean().optional(),
  notes: z.string().max(500).optional().or(z.literal('')),
});

/** Cross-campaign prospect list filter. All fields optional. */
export const ListProspectsSchema = z.object({
  status: ProspectStatusSchema.optional(),
  campaignId: z.string().uuid().optional(),
  country: z.string().min(1).max(80).optional(),
  q: z.string().min(1).max(120).optional(),
});

export const ArchiveCampaignSchema = z.object({
  campaignId: z.string().uuid(),
  reason,
});

export const UnarchiveCampaignSchema = z.object({
  campaignId: z.string().uuid(),
  reason,
});

export type SaveCampaignInput = z.input<typeof SaveCampaignSchema>;
export type TransitionCampaignInput = z.input<typeof TransitionCampaignSchema>;
export type UpsertAdInput = z.input<typeof UpsertAdSchema>;
export type CreateProspectInput = z.input<typeof CreateProspectSchema>;
export type UpdateProspectStatusInput = z.input<typeof UpdateProspectStatusSchema>;
export type AddProspectNoteInput = z.input<typeof AddProspectNoteSchema>;
export type SetProspectFollowUpInput = z.input<typeof SetProspectFollowUpSchema>;
export type ConvertProspectInput = z.input<typeof ConvertProspectSchema>;
export type ListProspectsInput = z.infer<typeof ListProspectsSchema>;
export type ArchiveCampaignInput = z.input<typeof ArchiveCampaignSchema>;
export type UnarchiveCampaignInput = z.input<typeof UnarchiveCampaignSchema>;
