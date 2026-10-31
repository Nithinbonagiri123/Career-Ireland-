import { and, desc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import { type DbExecutor, recordAudit } from '@/lib/audit/withAudit';
import { hasFinanceAuthority } from '@/lib/auth/finance-policy-rules';
import { requireRecruitment } from '@/lib/auth/recruitment-guards';
import { requireInternalStaff } from '@/lib/auth/session';
import type { DateRange } from '@/lib/date-range';
import { todayInDublin } from '@/lib/dates';
import { db } from '@/lib/db/client';
import { invoices } from '@/lib/db/schema/billing';
import { immigrationCases } from '@/lib/db/schema/immigration';
import { type Lead, leads } from '@/lib/db/schema/leads';
import { candidateProfiles, persons } from '@/lib/db/schema/persons';
import { employers, jobRequisitions } from '@/lib/db/schema/recruitment';
import { serviceCatalogItems } from '@/lib/db/schema/services';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import type { AssignmentScope } from '@/lib/scope';
import { assertTransition, LEAD_TRANSITIONS } from '@/lib/state-machine';
import { lockEmployerForBilling } from '@/modules/billing/employer-lock';
import { insertInvoice } from '@/modules/billing/service';
import { getEngagement, insertEngagement, insertPayment } from '@/modules/commerce/repository';
import { performPaymentVerification } from '@/modules/commerce/service';
import { insertPerson } from '@/modules/persons/repository';
import { fetchAppSettings } from '@/modules/settings/service';
import {
  closedLeadMessage,
  type InvoiceLinkFacts,
  invoiceLinkRefusal,
  isAmbiguousForNewCharge,
  resolveReceivedDate,
} from './conversion-rules';
import { getLead, insertLead, type LeadListRow, listLeads, updateLead } from './repository';
import {
  type AcceptLeadInput,
  AcceptLeadSchema,
  type ArchiveLeadInput,
  ArchiveLeadSchema,
  type CreateLeadInput,
  CreateLeadSchema,
  type UnarchiveLeadInput,
  UnarchiveLeadSchema,
  type UpdateLeadStatusInput,
  UpdateLeadStatusSchema,
} from './schemas';

function blankToNull(v: string | undefined | null): string | null {
  return v && v.trim().length > 0 ? v : null;
}

export async function fetchLeads(
  scope?: AssignmentScope,
  createdRange?: DateRange,
  targetBusiness?: Lead['targetBusiness'],
): Promise<LeadListRow[]> {
  const session = await requireInternalStaff();
  return listLeads({
    scope: scope ?? 'all',
    currentUserId: session.user.id,
    createdRange,
    targetBusiness,
  });
}

export async function fetchLead(id: string): Promise<Lead | null> {
  await requireInternalStaff();
  return getLead(id);
}

export async function createLead(input: CreateLeadInput): Promise<Lead> {
  const session = await requireInternalStaff();
  const parsed = CreateLeadSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid lead data',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const data = parsed.data;
  // R6 — Recruitment leads need recruitment.leads; other businesses keep the existing rule.
  if (data.targetBusiness === 'RECRUITMENT') await requireRecruitment('leads', 'create');

  return db.transaction(async (tx) => {
    let personId: string | null = null;
    let employerId: string | null = null;

    if (data.mode === 'NEW_PERSON') {
      const p = data.person;
      const created = await insertPerson(tx, {
        firstName: p.firstName.trim(),
        middleName: blankToNull(p.middleName),
        lastName: p.lastName.trim(),
        email: blankToNull(p.email),
        phone: blankToNull(p.phone),
        dateOfBirth: blankToNull(p.dateOfBirth),
        nationality: blankToNull(p.nationality),
        currentCountry: blankToNull(p.currentCountry),
        currentCity: blankToNull(p.currentCity),
        addressLine1: blankToNull(p.addressLine1),
        addressLine2: blankToNull(p.addressLine2),
        postcode: blankToNull(p.postcode),
        primaryOccupationId: blankToNull(p.primaryOccupationId),
        // Stage 6G Screen 02 — Professional information section fields.
        yearsOfExperience: blankToNull(p.yearsOfExperience),
        employmentStatus: p.employmentStatus ? p.employmentStatus : null,
        professionalSummary: blankToNull(p.professionalSummary),
        // Stage 6G Screen 02 — Immigration & eligibility section fields.
        workEligibility: p.workEligibility ? p.workEligibility : null,
        currentlyInIreland: typeof p.currentlyInIreland === 'boolean' ? p.currentlyInIreland : null,
        source: p.source,
        // Stage 6E+1 — persist structured Irish immigration status
        // directly to the dedicated column. Empty string / null / undefined
        // all map to NULL so the field stays optional for every business
        // line.
        irishImmigrationStatus: p.irishImmigrationStatus ? p.irishImmigrationStatus : null,
        notes: blankToNull(p.notes),
      });
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'person',
        entityId: created.id,
        action: 'CREATED',
        after: { firstName: created.firstName, lastName: created.lastName, email: created.email },
        context: { via: 'lead_creation' },
      });
      personId = created.id;
    } else if (data.mode === 'EXISTING_PERSON') {
      personId = data.personId;
    } else if (data.mode === 'NEW_EMPLOYER') {
      const e = data.employer;
      // Session 33 — auto-assign the new employer to the creator (same
      // rule as the direct /employers → New employer flow). See memory
      // `record-ownership-rules`.
      const [created] = await tx
        .insert(employers)
        .values({
          legalName: e.legalName.trim(),
          tradingName: blankToNull(e.tradingName),
          website: blankToNull(e.website),
          industry: blankToNull(e.industry),
          country: blankToNull(e.country),
          city: blankToNull(e.city),
          relationshipStatus: e.relationshipStatus,
          assignedUserId: session.user.id,
          notes: blankToNull(e.notes),
        })
        .returning();
      if (!created) throw new Error('employer insert returned no row');
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'employer',
        entityId: created.id,
        action: 'CREATED',
        after: { legalName: created.legalName },
        context: { via: 'lead_creation' },
      });
      employerId = created.id;
    } else {
      // EXISTING_EMPLOYER
      employerId = data.employerId;
    }

    const lead = await insertLead(tx, {
      targetBusiness: data.targetBusiness,
      personId,
      employerId,
      status: 'NEW',
      serviceOfInterestId: data.serviceOfInterestId,
      // Session 33 — auto-assign leads to the creator. Owner-only
      // reassign afterwards.
      assignedUserId: session.user.id,
      notes: blankToNull(data.notes),
    });

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'lead',
      entityId: lead.id,
      action: 'CREATED',
      after: { targetBusiness: lead.targetBusiness, personId, employerId, status: lead.status },
    });

    return lead;
  });
}

