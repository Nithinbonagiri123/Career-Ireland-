import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FinanceTier, hasFinanceAuthority } from '@/lib/auth/finance-policy-rules';
import { roleSatisfies } from '@/lib/auth/role-rules';
import { db } from '@/lib/db/client';
import { auditEvents } from '@/lib/db/schema/audit_events';
import { payments, serviceEngagements } from '@/lib/db/schema/commerce';
import { immigrationCases } from '@/lib/db/schema/immigration';
import { leads } from '@/lib/db/schema/leads';
import { persons } from '@/lib/db/schema/persons';
import { serviceCatalogItems } from '@/lib/db/schema/services';
import { type UserRole, users } from '@/lib/db/schema/users';

/**
 * Phase 1 Item 4 — role-by-role finance authorization matrix.
 *
 * Every money-moving entry point is called as each internal role (and as
 * a non-finance owner). Denied callers must get AuthorizationError; allowed
 * callers must get PAST the gate (they then fail on the dummy ids with a
 * not-found / validation error, which proves the gate let them through).
 *
 * Actors are real users rows, because the side effects themselves
 * (performPaymentVerification, insertReceipt, official issuance, refunds)
 * re-check the acting user in the database.
 *
 * Also proves the PREPARE-tier behaviour: a non-finance lead acceptance
 * records the payment as PENDING (C1); the verification side effect refuses
 * a non-finance actor; an unpaid service cannot be activated by staff;
 * verify and reject race to exactly one winner.
 */

type Actor = { key: string; role: UserRole; isOwner: boolean };
const ACTORS: Actor[] = [
  { key: 'STAFF', role: 'STAFF', isOwner: false },
  { key: 'RECRUITER', role: 'RECRUITER', isOwner: false },
  { key: 'DOCUMENT_SPECIALIST', role: 'DOCUMENT_SPECIALIST', isOwner: false },
  { key: 'MANAGER', role: 'MANAGER', isOwner: false },
  { key: 'FINANCE', role: 'FINANCE', isOwner: false },
  { key: 'ADMIN', role: 'ADMIN', isOwner: false },
  { key: 'OWNER(MANAGER)', role: 'MANAGER', isOwner: true },
];
// Expected outcomes are DERIVED from the central policy, not hard-coded,
// so the matrix proves each entry point uses the tier it claims.
const FINANCE_KEYS = new Set(
  ACTORS.filter((a) => hasFinanceAuthority(a, 'VERIFY')).map((a) => a.key),
);
type Expectation = { tier: FinanceTier } | { roles: UserRole[] };
function allowed(actor: Actor, e: Expectation): boolean {
  return 'tier' in e ? hasFinanceAuthority(actor, e.tier) : roleSatisfies(actor, e.roles);
}

const current = {
  user: {
    id: '',
    email: '',
    name: '',
    role: 'STAFF' as UserRole,
    isOwner: false,
    personId: null,
    employerId: null,
  },
};
vi.mock('@/lib/auth/session', async () => {
  const { roleSatisfies } = await import('@/lib/auth/role-rules');
  const { AuthorizationError } = await import('@/lib/errors');
  return {
    INTERNAL_STAFF_ROLES: [
      'ADMIN',
      'STAFF',
      'MANAGER',
      'RECRUITER',
      'DOCUMENT_SPECIALIST',
      'FINANCE',
    ],
    getSession: vi.fn(async () => current),
    requireSession: vi.fn(async () => current),
    requireInternalStaff: vi.fn(async () => current),
    // Module grants are not what this matrix measures — let them pass so
    // the finance policy is the only gate under test.
    requirePermission: vi.fn(async () => current),
    requireAnyPermission: vi.fn(async () => current),
    checkPermission: vi.fn(async () => true),
    requireRole: vi.fn(async (roles: UserRole[]) => {
      if (!roleSatisfies(current.user, roles)) throw new AuthorizationError();
      return current;
    }),
    requireOwner: vi.fn(async () => {
      if (!current.user.isOwner) throw new AuthorizationError();
      return current;
    }),
  };
});

