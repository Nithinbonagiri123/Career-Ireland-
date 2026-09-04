import { eq } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { checkPasswordPolicy } from '@/lib/auth/password-policy';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema/users';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import { hashPassword } from '@/modules/auth/service';
import { listUsers, type UserListRow, updateUserActive, updateUserRole } from './repository';
import {
  type ChangeRoleInput,
  ChangeRoleSchema,
  CreateUserSchema,
  type SetActiveInput,
  SetActiveSchema,
} from './schemas';

export async function fetchUsers(): Promise<UserListRow[]> {
  await requireRole(['ADMIN']);
  return listUsers();
}

/** Lightweight staff-visible user list for dropdowns (task assignment, etc). No admin fields. */
export async function fetchStaffUserOptions(): Promise<UserListRow[]> {
  await requireRole(['ADMIN', 'STAFF']);
  return listUsers();
}

export async function createUser(input: unknown): Promise<UserListRow> {
  const session = await requireRole(['ADMIN']);
  const parsed = CreateUserSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid user data',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const data = parsed.data;
  const email = data.email.trim().toLowerCase();

  // Enforce the shared password policy — schema only checks length; contextual
  // policy (no user's own name/email as substring) matches invite acceptance
  // and change-password so admin-provisioned passwords aren't a weaker path.
  const [firstName, ...rest] = data.fullName.split(/\s+/);
  const issues = checkPasswordPolicy(data.password, {
    email,
    firstName: firstName ?? null,
    lastName: rest.join(' ') || null,
  });
  if (issues.length > 0) {
    throw new ValidationError(issues[0] ?? 'Password does not meet the policy', {
      password: issues.join(' · '),
    });
  }

  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing.length > 0) {
      throw new BusinessRuleError('USER_EMAIL_EXISTS', `A user with email ${email} already exists`);
    }

    const passwordHash = await hashPassword(data.password);
    const [row] = await tx
      .insert(users)
      .values({ email, fullName: data.fullName, role: data.role, passwordHash })
      .returning({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        isActive: users.isActive,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      });
    if (!row) throw new Error('user insert returned no row');

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'user',
      entityId: row.id,
      action: 'CREATED',
      after: { email: row.email, fullName: row.fullName, role: row.role },
    });

    return row;
  });
}

export async function changeUserRole(input: ChangeRoleInput): Promise<UserListRow> {
  const session = await requireRole(['ADMIN']);
  const parsed = ChangeRoleSchema.parse(input);

  if (parsed.userId === session.user.id) {
    throw new BusinessRuleError('CANNOT_CHANGE_OWN_ROLE', 'You cannot change your own role');
  }

  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(users).where(eq(users.id, parsed.userId)).limit(1);
    if (!before) throw new BusinessRuleError('USER_NOT_FOUND', 'User not found');
    if (before.role === parsed.role) return before as UserListRow;

    const after = await updateUserRole(tx, parsed.userId, parsed.role);
    if (!after) throw new Error('updateUserRole returned no row');

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'user',
      entityId: parsed.userId,
      action: 'ROLE_CHANGED',
      before: { role: before.role },
      after: { role: after.role },
      context: { sessionsInvalidated: true },
    });

    return after as UserListRow;
  });
}

export async function setUserActive(input: SetActiveInput): Promise<UserListRow> {
  const session = await requireRole(['ADMIN']);
  const parsed = SetActiveSchema.parse(input);

  if (parsed.userId === session.user.id && !parsed.isActive) {
    throw new BusinessRuleError('CANNOT_DEACTIVATE_SELF', 'You cannot deactivate your own account');
  }

  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(users).where(eq(users.id, parsed.userId)).limit(1);
    if (!before) throw new BusinessRuleError('USER_NOT_FOUND', 'User not found');
    if (before.isActive === parsed.isActive) return before as UserListRow;

    const after = await updateUserActive(tx, parsed.userId, parsed.isActive);
    if (!after) throw new Error('updateUserActive returned no row');

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'user',
      entityId: parsed.userId,
      action: parsed.isActive ? 'REACTIVATED' : 'DEACTIVATED',
      before: { isActive: before.isActive },
      after: { isActive: after.isActive },
      context: { sessionsInvalidated: true },
    });

    return after as UserListRow;
  });
}
