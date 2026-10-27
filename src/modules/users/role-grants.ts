import { eq } from 'drizzle-orm';
import type { DbExecutor } from '@/lib/audit/withAudit';
import { encodeKey, presetForRole, type Role } from '@/lib/auth/permissions';
import { userPermissions } from '@/lib/db/schema/permissions';

/**
 * Decision A1 — a user's grants are exactly their role's preset after
 * account creation (CH-04) and after every role change (CH-02). Old
 * grants are removed so a demotion never leaves stale access behind.
 * Runs inside the caller's transaction; returns the before/after key
 * sets so the caller can audit them.
 */
export async function replaceGrantsWithRolePreset(
  tx: DbExecutor,
  args: { userId: string; role: Role; actorUserId: string },
): Promise<{ before: string[]; after: string[] }> {
  const existing = await tx
    .select({
      business: userPermissions.business,
      module: userPermissions.module,
      verb: userPermissions.verb,
    })
    .from(userPermissions)
    .where(eq(userPermissions.userId, args.userId));
  const before = existing.map((r) => `${r.business}.${r.module}.${r.verb}`).sort();

  await tx.delete(userPermissions).where(eq(userPermissions.userId, args.userId));

  const preset = presetForRole(args.role);
  const values = preset.map((k) => ({
    userId: args.userId,
    business: k.business,
    module: k.module,
    verb: k.verb,
    grantedByUserId: args.actorUserId,
  }));
  const CHUNK = 50;
  for (let i = 0; i < values.length; i += CHUNK) {
    await tx.insert(userPermissions).values(values.slice(i, i + CHUNK));
  }
  const after = preset.map((k) => encodeKey(k.business, k.module, k.verb)).sort();
  return { before, after };
}
