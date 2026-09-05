import { z } from 'zod';

/**
 * Zod schemas for the candidate-onboarding form.
 *
 * The form is one long page divided into sections. Each section auto-saves
 * as staff tabs away; the final `FinaliseSchema` is what the big Create
 * button submits. **Every field is optional** except first + last name and
 * the payment section — a candidate row you can't identify or bill for is
 * useless in every downstream list.
 */

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined));

/** Persistence patch: any subset of the personal / contact section. */
export const UpdateDraftPersonSchema = z.object({
  personId: z.string().uuid(),
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  dateOfBirth: optionalString(10), // YYYY-MM-DD
  nationality: optionalString(80),
  email: z.string().trim().email('Enter a valid email').max(200).optional().or(z.literal('')),
  phone: optionalString(30),
  currentCity: optionalString(120),
  currentCountry: optionalString(80),
  source: z.enum(['DIRECT', 'REFERRAL', 'ADVERTISEMENT', 'EMPLOYER_REFERRAL', 'OTHER']).optional(),
  notes: optionalString(2000),
});
export type UpdateDraftPersonInput = z.infer<typeof UpdateDraftPersonSchema>;

/** Free-text CV summary + cover letter — one big scrollable block on the form. */
export const UpdateDraftNarrativeSchema = z.object({
  personId: z.string().uuid(),
  profileSummary: optionalString(4000),
  coverLetter: optionalString(10_000),
  yearsOfExperience: optionalString(20),
  workEligibility: optionalString(200),
  preferredLocation: optionalString(200),
  primaryOccupationId: z.string().uuid().optional().or(z.literal('')),
});
export type UpdateDraftNarrativeInput = z.infer<typeof UpdateDraftNarrativeSchema>;

/** Payment section — required to Create. All fields validated on final submit. */
export const OnboardingPaymentSchema = z.object({
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a positive number with up to 2 decimals'),
  currencyCode: z.string().length(3),
  method: z.enum(['BANK_TRANSFER', 'CASH', 'OTHER']),
  proofReference: z.string().trim().max(200).optional().or(z.literal('')),
  receivedAt: z.string().date(),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});
export type OnboardingPaymentInput = z.infer<typeof OnboardingPaymentSchema>;

/**
 * Final Create submission. Validates the minimum-required + payment section;
 * everything else the caller has already auto-saved on the draft person.
 */
export const FinaliseDraftSchema = z.object({
  personId: z.string().uuid(),
  /** Names are pulled from the draft row on the server; we require them to be set. */
  payment: OnboardingPaymentSchema,
  /** Optional cover letter — stored on candidate profile if provided. */
  coverLetter: z.string().trim().max(10_000).optional().or(z.literal('')),
});
export type FinaliseDraftInput = z.infer<typeof FinaliseDraftSchema>;
