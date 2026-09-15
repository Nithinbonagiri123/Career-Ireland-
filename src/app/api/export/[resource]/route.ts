import { NextResponse } from 'next/server';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireInternalStaff, type Session } from '@/lib/auth/session';
import { toCsv } from '@/lib/csv';
import { db } from '@/lib/db/client';
import { listCandidates } from '@/modules/candidates/repository';
import { fetchPayments } from '@/modules/commerce/service';
import { fetchDashboardRevenue } from '@/modules/dashboard/revenue';
import { fetchEmployers } from '@/modules/employers/service';
import { fetchCases } from '@/modules/immigration/service';
import { fetchLeads } from '@/modules/leads/service';
import { fetchPersons } from '@/modules/persons/service';
import { fetchPlacements } from '@/modules/placements/service';
import { fetchRequisitions } from '@/modules/requisitions/service';

function csvResponse(csv: string, filename: string) {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

/**
 * Wrap `csvResponse` with an audit event so exports leave a trace on
 * the owner's audit log. Bulk data leaving the app is exactly the kind
 * of thing an owner needs to see after the fact.
 */
async function auditedCsvResponse(
  session: Session,
  resource: string,
  rowCount: number,
  csv: string,
  filename: string,
): Promise<Response> {
  await recordAudit(db, {
    actorUserId: session.user.id,
    entityType: 'data_export',
    entityId: session.user.id,
    action: 'EXPORTED',
    context: { resource, rowCount, filename, format: 'csv' },
  });
  return csvResponse(csv, filename);
}

export async function GET(request: Request, { params }: { params: Promise<{ resource: string }> }) {
  const session = await requireInternalStaff();
  const { resource } = await params;

  if (resource === 'candidates') {
    const rows = await listCandidates();
    return auditedCsvResponse(
      session,
      resource,
      rows.length,
      toCsv(rows, [
        { key: 'fullName', header: 'Name' },
        { key: 'email', header: 'Email' },
        { key: 'phone', header: 'Phone' },
        { key: 'currentCity', header: 'City' },
        { key: 'lifecycleStatus', header: 'Lifecycle' },
        { key: 'availabilityStatus', header: 'Availability' },
        { key: 'activatedAt', header: 'Activated at' },
      ]),
      'candidates.csv',
    );
  }

  if (resource === 'employers') {
    const rows = await fetchEmployers();
    return auditedCsvResponse(
      session,
      resource,
      rows.length,
      toCsv(rows, [
        { key: 'legalName', header: 'Legal name' },
        { key: 'tradingName', header: 'Trading name' },
        { key: 'industry', header: 'Industry' },
        { key: 'country', header: 'Country' },
        { key: 'city', header: 'City' },
        { key: 'relationshipStatus', header: 'Status' },
        { key: 'website', header: 'Website' },
        { key: 'createdAt', header: 'Added' },
      ]),
      'employers.csv',
    );
  }

  if (resource === 'requisitions') {
    const rows = await fetchRequisitions();
    return auditedCsvResponse(
      session,
      resource,
      rows.length,
      toCsv(rows, [
        { key: 'title', header: 'Title' },
        { key: 'employerName', header: 'Employer' },
        { key: 'positionsRequired', header: 'Positions required' },
        { key: 'positionsFilled', header: 'Positions filled' },
        { key: 'employmentType', header: 'Type' },
        { key: 'location', header: 'Location' },
        { key: 'status', header: 'Status' },
        { key: 'createdAt', header: 'Created' },
      ]),
      'requisitions.csv',
    );
  }

  if (resource === 'placements') {
    const rows = await fetchPlacements();
    return auditedCsvResponse(
      session,
      resource,
      rows.length,
      toCsv(rows, [
        { key: 'personName', header: 'Candidate' },
        { key: 'employerName', header: 'Employer' },
        { key: 'requisitionTitle', header: 'Requisition' },
        { key: 'status', header: 'Status' },
        { key: 'offerDate', header: 'Offer date' },
        { key: 'startDate', header: 'Start date' },
        { key: 'endDate', header: 'End date' },
        { key: 'salary', header: 'Salary' },
        { key: 'salaryCurrencyCode', header: 'Currency' },
        { key: 'createdAt', header: 'Created' },
      ]),
      'placements.csv',
    );
  }

  if (resource === 'payments') {
    const rows = await fetchPayments();
    return auditedCsvResponse(
      session,
      resource,
      rows.length,
      toCsv(rows, [
        { key: 'serviceName', header: 'Service' },
        { key: 'amount', header: 'Amount' },
        { key: 'currencyCode', header: 'Currency' },
        { key: 'method', header: 'Method' },
        { key: 'status', header: 'Status' },
        { key: 'proofReference', header: 'Proof reference' },
        { key: 'verifiedAt', header: 'Verified at' },
        { key: 'createdAt', header: 'Created' },
      ]),
      'payments.csv',
    );
  }

  if (resource === 'leads') {
    const rows = await fetchLeads();
    return auditedCsvResponse(
      session,
      resource,
      rows.length,
      toCsv(rows, [
        { key: 'personName', header: 'Person' },
        { key: 'personEmail', header: 'Email' },
        { key: 'personPhone', header: 'Phone' },
        { key: 'status', header: 'Status' },
        { key: 'assignedUserName', header: 'Assigned' },
        { key: 'createdAt', header: 'Created' },
        { key: 'convertedAt', header: 'Converted' },
      ]),
      'leads.csv',
    );
  }

  if (resource === 'immigration') {
    const rows = await fetchCases();
    return auditedCsvResponse(
      session,
      resource,
      rows.length,
      toCsv(rows, [
        { key: 'caseType', header: 'Type' },
        { key: 'beneficiaryName', header: 'Beneficiary' },
        { key: 'sponsorName', header: 'Sponsor' },
        { key: 'status', header: 'Status' },
        { key: 'authorityReference', header: 'Authority ref' },
        { key: 'submittedAt', header: 'Submitted' },
        { key: 'decisionAt', header: 'Decision' },
        { key: 'expiresOn', header: 'Expires' },
      ]),
      'immigration-cases.csv',
    );
  }

  if (resource === 'persons') {
    const rows = await fetchPersons();
    return auditedCsvResponse(
      session,
      resource,
      rows.length,
      toCsv(rows, [
        { key: 'firstName', header: 'First name' },
        { key: 'lastName', header: 'Last name' },
        { key: 'email', header: 'Email' },
        { key: 'phone', header: 'Phone' },
        { key: 'nationality', header: 'Nationality' },
        { key: 'currentCity', header: 'City' },
        { key: 'currentCountry', header: 'Country' },
        { key: 'source', header: 'Source' },
        { key: 'createdAt', header: 'Created' },
      ]),
      'persons.csv',
    );
  }

  if (resource === 'revenue-services') {
    // Same URL contract as the dashboard section — `from`/`to` are the
    // ISO date strings the DateRangeFilter writes. If omitted, the
    // aggregator defaults to MTD, matching what the user sees on-page.
    const url = new URL(request.url);
    const range = readRevenueRange(url);
    const data = await fetchDashboardRevenue(range);
    const rows = data.services.map((r) => ({
      service: r.serviceName,
      code: r.serviceCode,
      stream: STREAM_LABELS[r.source],
      currency: r.currencyCode,
      payments: r.count,
      total: r.total.toFixed(2),
    }));
    const from = data.range.from.toISOString().slice(0, 10);
    const to = data.range.to.toISOString().slice(0, 10);
    return auditedCsvResponse(
      session,
      resource,
      rows.length,
      toCsv(rows, [
        { key: 'service', header: 'Service' },
        { key: 'code', header: 'Code' },
        { key: 'stream', header: 'Stream' },
        { key: 'currency', header: 'Currency' },
        { key: 'payments', header: 'Payments' },
        { key: 'total', header: 'Total' },
      ]),
      `revenue-services_${from}_${to}.csv`,
    );
  }

  return NextResponse.json({ ok: false, error: 'unknown resource' }, { status: 404 });
}

const STREAM_LABELS = {
  candidate_services: 'Candidate services',
  placements: 'Placements',
  immigration: 'Immigration',
} as const;

/**
 * Parse the shared `from`/`to` query params into Dates. Anything malformed
 * is silently dropped so callers hit the MTD default in the aggregator.
 */
function readRevenueRange(url: URL): { from?: Date; to?: Date } {
  const raw = { from: url.searchParams.get('from'), to: url.searchParams.get('to') };
  const out: { from?: Date; to?: Date } = {};
  if (raw.from && /^\d{4}-\d{2}-\d{2}$/.test(raw.from)) {
    const d = new Date(`${raw.from}T00:00:00.000Z`);
    if (!Number.isNaN(d.getTime())) out.from = d;
  }
  if (raw.to && /^\d{4}-\d{2}-\d{2}$/.test(raw.to)) {
    const d = new Date(`${raw.to}T23:59:59.999Z`);
    if (!Number.isNaN(d.getTime())) out.to = d;
  }
  return out;
}
