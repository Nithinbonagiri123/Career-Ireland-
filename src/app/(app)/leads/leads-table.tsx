'use client';

import type { ColumnDef } from '@tanstack/react-table';
import {
  Archive,
  ArrowUpRight,
  CheckCircle2,
  FileText,
  Inbox,
  MoreHorizontal,
  Pencil,
  Receipt,
  RotateCcw,
  UserCheck,
  UserX,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { GenerateInvoiceDialog } from '@/components/billing/generate-invoice-dialog';
import { DataTable } from '@/components/data-table/data-table';
import { EntityCardGrid } from '@/components/ds/entity-card';
import { Pagination, paginate } from '@/components/ds/pagination';
import { DsEnumPill } from '@/components/ds/status-pill';
import { DS_SOFT } from '@/components/ds/tones';
import { EmptyState } from '@/components/empty-state';
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
import { cn } from '@/lib/utils';
import { assignEntityAction } from '@/modules/assignments/actions';
import type { InvoiceableService } from '@/modules/billing/read';
import {
  archiveLeadAction,
  reactivateExpiredLeadAction,
  updateLeadStatusAction,
} from '@/modules/leads/actions';
import { servicesForTarget } from '@/modules/leads/conversion-rules';
import type { LeadListRow } from '@/modules/leads/repository';
import { ConvertLeadDialog } from './convert-lead-dialog';
import { DirectPaymentDialog } from './direct-payment-dialog';
import { flagEmojiFromCountryName, LeadCard, leadHref, leadInitials } from './lead-card';

type Props = {
  leads: LeadListRow[];
  currentUserId: string;
  /** Stage 6D Wave 1d — passed in so the row menu can hide the
      "Record payment outside a quote (advanced)" option for Candidate
      Services STAFF. Only ADMIN / FINANCE see it on CS rows. Non-CS
      flows (Immigration + Recruitment) keep the item for everyone
      because they don't have a Client Workspace quote-first flow.
      Legacy portal roles (CANDIDATE / EMPLOYER) are included so the
      Props type matches the raw UserRole enum; they never reach this
      page but keeping the union aligned prevents type drift. */
  currentUserRole:
    | 'ADMIN'
    | 'STAFF'
    | 'MANAGER'
    | 'RECRUITER'
    | 'DOCUMENT_SPECIALIST'
    | 'FINANCE'
    | 'CANDIDATE'
    | 'EMPLOYER';
  /** Active PERSON-payable services + their packages. Fetched by the
      server page once and passed in so every row's invoice dialog gets
      the same option list (no extra round-trip per menu-open). */
  invoiceableServices: InvoiceableService[];
  /** Recruitment P0 — EMPLOYER (+ ANY) services for employer-paid leads. */
  employerServices: InvoiceableService[];
  /** Finance issues invoices (owner / ADMIN / FINANCE). Others see the
      lead-row invoice actions disabled with the reason. */
  canIssueInvoices: boolean;
  /** Finance verifies payments — drives the convert dialog's summary. */
  canVerifyPayments: boolean;
  /** Cards or table. Phones always get cards (the table needs width). */
  view: 'cards' | 'table';
};

const PER_OPTIONS = [25, 50, 100];

const ACTIVE_STATUSES = new Set(['NEW', 'CONTACTED', 'AWAITING_PAYMENT']);

function parseList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function LeadsTable({
  leads,
  currentUserId,
  currentUserRole,
  invoiceableServices,
  employerServices,
  canIssueInvoices,
  canVerifyPayments,
  view,
}: Props) {
  const canSeeExceptionalFinance = currentUserRole === 'ADMIN' || currentUserRole === 'FINANCE';
  const params = useSearchParams();
  const pathname = usePathname();
  // Client-side filtering so search / sort / pagination keep working on
  // the resulting array. All filter inputs come from URL params written
  // by <LeadsFilterControl>.
  const filteredLeads = useMemo(() => {
    const statusFilter = new Set(parseList(params.get('status')));
    const activeOnly = params.get('active') === 'true';
    const expiredOnly = params.get('expired') === 'true';
    const sourceFilter = new Set(parseList(params.get('source')));
    const countryFilter = new Set(parseList(params.get('country')));
    const professionFilter = new Set(parseList(params.get('profession')));
    const assigneeFilter = new Set(parseList(params.get('assignee')));
    const q = (params.get('q') ?? '').trim().toLowerCase();
    // Created dates (canonical from/to and the legacy createdFrom/createdTo
    // aliases) are applied once on the server — see leads/page.tsx.
    return leads.filter((l) => {
      if (statusFilter.size > 0 && !statusFilter.has(l.status)) return false;
      if (activeOnly && !ACTIVE_STATUSES.has(l.status)) return false;
      if (expiredOnly && l.status !== 'EXPIRED') return false;
      if (sourceFilter.size > 0 && (!l.personSource || !sourceFilter.has(l.personSource)))
        return false;
      if (countryFilter.size > 0) {
        const nat = l.personNationality ?? l.personCountry ?? '';
        if (!countryFilter.has(nat)) return false;
      }
      if (
        professionFilter.size > 0 &&
        (!l.personPrimaryOccupationId || !professionFilter.has(l.personPrimaryOccupationId))
      )
        return false;
      if (assigneeFilter.size > 0 && (!l.assignedUserId || !assigneeFilter.has(l.assignedUserId)))
        return false;
      if (q) {
        const hay = `${l.displayName} ${l.personEmail ?? ''} ${l.personPhone ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, params]);

  // Sort + paginate the filtered rows once; the table and the cards both
  // render exactly this slice, so the two views always agree.
  const sort = params.get('sort') ?? 'recent';
  const sortedLeads = useMemo(() => {
    const copy = [...filteredLeads];
    if (sort === 'name') return copy.sort((a, b) => a.displayName.localeCompare(b.displayName));
    const t = (l: LeadListRow) => new Date(l.createdAt).getTime();
    return sort === 'oldest' ? copy.sort((a, b) => t(a) - t(b)) : copy.sort((a, b) => t(b) - t(a));
  }, [filteredLeads, sort]);
  const pageData = paginate(
    sortedLeads,
    params.get('page') ?? undefined,
    params.get('per') ?? undefined,
    PER_OPTIONS,
  );

  const [busyId, setBusyId] = useState<string | null>(null);
  // The convert dialog keeps its lead while it animates closed (only
  // `convertOpen` flips), so the closing frame never shows an empty,
  // mistitled dialog.
  const [convertTarget, setConvertTarget] = useState<LeadListRow | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<LeadListRow | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<LeadListRow | null>(null);
  const [invoicingLead, setInvoicingLead] = useState<LeadListRow | null>(null);
  // Stage 6E Section 3 — Direct Payment & Convert dialog state. Only
  // reachable for CS leads with a personId (CS leads always have one).
  const [directPaymentLead, setDirectPaymentLead] = useState<LeadListRow | null>(null);
  const [, startTransition] = useTransition();

  const confirmArchive = (archiveReason: string) => {
    if (!archiveTarget) return;
    const target = archiveTarget;
    setBusyId(target.id);
    startTransition(async () => {
      const r = await archiveLeadAction({ leadId: target.id, reason: archiveReason });
      setBusyId(null);
      if (r.ok) {
        toast.success(`${target.displayName}'s lead archived`);
        setArchiveTarget(null);
      } else {
        toast.error(r.error.message);
      }
    });
  };

  const confirmReactivate = (reactivateReason: string) => {
    if (!reactivateTarget) return;
    const target = reactivateTarget;
    setBusyId(target.id);
    startTransition(async () => {
      const r = await reactivateExpiredLeadAction({
        leadId: target.id,
        reason: reactivateReason,
      });
      setBusyId(null);
      if (r.ok) {
        toast.success(`${target.displayName}'s lead reactivated`);
        setReactivateTarget(null);
      } else {
        toast.error(r.error.message);
      }
    });
  };

  const setStatus = (
    lead: LeadListRow,
    status: 'CONTACTED' | 'AWAITING_PAYMENT' | 'LOST' | 'REJECTED',
  ) => {
    setBusyId(lead.id);
    startTransition(async () => {
      const result = await updateLeadStatusAction({ leadId: lead.id, status });
      setBusyId(null);
      if (result.ok) toast.success(`Lead marked ${status.toLowerCase().replace(/_/g, ' ')}`);
      else toast.error(result.error.message);
    });
  };

  const toggleAssignToMe = (lead: LeadListRow) => {
    const isMine = lead.assignedUserId === currentUserId;
    setBusyId(lead.id);
    startTransition(async () => {
      const r = await assignEntityAction({
        entity: 'lead',
        id: lead.id,
        userId: isMine ? null : currentUserId,
      });
      setBusyId(null);
      if (r.ok) toast.success(isMine ? 'Unassigned' : 'Assigned to you');
      else toast.error(r.error.message);
    });
  };

  const openConvert = (lead: LeadListRow) => {
    setConvertTarget(lead);
    setConvertOpen(true);
  };

  const invoiceBlockedReason = 'Finance issues invoices';

  /** "Ready to convert / activate" + "Will expire" chips — table and cards. */
  const statusExtras = (lead: LeadListRow): React.ReactNode => {
    const readyToConvert = lead.hasVerifiedPayment && lead.status !== 'CONVERTED';
    const chip =
      'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset transition-colors';
    return (
      <>
        {readyToConvert &&
          (lead.targetBusiness === 'CANDIDATE_SERVICES' && lead.personId ? (
            // Stage 6B — CS activation lives on the Client Workspace as a
            // lightweight confirmation; the chip routes there.
            <Link
              href={`/clients/${lead.personId}`}
              className={`${chip} bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30`}
              title="Payment verified — open the workspace to activate the candidate"
            >
              <CheckCircle2 className="size-3" aria-hidden />
              Ready to activate
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => openConvert(lead)}
              className={`${chip} bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30`}
              title="Payment verified — convert this lead to a candidate"
            >
              <CheckCircle2 className="size-3" aria-hidden />
              Ready to convert
            </button>
          ))}
        {lead.isExpiryEligible && (
          <span
            className={`${chip} bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/30`}
            title="This lead is >30 days old with no commitments; the daily 02:00 UTC sweep will expire it."
          >
            Will expire at next sweep
          </span>
        )}
      </>
    );
  };

  /** Row actions — identical in the table and on cards (same gates). */
  const actionsFor = (lead: LeadListRow, layout: 'table' | 'card' = 'table'): React.ReactNode => {
    // Tables right-align actions; cards left-align them.
    const justify = layout === 'card' ? 'justify-start' : 'justify-end';
    const isBusy = busyId === lead.id;
    const canTransition = lead.status !== 'CONVERTED';
    const isMine = lead.assignedUserId === currentUserId;
    const isCS = lead.targetBusiness === 'CANDIDATE_SERVICES';

    // Stage 6E Section 1 — Candidate Services leads collapse to two
    // prominent actions: Create Pro Forma + Direct Payment & Convert.
    // Converted CS rows show Open Client Workspace. Non-CS flows
    // (Immigration + Recruitment) keep the original cluttered row.
    if (isCS && lead.personId && !canTransition) {
      // Already-converted CS lead: workspace is the only action.
      return (
        <div className={`flex items-center ${justify} gap-1.5`}>
          <Link
            href={`/clients/${lead.personId}`}
            className={`${buttonVariants({ variant: 'default', size: 'sm' })} h-8`}
          >
            <UserCheck className="mr-1.5 size-3.5" />
            Open Client Workspace
          </Link>
        </div>
      );
    }
    if (isCS && lead.personId && canTransition) {
      const compact = layout === 'table';
      return (
        <div className={`flex flex-col gap-1 ${compact ? 'items-end' : 'items-start'}`}>
          <div
            className={`flex items-center ${justify} gap-1.5 ${compact ? 'flex-nowrap' : 'flex-wrap'}`}
          >
            {/* Table rows use short visible labels on one line; the full
                action names stay as the accessible names and tooltips. */}
            <Link
              href={`/clients/${lead.personId}?tab=billing`}
              title={compact ? 'Create Pro Forma' : undefined}
              className={`${buttonVariants({ variant: 'outline', size: 'sm' })} h-8 ${compact ? 'px-2.5 text-xs' : ''}`}
            >
              <FileText className="mr-1.5 size-3.5" aria-hidden />
              {compact ? (
                <>
                  <span aria-hidden>Pro forma</span>
                  <span className="sr-only">Create Pro Forma</span>
                </>
              ) : (
                'Create Pro Forma'
              )}
            </Link>
            {canSeeExceptionalFinance && (
              <Button
                size="sm"
                onClick={() => setDirectPaymentLead(lead)}
                disabled={isBusy}
                title={compact ? 'Direct Payment & Convert' : undefined}
                className={`h-8 ${compact ? 'px-2.5 text-xs' : ''}`}
              >
                <UserCheck className="mr-1.5 size-3.5" aria-hidden />
                {compact ? (
                  <>
                    <span aria-hidden>Pay &amp; convert</span>
                    <span className="sr-only">Direct Payment &amp; Convert</span>
                  </>
                ) : (
                  <>Direct Payment &amp; Convert</>
                )}
              </Button>
            )}
            {compact && (
              <Link
                href={`/clients/${lead.personId}`}
                aria-label="Open Workspace"
                title="Open Workspace"
                className={`${buttonVariants({ variant: 'ghost', size: 'icon' })} h-8 w-8`}
              >
                <ArrowUpRight className="size-4" aria-hidden />
              </Link>
            )}
            {/* Admin lifecycle (Archive / Reactivate) stays in a
                    tiny overflow for ADMIN only — operators doing
                    routine CS work never see it. */}
            {canSeeExceptionalFinance && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Admin actions"
                      disabled={isBusy}
                      className="h-8 w-8"
                    />
                  }
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Admin only</DropdownMenuLabel>
                  {lead.status === 'EXPIRED' && (
                    <DropdownMenuItem
                      onClick={() => setReactivateTarget(lead)}
                      className="text-emerald-700 focus:text-emerald-700 dark:text-emerald-400 dark:focus:text-emerald-400"
                    >
                      <RotateCcw className="mr-2 size-4" /> Reactivate lead…
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => setArchiveTarget(lead)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Archive className="mr-2 size-4" /> Archive lead…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          {!compact && (
            <Link
              href={`/clients/${lead.personId}`}
              className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Open Workspace →
            </Link>
          )}
        </div>
      );
    }

    // Non-CS: original row (unchanged logic — Immigration +
    // Recruitment don't have a Client Workspace, so their status
    // transitions + convert menu stay).
    let primary: React.ReactNode = null;
    if (canTransition) {
      if (lead.hasVerifiedPayment) {
        primary = (
          <Button size="sm" onClick={() => openConvert(lead)} disabled={isBusy} className="h-8">
            <UserCheck className="mr-1.5 size-3.5" />
            Convert
          </Button>
        );
      } else if (!isMine && lead.assignedUserId === null) {
        primary = (
          <Button
            variant="outline"
            size="sm"
            onClick={() => toggleAssignToMe(lead)}
            disabled={isBusy}
            className="h-8"
          >
            <UserCheck className="mr-1.5 size-3.5" />
            Assign to me
          </Button>
        );
      } else {
        primary = canIssueInvoices ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setInvoicingLead(lead)}
            disabled={isBusy}
            className="h-8"
          >
            <FileText className="mr-1.5 size-3.5" />
            Invoice
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled title={invoiceBlockedReason} className="h-8">
            <FileText className="mr-1.5 size-3.5" aria-hidden />
            {invoiceBlockedReason}
          </Button>
        );
      }
    }

    return (
      <div className={`flex items-center ${justify} gap-1.5`}>
        {primary}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label="More actions"
                disabled={isBusy}
                className="h-8 w-8"
              />
            }
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Status</DropdownMenuLabel>
            {/* An EXPIRED lead reopens only through the audited Reactivate
                action below; it can still be closed out as lost / rejected. */}
            <DropdownMenuItem
              disabled={!canTransition || lead.status === 'CONTACTED' || lead.status === 'EXPIRED'}
              onClick={() => setStatus(lead, 'CONTACTED')}
            >
              Mark contacted
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={
                !canTransition || lead.status === 'AWAITING_PAYMENT' || lead.status === 'EXPIRED'
              }
              onClick={() => setStatus(lead, 'AWAITING_PAYMENT')}
            >
              Mark awaiting payment
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canTransition} onClick={() => setStatus(lead, 'LOST')}>
              Mark lost
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canTransition} onClick={() => setStatus(lead, 'REJECTED')}>
              Mark rejected
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => toggleAssignToMe(lead)}>
              {isMine ? (
                <>
                  <UserX className="mr-2 size-4" /> Unassign
                </>
              ) : (
                <>
                  <UserCheck className="mr-2 size-4" /> Assign to me
                </>
              )}
            </DropdownMenuItem>
            {/* Stage 6D Wave 1b — Candidate Services is quote-first;
                    a 2nd direct invoice is the exceptional path. CS rows
                    show "Create quote" linking into the workspace; non-CS
                    (Immigration + Recruitment) keep the direct invoice
                    option because those flows don't use pro-formas. */}
            {lead.targetBusiness === 'CANDIDATE_SERVICES' && lead.personId ? (
              <DropdownMenuItem
                disabled={!canTransition}
                render={
                  <Link href={`/clients/${lead.personId}?tab=billing`}>
                    <FileText className="mr-2 size-4" /> Create quote…
                  </Link>
                }
              />
            ) : (
              <DropdownMenuItem
                disabled={!canTransition || !canIssueInvoices}
                onClick={() => setInvoicingLead(lead)}
              >
                <FileText className="mr-2 size-4" />
                {canIssueInvoices ? 'Add another invoice…' : `Invoice — ${invoiceBlockedReason}`}
              </DropdownMenuItem>
            )}
            {/* Stage 6D Wave 1d — for Candidate Services, the atomic
                    convert path is an exceptional finance operation,
                    gated to ADMIN / FINANCE only. STAFF never see it in
                    the ordinary row menu. Immigration + Recruitment keep
                    the item for everyone because they don't have a
                    Client Workspace quote-first flow. */}
            {(lead.targetBusiness !== 'CANDIDATE_SERVICES' || canSeeExceptionalFinance) && (
              <DropdownMenuItem
                disabled={!canTransition || ['LOST', 'REJECTED', 'EXPIRED'].includes(lead.status)}
                onClick={() => openConvert(lead)}
              >
                <UserCheck className="mr-2 size-4" />{' '}
                {lead.targetBusiness === 'RECRUITMENT'
                  ? 'Convert → open requisition…'
                  : lead.targetBusiness === 'IMMIGRATION'
                    ? 'Convert → open case…'
                    : 'Record payment outside a quote (advanced)…'}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {/* Stage 6B — person-based leads route operators to the
                    unified Client Workspace (identity, next action,
                    engagements, quotes, invoices, timeline). The legacy
                    candidate operational profile is still linked from the
                    workspace header for CV / Documents / Applications. */}
            {lead.personId && (
              <DropdownMenuItem
                render={
                  <Link href={`/clients/${lead.personId}`}>
                    <Pencil className="mr-2 size-4" /> Open client workspace
                  </Link>
                }
              />
            )}
            {lead.targetBusiness === 'CANDIDATE_SERVICES' && (
              <DropdownMenuItem
                render={
                  <Link href={`/leads/${lead.id}`}>
                    <Receipt className="mr-2 size-4" /> Quotes (pro formas)
                  </Link>
                }
              />
            )}
            {lead.status === 'EXPIRED' && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setReactivateTarget(lead)}
                  className="text-emerald-700 focus:text-emerald-700 dark:text-emerald-400 dark:focus:text-emerald-400"
                >
                  <RotateCcw className="mr-2 size-4" /> Reactivate lead…
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setArchiveTarget(lead)}
              className="text-destructive focus:text-destructive"
            >
              <Archive className="mr-2 size-4" /> Archive lead…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  const columns: ColumnDef<LeadListRow>[] = [
    {
      header: 'Person / Employer',
      accessorKey: 'displayName',
      cell: ({ row }) => {
        // Stage 6B — person-based leads (CS, Immigration) navigate to
        // the Client Workspace. Recruitment keeps the employer
        // destination because the workspace is person-scoped.
        const href = leadHref(row.original);
        // Stage 6G Screen 01 — avatar + name + phone layout from the
        // approved mockup. The avatar is initials on a soft blue tile
        // so rows scan the way a contact list does.
        const initials = leadInitials(row.original.displayName);
        return (
          <Link
            href={href}
            className="group -mx-2 flex items-center gap-3 rounded-md px-2 py-1 hover:bg-muted/60"
          >
            <span
              aria-hidden
              className={cn(
                'grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold',
                DS_SOFT.blue,
              )}
            >
              {initials}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground group-hover:underline">
                {row.original.displayName}
              </div>
              {(row.original.personPhone || row.original.personEmail) && (
                <div className="truncate text-xs text-muted-foreground">
                  {row.original.personPhone ?? row.original.personEmail}
                </div>
              )}
            </div>
          </Link>
        );
      },
    },
    {
      header: 'Nationality',
      accessorKey: 'personNationality',
      size: 140,
      cell: ({ row }) => {
        const value = row.original.personNationality ?? row.original.personCountry;
        if (!value) return <span className="text-xs text-muted-foreground">—</span>;
        const flag = flagEmojiFromCountryName(value);
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
            {flag && (
              <span aria-hidden className="text-sm leading-none">
                {flag}
              </span>
            )}
            {value}
          </span>
        );
      },
    },
    {
      header: 'Status',
      accessorKey: 'status',
      size: 170,
      cell: ({ row }) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <DsEnumPill status={row.original.status} />
          {statusExtras(row.original)}
        </div>
      ),
    },
    {
      header: 'Assigned to',
      accessorKey: 'assignedUserName',
      size: 150,
      cell: ({ row }) => {
        const name = row.original.assignedUserName;
        if (!name) {
          return <span className="text-xs text-muted-foreground">Unassigned</span>;
        }
        const initials = leadInitials(name);
        return (
          <span className="inline-flex items-center gap-2 text-xs text-foreground">
            <span
              aria-hidden
              className={cn(
                'grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold',
                DS_SOFT.slate,
              )}
            >
              {initials}
            </span>
            <span className="truncate">{name}</span>
          </span>
        );
      },
    },
    {
      header: 'Created',
      accessorKey: 'createdAt',
      size: 140,
      cell: ({ row }) => <Timestamp date={row.original.createdAt} />,
    },
    {
      header: '',
      id: 'actions',
      size: 330,
      cell: ({ row }) => actionsFor(row.original),
    },
  ];

  const emptyFiltered = filteredLeads.length === 0 && leads.length > 0;
  const emptyTitle = emptyFiltered ? 'No leads match your filters' : 'No leads yet';
  const emptyDescription = emptyFiltered
    ? 'Clear or adjust the filters above.'
    : 'Every candidate starts as a Lead. Create the first one with the button above.';
  const cards =
    pageData.items.length === 0 ? (
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
        <EmptyState icon={Inbox} title={emptyTitle} description={emptyDescription} />
      </div>
    ) : (
      <EntityCardGrid>
        {pageData.items.map((lead) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            statusExtras={statusExtras(lead)}
            actions={actionsFor(lead, 'card')}
          />
        ))}
      </EntityCardGrid>
    );

  return (
    <>
      {view === 'table' ? (
        <>
          {/* Table first in the DOM (row-based flows and `.first()` text
              lookups land on it); phones get the same rows as cards. */}
          <div className="hidden md:block">
            <DataTable
              columns={columns}
              data={pageData.items}
              emptyTitle={emptyTitle}
              emptyDescription={emptyDescription}
            />
          </div>
          <div className="md:hidden">{cards}</div>
        </>
      ) : (
        cards
      )}
      <Pagination
        basePath={pathname}
        params={Object.fromEntries(params.entries())}
        page={pageData.page}
        pages={pageData.pages}
        per={pageData.per}
        total={pageData.total}
        start={pageData.start}
        noun="leads"
        perOptions={PER_OPTIONS}
      />
      <PromptDialog
        open={archiveTarget !== null}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
        title={`Archive ${archiveTarget?.displayName ?? ''}'s lead?`}
        description="Removes the lead from the active list. The record and its audit history are preserved and can be restored later. Underlying person is not archived."
        label="Reason (audited)"
        placeholder="e.g. Duplicate lead — kept the newer one"
        confirmLabel="Archive"
        confirmVariant="destructive"
        pending={busyId === archiveTarget?.id}
      />
      <PromptDialog
        open={reactivateTarget !== null}
        onCancel={() => setReactivateTarget(null)}
        onConfirm={confirmReactivate}
        title={`Reactivate ${reactivateTarget?.displayName ?? ''}'s lead?`}
        description="Returns an EXPIRED lead to CONTACTED. The original expired_at timestamp is preserved for audit. Admin / Manager / Finance only."
        label="Reason (audited)"
        placeholder="e.g. Client re-engaged after 2 months of silence"
        confirmLabel="Reactivate"
        pending={busyId === reactivateTarget?.id}
      />
      {convertTarget && (
        <ConvertLeadDialog
          key={convertTarget.id}
          lead={convertTarget}
          open={convertOpen}
          onOpenChange={setConvertOpen}
          personServices={invoiceableServices}
          employerServices={employerServices}
          canVerifyPayments={canVerifyPayments}
        />
      )}

      {/* Controlled invoice dialog — driven from the row "Invoice" button /
          "Add another invoice…" item. Rendered once at the table level (not
          per-row) so the dropdown can close cleanly before the dialog takes
          focus. Recruitment leads bill the employer; others the person. The
          invoice is stamped with the lead (server-validated). */}
      {invoicingLead &&
        canIssueInvoices &&
        invoicingLead.targetBusiness === 'RECRUITMENT' &&
        invoicingLead.employerId && (
          <GenerateInvoiceDialog
            open
            onOpenChange={(next) => {
              if (!next) setInvoicingLead(null);
            }}
            payerMode="EMPLOYER"
            payerId={invoicingLead.employerId}
            payerLabel={invoicingLead.displayName}
            services={servicesForTarget('RECRUITMENT', employerServices)}
            sourceLeadId={invoicingLead.id}
          />
        )}
      {invoicingLead &&
        canIssueInvoices &&
        invoicingLead.targetBusiness !== 'RECRUITMENT' &&
        invoicingLead.personId && (
          <GenerateInvoiceDialog
            open
            onOpenChange={(next) => {
              if (!next) setInvoicingLead(null);
            }}
            payerMode="PERSON"
            payerId={invoicingLead.personId}
            payerLabel={invoicingLead.displayName}
            services={invoiceableServices}
            sourceLeadId={invoicingLead.id}
          />
        )}
      {directPaymentLead && (
        <DirectPaymentDialog
          lead={{
            id: directPaymentLead.id,
            displayName: directPaymentLead.displayName,
            personId: directPaymentLead.personId,
          }}
          candidate={{
            email: directPaymentLead.personEmail,
            phone: directPaymentLead.personPhone,
            nationality: directPaymentLead.personNationality,
            country: directPaymentLead.personCountry,
          }}
          services={invoiceableServices}
          defaultCurrencyCode="EUR"
          open
          onOpenChange={(next) => {
            if (!next) setDirectPaymentLead(null);
          }}
        />
      )}
    </>
  );
}
