import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './_shared';
import { persons } from './persons';
import { users } from './users';

/**
 * The client creates a dedicated email account for each candidate (typically Gmail) and
 * shares the credentials with the candidate so both parties can manage applications
 * from the same inbox. The password is stored encrypted at rest (AES-256-GCM) and must
 * be decryptable — see `src/lib/crypto/secret-box.ts`. Access to plaintext credentials
 * is a HIGH-sensitivity operation and must be audited on every read.
 */
export const candidateEmailAccounts = pgTable(
  'candidate_email_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    personId: uuid('person_id')
      .notNull()
      .unique()
      .references(() => persons.id),
    emailAddress: varchar('email_address', { length: 200 }).notNull(),
    /** AES-256-GCM ciphertext blob (versioned envelope, base64). Never log. */
    passwordCiphertext: text('password_ciphertext').notNull(),
    provider: text('provider', {
      enum: ['GMAIL', 'OUTLOOK', 'YAHOO', 'CUSTOM'],
    })
      .notNull()
      .default('GMAIL'),
    imapHost: varchar('imap_host', { length: 120 }),
    imapPort: integer('imap_port'),
    imapSecure: boolean('imap_secure').notNull().default(true),
    smtpHost: varchar('smtp_host', { length: 120 }),
    smtpPort: integer('smtp_port'),
    smtpSecure: boolean('smtp_secure').notNull().default(true),
    /** When credentials were disclosed to the candidate (for the shared-access model). */
    sharedWithCandidateAt: timestamp('shared_with_candidate_at', { withTimezone: true }),
    lastRotatedAt: timestamp('last_rotated_at', { withTimezone: true }),
    notes: text('notes'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('candidate_email_accounts_email_idx').on(t.emailAddress),
    index('candidate_email_accounts_person_idx').on(t.personId),
  ],
);

export type CandidateEmailAccount = typeof candidateEmailAccounts.$inferSelect;
export type NewCandidateEmailAccount = typeof candidateEmailAccounts.$inferInsert;
