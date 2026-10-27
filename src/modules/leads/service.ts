import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { hasFinanceAuthority } from '@/lib/auth/finance-policy-rules';
import { requireInternalStaff } from '@/lib/auth/session';
import type { DateRange } from '@/lib/date-range';
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
import { insertInvoice } from '@/modules/billing/service';
import { getEngagement, insertEngagement, insertPayment } from '@/modules/commerce/repository';
import { performPaymentVerification } from '@/modules/commerce/service';
import { insertPerson } from '@/modules/persons/repository';
import { fetchAppSettings } from '@/modules/settings/service';
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
 * Idempotent: a second call refuses if acceptedAt is already set, so a
 * double-click can't duplicate the target entity.
 */
export async function acceptLead(input: AcceptLeadInput): Promise<{
  lead: Lead;
  targetBusiness: Lead['targetBusiness'];
  entityId: string;
  invoicesLinked: number;
}> {
  const session = await requireInternalStaff();
  const parsed = AcceptLeadSchema.parse(input);

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
    if (lead.acceptedAt) {
      throw new BusinessRuleError(
        'LEAD_ALREADY_ACCEPTED',
        'This lead has already been accepted — see the linked case/requisition/profile',
      );
    }

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

    let entityId: string;
    let invoiceUpdate: { column: 'immigrationCaseId' | 'jobRequisitionId'; value: string } | null =
      null;

    if (lead.targetBusiness === 'CANDIDATE_SERVICES') {
      if (!lead.personId) throw new Error('CS lead without personId — schema constraint broken');
      const [existingProfile] = await tx
        .select()
        .from(candidateProfiles)
        .where(eq(candidateProfiles.personId, lead.personId))
        .limit(1);
      if (existingProfile) {
        entityId = existingProfile.id;
      } else {
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
            assignedUserId: session.user.id,
            primaryOccupationId: personRow?.primaryOccupationId ?? null,
          })
          .returning();
        if (!newProfile) throw new Error('candidate_profiles insert returned no row');
        entityId = newProfile.id;
        await recordAudit(tx, {
          actorUserId: session.user.id,
          entityType: 'candidate_profile',
          entityId: newProfile.id,
          action: 'CREATED',
          after: {
            personId: lead.personId,
            assignedUserId: session.user.id,
            primaryOccupationId: personRow?.primaryOccupationId ?? null,
          },
          context: { via: 'lead_accept', leadId: lead.id, reason: parsed.reason },
        });
      }
      // CS invoices are already payer-person-scoped — the profile inherits
      // them through the person's billing history. No back-link needed.
    } else if (lead.targetBusiness === 'IMMIGRATION') {
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
      entityId = newCase.id;
      invoiceUpdate = { column: 'immigrationCaseId', value: newCase.id };
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'immigration_case',
        entityId: newCase.id,
        action: 'CREATED',
        after: { beneficiaryPersonId: lead.personId },
        context: { via: 'lead_accept', leadId: lead.id, reason: parsed.reason },
      });
    } else if (lead.targetBusiness === 'RECRUITMENT') {
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
      entityId = newReq.id;
      invoiceUpdate = { column: 'jobRequisitionId', value: newReq.id };
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'job_requisition',
        entityId: newReq.id,
        action: 'CREATED',
        after: { employerId: lead.employerId, title: newReq.title, status: newReq.status },
        context: { via: 'lead_accept', leadId: lead.id, reason: parsed.reason },
      });
    } else {
      throw new BusinessRuleError('UNKNOWN_TARGET', 'Unknown lead target business');
    }

    // Back-link every invoice raised on this lead to the newly-created
    // case / requisition. CS skips this (invoices already flow through
    // the person's billing history).
    let invoicesLinked = 0;
    if (invoiceUpdate) {
      const setPayload =
        invoiceUpdate.column === 'immigrationCaseId'
          ? { immigrationCaseId: invoiceUpdate.value, updatedAt: sql`NOW()` }
          : { jobRequisitionId: invoiceUpdate.value, updatedAt: sql`NOW()` };
      const updated = await tx
        .update(invoices)
        .set(setPayload)
        .where(eq(invoices.sourceLeadId, lead.id))
        .returning({ id: invoices.id });
      invoicesLinked = updated.length;
    }

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
      .where(eq(serviceCatalogItems.id, parsed.serviceCatalogItemId))
      .limit(1);
    if (!service) {
      throw new BusinessRuleError('SERVICE_NOT_FOUND', 'Selected service no longer exists');
    }

    // Decision K1 — lead conversion is the one place non-finance staff may
    // cause an invoice to be issued (Immigration / Recruitment conversion
    // workflow). It is a narrow, server-enforced exception: the invoice must
    // match an active catalog service, the right payer, the catalog's
    // authorized price and currency, and never duplicate an existing one.
    const actorHasFinance = hasFinanceAuthority(session.user, 'VERIFY');
    const conversion = validateLeadConversionCharge({
      targetBusiness: lead.targetBusiness,
      personId: lead.personId,
      employerId: lead.employerId,
      service,
      amount: parsed.amount,
      currencyCode: parsed.currencyCode,
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
      .limit(1);

    let engagementId: string;
    if (existingLeadInvoice) {
      // Reuse: fetch the engagement the invoice already points at.
      const existingEng = await getEngagement(existingLeadInvoice.serviceEngagementId, tx);
      if (!existingEng) {
        throw new Error('invoice references an engagement that no longer exists');
      }
      engagementId = existingEng.id;
      if (existingLeadInvoice.currencyCode !== parsed.currencyCode) {
        throw new BusinessRuleError(
          'LEAD_INVOICE_CURRENCY_MISMATCH',
          `This lead already has invoice in ${existingLeadInvoice.currencyCode}; record the payment in that currency.`,
        );
      }
      if (moneyCents(parsed.amount) > moneyCents(existingLeadInvoice.totalAmount)) {
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
        agreedAmount: parsed.amount,
        currencyCode: parsed.currencyCode,
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
        unitPrice: parsed.amount,
        vatRatePercent: effectiveVatRate,
        vatTreatment,
        currencyCode: parsed.currencyCode,
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

    if (!isProFormaOriginInvoice) {
      const proofRef =
        parsed.proofReference && parsed.proofReference.trim().length > 0
          ? parsed.proofReference.trim()
          : null;
      const payment = await insertPayment(tx, {
        serviceEngagementId: engagementId,
        amount: parsed.amount,
        currencyCode: parsed.currencyCode,
        method: parsed.method,
        proofReference: proofRef,
        receivedAt: parsed.receivedAt ? new Date(parsed.receivedAt) : null,
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
        },
        context: { via: 'lead_accept', leadId: lead.id, engagementId },
      });

      // Decision C1 — only finance authority (owner, ADMIN, FINANCE)
      // confirms money at acceptance. Anyone else accepts the lead with
      // the payment left PENDING, and the engagement stays
      // PENDING_PAYMENT until finance verifies it.
      if (hasFinanceAuthority(session.user, 'VERIFY')) {
        await performPaymentVerification(tx, payment, session.user.id);
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
    }

    // Stamp the acceptance on the lead itself so a repeat click can't
    // create a duplicate case.
    const [updatedLead] = await tx
      .update(leads)
      .set({
        status: 'CONVERTED',
        acceptedAt: new Date(),
        acceptedByUserId: session.user.id,
        acceptedEntityId: entityId,
        updatedAt: sql`NOW()`,
      })
      .where(eq(leads.id, lead.id))
      .returning();
    if (!updatedLead) throw new Error('leads update returned no row');

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'lead',
      entityId: lead.id,
      action: 'ACCEPTED',
      before: { status: lead.status, acceptedAt: lead.acceptedAt },
      after: {
        status: updatedLead.status,
        acceptedAt: updatedLead.acceptedAt,
        acceptedEntityId: entityId,
      },
      context: {
        targetBusiness: lead.targetBusiness,
        reason: parsed.reason,
        invoicesLinked,
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
