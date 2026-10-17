import { desc, eq, inArray, or } from 'drizzle-orm';
import { hasPermission } from '@/lib/auth/permissions';
import { requireInternalStaff, type Session } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { invoices, refunds } from '@/lib/db/schema/billing';
import { payments, serviceEngagements } from '@/lib/db/schema/commerce';
import { leads } from '@/lib/db/schema/leads';
import { occupations } from '@/lib/db/schema/occupations';
import type { CandidateProfile, Person } from '@/lib/db/schema/persons';
import { candidateProfiles, persons } from '@/lib/db/schema/persons';
import {
  proFormaInvoices,
  proFormaOfficialInvoices,
  proFormaPaymentRefunds,
} from '@/lib/db/schema/proformas';
import { serviceCatalogItems } from '@/lib/db/schema/services';
import { users } from '@/lib/db/schema/users';
import { fetchUserPermissionSnapshot } from '@/modules/permissions/service';
import type { CurrencyRollup, EngagementBalance, PendingQuoteBalance } from './balance';
import { buildClientBalance } from './balance';
import type { ClientNextAction } from './next-action';
import { computeClientNextAction } from './next-action';

export type ClientTimelineItem = {
  kind:
    | 'lead_created'
    | 'lead_converted'
    | 'quote_created'
    | 'quote_issued'
    | 'quote_accepted'
    | 'quote_superseded'
    | 'quote_converted'
    | 'payment_recorded'
    | 'payment_verified'
    | 'invoice_issued'
    | 'invoice_voided'
    | 'candidate_activated';
  id: string;
  at: Date;
  title: string;
  subtitle: string;
};

export type ClientWorkspace = {
  session: Session;
  person: Person;
  occupationName: string | null;
  candidateProfile: CandidateProfile | null;
  assignedUserName: string | null;
  leads: Array<{
    id: string;
    status:
      | 'NEW'
      | 'CONTACTED'
      | 'AWAITING_PAYMENT'
      | 'CONVERTED'
      | 'LOST'
      | 'REJECTED'
      | 'EXPIRED'
      | 'ARCHIVED';
    targetBusiness: 'CANDIDATE_SERVICES' | 'RECRUITMENT' | 'IMMIGRATION';
    createdAt: Date;
    acceptedAt: Date | null;
  }>;
  proFormas: Array<{
    id: string;
    number: string;
    status: 'DRAFT' | 'ISSUED' | 'ACCEPTED' | 'CONVERTED' | 'REJECTED' | 'CANCELLED' | 'SUPERSEDED';
    sourceLeadId: string;
    currencyCode: string;
    subtotal: string;
    revision: number;
    issuedAt: Date | null;
    acceptedAt: Date | null;
    engagementId: string | null;
  }>;
  invoices: Array<{
    id: string;
    number: string;
    status: 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOIDED';
    totalAmount: string;
    outstandingAmount: string;
    currencyCode: string;
    issuedAt: Date;
    serviceEngagementId: string;
  }>;
  payments: Array<{
    id: string;
    serviceEngagementId: string;
    amount: string;
    currencyCode: string;
    status:
      | 'PENDING'
      | 'PROOF_UPLOADED'
      | 'VERIFIED'
      | 'REJECTED'
      | 'PARTIALLY_REFUNDED'
      | 'REFUNDED';
    method: 'BANK_TRANSFER' | 'CASH' | 'OTHER';
    receivedAt: Date | null;
    createdAt: Date;
  }>;
  balance: {
    engagements: EngagementBalance[];
    pendingQuotes: PendingQuoteBalance[];
    byCurrency: CurrencyRollup[];
  };
  timeline: ClientTimelineItem[];
  nextAction: ClientNextAction | null;
  canVerifyPayments: boolean;
};

/**
 * One combined fetch for the Client Workspace page. Cost: ~8 round trips
 * (person + profile + leads + proformas + engagements + invoices + payments
 * + refunds — all in parallel after the person probe). The resolver and
 * balance builder are pure functions over the result.
 *
 * Returns null if the person doesn't exist; the caller renders notFound().
 */