export async function updateLeadStatus(input: UpdateLeadStatusInput): Promise<Lead> {
  const session = await requireInternalStaff();
  const parsed = UpdateLeadStatusSchema.parse(input);
  return db.transaction(async (tx) => {
    const before = await getLead(parsed.leadId);
    if (!before) throw new BusinessRuleError('LEAD_NOT_FOUND', 'Lead not found');
    if (before.targetBusiness === 'RECRUITMENT') await requireRecruitment('leads', 'edit');
    if (before.status === 'CONVERTED') {
      throw new BusinessRuleError(
        'LEAD_ALREADY_CONVERTED',
        'A converted lead cannot change status',
      );
    }
    if (before.status === parsed.status) return before;
    assertTransition('lead', before.status, parsed.status, LEAD_TRANSITIONS);
    const after = await updateLead(tx, parsed.leadId, {
      status: parsed.status,
      notes: parsed.notes ? parsed.notes : before.notes,
    });
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'lead',
      entityId: after.id,
      action: 'STATUS_CHANGED',
      before: { status: before.status },
      after: { status: after.status },
      context: parsed.notes ? { note: parsed.notes } : undefined,
    });
    return after;
  });
}

/** Soft-archive a lead. List queries filter archived rows out; the record itself is untouched. */
export async function archiveLead(input: ArchiveLeadInput): Promise<Lead> {
  const session = await requireInternalStaff();
  const parsed = ArchiveLeadSchema.parse(input);
  return db.transaction(async (tx) => {
    const before = await getLead(parsed.leadId);
    if (!before) throw new BusinessRuleError('LEAD_NOT_FOUND', 'Lead not found');
    if (before.targetBusiness === 'RECRUITMENT') await requireRecruitment('leads', 'edit');
    if (before.archivedAt) {
      throw new BusinessRuleError('ALREADY_ARCHIVED', 'Lead is already archived');
    }
    const [after] = await tx
      .update(leads)
      .set({ archivedAt: new Date(), updatedAt: sql`NOW()` })
      .where(eq(leads.id, parsed.leadId))
      .returning();
    if (!after) throw new Error('archive returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'lead',
      entityId: after.id,
      action: 'ARCHIVED',
      before: { archivedAt: null },
      after: { archivedAt: after.archivedAt },
      context: { reason: parsed.reason },
    });
    return after;
  });
}

/** Restore a previously archived lead back to the active list. */
export async function unarchiveLead(input: UnarchiveLeadInput): Promise<Lead> {
  const session = await requireInternalStaff();
  const parsed = UnarchiveLeadSchema.parse(input);
  return db.transaction(async (tx) => {
    const before = await getLead(parsed.leadId);
    if (!before) throw new BusinessRuleError('LEAD_NOT_FOUND', 'Lead not found');
    if (before.targetBusiness === 'RECRUITMENT') await requireRecruitment('leads', 'edit');
    if (!before.archivedAt) {
      throw new BusinessRuleError('NOT_ARCHIVED', 'Lead is not archived');
    }
    const [after] = await tx
      .update(leads)
      .set({ archivedAt: null, updatedAt: sql`NOW()` })
      .where(eq(leads.id, parsed.leadId))
      .returning();
    if (!after) throw new Error('unarchive returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'lead',
      entityId: after.id,
      action: 'UNARCHIVED',
      before: { archivedAt: before.archivedAt },
      after: { archivedAt: null },
      context: { reason: parsed.reason },
    });
    return after;
  });
}

/* ─── Recruitment P0 — invoice facts for safe conversion ─────────────── */

function centsOf(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return Math.round(Number.parseFloat(String(v)) * 100);
}

/**
 * Everything `invoiceLinkRefusal` / `isAmbiguousForNewCharge` need, for
 * the invoices matching `where`. Payments are attributed to an invoice
 * through its engagement (one live invoice per engagement is a DB
 * guarantee — invoices_engagement_live_uq).
 */
async function loadInvoiceLinkFacts(tx: DbExecutor, where: SQL): Promise<InvoiceLinkFacts[]> {
  const rows = await tx.execute<{
    id: string;
    number: string;
    payer_employer_id: string | null;
    status: InvoiceLinkFacts['status'];
    settlement_kind: InvoiceLinkFacts['settlementKind'];
    source_lead_id: string | null;
    job_requisition_id: string | null;
    placement_id: string | null;
    immigration_case_id: string | null;
    issued_at: Date | string;
    total_amount: string;
    verified_paid: string;
    unverified_count: number;
    refunded_count: number;
    credit_note_count: number;
  }>(sql`
    SELECT i.id, i.number, i.payer_employer_id, i.status, i.settlement_kind,
           i.source_lead_id, i.job_requisition_id, i.placement_id, i.immigration_case_id,
           i.issued_at, i.total_amount::text AS total_amount,
           COALESCE((SELECT SUM(p.amount) FROM payments p
                     WHERE p.service_engagement_id = i.service_engagement_id
                       AND p.status = 'VERIFIED'), 0)::text AS verified_paid,
           (SELECT COUNT(*) FROM payments p
             WHERE p.service_engagement_id = i.service_engagement_id
               AND p.status IN ('PENDING', 'PROOF_UPLOADED'))::int AS unverified_count,
           (SELECT COUNT(*) FROM payments p
             WHERE p.service_engagement_id = i.service_engagement_id
               AND p.status IN ('PARTIALLY_REFUNDED', 'REFUNDED'))::int AS refunded_count,
           (SELECT COUNT(*) FROM credit_notes c WHERE c.invoice_id = i.id)::int AS credit_note_count
    FROM invoices i
    WHERE ${where}
    ORDER BY i.issued_at DESC
  `);
  return (rows as unknown as Array<(typeof rows)[number]>).map((r) => ({
    id: r.id,
    number: r.number,
    payerEmployerId: r.payer_employer_id,
    status: r.status,
    settlementKind: r.settlement_kind,
    sourceLeadId: r.source_lead_id,
    jobRequisitionId: r.job_requisition_id,
    placementId: r.placement_id,
    immigrationCaseId: r.immigration_case_id,
    issuedAt: new Date(r.issued_at),
    totalCents: centsOf(r.total_amount),
    verifiedPaidCents: centsOf(r.verified_paid),
    unverifiedPaymentCount: Number(r.unverified_count),
    refundedPaymentCount: Number(r.refunded_count),
    creditNoteCount: Number(r.credit_note_count),
  }));
}