const ZERO = '00000000-0000-0000-0000-000000000000';
const STAMP = `vitest-finmatrix-${Date.now()}`;
const userIds = new Map<string, string>();
const allUserIds: string[] = [];

function actAs(key: string) {
  const a = ACTORS.find((x) => x.key === key);
  const id = userIds.get(key);
  if (!a || !id) throw new Error(`unknown actor ${key}`);
  current.user = { ...current.user, id, role: a.role, isOwner: a.isOwner };
}

async function outcome(fn: () => Promise<unknown>): Promise<'denied' | 'passed-gate'> {
  try {
    await fn();
    return 'passed-gate';
  } catch (e) {
    if (e instanceof TypeError) throw e; // malformed test input never reached the gate
    const code = (e as { code?: string }).code;
    return code === 'AUTHORIZATION_ERROR' ? 'denied' : 'passed-gate';
  }
}

beforeAll(async () => {
  for (const a of ACTORS) {
    const [row] = await db
      .insert(users)
      .values({
        email: `${STAMP}-${a.key.replace(/[^a-z]/gi, '').toLowerCase()}@example.test`,
        fullName: `Matrix ${a.key}`,
        role: a.role,
        isOwner: a.isOwner,
        passwordHash: 'x',
      })
      .returning({ id: users.id });
    if (!row) throw new Error('user seed failed');
    userIds.set(a.key, row.id);
    allUserIds.push(row.id);
  }
});

