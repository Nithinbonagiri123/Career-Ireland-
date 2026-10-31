import { stdin, stdout } from 'node:process';
import readline from 'node:readline/promises';
import { config } from 'dotenv';
import { assertSetupTarget } from './_assert-local-db';

// Load env BEFORE requiring anything that imports env.ts (validates process.env at import time).
config({ path: '.env.local' });
// Decision 8: manual-testing DB only with ALLOW_MANUAL_DB_MIGRATE=1.
assertSetupTarget('seed-admin');

async function main() {
  // Deferred imports so dotenv has populated process.env first.
  const { eq, sql } = await import('drizzle-orm');
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

  console.log('\n▸ Seed first ADMIN user\n');

  const email = (await prompt('Email: ')).toLowerCase();
  const fullName = await prompt('Full name: ');
  const password = await promptPassword('Password (min 8 chars, hidden): ');
  rl.close();

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    console.error(`\n✗ A user with email ${email} already exists.`);
    process.exit(1);
  }

  // Session 33 — if the users table is empty, the seeded admin IS the
  // first business owner (otherwise nobody could log in and reassign
  // records). Subsequent seed runs create plain ADMINs (which can be
  // promoted later from the user admin page by an existing owner).
  const [{ count: existingCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users);
  const makeOwner = (existingCount ?? 0) === 0;

  const passwordHash = await hashPassword(password);

  // Atomic: insert user + audit row succeed or fail together.
  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(users)
      .values({ email, fullName, passwordHash, role: 'ADMIN', isOwner: makeOwner })
      .returning({ id: users.id, email: users.email, role: users.role, isOwner: users.isOwner });
    if (!row) throw new Error('user insert returned no row');

    await recordAudit(tx, {
      actorUserId: null, // SYSTEM — the seed script has no logged-in user
      entityType: 'user',
      entityId: row.id,
      action: 'CREATED',
      after: { email: row.email, role: row.role, fullName, isOwner: row.isOwner },
      context: { source: 'seed-admin', firstUser: makeOwner },
    });

    return row;
  });

  console.log(
    `\n✓ Created ${created.isOwner ? 'OWNER (first user) ' : ''}ADMIN: ${created.email} (id=${created.id})`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error('\n✗', e.message);
  process.exit(1);
});
