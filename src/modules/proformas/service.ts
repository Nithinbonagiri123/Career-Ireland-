import { and, eq, sql } from 'drizzle-orm';
import { type DbExecutor, recordAudit } from '@/lib/audit/withAudit';
import { requirePermission } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { currencies } from '@/lib/db/schema/currencies';
import { leads } from '@/lib/db/schema/leads';
import { persons } from '@/lib/db/schema/persons';
import {
  type ProFormaInvoice,
  type ProFormaInvoiceStatus,
  proFormaInvoices,
  proFormaLineItems,
  proFormaRevisions,
  proposalGroups,
} from '@/lib/db/schema/proformas';
import { serviceCatalogItems } from '@/lib/db/schema/services';
import { BusinessRuleError, NotFoundError, ValidationError } from '@/lib/errors';
import { allocateNextNumber } from '@/modules/billing/service';
import {
  centsToMoney,
  computeLineSubtotalCents,
  milliToQty,
  moneyToCents,
  qtyToMilli,
  sumCents,
} from './money';
import type {
  CancelProFormaInput,
  CreateProFormaInput,
  EditDraftProFormaInput,
  IssueProFormaInput,
  ProFormaLineInput,
  RecordAcceptanceInput,
  RejectProFormaInput,
  ReviseIssuedProFormaInput,
} from './schemas';

/**
 * Pro-forma service — Stage 2.
 *
 * Everything in this module runs inside `db.transaction(...)`. All
 * state transitions are gated by the DB CHECK on status + partial
 * UNIQUE "one ACCEPTED per group" + the service-level checks here.
 *
 * Lifecycle:
 *   DRAFT  →  ISSUED        issueProForma()
 *   DRAFT  →  (edit)         editDraft()                  (no revision)
 *   ISSUED →  ISSUED (bump)  reviseIssued()               (snapshots v=N into pro_forma_revisions)
 *   ISSUED →  ACCEPTED       recordAcceptance()           (locks proposal group, SUPERSEDEs siblings)
 *   DRAFT  →  CANCELLED      cancelProForma()
 *   ISSUED →  CANCELLED      cancelProForma()
 *   DRAFT  →  REJECTED       rejectProForma()
 *   ISSUED →  REJECTED       rejectProForma()
 *
 * ACCEPTED is terminal from the Stage 2 writer's perspective — any
 * financial change requires an amendment or replacement workflow,
 * which Stage 3 will add.
 *
 * SUPERSEDED is reached only through group acceptance (never set directly).
 * CONVERTED is reached only by the Stage 3 payment-triggered issuance path.
 */

/* ────────────────────────────────────────────────────────────────── */
/* Shared helpers                                                     */
/* ────────────────────────────────────────────────────────────────── */

type NormalisedLine = {
  input: ProFormaLineInput;
  unitPriceCents: number;
  quantityMilli: number;
  lineSubtotalCents: number;
};

function normaliseLines(lines: readonly ProFormaLineInput[]): {
  lines: NormalisedLine[];
  subtotalCents: number;
} {
  const normalised: NormalisedLine[] = lines.map((input) => {
    const unitPriceCents = moneyToCents(input.unitPrice);
    const quantityMilli = qtyToMilli(input.quantity);
    const lineSubtotalCents = computeLineSubtotalCents(unitPriceCents, quantityMilli);
    return { input, unitPriceCents, quantityMilli, lineSubtotalCents };
  });
  const subtotalCents = sumCents(normalised.map((l) => l.lineSubtotalCents));
  return { lines: normalised, subtotalCents };
}