const ACTIONS: Array<{
  name: string;
  tier: string;
  expect?: Expectation;
  run: () => Promise<unknown>;
}> = [
  {
    name: 'generateInvoiceForPayer',
    tier: 'ISSUE',
    run: async () => (await import('@/modules/billing/generate')).generateInvoiceForPayer({}),
  },
  {
    name: 'verifyPayment',
    tier: 'VERIFY',
    run: async () =>
      (await import('@/modules/commerce/service')).verifyPayment({ paymentId: ZERO }),
  },
  {
    name: 'rejectPayment',
    tier: 'VERIFY',
    run: async () =>
      (await import('@/modules/commerce/service')).rejectPayment({
        paymentId: ZERO,
        reason: 'matrix test',
      }),
  },
  {
    name: 'verifyPaymentForProForma',
    tier: 'VERIFY',
    run: async () => (await import('@/modules/proformas/payments')).verifyPaymentForProForma(ZERO),
  },
  {
    name: 'finaliseDraft (paid intake)',
    tier: 'VERIFY',
    run: async () =>
      (await import('@/modules/candidates/onboarding-service')).finaliseDraft(
        {} as Parameters<typeof import('@/modules/candidates/onboarding-service').finaliseDraft>[0],
      ),
  },
  {
    name: 'directPaymentAndConvert',
    tier: 'VERIFY',
    run: async () => {
      const r = await (
        await import('@/modules/clients/direct-payment')
      ).directPaymentAndConvertAction({});
      if (!r.ok) throw Object.assign(new Error(r.error.message), { code: r.error.code });
    },
  },
  {
    name: 'voidInvoice',
    tier: 'REVERSE',
    run: async () => (await import('@/modules/billing/service')).voidInvoice(ZERO, 'matrix test'),
  },
  {
    name: 'issueCreditNote',
    tier: 'REVERSE',
    run: async () =>
      (await import('@/modules/billing/service')).issueCreditNote({
        invoiceId: ZERO,
        amount: '10.00',
        reason: 'matrix test',
      }),
  },
  {
    name: 'issueRefund',
    tier: 'REVERSE',
    run: async () =>
      (await import('@/modules/billing/service')).issueRefund({
        paymentId: ZERO,
        amount: '10.00',
        method: 'BANK_TRANSFER',
        reason: 'matrix test',
      }),
  },
  {
    name: 'issuePreIssuanceRefund',
    tier: 'REVERSE',
    run: async () =>
      (await import('@/modules/proformas/refunds')).issuePreIssuanceRefund({
        paymentId: ZERO,
        amount: '10.00',
        method: 'BANK_TRANSFER',
        reason: 'matrix test',
        idempotencyKey: `${STAMP}-${Math.random()}`,
      } as Parameters<typeof import('@/modules/proformas/refunds').issuePreIssuanceRefund>[0]),
  },
  {
    name: 'grantComplimentaryService (J1)',
    tier: 'REVERSE',
    run: async () =>
      (await import('@/modules/billing/complimentary')).grantComplimentaryService(
        {} as Parameters<
          typeof import('@/modules/billing/complimentary').grantComplimentaryService
        >[0],
      ),
  },
  {
    name: 'finaliseDraftComplimentary (J1)',
    tier: 'REVERSE',
    run: async () =>
      (await import('@/modules/candidates/onboarding-service')).finaliseDraftComplimentary(
        {} as Parameters<
          typeof import('@/modules/candidates/onboarding-service').finaliseDraftComplimentary
        >[0],
      ),
  },
  // ── PREPARE tier: every internal role passes the finance gate ──
  {
    name: 'recordPayment (lands PENDING for non-finance)',
    tier: 'PREPARE',
    run: async () =>
      (await import('@/modules/commerce/service')).recordPayment({
        serviceEngagementId: ZERO,
        amount: '10.00',
        currencyCode: 'EUR',
        method: 'BANK_TRANSFER',
      } as Parameters<typeof import('@/modules/commerce/service').recordPayment>[0]),
  },
  {
    name: 'acceptLead (K1 conversion exception)',
    tier: 'PREPARE',
    run: async () =>
      (await import('@/modules/leads/service')).acceptLead({
        leadId: ZERO,
        reason: 'matrix test',
        serviceCatalogItemId: ZERO,
        amount: '10.00',
        currencyCode: 'EUR',
        method: 'BANK_TRANSFER',
      }),
  },
  {
    name: 'updateEngagementStatus',
    tier: 'PREPARE',
    run: async () =>
      (await import('@/modules/commerce/service')).updateEngagementStatus({
        engagementId: ZERO,
        status: 'ON_HOLD',
      }),
  },
  // ── Accounting + supplier bills (role-gated; B1 owner = ADMIN) ──
  {
    name: 'postManualJournal',
    tier: 'ADMIN|FINANCE',
    expect: { roles: ['ADMIN', 'FINANCE'] },
    run: async () =>
      (await import('@/modules/accounting/journals')).postManualJournal(
        {} as Parameters<typeof import('@/modules/accounting/journals').postManualJournal>[0],
      ),
  },
  {
    name: 'reverseJournal',
    tier: 'ADMIN|FINANCE',
    expect: { roles: ['ADMIN', 'FINANCE'] },
    run: async () =>
      (await import('@/modules/accounting/journals')).reverseJournal({
        journalId: ZERO,
        reason: 'matrix test',
      }),
  },
  {
    name: 'transitionPeriod',
    tier: 'ADMIN|FINANCE',
    expect: { roles: ['ADMIN', 'FINANCE'] },
    run: async () =>
      (await import('@/modules/accounting/periods')).transitionPeriod({
        periodId: ZERO,
        to: 'CLOSED',
        reason: 'matrix test',
      } as Parameters<typeof import('@/modules/accounting/periods').transitionPeriod>[0]),
  },
  {
    name: 'postYearEndClose',
    tier: 'ADMIN',
    expect: { roles: ['ADMIN'] },
    run: async () =>
      (await import('@/modules/accounting/year-end-close')).postYearEndClose(
        {} as Parameters<typeof import('@/modules/accounting/year-end-close').postYearEndClose>[0],
      ),
  },
  {
    name: 'createSupplierBill',
    tier: 'ADMIN|FINANCE',
    expect: { roles: ['ADMIN', 'FINANCE'] },
    run: async () =>
      (await import('@/modules/ap/service')).createSupplierBill(
        {} as Parameters<typeof import('@/modules/ap/service').createSupplierBill>[0],
      ),
  },
  {
    name: 'voidSupplierBill',
    tier: 'ADMIN|FINANCE',
    expect: { roles: ['ADMIN', 'FINANCE'] },
    run: async () =>
      (await import('@/modules/ap/service')).voidSupplierBill({
        billId: ZERO,
        reason: 'matrix test',
      }),
  },
  {
    name: 'recordBillPayment',
    tier: 'ADMIN|FINANCE',
    expect: { roles: ['ADMIN', 'FINANCE'] },
    run: async () =>
      (await import('@/modules/ap/service')).recordBillPayment(
        {} as Parameters<typeof import('@/modules/ap/service').recordBillPayment>[0],
      ),
  },
];

