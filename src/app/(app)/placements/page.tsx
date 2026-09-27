import { AlertTriangle, ArrowRight, Trophy, User } from 'lucide-react';
import Link from 'next/link';
import { CsvExportButton } from '@/components/csv-export-button';
import { DateRangeFilter } from '@/components/date-range-filter';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Timestamp } from '@/components/timestamp';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requirePermission } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import { fetchPlacements, listApplicationsAwaitingPlacement } from '@/modules/placements/service';
import { PlacementsTable } from './placements-table';

export const dynamic = 'force-dynamic';

export default async function PlacementsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; from?: string; to?: string }>;
}) {
  await requirePermission('recruitment', 'placements', 'view');
  const { created, from, to } = await searchParams;
  const createdRange = parseDateRangeParams({ created, from, to });
  const [placements, awaitingApps] = await Promise.all([
    fetchPlacements(createdRange),
    listApplicationsAwaitingPlacement(),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Trophy}
          iconTone="green"
          title="Placements"
          description="Successful Candidate ↔ Employer outcomes. Confirming a placement immediately flips candidate availability to PLACED and advances the requisition's fill count."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <DateRangeFilter />
              <CsvExportButton href="/api/export/placements" />
            </div>
          }
        />
      </FadeUp>
      {awaitingApps.length > 0 && (
        <FadeUp delay={0.04}>
          <Card className="border-status-warning/30 bg-status-warning/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="size-4 text-status-warning" />
                {awaitingApps.length} waiting to be confirmed as a placement
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                These applications were marked ACCEPTED on the pipeline (the candidate accepted the
                offer) but no placement record was created — so the candidate isn't yet flipped to
                PLACED and this requisition's fill count hasn't advanced. Open the application to
                confirm the placement details.
              </p>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-status-warning/20">
                {awaitingApps.map((a) => (
                  <li key={a.applicationId} className="flex items-center gap-3 py-2 first:pt-0">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-status-warning/15 text-status-warning">
                      <User className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {a.candidateName}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {a.requisitionTitle ?? 'Requisition'}
                        {a.employerName ? ` · ${a.employerName}` : ''}
                      </p>
                    </div>
                    <div className="hidden shrink-0 text-right sm:block">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Accepted
                      </p>
                      <Timestamp date={a.acceptedAt} absoluteOnly />
                    </div>
                    <Link
                      href={`/applications/${a.applicationId}`}
                      className="inline-flex items-center gap-1 rounded-md border border-status-warning/40 bg-background px-2.5 py-1 text-xs font-medium text-status-warning transition-colors hover:bg-status-warning/10"
                    >
                      Confirm placement <ArrowRight className="size-3" />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </FadeUp>
      )}
      <FadeUp delay={0.05}>
        <PlacementsTable placements={placements} />
      </FadeUp>
    </div>
  );
}