export async function fetchClientWorkspace(personId: string): Promise<ClientWorkspace | null> {
  const session = await requireInternalStaff();

  const [person] = await db.select().from(persons).where(eq(persons.id, personId)).limit(1);
  if (!person) return null;

  const [profileRow] = await db
    .select({
      profile: candidateProfiles,
      occupationName: occupations.name,
      assignedUserName: users.fullName,
    })
    .from(candidateProfiles)
    .leftJoin(occupations, eq(occupations.id, candidateProfiles.primaryOccupationId))
    .leftJoin(users, eq(users.id, candidateProfiles.assignedUserId))
    .where(eq(candidateProfiles.personId, personId))
    .limit(1);
  const candidateProfile = profileRow?.profile ?? null;
  const assignedUserName = profileRow?.assignedUserName ?? null;

  // Also pull the person-level occupation if the profile doesn't have one;
  // the header falls back to it so a lead-stage client still shows a role.
  const [personOccRow] = person.primaryOccupationId
    ? await db
        .select({ name: occupations.name })
        .from(occupations)
        .where(eq(occupations.id, person.primaryOccupationId))
        .limit(1)
    : [];
  const occupationName = profileRow?.occupationName ?? personOccRow?.name ?? null;

  const leadRows = await db
    .select({
      id: leads.id,
      status: leads.status,
      targetBusiness: leads.targetBusiness,
      createdAt: leads.createdAt,
      acceptedAt: leads.acceptedAt,
    })
    .from(leads)
    .where(eq(leads.personId, personId))
    .orderBy(desc(leads.createdAt));

  const leadIds = leadRows.map((l) => l.id);

  // Pro-formas on any of this person's leads.
  const pfRows =
    leadIds.length > 0
      ? await db
          .select({
            id: proFormaInvoices.id,
            number: proFormaInvoices.number,
            status: proFormaInvoices.status,
            sourceLeadId: proFormaInvoices.sourceLeadId,
            currencyCode: proFormaInvoices.currencyCode,
            subtotal: proFormaInvoices.subtotal,
            revision: proFormaInvoices.revision,
            issuedAt: proFormaInvoices.issuedAt,
            acceptedAt: proFormaInvoices.acceptedAt,
          })
          .from(proFormaInvoices)
          .where(inArray(proFormaInvoices.sourceLeadId, leadIds))
          .orderBy(desc(proFormaInvoices.createdAt))
      : [];

  // Resolve the engagement each pro-forma eventually produced: a
  // CONVERTED pro-forma maps to one or more official invoices via
  // pro_forma_official_invoices, and each invoice carries a
  // serviceEngagementId.
  const pfIds = pfRows.map((p) => p.id);
  const pfOfficialRows =
    pfIds.length > 0
      ? await db
          .select({
            proFormaInvoiceId: proFormaOfficialInvoices.proFormaInvoiceId,
            invoiceId: proFormaOfficialInvoices.invoiceId,
          })
          .from(proFormaOfficialInvoices)
          .where(inArray(proFormaOfficialInvoices.proFormaInvoiceId, pfIds))
      : [];

  // Engagements where this person is payer or beneficiary.
  const engagementRows = await db
    .select({
      id: serviceEngagements.id,
      status: serviceEngagements.status,
      agreedAmount: serviceEngagements.agreedAmount,
      currencyCode: serviceEngagements.currencyCode,
      archivedAt: serviceEngagements.archivedAt,
      serviceName: serviceCatalogItems.name,
    })
    .from(serviceEngagements)
    .innerJoin(
      serviceCatalogItems,
      eq(serviceCatalogItems.id, serviceEngagements.serviceCatalogItemId),
    )
    .where(
      or(
        eq(serviceEngagements.payerPersonId, personId),
        eq(serviceEngagements.beneficiaryPersonId, personId),
      ),
    );

  // Invoices + payments on those engagements.
  const engagementIds = engagementRows.map((e) => e.id);
  const invoiceRows =
    engagementIds.length > 0
      ? await db
          .select({
            id: invoices.id,
            number: invoices.number,
            status: invoices.status,
            totalAmount: invoices.totalAmount,
            currencyCode: invoices.currencyCode,
            issuedAt: invoices.issuedAt,
            serviceEngagementId: invoices.serviceEngagementId,
          })
          .from(invoices)
          .where(inArray(invoices.serviceEngagementId, engagementIds))
          .orderBy(desc(invoices.issuedAt))
      : [];

  const paymentRows =
    engagementIds.length > 0
      ? await db
          .select({
            id: payments.id,
            serviceEngagementId: payments.serviceEngagementId,
            amount: payments.amount,
            currencyCode: payments.currencyCode,
            status: payments.status,
            method: payments.method,
            receivedAt: payments.receivedAt,
            createdAt: payments.createdAt,
          })
          .from(payments)
          .where(inArray(payments.serviceEngagementId, engagementIds))
          .orderBy(desc(payments.createdAt))
      : [];

  // Pre-issuance refunds against those payments. Post-issuance refunds
  // (via credit note) also exist in the `refunds` table — included so
  // the engagement balance reflects both kinds.
  const paymentIds = paymentRows.map((p) => p.id);
  const [preRefunds, postRefunds] =
    paymentIds.length > 0
      ? await Promise.all([
          db
            .select({
              paymentId: proFormaPaymentRefunds.paymentId,
              amount: proFormaPaymentRefunds.amount,
            })
            .from(proFormaPaymentRefunds)
            .where(inArray(proFormaPaymentRefunds.paymentId, paymentIds)),
          db
            .select({
              paymentId: refunds.paymentId,
              amount: refunds.amount,
            })
            .from(refunds)
            .where(inArray(refunds.paymentId, paymentIds)),
        ])
      : [[], []];
  const allRefunds = [...preRefunds, ...postRefunds];

  // Compute invoice outstanding client-side: totalAmount minus verified
  // payments against the invoice's engagement, scoped to the invoice's
  // currency. For a shared engagement with multiple invoices this is an
  // approximation; the dedicated balance query on the engagement is the
  // authoritative figure.
  const paymentNetByEngagement = new Map<string, number>();
  for (const p of paymentRows) {
    if (p.status !== 'VERIFIED' && p.status !== 'PARTIALLY_REFUNDED' && p.status !== 'REFUNDED') {
      continue;
    }
    const refundSum = allRefunds
      .filter((r) => r.paymentId === p.id)
      .reduce((acc, r) => acc + Number.parseFloat(r.amount), 0);
    const net = Math.max(0, Number.parseFloat(p.amount) - refundSum);
    paymentNetByEngagement.set(
      p.serviceEngagementId,
      (paymentNetByEngagement.get(p.serviceEngagementId) ?? 0) + net,
    );
  }
  const outstandingByEngagement = new Map<string, number>();
  for (const [engId, net] of paymentNetByEngagement) {
    outstandingByEngagement.set(engId, net);
  }

  // Build the final invoice list with per-row outstanding computed
  // against its own engagement's net paid.
  const engagementAgreedById = new Map(
    engagementRows.map((e) => [e.id, Number.parseFloat(e.agreedAmount)] as const),
  );
  const invoicesOut = invoiceRows.map((i) => {
    const engAgreed =
      engagementAgreedById.get(i.serviceEngagementId) ?? Number.parseFloat(i.totalAmount);
    const engPaid = paymentNetByEngagement.get(i.serviceEngagementId) ?? 0;
    // Outstanding reads as the engagement balance when the invoice is
    // live; a VOIDED invoice is always "outstanding 0" by definition
    // (voiding is not a payment event but it extinguishes the demand).
    const outstanding = i.status === 'VOIDED' ? 0 : Math.max(0, engAgreed - engPaid);
    return {
      ...i,
      outstandingAmount: outstanding.toFixed(2),
    };
  });

  // Attach engagementId to each pro-forma via the official-invoice join.
  const engagementIdByPf = new Map<string, string>();
  for (const link of pfOfficialRows) {
    const inv = invoiceRows.find((x) => x.id === link.invoiceId);
    if (inv) engagementIdByPf.set(link.proFormaInvoiceId, inv.serviceEngagementId);
  }
  const proFormasOut = pfRows.map((p) => ({
    ...p,
    engagementId: engagementIdByPf.get(p.id) ?? null,
  }));

  const balance = buildClientBalance({
    engagements: engagementRows.map((e) => ({
      id: e.id,
      serviceName: e.serviceName,
      currencyCode: e.currencyCode,
      agreedAmount: e.agreedAmount,
      status: e.status,
    })),
    payments: paymentRows,
    refunds: allRefunds,
    invoices: invoicesOut,
    proFormas: proFormasOut.map((p) => ({
      id: p.id,
      number: p.number,
      status: p.status,
      currencyCode: p.currencyCode,
      subtotal: p.subtotal,
      sourceLeadId: p.sourceLeadId,
      engagementId: p.engagementId,
    })),
  });

  // "Confirm payment received" is gated to users with proformas:edit
  // on the Candidate Services business — the same gate used by the
  // verifyProFormaPaymentAction server action. ADMIN + FINANCE roles
  // always carry this via their preset grants.
  const perms = await fetchUserPermissionSnapshot(session.user.id);
  const canVerifyPayments = hasPermission(perms.granted, 'candidate_services', 'proformas', 'edit');

  const nextAction = computeClientNextAction({
    personId,
    canVerifyPayments,
    hasCandidateProfile: Boolean(candidateProfile),
    availabilityStatus: candidateProfile?.availabilityStatus ?? null,
    leads: leadRows,
    proFormas: proFormasOut,
    payments: paymentRows,
    invoices: invoicesOut,
    engagements: engagementRows,
  });

  // Build a unified activity timeline from the data we already have — no
  // extra round-trips. Each surface emits whatever lifecycle events it
  // can from its own columns (created/issued/accepted/voided timestamps).
  const timeline: ClientTimelineItem[] = [];
  for (const l of leadRows) {
    timeline.push({
      kind: 'lead_created',
      id: `lead-create-${l.id}`,
      at: l.createdAt,
      title: 'Enquiry opened',
      subtitle: l.targetBusiness.replace(/_/g, ' ').toLowerCase(),
    });
    if (l.acceptedAt) {
      timeline.push({
        kind: 'lead_converted',
        id: `lead-convert-${l.id}`,
        at: l.acceptedAt,
        title: 'Lead marked converted',
        subtitle: `Lead ${l.status}`,
      });
    }
  }
  for (const p of proFormasOut) {
    const label = `Quote ${p.number}${p.revision > 1 ? ` (rev ${p.revision})` : ''}`;
    timeline.push({
      kind: 'quote_created',
      id: `pf-create-${p.id}`,
      at: p.issuedAt ?? p.acceptedAt ?? new Date(),
      title: `${label} drafted`,
      subtitle: `${p.subtotal} ${p.currencyCode}`,
    });
    if (p.issuedAt) {
      timeline.push({
        kind: 'quote_issued',
        id: `pf-issue-${p.id}`,
        at: p.issuedAt,
        title: `${label} issued`,
        subtitle: 'Shared with the client',
      });
    }
    if (p.acceptedAt) {
      timeline.push({
        kind: 'quote_accepted',
        id: `pf-accept-${p.id}`,
        at: p.acceptedAt,
        title: `${label} accepted`,
        subtitle: 'Client confirmed the quote',
      });
    }
    if (p.status === 'SUPERSEDED') {
      timeline.push({
        kind: 'quote_superseded',
        id: `pf-super-${p.id}`,
        at: p.issuedAt ?? p.acceptedAt ?? new Date(),
        title: `${label} replaced`,
        subtitle: 'An alternative quote was accepted in its place',
      });
    }
    if (p.status === 'CONVERTED') {
      timeline.push({
        kind: 'quote_converted',
        id: `pf-conv-${p.id}`,
        at: p.acceptedAt ?? new Date(),
        title: `${label} converted to invoice`,
        subtitle: 'Payment verified; official invoice issued',
      });
    }
  }
  for (const i of invoicesOut) {
    timeline.push({
      kind: 'invoice_issued',
      id: `inv-${i.id}`,
      at: i.issuedAt,
      title: `Invoice ${i.number} issued`,
      subtitle: `${i.totalAmount} ${i.currencyCode}`,
    });
    if (i.status === 'VOIDED') {
      timeline.push({
        kind: 'invoice_voided',
        id: `inv-void-${i.id}`,
        at: i.issuedAt,
        title: `Invoice ${i.number} voided`,
        subtitle: 'Replaced or cancelled per audit log',
      });
    }
  }
  for (const p of paymentRows) {
    timeline.push({
      kind: 'payment_recorded',
      id: `pay-create-${p.id}`,
      at: p.createdAt,
      title: `Payment recorded — ${p.amount} ${p.currencyCode}`,
      subtitle: `${p.method.replace(/_/g, ' ')} · ${p.status}`,
    });
    if (p.status === 'VERIFIED' || p.status === 'PARTIALLY_REFUNDED' || p.status === 'REFUNDED') {
      timeline.push({
        kind: 'payment_verified',
        id: `pay-verify-${p.id}`,
        at: p.receivedAt ?? p.createdAt,
        title: `Payment confirmed — ${p.amount} ${p.currencyCode}`,
        subtitle: 'Finance verified receipt of funds',
      });
    }
  }
  if (candidateProfile) {
    timeline.push({
      kind: 'candidate_activated',
      id: `cand-${candidateProfile.id}`,
      at: candidateProfile.activatedAt,
      title: 'Candidate activated',
      subtitle: assignedUserName ? `Owner: ${assignedUserName}` : 'Candidate file opened',
    });
  }
  timeline.sort((a, b) => b.at.getTime() - a.at.getTime());

  return {
    session,
    person,
    occupationName,
    candidateProfile,
    assignedUserName,
    leads: leadRows,
    proFormas: proFormasOut,
    invoices: invoicesOut,
    payments: paymentRows,
    balance,
    timeline,
    nextAction,
    canVerifyPayments,
  };
}
