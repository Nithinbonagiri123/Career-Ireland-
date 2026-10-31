import { ArrowRight, FileClock } from 'lucide-react';
import Link from 'next/link';
import {
  DsActionsTh,
  DsTable,
  DsTBody,
  DsTd,
  DsTHead,
  DsTh,
  DsTr,
} from '@/components/ds/data-table';
import { EVENT_STATUSES, FinanceStatusPill, financeStatus } from '@/components/ds/finance-status';
import { DS_PILL } from '@/components/ds/tones';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { buttonVariants } from '@/components/ui/button';
import { requirePermission } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { fetchFinancialEvents } from '@/modules/accounting/read';
import { ACC_CRUMBS, ACC_PAGE, formatStamp } from '../accounting-ui';

export const dynamic = 'force-dynamic';

const LIST_LIMIT = 200;

/**
 * Financial events — the outbox view. Each finance action (invoice,
 * payment, credit note, bill) emits an event; the drain turns it into a
 * balanced journal. Failed events need someone to look at them.
 */
export default async function FinancialEventsPage() {
  await requirePermission('main', 'accounting', 'view');
  const events = await fetchFinancialEvents(LIST_LIMIT);
  const capped = events.length >= LIST_LIMIT;

  const counts = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.status] = (acc[e.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className={ACC_PAGE}>
      <FadeUp>
        <PageHeader
          icon={FileClock}
          iconTone="purple"
          title="Financial events"
          description={`Events emitted by invoices, payments, credit notes and bills, and the journal each one produced. ${
            capped
              ? `Showing the latest ${LIST_LIMIT}.`
              : `${events.length} event${events.length === 1 ? '' : 's'}.`
          }`}
          breadcrumbs={[...ACC_CRUMBS, { label: 'Events' }]}
          meta={
            <ul aria-label="Events by status" className="flex flex-wrap items-center gap-2">
              {EVENT_STATUSES.map((s) => {
                const def = financeStatus('event', s);
                return (
                  <li
                    key={s}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
                      DS_PILL[def.tone],
                    )}
                  >
                    {def.label}
                    <span className="font-semibold tabular-nums">{counts[s] ?? 0}</span>
                  </li>
                );
              })}
            </ul>
          }
        />
      </FadeUp>

      <FadeUp delay={0.05}>
        {events.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
            <EmptyState
              icon={FileClock}
              title="No events yet"
              description="Nothing has emitted a financial event yet. Each new invoice, payment, credit note or bill appears here before it is posted to the ledger."
            />
          </div>
        ) : (
          <DsTable
            label="Financial events table"
            caption="Financial events, newest first"
            minWidth={820}
          >
            <DsTHead>
              <tr>
                <DsTh className="w-44">Event</DsTh>
                <DsTh className="w-40">Received</DsTh>
                <DsTh>Source</DsTh>
                <DsTh className="w-32">Status</DsTh>
                <DsTh numeric className="w-16">
                  Tries
                </DsTh>
                <DsActionsTh label="Journal" />
              </tr>
            </DsTHead>
            <DsTBody>
              {events.map((e) => (
                <DsTr key={e.id}>
                  <DsTd className="font-mono text-xs [overflow-wrap:anywhere]">{e.eventType}</DsTd>
                  <DsTd className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                    <time dateTime={e.receivedAt.toISOString()}>{formatStamp(e.receivedAt)}</time>
                  </DsTd>
                  <DsTd>
                    <div className="text-xs">
                      <span className="font-mono text-muted-foreground">{e.sourceEntity}</span>
                      {' · '}
                      <span className="font-mono [overflow-wrap:anywhere]">{e.sourceId}</span>
                    </div>
                    {e.lastError && (
                      <div className="mt-0.5 line-clamp-2 text-xs text-rose-700 dark:text-rose-300">
                        {e.lastError}
                      </div>
                    )}
                  </DsTd>
                  <DsTd>
                    <FinanceStatusPill kind="event" status={e.status} />
                  </DsTd>
                  <DsTd numeric className="text-xs">
                    {e.attemptCount}
                  </DsTd>
                  <DsTd className="py-2 text-right">
                    {e.journalId ? (
                      <Link
                        href={`/admin/accounting/journals/${e.journalId}`}
                        aria-label={`Open journal for ${e.eventType} ${e.sourceEntity} ${e.sourceId.slice(0, 8)}`}
                        className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                      >
                        Journal <ArrowRight className="ml-1.5 size-3.5" aria-hidden />
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </DsTd>
                </DsTr>
              ))}
            </DsTBody>
          </DsTable>
        )}
      </FadeUp>
    </div>
  );
}
