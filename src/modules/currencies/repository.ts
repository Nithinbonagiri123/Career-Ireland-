import { eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '@/lib/audit/withAudit';
import { db } from '@/lib/db/client';
import { type Currency, currencies, type NewCurrency } from '@/lib/db/schema/currencies';

export async function listCurrencies(): Promise<Currency[]> {
  return db.select().from(currencies).orderBy(currencies.code);
}

export async function getCurrency(code: string): Promise<Currency | null> {
  const [row] = await db.select().from(currencies).where(eq(currencies.code, code)).limit(1);
  return row ?? null;
}

export async function insertCurrency(tx: DbExecutor, data: NewCurrency): Promise<Currency> {
  const [row] = await tx.insert(currencies).values(data).returning();
  if (!row) throw new Error('currencies insert returned no row');
  return row;
}

export async function updateCurrency(
  tx: DbExecutor,
  code: string,
  patch: Partial<Pick<Currency, 'name' | 'symbol' | 'isActive'>>,
): Promise<Currency> {
  const [row] = await tx
    .update(currencies)
    .set({ ...patch, updatedAt: sql`NOW()` })
    .where(eq(currencies.code, code))
    .returning();
  if (!row) throw new Error(`currency ${code} not found`);
  return row;
}