async function validateReferences(
  tx: DbExecutor,
  args: {
    sourceLeadId: string;
    currencyCode: string;
    serviceCatalogItemIds: readonly string[];
  },
): Promise<{ lead: { id: string; targetBusiness: string; personId: string | null } }> {
  const [lead] = await tx
    .select({
      id: leads.id,
      targetBusiness: leads.targetBusiness,
      personId: leads.personId,
    })
    .from(leads)
    .where(eq(leads.id, args.sourceLeadId))
    .limit(1);
  if (!lead) throw new NotFoundError('Lead');
  if (lead.targetBusiness !== 'CANDIDATE_SERVICES') {
    throw new BusinessRuleError(
      'PROFORMA_WRONG_BUSINESS',
      'Pro formas are a Candidate Services feature. This lead is not CS.',
    );
  }
  if (!lead.personId) {
    throw new BusinessRuleError(
      'PROFORMA_LEAD_HAS_NO_PERSON',
      'Lead has no payer person on record.',
    );
  }
  const [cur] = await tx
    .select({ code: currencies.code, isActive: currencies.isActive })
    .from(currencies)
    .where(eq(currencies.code, args.currencyCode))
    .limit(1);
  if (!cur) throw new NotFoundError(`Currency ${args.currencyCode}`);
  if (!cur.isActive) {
    throw new ValidationError(`Currency ${args.currencyCode} is inactive`);
  }
  // All line items must reference services that exist and are active.
  // Also enforces the lead's own services-of-interest if we had one.
  const uniqueIds = Array.from(new Set(args.serviceCatalogItemIds));
  const found = await tx
    .select({ id: serviceCatalogItems.id, isActive: serviceCatalogItems.isActive })
    .from(serviceCatalogItems)
    .where(
      sql`${serviceCatalogItems.id} = ANY(ARRAY[${sql.join(
        uniqueIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )}])`,
    );
  const foundIds = new Set(found.map((r) => r.id));
  for (const id of uniqueIds) {
    if (!foundIds.has(id)) throw new NotFoundError(`Service ${id}`);
  }
  for (const r of found) {
    if (!r.isActive) {
      throw new ValidationError(`Service ${r.id} is inactive`);
    }
  }
  return { lead: { id: lead.id, targetBusiness: lead.targetBusiness, personId: lead.personId } };
}

async function writeLineItems(
  tx: DbExecutor,
  proFormaInvoiceId: string,
  lines: readonly NormalisedLine[],
): Promise<void> {
  await tx.insert(proFormaLineItems).values(
    lines.map((l, idx) => ({
      proFormaInvoiceId,
      serviceCatalogItemId: l.input.serviceCatalogItemId,
      description: l.input.description,
      quantity: milliToQty(l.quantityMilli),
      unitPrice: centsToMoney(l.unitPriceCents),
      lineSubtotal: centsToMoney(l.lineSubtotalCents),
      sortOrder: idx,
    })),
  );
}

async function readFullProForma(
  tx: DbExecutor,
  proFormaInvoiceId: string,
): Promise<{
  pf: ProFormaInvoice;
  lineItems: Array<{
    id: string;
    serviceCatalogItemId: string;
    description: string;
    quantity: string;
    unitPrice: string;
    lineSubtotal: string;
    sortOrder: number;
  }>;
}> {
  const [pf] = await tx
    .select()
    .from(proFormaInvoices)
    .where(eq(proFormaInvoices.id, proFormaInvoiceId))
    .limit(1);
  if (!pf) throw new NotFoundError('Pro forma');
  const items = await tx
    .select({
      id: proFormaLineItems.id,
      serviceCatalogItemId: proFormaLineItems.serviceCatalogItemId,
      description: proFormaLineItems.description,
      quantity: proFormaLineItems.quantity,
      unitPrice: proFormaLineItems.unitPrice,
      lineSubtotal: proFormaLineItems.lineSubtotal,
      sortOrder: proFormaLineItems.sortOrder,
    })
    .from(proFormaLineItems)
    .where(eq(proFormaLineItems.proFormaInvoiceId, proFormaInvoiceId))
    .orderBy(proFormaLineItems.sortOrder);
  return { pf, lineItems: items };
}

function assertTransition(
  from: ProFormaInvoiceStatus,
  allowed: ProFormaInvoiceStatus[],
  action: string,
): void {
  if (!allowed.includes(from)) {
    throw new BusinessRuleError(
      'PROFORMA_INVALID_TRANSITION',
      `Cannot ${action} a pro forma in status ${from}`,
    );
  }
}

/* ────────────────────────────────────────────────────────────────── */
/* createProForma — DRAFT                                             */
/* ────────────────────────────────────────────────────────────────── */

