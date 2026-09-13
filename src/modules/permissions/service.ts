import { and, eq } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import {
  BUSINESSES,
  type Business,
  isValidPermission,
  MODULES,
  type PermissionKey,
  presetForRole,
  type Role,
  VERBS,
  type Verb,
} from '@/lib/auth/permissions';
import { requireSession } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { userPermissions } from '@/lib/db/schema/permissions';
import { users } from '@/lib/db/schema/users';
import { AuthorizationError, BusinessRuleError } from '@/lib/errors';

/**
 * Server actions the permissions-editor UI uses to grant, revoke, and
 * reset user permissions.
 *
 * Access rule: caller must have `main.admin.manage`. The owner bypasses
 * this. Portal users always fail. The permissions editor itself gates
 * on the same rule before rendering.
 *
 * Every mutation writes an audit event so the owner can trace grants /
 * revokes after the fact. The audit context includes both the target
 * user and the permission key.
 */

async function requireCanManagePermissions(): Promise<{ userId: string }> {
  const s = await requireSession();
  const { loadCurrentUserPermissions } = await import('@/lib/auth/session');
  const snap = await loadCurrentUserPermissions();
  if (!snap) throw new AuthorizationError();
  if (snap.isOwner) return { userId: s.user.id };
  const { hasPermission } = await import('@/lib/auth/permissions');
  if (!hasPermission(snap.granted, 'main', 'admin', 'manage')) {
    throw new AuthorizationError();
  }
  return { userId: s.user.id };
}

/**
 * Snapshot of a target user's permission state, keyed for a compact
 * matrix editor render.
 */
export type UserPermissionSnapshot = {
  userId: string;
  email: string;
  fullName: string;
  role: Role;
  isOwner: boolean;
  /** `<business>.<module>.<verb>` strings the user has been granted. */
  granted: Set<string>;
};

export async function fetchUserPermissionSnapshot(userId: string): Promise<UserPermissionSnapshot> {
  await requireCanManagePermissions();

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      isOwner: users.isOwner,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new BusinessRuleError('USER_NOT_FOUND', 'User not found');

  const rows = await db
    .select({
      business: userPermissions.business,
      module: userPermissions.module,
      verb: userPermissions.verb,
    })
    .from(userPermissions)
    .where(eq(userPermissions.userId, userId));

  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role as Role,
    isOwner: user.isOwner,
    granted: new Set(rows.map((r) => `${r.business}.${r.module}.${r.verb}`)),
  };
}

/**
 * Apply a batch of grants/revokes atomically. Adds rows for the grants,
 * removes rows for the revokes, writes one audit event per operation.
 *
 * Editing the owner is a no-op — their bypass is baked into the auth
 * layer, not the grants table. Trying to grant an unknown triple is
 * silently ignored (defence against a hand-crafted client).
 */
export async function applyPermissionChangesAction(input: {
  targetUserId: string;
  grants: PermissionKey[];
  revokes: PermissionKey[];
}) {
  const actor = await requireCanManagePermissions();

  const grants = input.grants.filter((k) => isValidPermission(k.business, k.module, k.verb));
  const revokes = input.revokes.filter((k) => isValidPermission(k.business, k.module, k.verb));
  if (grants.length === 0 && revokes.length === 0) return { added: 0, removed: 0 };

  const [targetUser] = await db
    .select({ id: users.id, isOwner: users.isOwner })
    .from(users)
    .where(eq(users.id, input.targetUserId))
    .limit(1);
  if (!targetUser) throw new BusinessRuleError('USER_NOT_FOUND', 'User not found');
  if (targetUser.isOwner) {
    throw new BusinessRuleError(
      'CANNOT_EDIT_OWNER',
      'Owner has every permission implicitly. Change ownership via scripts/set-owner.ts.',
    );
  }

  return db.transaction(async (tx) => {
    let added = 0;
    let removed = 0;

    if (grants.length > 0) {
      const values = grants.map((k) => ({
        userId: input.targetUserId,
        business: k.business,
        module: k.module,
        verb: k.verb,
        grantedByUserId: actor.userId,
      }));
      // ON CONFLICT DO NOTHING keeps this idempotent.
      await tx.insert(userPermissions).values(values).onConflictDoNothing();
      added = values.length;
      await recordAudit(tx, {
        actorUserId: actor.userId,
        entityType: 'user_permission',
        entityId: input.targetUserId,
        action: 'GRANTED',
        after: {
          count: values.length,
          keys: values.map((v) => `${v.business}.${v.module}.${v.verb}`),
        },
      });
    }

    if (revokes.length > 0) {
      for (const r of revokes) {
        await tx
          .delete(userPermissions)
          .where(
            and(
              eq(userPermissions.userId, input.targetUserId),
              eq(userPermissions.business, r.business),
              eq(userPermissions.module, r.module),
              eq(userPermissions.verb, r.verb),
            ),
          );
      }
      removed = revokes.length;
      await recordAudit(tx, {
        actorUserId: actor.userId,
        entityType: 'user_permission',
        entityId: input.targetUserId,
        action: 'REVOKED',
        before: {
          count: revokes.length,
          keys: revokes.map((r) => `${r.business}.${r.module}.${r.verb}`),
        },
      });
    }

    return { added, removed };
  });
}

/**
 * Wipe the user's grants and replace them with the preset for their
 * role. Useful for "reset this user to what a fresh RECRUITER would
 * have" — undoes any manual grants/revokes.
 */
export async function resetPermissionsToRoleAction(targetUserId: string) {
  const actor = await requireCanManagePermissions();

  const [targetUser] = await db
    .select({ id: users.id, role: users.role, isOwner: users.isOwner })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  if (!targetUser) throw new BusinessRuleError('USER_NOT_FOUND', 'User not found');
  if (targetUser.isOwner) {
    throw new BusinessRuleError('CANNOT_EDIT_OWNER', 'Owner has every permission implicitly.');
  }

  const preset = presetForRole(targetUser.role as Role);
  return db.transaction(async (tx) => {
    await tx.delete(userPermissions).where(eq(userPermissions.userId, targetUserId));
    if (preset.length > 0) {
      const values = preset.map((k) => ({
        userId: targetUserId,
        business: k.business,
        module: k.module,
        verb: k.verb,
        grantedByUserId: actor.userId,
      }));
      // Chunk in case the preset is large (ADMIN = 115 rows).
      const CHUNK = 50;
      for (let i = 0; i < values.length; i += CHUNK) {
        await tx.insert(userPermissions).values(values.slice(i, i + CHUNK));
      }
    }
    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: 'user_permission',
      entityId: targetUserId,
      action: 'RESET_TO_ROLE',
      after: { role: targetUser.role, count: preset.length },
    });
    return { count: preset.length };
  });
}

/** Read all users a manager can grant permissions to (i.e. staff users). */
export async function listManageableUsers(): Promise<
  Array<{ id: string; email: string; fullName: string; role: Role; isOwner: boolean }>
> {
  await requireCanManagePermissions();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      isOwner: users.isOwner,
    })
    .from(users)
    .orderBy(users.fullName);
  return rows.map((r) => ({ ...r, role: r.role as Role }));
}

// Reference imports so tree-shaking doesn't strip them if not called.
void BUSINESSES;
void MODULES;
void VERBS;

export type { Business, PermissionKey, Verb };
