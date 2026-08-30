import { stdin, stdout } from 'node:process';
import readline from 'node:readline/promises';
import { config } from 'dotenv';

// Load env BEFORE any import that touches env.ts.
config({ path: '.env.local' });

async function main() {
  const { eq } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { users } = await import('../src/lib/db/schema/users');
  const { hashPassword } = await import('../src/modules/auth/service');
  const { recordAudit } = await import('../src/lib/audit/withAudit');

  const rl = readline.createInterface({ input: stdin, output: stdout });

  async function prompt(label: string): Promise<string> {
    const answer = (await rl.question(label)).trim();
    if (!answer) throw new Error(`${label.replace(':', '')} is required`);
    return answer;
  }

  async function promptPassword(label: string): Promise<string> {
    process.stdout.write(label);
    const originalWrite = stdout.write.bind(stdout);
    (stdout.write as unknown as (chunk: string | Uint8Array) => boolean) = (chunk) => {
      const str = typeof chunk === 'string' ? chunk : chunk.toString();
      if (str && !str.includes('\n')) return true;
      return originalWrite(chunk);
    };
    const answer = (await rl.question('')).trim();
    stdout.write = originalWrite;
    process.stdout.write('\n');
    if (answer.length < 8) throw new Error('Password must be at least 8 characters');
    return answer;
  }

  console.log('\n▸ Reset password for an existing user\n');

  const email = (await prompt('Email: ')).toLowerCase();
  const newPassword = await promptPassword('New password (min 8 chars, hidden): ');
  rl.close();

  const [existing] = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!existing) {
    console.error(`\n✗ No user with email ${email}.`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(newPassword);
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, sessionsInvalidatedAfter: now, updatedAt: now })
      .where(eq(users.id, existing.id));

    await recordAudit(tx, {
      actorUserId: null,
      entityType: 'user',
      entityId: existing.id,
      action: 'UPDATED',
      after: { passwordReset: true, sessionsRevoked: true },
      context: { source: 'reset-admin-password' },
    });
  });

  console.log(`\n✓ Password reset for ${existing.email} (role=${existing.role}).`);
  console.log('  All active sessions for this user have been revoked.');
  process.exit(0);
}

main().catch((e) => {
  console.error('\n✗', e.message);
  process.exit(1);
});