export async function createProForma(input: CreateProFormaInput): Promise<ProFormaInvoice> {
  const session = await requirePermission('candidate_services', 'proformas', 'create');
  if (input.lines.length === 0) {
    throw new ValidationError('A pro forma must have at least one line');
  }
  const serviceIds = input.lines.map((l) => l.serviceCatalogItemId);

  return db.transaction(async (tx) => {
    const { lead } = await validateReferences(tx, {
      sourceLeadId: input.sourceLeadId,
      currencyCode: input.currencyCode,
      serviceCatalogItemIds: serviceIds,
    });

    // Resolve or create the proposal group. Caller may pass an existing
    // group (adding a sibling proposal) or omit it (we create one so
    // Stage 2 operators can later add alternatives without touching
    // the schema).
    let proposalGroupId: string;
    if (input.proposalGroupId) {
      const [existing] = await tx
        .select({ id: proposalGroups.id, leadId: proposalGroups.leadId })
        .from(proposalGroups)
        .where(eq(proposalGroups.id, input.proposalGroupId))
        .limit(1);
      if (!existing) throw new NotFoundError('Proposal group');
      if (existing.leadId !== input.sourceLeadId) {
        throw new ValidationError('Proposal group belongs to a different lead');
      }
      proposalGroupId = existing.id;
    } else {
      const [created] = await tx
        .insert(proposalGroups)
        .values({ leadId: input.sourceLeadId, createdByUserId: session.user.id })
        .returning({ id: proposalGroups.id });
      if (!created) throw new Error('proposal_groups insert returned no row');
      proposalGroupId = created.id;
    }

    // Compute totals SERVER-SIDE from raw inputs. We never trust the
    // browser's subtotal.
    const { lines, subtotalCents } = normaliseLines(input.lines);

    const number = await allocateNextNumber(tx, 'PROF', new Date().getUTCFullYear());
    const [row] = await tx
      .insert(proFormaInvoices)
      .values({
        number,
        proposalGroupId,
        sourceLeadId: input.sourceLeadId,
        payerPersonId: lead.personId as string,
        currencyCode: input.currencyCode,
        subtotal: centsToMoney(subtotalCents),
        status: 'DRAFT',
        revision: 1,
        notes: input.notes || null,
        paymentTerms: input.paymentTerms || null,
        createdByUserId: session.user.id,
      })
      .returning();
    if (!row) throw new Error('pro_forma_invoices insert returned no row');

    await writeLineItems(tx, row.id, lines);

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'pro_forma_invoice',
      entityId: row.id,
      action: 'CREATED',
      after: { number, status: 'DRAFT', subtotal: centsToMoney(subtotalCents) },
    });

    return row;
  });
}

/* ────────────────────────────────────────────────────────────────── */
/* editDraft — free mutation while DRAFT                              */
/* ────────────────────────────────────────────────────────────────── */

export async function editDraftProForma(input: EditDraftProFormaInput): Promise<ProFormaInvoice> {
  const session = await requirePermission('candidate_services', 'proformas', 'edit');

  return db.transaction(async (tx) => {
    const [pf] = await tx
      .select()
      .from(proFormaInvoices)
      .where(eq(proFormaInvoices.id, input.proFormaInvoiceId))
      .for('update')
      .limit(1);
    if (!pf) throw new NotFoundError('Pro forma');
    assertTransition(pf.status, ['DRAFT'], 'edit (as draft)');

    const serviceIds = input.lines.map((l) => l.serviceCatalogItemId);
    await validateReferences(tx, {
      sourceLeadId: pf.sourceLeadId,
      currencyCode: input.currencyCode,
      serviceCatalogItemIds: serviceIds,
    });

    const { lines, subtotalCents } = normaliseLines(input.lines);

    // Clear existing lines then rewrite — simpler than per-row diffing
    // and the composer is always sending the full set.
    await tx.delete(proFormaLineItems).where(eq(proFormaLineItems.proFormaInvoiceId, pf.id));
    await writeLineItems(tx, pf.id, lines);

    const [updated] = await tx
      .update(proFormaInvoices)
      .set({
        currencyCode: input.currencyCode,
        subtotal: centsToMoney(subtotalCents),
        notes: input.notes || null,
        paymentTerms: input.paymentTerms || null,
        updatedAt: new Date(),
      })
      .where(eq(proFormaInvoices.id, pf.id))
      .returning();
    if (!updated) throw new Error('pro_forma_invoices update returned no row');

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'pro_forma_invoice',
      entityId: pf.id,
      action: 'DRAFT_EDITED',
      before: { subtotal: pf.subtotal, currencyCode: pf.currencyCode },
      after: { subtotal: centsToMoney(subtotalCents), currencyCode: input.currencyCode },
    });

    return updated;
  });
}