/** The employer's live invoices that could be the same money as a payment
 *  recorded at conversion (see `isAmbiguousForNewCharge`). */
async function findAmbiguousEmployerInvoices(
  tx: DbExecutor,
  lead: { id: string; employerId: string | null; createdAt: Date },
): Promise<InvoiceLinkFacts[]> {
  if (!lead.employerId) return [];
  const facts = await loadInvoiceLinkFacts(
    tx,
    sql`i.payer_employer_id = ${lead.employerId} AND i.status IN ('ISSUED', 'PARTIALLY_PAID', 'PAID')`,
  );
  return facts.filter((f) => isAmbiguousForNewCharge(f, lead));
}

export type LeadConversionInvoiceOption = {
  id: string;
  number: string;
  issuedAt: Date;
  totalAmount: string;
  currencyCode: string;
  status: InvoiceLinkFacts['status'];
  /** True when this invoice can be used to convert the lead right now. */
  usable: boolean;
  /** Why not, when `usable` is false. */
  blockedReason: string | null;
};

export type LeadConversionOptions = {
  leadId: string;
  targetBusiness: Lead['targetBusiness'];
  /** Employer invoices relevant to this conversion: every invoice that
   *  could be the same money, plus anything already raised on the lead. */
  invoices: LeadConversionInvoiceOption[];
  /** Invoice numbers that block the "record a new payment" path. */
  blockingInvoiceNumbers: string[];
  /** Finance authority may confirm a separate charge (audited). */
  canConfirmSeparateCharge: boolean;
};

/**
 * Recruitment P0 — what the convert dialog needs to offer "use an existing
 * invoice" and to warn before a second charge. Same gate as converting.
 */
export async function fetchLeadConversionOptions(leadId: string): Promise<LeadConversionOptions> {
  const session = await requireInternalStaff();
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) throw new ValidationError('Invalid lead id');
  const lead = await getLead(leadId);
  if (!lead) throw new BusinessRuleError('LEAD_NOT_FOUND', 'Lead not found');
  const base = {
    leadId: lead.id,
    targetBusiness: lead.targetBusiness,
    canConfirmSeparateCharge: hasFinanceAuthority(session.user, 'VERIFY'),
  };
  if (lead.targetBusiness !== 'RECRUITMENT' || !lead.employerId) {
    return { ...base, invoices: [], blockingInvoiceNumbers: [] };
  }
  await requireRecruitment('leads', 'edit');
  const facts = await loadInvoiceLinkFacts(
    db,
    sql`i.payer_employer_id = ${lead.employerId}
        AND i.status IN ('ISSUED', 'PARTIALLY_PAID', 'PAID')
        AND i.settlement_kind = 'STANDARD'`,
  );
  const relevant = facts.filter(
    (f) => f.sourceLeadId === lead.id || isAmbiguousForNewCharge(f, lead),
  );
  const ids = relevant.map((f) => f.id);
  const money =
    ids.length > 0
      ? await db
          .select({
            id: invoices.id,
            totalAmount: invoices.totalAmount,
            currencyCode: invoices.currencyCode,
          })
          .from(invoices)
          .where(inArray(invoices.id, ids))
      : [];
  const byId = new Map(money.map((m) => [m.id, m]));
  return {
    ...base,
    invoices: relevant.map((f) => {
      const refusal = invoiceLinkRefusal(f, lead);
      const m = byId.get(f.id);
      return {
        id: f.id,
        number: f.number,
        issuedAt: f.issuedAt,
        totalAmount: m?.totalAmount ?? (f.totalCents / 100).toFixed(2),
        currencyCode: m?.currencyCode ?? 'EUR',
        status: f.status,
        usable: refusal === null,
        blockedReason: refusal?.message ?? null,
      };
    }),
    blockingInvoiceNumbers: relevant
      .filter((f) => isAmbiguousForNewCharge(f, lead))
      .map((f) => f.number),
  };
}

/**
 * Universal 'Accept lead' — materialises the lead into its target business.
 *
 * Per target:
 *   - CANDIDATE_SERVICES: activates the person's candidate_profile (same
 *     outcome — profile deduped when one already exists for the person).
 *   - IMMIGRATION: creates an immigration_cases row (default caseType =
 *     EMPLOYMENT_PERMIT, operator picks the correct one on the case).
 *   - RECRUITMENT: creates a job_requisitions row in DRAFT (recruiter
 *     fills title/positions/occupation next).
 *
 * After creating the target entity every invoice raised on the source
 * lead is back-linked (immigration_case_id / job_requisition_id) so they
 * show up in the target's billing view without a re-generation step.
 *
 * Recruitment P0 — double-charge safety:
 *   - `existingInvoiceId` converts using an employer invoice that is fully
 *     paid with finance-verified money: the invoice is locked, checked and
 *     linked to the lead + new requisition. No engagement, invoice or
 *     payment is created.
 *   - Recording a new payment for a Recruitment lead is refused while the
 *     employer has an invoice that could be the same money, unless a
 *     finance-authority user confirms a separate charge with a reason.
 *   - LOST / REJECTED / EXPIRED / CONVERTED leads are refused.
 *   - The conversion basis is stamped on the lead (convertedAt,
 *     convertedByUserId, conversionMethod, conversionReason).
 *
 * Idempotent: the lead row is locked FOR UPDATE and a second call refuses
 * when acceptedAt is set, so a double-click can't duplicate anything.
 */
