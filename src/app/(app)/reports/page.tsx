import { BarChart3, Download } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/session';
import {
  applicationFunnel,
  placementsInPeriod,
  recruiterActivity,
  requisitionPerformance,
  revenueByCurrencyAndService,
} from '@/modules/reports/service';
import { ReportRangePicker } from './range-picker';

export const dynamic = 'force-dynamic';

const ALLOWED_DAYS = [7, 30, 90, 365];

function parseDays(v: string | undefined): number {
  const parsed = Number.parseInt(v ?? '90', 10);
  return ALLOWED_DAYS.includes(parsed) ? parsed : 90;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireRole(['ADMIN', 'STAFF']);
  const { days: daysParam } = await searchParams;
  const days = parseDays(daysParam);
  const [placementRows, revenueRows, recruiterRows, requisitionPerfRows, funnelRows] =
    await Promise.all([
      placementsInPeriod(days),
      revenueByCurrencyAndService(days),
      recruiterActivity(days),
      requisitionPerformance(days),
      applicationFunnel(days),
    ]);

  const funnelTotal = funnelRows.reduce((sum, r) => sum + r.count, 0);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={BarChart3}
          title="Reports"
          description="Operational reports scoped to the selected time window. Download any as CSV."
          action={<ReportRangePicker currentDays={days} />}
        />
      </FadeUp>

      <FadeUp delay={0.03} className="mb-8">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Application funnel</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                All applications submitted in the last {days} days, by current stage.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="rounded-full">
                {funnelTotal} applications
              </Badge>
              <Link
                href={`/api/reports/application-funnel?days=${days}`}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                <Download className="mr-1.5 size-3.5" /> CSV
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {funnelTotal === 0 ? (
              <EmptyState
                title="No applications in this window"
                description="Applications appear here as they're logged (internal + external)."
              />
            ) : (
              <ul className="space-y-2">
                {funnelRows.map((r) => (
                  <li key={r.stage} className="flex items-center gap-3 text-sm">
                    <span className="w-32 shrink-0 text-muted-foreground">
                      {r.stage.replace(/_/g, ' ')}
                    </span>
                    <div className="relative h-6 flex-1 overflow-hidden rounded-md border bg-muted/30">
                      <div
                        className="absolute inset-y-0 left-0 bg-primary/20"
                        style={{ width: `${r.pctOfApplied}%` }}
                      />
                      <div className="relative flex h-full items-center justify-between px-2 text-xs">
                        <span className="font-medium">{r.count}</span>
                        <span className="text-muted-foreground">{r.pctOfApplied}%</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </FadeUp>

      <FadeUp delay={0.05} className="mb-8">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Recruiter activity</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                What each staff member actually did in the window — sourced from the audit log so it
                counts actions, not just current ownership.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="rounded-full">
                {recruiterRows.length} active
              </Badge>
              <Link
                href={`/api/reports/recruiter-activity?days=${days}`}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                <Download className="mr-1.5 size-3.5" /> CSV
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {recruiterRows.length === 0 ? (
              <EmptyState
                title="No recruiter activity yet"
                description="As staff work in the app, their actions show up here."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-4">Recruiter</th>
                      <th className="py-2 pr-4">Role</th>
                      <th className="py-2 pr-4 text-right">Candidates</th>
                      <th className="py-2 pr-4 text-right">Applications</th>
                      <th className="py-2 pr-4 text-right">Interviews</th>
                      <th className="py-2 pr-4 text-right">Placements</th>
                      <th className="py-2 pr-4 text-right">Total actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recruiterRows.map((r) => (
                      <tr key={r.userId} className="border-b last:border-b-0">
                        <td className="py-2 pr-4 font-medium">{r.fullName}</td>
                        <td className="py-2 pr-4">
                          <Badge variant="outline" className="rounded-full text-[10px]">
                            {r.role}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 text-right font-mono">{r.candidatesAssigned}</td>
                        <td className="py-2 pr-4 text-right font-mono">{r.applicationsCreated}</td>
                        <td className="py-2 pr-4 text-right font-mono">{r.interviewsScheduled}</td>
                        <td className="py-2 pr-4 text-right font-mono">{r.placementsConfirmed}</td>
                        <td className="py-2 pr-4 text-right font-mono font-semibold">
                          {r.totalActions}
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

      <FadeUp delay={0.07} className="mb-8">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Requisition performance</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Every requisition raised in the window with fill rate, applications received, and
                matches scored.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="rounded-full">
                {requisitionPerfRows.length} requisitions
              </Badge>
              <Link
                href={`/api/reports/requisition-performance?days=${days}`}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                <Download className="mr-1.5 size-3.5" /> CSV
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {requisitionPerfRows.length === 0 ? (
              <EmptyState
                title="No requisitions raised in this window"
                description="Create a requisition to start tracking performance."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-4">Requisition</th>
                      <th className="py-2 pr-4">Employer</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4 text-right">Fill</th>
                      <th className="py-2 pr-4 text-right">Apps</th>
                      <th className="py-2 pr-4 text-right">Matches</th>
                      <th className="py-2 pr-4 text-right">Age</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requisitionPerfRows.slice(0, 25).map((r) => (
                      <tr key={r.requisitionId} className="border-b last:border-b-0">
                        <td className="py-2 pr-4 font-medium">
                          <Link
                            href={`/requisitions/${r.requisitionId}`}
                            className="hover:underline"
                          >
                            {r.title}
                          </Link>
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">{r.employerName}</td>
                        <td className="py-2 pr-4">
                          <Badge variant="outline" className="rounded-full text-[10px]">
                            {r.status.replace(/_/g, ' ')}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 text-right font-mono">
                          {r.positionsFilled}/{r.positionsRequired}
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            ({r.fillRatePct}%)
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-right font-mono">{r.applications}</td>
                        <td className="py-2 pr-4 text-right font-mono">{r.matches}</td>
                        <td className="py-2 pr-4 text-right font-mono text-muted-foreground">
                          {r.ageDays}d
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {requisitionPerfRows.length > 25 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Showing first 25 · download CSV for the full {requisitionPerfRows.length} rows.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </FadeUp>

      <FadeUp delay={0.1} className="mb-8">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Placements</CardTitle>
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
                title="No placements in this window"
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

      <FadeUp delay={0.12}>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Revenue by currency &amp; service</CardTitle>
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
                title="No verified payments in this window"
                description="Revenue appears once payments are recorded and verified."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-4">Currency</th>
                      <th className="py-2 pr-4">Service</th>
                      <th className="py-2 pr-4 text-right">Payments</th>
                      <th className="py-2 pr-4 text-right">Total</th>
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
                        <td className="py-2 pr-4 text-right font-mono">{r.paymentCount}</td>
                        <td className="py-2 pr-4 text-right font-mono font-semibold">
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
