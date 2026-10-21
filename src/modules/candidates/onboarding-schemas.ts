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
    .optional(),
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
  /**
   * Primary occupation this candidate is entering the pool as
   * (Plumber, Electrician, etc.). Set on candidate_profiles at finalise;
   * used later by the Matching algorithm to score candidates against
   * requisitions. Optional — can be added on the candidate detail page
   * after onboarding if not known at intake time.
   */
  primaryOccupationId: z.string().uuid().optional().or(z.literal('')),
  /**
   * Stage 6G Screen 09 — the services this payment covers. When
   * provided, the amounts must sum to payment.amount; the invoice line
   * then names the actual services sold and the engagement is tagged
   * with the first one instead of the generic "Candidate Onboarding"
   * catalogue item.
   */
  services: z
    .array(
      z.object({
        serviceCatalogItemId: z.string().uuid(),
        name: z.string().trim().min(1).max(200),
        amount: z
          .string()
          .regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a positive number with up to 2 decimals'),
      }),
    )
    .max(20)
    .optional(),
});
export type FinaliseDraftInput = z.infer<typeof FinaliseDraftSchema>;

/**
 * Stage B Wave 4 — complimentary (€0.00) intake. No payment section at
 * all: the grant needs a currency (for the engagement/invoice rows), a
 * mandatory substantive reason, and optionally the specific services
 * being granted (names only — there are no amounts to reconcile).
 */
export const FinaliseDraftComplimentarySchema = z.object({
  personId: z.string().uuid(),
  currencyCode: z.string().length(3),
  reason: z
    .string()
    .trim()
    .min(
      10,
      'Give a real reason (at least 10 characters) — it appears on the audit trail and the invoice.',
    )
    .max(500),
  coverLetter: z.string().trim().max(10_000).optional().or(z.literal('')),
  primaryOccupationId: z.string().uuid().optional().or(z.literal('')),
  services: z
    .array(
      z.object({
        serviceCatalogItemId: z.string().uuid(),
        name: z.string().trim().min(1).max(200),
      }),
    )
    .max(20)
    .optional(),
});
export type FinaliseDraftComplimentaryInput = z.infer<typeof FinaliseDraftComplimentarySchema>;

/**
 * Walk-in path: create the candidate NOW, invoice later. Skips the
 * payment section entirely — no invoice, no engagement, no receipt.
 * Same audit trail flag ("via: onboarding_walk_in") so support can
 * distinguish these later. Staff raise an invoice from the candidate
 * profile whenever cash actually shows up.
 */
export const FinaliseDraftWithoutPaymentSchema = z.object({
  personId: z.string().uuid(),
  coverLetter: z.string().trim().max(10_000).optional().or(z.literal('')),
  primaryOccupationId: z.string().uuid().optional().or(z.literal('')),
});
export type FinaliseDraftWithoutPaymentInput = z.infer<typeof FinaliseDraftWithoutPaymentSchema>;