export async function acceptLead(input: AcceptLeadInput): Promise<{
  lead: Lead;
  targetBusiness: Lead['targetBusiness'];
  entityId: string;
  invoicesLinked: number;
}> {
  const session = await requireInternalStaff();
  const parsedResult = AcceptLeadSchema.safeParse(input);
  if (!parsedResult.success) {
    throw new ValidationError(
      'Invalid conversion request',
      parsedResult.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const parsed = parsedResult.data;
  const actorHasFinance = hasFinanceAuthority(session.user, 'VERIFY');

  return db.transaction(async (tx) => {
    // Row lock: two concurrent acceptances of the same lead serialize here,
    // so the second sees acceptedAt and refuses (no duplicate entity,
    // engagement or invoice).
    const [lead] = await tx
      .select()
      .from(leads)
      .where(eq(leads.id, parsed.leadId))
      .for('update')
      .limit(1);
    if (!lead) throw new BusinessRuleError('LEAD_NOT_FOUND', 'Lead not found');
    if (lead.targetBusiness === 'RECRUITMENT') await requireRecruitment('leads', 'edit');
    if (lead.acceptedAt || lead.status === 'CONVERTED') {
      throw new BusinessRuleError(
        'LEAD_ALREADY_ACCEPTED',
        'This lead has already been accepted — see the linked case/requisition/profile',
      );
    }
    const closedMessage = closedLeadMessage(lead.status);
    if (closedMessage) throw new BusinessRuleError('LEAD_CLOSED', closedMessage);

    // Stage 6D Wave 1e — defence-in-depth. For Candidate Services the
    // one-step convert path is an exceptional finance operation (it
    // writes an engagement + invoice + payment + verified receipt +
    // candidate_profile atomically). Only ADMIN / FINANCE may invoke it
    // for a CS lead. Immigration + Recruitment keep the broader
    // internal-staff gate because their convert flow is their ONLY path
    // today (no Client Workspace quote-first alternative). STAFF POSTing
    // directly from outside the UI hits this check — removing the row
    // menu item was a UX safeguard; this is the authorization safeguard.
    if (
      lead.targetBusiness === 'CANDIDATE_SERVICES' &&
      session.user.role !== 'ADMIN' &&
      session.user.role !== 'FINANCE' &&
      !session.user.isOwner
    ) {
      const { AuthorizationError } = await import('@/lib/errors');
      throw new AuthorizationError(
        'Record payment outside a quote on a Candidate Services lead is restricted to Finance.',
      );
    }

    if (parsed.existingInvoiceId) {
      return convertWithExistingInvoice(tx, {
        lead,
        invoiceId: parsed.existingInvoiceId,
        reason: (parsed.reason ?? '').trim(),
        actorUserId: session.user.id,
      });
    }

    // ── NEW_PAYMENT path (payment-first conversion) ──────────────────────
    const serviceCatalogItemId = parsed.serviceCatalogItemId as string;
    const amount = parsed.amount as string;
    const currencyCode = parsed.currencyCode as string;
    const method = parsed.method as 'BANK_TRANSFER' | 'CASH' | 'OTHER';

    // Received date is a Europe/Dublin business date: blank → today,
    // future → refused.
    const received = resolveReceivedDate(parsed.receivedAt, todayInDublin());
    if (!received.ok) {
      throw new ValidationError(received.message, { receivedAt: received.message });
    }

    // Recruitment P0 — double-charge guard. If the employer already has an
    // invoice that could be this same money, refuse and point the operator
    // at "use existing invoice". Only finance may confirm that this is a
    // genuinely separate charge, with a reason, and it is audited.
    let separateChargeOverride: { invoiceNumbers: string[]; reason: string } | null = null;
    if (lead.targetBusiness === 'RECRUITMENT') {
      // Serialise with Generate invoice on the employer page: whichever
      // runs second sees the other's invoice before deciding.
      if (lead.employerId) await lockEmployerForBilling(tx, lead.employerId);
      const ambiguous = await findAmbiguousEmployerInvoices(tx, lead);
      if (ambiguous.length > 0) {
        const numbers = ambiguous.map((a) => a.number);
        const list = numbers.join(', ');
        if (!parsed.confirmSeparateCharge) {
          throw new BusinessRuleError(
            'LEAD_EMPLOYER_HAS_INVOICE',
            `This employer already has invoice ${list}. Use "existing invoice" to convert with it instead of recording a new payment, so the employer is not charged twice.`,
          );
        }
        if (!actorHasFinance) {
          throw new BusinessRuleError(
            'LEAD_EMPLOYER_HAS_INVOICE',
            `This employer already has invoice ${list}. Only Finance, Admin or the owner can confirm a separate charge — use "existing invoice" or ask Finance.`,
          );
        }
        const overrideReason = (parsed.separateChargeReason ?? '').trim();
        if (overrideReason.length < 3) {
          throw new ValidationError(
            'Say why this is a separate charge (min 3 characters). It is written to the audit log.',
            { separateChargeReason: 'Required to confirm a separate charge' },
          );
        }
        separateChargeOverride = { invoiceNumbers: numbers, reason: overrideReason };
      }
    }

    // Stage 4 — detect ordinary (pro-forma-origin) vs manual-override
    // conversion. Ordinary: a CONVERTED pro forma already issued an
    // invoice for this lead, so the money record exists. Manual:
    // operator is accepting without a pro forma, so the audit log
    // needs a reason to explain why.
    const [hasPfInvoice] = await tx.execute<{ exists: boolean }>(sql`
      SELECT EXISTS(
        SELECT 1 FROM invoices i
        INNER JOIN pro_forma_official_invoices pfi ON pfi.invoice_id = i.id
        WHERE i.source_lead_id = ${lead.id}
      ) AS exists
    `);
    const isOrdinaryPfConversion = Boolean(hasPfInvoice?.exists);
    const reason = (parsed.reason ?? '').trim();
    if (!isOrdinaryPfConversion && reason.length < 3) {
      throw new ValidationError(
        'Reason required for manual conversion (min 3 characters). For ordinary pro-forma conversions no reason is needed because the invoice itself is the audit record.',
        { reason: 'Please note why this lead is being accepted outside the pro-forma flow.' },
      );
    }

    if (separateChargeOverride) {
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'lead',
        entityId: lead.id,
        action: 'SEPARATE_CHARGE_CONFIRMED',
        context: {
          via: 'lead_accept',
          existingInvoices: separateChargeOverride.invoiceNumbers,
          reason: separateChargeOverride.reason,
          note: 'Finance confirmed a new payment at conversion is separate from the existing employer invoice(s).',
        },
      });
    }

    const { entityId, invoiceUpdate } = await createTargetEntity(tx, {
      lead,
      actorUserId: session.user.id,
      reason: parsed.reason,
    });
    const invoicesLinked = await backLinkLeadInvoices(tx, lead.id, invoiceUpdate);

    // Payment-first: now that the operational entity exists, atomically
    // create an engagement + payment and auto-verify. Payer is the
    // employer for Recruitment leads and the person otherwise. If any
    // step throws (overpayment guard, missing service, DB error), the
    // whole transaction rolls back — no entity half-created, no lead
    // half-converted.
    const [service] = await tx
      .select({
        id: serviceCatalogItems.id,
        name: serviceCatalogItems.name,
        isActive: serviceCatalogItems.isActive,
        payerType: serviceCatalogItems.payerType,
        defaultPrice: serviceCatalogItems.defaultPrice,
        defaultCurrencyCode: serviceCatalogItems.defaultCurrencyCode,
      })
      .from(serviceCatalogItems)
      .where(eq(serviceCatalogItems.id, serviceCatalogItemId))
      .limit(1);
    if (!service) {
      throw new BusinessRuleError('SERVICE_NOT_FOUND', 'Selected service no longer exists');
    }

    // Decision K1 — lead conversion is the one place non-finance staff may
    // cause an invoice to be issued (Immigration / Recruitment conversion
    // workflow). It is a narrow, server-enforced exception: the invoice must
    // match an active catalog service, the right payer, the catalog's
    // authorized price and currency, and never duplicate an existing one.
    const conversion = validateLeadConversionCharge({
      targetBusiness: lead.targetBusiness,
      personId: lead.personId,
      employerId: lead.employerId,
      service,
      amount,
      currencyCode,
      actorHasFinance,
    });

    // If the operator already generated an invoice on this lead (via the
    // "+ Invoice" button on the leads table), that invoice already came
    // with its own engagement — created by generateInvoiceForPayer. We
    // must reuse that engagement + invoice; creating a second pair
    // leaves the first invoice orphaned, which is the bug that showed
    // up as 'INV-000004 ISSUED (unpaid) + INV-000005 PAID' both for the
    // same conversion.
    const [existingLeadInvoice] = await tx
      .select({
        id: invoices.id,
        serviceEngagementId: invoices.serviceEngagementId,
        currencyCode: invoices.currencyCode,
        totalAmount: invoices.totalAmount,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.sourceLeadId, lead.id),
          inArray(invoices.status, ['ISSUED', 'PARTIALLY_PAID']),
        ),
      )
      .orderBy(desc(invoices.issuedAt))
      .limit(1)
      .for('update');

    let engagementId: string;
    if (existingLeadInvoice) {
      // Reuse: fetch the engagement the invoice already points at.
      const existingEng = await getEngagement(existingLeadInvoice.serviceEngagementId, tx);
      if (!existingEng) {
        throw new Error('invoice references an engagement that no longer exists');
      }
      engagementId = existingEng.id;
      if (existingLeadInvoice.currencyCode !== currencyCode) {
        throw new BusinessRuleError(
          'LEAD_INVOICE_CURRENCY_MISMATCH',
          `This lead already has invoice in ${existingLeadInvoice.currencyCode}; record the payment in that currency.`,
        );
      }
      if (moneyCents(amount) > moneyCents(existingLeadInvoice.totalAmount)) {
        throw new BusinessRuleError(
          'LEAD_INVOICE_AMOUNT_EXCEEDS',
          `The amount is more than the lead's existing invoice total (${existingLeadInvoice.totalAmount}).`,
        );
      }
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'invoice',
        entityId: existingLeadInvoice.id,
        action: 'REUSED',
        context: {
          via: 'lead_accept',
          leadId: lead.id,
          engagementId,
          note: 'Pre-existing lead invoice reused; no new invoice issued.',
        },
      });
    } else {
      const newEngagement = await insertEngagement(tx, {
        serviceCatalogItemId: service.id,
        payerPersonId: lead.targetBusiness === 'RECRUITMENT' ? null : lead.personId,
        payerEmployerId: lead.targetBusiness === 'RECRUITMENT' ? lead.employerId : null,
        beneficiaryPersonId: lead.personId,
        agreedAmount: amount,
        currencyCode,
        status: 'PENDING_PAYMENT',
      });
      engagementId = newEngagement.id;
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'service_engagement',
        entityId: newEngagement.id,
        action: 'CREATED',
        after: {
          serviceCatalogItemId: service.id,
          amount: newEngagement.agreedAmount,
          currency: newEngagement.currencyCode,
        },
        context: { via: 'lead_accept', leadId: lead.id, targetBusiness: lead.targetBusiness },
      });

      // R0 — mirror generateInvoiceForPayer exactly: an employer payer's
      // own VAT treatment and payment terms apply. This path used to
      // hardcode STANDARD + the app default, so a reverse-charge
      // employer's accept-lead invoice carried the wrong VAT line.
      const settings = await fetchAppSettings();
      let vatTreatment: 'STANDARD' | 'REVERSE_CHARGE' | 'EXEMPT' | 'OUTSIDE_SCOPE' = 'STANDARD';
      let paymentTermsDays: number | null = settings.defaultPaymentTermsDays;
      if (lead.targetBusiness === 'RECRUITMENT' && lead.employerId) {
        const [emp] = await tx
          .select({ terms: employers.paymentTermsDays, treatment: employers.vatTreatment })
          .from(employers)
          .where(eq(employers.id, lead.employerId))
          .limit(1);
        if (emp?.terms != null) paymentTermsDays = emp.terms;
        if (emp?.treatment) vatTreatment = emp.treatment;
      }
      const effectiveVatRate =
        settings.vatRegistered && vatTreatment === 'STANDARD' ? settings.vatRatePercent : '0.00';
      const newInvoice = await insertInvoice(tx, {
        payerPersonId: lead.targetBusiness === 'RECRUITMENT' ? null : lead.personId,
        payerEmployerId: lead.targetBusiness === 'RECRUITMENT' ? lead.employerId : null,
        serviceEngagementId: engagementId,
        serviceCatalogItemId: service.id,
        qty: 1,
        unitPrice: amount,
        vatRatePercent: effectiveVatRate,
        vatTreatment,
        currencyCode,
        lineDescription: service.name,
        issuedByUserId: session.user.id,
        paymentTermsDays,
        immigrationCaseId: lead.targetBusiness === 'IMMIGRATION' ? entityId : null,
        jobRequisitionId: lead.targetBusiness === 'RECRUITMENT' ? entityId : null,
        placementId: null,
        sourceLeadId: lead.id,
      });
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'invoice',
        entityId: newInvoice.id,
        action: 'ISSUED',
        after: {
          number: newInvoice.number,
          totalAmount: newInvoice.totalAmount,
          currency: newInvoice.currencyCode,
        },
        context: {
          via: 'lead_accept',
          leadId: lead.id,
          engagementId,
          // K1 — issued under the lead-conversion exception.
          issuedUnder: 'lead_conversion_exception',
          actorHasFinanceAuthority: actorHasFinance,
          priceSource: conversion.priceSource,
          ...(separateChargeOverride
            ? { separateChargeConfirmed: true, separateChargeReason: separateChargeOverride.reason }
            : {}),
        },
      });
    }

    // Stage 3 guard: if the lead's existing invoice originated from a
    // pro forma (i.e. a `pro_forma_official_invoices` row references
    // it), the money chain is already in place — engagement, invoice,
    // one or more verified payments, and the full line-items table all
    // exist. Creating ANOTHER payment here (the legacy path below) would
    // double-count. Skip payment creation entirely for the pro-forma
    // origin case; the operational entity is still materialised above
    // and the lead is stamped CONVERTED below.
    const isProFormaOriginInvoice = existingLeadInvoice
      ? await (async () => {
          const [row] = await tx.execute<{ exists: boolean }>(
            sql`SELECT EXISTS(SELECT 1 FROM pro_forma_official_invoices WHERE invoice_id = ${existingLeadInvoice.id}) AS exists`,
          );
          return Boolean(row?.exists);
        })()
      : false;

    // Conversion basis: PAYMENT_VERIFIED only when the money is verified at
    // this moment. A payment left PENDING for finance leaves the method
    // NULL — it is neither verified nor a manual override; the payment row
    // (PENDING) and the AWAITING_FINANCE_VERIFICATION audit event carry it.
    let conversionMethod: 'PAYMENT_VERIFIED' | null = null;
    if (!isProFormaOriginInvoice) {
      const proofRef =
        parsed.proofReference && parsed.proofReference.trim().length > 0
          ? parsed.proofReference.trim()
          : null;
      const payment = await insertPayment(tx, {
        serviceEngagementId: engagementId,
        amount,
        currencyCode,
        method,
        proofReference: proofRef,
        receivedAt: new Date(received.date),
        status: proofRef ? 'PROOF_UPLOADED' : 'PENDING',
      });
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'payment',
        entityId: payment.id,
        action: 'CREATED',
        after: {
          amount: payment.amount,
          currency: payment.currencyCode,
          method: payment.method,
          status: payment.status,
          receivedAt: received.date,
        },
        context: { via: 'lead_accept', leadId: lead.id, engagementId },
      });

      // Decision C1 — only finance authority (owner, ADMIN, FINANCE)
      // confirms money at acceptance. Anyone else accepts the lead with
      // the payment left PENDING, and the engagement stays
      // PENDING_PAYMENT until finance verifies it.
      if (actorHasFinance) {
        await performPaymentVerification(tx, payment, session.user.id);
        conversionMethod = 'PAYMENT_VERIFIED';
      } else {
        await recordAudit(tx, {
          actorUserId: session.user.id,
          entityType: 'payment',
          entityId: payment.id,
          action: 'AWAITING_FINANCE_VERIFICATION',
          context: { via: 'lead_accept', leadId: lead.id, engagementId },
        });
      }
    } else {
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'invoice',
        entityId: existingLeadInvoice.id,
        action: 'REUSED_FROM_PRO_FORMA',
        context: {
          via: 'lead_accept',
          leadId: lead.id,
          engagementId,
          note: 'Pro-forma-originated invoice detected; skipped duplicate payment creation.',
        },
      });
      const [pfInv] = await tx
        .select({ status: invoices.status })
        .from(invoices)
        .where(eq(invoices.id, existingLeadInvoice.id))
        .limit(1);
      if (pfInv?.status === 'PAID') conversionMethod = 'PAYMENT_VERIFIED';
    }

    const updatedLead = await stampConversion(tx, {
      lead,
      actorUserId: session.user.id,
      entityId,
      conversionMethod,
      reason,
      auditContext: {
        targetBusiness: lead.targetBusiness,
        mode: 'NEW_PAYMENT',
        reason: parsed.reason,
        invoicesLinked,
        ...(separateChargeOverride ? { separateChargeConfirmed: true } : {}),
      },
    });

    return {
      lead: updatedLead,
      targetBusiness: lead.targetBusiness,
      entityId,
      invoicesLinked,
    };
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Recruitment P0 — "use existing invoice" conversion. Runs inside
 * acceptLead's transaction with the lead row already locked.
 *
 * The invoice row is locked FOR UPDATE before it is checked, so two
 * enquiries racing to link the same invoice serialize: the second sees
 * source_lead_id already set by the first and is refused. Nothing that
 * moves money is created — the invoice is only back-linked.
 */
