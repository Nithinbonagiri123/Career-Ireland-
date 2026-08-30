import { z } from 'zod';

const uuid = z.string().uuid();
const blank = z.literal('');

export const EmailProviderSchema = z.enum(['GMAIL', 'OUTLOOK', 'YAHOO', 'CUSTOM']);

export const UpsertEmailAccountSchema = z.object({
  personId: uuid,
  emailAddress: z.string().trim().email().max(200),
  /** Plaintext password from the form — encrypted at rest in the service. */
  password: z.string().min(1).max(500),
  provider: EmailProviderSchema.default('GMAIL'),
  imapHost: z.string().max(120).optional().or(blank),
  imapPort: z.coerce.number().int().min(1).max(65535).optional().nullable(),
  imapSecure: z.boolean().default(true),
  smtpHost: z.string().max(120).optional().or(blank),
  smtpPort: z.coerce.number().int().min(1).max(65535).optional().nullable(),
  smtpSecure: z.boolean().default(true),
  notes: z.string().max(1000).optional().or(blank),
  markSharedWithCandidate: z.boolean().default(false),
});

export const RevealPasswordSchema = z.object({
  personId: uuid,
  /** Free-text reason logged to audit — required for compliance. */
  reason: z.string().trim().min(4).max(500),
});

export const RemoveEmailAccountSchema = z.object({ personId: uuid });

export type UpsertEmailAccountInput = z.infer<typeof UpsertEmailAccountSchema>;
export type RevealPasswordInput = z.infer<typeof RevealPasswordSchema>;
export type RemoveEmailAccountInput = z.infer<typeof RemoveEmailAccountSchema>;
