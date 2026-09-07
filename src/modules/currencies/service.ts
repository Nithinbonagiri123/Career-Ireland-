import { recordAudit } from '@/lib/audit/withAudit';
import { requireInternalStaff, requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import type { Currency } from '@/lib/db/schema/currencies';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import { getCurrency, insertCurrency, listCurrencies, updateCurrency } from './repository';
import {
  type SetCurrencyActiveInput,
  SetCurrencyActiveSchema,
  type UpsertCurrencyInput,
  UpsertCurrencySchema,
} from './schemas';

export async function fetchCurrencies(): Promise<Currency[]> {
  await requireInternalStaff();
  return listCurrencies();
}

export async function upsertCurrency(input: UpsertCurrencyInput): Promise<Currency> {
  const session = await requireRole(['ADMIN']);
  const parsed = UpsertCurrencySchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid currency data',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const data = parsed.data;

  return db.transaction(async (tx) => {
    const existing = await getCurrency(data.code);
    if (existing) {
      if (
        existing.name === data.name &&
        existing.symbol === data.symbol &&
        existing.isActive === data.isActive
      ) {
        return existing;
      }
      const after = await updateCurrency(tx, data.code, {
        name: data.name,
        symbol: data.symbol,
        isActive: data.isActive,
      });
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'currency',
        entityId: after.code as unknown as string,
        action: 'UPDATED',
        before: { name: existing.name, symbol: existing.symbol, isActive: existing.isActive },
        after: { name: after.name, symbol: after.symbol, isActive: after.isActive },
      });
      return after;
    }

    const created = await insertCurrency(tx, {
      code: data.code,
      name: data.name,
      symbol: data.symbol,
      isActive: data.isActive,
    });
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'currency',
      entityId: created.code as unknown as string,
      action: 'CREATED',
      after: { code: created.code, name: created.name, symbol: created.symbol },
    });
    return created;
  });
}

export async function setCurrencyActive(input: SetCurrencyActiveInput): Promise<Currency> {
  const session = await requireRole(['ADMIN']);
  const parsed = SetCurrencyActiveSchema.parse(input);

  return db.transaction(async (tx) => {
    const existing = await getCurrency(parsed.code);
    if (!existing) throw new BusinessRuleError('CURRENCY_NOT_FOUND', 'Currency not found');
    if (existing.isActive === parsed.isActive) return existing;
    const after = await updateCurrency(tx, parsed.code, { isActive: parsed.isActive });
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'currency',
      entityId: after.code as unknown as string,
      action: parsed.isActive ? 'ACTIVATED' : 'DEACTIVATED',
      before: { isActive: existing.isActive },
      after: { isActive: after.isActive },
    });
    return after;
  });
}