async function convertWithExistingInvoice(
  tx: Tx,
  args: { lead: Lead; invoiceId: string; reason: string; actorUserId: string },
): Promise<{
  lead: Lead;
  targetBusiness: Lead['targetBusiness'];
  entityId: string;
  invoicesLinked: number;
}> {
  const { lead } = args;
  if (lead.targetBusiness !== 'RECRUITMENT' || !lead.employerId) {
    throw new BusinessRuleError(
      'LEAD_EXISTING_INVOICE_UNSUPPORTED',
      'Converting with an existing invoice is only available for Recruitment enquiries.',
    );
  }
  const [locked] = await tx
    .select({ id: invoices.id })
    .from(invoices)
    .where(eq(invoices.id, args.invoiceId))
    .for('update')
    .limit(1);
  if (!locked) throw new BusinessRuleError('INVOICE_NOT_FOUND', 'Invoice not found');
  const [facts] = await loadInvoiceLinkFacts(tx, sql`i.id = ${args.invoiceId}`);
  if (!facts) throw new BusinessRuleError('INVOICE_NOT_FOUND', 'Invoice not found');
  const refusal = invoiceLinkRefusal(facts, lead);
  if (refusal) throw new BusinessRuleError(refusal.code, refusal.message);

  const { entityId, invoiceUpdate } = await createTargetEntity(tx, {
    lead,
    actorUserId: args.actorUserId,
    reason: args.reason,
  });
  const invoicesLinked = await backLinkLeadInvoices(tx, lead.id, invoiceUpdate);

  const [linked] = await tx
    .update(invoices)
    .set({ sourceLeadId: lead.id, jobRequisitionId: entityId, updatedAt: sql`NOW()` })
    .where(eq(invoices.id, facts.id))
    .returning({ id: invoices.id });
  if (!linked) throw new Error('invoice link returned no row');
  await recordAudit(tx, {
    actorUserId: args.actorUserId,
    entityType: 'invoice',
    entityId: facts.id,
    action: 'LINKED_TO_LEAD',
    before: { sourceLeadId: facts.sourceLeadId, jobRequisitionId: facts.jobRequisitionId },
    after: { sourceLeadId: lead.id, jobRequisitionId: entityId },
    context: {
      via: 'lead_accept',
      leadId: lead.id,
      invoiceNumber: facts.number,
      verifiedPaid: (facts.verifiedPaidCents / 100).toFixed(2),
      note: 'Existing paid, finance-verified invoice used for conversion; no engagement, invoice or payment created.',
    },
  });

  const updatedLead = await stampConversion(tx, {
    lead,
    actorUserId: args.actorUserId,
    entityId,
    conversionMethod: 'PAYMENT_VERIFIED',
    reason: args.reason,
    auditContext: {
      targetBusiness: lead.targetBusiness,
      mode: 'EXISTING_INVOICE',
      existingInvoiceId: facts.id,
      existingInvoiceNumber: facts.number,
      reason: args.reason || undefined,
      invoicesLinked: Math.max(invoicesLinked, 1),
    },
  });
  return {
    lead: updatedLead,
    targetBusiness: lead.targetBusiness,
    entityId,
    invoicesLinked: Math.max(invoicesLinked, 1),
  };
}

