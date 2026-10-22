import { desc, eq, inArray, or, type SQL } from 'drizzle-orm';
import { hasPermission } from '@/lib/auth/permissions';
import { loadCurrentUserPermissions, requireInternalStaff, type Session } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { invoices, receipts, refunds } from '@/lib/db/schema/billing';
import { payments, serviceEngagements } from '@/lib/db/schema/commerce';
import type { Currency } from '@/lib/db/schema/currencies';
import { leads } from '@/lib/db/schema/leads';
import { occupations } from '@/lib/db/schema/occupations';
import type { CandidateProfile, Person } from '@/lib/db/schema/persons';
import { candidateProfiles, persons } from '@/lib/db/schema/persons';
import {
  proFormaInvoices,
  proFormaLineItems,
  proFormaOfficialInvoices,
  proFormaPaymentRefunds,
} from '@/lib/db/schema/proformas';
import { serviceCatalogItems } from '@/lib/db/schema/services';
import { users } from '@/lib/db/schema/users';
import { fetchInvoiceableServicesFor, type InvoiceableService } from '@/modules/billing/read';
import { fetchCurrencies } from '@/modules/currencies/service';
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
    proposalGroupId: string | null;
    currencyCode: string;
    subtotal: string;
    revision: number;
    issuedAt: Date | null;
    acceptedAt: Date | null;
    engagementId: string | null;
    paymentTerms: string | null;
    notes: string | null;
    lines: Array<{
      serviceCatalogItemId: string;
      description: string;
      quantity: string;
      unitPrice: string;
    }>;
  }>;
  invoices: Array<{
    id: string;
    number: string;
    status: 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOIDED';
    /** Stage B Wave 4 — COMPLIMENTARY invoices are €0.00 and PAID by
     *  definition; every display shows the kind, never a bare "Paid". */
    settlementKind: 'STANDARD' | 'COMPLIMENTARY';
    totalAmount: string;
    outstandingAmount: string;
    currencyCode: string;
    issuedAt: Date;
    serviceEngagementId: string;
    /** Stage 6D Wave 3 — who is legally responsible for this invoice.
     *  PERSONAL = this person is the payer and owes it directly.
     *  EMPLOYER_LIABILITY = an employer is the payer; the person is
     *  the beneficiary of the service but owes nothing personally.
     *  The UI must NEVER sum EMPLOYER_LIABILITY into "amount this
     *  client owes" — those are separate obligations tracked under the
     *  employer. */
    liability: 'PERSONAL' | 'EMPLOYER_LIABILITY';
  }>;
  payments: Array<{
    id: string;
    serviceEngagementId: string;
    proFormaInvoiceId: string | null;
    amount: string;
    currencyCode: string;
    status:
      | 'PENDING'
      | 'PROOF_UPLOADED'
      | 'VERIFIED'
      | 'REJECTED'
      | 'PARTIALLY_REFUNDED'
      | 'REFUNDED';
    method: 'BANK_TRANSFER' | 'CASH' | 'CARD' | 'OTHER';
    proofReference: string | null;
    receivedAt: Date | null;
    createdAt: Date;
  }>;
  balance: {
    engagements: EngagementBalance[];
    pendingQuotes: PendingQuoteBalance[];
    byCurrency: CurrencyRollup[];
  };
  /** Stage B Wave 3 — non-archived engagement statuses feeding the derived
   *  progress status (In progress / Completed). Separate from
   *  balance.engagements, which deliberately keeps archived rows for the
   *  billing history. */
  engagementStatuses: Array<{
    status: 'REQUESTED' | 'PENDING_PAYMENT' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
  }>;
  timeline: ClientTimelineItem[];
  nextAction: ClientNextAction | null;
  canVerifyPayments: boolean;
  /** Service catalog + currencies for the inline quote composer. Loaded
   *  once per workspace fetch so the dialog can render without a
   *  secondary round-trip. */
  services: InvoiceableService[];
  currencies: Array<Pick<Currency, 'code' | 'name' | 'symbol'>>;
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

  // Perf (owner's navigation-lag fix): this function used to await its
  // ~15 queries one after another. On localhost that's invisible; behind
  // a real network hop to the database (Vercel) every await adds a full
  // round-trip, so the workspace cost N x RTT per view. The queries are
  // grouped into dependency waves below — identical rows fetched, same
  // order-sensitive logic, a fraction of the wall time.
  const [personRows, profileRows, leadRows, engagementRows, [services, currencies], perms] =
    await Promise.all([
      db.select().from(persons).where(eq(persons.id, personId)).limit(1),
      db
        .select({
          profile: candidateProfiles,
          occupationName: occupations.name,
          assignedUserName: users.fullName,
        })
        .from(candidateProfiles)
        .leftJoin(occupations, eq(occupations.id, candidateProfiles.primaryOccupationId))
        .leftJoin(users, eq(users.id, candidateProfiles.assignedUserId))
        .where(eq(candidateProfiles.personId, personId))
        .limit(1),
      db
        .select({
          id: leads.id,
          status: leads.status,
          targetBusiness: leads.targetBusiness,
          createdAt: leads.createdAt,
          acceptedAt: leads.acceptedAt,
        })
        .from(leads)
        .where(eq(leads.personId, personId))
        .orderBy(desc(leads.createdAt)),
      db
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
        ),
      Promise.all([fetchInvoiceableServicesFor('PERSON'), fetchCurrencies()]),
      loadCurrentUserPermissions(),
    ]);
  const [person] = personRows;
  if (!person) return null;
  const [profileRow] = profileRows;
  const candidateProfile = profileRow?.profile ?? null;
  const assignedUserName = profileRow?.assignedUserName ?? null;

  const leadIds = leadRows.map((l) => l.id);

  // Stage 6D Wave 3 — invoices visible to this client's workspace.
  // The query combines two routes so no historical row is missed:
  //   (a) invoices on an engagement where this person is payer or
  //       beneficiary (the ordinary CS / Immigration flow);
  //   (b) invoices where this person is the DIRECT payer regardless of
  //       whether the engagement names them (covers direct generate +
  //       onboarding + legacy flows that didn't link via engagement).
  // Each row carries payerPersonId + payerEmployerId so we can
  // tag liability below and the UI never confuses an employer's
  // obligation with the client's.
  const engagementIds = engagementRows.map((e) => e.id);
  const invoiceWhereClauses: SQL[] = [eq(invoices.payerPersonId, personId)];
  if (engagementIds.length > 0) {
    invoiceWhereClauses.push(inArray(invoices.serviceEngagementId, engagementIds));
  }
  const [invoiceRawRows, paymentRows, pfRows, personOccRows] = await Promise.all([
    db
      .select({
        id: invoices.id,
        number: invoices.number,
        status: invoices.status,
        settlementKind: invoices.settlementKind,
        totalAmount: invoices.totalAmount,
        currencyCode: invoices.currencyCode,
        issuedAt: invoices.issuedAt,
        serviceEngagementId: invoices.serviceEngagementId,
        payerPersonId: invoices.payerPersonId,
        payerEmployerId: invoices.payerEmployerId,
      })
      .from(invoices)
      .where(or(...invoiceWhereClauses))
      .orderBy(desc(invoices.issuedAt)),
    engagementIds.length > 0
      ? db
          .select({
            id: payments.id,
            serviceEngagementId: payments.serviceEngagementId,
            proFormaInvoiceId: payments.proFormaInvoiceId,
            amount: payments.amount,
            currencyCode: payments.currencyCode,
            status: payments.status,
            method: payments.method,
            proofReference: payments.proofReference,
            receivedAt: payments.receivedAt,
            createdAt: payments.createdAt,
          })
          .from(payments)
          .where(inArray(payments.serviceEngagementId, engagementIds))
          .orderBy(desc(payments.createdAt))
      : Promise.resolve([]),
    // Pro-formas on any of this person's leads.
    leadIds.length > 0
      ? db
          .select({
            id: proFormaInvoices.id,
            number: proFormaInvoices.number,
            status: proFormaInvoices.status,
            sourceLeadId: proFormaInvoices.sourceLeadId,
            proposalGroupId: proFormaInvoices.proposalGroupId,
            currencyCode: proFormaInvoices.currencyCode,
            subtotal: proFormaInvoices.subtotal,
            revision: proFormaInvoices.revision,
            issuedAt: proFormaInvoices.issuedAt,
            acceptedAt: proFormaInvoices.acceptedAt,
            paymentTerms: proFormaInvoices.paymentTerms,
            notes: proFormaInvoices.notes,
          })
          .from(proFormaInvoices)
          .where(inArray(proFormaInvoices.sourceLeadId, leadIds))
          .orderBy(desc(proFormaInvoices.createdAt))
      : Promise.resolve([]),
    // Person-level occupation fallback — the header falls back to it so
    // a lead-stage client still shows a role.
    person.primaryOccupationId
      ? db
          .select({ name: occupations.name })
          .from(occupations)
          .where(eq(occupations.id, person.primaryOccupationId))
          .limit(1)
      : Promise.resolve([]),
  ]);
  // Dedupe (an invoice can satisfy both legs of the OR); keep the first.
  const invoiceRows = Array.from(new Map(invoiceRawRows.map((r) => [r.id, r])).values());
  const occupationName = profileRow?.occupationName ?? personOccRows[0]?.name ?? null;
  const pfIds = pfRows.map((p) => p.id);

  // Pre-issuance refunds against those payments. Post-issuance refunds
  // (via credit note) also exist in the `refunds` table — included so
  // the engagement balance reflects both kinds.
  const paymentIds = paymentRows.map((p) => p.id);
  const [preRefunds, postRefunds, pfOfficialRows, lineRows] = await Promise.all([
    paymentIds.length > 0
      ? db
          .select({
            paymentId: proFormaPaymentRefunds.paymentId,
            amount: proFormaPaymentRefunds.amount,
          })
          .from(proFormaPaymentRefunds)
          .where(inArray(proFormaPaymentRefunds.paymentId, paymentIds))
      : Promise.resolve([]),
    paymentIds.length > 0
      ? db
          .select({
            paymentId: refunds.paymentId,
            amount: refunds.amount,
          })
          .from(refunds)
          .where(inArray(refunds.paymentId, paymentIds))
      : Promise.resolve([]),
    // Resolve the engagement each pro-forma eventually produced: a
    // CONVERTED pro-forma maps to official invoices, each carrying a
    // serviceEngagementId.
    pfIds.length > 0
      ? db
          .select({
            proFormaInvoiceId: proFormaOfficialInvoices.proFormaInvoiceId,
            invoiceId: proFormaOfficialInvoices.invoiceId,
          })
          .from(proFormaOfficialInvoices)
          .where(inArray(proFormaOfficialInvoices.proFormaInvoiceId, pfIds))
      : Promise.resolve([]),
    // Pro-forma line items for the inline composer (edit + revise).
    pfIds.length > 0
      ? db
          .select({
            proFormaInvoiceId: proFormaLineItems.proFormaInvoiceId,
            serviceCatalogItemId: proFormaLineItems.serviceCatalogItemId,
            description: proFormaLineItems.description,
            quantity: proFormaLineItems.quantity,
            unitPrice: proFormaLineItems.unitPrice,
            sortOrder: proFormaLineItems.sortOrder,
          })
          .from(proFormaLineItems)
          .where(inArray(proFormaLineItems.proFormaInvoiceId, pfIds))
          .orderBy(proFormaLineItems.sortOrder)
      : Promise.resolve([]),
  ]);
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
    // Stage 6D Wave 3 — tag liability. If an employer is the payer,
    // this invoice is the employer's obligation; the person is only the
    // beneficiary and owes nothing personally. The balance builder uses
    // this flag to keep the per-currency rollups and the "amount owed"
    // chip honest.
    const liability: 'PERSONAL' | 'EMPLOYER_LIABILITY' =
      i.payerEmployerId != null ? 'EMPLOYER_LIABILITY' : 'PERSONAL';
    return {
      id: i.id,
      number: i.number,
      settlementKind: i.settlementKind,
      status: i.status,
      totalAmount: i.totalAmount,
      currencyCode: i.currencyCode,
      issuedAt: i.issuedAt,
      serviceEngagementId: i.serviceEngagementId,
      outstandingAmount: outstanding.toFixed(2),
      liability,
    };
  });

  // Attach engagementId to each pro-forma via the official-invoice join.
  const engagementIdByPf = new Map<string, string>();
  for (const link of pfOfficialRows) {
    const inv = invoiceRows.find((x) => x.id === link.invoiceId);
    if (inv) engagementIdByPf.set(link.proFormaInvoiceId, inv.serviceEngagementId);
  }

  const linesByPf = new Map<
    string,
    Array<{
      serviceCatalogItemId: string;
      description: string;
      quantity: string;
      unitPrice: string;
    }>
  >();
  for (const l of lineRows) {
    const arr = linesByPf.get(l.proFormaInvoiceId) ?? [];
    arr.push({
      serviceCatalogItemId: l.serviceCatalogItemId,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
    });
    linesByPf.set(l.proFormaInvoiceId, arr);
  }

  const proFormasOut = pfRows.map((p) => ({
    ...p,
    engagementId: engagementIdByPf.get(p.id) ?? null,
    lines: linesByPf.get(p.id) ?? [],
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
    // Stage 6D Wave 3 — only PERSONAL-liability invoices feed the
    // "amount owed by this client" rollup. EMPLOYER_LIABILITY rows
    // still render in the Billing tab (operators need to see them) but
    // are tagged and visually separated; summing them into the client's
    // owed total would misrepresent an employer's obligation as the
    // candidate's debt.
    invoices: invoicesOut.filter((i) => i.liability === 'PERSONAL'),
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
  // always carry this via their preset grants. Owners bypass.
  //
  // We use `loadCurrentUserPermissions` (self-lookup, cached per request)
  // rather than `fetchUserPermissionSnapshot` which guards against ad-hoc
  // introspection with `main/admin/manage` and would 403 an ordinary
  // STAFF opening their own workspace page.
  const canVerifyPayments = Boolean(
    perms?.isOwner ||
      (perms && hasPermission(perms.granted, 'candidate_services', 'proformas', 'edit')),
  );

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
    engagementStatuses: engagementRows
      .filter((e) => !e.archivedAt)
      .map((e) => ({ status: e.status })),
    timeline,
    nextAction,
    canVerifyPayments,
    services,
    currencies: currencies.map((c) => ({ code: c.code, name: c.name, symbol: c.symbol })),
  };
}

/**
 * Doc numbers for the post-onboarding "Candidate created" banner
 * (`?just_created=1`): the person's newest invoice and its receipt.
 */
export async function fetchJustCreatedDocNumbers(personId: string): Promise<{
  invoiceNumber: string | null;
  receiptNumber: string | null;
}> {
  await requireInternalStaff();
  const [inv] = await db
    .select({ id: invoices.id, number: invoices.number })
    .from(invoices)
    .where(eq(invoices.payerPersonId, personId))
    .orderBy(desc(invoices.issuedAt))
    .limit(1);
  if (!inv) return { invoiceNumber: null, receiptNumber: null };
  const [rct] = await db
    .select({ number: receipts.number })
    .from(receipts)
    .where(eq(receipts.invoiceId, inv.id))
    .orderBy(desc(receipts.issuedAt))
    .limit(1);
  return { invoiceNumber: inv.number, receiptNumber: rct?.number ?? null };
}
