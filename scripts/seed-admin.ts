import { stdin, stdout } from 'node:process';
import readline from 'node:readline/promises';
import { config } from 'dotenv';

config({ path: '.env.local' });

// Import after env is loaded so env.ts validation reads the right values.
const { db } = await import('../src/lib/db/client');
const { users } = await import('../src/lib/db/schema/users');
const { hashPassword } = await import('../src/modules/auth/service');
const { eq } = await import('drizzle-orm');

const rl = readline.createInterface({ input: stdin, output: stdout });

async function prompt(label: string): Promise<string> {
  const answer = (await rl.question(label)).trim();
  if (!answer) throw new Error(`${label.replace(':', '')} is required`);
  return answer;
}

async function promptPassword(label: string): Promise<string> {
  // Simple hidden input — mute echo temporarily.
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

async function main() {
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
  const [created] = await db
    .insert(users)
    .values({ email, fullName, passwordHash, role: 'ADMIN' })
    .returning({ id: users.id, email: users.email, role: users.role });

  console.log(`\n✓ Created ADMIN: ${created?.email} (id=${created?.id})`);
  process.exit(0);
}

main().catch((e) => {
  console.error('\n✗', e.message);
  process.exit(1);
});
