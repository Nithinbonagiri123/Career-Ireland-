import { eq, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireInternalStaff } from '@/lib/auth/session';
import { open, seal } from '@/lib/crypto/secret-box';
import { db } from '@/lib/db/client';
import { type CandidateEmailAccount, candidateEmailAccounts } from '@/lib/db/schema/email_accounts';
import { BusinessRuleError, NotFoundError, ValidationError } from '@/lib/errors';
import {
  type RemoveEmailAccountInput,
  RemoveEmailAccountSchema,
  type RevealPasswordInput,
  RevealPasswordSchema,
  type UpsertEmailAccountInput,
  UpsertEmailAccountSchema,
} from './schemas';

function blankToNull(v: string | undefined | null): string | null {
  return v && v.trim().length > 0 ? v : null;
}

/** Metadata-only view — never exposes the ciphertext or plaintext. */
export type EmailAccountView = Omit<CandidateEmailAccount, 'passwordCiphertext'> & {
  hasPassword: true;
};

function toView(row: CandidateEmailAccount): EmailAccountView {
  const { passwordCiphertext: _pw, ...rest } = row;
  return { ...rest, hasPassword: true };
}

export async function getEmailAccountForCandidate(
  personId: string,
): Promise<EmailAccountView | null> {
  await requireInternalStaff();
  const [row] = await db
    .select()
    .from(candidateEmailAccounts)
    .where(eq(candidateEmailAccounts.personId, personId))
    .limit(1);
  return row ? toView(row) : null;
}

export async function upsertEmailAccount(
  input: UpsertEmailAccountInput,
): Promise<EmailAccountView> {
  const session = await requireInternalStaff();
  const parsed = UpsertEmailAccountSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid email account',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;
  const ciphertext = seal(d.password);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(candidateEmailAccounts)
      .where(eq(candidateEmailAccounts.personId, d.personId))
      .limit(1);

    const commonValues = {
      emailAddress: d.emailAddress,
      passwordCiphertext: ciphertext,
      provider: d.provider,
      imapHost: blankToNull(d.imapHost ?? undefined),
      imapPort: d.imapPort ?? null,
      imapSecure: d.imapSecure,
      smtpHost: blankToNull(d.smtpHost ?? undefined),
      smtpPort: d.smtpPort ?? null,
      smtpSecure: d.smtpSecure,
      notes: blankToNull(d.notes ?? undefined),
      sharedWithCandidateAt: d.markSharedWithCandidate
        ? new Date()
        : (existing?.sharedWithCandidateAt ?? null),
    };

    if (existing) {
      const [after] = await tx
        .update(candidateEmailAccounts)
        .set({ ...commonValues, lastRotatedAt: new Date(), updatedAt: sql`NOW()` })
        .where(eq(candidateEmailAccounts.id, existing.id))
        .returning();
      if (!after) throw new Error('update returned no row');
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'candidate_email_account',
        entityId: after.id,
        action: 'PASSWORD_ROTATED',
        before: { emailAddress: existing.emailAddress },
        after: { emailAddress: after.emailAddress },
      });
      return toView(after);
    }

    const [created] = await tx
      .insert(candidateEmailAccounts)
      .values({
        personId: d.personId,
        createdByUserId: session.user.id,
        ...commonValues,
      })
      .returning();
    if (!created) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'candidate_email_account',
      entityId: created.id,
      action: 'CREATED',
      after: { personId: created.personId, emailAddress: created.emailAddress },
    });
    return toView(created);
  });
}

/**
 * Reveal the plaintext password to an authorized user. Every reveal is audited
 * with the caller-supplied reason — this is HIGH-sensitivity access.
 */
export async function revealPassword(input: RevealPasswordInput): Promise<string> {
  const session = await requireInternalStaff();
  const parsed = RevealPasswordSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Reason required (min 4 chars) to reveal a password',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const [row] = await db
    .select()
    .from(candidateEmailAccounts)
    .where(eq(candidateEmailAccounts.personId, parsed.data.personId))
    .limit(1);
  if (!row) throw new NotFoundError('Email account');

  let plaintext: string;
  try {
    plaintext = open(row.passwordCiphertext);
  } catch {
    throw new BusinessRuleError(
      'DECRYPT_FAILED',
      'Unable to decrypt password — check EMAIL_CRED_ENC_KEY',
    );
  }

  await recordAudit(db, {
    actorUserId: session.user.id,
    entityType: 'candidate_email_account',
    entityId: row.id,
    action: 'PASSWORD_REVEALED',
    context: { reason: parsed.data.reason },
  });

  return plaintext;
}

export async function removeEmailAccount(input: RemoveEmailAccountInput): Promise<void> {
  const session = await requireInternalStaff();
  const parsed = RemoveEmailAccountSchema.parse(input);
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(candidateEmailAccounts)
      .where(eq(candidateEmailAccounts.personId, parsed.personId))
      .limit(1);
    if (!before) return;
    await tx.delete(candidateEmailAccounts).where(eq(candidateEmailAccounts.id, before.id));
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'candidate_email_account',
      entityId: before.id,
      action: 'DELETED',
      before: { emailAddress: before.emailAddress, personId: before.personId },
    });
  });
}
