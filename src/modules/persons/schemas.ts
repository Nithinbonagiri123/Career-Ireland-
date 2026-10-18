import { z } from 'zod';

export const PersonSourceSchema = z.enum([
  'DIRECT',
  'REFERRAL',
  'ADVERTISEMENT',
  'EMPLOYER_REFERRAL',
  'OTHER',
]);

/** Stage 6G Screen 02 — captured on New Lead form. */
export const EmploymentStatusSchema = z.enum([
  'EMPLOYED',
  'UNEMPLOYED',
  'SELF_EMPLOYED',
  'STUDENT',
  'RETIRED',
  'OTHER',
]);

/** Stage 6G Screen 02 — captured on New Lead form. Distinct from
 *  `irishImmigrationStatus` (current stamp): this is the broader
 *  work-eligibility classification used for lead triage. */
export const WorkEligibilitySchema = z.enum([
  'IRISH_CITIZEN',
  'EU_EEA_SWISS_CITIZEN',
  'UK_CITIZEN',
  'STAMP_4_HOLDER',
  'VISA_REQUIRED',
  'OTHER',
  'NOT_SURE',
]);

/**
 * Base person schema — used by lead creation for all three business
 * lines. All new fields are optional here so Recruitment and Immigration
 * flows keep working unchanged. The Candidate Services lead-creation
 * schema (modules/leads/schemas.ts) adds a superRefine that marks
 * email, phone, addressLine1, currentCountry, currentCity, and
 * primaryOccupationId as required for CS leads only.
 */
export const CreatePersonSchema = z.object({
  firstName: z.string().min(1, 'First name required').max(100),
  /** Optional for every business line. */
  middleName: z.string().max(100).optional().or(z.literal('')),
  lastName: z.string().min(1, 'Last name required').max(100),
  email: z.string().email().max(200).optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
  dateOfBirth: z.string().date().optional().or(z.literal('')),
  nationality: z.string().max(80).optional().or(z.literal('')),
  currentCountry: z.string().max(80).optional().or(z.literal('')),
  currentCity: z.string().max(120).optional().or(z.literal('')),
  /** Street address — Stage 1 adds these; nullable in schema so
   *  Recruitment / Immigration persons don't need to fill them. */
  addressLine1: z.string().max(255).optional().or(z.literal('')),
  addressLine2: z.string().max(255).optional().or(z.literal('')),
  /** Stage 6G Screen 02 — residential postcode (optional). */
  postcode: z.string().max(20).optional().or(z.literal('')),
  /** Primary profession at identity level. FK to occupations.id.
   *  Validated against the occupations catalog in the service. */
  primaryOccupationId: z.string().uuid().optional().or(z.literal('')),
  /** Stage 6G Screen 02 — Professional information section. All
   *  optional; the operator can skip them and fill in later from the
   *  candidate workspace. */
  yearsOfExperience: z.string().max(60).optional().or(z.literal('')),
  employmentStatus: EmploymentStatusSchema.optional().or(z.literal('')),
  professionalSummary: z.string().max(4000).optional().or(z.literal('')),
  /** Stage 6G Screen 02 — Immigration & eligibility section. */
  workEligibility: WorkEligibilitySchema.optional().or(z.literal('')),
  /** Three-state: true (Yes) / false (No) / undefined (not asked). */
  currentlyInIreland: z.boolean().optional(),
  source: PersonSourceSchema,
  notes: z.string().max(2000).optional().or(z.literal('')),
  /** Stage 6E+1 — structured Irish immigration status captured on the
   *  lead form. Optional for every business line; Stage 6E stored this
   *  with a `[Irish immigration status: X]` marker in notes which the
   *  Stage 6E+1 migration 0055 lifted into a dedicated column. The UI
   *  now writes directly to this field. */
  irishImmigrationStatus: z
    .enum([
      'NONE',
      'STAMP_1',
      'STAMP_1G',
      'STAMP_2',
      'STAMP_3',
      'STAMP_4',
      'OTHER',
      'PENDING',
      'NOT_PROVIDED',
    ])
    .nullish()
    .or(z.literal('')),
});

