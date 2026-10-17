import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireInternalStaff } from '@/lib/auth/session';
import type { DateRange } from '@/lib/date-range';
import { db } from '@/lib/db/client';
import { invoices } from '@/lib/db/schema/billing';
import { immigrationCases } from '@/lib/db/schema/immigration';
import { type Lead, leads } from '@/lib/db/schema/leads';
import { candidateProfiles } from '@/lib/db/schema/persons';
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
        lastName: p.lastName.trim(),
        email: blankToNull(p.email),
        phone: blankToNull(p.phone),
        dateOfBirth: blankToNull(p.dateOfBirth),
        nationality: blankToNull(p.nationality),
        currentCountry: blankToNull(p.currentCountry),
        currentCity: blankToNull(p.currentCity),
        source: p.source,
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
    const [lead] = await tx.select().from(leads).where(eq(leads.id, parsed.leadId)).limit(1);
    if (!lead) throw new BusinessRuleError('LEAD_NOT_FOUND', 'Lead not found');
    if (lead.acceptedAt) {
      throw new BusinessRuleError(
        'LEAD_ALREADY_ACCEPTED',
        'This lead has already been accepted — see the linked case/requisition/profile',
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
        const [newProfile] = await tx
          .insert(candidateProfiles)
          .values({ personId: lead.personId, assignedUserId: session.user.id })
          .returning();
        if (!newProfile) throw new Error('candidate_profiles insert returned no row');
        entityId = newProfile.id;
        await recordAudit(tx, {
          actorUserId: session.user.id,
          entityType: 'candidate_profile',
          entityId: newProfile.id,
          action: 'CREATED',
          after: { personId: lead.personId, assignedUserId: session.user.id },
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
      .select({ id: serviceCatalogItems.id, name: serviceCatalogItems.name })
      .from(serviceCatalogItems)
      .where(eq(serviceCatalogItems.id, parsed.serviceCatalogItemId))
      .limit(1);
    if (!service) {
      throw new BusinessRuleError('SERVICE_NOT_FOUND', 'Selected service no longer exists');
    }

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

      // VAT rate from settings; treatment stays STANDARD at MVP scale
      // (per-employer treatment can be layered on later).
      const settings = await fetchAppSettings();
      const effectiveVatRate = settings.vatRegistered ? settings.vatRatePercent : '0.00';
      const newInvoice = await insertInvoice(tx, {
        payerPersonId: lead.targetBusiness === 'RECRUITMENT' ? null : lead.personId,
        payerEmployerId: lead.targetBusiness === 'RECRUITMENT' ? lead.employerId : null,
        serviceEngagementId: engagementId,
        qty: 1,
        unitPrice: parsed.amount,
        vatRatePercent: effectiveVatRate,
        vatTreatment: 'STANDARD',
        currencyCode: parsed.currencyCode,
        lineDescription: service.name,
        issuedByUserId: session.user.id,
        paymentTermsDays: settings.defaultPaymentTermsDays,
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
        context: { via: 'lead_accept', leadId: lead.id, engagementId },
      });
    }

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

    await performPaymentVerification(tx, payment, session.user.id);

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
