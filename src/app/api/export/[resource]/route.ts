import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/session';
import { toCsv } from '@/lib/csv';
import { listCandidates } from '@/modules/candidates/repository';
import { fetchPayments } from '@/modules/commerce/service';
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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ resource: string }> },
) {
  await requireRole(['ADMIN', 'STAFF']);
  const { resource } = await params;

  if (resource === 'candidates') {
    const rows = await listCandidates();
    return csvResponse(
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
    return csvResponse(
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
    return csvResponse(
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
    return csvResponse(
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
    return csvResponse(
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
    return csvResponse(
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
    return csvResponse(
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
    return csvResponse(
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

  return NextResponse.json({ ok: false, error: 'unknown resource' }, { status: 404 });
}