describe('finance authorization matrix (role × action)', () => {
  for (const action of ACTIONS) {
    for (const actor of ACTORS) {
      const e: Expectation = action.expect ?? { tier: action.tier as FinanceTier };
      const expected = allowed(actor, e) ? 'passed-gate' : 'denied';
      it(`${action.tier} ${action.name} — ${actor.key}: ${expected}`, async () => {
        actAs(actor.key);
        expect(await outcome(action.run)).toBe(expected);
      });
    }
  }

  it('canGrantComplimentary follows the same rule (UI and server agree)', async () => {
    const { canGrantComplimentary } = await import('@/modules/billing/complimentary');
    for (const actor of ACTORS) {
      actAs(actor.key);
      expect(await canGrantComplimentary()).toBe(FINANCE_KEYS.has(actor.key));
    }
  });
});

// ─── PREPARE tier: lead acceptance, side-effect guards, activation, race ──

const created = { persons: [] as string[], leads: [] as string[] };
let serviceId = '';
let servicePrice = '';

async function seedImmigrationLead(n: number): Promise<string> {
  const [p] = await db
    .insert(persons)
    .values({
      firstName: 'Matrix',
      lastName: `${STAMP}_${n}`,
      email: `${STAMP}-p${n}@example.test`,
      source: 'DIRECT',
    })
    .returning({ id: persons.id });
  if (!p) throw new Error('person seed failed');
  created.persons.push(p.id);
  const [l] = await db
    .insert(leads)
    .values({ targetBusiness: 'IMMIGRATION', personId: p.id, status: 'CONTACTED' })
    .returning({ id: leads.id });
  if (!l) throw new Error('lead seed failed');
  created.leads.push(l.id);
  return l.id;
}

async function acceptAs(key: string, leadId: string, amount?: string) {
  actAs(key);
  const { acceptLead } = await import('@/modules/leads/service');
  return acceptLead({
    leadId,
    reason: 'matrix acceptance',
    serviceCatalogItemId: serviceId,
    amount: amount ?? servicePrice,
    currencyCode: 'EUR',
    method: 'BANK_TRANSFER',
  });
}

async function paymentForLead(leadId: string) {
  const [row] = await db.execute<{
    id: string;
    status: string;
    engagement_id: string;
    eng_status: string;
  }>(sql`
    SELECT p.id, p.status, e.id AS engagement_id, e.status AS eng_status
    FROM invoices i
    JOIN service_engagements e ON e.id = i.service_engagement_id
    JOIN payments p ON p.service_engagement_id = e.id
    WHERE i.source_lead_id = ${leadId}
    LIMIT 1
  `);
  if (!row) throw new Error('no payment for lead');
  return row;
}

