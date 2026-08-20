import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/session';
import { toCsv } from '@/lib/csv';
import { placementsInPeriod, revenueByCurrencyAndService } from '@/modules/reports/service';

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  await requireRole(['ADMIN', 'STAFF']);
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
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="placements-${days}d.csv"`,
      },
    });
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
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="revenue-${days}d.csv"`,
      },
    });
  }

  return NextResponse.json({ ok: false, error: 'unknown report' }, { status: 404 });
}