/* ────────────────────────────────────────────────────────────────── */
/* issueProForma — DRAFT → ISSUED                                     */
/* ────────────────────────────────────────────────────────────────── */

export async function issueProForma(input: IssueProFormaInput): Promise<ProFormaInvoice> {
  const session = await requirePermission('candidate_services', 'proformas', 'edit');

  return db.transaction(async (tx) => {
    const [pf] = await tx
      .select()
      .from(proFormaInvoices)
      .where(eq(proFormaInvoices.id, input.proFormaInvoiceId))
      .for('update')
      .limit(1);
    if (!pf) throw new NotFoundError('Pro forma');
    assertTransition(pf.status, ['DRAFT'], 'issue');

    const [updated] = await tx
      .update(proFormaInvoices)
      .set({
        status: 'ISSUED',
        issuedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(proFormaInvoices.id, pf.id), eq(proFormaInvoices.status, 'DRAFT')))
      .returning();
    if (!updated) {
      // Status moved out from under us between the SELECT and UPDATE —
      // rare under FOR UPDATE but can happen if the row was deleted.
      throw new BusinessRuleError('PROFORMA_RACED', 'Pro forma status changed during issue');
    }

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'pro_forma_invoice',
      entityId: pf.id,
      action: 'ISSUED',
      before: { status: 'DRAFT' },
      after: { status: 'ISSUED', revision: pf.revision },
    });

    return updated;
  });
}

/* ────────────────────────────────────────────────────────────────── */
/* reviseIssued — ISSUED → ISSUED (snapshot + bump revision)          */
/* ────────────────────────────────────────────────────────────────── */

export async function reviseIssuedProForma(
  input: ReviseIssuedProFormaInput,
): Promise<ProFormaInvoice> {
  const session = await requirePermission('candidate_services', 'proformas', 'edit');

  return db.transaction(async (tx) => {
    const [pf] = await tx
      .select()
      .from(proFormaInvoices)
      .where(eq(proFormaInvoices.id, input.proFormaInvoiceId))
      .for('update')
      .limit(1);
    if (!pf) throw new NotFoundError('Pro forma');
    assertTransition(pf.status, ['ISSUED'], 'revise');

    // Snapshot the pre-edit state at revision=pf.revision. The next
    // live revision will be pf.revision + 1.
    const { lineItems: prevItems } = await readFullProForma(tx, pf.id);
    await tx.insert(proFormaRevisions).values({
      proFormaInvoiceId: pf.id,
      revision: pf.revision,
      snapshot: {
        number: pf.number,
        currencyCode: pf.currencyCode,
        subtotal: pf.subtotal,
        status: pf.status,
        notes: pf.notes,
        paymentTerms: pf.paymentTerms,
        issuedAt: pf.issuedAt?.toISOString() ?? null,
        lines: prevItems,
      },
      reason: input.reason,
      createdByUserId: session.user.id,
    });

    const serviceIds = input.lines.map((l) => l.serviceCatalogItemId);
    await validateReferences(tx, {
      sourceLeadId: pf.sourceLeadId,
      currencyCode: input.currencyCode,
      serviceCatalogItemIds: serviceIds,
    });

    const { lines, subtotalCents } = normaliseLines(input.lines);

    await tx.delete(proFormaLineItems).where(eq(proFormaLineItems.proFormaInvoiceId, pf.id));
    await writeLineItems(tx, pf.id, lines);

    const nextRevision = pf.revision + 1;
    const [updated] = await tx
      .update(proFormaInvoices)
      .set({
        revision: nextRevision,
        issuedAt: new Date(),
        subtotal: centsToMoney(subtotalCents),
        currencyCode: input.currencyCode,
        notes: input.notes || null,
        paymentTerms: input.paymentTerms || null,
        updatedAt: new Date(),
      })
      .where(and(eq(proFormaInvoices.id, pf.id), eq(proFormaInvoices.status, 'ISSUED')))
      .returning();
    if (!updated) {
      throw new BusinessRuleError('PROFORMA_RACED', 'Pro forma status changed during revise');
    }

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'pro_forma_invoice',
      entityId: pf.id,
      action: 'REVISED',
      before: { revision: pf.revision, subtotal: pf.subtotal },
      after: { revision: nextRevision, subtotal: centsToMoney(subtotalCents) },
      context: { reason: input.reason },
    });

    return updated;
  });
}

