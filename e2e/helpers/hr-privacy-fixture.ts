/**
 * S-HR1 fixture: one throwaway internal user with an open attendance
 * session that carries documentation-range IP addresses (RFC 5737), so
 * response payloads can be searched for the name and the IPs. The user
 * cannot log in (no usable password hash). `cleanup()` removes exactly
 * these rows.
 */
export const HR_PRIV_IP_IN = '198.51.100.23';
export const HR_PRIV_IP_OUT = '198.51.100.24';

export async function seedWorkingUser() {
  const { config } = await import('dotenv');
  config({ path: '.env.local' });
  const { eq } = await import('drizzle-orm');
  const { db } = await import('../../src/lib/db/client');
  const { users } = await import('../../src/lib/db/schema/users');
  const { attendanceSessions } = await import('../../src/lib/db/schema/hr');
  const stamp = Math.random().toString(36).slice(2, 8);
  const fullName = `Hrpriv Worker ${stamp}`;
  const email = `hrpriv-${stamp}@example.test`;
  const [u] = await db
    .insert(users)
    .values({ email, passwordHash: 'not-a-login', fullName, role: 'STAFF' })
    .returning({ id: users.id });
  if (!u) throw new Error('seed user failed');
  const now = Date.now();
  await db.insert(attendanceSessions).values({
    userId: u.id,
    clockInAt: new Date(now - 4 * 60 * 60 * 1000),
    clockOutAt: new Date(now - 3 * 60 * 60 * 1000),
    clockInIp: HR_PRIV_IP_IN,
    clockOutIp: HR_PRIV_IP_OUT,
  });
  await db.insert(attendanceSessions).values({
    userId: u.id,
    clockInAt: new Date(now - 20 * 60 * 1000),
    clockInIp: HR_PRIV_IP_IN,
  });
  return {
    userId: u.id,
    fullName,
    email,
    async cleanup() {
      await db.delete(attendanceSessions).where(eq(attendanceSessions.userId, u.id));
      await db.delete(users).where(eq(users.id, u.id));
    },
    async remaining() {
      const s = await db
        .select({ id: attendanceSessions.id })
        .from(attendanceSessions)
        .where(eq(attendanceSessions.userId, u.id));
      const us = await db.select({ id: users.id }).from(users).where(eq(users.id, u.id));
      return s.length + us.length;
    },
  };
}
