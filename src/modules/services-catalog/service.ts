import { asc, eq, ilike, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireInternalStaff, requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import {
  type ServiceCatalogItem,
  type ServicePackage,
  serviceCatalogItems,
  servicePackages,
} from '@/lib/db/schema/services';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import {
  type SetActiveByIdInput,
  SetActiveByIdSchema,
  type UpsertServiceItemInput,
  UpsertServiceItemSchema,
  type UpsertServicePackageInput,
  UpsertServicePackageSchema,
} from './schemas';

function blankToNull(v: string | undefined): string | null {
  return v && v.trim().length > 0 ? v : null;
}

export async function fetchServiceCatalog(): Promise<ServiceCatalogItem[]> {
  await requireInternalStaff();
  return db.select().from(serviceCatalogItems).orderBy(asc(serviceCatalogItems.name));
}

export async function fetchServicePackages(): Promise<ServicePackage[]> {
  await requireInternalStaff();
  return db.select().from(servicePackages).orderBy(asc(servicePackages.name));
}

async function getServiceItem(id: string): Promise<ServiceCatalogItem | null> {
  const [r] = await db
    .select()
    .from(serviceCatalogItems)
    .where(eq(serviceCatalogItems.id, id))
    .limit(1);
  return r ?? null;
}

async function getServicePackage(id: string): Promise<ServicePackage | null> {
  const [r] = await db.select().from(servicePackages).where(eq(servicePackages.id, id)).limit(1);
  return r ?? null;
}

export async function upsertServiceItem(
  input: UpsertServiceItemInput,
): Promise<ServiceCatalogItem> {
  const session = await requireRole(['ADMIN']);
  const parsed = UpsertServiceItemSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid service',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const data = parsed.data;

  return db.transaction(async (tx) => {
    const values = {
      code: data.code,
      name: data.name,
      defaultCurrencyCode: blankToNull(data.defaultCurrencyCode),
      defaultPrice: blankToNull(data.defaultPrice),
      payerType: data.payerType,
      isActive: data.isActive,
    };
    if (data.id) {
      const existing = await getServiceItem(data.id);
      if (!existing) throw new BusinessRuleError('SERVICE_NOT_FOUND', 'Not found');
      const [after] = await tx
        .update(serviceCatalogItems)
        .set({ ...values, updatedAt: sql`NOW()` })
        .where(eq(serviceCatalogItems.id, data.id))
        .returning();
      if (!after) throw new Error('update returned no row');
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'service_catalog_item',
        entityId: after.id,
        action: 'UPDATED',
        before: {
          code: existing.code,
          name: existing.name,
          payerType: existing.payerType,
          isActive: existing.isActive,
          defaultPrice: existing.defaultPrice,
          defaultCurrencyCode: existing.defaultCurrencyCode,
        },
        after: values,
      });
      return after;
    }
    const [created] = await tx.insert(serviceCatalogItems).values(values).returning();
    if (!created) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'service_catalog_item',
      entityId: created.id,
      action: 'CREATED',
      after: { code: created.code, name: created.name, payerType: created.payerType },
    });
    return created;
  });
}

/**
 * Inline-create a service catalog item from a display name. Auto-derives
 * the `code` from the name (uppercased slug), defaults `payerType` to
 * PERSON, leaves `defaultCurrencyCode` and `defaultPrice` null so an
 * admin knows to fill them in on the services admin page. Idempotent
 * by name (case-insensitive). Available to any internal staff.
 */