/** Create the lead's target entity (candidate profile / case / requisition). */
async function createTargetEntity(
  tx: Tx,
  args: { lead: Lead; actorUserId: string; reason: string | undefined },
): Promise<{
  entityId: string;
  invoiceUpdate: { column: 'immigrationCaseId' | 'jobRequisitionId'; value: string } | null;
}> {
  const { lead } = args;
  if (lead.targetBusiness === 'CANDIDATE_SERVICES') {
    if (!lead.personId) throw new Error('CS lead without personId — schema constraint broken');
    const [existingProfile] = await tx
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.personId, lead.personId))
      .limit(1);
    if (existingProfile) return { entityId: existingProfile.id, invoiceUpdate: null };
    // Session 33 — same auto-assign rule on lead accept.
    // Stage 4 — transfer the person's primary profession (which may
    // have been set at lead-creation time) onto the newly-created
    // candidate profile. Middle name + address live on `persons` so
    // the profile inherits them via the FK; profession lives on both
    // tables and the identity-level value is the source of truth.
    const [personRow] = await tx
      .select({ primaryOccupationId: persons.primaryOccupationId })
      .from(persons)
      .where(eq(persons.id, lead.personId))
      .limit(1);
    const [newProfile] = await tx
      .insert(candidateProfiles)
      .values({
        personId: lead.personId,
        assignedUserId: args.actorUserId,
        primaryOccupationId: personRow?.primaryOccupationId ?? null,
      })
      .returning();
    if (!newProfile) throw new Error('candidate_profiles insert returned no row');
    await recordAudit(tx, {
      actorUserId: args.actorUserId,
      entityType: 'candidate_profile',
      entityId: newProfile.id,
      action: 'CREATED',
      after: {
        personId: lead.personId,
        assignedUserId: args.actorUserId,
        primaryOccupationId: personRow?.primaryOccupationId ?? null,
      },
      context: { via: 'lead_accept', leadId: lead.id, reason: args.reason },
    });
    // CS invoices are already payer-person-scoped — the profile inherits
    // them through the person's billing history. No back-link needed.
    return { entityId: newProfile.id, invoiceUpdate: null };
  }
  if (lead.targetBusiness === 'IMMIGRATION') {
    if (!lead.personId)
      throw new Error('Immigration lead without personId — schema constraint broken');
    const [newCase] = await tx
      .insert(immigrationCases)
      .values({
        caseType: 'EMPLOYMENT_PERMIT',
        beneficiaryPersonId: lead.personId,
        assignedUserId: lead.assignedUserId,
        notes: lead.notes,
      })
      .returning();
    if (!newCase) throw new Error('immigration_cases insert returned no row');
    await recordAudit(tx, {
      actorUserId: args.actorUserId,
      entityType: 'immigration_case',
      entityId: newCase.id,
      action: 'CREATED',
      after: { beneficiaryPersonId: lead.personId },
      context: { via: 'lead_accept', leadId: lead.id, reason: args.reason },
    });
    return {
      entityId: newCase.id,
      invoiceUpdate: { column: 'immigrationCaseId', value: newCase.id },
    };
  }
  if (lead.targetBusiness === 'RECRUITMENT') {
    if (!lead.employerId)
      throw new Error('Recruitment lead without employerId — schema constraint broken');
    const [emp] = await tx
      .select({ legalName: employers.legalName })
      .from(employers)
      .where(eq(employers.id, lead.employerId))
      .limit(1);
    const [newReq] = await tx
      .insert(jobRequisitions)
      .values({
        employerId: lead.employerId,
        title: `New requisition — ${emp?.legalName ?? 'employer'}`,
        status: 'DRAFT',
        assignedUserId: lead.assignedUserId,
      })
      .returning();
    if (!newReq) throw new Error('job_requisitions insert returned no row');
    await recordAudit(tx, {
      actorUserId: args.actorUserId,
      entityType: 'job_requisition',
      entityId: newReq.id,
      action: 'CREATED',
      after: { employerId: lead.employerId, title: newReq.title, status: newReq.status },
      context: { via: 'lead_accept', leadId: lead.id, reason: args.reason },
    });
    return {
      entityId: newReq.id,
      invoiceUpdate: { column: 'jobRequisitionId', value: newReq.id },
    };
  }
  throw new BusinessRuleError('UNKNOWN_TARGET', 'Unknown lead target business');
}

