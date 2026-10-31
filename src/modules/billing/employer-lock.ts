import { sql } from 'drizzle-orm';
import type { db } from '@/lib/db/client';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Serialise every "new charge to this employer" decision.
 *
 * Both paths that can create employer money take this row lock before
 * they look at the employer's existing invoices:
 *   - lead conversion recording a new payment (acceptLead), and
 *   - Generate invoice / Raise placement fee (generateInvoiceForPayer).
 * The second request waits until the first commits, then its duplicate
 * check sees the first one's invoice. Lock order is always
 * lead → employer → placement, so the two paths cannot deadlock.
 */
export async function lockEmployerForBilling(tx: Tx, employerId: string): Promise<void> {
  await tx.execute(sql`SELECT id FROM employers WHERE id = ${employerId} FOR UPDATE`);
}