/* ────────────────────────────────────────────────────────────────── */
/* recordAcceptance — ISSUED → ACCEPTED (with group lock)             */
/* ────────────────────────────────────────────────────────────────── */

export async function recordAcceptance(input: RecordAcceptanceInput): Promise<ProFormaInvoice> {
  const session = await requirePermission('candidate_services', 'proformas', 'edit');

  return db.transaction(async (tx) => {
    const [pf] = await tx
      .select()
      .from(proFormaInvoices)
      .where(eq(proFormaInvoices.id, input.proFormaInvoiceId))
      .for('update')
      .limit(1);
    if (!pf) throw new NotFoundError('Pro forma');
    assertTransition(pf.status, ['ISSUED'], 'accept');

    // Lock the proposal group row so a concurrent accept on a sibling
    // in the same group has to serialise behind us. The partial unique
    // index on pro_forma_invoices (one ACCEPTED per group) is the DB-
    // level backstop; this lock is the first line of defence and keeps
    // the error surface clean.
    if (pf.proposalGroupId) {
      await tx
        .select({ id: proposalGroups.id })
        .from(proposalGroups)
        .where(eq(proposalGroups.id, pf.proposalGroupId))
        .for('update')
        .limit(1);
    }

    const now = new Date();
    const [accepted] = await tx
      .update(proFormaInvoices)
      .set({
        status: 'ACCEPTED',
        acceptedAt: now,
        acceptedByUserId: session.user.id,
        updatedAt: now,
      })
      .where(and(eq(proFormaInvoices.id, pf.id), eq(proFormaInvoices.status, 'ISSUED')))
      .returning();
    if (!accepted) {
      // Lost the race against another concurrent accept, or the state
      // changed. The partial unique index would have been the final
      // backstop anyway.
      throw new BusinessRuleError(
        'PROFORMA_RACED',
        'Pro forma could not be accepted (state changed concurrently)',
      );
    }

    // Mark competing siblings as SUPERSEDED. ACCEPTED or terminal
    // sibling statuses are left alone — SUPERSEDED only applies to
    // live offers (DRAFT / ISSUED) that are losing the competition.
    let supersededCount = 0;
    if (pf.proposalGroupId) {
      const supersededRows = await tx
        .update(proFormaInvoices)
        .set({ status: 'SUPERSEDED', updatedAt: now })
        .where(
          and(
            eq(proFormaInvoices.proposalGroupId, pf.proposalGroupId),
            sql`${proFormaInvoices.id} <> ${pf.id}`,
            sql`${proFormaInvoices.status} IN ('DRAFT','ISSUED')`,
          ),
        )
        .returning({ id: proFormaInvoices.id });
      supersededCount = supersededRows.length;

      // Stamp decidedAt on the group so UI/reports can tell when the
      // competition was resolved.
      await tx
        .update(proposalGroups)
        .set({ decidedAt: now, updatedAt: now })
        .where(eq(proposalGroups.id, pf.proposalGroupId));

      for (const row of supersededRows) {
        await recordAudit(tx, {
          actorUserId: session.user.id,
          entityType: 'pro_forma_invoice',
          entityId: row.id,
          action: 'SUPERSEDED',
          context: {
            acceptedProFormaId: pf.id,
            proposalGroupId: pf.proposalGroupId,
          },
        });
      }
    }

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'pro_forma_invoice',
      entityId: pf.id,
      action: 'ACCEPTED',
      before: { status: 'ISSUED' },
      after: { status: 'ACCEPTED' },
      context: { reason: input.reason, supersededCount },
    });

    return accepted;
  });
}

/* ────────────────────────────────────────────────────────────────── */
/* rejectProForma — DRAFT/ISSUED → REJECTED                            */
/* ────────────────────────────────────────────────────────────────── */