/** Back-link every invoice raised on this lead to the new case /
 *  requisition. CS skips this (invoices already flow through the person's
 *  billing history). */
async function backLinkLeadInvoices(
  tx: Tx,
  leadId: string,
  invoiceUpdate: { column: 'immigrationCaseId' | 'jobRequisitionId'; value: string } | null,
): Promise<number> {
  if (!invoiceUpdate) return 0;
  const setPayload =
    invoiceUpdate.column === 'immigrationCaseId'
      ? { immigrationCaseId: invoiceUpdate.value, updatedAt: sql`NOW()` }
      : { jobRequisitionId: invoiceUpdate.value, updatedAt: sql`NOW()` };
  const updated = await tx
    .update(invoices)
    .set(setPayload)
    .where(eq(invoices.sourceLeadId, leadId))
    .returning({ id: invoices.id });
  return updated.length;
}

/** Stamp the acceptance + conversion basis on the lead so a repeat click
 *  can't create a duplicate, and audit it. */
async function stampConversion(
  tx: Tx,
  args: {
    lead: Lead;
    actorUserId: string;
    entityId: string;
    conversionMethod: 'PAYMENT_VERIFIED' | null;
    reason: string;
    auditContext: Record<string, unknown>;
  },
): Promise<Lead> {
  const now = new Date();
  const [updatedLead] = await tx
    .update(leads)
    .set({
      status: 'CONVERTED',
      acceptedAt: now,
      acceptedByUserId: args.actorUserId,
      acceptedEntityId: args.entityId,
      convertedAt: now,
      convertedByUserId: args.actorUserId,
      conversionMethod: args.conversionMethod,
      conversionReason: args.reason.length > 0 ? args.reason : null,
      updatedAt: sql`NOW()`,
    })
    .where(eq(leads.id, args.lead.id))
    .returning();
  if (!updatedLead) throw new Error('leads update returned no row');

  await recordAudit(tx, {
    actorUserId: args.actorUserId,
    entityType: 'lead',
    entityId: args.lead.id,
    action: 'ACCEPTED',
    before: { status: args.lead.status, acceptedAt: args.lead.acceptedAt },
    after: {
      status: updatedLead.status,
      acceptedAt: updatedLead.acceptedAt,
      acceptedEntityId: args.entityId,
      convertedAt: updatedLead.convertedAt,
      conversionMethod: updatedLead.conversionMethod,
    },
    context: args.auditContext,
  });
  return updatedLead;
}

