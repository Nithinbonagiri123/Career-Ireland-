import { ArrowRight, FileText, Trophy, User } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { Timestamp } from '@/components/timestamp';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { statusTone } from '@/lib/ui/status-tone';
import type { PlacementListRow } from '@/modules/placements/service';

/**
 * Requisition-scoped placements + their fee invoices in one glance.
 * Server component — pure props, no state. Each placement row shows:
 *
 *  - candidate + salary
 *  - placement status
 *  - either the raised fee invoice (number + status + total) or a
 *    "Raise fee →" link straight to the raise-invoice flow on the
 *    employer profile with the placement + requisition pre-linked
 *
 * The requisition detail page's existing "Billing for this requisition"
 * card shows any invoices raised at the requisition level; this
 * section is the per-placement complement so a two-hire requisition
 * can't have one fee hidden inside the requisition-level total.
 */
export function PlacementsFeesSection({ placements }: { placements: PlacementListRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="size-4 text-muted-foreground" />
          Placements & fees
          <Badge variant="secondary" className="ml-1 rounded-full text-[10px]">
            {placements.length}
          </Badge>
        </CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          One row per confirmed placement, with the fee invoice tied to it via
          <span className="mx-1 font-mono">invoices.placement_id</span>. Raise a fee from any row
          that hasn't been billed yet.
        </p>
      </CardHeader>
      <CardContent>
        {placements.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="No placements confirmed yet"
            description="Advance a candidate through Offer → Placed on the Pipeline tab and they'll appear here with the fee status."
          />
        ) : (
          <ul className="divide-y rounded-md border">
            {placements.map((p) => {
              const inv = p.latestInvoice;
              return (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted">
                    <User className="size-4 text-muted-foreground" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/candidates/${p.personId}`}
                      className="block truncate text-sm font-medium text-foreground hover:underline"
                    >
                      {p.personName}
                    </Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                      <Badge variant={statusTone(p.status)} className="rounded-full text-[10px]">
                        {p.status.replace(/_/g, ' ')}
                      </Badge>
                      {p.salary && (
                        <span className="tabular-nums">
                          {p.salary} {p.salaryCurrencyCode ?? ''}
                        </span>
                      )}
                      {p.startDate && <span>starts {p.startDate}</span>}
                    </p>
                  </div>
                  <div className="hidden shrink-0 text-right sm:block">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Placed
                    </p>
                    <Timestamp date={p.createdAt} absoluteOnly />
                  </div>
                  <div className="shrink-0">
                    {inv ? (
                      <Link
                        href={`/employers/${p.employerId}/invoices/${inv.number}`}
                        className="flex flex-col items-end text-right transition-colors hover:text-foreground"
                      >
                        <span className="flex items-center gap-1.5">
                          <FileText className="size-3 text-muted-foreground" />
                          <span className="font-mono text-xs">{inv.number}</span>
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5">
                          <Badge
                            variant={statusTone(inv.status)}
                            className="rounded-full text-[9px]"
                          >
                            {inv.status.replace(/_/g, ' ')}
                          </Badge>
                          <span className="tabular-nums text-[10px] text-muted-foreground">
                            {inv.totalAmount} {inv.currencyCode}
                          </span>
                        </span>
                      </Link>
                    ) : (
                      <Link
                        href={`/employers/${p.employerId}?raisePlacement=${p.id}&raiseRequisition=${p.jobRequisitionId}`}
                        className="inline-flex items-center gap-1 rounded-md border border-status-warning/40 bg-background px-2 py-1 text-[11px] font-medium text-status-warning transition-colors hover:bg-status-warning/10"
                      >
                        Raise fee <ArrowRight className="size-3" />
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