export async function rejectProForma(input: RejectProFormaInput): Promise<ProFormaInvoice> {
  const session = await requirePermission('candidate_services', 'proformas', 'edit');

  return db.transaction(async (tx) => {
    const [pf] = await tx
      .select()
      .from(proFormaInvoices)
      .where(eq(proFormaInvoices.id, input.proFormaInvoiceId))
      .for('update')
      .limit(1);
    if (!pf) throw new NotFoundError('Pro forma');
    assertTransition(pf.status, ['DRAFT', 'ISSUED'], 'reject');

    const now = new Date();
    const [updated] = await tx
      .update(proFormaInvoices)
      .set({
        status: 'REJECTED',
        rejectedAt: now,
        rejectedByUserId: session.user.id,
        rejectedReason: input.reason,
        updatedAt: now,
      })
      .where(
        and(eq(proFormaInvoices.id, pf.id), sql`${proFormaInvoices.status} IN ('DRAFT','ISSUED')`),
      )
      .returning();
    if (!updated) {
      throw new BusinessRuleError('PROFORMA_RACED', 'Pro forma status changed during reject');
    }

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'pro_forma_invoice',
      entityId: pf.id,
      action: 'REJECTED',
      before: { status: pf.status },
      after: { status: 'REJECTED' },
      context: { reason: input.reason },
    });

    return updated;
  });
}

/* ────────────────────────────────────────────────────────────────── */
/* cancelProForma — DRAFT/ISSUED → CANCELLED                            */
/* ────────────────────────────────────────────────────────────────── */

export async function cancelProForma(input: CancelProFormaInput): Promise<ProFormaInvoice> {
  const session = await requirePermission('candidate_services', 'proformas', 'edit');

  return db.transaction(async (tx) => {
    const [pf] = await tx
      .select()
      .from(proFormaInvoices)
      .where(eq(proFormaInvoices.id, input.proFormaInvoiceId))
      .for('update')
      .limit(1);
    if (!pf) throw new NotFoundError('Pro forma');
    assertTransition(pf.status, ['DRAFT', 'ISSUED'], 'cancel');

    const now = new Date();
    const [updated] = await tx
      .update(proFormaInvoices)
      .set({
        status: 'CANCELLED',
        cancelledAt: now,
        cancelledByUserId: session.user.id,
        updatedAt: now,
      })
      .where(
        and(eq(proFormaInvoices.id, pf.id), sql`${proFormaInvoices.status} IN ('DRAFT','ISSUED')`),
      )
      .returning();
    if (!updated) {
      throw new BusinessRuleError('PROFORMA_RACED', 'Pro forma status changed during cancel');
    }

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'pro_forma_invoice',
      entityId: pf.id,
      action: 'CANCELLED',
      before: { status: pf.status },
      after: { status: 'CANCELLED' },
      context: { reason: input.reason },
    });

    return updated;
  });
}

/* ────────────────────────────────────────────────────────────────── */
/* Read helpers                                                       */
/* ────────────────────────────────────────────────────────────────── */