/**
 * Edit an existing person. Same fields as create except `source` — that's a
 * one-shot classification of how the person entered the system, not something
 * to retroactively edit. Every other field is fair game (typos, phone
 * changes, moving city, etc.) with the same validation as create.
 */
export const UpdatePersonSchema = z.object({
  personId: z.string().uuid(),
  firstName: z.string().min(1, 'First name required').max(100),
  /** Stage 6F Phase 3 — captured on CS lead form; now editable too. */
  middleName: z.string().max(100).optional().or(z.literal('')),
  lastName: z.string().min(1, 'Last name required').max(100),
  email: z.string().email().max(200).optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
  dateOfBirth: z.string().date().optional().or(z.literal('')),
  nationality: z.string().max(80).optional().or(z.literal('')),
  currentCountry: z.string().max(80).optional().or(z.literal('')),
  currentCity: z.string().max(120).optional().or(z.literal('')),
  /** Stage 6F Phase 3 — street-address lines captured on CS lead; now editable. */
  addressLine1: z.string().max(255).optional().or(z.literal('')),
  addressLine2: z.string().max(255).optional().or(z.literal('')),
  /** Stage 6G Screen 02 — residential postcode (optional). */
  postcode: z.string().max(20).optional().or(z.literal('')),
  /** Stage 6G Screen 02 — Professional information + eligibility
   *  captured at intake; editable from workspace. workEligibility is
   *  intentionally a free-form string here (not the strict enum used on
   *  create) because historical candidate_profiles.work_eligibility
   *  values may be legacy text. The edit UI still populates it from the
   *  same enum dropdown. */
  employmentStatus: EmploymentStatusSchema.optional().or(z.literal('')),
  professionalSummary: z.string().max(4000).optional().or(z.literal('')),
  workEligibility: z.string().max(200).optional().or(z.literal('')),
  currentlyInIreland: z.boolean().optional(),
  /** Stage 6F Phase 3 — structured Irish immigration status; now editable
   *  via the workspace. Values mirror the enum in CreatePersonSchema. */
  irishImmigrationStatus: z
    .enum([
      'NONE',
      'STAMP_1',
      'STAMP_1G',
      'STAMP_2',
      'STAMP_3',
      'STAMP_4',
      'OTHER',
      'PENDING',
      'NOT_PROVIDED',
    ])
    .nullish()
    .or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
  /**
   * Optional candidate_profiles fields. Only applied when the person has an
   * active candidate profile — the service silently ignores them for leads/
   * prospects/unactivated persons so the same dialog can be shown to any
   * person without runtime errors.
   */
  primaryOccupationId: z.string().uuid().optional().or(z.literal('')),
  yearsOfExperience: z.string().max(60).optional().or(z.literal('')),
  // workEligibility is defined above as the enum-typed Stage 6G field;
  // the service writes it to persons AND copies to candidate_profiles.
  preferredLocation: z.string().max(200).optional().or(z.literal('')),
  profileSummary: z.string().max(4000).optional().or(z.literal('')),
});

export const FindSimilarSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().optional(),
  phone: z.string().optional(),
});

export const MergePersonsSchema = z.object({
  loserPersonId: z.string().uuid(),
  survivorPersonId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export const ArchivePersonSchema = z.object({
  personId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export const UnarchivePersonSchema = z.object({
  personId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export type CreatePersonInput = z.infer<typeof CreatePersonSchema>;
export type UpdatePersonInput = z.infer<typeof UpdatePersonSchema>;
export type FindSimilarInput = z.infer<typeof FindSimilarSchema>;
export type MergePersonsInput = z.infer<typeof MergePersonsSchema>;
export type ArchivePersonInput = z.infer<typeof ArchivePersonSchema>;
export type UnarchivePersonInput = z.infer<typeof UnarchivePersonSchema>;