describe('PREPARE tier keeps staff working without finalizing money', () => {
  beforeAll(async () => {
    // K1: use an active, person-billable service at its catalog price.
    const [svc] = await db
      .select({ id: serviceCatalogItems.id, price: serviceCatalogItems.defaultPrice })
      .from(serviceCatalogItems)
      .where(
        sql`${serviceCatalogItems.isActive} AND ${serviceCatalogItems.payerType} IN ('PERSON','ANY')
            AND ${serviceCatalogItems.defaultPrice} IS NOT NULL
            AND COALESCE(${serviceCatalogItems.defaultCurrencyCode}, 'EUR') = 'EUR'`,
      )
      .limit(1);
    if (!svc?.price) throw new Error('no priced person service in catalog — run db:seed:services');
    serviceId = svc.id;
    servicePrice = svc.price;
  });

  it('C1: STAFF accepts a lead; payment stays PENDING and the service stays unpaid', async () => {
    const leadId = await seedImmigrationLead(1);
    await acceptAs('STAFF', leadId);
    const p = await paymentForLead(leadId);
    expect(p.status).toBe('PENDING');
    expect(p.eng_status).toBe('PENDING_PAYMENT');
  });

  it('C1: FINANCE accepting a lead verifies the payment in the same step', async () => {
    const leadId = await seedImmigrationLead(2);
    await acceptAs('FINANCE', leadId);
    const p = await paymentForLead(leadId);
    expect(p.status).toBe('VERIFIED');
    expect(p.eng_status).toBe('ACTIVE');
  });

  it('the verification side effect refuses a non-finance actor even when called directly', async () => {
    const leadId = await seedImmigrationLead(3);
    await acceptAs('STAFF', leadId);
    const p = await paymentForLead(leadId);
    const { performPaymentVerification } = await import('@/modules/commerce/service');
    const [payment] = await db.select().from(payments).where(eq(payments.id, p.id));
    if (!payment) throw new Error('payment missing');
    await expect(
      db.transaction((tx) =>
        performPaymentVerification(tx, payment, userIds.get('MANAGER') as string),
      ),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_ERROR' });
    const [after] = await db.select().from(payments).where(eq(payments.id, p.id));
    expect(after?.status).toBe('PENDING');
  });

  it('staff cannot activate an unpaid service; finance can, as an audited override', async () => {
    const leadId = await seedImmigrationLead(4);
    await acceptAs('STAFF', leadId);
    const p = await paymentForLead(leadId);
    const { updateEngagementStatus } = await import('@/modules/commerce/service');
    actAs('MANAGER');
    await expect(
      updateEngagementStatus({ engagementId: p.engagement_id, status: 'ACTIVE' }),
    ).rejects.toMatchObject({ code: 'ENGAGEMENT_UNPAID' });
    actAs('FINANCE');
    const after = await updateEngagementStatus({
      engagementId: p.engagement_id,
      status: 'ACTIVE',
      reason: 'cash confirmed by phone',
    });
    expect(after.status).toBe('ACTIVE');
  });

  it('verify and reject on the same pending payment race to exactly one winner', async () => {
    const leadId = await seedImmigrationLead(5);
    await acceptAs('STAFF', leadId);
    const p = await paymentForLead(leadId);
    const { verifyPayment, rejectPayment } = await import('@/modules/commerce/service');
    actAs('FINANCE');
    const results = await Promise.allSettled([
      verifyPayment({ paymentId: p.id }),
      rejectPayment({ paymentId: p.id, reason: 'race test' }),
    ]);
    const [final] = await db.select().from(payments).where(eq(payments.id, p.id));
    expect(['VERIFIED', 'REJECTED']).toContain(final?.status);
    // The losing call either failed or observed the winner's state — the
    // row never ends in a mixed state.
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
  });
});

describe('K1 — lead-conversion invoice exception is narrow and server-enforced', () => {
  it('staff cannot choose a non-catalog price; nothing is created', async () => {
    const leadId = await seedImmigrationLead(6);
    await expect(acceptAs('STAFF', leadId, '1.00')).rejects.toMatchObject({
      code: 'PRICE_NOT_AUTHORIZED',
    });
    const [l] = await db.select().from(leads).where(eq(leads.id, leadId));
    expect(l?.acceptedAt).toBeNull();
    const [inv] = await db.execute<{ n: number }>(
      sql`SELECT COUNT(*)::int AS n FROM invoices WHERE source_lead_id = ${leadId}`,
    );
    expect(inv?.n).toBe(0);
  });

  it('the invoice audit records the exception, the actor and the price source', async () => {
    const leadId = await seedImmigrationLead(7);
    await acceptAs('STAFF', leadId);
    const [row] = await db.execute<{ ctx: Record<string, unknown> }>(sql`
      SELECT a.context AS ctx FROM audit_events a
      JOIN invoices i ON i.id::text = a.entity_id::text
      WHERE i.source_lead_id = ${leadId} AND a.action = 'ISSUED'
      LIMIT 1
    `);
    expect(row?.ctx).toMatchObject({
      issuedUnder: 'lead_conversion_exception',
      actorHasFinanceAuthority: false,
      priceSource: 'catalog',
    });
  });

  it('a second acceptance of the same lead is refused (idempotent)', async () => {
    const leadId = await seedImmigrationLead(8);
    await acceptAs('STAFF', leadId);
    await expect(acceptAs('STAFF', leadId)).rejects.toMatchObject({
      code: 'LEAD_ALREADY_ACCEPTED',
    });
  });

  it('concurrent acceptances of one lead create exactly one invoice', async () => {
    const leadId = await seedImmigrationLead(9);
    actAs('STAFF');
    const { acceptLead } = await import('@/modules/leads/service');
    const input = {
      leadId,
      reason: 'race',
      serviceCatalogItemId: serviceId,
      amount: servicePrice,
      currencyCode: 'EUR',
      method: 'BANK_TRANSFER' as const,
    };
    const results = await Promise.allSettled([acceptLead(input), acceptLead(input)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const [inv] = await db.execute<{ n: number }>(
      sql`SELECT COUNT(*)::int AS n FROM invoices WHERE source_lead_id = ${leadId}`,
    );
    expect(inv?.n).toBe(1);
  });
});

describe('internal actor-based variants refuse non-finance actors', () => {
  const managerId = () => userIds.get('MANAGER') as string;
  const financeId = () => userIds.get('FINANCE') as string;

  it('verifyPaymentForProFormaAs', async () => {
    const { verifyPaymentForProFormaAs } = await import('@/modules/proformas/payments');
    await expect(verifyPaymentForProFormaAs(ZERO, managerId())).rejects.toMatchObject({
      code: 'AUTHORIZATION_ERROR',
    });
    await expect(verifyPaymentForProFormaAs(ZERO, financeId())).rejects.not.toMatchObject({
      code: 'AUTHORIZATION_ERROR',
    });
  });

  it('issuePreIssuanceRefundAs', async () => {
    const { issuePreIssuanceRefundAs } = await import('@/modules/proformas/refunds');
    const input = {
      paymentId: ZERO,
      amount: '10.00',
      method: 'BANK_TRANSFER',
      reason: 'matrix test',
      idempotencyKey: `${STAMP}-as`,
    } as Parameters<typeof issuePreIssuanceRefundAs>[0];
    await expect(issuePreIssuanceRefundAs(input, managerId())).rejects.toMatchObject({
      code: 'AUTHORIZATION_ERROR',
    });
    await expect(issuePreIssuanceRefundAs(input, financeId())).rejects.not.toMatchObject({
      code: 'AUTHORIZATION_ERROR',
    });
  });

  it('issueOfficialInvoiceForProForma (ISSUE)', async () => {
    const { issueOfficialInvoiceForProForma } = await import('@/modules/proformas/issuance');
    const args = (issuedByUserId: string) => ({
      proFormaInvoiceId: ZERO,
      purpose: 'FULL_PAYMENT' as const,
      issuanceKey: 'matrix',
      issuedByUserId,
    });
    await expect(
      db.transaction((tx) => issueOfficialInvoiceForProForma(tx, args(managerId()))),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_ERROR' });
    await expect(
      db.transaction((tx) => issueOfficialInvoiceForProForma(tx, args(financeId()))),
    ).rejects.not.toMatchObject({ code: 'AUTHORIZATION_ERROR' });
  });

  it('insertReceipt (proof of confirmed money)', async () => {
    const { insertReceipt } = await import('@/modules/billing/service');
    const args = (issuedByUserId: string) => ({
      paymentId: ZERO,
      invoiceId: null,
      payerPersonId: ZERO,
      amount: '10.00',
      currencyCode: 'EUR',
      receivedAt: new Date(),
      issuedByUserId,
    });
    await expect(
      db.transaction((tx) => insertReceipt(tx, args(managerId()))),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_ERROR' });
  });

  it('a deactivated finance user is refused at the side effect', async () => {
    const { verifyPaymentForProFormaAs } = await import('@/modules/proformas/payments');
    await db.update(users).set({ isActive: false }).where(eq(users.id, financeId()));
    try {
      await expect(verifyPaymentForProFormaAs(ZERO, financeId())).rejects.toMatchObject({
        code: 'AUTHORIZATION_ERROR',
      });
    } finally {
      await db.update(users).set({ isActive: true }).where(eq(users.id, financeId()));
    }
  });

  it('manual "Activate candidate" requires verified payment for non-finance staff', async () => {
    const { activateCandidateAction } = await import('@/modules/clients/activation');
    const [p] = await db
      .insert(persons)
      .values({
        firstName: 'Act',
        lastName: STAMP,
        email: `${STAMP}-act@example.test`,
        source: 'DIRECT',
      })
      .returning({ id: persons.id });
    if (!p) throw new Error('seed failed');
    created.persons.push(p.id);
    const [l] = await db
      .insert(leads)
      .values({ targetBusiness: 'CANDIDATE_SERVICES', personId: p.id, status: 'CONTACTED' })
      .returning({ id: leads.id });
    if (!l) throw new Error('seed failed');
    created.leads.push(l.id);
    actAs('STAFF');
    const r = await activateCandidateAction({ leadId: l.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('ACTIVATION_REQUIRES_PAYMENT');
  });
});

afterAll(async () => {
  // Best-effort cleanup of VITEST rows (financial rows created by the
  // acceptance tests are removed in dependency order).
  try {
    if (created.leads.length > 0) {
      const engIds = (
        await db.execute<{ id: string }>(sql`
          SELECT service_engagement_id AS id FROM invoices
          WHERE source_lead_id IN ${sql.raw(`('${created.leads.join("','")}')`)}
        `)
      ).map((r) => r.id);
      if (engIds.length > 0) {
        const list = sql.raw(`('${engIds.join("','")}')`);
        await db.execute(
          sql`DELETE FROM financial_events WHERE source_id IN (SELECT id::text FROM payments WHERE service_engagement_id IN ${list}) OR source_id IN (SELECT id::text FROM invoices WHERE service_engagement_id IN ${list})`,
        );
        await db.execute(
          sql`DELETE FROM receipts WHERE payment_id IN (SELECT id FROM payments WHERE service_engagement_id IN ${list})`,
        );
        await db.execute(sql`DELETE FROM payments WHERE service_engagement_id IN ${list}`);
        await db.execute(
          sql`DELETE FROM invoice_line_items WHERE invoice_id IN (SELECT id FROM invoices WHERE service_engagement_id IN ${list})`,
        );
        await db.execute(sql`DELETE FROM invoices WHERE service_engagement_id IN ${list}`);
      }
      await db.delete(leads).where(inArray(leads.id, created.leads));
      if (engIds.length > 0) {
        await db.delete(serviceEngagements).where(inArray(serviceEngagements.id, engIds));
      }
    }
    if (created.persons.length > 0) {
      await db
        .delete(immigrationCases)
        .where(inArray(immigrationCases.beneficiaryPersonId, created.persons));
      await db.delete(persons).where(inArray(persons.id, created.persons));
    }
  } catch (e) {
    console.warn('finance matrix cleanup incomplete (dev DB only):', (e as Error).message);
  }
  if (allUserIds.length > 0) {
    await db.delete(auditEvents).where(inArray(auditEvents.actorUserId, allUserIds));
    try {
      await db.delete(users).where(inArray(users.id, allUserIds));
    } catch {
      // A user still referenced by a financial row stays (inactive test data).
      await db.update(users).set({ isActive: false }).where(inArray(users.id, allUserIds));
    }
  }
});
