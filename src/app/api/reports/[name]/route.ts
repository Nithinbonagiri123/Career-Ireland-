import { NextResponse } from 'next/server';
import { requireInternalStaff } from '@/lib/auth/session';
import { toCsv } from '@/lib/csv';
import {
  applicationFunnel,
  placementsInPeriod,
  recruiterActivity,
  requisitionPerformance,
  revenueByCurrencyAndService,
} from '@/modules/reports/service';

function csvResponse(name: string, csv: string, days: number) {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}-${days}d.csv"`,
    },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  await requireInternalStaff();
  const { name } = await params;
  const url = new URL(request.url);
  const days = Number.parseInt(url.searchParams.get('days') ?? '90', 10);

  if (name === 'placements') {
    const rows = await placementsInPeriod(days);
    const csv = toCsv(rows, [
      { key: 'placementId', header: 'Placement ID' },
      { key: 'personName', header: 'Candidate' },
      { key: 'employerName', header: 'Employer' },
      { key: 'requisitionTitle', header: 'Requisition' },
      { key: 'status', header: 'Status' },
      { key: 'offerDate', header: 'Offer date' },
      { key: 'startDate', header: 'Start date' },
      { key: 'endDate', header: 'End date' },
      { key: 'salary', header: 'Salary' },
      { key: 'currency', header: 'Currency' },
      { key: 'createdAt', header: 'Created at' },
    ]);
    return csvResponse('placements', csv, days);
  }

  if (name === 'revenue') {
    const rows = await revenueByCurrencyAndService(days);
    const csv = toCsv(rows, [
      { key: 'currency', header: 'Currency' },
      { key: 'serviceCode', header: 'Service code' },
      { key: 'serviceName', header: 'Service' },
      { key: 'paymentCount', header: 'Payments' },
      { key: 'totalAmount', header: 'Total amount' },
    ]);
    return csvResponse('revenue', csv, days);
  }

  if (name === 'recruiter-activity') {
    const rows = await recruiterActivity(days);
    const csv = toCsv(rows, [
      { key: 'userId', header: 'User ID' },
      { key: 'fullName', header: 'Recruiter' },
      { key: 'role', header: 'Role' },
      { key: 'candidatesAssigned', header: 'Candidates assigned' },
      { key: 'applicationsCreated', header: 'Applications created' },
      { key: 'interviewsScheduled', header: 'Interviews scheduled' },
      { key: 'placementsConfirmed', header: 'Placements confirmed' },
      { key: 'totalActions', header: 'Total actions' },
    ]);
    return csvResponse('recruiter-activity', csv, days);
  }

  if (name === 'requisition-performance') {
    const rows = await requisitionPerformance(days);
    const csv = toCsv(rows, [
      { key: 'requisitionId', header: 'Requisition ID' },
      { key: 'title', header: 'Title' },
      { key: 'employerName', header: 'Employer' },
      { key: 'status', header: 'Status' },
      { key: 'positionsRequired', header: 'Required' },
      { key: 'positionsFilled', header: 'Filled' },
      { key: 'fillRatePct', header: 'Fill %' },
      { key: 'applications', header: 'Applications' },
      { key: 'matches', header: 'Matches' },
      { key: 'ageDays', header: 'Age (days)' },
      { key: 'createdAt', header: 'Created at' },
    ]);
    return csvResponse('requisition-performance', csv, days);
  }

  if (name === 'application-funnel') {
    const rows = await applicationFunnel(days);
    const csv = toCsv(rows, [
      { key: 'stage', header: 'Stage' },
      { key: 'count', header: 'Count' },
      { key: 'pctOfApplied', header: '% of total' },
    ]);
    return csvResponse('application-funnel', csv, days);
  }

  return NextResponse.json({ ok: false, error: 'unknown report' }, { status: 404 });
}
