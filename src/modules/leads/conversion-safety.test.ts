import { inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { todayInDublin } from '@/lib/dates';
import { db } from '@/lib/db/client';
import { auditEvents } from '@/lib/db/schema/audit_events';
import { leads } from '@/lib/db/schema/leads';
import { persons } from '@/lib/db/schema/persons';
import { employers, jobRequisitions, placements } from '@/lib/db/schema/recruitment';
import { type UserRole, users } from '@/lib/db/schema/users';

/**
 * Recruitment P0 (W1 finance) — DB-backed proof that converting an
 * employer enquiry can never charge the employer twice, and that placement
 * fees / lead invoices are validated on the server.
 *
 * Real role presets drive the permission checks; real users rows back the
 * finance side effects (which re-read the actor from the database). Every
 * row is created under a unique P0FIN- prefix and only those rows are
 * removed afterwards.
 */

const session = {
  user: {
    id: '',
    email: 'p0fin@example.test',
    name: 'P0 Finance',
    role: 'ADMIN' as UserRole,
    isOwner: false,
    personId: null,
    employerId: null,
  },
};

vi.mock('@/lib/auth/session', async () => {
  const { AuthorizationError: AuthErr } = await import('@/lib/errors');
  const { presetForRole, hasPermission, encodeKey } = await import('@/lib/auth/permissions');
  const INTERNAL = ['ADMIN', 'STAFF', 'MANAGER', 'RECRUITER', 'DOCUMENT_SPECIALIST', 'FINANCE'];
  const granted = () =>
    new Set(
      presetForRole(session.user.role as Parameters<typeof presetForRole>[0]).map((k) =>
        encodeKey(k.business, k.module, k.verb),
      ),
    );
  const allowed = (b: string, m: string, v: string) =>
    session.user.isOwner || hasPermission(granted(), b as 'main', m, v as 'view');
  return {
    INTERNAL_STAFF_ROLES: INTERNAL,
    getSession: vi.fn(async () => session),
    requireSession: vi.fn(async () => session),
    requireInternalStaff: vi.fn(async () => {
      if (!INTERNAL.includes(session.user.role)) throw new AuthErr();
      return session;
    }),
    requireRole: vi.fn(async (roles: string[]) => {
      if (!roles.includes(session.user.role)) throw new AuthErr();
      return session;
    }),
    requirePermission: vi.fn(async (b: string, m: string, v: string) => {
      if (!allowed(b, m, v)) throw new AuthErr();
      return session;
    }),
    requireAnyPermission: vi.fn(
      async (perms: Array<{ business: string; module: string; verb: string }>) => {
        if (!perms.some((p) => allowed(p.business, p.module, p.verb))) throw new AuthErr();
        return session;
      },
    ),
    checkPermission: vi.fn(async (b: string, m: string, v: string) => allowed(b, m, v)),
  };
});

const leadSvc = await import('./service');
const { generateInvoiceForPayer } = await import('@/modules/billing/generate');
const { recordPayment } = await import('@/modules/commerce/service');
const { fetchInvoiceableServicesFor } = await import('@/modules/billing/read');

const RUN = Math.random().toString(36).slice(2, 8);
const PREFIX = `P0FIN-${RUN}`;
const userIds: Record<'ADMIN' | 'FINANCE' | 'RECRUITER', string> = {
  ADMIN: '',
  FINANCE: '',
  RECRUITER: '',
};
const created = {
  employers: [] as string[],
  leads: [] as string[],
  persons: [] as string[],
  placements: [] as string[],
};
let feeServiceId = '';
let feeServicePrice: string | null = null;

function as(role: 'ADMIN' | 'FINANCE' | 'RECRUITER') {
  session.user.role = role;
  session.user.id = userIds[role];
}

async function newEmployer(tag: string): Promise<string> {
  const [e] = await db
    .insert(employers)
    .values({ legalName: `${PREFIX} ${tag} Ltd`, relationshipStatus: 'ACTIVE' })
    .returning({ id: employers.id });
  if (!e) throw new Error('employer seed failed');
  created.employers.push(e.id);
  return e.id;
}

async function newLead(
  employerId: string,
  status: 'NEW' | 'CONTACTED' | 'LOST' | 'REJECTED' | 'EXPIRED' = 'NEW',
): Promise<string> {
  const [l] = await db
    .insert(leads)
    .values({ targetBusiness: 'RECRUITMENT', employerId, status })
    .returning({ id: leads.id });
  if (!l) throw new Error('lead seed failed');
  created.leads.push(l.id);
  return l.id;
}

/** "Raised from the employer page": finance issues the fee invoice. */
async function issueEmployerInvoice(
  employerId: string,
  unitPrice = '1500.00',
  extra: Record<string, unknown> = {},
) {
  as('ADMIN');
  const r = await generateInvoiceForPayer({
    payerMode: 'EMPLOYER',
    payerId: employerId,
    serviceCatalogItemId: feeServiceId,
    qty: 1,
    unitPrice,
    currencyCode: 'EUR',
    ...extra,
  });
  const [inv] = await db.execute<{ total: string }>(
    sql`SELECT total_amount::text AS total FROM invoices WHERE id = ${r.invoiceId}`,
  );
  return { ...r, total: inv?.total ?? unitPrice };
}

/** Employer pays it in full; finance records (auto-verifies) the money. */
async function payInFull(engagementId: string, total: string) {
  as('ADMIN');
  await recordPayment({
    serviceEngagementId: engagementId,
    amount: total,
    currencyCode: 'EUR',
    method: 'BANK_TRANSFER',
    receivedAt: todayInDublin(),
  });
}

async function counts(employerId: string) {
  const [r] = await db.execute<{
    invoices: number;
    payments: number;
    receipts: number;
    engagements: number;
    requisitions: number;
  }>(sql`
    SELECT
      (SELECT COUNT(*) FROM invoices WHERE payer_employer_id = ${employerId})::int AS invoices,
      (SELECT COUNT(*) FROM payments p JOIN service_engagements e ON e.id = p.service_engagement_id
        WHERE e.payer_employer_id = ${employerId})::int AS payments,
      (SELECT COUNT(*) FROM receipts r JOIN payments p ON p.id = r.payment_id
        JOIN service_engagements e ON e.id = p.service_engagement_id
        WHERE e.payer_employer_id = ${employerId})::int AS receipts,
      (SELECT COUNT(*) FROM service_engagements WHERE payer_employer_id = ${employerId})::int AS engagements,
      (SELECT COUNT(*) FROM job_requisitions WHERE employer_id = ${employerId})::int AS requisitions
  `);
  if (!r) throw new Error('count failed');
  return r;
}

async function invoiceRow(id: string) {
  const [r] = await db.execute<{
    source_lead_id: string | null;
    job_requisition_id: string | null;
    placement_id: string | null;
    status: string;
  }>(
    sql`SELECT source_lead_id, job_requisition_id, placement_id, status FROM invoices WHERE id = ${id}`,
  );
  return r;
}

async function leadRow(id: string) {
  const [r] = await db.execute<{
    status: string;
    accepted_entity_id: string | null;
    converted_at: Date | null;
    converted_by_user_id: string | null;
    conversion_method: string | null;
    conversion_reason: string | null;
  }>(sql`
    SELECT status, accepted_entity_id, converted_at, converted_by_user_id,
           conversion_method, conversion_reason
    FROM leads WHERE id = ${id}
  `);
  return r;
}

function newPaymentInput(leadId: string, extra: Record<string, unknown> = {}) {
  return {
    leadId,
    reason: 'Employer paid by bank transfer',
    serviceCatalogItemId: feeServiceId,
    amount: feeServicePrice ?? '1500.00',
    currencyCode: 'EUR',
    method: 'BANK_TRANSFER' as const,
    ...extra,
  };
}

beforeAll(async () => {
  for (const role of ['ADMIN', 'FINANCE', 'RECRUITER'] as const) {
    const [u] = await db
      .insert(users)
      .values({
        email: `${PREFIX.toLowerCase()}-${role.toLowerCase()}@example.test`,
        passwordHash: 'x',
        fullName: `${PREFIX} ${role}`,
        role,
      })
      .returning({ id: users.id });
    if (!u) throw new Error('user seed failed');
    userIds[role] = u.id;
  }
  as('ADMIN');
  const services = await fetchInvoiceableServicesFor('EMPLOYER');
  const fee = services.find((s) => s.code === 'PLACEMENT_FEE') ?? services[0];
  if (!fee) throw new Error('no employer service in the catalog');
  feeServiceId = fee.id;
  feeServicePrice = fee.defaultPrice;
});

afterAll(async () => {
  const empIds = created.employers;
  try {
    if (empIds.length > 0) {
      const emp = sql.join(
        empIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      );
      const ids = await db.execute<{ kind: string; id: string }>(sql`
        SELECT 'inv' AS kind, id::text FROM invoices WHERE payer_employer_id IN (${emp})
        UNION ALL
        SELECT 'pay', p.id::text FROM payments p JOIN service_engagements e ON e.id = p.service_engagement_id
          WHERE e.payer_employer_id IN (${emp})
        UNION ALL
        SELECT 'rct', r.id::text FROM receipts r JOIN payments p ON p.id = r.payment_id
          JOIN service_engagements e ON e.id = p.service_engagement_id WHERE e.payer_employer_id IN (${emp})
      `);
      const all = (ids as unknown as Array<{ kind: string; id: string }>).map((r) => r.id);
      if (all.length > 0) {
        await db.execute(
          sql`DELETE FROM financial_events WHERE source_id IN (${sql.join(
            all.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        );
      }
      await db.execute(sql`
        DELETE FROM receipts WHERE payment_id IN (
          SELECT p.id FROM payments p JOIN service_engagements e ON e.id = p.service_engagement_id
          WHERE e.payer_employer_id IN (${emp}))`);
      await db.execute(sql`
        DELETE FROM payments WHERE service_engagement_id IN (
          SELECT id FROM service_engagements WHERE payer_employer_id IN (${emp}))`);
      await db.execute(sql`
        DELETE FROM invoice_line_items WHERE invoice_id IN (
          SELECT id FROM invoices WHERE payer_employer_id IN (${emp}))`);
      await db.execute(sql`DELETE FROM invoices WHERE payer_employer_id IN (${emp})`);
      await db.execute(sql`DELETE FROM service_engagements WHERE payer_employer_id IN (${emp})`);
      if (created.leads.length > 0) await db.delete(leads).where(inArray(leads.id, created.leads));
      if (created.placements.length > 0) {
        await db.delete(placements).where(inArray(placements.id, created.placements));
      }
      await db.delete(jobRequisitions).where(inArray(jobRequisitions.employerId, empIds));
      if (created.persons.length > 0) {
        await db.delete(persons).where(inArray(persons.id, created.persons));
      }
      await db.delete(employers).where(inArray(employers.id, empIds));
    }
  } catch (e) {
    console.warn('P0FIN cleanup incomplete (dev DB, prefixed rows only):', (e as Error).message);
  }
  const uids = Object.values(userIds).filter(Boolean);
  if (uids.length > 0) {
    await db.delete(auditEvents).where(inArray(auditEvents.actorUserId, uids));
    try {
      await db.delete(users).where(inArray(users.id, uids));
    } catch {
      await db.update(users).set({ isActive: false }).where(inArray(users.id, uids));
    }
  }
});

describe('S3 — employer already paid €1,500 from the employer page', () => {
  it('"use existing invoice" converts with exactly one invoice, payment and receipt', async () => {
    const emp = await newEmployer('S3');
    const leadId = await newLead(emp);
    const inv = await issueEmployerInvoice(emp);
    await payInFull(inv.engagementId, inv.total);
    const before = await counts(emp);
    expect(before).toMatchObject({ invoices: 1, payments: 1, receipts: 1, requisitions: 0 });
    expect((await invoiceRow(inv.invoiceId))?.status).toBe('PAID');

    // A recruiter (no finance authority) converts — linking moves no money.
    as('RECRUITER');
    const r = await leadSvc.acceptLead({ leadId, existingInvoiceId: inv.invoiceId });

    const after = await counts(emp);
    expect(after).toMatchObject({
      invoices: 1,
      payments: 1,
      receipts: 1,
      engagements: before.engagements,
      requisitions: 1,
    });
    const linked = await invoiceRow(inv.invoiceId);
    expect(linked?.source_lead_id).toBe(leadId);
    expect(linked?.job_requisition_id).toBe(r.entityId);
    const lead = await leadRow(leadId);
    expect(lead).toMatchObject({
      status: 'CONVERTED',
      accepted_entity_id: r.entityId,
      converted_by_user_id: userIds.RECRUITER,
      conversion_method: 'PAYMENT_VERIFIED',
    });
    expect(lead?.converted_at).toBeTruthy();
    const [audit] = await db.execute<{ before: unknown; after: unknown }>(sql`
      SELECT before, after FROM audit_events
      WHERE entity_type = 'invoice' AND entity_id = ${inv.invoiceId} AND action = 'LINKED_TO_LEAD'
    `);
    expect(audit?.before).toMatchObject({ sourceLeadId: null, jobRequisitionId: null });
    expect(audit?.after).toMatchObject({ sourceLeadId: leadId, jobRequisitionId: r.entityId });

    // Repeated conversion → refused, nothing new.
    await expect(
      leadSvc.acceptLead({ leadId, existingInvoiceId: inv.invoiceId }),
    ).rejects.toMatchObject({ code: 'LEAD_ALREADY_ACCEPTED' });
    as('ADMIN');
    await expect(leadSvc.acceptLead(newPaymentInput(leadId))).rejects.toMatchObject({
      code: 'LEAD_ALREADY_ACCEPTED',
    });
    expect(await counts(emp)).toEqual(after);
  });

  it('"record new payment" is refused while the paid invoice exists; only finance may override, with a reason, audited', async () => {
    const emp = await newEmployer('S3b');
    const leadId = await newLead(emp);
    const inv = await issueEmployerInvoice(emp);
    await payInFull(inv.engagementId, inv.total);
    const before = await counts(emp);

    as('RECRUITER');
    await expect(leadSvc.acceptLead(newPaymentInput(leadId))).rejects.toMatchObject({
      code: 'LEAD_EMPLOYER_HAS_INVOICE',
      message: expect.stringContaining(inv.invoiceNumber),
    });
    // Non-finance can never override, even when asking explicitly.
    await expect(
      leadSvc.acceptLead(
        newPaymentInput(leadId, {
          confirmSeparateCharge: true,
          separateChargeReason: 'Different job entirely',
        }),
      ),
    ).rejects.toMatchObject({ code: 'LEAD_EMPLOYER_HAS_INVOICE' });
    // Finance authority without a reason → refused. (ADMIN: the FINANCE
    // preset has no recruitment.leads.edit grant, so it can't convert a
    // Recruitment lead at all.)
    as('FINANCE');
    await expect(
      leadSvc.acceptLead(newPaymentInput(leadId, { confirmSeparateCharge: true })),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_ERROR' });
    as('ADMIN');
    await expect(
      leadSvc.acceptLead(newPaymentInput(leadId, { confirmSeparateCharge: true })),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await counts(emp)).toEqual(before);
    expect((await leadRow(leadId))?.status).toBe('NEW');

    // Finance with a reason → allowed and audited.
    await leadSvc.acceptLead(
      newPaymentInput(leadId, {
        confirmSeparateCharge: true,
        separateChargeReason: 'Second, separate retained search agreed in writing',
      }),
    );
    const after = await counts(emp);
    expect(after.invoices).toBe(before.invoices + 1);
    expect(after.payments).toBe(before.payments + 1);
    const [audit] = await db.execute<{ context: Record<string, unknown> }>(sql`
      SELECT context FROM audit_events
      WHERE entity_type = 'lead' AND entity_id = ${leadId} AND action = 'SEPARATE_CHARGE_CONFIRMED'
    `);
    expect(audit?.context).toMatchObject({
      reason: 'Second, separate retained search agreed in writing',
      existingInvoices: [inv.invoiceNumber],
    });
    expect((await leadRow(leadId))?.conversion_method).toBe('PAYMENT_VERIFIED');
  });

  it('an open (unpaid) employer invoice also blocks "record new payment"', async () => {
    const emp = await newEmployer('Open');
    const leadId = await newLead(emp);
    const inv = await issueEmployerInvoice(emp);
    const before = await counts(emp);
    as('RECRUITER');
    await expect(leadSvc.acceptLead(newPaymentInput(leadId))).rejects.toMatchObject({
      code: 'LEAD_EMPLOYER_HAS_INVOICE',
      message: expect.stringContaining(inv.invoiceNumber),
    });
    expect(await counts(emp)).toEqual(before);
  });
});

describe('concurrency', () => {
  it('two simultaneous conversions of the same lead: exactly one wins, money rows unchanged', async () => {
    const emp = await newEmployer('Race1');
    const leadId = await newLead(emp);
    const inv = await issueEmployerInvoice(emp);
    await payInFull(inv.engagementId, inv.total);
    const before = await counts(emp);
    as('RECRUITER');
    const results = await Promise.allSettled([
      leadSvc.acceptLead({ leadId, existingInvoiceId: inv.invoiceId }),
      leadSvc.acceptLead({ leadId, existingInvoiceId: inv.invoiceId }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'LEAD_ALREADY_ACCEPTED' });
    const after = await counts(emp);
    expect(after).toMatchObject({
      invoices: before.invoices,
      payments: before.payments,
      receipts: before.receipts,
      engagements: before.engagements,
      requisitions: before.requisitions + 1,
    });
  });

  it('two simultaneous new-payment conversions of the same lead: financial rows increase once', async () => {
    const emp = await newEmployer('Race2');
    const leadId = await newLead(emp);
    const before = await counts(emp);
    as('ADMIN');
    const results = await Promise.allSettled([
      leadSvc.acceptLead(newPaymentInput(leadId)),
      leadSvc.acceptLead(newPaymentInput(leadId)),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const after = await counts(emp);
    expect(after.invoices - before.invoices).toBe(1);
    expect(after.payments - before.payments).toBe(1);
    expect(after.receipts - before.receipts).toBe(1);
    expect(after.requisitions - before.requisitions).toBe(1);
  });

  it('conversion recording a new payment vs Generate invoice on the employer page, at the same instant: exactly one charge (8 rounds)', async () => {
    // Both paths take the employer row lock before checking existing
    // invoices, so whichever runs second sees the first one's invoice:
    //   - invoice first  → the conversion is refused (LEAD_EMPLOYER_HAS_INVOICE)
    //   - conversion first → Generate invoice is refused (DUPLICATE_INVOICE_LIKELY)
    const winners = new Set<string>();
    for (let round = 0; round < 8; round++) {
      const emp = await newEmployer(`XRace${round}`);
      const leadId = await newLead(emp);
      const before = await counts(emp);
      as('ADMIN');
      const [conv, gen] = await Promise.allSettled([
        leadSvc.acceptLead(newPaymentInput(leadId)),
        generateInvoiceForPayer({
          payerMode: 'EMPLOYER',
          payerId: emp,
          serviceCatalogItemId: feeServiceId,
          qty: 1,
          unitPrice: feeServicePrice ?? '1500.00',
          currencyCode: 'EUR',
        }),
      ]);
      const fulfilled = [conv, gen].filter((r) => r.status === 'fulfilled');
      expect(fulfilled, `round ${round}`).toHaveLength(1);
      const after = await counts(emp);
      // One invoice, never two; money recorded at most once.
      expect(after.invoices - before.invoices, `round ${round}`).toBe(1);
      expect(after.engagements - before.engagements, `round ${round}`).toBe(1);
      if (conv.status === 'fulfilled') {
        winners.add('conversion');
        expect((gen as PromiseRejectedResult).reason).toMatchObject({
          code: 'DUPLICATE_INVOICE_LIKELY',
        });
        expect(after.payments - before.payments).toBe(1);
        expect(after.receipts - before.receipts).toBe(1);
        expect((await leadRow(leadId))?.status).toBe('CONVERTED');
      } else {
        winners.add('invoice');
        expect(conv.reason).toMatchObject({ code: 'LEAD_EMPLOYER_HAS_INVOICE' });
        expect(after.payments - before.payments).toBe(0);
        expect(after.receipts - before.receipts).toBe(0);
        expect((await leadRow(leadId))?.status).toBe('NEW');
      }
      // Revenue view: the employer is billed for exactly one fee.
      const [rev] = await db.execute<{ billed: string }>(
        sql`SELECT COALESCE(SUM(total_amount), 0)::text AS billed FROM invoices
            WHERE payer_employer_id = ${emp} AND status <> 'VOIDED'`,
      );
      const [one] = await db.execute<{ t: string }>(
        sql`SELECT total_amount::text AS t FROM invoices WHERE payer_employer_id = ${emp} LIMIT 1`,
      );
      expect(rev?.billed).toBe(one?.t);
    }
    // Informational: which side won varies with scheduling; both are safe.
    expect(winners.size).toBeGreaterThanOrEqual(1);
  });

  it('after a conversion records a verified payment, Generate invoice for the same service needs a recorded reason', async () => {
    const emp = await newEmployer('SeqConvThenGen');
    const leadId = await newLead(emp);
    as('ADMIN');
    await leadSvc.acceptLead(newPaymentInput(leadId));
    const before = await counts(emp);
    const input = {
      payerMode: 'EMPLOYER' as const,
      payerId: emp,
      serviceCatalogItemId: feeServiceId,
      qty: 1,
      unitPrice: feeServicePrice ?? '1500.00',
      currencyCode: 'EUR',
    };
    await expect(generateInvoiceForPayer(input)).rejects.toMatchObject({
      code: 'DUPLICATE_INVOICE_LIKELY',
    });
    expect(await counts(emp)).toMatchObject({ invoices: before.invoices });
    // Finance can still confirm a genuinely separate sale, audited.
    const r = await generateInvoiceForPayer({
      ...input,
      overrideDuplicateReason: 'Second, separate advert package agreed by email',
    });
    expect(r.invoiceId).toBeTruthy();
    const [audit] = await db.execute<{ n: number }>(
      sql`SELECT COUNT(*)::int AS n FROM audit_events
          WHERE action = 'DUPLICATE_OVERRIDE' AND actor_user_id = ${userIds.ADMIN}
            AND context ->> 'reason' = 'Second, separate advert package agreed by email'`,
    );
    expect(audit?.n).toBe(1);
  });

  it('two enquiries of the same employer racing to link the same invoice: exactly one wins', async () => {
    const emp = await newEmployer('Race3');
    const leadA = await newLead(emp);
    const leadB = await newLead(emp);
    const inv = await issueEmployerInvoice(emp);
    await payInFull(inv.engagementId, inv.total);
    const before = await counts(emp);
    as('RECRUITER');
    const results = await Promise.allSettled([
      leadSvc.acceptLead({ leadId: leadA, existingInvoiceId: inv.invoiceId }),
      leadSvc.acceptLead({ leadId: leadB, existingInvoiceId: inv.invoiceId }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'LEAD_INVOICE_LINKED_ELSEWHERE' });
    const after = await counts(emp);
    expect(after).toMatchObject({
      invoices: before.invoices,
      payments: before.payments,
      receipts: before.receipts,
      requisitions: before.requisitions + 1,
    });
    const statuses = [(await leadRow(leadA))?.status, (await leadRow(leadB))?.status].sort();
    expect(statuses).toEqual(['CONVERTED', 'NEW']);
  });
});

describe('unverified or ambiguous money is never accepted', () => {
  it('ISSUED (unpaid) invoice → refused, nothing created', async () => {
    const emp = await newEmployer('Unpaid');
    const leadId = await newLead(emp);
    const inv = await issueEmployerInvoice(emp);
    const before = await counts(emp);
    as('RECRUITER');
    await expect(
      leadSvc.acceptLead({ leadId, existingInvoiceId: inv.invoiceId }),
    ).rejects.toMatchObject({
      code: 'LEAD_INVOICE_NOT_VERIFIED',
      message: `Finance must verify the payment on ${inv.invoiceNumber} before this enquiry can be converted.`,
    });
    expect(await counts(emp)).toEqual(before);
    expect((await invoiceRow(inv.invoiceId))?.source_lead_id).toBeNull();
  });

  it('invoice with only a PENDING payment → refused, nothing created', async () => {
    const emp = await newEmployer('Pending');
    const leadId = await newLead(emp);
    const inv = await issueEmployerInvoice(emp);
    as('RECRUITER'); // non-finance records → stays PENDING
    await recordPayment({
      serviceEngagementId: inv.engagementId,
      amount: inv.total,
      currencyCode: 'EUR',
      method: 'BANK_TRANSFER',
      receivedAt: todayInDublin(),
    });
    const before = await counts(emp);
    await expect(
      leadSvc.acceptLead({ leadId, existingInvoiceId: inv.invoiceId }),
    ).rejects.toMatchObject({ code: 'LEAD_INVOICE_NOT_VERIFIED' });
    expect(await counts(emp)).toEqual(before);
  });

  it("another employer's paid invoice → refused", async () => {
    const empA = await newEmployer('PayerA');
    const empB = await newEmployer('PayerB');
    const leadId = await newLead(empA);
    const inv = await issueEmployerInvoice(empB);
    await payInFull(inv.engagementId, inv.total);
    as('RECRUITER');
    await expect(
      leadSvc.acceptLead({ leadId, existingInvoiceId: inv.invoiceId }),
    ).rejects.toMatchObject({ code: 'LEAD_INVOICE_WRONG_PAYER' });
    expect((await leadRow(leadId))?.status).toBe('NEW');
  });

  it('a paid invoice already linked to another requisition → refused', async () => {
    const emp = await newEmployer('Linked');
    const [req] = await db
      .insert(jobRequisitions)
      .values({ employerId: emp, title: `${PREFIX} job`, status: 'OPEN' })
      .returning({ id: jobRequisitions.id });
    const leadId = await newLead(emp);
    const inv = await issueEmployerInvoice(emp, '1500.00', { jobRequisitionId: req?.id });
    await payInFull(inv.engagementId, inv.total);
    as('RECRUITER');
    await expect(
      leadSvc.acceptLead({ leadId, existingInvoiceId: inv.invoiceId }),
    ).rejects.toMatchObject({ code: 'LEAD_INVOICE_LINKED_ELSEWHERE' });
  });
});

describe('closed leads are refused', () => {
  for (const status of ['LOST', 'REJECTED', 'EXPIRED'] as const) {
    it(`${status} → refused in both modes, nothing created`, async () => {
      const emp = await newEmployer(`Closed-${status}`);
      const leadId = await newLead(emp, status);
      const inv = await issueEmployerInvoice(emp);
      await payInFull(inv.engagementId, inv.total);
      const before = await counts(emp);
      as('ADMIN');
      await expect(
        leadSvc.acceptLead({ leadId, existingInvoiceId: inv.invoiceId }),
      ).rejects.toMatchObject({ code: 'LEAD_CLOSED' });
      await expect(leadSvc.acceptLead(newPaymentInput(leadId))).rejects.toMatchObject({
        code: 'LEAD_CLOSED',
      });
      expect(await counts(emp)).toEqual(before);
    });
  }
});

describe('received date (Europe/Dublin business date)', () => {
  it('blank → today in Dublin; future → refused', async () => {
    const emp = await newEmployer('Dates');
    const leadId = await newLead(emp);
    as('ADMIN');
    await expect(
      leadSvc.acceptLead(newPaymentInput(leadId, { receivedAt: '2999-01-01' })),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await leadSvc.acceptLead(newPaymentInput(leadId, { receivedAt: '' }));
    const [p] = await db.execute<{ d: string }>(sql`
      SELECT to_char(p.received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS d
      FROM payments p JOIN service_engagements e ON e.id = p.service_engagement_id
      WHERE e.payer_employer_id = ${emp}
    `);
    expect(p?.d).toBe(todayInDublin());
  });
});

describe('lead invoices — sourceLeadId stamping (generate.ts)', () => {
  it('stamps sourceLeadId when the payer matches; refuses a mismatched payer', async () => {
    const empA = await newEmployer('SrcA');
    const empB = await newEmployer('SrcB');
    const leadA = await newLead(empA);
    const inv = await issueEmployerInvoice(empA, '1500.00', { sourceLeadId: leadA });
    expect((await invoiceRow(inv.invoiceId))?.source_lead_id).toBe(leadA);
    const before = await counts(empB);
    await expect(
      issueEmployerInvoice(empB, '1500.00', { sourceLeadId: leadA }),
    ).rejects.toMatchObject({ code: 'LEAD_PAYER_MISMATCH' });
    expect(await counts(empB)).toEqual(before);
  });

  it('a non-finance user cannot issue the lead invoice (finance issues invoices)', async () => {
    const emp = await newEmployer('SrcStaff');
    const leadId = await newLead(emp);
    as('RECRUITER');
    await expect(
      generateInvoiceForPayer({
        payerMode: 'EMPLOYER',
        payerId: emp,
        serviceCatalogItemId: feeServiceId,
        qty: 1,
        unitPrice: '1500.00',
        currencyCode: 'EUR',
        sourceLeadId: leadId,
      }),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_ERROR' });
  });

  it('a lead-invoice paid by the employer can then be used to convert', async () => {
    const emp = await newEmployer('SrcConvert');
    const leadId = await newLead(emp);
    const inv = await issueEmployerInvoice(emp, '1500.00', { sourceLeadId: leadId });
    await payInFull(inv.engagementId, inv.total);
    // The lead's own PAID invoice blocks a second charge…
    as('RECRUITER');
    await expect(leadSvc.acceptLead(newPaymentInput(leadId))).rejects.toMatchObject({
      code: 'LEAD_EMPLOYER_HAS_INVOICE',
    });
    // …and is offered + accepted as the existing invoice.
    const opts = await leadSvc.fetchLeadConversionOptions(leadId);
    expect(opts.invoices.map((i) => [i.number, i.usable])).toEqual([[inv.invoiceNumber, true]]);
    const before = await counts(emp);
    await leadSvc.acceptLead({ leadId, existingInvoiceId: inv.invoiceId });
    const after = await counts(emp);
    expect(after.invoices).toBe(before.invoices);
    expect(after.payments).toBe(before.payments);
  });
});

describe('placement fee invoices (generate.ts)', () => {
  async function seedPlacement(employerId: string) {
    const [req] = await db
      .insert(jobRequisitions)
      .values({ employerId, title: `${PREFIX} placement job`, status: 'OPEN' })
      .returning({ id: jobRequisitions.id });
    const [p] = await db
      .insert(persons)
      .values({ firstName: PREFIX, lastName: 'Candidate', source: 'DIRECT' })
      .returning({ id: persons.id });
    if (!req || !p) throw new Error('seed failed');
    created.persons.push(p.id);
    const [pl] = await db
      .insert(placements)
      .values({ personId: p.id, employerId, jobRequisitionId: req.id, status: 'CONFIRMED' })
      .returning({ id: placements.id });
    if (!pl) throw new Error('placement seed failed');
    created.placements.push(pl.id);
    return { placementId: pl.id, requisitionId: req.id };
  }

  it('links the placement + job, refuses a second invoice unless finance gives a reason (audited)', async () => {
    const emp = await newEmployer('Fee');
    const { placementId, requisitionId } = await seedPlacement(emp);
    const first = await issueEmployerInvoice(emp, '3000.00', { placementId });
    const row = await invoiceRow(first.invoiceId);
    expect(row).toMatchObject({ placement_id: placementId, job_requisition_id: requisitionId });
    const [issued] = await db.execute<{ context: Record<string, unknown> }>(sql`
      SELECT context FROM audit_events
      WHERE entity_type = 'invoice' AND entity_id = ${first.invoiceId} AND action = 'ISSUED'
    `);
    expect(issued?.context).toMatchObject({ placementId, jobRequisitionId: requisitionId });

    const before = await counts(emp);
    await expect(
      issueEmployerInvoice(emp, '3000.00', {
        placementId,
        overrideDuplicateReason: 'not the placement override',
      }),
    ).rejects.toMatchObject({ code: 'PLACEMENT_ALREADY_INVOICED' });
    expect(await counts(emp)).toEqual(before);

    const second = await issueEmployerInvoice(emp, '500.00', {
      placementId,
      overridePlacementInvoiceReason: 'Agreed top-up after salary review',
      overrideDuplicateReason: 'Top-up for the same placement',
    });
    expect(second.invoiceNumber).toBeTruthy();
    const [ov] = await db.execute<{ context: Record<string, unknown> }>(sql`
      SELECT context FROM audit_events
      WHERE entity_type = 'invoice' AND entity_id = ${first.invoiceId}
        AND action = 'PLACEMENT_SECOND_INVOICE_OVERRIDE'
    `);
    expect(ov?.context).toMatchObject({
      placementId,
      reason: 'Agreed top-up after salary review',
      newInvoiceNumber: second.invoiceNumber,
    });
  });

  it("refuses another employer's placement and a mismatched requisition", async () => {
    const empA = await newEmployer('FeeA');
    const empB = await newEmployer('FeeB');
    const { placementId } = await seedPlacement(empB);
    const before = await counts(empA);
    await expect(issueEmployerInvoice(empA, '3000.00', { placementId })).rejects.toMatchObject({
      code: 'PLACEMENT_PAYER_MISMATCH',
    });
    const other = await seedPlacement(empB);
    await expect(
      issueEmployerInvoice(empB, '3000.00', {
        placementId,
        jobRequisitionId: other.requisitionId,
      }),
    ).rejects.toMatchObject({ code: 'PLACEMENT_REQUISITION_MISMATCH' });
    expect(await counts(empA)).toEqual(before);
  });

  it('a fee for a different placement is not flagged as a duplicate', async () => {
    const emp = await newEmployer('FeeTwo');
    const p1 = await seedPlacement(emp);
    const p2 = await seedPlacement(emp);
    await issueEmployerInvoice(emp, '3000.00', { placementId: p1.placementId });
    await expect(
      issueEmployerInvoice(emp, '3000.00', { placementId: p2.placementId }),
    ).resolves.toMatchObject({ invoiceNumber: expect.any(String) });
  });
});
