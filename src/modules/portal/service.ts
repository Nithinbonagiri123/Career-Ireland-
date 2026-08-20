import { randomBytes } from 'node:crypto';
import { eq, gt } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { type PortalInvitation, portalInvitations, users } from '@/lib/db/schema/users';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import { hashPassword } from '@/modules/auth/service';
import {
  type AcceptInvitationInput,
  AcceptInvitationSchema,
  type InviteCandidateInput,
  InviteCandidateSchema,
  type InviteEmployerInput,
  InviteEmployerSchema,
} from './schemas';

const INVITE_TTL_HOURS = 72;

function generateToken(): string {
  // 32 bytes base64url ≈ 43 chars. Fits in varchar(64).
  return randomBytes(32).toString('base64url');
}

async function createInvitation(args: {
  userType: 'CANDIDATE' | 'EMPLOYER';
  personId?: string;
  employerId?: string;
  email: string;
  fullName: string;
  actorUserId: string;
}): Promise<PortalInvitation> {
  const emailLower = args.email.trim().toLowerCase();

  return db.transaction(async (tx) => {
    // Reject if a user with that email already exists.
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, emailLower))
      .limit(1);
    if (existing) {
      throw new BusinessRuleError(
        'USER_EMAIL_EXISTS',
        `${emailLower} already has a user account. Deactivate/rename first if you want a fresh portal invite.`,
      );
    }

    // Only one active (unexpired, unaccepted) invitation per target at a time.
    const now = new Date();
    if (args.userType === 'CANDIDATE' && !args.personId) {
      throw new Error('personId required for CANDIDATE invitation');
    }
    if (args.userType === 'EMPLOYER' && !args.employerId) {
      throw new Error('employerId required for EMPLOYER invitation');
    }
    const scopeFilter =
      args.userType === 'CANDIDATE'
        ? eq(portalInvitations.personId, args.personId as string)
        : eq(portalInvitations.employerId, args.employerId as string);
    const activeInvites = await tx.select().from(portalInvitations).where(scopeFilter);
    for (const inv of activeInvites) {
      if (!inv.acceptedAt && inv.expiresAt > now) {
        throw new BusinessRuleError(
          'INVITE_ALREADY_ACTIVE',
          'An unexpired invitation already exists for this target. Wait for it to expire or ask the user to accept it.',
        );
      }
    }

    const expiresAt = new Date(now.getTime() + INVITE_TTL_HOURS * 60 * 60 * 1000);
    const token = generateToken();
    const [row] = await tx
      .insert(portalInvitations)
      .values({
        token,
        userType: args.userType,
        personId: args.personId,
        employerId: args.employerId,
        email: emailLower,
        fullName: args.fullName.trim(),
        createdByUserId: args.actorUserId,
        expiresAt,
      })
      .returning();
    if (!row) throw new Error('portal_invitations insert returned no row');

    await recordAudit(tx, {
      actorUserId: args.actorUserId,
      entityType: 'portal_invitation',
      entityId: row.id,
      action: 'CREATED',
      after: {
        userType: row.userType,
        email: row.email,
        expiresAt: row.expiresAt.toISOString(),
      },
    });

    return row;
  });
}

export async function inviteCandidate(input: InviteCandidateInput): Promise<PortalInvitation> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const parsed = InviteCandidateSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid invitation',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  return createInvitation({
    userType: 'CANDIDATE',
    personId: parsed.data.personId,
    email: parsed.data.email,
    fullName: parsed.data.fullName,
    actorUserId: session.user.id,
  });
}

export async function inviteEmployer(input: InviteEmployerInput): Promise<PortalInvitation> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const parsed = InviteEmployerSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid invitation',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  return createInvitation({
    userType: 'EMPLOYER',
    employerId: parsed.data.employerId,
    email: parsed.data.email,
    fullName: parsed.data.fullName,
    actorUserId: session.user.id,
  });
}

// --------- Public (no auth) — invitation acceptance flow ---------

export async function fetchInvitation(token: string): Promise<PortalInvitation | null> {
  const [row] = await db
    .select()
    .from(portalInvitations)
    .where(eq(portalInvitations.token, token))
    .limit(1);
  if (!row) return null;
  return row;
}

export async function acceptInvitation(input: AcceptInvitationInput): Promise<{ email: string }> {
  const parsed = AcceptInvitationSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid invitation acceptance',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }

  const now = new Date();
  return db.transaction(async (tx) => {
    const [inv] = await tx
      .select()
      .from(portalInvitations)
      .where(eq(portalInvitations.token, parsed.data.token))
      .limit(1);
    if (!inv) throw new BusinessRuleError('INVITE_NOT_FOUND', 'Invitation not found');
    if (inv.acceptedAt) {
      throw new BusinessRuleError('INVITE_ALREADY_USED', 'This invitation has already been used');
    }
    if (inv.expiresAt < now) {
      throw new BusinessRuleError('INVITE_EXPIRED', 'This invitation has expired');
    }

    // Race safety: another user might exist with this email now.
    const [existingUser] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, inv.email))
      .limit(1);
    if (existingUser) {
      throw new BusinessRuleError(
        'USER_EMAIL_EXISTS',
        'A user account with that email was created after this invitation. Contact Career Ireland.',
      );
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const [newUser] = await tx
      .insert(users)
      .values({
        email: inv.email,
        fullName: inv.fullName,
        passwordHash,
        role: inv.userType,
        personId: inv.userType === 'CANDIDATE' ? inv.personId : null,
        employerId: inv.userType === 'EMPLOYER' ? inv.employerId : null,
      })
      .returning();
    if (!newUser) throw new Error('users insert returned no row');

    await tx
      .update(portalInvitations)
      .set({ acceptedAt: now, acceptedUserId: newUser.id })
      .where(eq(portalInvitations.id, inv.id));

    await recordAudit(tx, {
      actorUserId: newUser.id,
      entityType: 'portal_invitation',
      entityId: inv.id,
      action: 'ACCEPTED',
      after: { acceptedUserId: newUser.id, userRole: newUser.role },
    });
    await recordAudit(tx, {
      actorUserId: newUser.id,
      entityType: 'user',
      entityId: newUser.id,
      action: 'CREATED',
      after: { email: newUser.email, role: newUser.role },
      context: { via: 'portal_invitation', invitationId: inv.id },
    });

    return { email: inv.email };
  });
}

/** Recent invitations for the staff admin view. */
export async function listRecentInvitations(): Promise<PortalInvitation[]> {
  await requireRole(['ADMIN', 'STAFF']);
  return db
    .select()
    .from(portalInvitations)
    .where(gt(portalInvitations.createdAt, new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)));
}
