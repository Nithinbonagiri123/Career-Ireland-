import { format, formatDistanceToNow } from 'date-fns';
import { ArrowRight, FileClock } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { requirePermission } from '@/lib/auth/session';
import { statusTone } from '@/lib/ui/status-tone';
import { fetchFinancialEvents } from '@/modules/accounting/read';

export const dynamic = 'force-dynamic';

/**
 * Financial events dashboard — the outbox view. Phase 1 only shows the
 * list; the Phase 2 worker that turns RECEIVED events into balanced
 * journals is a separate ticket. Admins can see at a glance which
 * events are stuck in RECEIVED (worker idle), PROCESSING (worker busy),
 * FAILED (needs intervention), or PROCESSED (already journaled).
 */
export default async function FinancialEventsPage() {
  await requirePermission('main', 'accounting', 'view');
  const events = await fetchFinancialEvents(200);

  const counts = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.status] = (acc[e.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={FileClock}
          badge="Accounting"
          title="Financial events"
          description="Outbox of events emitted by the operational system (invoices, payments, credit notes). Phase 1 shows the queue; Phase 2 adds the worker that turns each event into a balanced journal."
          breadcrumbs={[
            { label: 'Admin', href: '/admin' },
            { label: 'Accounting', href: '/admin/accounting' },
            { label: 'Events' },
          ]}
          meta={
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
              {['RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'MANUAL_REVIEW'].map((s) => (
                <Badge key={s} variant={statusTone(s)} className="rounded-full">
                  {s} · {counts[s] ?? 0}
                </Badge>
              ))}
            </div>
          }
        />
      </FadeUp>

      <FadeUp delay={0.05} className="mt-6">
        <Card>
          <CardContent className="pt-5">
            {events.length === 0 ? (
              <EmptyState
                icon={FileClock}
                title="No events yet"
                description="Nothing has emitted a financial event. Once Phase 2 wires the existing invoice / payment / credit-note actions into emitFinancialEvent, each new finance action appears here before the worker consumes it."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">Event</TableHead>
                    <TableHead className="w-36">Received</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="w-16 text-right">Tries</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>
                        <div className="font-mono text-xs">{e.eventType}</div>
                      </TableCell>
                      <TableCell>
                        <time
                          dateTime={e.receivedAt.toISOString()}
                          className="text-xs text-muted-foreground"
                          title={format(e.receivedAt, 'd MMM yyyy · HH:mm:ss')}
                        >
                          {formatDistanceToNow(e.receivedAt, { addSuffix: true })}
                        </time>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <span className="font-mono text-xs text-muted-foreground">
                            {e.sourceEntity}
                          </span>{' '}
                          · <span className="font-mono text-xs">{e.sourceId}</span>
                        </div>
                        {e.lastError && (
                          <div className="mt-0.5 line-clamp-1 text-xs text-destructive">
                            {e.lastError}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={statusTone(e.status)}
                          className="rounded-full text-[10px]"
                        >
                          {e.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {e.attemptCount}
                      </TableCell>
                      <TableCell className="text-right">
                        {e.journalId ? (
                          <Link
                            href={`/admin/accounting/journals/${e.journalId}`}
                            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                          >
                            Journal <ArrowRight className="ml-1.5 size-3.5" />
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </FadeUp>
    </div>
  );
}
