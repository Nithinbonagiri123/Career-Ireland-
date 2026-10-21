import { z } from 'zod';

/**
 * Stage B Wave 4 — input for a complimentary (€0.00) service grant.
 * Kept in its own module (no auth/db imports) so vitest can exercise the
 * validation matrix without the next-auth module graph.
 */
export const GrantComplimentaryServiceSchema = z.object({
  personId: z.string().uuid(),
  serviceCatalogItemId: z.string().uuid(),
  currencyCode: z.string().length(3),
  /** Mandatory, substantive reason — mirrored by the DB CHECK. */
  reason: z
    .string()
    .trim()
    .min(
      10,
      'Give a real reason (at least 10 characters) — it appears on the audit trail and the invoice.',
    )
    .max(500),
  /** One key per dialog mount; retries replay instead of re-issuing. */
  idempotencyKey: z.string().min(8).max(100),
});
export type GrantComplimentaryServiceInput = z.infer<typeof GrantComplimentaryServiceSchema>;
