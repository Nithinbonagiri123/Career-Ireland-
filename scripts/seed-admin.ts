import { stdin, stdout } from 'node:process';
import readline from 'node:readline/promises';
import { config } from 'dotenv';

// Load env BEFORE requiring anything that imports env.ts (validates process.env at import time).
config({ path: '.env.local' });

async function main() {
  // Deferred imports so dotenv has populated process.env first.
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

  const passwordHash = await hashPassword(password);

  // Atomic: insert user + audit row succeed or fail together.
  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(users)
      .values({ email, fullName, passwordHash, role: 'ADMIN' })
      .returning({ id: users.id, email: users.email, role: users.role });
    if (!row) throw new Error('user insert returned no row');

    await recordAudit(tx, {
      actorUserId: null, // SYSTEM — the seed script has no logged-in user
      entityType: 'user',
      entityId: row.id,
      action: 'CREATED',
      after: { email: row.email, role: row.role, fullName },
      context: { source: 'seed-admin' },
    });

    return row;
  });

  console.log(`\n✓ Created ADMIN: ${created.email} (id=${created.id})`);
  process.exit(0);
}

main().catch((e) => {
  console.error('\n✗', e.message);
  process.exit(1);
});
