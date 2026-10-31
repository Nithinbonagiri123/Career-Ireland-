'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { format, formatDistanceToNowStrict } from 'date-fns';
import {
  Archive,
  ArrowRight,
  Building2,
  CalendarDays,
  Clock,
  Coins,
  FileText,
  MoreHorizontal,
  PlaneTakeoff,
  Receipt,
  Trophy,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table/data-table';
import {
  CARD_ACTION,
  CARD_ACTION_TINT,
  EntityCard,
  EntityCardGrid,
  initialsOf,
} from '@/components/ds/entity-card';
import { DsEnumPill } from '@/components/ds/status-pill';
import { EmptyState } from '@/components/empty-state';
import {
  PLACEMENT_OFFER_REQUIRED,
  PlacementExceptionDialog,
} from '@/components/placement-exception-dialog';
import { PromptDialog } from '@/components/prompt-dialog';
import { Timestamp } from '@/components/timestamp';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';
import {
  archivePlacementAction,
  restoreCandidateAvailabilityAction,
  updatePlacementStatusAction,
} from '@/modules/placements/actions';
import {
  FINANCE_ISSUES_INVOICES,
  isPlacementFeeRaisable,
  raisePlacementFeeHref,
  salaryPeriodSuffix,
} from '@/modules/placements/fee';
import type { PlacementListRow } from '@/modules/placements/service';

/**
 * Stage 6G placements list — table (default) or cards. Holds the audited
 * status / restore / archive dialogs and the offer-exception dialog, shared
 * by both views through one actions menu.
 */
export function PlacementsList({
  placements,
  canEdit = true,
  canIssueInvoice = false,
  view = 'table',
  filtered = false,
}: {
  placements: PlacementListRow[];
  /** R6 — recruitment.placements edit; status / restore / archive hidden when false. */
  canEdit?: boolean;
  /** P0 — ISSUE finance authority; others see the fee action disabled. */
  canIssueInvoice?: boolean;
  view?: 'table' | 'cards';
  /** True when the list is empty only because of filters. */
  filtered?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<PlacementListRow | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<PlacementListRow | null>(null);
  const [exceptionTarget, setExceptionTarget] = useState<PlacementListRow | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const setStatus = (p: PlacementListRow, next: PlacementListRow['status']) => {
    setBusy(p.id);
    startTransition(async () => {
      const r = await updatePlacementStatusAction({ placementId: p.id, status: next });
      setBusy(null);
      if (r.ok) {
        toast.success(`Placement moved to ${next.replace(/_/g, ' ')}`);
        router.refresh();
      } else if (r.error.code === PLACEMENT_OFFER_REQUIRED) {
        // No offer accepted in the CRM — confirming needs the audited exception.
        setExceptionTarget(p);
      } else toast.error(r.error.message);
    });
  };

  const confirmRestore = (reason: string) => {
    if (!restoreTarget) return;
    const target = restoreTarget;
    setBusy(target.id);
    startTransition(async () => {
      const r = await restoreCandidateAvailabilityAction({
        personId: target.personId,
        reason,
      });
      setBusy(null);
      if (r.ok) {
        toast.success(`${target.personName} is now available again`);
        setRestoreTarget(null);
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });
  };

  const confirmArchive = (reason: string) => {
    if (!archiveTarget) return;
    const target = archiveTarget;
    setBusy(target.id);
    startTransition(async () => {
      const r = await archivePlacementAction({ placementId: target.id, reason });
      setBusy(null);
      if (r.ok) {
        toast.success(`Placement archived`);
        setArchiveTarget(null);
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });
  };

  const menu = (p: PlacementListRow) => (
    <PlacementActionsMenu
      p={p}
      canEdit={canEdit}
      canIssueInvoice={canIssueInvoice}
      busy={busy === p.id}
      onStatus={(next) => setStatus(p, next)}
      onRestore={() => setRestoreTarget(p)}
      onArchive={() => setArchiveTarget(p)}
    />
  );

  const columns: ColumnDef<PlacementListRow>[] = [
    {
      header: 'Candidate',
      accessorKey: 'personName',
      cell: ({ row }) => (
        <div className="flex min-w-0 flex-col">
          <Link
            href={`/candidates/${row.original.personId}`}
            className="truncate text-sm font-medium hover:underline"
          >
            {row.original.personName}
          </Link>
          <span className="truncate text-xs text-muted-foreground">
            {row.original.requisitionTitle} · {row.original.employerName}
          </span>
        </div>
      ),
    },
    {
      header: 'Status',
      accessorKey: 'status',
      size: 150,
      cell: ({ row }) => <DsEnumPill status={row.original.status} />,
    },
    {
      header: 'Fee invoice',
      id: 'latestInvoice',
      size: 190,
      cell: ({ row }) => <InvoiceCell p={row.original} canIssueInvoice={canIssueInvoice} />,
    },
    {
      header: 'Salary',
      id: 'salary',
      size: 140,
      cell: ({ row }) => (
        <span className="text-xs tabular-nums">{salaryLabel(row.original) ?? '—'}</span>
      ),
    },
    {
      header: 'Start',
      accessorKey: 'startDate',
      size: 120,
      cell: ({ row }) => (
        <span className="text-xs">
          {row.original.startDate ? formatStart(row.original.startDate) : '—'}
        </span>
      ),
    },
    {
      header: 'Created',
      accessorKey: 'createdAt',
      size: 170,
      cell: ({ row }) => <Timestamp date={row.original.createdAt} />,
    },
    {
      header: '',
      id: 'actions',
      size: 50,
      cell: ({ row }) => menu(row.original),
    },
  ];

  return (
    <>
      {placements.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
          <EmptyState
            icon={Trophy}
            title={filtered ? 'No placements match these filters' : 'No placements yet'}
            description={
              filtered
                ? 'Clear the filters or pick another status tab.'
                : 'Placements are created when an application is marked Placed or an offer is accepted. Start by opening a requisition.'
            }
            action={
              filtered ? undefined : (
                <Link
                  href="/requisitions"
                  className={buttonVariants({ size: 'sm', variant: 'outline' })}
                >
                  Go to requisitions <ArrowRight className="ml-1.5 size-3.5" />
                </Link>
              )
            }
          />
        </div>
      ) : view === 'cards' ? (
        <EntityCardGrid>
          {placements.map((p) => (
            <PlacementCard key={p.id} p={p} menu={menu(p)} canIssueInvoice={canIssueInvoice} />
          ))}
        </EntityCardGrid>
      ) : (
        <>
          {/* Phones get cards even in table view — seven columns don't fit. */}
          <div className="hidden md:block">
            <DataTable columns={columns} data={placements} />
          </div>
          <div className="md:hidden">
            <EntityCardGrid>
              {placements.map((p) => (
                <PlacementCard key={p.id} p={p} menu={menu(p)} canIssueInvoice={canIssueInvoice} />
              ))}
            </EntityCardGrid>
          </div>
        </>
      )}
      <PromptDialog
        open={restoreTarget !== null}
        onCancel={() => setRestoreTarget(null)}
        onConfirm={confirmRestore}
        title={`Restore ${restoreTarget?.personName ?? ''} to AVAILABLE?`}
        description="Flips availability from PLACED back to AVAILABLE so they can be matched again."
        label="Reason (audited)"
        placeholder="e.g. Placement fell through — candidate available again"
        confirmLabel="Restore"
        pending={busy === restoreTarget?.id}
      />
      <PromptDialog
        open={archiveTarget !== null}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
        title={`Archive placement for ${archiveTarget?.personName ?? ''}?`}
        description="Archived placements are hidden from lists. This does NOT change the candidate's availability — restore that separately if needed."
        label="Reason (audited)"
        placeholder="e.g. Duplicate entry, keying error"
        confirmLabel="Archive"
        confirmVariant="destructive"
        pending={busy === archiveTarget?.id}
      />
      <PlacementExceptionDialog
        open={exceptionTarget !== null}
        onOpenChange={(open) => {
          if (!open) setExceptionTarget(null);
        }}
        personName={exceptionTarget?.personName ?? ''}
        successMessage="Placement moved to CONFIRMED"
        onSubmit={(exception) =>
          updatePlacementStatusAction({
            placementId: exceptionTarget?.id ?? '',
            status: 'CONFIRMED',
            offerException: exception,
          })
        }
        onPlaced={() => router.refresh()}
      />
    </>
  );
}

function salaryLabel(p: PlacementListRow): string | null {
  if (!p.salary) return null;
  const amount = p.salaryCurrencyCode
    ? formatCurrency(p.salary, p.salaryCurrencyCode, { maximumFractionDigits: 0 })
    : p.salary;
  const suffix = salaryPeriodSuffix(p.salaryPeriod);
  return suffix ? `${amount} ${suffix}` : amount;
}

/** `YYYY-MM-DD` (a calendar date, no time zone) → "1 Dec 2026". */
function formatStart(d: string): string {
  return format(new Date(`${d}T00:00:00`), 'd MMM yyyy');
}

/** Fee invoice: number + status pill + total; a "Not invoiced" link only
 *  when a fee is actually raisable (P0); disabled for non-finance users. */
function InvoiceCell({ p, canIssueInvoice }: { p: PlacementListRow; canIssueInvoice: boolean }) {
  const inv = p.latestInvoice;
  if (isPlacementFeeRaisable(p)) {
    if (!canIssueInvoice) {
      return (
        <span className="flex flex-col gap-0.5 text-xs">
          <span className="font-medium text-amber-700 dark:text-amber-300">Not invoiced</span>
          <span className="text-[11px] text-muted-foreground">{FINANCE_ISSUES_INVOICES}</span>
        </span>
      );
    }
    return (
      <Link
        href={raisePlacementFeeHref(p)}
        className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:underline dark:text-amber-300"
      >
        Not invoiced <ArrowRight className="size-3" aria-hidden />
      </Link>
    );
  }
  if (!inv) {
    return <span className="text-xs text-muted-foreground">Not billable yet</span>;
  }
  return (
    <Link
      href={`/employers/${p.employerId}/invoices/${inv.number}`}
      className="flex flex-col gap-0.5 text-left hover:text-foreground"
    >
      <span className="flex items-center gap-1.5">
        <span className="font-mono text-xs">{inv.number}</span>
        <DsEnumPill status={inv.status} />
      </span>
      <span className="text-[11px] tabular-nums text-muted-foreground">
        {formatCurrency(inv.totalAmount, inv.currencyCode)}
      </span>
    </Link>
  );
}

function PlacementCard({
  p,
  menu,
  canIssueInvoice,
}: {
  p: PlacementListRow;
  menu: ReactNode;
  canIssueInvoice: boolean;
}) {
  const created = new Date(p.createdAt);
  const pay = salaryLabel(p);
  return (
    <EntityCard
      testId="placement-card"
      avatar={{ initials: initialsOf(p.personName), tone: 'green' }}
      status={<DsEnumPill status={p.status} />}
      timestamp={
        // Relative time differs by a second or two between server and browser.
        <time
          dateTime={created.toISOString()}
          title={format(created, 'd MMM yyyy · HH:mm')}
          suppressHydrationWarning
        >
          {formatDistanceToNowStrict(created, { addSuffix: true })}
        </time>
      }
      menu={menu}
      title={p.personName}
      titleHref={`/candidates/${p.personId}`}
      subtitle={p.requisitionTitle}
      meta={[
        { key: 'employer', icon: Building2, content: p.employerName },
        {
          key: 'start',
          icon: CalendarDays,
          content: p.startDate ? `Starts ${formatStart(p.startDate)}` : null,
        },
        { key: 'salary', icon: Coins, content: pay },
        {
          key: 'invoice',
          icon: Receipt,
          content: <InvoiceCell p={p} canIssueInvoice={canIssueInvoice} />,
        },
        {
          key: 'created',
          icon: Clock,
          content: `Created ${format(created, 'd MMM yyyy · HH:mm')}`,
        },
      ]}
      actions={
        <>
          <Link href={`/requisitions/${p.jobRequisitionId}?tab=seats`} className={CARD_ACTION}>
            Open job <ArrowRight className="size-3.5" aria-hidden />
          </Link>
          {isPlacementFeeRaisable(p) ? (
            canIssueInvoice ? (
              <Link href={raisePlacementFeeHref(p)} className={CARD_ACTION_TINT}>
                <FileText className="size-3.5" aria-hidden /> Raise fee
              </Link>
            ) : (
              <span
                className={cn(CARD_ACTION_TINT, 'pointer-events-none opacity-60')}
                aria-disabled="true"
                title={FINANCE_ISSUES_INVOICES}
              >
                <FileText className="size-3.5" aria-hidden /> {FINANCE_ISSUES_INVOICES}
              </span>
            )
          ) : p.latestInvoice ? (
            <Link
              href={`/employers/${p.employerId}/invoices/${p.latestInvoice.number}`}
              className={CARD_ACTION_TINT}
            >
              <Receipt className="size-3.5" aria-hidden /> View invoice
            </Link>
          ) : null}
        </>
      }
    />
  );
}

/** Row / card actions menu — same items, permissions and audits as before. */
function PlacementActionsMenu({
  p,
  canEdit,
  canIssueInvoice,
  busy,
  onStatus,
  onRestore,
  onArchive,
}: {
  p: PlacementListRow;
  canEdit: boolean;
  canIssueInvoice: boolean;
  busy: boolean;
  onStatus: (next: PlacementListRow['status']) => void;
  onRestore: () => void;
  onArchive: () => void;
}) {
  const isTerminal = p.status === 'COMPLETED' || p.status === 'TERMINATED_EARLY';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Actions"
            disabled={busy}
            className="size-7"
          />
        }
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canEdit && (
          <>
            <DropdownMenuLabel>Placement status</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={p.status !== 'PROPOSED'}
              onClick={() => onStatus('CONFIRMED')}
            >
              Confirm (sets the candidate to Placed)
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={p.status !== 'CONFIRMED'}
              onClick={() => onStatus('STARTED')}
            >
              Mark started
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={p.status !== 'STARTED'}
              onClick={() => onStatus('COMPLETED')}
            >
              Mark completed
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={p.status !== 'CONFIRMED' && p.status !== 'STARTED'}
              onClick={() => onStatus('TERMINATED_EARLY')}
            >
              Terminate early
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!isTerminal} onClick={onRestore}>
              Restore candidate to Available…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {isPlacementFeeRaisable(p) &&
          (canIssueInvoice ? (
            <DropdownMenuItem
              render={
                <Link href={raisePlacementFeeHref(p)}>
                  <FileText className="mr-2 size-4" />
                  Raise placement fee invoice…
                </Link>
              }
            />
          ) : (
            <DropdownMenuItem disabled>
              <FileText className="mr-2 size-4" />
              Raise fee — {FINANCE_ISSUES_INVOICES}
            </DropdownMenuItem>
          ))}
        <DropdownMenuItem
          render={
            <Link href={`/immigration?raisePlacement=${p.id}`}>
              <PlaneTakeoff className="mr-2 size-4" />
              Raise immigration case…
            </Link>
          }
        />
        {canEdit && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onArchive}>
              <Archive className="mr-2 size-4" /> Archive placement…
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
