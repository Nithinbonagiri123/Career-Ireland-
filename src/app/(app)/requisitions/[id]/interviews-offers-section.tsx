import { CalendarClock, Handshake } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { Timestamp } from '@/components/timestamp';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { statusTone } from '@/lib/ui/status-tone';
import type {
  RequisitionInterviewRow,
  RequisitionOfferRow,
} from '@/modules/requisitions/workspace';

/**
 * R2 — Interviews & offers recorded for this job. Strictly read-only:
 * no scheduling, editing or sending happens here (that is a later
 * recruitment phase). Candidates still move through the Interview and
 * Offer stages on the Pipeline tab exactly as before.
 */
export function InterviewsOffersSection({
  interviews,
  offers,
}: {
  interviews: RequisitionInterviewRow[];
  offers: RequisitionOfferRow[];
}) {
  return (
    <div className="space-y-6" data-testid="interviews-offers">
      <p className="text-xs text-muted-foreground">
        Read-only record. Move candidates between stages on the Pipeline tab.
      </p>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
            Interviews
            <Badge variant="secondary" className="ml-1 rounded-full text-[10px]">
              {interviews.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {interviews.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No interviews recorded"
              description="Interview records for this job's applicants will appear here."
            />
          ) : (
            <ul className="divide-y rounded-md border">
              {interviews.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/clients/${i.personId}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {i.personName}
                    </Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                      <span>Round {i.round}</span>
                      <span>{i.mode.replace(/_/g, ' ').toLowerCase()}</span>
                      {i.durationMinutes ? <span>{i.durationMinutes} min</span> : null}
                      {i.location ? <span>{i.location}</span> : null}
                      {i.scheduledByName ? <span>by {i.scheduledByName}</span> : null}
                    </p>
                  </div>
                  <Timestamp date={i.scheduledAt} absoluteOnly />
                  <Badge variant={statusTone(i.status)} className="rounded-full text-[10px]">
                    {i.status.replace(/_/g, ' ')}
                  </Badge>
                  {i.outcome && (
                    <Badge variant="outline" className="rounded-full text-[10px]">
                      {i.outcome}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Handshake className="size-4 text-muted-foreground" aria-hidden />
            Offers
            <Badge variant="secondary" className="ml-1 rounded-full text-[10px]">
              {offers.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {offers.length === 0 ? (
            <EmptyState
              icon={Handshake}
              title="No offers recorded"
              description="Offer records for this job's applicants will appear here."
            />
          ) : (
            <ul className="divide-y rounded-md border">
              {offers.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/clients/${o.personId}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {o.personName}
                    </Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                      <span className="tabular-nums">
                        {o.amount} {o.currencyCode} / {o.period.toLowerCase()}
                      </span>
                      {o.startDate ? <span>starts {o.startDate}</span> : null}
                      {o.expiresOn ? <span>expires {o.expiresOn}</span> : null}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    Created <Timestamp date={o.createdAt} absoluteOnly />
                  </span>
                  <Badge variant={statusTone(o.status)} className="rounded-full text-[10px]">
                    {o.status.replace(/_/g, ' ')}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