export type ProFormaView = {
  id: string;
  number: string;
  status: ProFormaInvoiceStatus;
  revision: number;
  currencyCode: string;
  subtotal: string;
  notes: string | null;
  paymentTerms: string | null;
  sourceLeadId: string;
  proposalGroupId: string | null;
  payerPerson: {
    id: string;
    firstName: string;
    middleName: string | null;
    lastName: string;
    email: string | null;
    phone: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    currentCity: string | null;
    currentCountry: string | null;
  };
  lineItems: Array<{
    id: string;
    serviceCatalogItemId: string;
    serviceName: string;
    description: string;
    quantity: string;
    unitPrice: string;
    lineSubtotal: string;
    sortOrder: number;
  }>;
  issuedAt: Date | null;
  acceptedAt: Date | null;
  acceptedByUserId: string | null;
  rejectedAt: Date | null;
  rejectedByUserId: string | null;
  rejectedReason: string | null;
  cancelledAt: Date | null;
  cancelledByUserId: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

async function expandProForma(tx: DbExecutor, pf: ProFormaInvoice): Promise<ProFormaView> {
  const [payer] = await tx
    .select({
      id: persons.id,
      firstName: persons.firstName,
      middleName: persons.middleName,
      lastName: persons.lastName,
      email: persons.email,
      phone: persons.phone,
      addressLine1: persons.addressLine1,
      addressLine2: persons.addressLine2,
      currentCity: persons.currentCity,
      currentCountry: persons.currentCountry,
    })
    .from(persons)
    .where(eq(persons.id, pf.payerPersonId))
    .limit(1);
  if (!payer) throw new NotFoundError('Payer person');

  const items = await tx
    .select({
      id: proFormaLineItems.id,
      serviceCatalogItemId: proFormaLineItems.serviceCatalogItemId,
      serviceName: serviceCatalogItems.name,
      description: proFormaLineItems.description,
      quantity: proFormaLineItems.quantity,
      unitPrice: proFormaLineItems.unitPrice,
      lineSubtotal: proFormaLineItems.lineSubtotal,
      sortOrder: proFormaLineItems.sortOrder,
    })
    .from(proFormaLineItems)
    .leftJoin(
      serviceCatalogItems,
      eq(serviceCatalogItems.id, proFormaLineItems.serviceCatalogItemId),
    )
    .where(eq(proFormaLineItems.proFormaInvoiceId, pf.id))
    .orderBy(proFormaLineItems.sortOrder);

  return {
    id: pf.id,
    number: pf.number,
    status: pf.status,
    revision: pf.revision,
    currencyCode: pf.currencyCode,
    subtotal: pf.subtotal,
    notes: pf.notes,
    paymentTerms: pf.paymentTerms,
    sourceLeadId: pf.sourceLeadId,
    proposalGroupId: pf.proposalGroupId,
    payerPerson: payer,
    lineItems: items.map((i) => ({
      id: i.id,
      serviceCatalogItemId: i.serviceCatalogItemId,
      serviceName: i.serviceName ?? 'Unknown service',
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineSubtotal: i.lineSubtotal,
      sortOrder: i.sortOrder,
    })),
    issuedAt: pf.issuedAt,
    acceptedAt: pf.acceptedAt,
    acceptedByUserId: pf.acceptedByUserId,
    rejectedAt: pf.rejectedAt,
    rejectedByUserId: pf.rejectedByUserId,
    rejectedReason: pf.rejectedReason,
    cancelledAt: pf.cancelledAt,
    cancelledByUserId: pf.cancelledByUserId,
    createdByUserId: pf.createdByUserId,
    createdAt: pf.createdAt,
    updatedAt: pf.updatedAt,
  };
}

export async function fetchProForma(proFormaInvoiceId: string): Promise<ProFormaView> {
  await requirePermission('candidate_services', 'proformas', 'view');
  const [pf] = await db
    .select()
    .from(proFormaInvoices)
    .where(eq(proFormaInvoices.id, proFormaInvoiceId))
    .limit(1);
  if (!pf) throw new NotFoundError('Pro forma');
  return expandProForma(db, pf);
}

export async function fetchProFormasForLead(leadId: string): Promise<ProFormaView[]> {
  await requirePermission('candidate_services', 'proformas', 'view');
  const rows = await db
    .select()
    .from(proFormaInvoices)
    .where(eq(proFormaInvoices.sourceLeadId, leadId))
    .orderBy(proFormaInvoices.createdAt);
  const views: ProFormaView[] = [];
  for (const r of rows) {
    views.push(await expandProForma(db, r));
  }
  return views;
}

export async function fetchRevisions(proFormaInvoiceId: string): Promise<
  Array<{
    id: string;
    revision: number;
    reason: string | null;
    createdByUserId: string | null;
    createdAt: Date;
    snapshot: Record<string, unknown>;
  }>
> {
  await requirePermission('candidate_services', 'proformas', 'view');
  return db
    .select({
      id: proFormaRevisions.id,
      revision: proFormaRevisions.revision,
      reason: proFormaRevisions.reason,
      createdByUserId: proFormaRevisions.createdByUserId,
      createdAt: proFormaRevisions.createdAt,
      snapshot: proFormaRevisions.snapshot,
    })
    .from(proFormaRevisions)
    .where(eq(proFormaRevisions.proFormaInvoiceId, proFormaInvoiceId))
    .orderBy(proFormaRevisions.revision);
}
