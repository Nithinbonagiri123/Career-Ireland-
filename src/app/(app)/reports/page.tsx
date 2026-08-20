import { BarChart3, Download } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/session';
import { placementsInPeriod, revenueByCurrencyAndService } from '@/modules/reports/service';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  await requireRole(['ADMIN', 'STAFF']);
  const days = 90;
  const [placementRows, revenueRows] = await Promise.all([
    placementsInPeriod(days),
    revenueByCurrencyAndService(days),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={BarChart3}
          title="Reports"
          description={`Pre-built operational reports over the last ${days} days. Download any as CSV.`}
        />
      </FadeUp>

      <FadeUp delay={0.05} className="mb-8">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Placements ({days} days)</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Every placement created in the window, with status, dates, and salary snapshot.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="rounded-full">
                {placementRows.length} rows
              </Badge>
              <Link
                href={`/api/reports/placements?days=${days}`}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                <Download className="mr-1.5 size-3.5" /> CSV
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {placementRows.length === 0 ? (
              <EmptyState
                title="No placements in the last 90 days"
                description="Placements appear here as staff confirm them."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-4">Candidate</th>
                      <th className="py-2 pr-4">Employer</th>
                      <th className="py-2 pr-4">Requisition</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Start</th>
                      <th className="py-2 pr-4">Salary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {placementRows.slice(0, 20).map((r) => (
                      <tr key={r.placementId} className="border-b last:border-b-0">
                        <td className="py-2 pr-4 font-medium">{r.personName}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{r.employerName}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{r.requisitionTitle}</td>
                        <td className="py-2 pr-4">{r.status.replace(/_/g, ' ')}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{r.startDate ?? '—'}</td>
                        <td className="py-2 pr-4 font-mono">
                          {r.salary ? `${r.salary} ${r.currency ?? ''}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {placementRows.length > 20 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Showing first 20 · download CSV for the full {placementRows.length} rows.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </FadeUp>

      <FadeUp delay={0.1}>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">
                Revenue by currency & service ({days} days)
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Verified payments only. No FX conversion — each currency reported separately.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="rounded-full">
                {revenueRows.length} groups
              </Badge>
              <Link
                href={`/api/reports/revenue?days=${days}`}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                <Download className="mr-1.5 size-3.5" /> CSV
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {revenueRows.length === 0 ? (
              <EmptyState
                title="No verified payments in the last 90 days"
                description="Revenue appears once payments are recorded and verified."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-4">Currency</th>
                      <th className="py-2 pr-4">Service</th>
                      <th className="py-2 pr-4">Payments</th>
                      <th className="py-2 pr-4">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenueRows.map((r) => (
                      <tr
                        key={`${r.currency}-${r.serviceCode}`}
                        className="border-b last:border-b-0"
                      >
                        <td className="py-2 pr-4 font-mono">{r.currency}</td>
                        <td className="py-2 pr-4">{r.serviceName}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{r.paymentCount}</td>
                        <td className="py-2 pr-4 font-mono font-semibold">
                          {r.totalAmount} {r.currency}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </FadeUp>
    </div>
  );
}
