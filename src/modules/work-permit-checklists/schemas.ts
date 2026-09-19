import { z } from 'zod';

const blank = z.literal('');
const optionalDate = z.string().date().optional().or(blank);

const AnswerValueSchema = z.enum(['YES', 'NO', 'NA']).nullable();

/** One check row inside any of the three jsonb sections. */
export const ChecklistAnswerSchema = z.object({
  value: AnswerValueSchema.default(null),
  note: z.string().max(500).optional(),
});

/**
 * The whole submitted checklist body — no fixed keys inside the three
 * maps, so Tracey can add fields per client without a schema change.
 */
export const UpsertWorkPermitChecklistSchema = z.object({
  jobRequisitionId: z.string().uuid(),
  personId: z.string().uuid(),
  contractSignedOn: optionalDate,
  commencementDate: optionalDate,
  matchChecks: z.record(z.string(), ChecklistAnswerSchema).default({}),
  advertInfoChecks: z.record(z.string(), ChecklistAnswerSchema).default({}),
  documentsChecks: z.record(z.string(), ChecklistAnswerSchema).default({}),
  notes: z.string().max(4000).optional().or(blank),
});

export type UpsertWorkPermitChecklistInput = z.infer<typeof UpsertWorkPermitChecklistSchema>;
export type ChecklistAnswer = z.infer<typeof ChecklistAnswerSchema>;

/**
 * The canonical keys we render on the printable form + default UI. Tracey
 * can add more via free text but the form always shows these first.
 */
export const MATCH_CHECK_FIELDS = [
  { key: 'salary_match_advert', label: 'Salary Match JI Advert' },
  { key: 'hours_match_advert', label: 'Hours Match JI Advert' },
  { key: 'other_advert_match', label: 'Other Advert Match to JI' },
  { key: 'all_info_on_advert', label: 'Is all this information on the advert' },
] as const;

export const ADVERT_INFO_FIELDS = [
  { key: 'description_of_job', label: 'Description of Job' },
  { key: 'name_of_employer', label: 'Name of Employer' },
  { key: 'min_annual_salary', label: 'Minimum Annual Salary' },
  { key: 'location_of_employment', label: 'Location of Employment' },
  { key: 'hours_of_work', label: 'Hours of Work' },
] as const;

/**
 * Default doc checklist rows. Each key is the `document_types.code` we
 * already seeded — that way ticking a row here can later cross-reference
 * whether the doc was actually uploaded.
 */
export const DOC_CHECK_FIELDS = [
  { key: 'CV', label: 'CV' },
  { key: 'PASSPORT_BIOMETRIC', label: 'Biometric Page of Passport' },
  { key: 'DRIVER_LICENCE_FB', label: "Driver's Licence — Front & Back" },
  { key: 'DRIVER_LICENCE_LOE', label: 'Driver Licence Letter of Entitlement' },
  { key: 'CERTIFICATES_DIPLOMAS', label: 'Certificates / Diplomas' },
  { key: 'SUBJECTS_LIST', label: 'List of Subjects Taken' },
  { key: 'PASSPORT_PHOTO', label: 'Passport Photo' },
  { key: 'PROOF_OF_ADDRESS', label: 'Proof of Current Address' },
  { key: 'REFERENCE_LETTER', label: 'Reference Letter from Employer' },
  { key: 'NARIC_REFERENCE', label: 'NARIC Reference' },
  { key: 'POLICE_CLEARANCE', label: 'Police Clearance' },
  { key: 'MOTIVATION_LETTER', label: 'Motivation Letter' },
  { key: 'IRP_CARD', label: 'IRP Card' },
  { key: 'PPS_NUMBER', label: 'PPS Number' },
] as const;