/* ─── Decision K1 — lead-conversion charge validation ─────────────────── */

function moneyCents(v: string): number {
  return Math.round(Number.parseFloat(v) * 100);
}

/**
 * Server-side rules for the charge raised when a lead is accepted
 * (Immigration / Recruitment conversion — Candidate Services is already
 * finance-only above). Exported for unit tests.
 *   - the service is active and matches the payer (person vs employer);
 *   - the payer exists on the lead;
 *   - the currency matches the catalog currency when the catalog sets one;
 *   - when the catalog sets a price it is the authorized price: non-finance
 *     staff must use it exactly; finance may deviate (audited);
 *   - quote-based services (no catalog price) keep the operator-entered
 *     amount, marked as such in the audit trail.
 */
export function validateLeadConversionCharge(args: {
  targetBusiness: Lead['targetBusiness'];
  personId: string | null;
  employerId: string | null;
  service: {
    isActive: boolean;
    payerType: 'PERSON' | 'EMPLOYER' | 'ANY';
    defaultPrice: string | null;
    defaultCurrencyCode: string | null;
  };
  amount: string;
  currencyCode: string;
  actorHasFinance: boolean;
}): { priceSource: 'catalog' | 'finance_override' | 'operator_entered_no_catalog_price' } {
  const { service } = args;
  if (!service.isActive) {
    throw new BusinessRuleError('SERVICE_INACTIVE', 'This service is no longer offered.');
  }
  const employerPays = args.targetBusiness === 'RECRUITMENT';
  if (employerPays ? !args.employerId : !args.personId) {
    throw new BusinessRuleError('LEAD_PAYER_MISSING', 'This lead has no payer to invoice.');
  }
  const payerOk =
    service.payerType === 'ANY' || service.payerType === (employerPays ? 'EMPLOYER' : 'PERSON');
  if (!payerOk) {
    throw new BusinessRuleError(
      'SERVICE_PAYER_MISMATCH',
      employerPays
        ? 'This service is billed to people, not employers. Choose an employer service.'
        : 'This service is billed to employers. Choose a service billed to the person.',
    );
  }
  if (service.defaultCurrencyCode && service.defaultCurrencyCode !== args.currencyCode) {
    throw new BusinessRuleError(
      'SERVICE_CURRENCY_MISMATCH',
      `This service is priced in ${service.defaultCurrencyCode}.`,
    );
  }
  if (moneyCents(args.amount) <= 0) {
    throw new ValidationError('Amount must be greater than zero.', { amount: 'Must be > 0' });
  }
  if (service.defaultPrice === null) return { priceSource: 'operator_entered_no_catalog_price' };
  if (moneyCents(args.amount) === moneyCents(service.defaultPrice))
    return { priceSource: 'catalog' };
  if (!args.actorHasFinance) {
    throw new BusinessRuleError(
      'PRICE_NOT_AUTHORIZED',
      `The catalog price for this service is ${service.defaultPrice}. A different amount needs Finance, Admin or the owner.`,
    );
  }
  return { priceSource: 'finance_override' };
}