export async function createServiceItemFromName(name: string): Promise<ServiceCatalogItem> {
  const session = await requireInternalStaff();
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 120) {
    throw new ValidationError('Invalid service name', {
      name: 'Service name must be 2–120 characters',
    });
  }
  const baseCode = trimmed
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 55);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(serviceCatalogItems)
      .where(ilike(serviceCatalogItems.name, trimmed))
      .limit(1);
    if (existing) return existing;

    // Uniqueify code if another row already claims it.
    let code = baseCode || 'SERVICE';
    let suffix = 1;
    while (true) {
      const [clash] = await tx
        .select()
        .from(serviceCatalogItems)
        .where(eq(serviceCatalogItems.code, code))
        .limit(1);
      if (!clash) break;
      suffix += 1;
      code = `${baseCode}_${suffix}`.slice(0, 60);
    }

    const [created] = await tx
      .insert(serviceCatalogItems)
      .values({
        code,
        name: trimmed,
        defaultCurrencyCode: null,
        defaultPrice: null,
        payerType: 'PERSON',
        isActive: true,
      })
      .returning();
    if (!created) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'service_catalog_item',
      entityId: created.id,
      action: 'CREATED',
      after: { code: created.code, name: created.name, viaInlineCreate: true },
    });
    return created;
  });
}

export async function setServiceItemActive(input: SetActiveByIdInput): Promise<ServiceCatalogItem> {
  const session = await requireRole(['ADMIN']);
  const parsed = SetActiveByIdSchema.parse(input);
  return db.transaction(async (tx) => {
    const existing = await getServiceItem(parsed.id);
    if (!existing) throw new BusinessRuleError('SERVICE_NOT_FOUND', 'Not found');
    if (existing.isActive === parsed.isActive) return existing;
    const [after] = await tx
      .update(serviceCatalogItems)
      .set({ isActive: parsed.isActive, updatedAt: sql`NOW()` })
      .where(eq(serviceCatalogItems.id, parsed.id))
      .returning();
    if (!after) throw new Error('update returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'service_catalog_item',
      entityId: after.id,
      action: parsed.isActive ? 'ACTIVATED' : 'DEACTIVATED',
      before: { isActive: existing.isActive },
      after: { isActive: after.isActive },
    });
    return after;
  });
}

export async function upsertServicePackage(
  input: UpsertServicePackageInput,
): Promise<ServicePackage> {
  const session = await requireRole(['ADMIN']);
  const parsed = UpsertServicePackageSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid package',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const data = parsed.data;

  return db.transaction(async (tx) => {
    const values = {
      name: data.name,
      serviceCatalogItemId: data.serviceCatalogItemId,
      price: data.price,
      currencyCode: data.currencyCode,
      isActive: data.isActive,
    };
    if (data.id) {
      const existing = await getServicePackage(data.id);
      if (!existing) throw new BusinessRuleError('PACKAGE_NOT_FOUND', 'Not found');
      const [after] = await tx
        .update(servicePackages)
        .set({ ...values, updatedAt: sql`NOW()` })
        .where(eq(servicePackages.id, data.id))
        .returning();
      if (!after) throw new Error('update returned no row');
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'service_package',
        entityId: after.id,
        action: 'UPDATED',
        before: {
          name: existing.name,
          price: existing.price,
          currencyCode: existing.currencyCode,
          isActive: existing.isActive,
        },
        after: values,
      });
      return after;
    }
    const [created] = await tx.insert(servicePackages).values(values).returning();
    if (!created) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'service_package',
      entityId: created.id,
      action: 'CREATED',
      after: { name: created.name, price: created.price, currencyCode: created.currencyCode },
    });
    return created;
  });
}

export async function setServicePackageActive(input: SetActiveByIdInput): Promise<ServicePackage> {
  const session = await requireRole(['ADMIN']);
  const parsed = SetActiveByIdSchema.parse(input);
  return db.transaction(async (tx) => {
    const existing = await getServicePackage(parsed.id);
    if (!existing) throw new BusinessRuleError('PACKAGE_NOT_FOUND', 'Not found');
    if (existing.isActive === parsed.isActive) return existing;
    const [after] = await tx
      .update(servicePackages)
      .set({ isActive: parsed.isActive, updatedAt: sql`NOW()` })
      .where(eq(servicePackages.id, parsed.id))
      .returning();
    if (!after) throw new Error('update returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'service_package',
      entityId: after.id,
      action: parsed.isActive ? 'ACTIVATED' : 'DEACTIVATED',
      before: { isActive: existing.isActive },
      after: { isActive: after.isActive },
    });
    return after;
  });
}
