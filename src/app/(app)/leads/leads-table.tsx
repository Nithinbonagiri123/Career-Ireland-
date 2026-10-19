'use client';

import type { ColumnDef } from '@tanstack/react-table';
import {
  Archive,
  CheckCircle2,
  FileText,
  MoreHorizontal,
  Pencil,
  Receipt,
  RotateCcw,
  UserCheck,
  UserX,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { GenerateInvoiceDialog } from '@/components/billing/generate-invoice-dialog';
import { DataTable } from '@/components/data-table/data-table';
import { PromptDialog } from '@/components/prompt-dialog';
import { Timestamp } from '@/components/timestamp';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { findCountryByName, ISO_COUNTRIES } from '@/lib/iso-countries';
import { statusTone } from '@/lib/ui/status-tone';
import { assignEntityAction } from '@/modules/assignments/actions';
import type { InvoiceableService } from '@/modules/billing/read';
import {
  acceptLeadAction,
  archiveLeadAction,
  reactivateExpiredLeadAction,
  updateLeadStatusAction,
} from '@/modules/leads/actions';
import type { LeadListRow } from '@/modules/leads/repository';
import { DirectPaymentDialog } from './direct-payment-dialog';

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
  /** Occupation catalog + known countries for the Filter dropdown. */
  occupations: Array<{ id: string; name: string }>;
  countries: string[];
};

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
  occupations: _occupations,
  countries: _countries,
}: Props) {
  const canSeeExceptionalFinance = currentUserRole === 'ADMIN' || currentUserRole === 'FINANCE';
  const params = useSearchParams();
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
    const createdFrom = params.get('createdFrom');
    const createdTo = params.get('createdTo');
    const fromDate = createdFrom ? new Date(`${createdFrom}T00:00:00Z`) : null;
    // Inclusive end of day: add 24h so a lead created on the `to` date
    // itself still matches.
    const toDate = createdTo ? new Date(`${createdTo}T23:59:59.999Z`) : null;
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
      if (fromDate && new Date(l.createdAt) < fromDate) return false;
      if (toDate && new Date(l.createdAt) > toDate) return false;
      return true;
    });
  }, [leads, params]);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [convertTarget, setConvertTarget] = useState<LeadListRow | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<LeadListRow | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<LeadListRow | null>(null);
  const [reason, setReason] = useState('');
  // Convert dialog is now a Record Payment form — see acceptLead service.
  const [convertServiceId, setConvertServiceId] = useState<string>('');
  const [convertAmount, setConvertAmount] = useState<string>('');
  const [convertCurrency, setConvertCurrency] = useState<string>('EUR');
  const [convertMethod, setConvertMethod] = useState<'BANK_TRANSFER' | 'CASH' | 'OTHER'>(
    'BANK_TRANSFER',
  );
  const [convertReference, setConvertReference] = useState<string>('');
  const [convertReceivedAt, setConvertReceivedAt] = useState<string>('');
  const [invoicingLead, setInvoicingLead] = useState<LeadListRow | null>(null);
  // Stage 6E Section 3 — Direct Payment & Convert dialog state. Only
  // reachable for CS leads with a personId (CS leads always have one).
  const [directPaymentLead, setDirectPaymentLead] = useState<LeadListRow | null>(null);
  const [, startTransition] = useTransition();

  const router = useRouter();

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

  // Prefill the payment form with the first available service when the
  // dialog opens — operator can switch. First package's price becomes
  // the default amount so routine conversions are quick to review.
  useEffect(() => {
    if (!convertTarget) return;
    const svc = invoiceableServices[0];
    if (svc) {
      setConvertServiceId(svc.id);
      const firstPkg = svc.packages[0];
      if (firstPkg) {
        setConvertAmount(firstPkg.price);
        setConvertCurrency(firstPkg.currencyCode);
      }
    }
  }, [convertTarget, invoiceableServices]);

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
    setReason('');
    setConvertReference('');
    setConvertReceivedAt('');
    setConvertTarget(lead);
  };

  const closeConvert = () => {
    setConvertTarget(null);
    setReason('');
    setConvertServiceId('');
    setConvertAmount('');
    setConvertReference('');
    setConvertReceivedAt('');
  };

  const convertFormValid =
    reason.trim().length >= 3 &&
    convertServiceId.length > 0 &&
    convertAmount.length > 0 &&
    Number(convertAmount) > 0 &&
    convertCurrency.length === 3;

  const confirmConvert = () => {
    if (!convertTarget || !convertFormValid) return;
    const target = convertTarget;
    setBusyId(target.id);
    startTransition(async () => {
      const result = await acceptLeadAction({
        leadId: target.id,
        reason: reason.trim(),
        serviceCatalogItemId: convertServiceId,
        amount: convertAmount,
        currencyCode: convertCurrency,
        method: convertMethod,
        proofReference: convertReference.trim(),
        receivedAt: convertReceivedAt,
      });
      setBusyId(null);
      if (result.ok) {
        const landedAs =
          result.data.targetBusiness === 'RECRUITMENT'
            ? 'requisition'
            : result.data.targetBusiness === 'IMMIGRATION'
              ? 'immigration case'
              : 'candidate';
        toast.success(`${target.displayName} converted — ${landedAs} created`);
        closeConvert();
        router.refresh();
        // Deep-link to the freshly-created operational entity so the
        // operator lands in context (invoices + docs attached).
        if (result.data.targetBusiness === 'IMMIGRATION') {
          router.push(`/immigration/${result.data.entityId}`);
        } else if (result.data.targetBusiness === 'RECRUITMENT') {
          router.push(`/requisitions/${result.data.entityId}`);
        } else if (target.personId) {
          router.push(`/candidates/${target.personId}`);
        }
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const columns: ColumnDef<LeadListRow>[] = [
    {
      header: 'Person / Employer',
      accessorKey: 'displayName',
      cell: ({ row }) => {
        // Stage 6B — person-based leads (CS, Immigration) navigate to
        // the Client Workspace. Recruitment keeps the employer
        // destination because the workspace is person-scoped.
        const href = row.original.personId
          ? `/clients/${row.original.personId}`
          : row.original.employerId
            ? `/employers/${row.original.employerId}`
            : '/leads';
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
              className="grid size-9 shrink-0 place-items-center rounded-full bg-note-blue text-xs font-semibold text-note-blue-ink ring-1 ring-black/5"
            >
              {initials}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground group-hover:underline">
                {row.original.displayName}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {row.original.personPhone ?? row.original.personEmail ?? '—'}
              </div>
            </div>
          </Link>
        );
      },
    },
    {
      header: 'Nationality',
      accessorKey: 'personNationality',
      size: 180,
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
      size: 190,
      cell: ({ row }) => {
        const lead = row.original;
        const readyToConvert = lead.hasVerifiedPayment && lead.status !== 'CONVERTED';
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={statusTone(lead.status)} className="rounded-full">
              {lead.status.replace(/_/g, ' ')}
            </Badge>
            {readyToConvert &&
              (lead.targetBusiness === 'CANDIDATE_SERVICES' && lead.personId ? (
                // Stage 6B — CS activation lives on the Client Workspace
                // as a lightweight confirmation. The chip now routes
                // operators to the workspace instead of opening the
                // legacy finance dialog.
                <Link
                  href={`/clients/${lead.personId}`}
                  className="inline-flex items-center gap-1 rounded-full border border-status-success/40 bg-status-success-soft px-2 py-0.5 text-[10px] font-medium text-status-success hover:brightness-95"
                  title="Payment verified — open the workspace to activate the candidate"
                >
                  <CheckCircle2 className="size-3" aria-hidden />
                  Ready to activate
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => openConvert(lead)}
                  className="inline-flex items-center gap-1 rounded-full border border-status-success/40 bg-status-success-soft px-2 py-0.5 text-[10px] font-medium text-status-success hover:brightness-95"
                  title="Payment verified — convert this lead to a candidate"
                >
                  <CheckCircle2 className="size-3" aria-hidden />
                  Ready to convert
                </button>
              ))}
            {lead.isExpiryEligible && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-100/60 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                title="This lead is >30 days old with no commitments; the daily 02:00 UTC sweep will expire it."
              >
                Will expire at next sweep
              </span>
            )}
          </div>
        );
      },
    },
    {
      header: 'Assigned to',
      accessorKey: 'assignedUserName',
      size: 170,
      cell: ({ row }) => {
        const name = row.original.assignedUserName;
        if (!name) {
          return <span className="text-xs italic text-muted-foreground">Unassigned</span>;
        }
        const initials = leadInitials(name);
        return (
          <span className="inline-flex items-center gap-2 text-xs text-foreground">
            <span
              aria-hidden
              className="grid size-6 shrink-0 place-items-center rounded-full bg-note-neutral text-[10px] font-semibold text-note-neutral-ink"
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
      size: 170,
      cell: ({ row }) => <Timestamp date={row.original.createdAt} />,
    },
    {
      header: '',
      id: 'actions',
      size: 320,
      cell: ({ row }) => {
        const lead = row.original;
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
            <div className="flex items-center justify-end gap-1.5">
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
          return (
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-1.5">
                <Link
                  href={`/clients/${lead.personId}?tab=billing`}
                  className={`${buttonVariants({ variant: 'outline', size: 'sm' })} h-8`}
                >
                  <FileText className="mr-1.5 size-3.5" />
                  Create Pro Forma
                </Link>
                {canSeeExceptionalFinance && (
                  <Button
                    size="sm"
                    onClick={() => setDirectPaymentLead(lead)}
                    disabled={isBusy}
                    className="h-8"
                  >
                    <UserCheck className="mr-1.5 size-3.5" />
                    Direct Payment &amp; Convert
                  </Button>
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
              {/* Stage 6G Screen 01 — Open Workspace shortcut matches
                  the mockup; always available for CS leads with a
                  person attached so the operator can skip the
                  billing path when they just want to inspect. */}
              <Link
                href={`/clients/${lead.personId}`}
                className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Open Workspace →
              </Link>
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
            primary = (
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
            );
          }
        }

        return (
          <div className="flex items-center justify-end gap-1.5">
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
                <DropdownMenuItem
                  disabled={!canTransition || lead.status === 'CONTACTED'}
                  onClick={() => setStatus(lead, 'CONTACTED')}
                >
                  Mark contacted
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!canTransition || lead.status === 'AWAITING_PAYMENT'}
                  onClick={() => setStatus(lead, 'AWAITING_PAYMENT')}
                >
                  Mark awaiting payment
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canTransition} onClick={() => setStatus(lead, 'LOST')}>
                  Mark lost
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!canTransition}
                  onClick={() => setStatus(lead, 'REJECTED')}
                >
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
                    disabled={!canTransition}
                    onClick={() => setInvoicingLead(lead)}
                  >
                    <FileText className="mr-2 size-4" /> Add another invoice…
                  </DropdownMenuItem>
                )}
                {/* Stage 6D Wave 1d — for Candidate Services, the atomic
                    convert path is an exceptional finance operation,
                    gated to ADMIN / FINANCE only. STAFF never see it in
                    the ordinary row menu. Immigration + Recruitment keep
                    the item for everyone because they don't have a
                    Client Workspace quote-first flow. */}
                {(lead.targetBusiness !== 'CANDIDATE_SERVICES' || canSeeExceptionalFinance) && (
                  <DropdownMenuItem disabled={!canTransition} onClick={() => openConvert(lead)}>
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
      },
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={filteredLeads}
        emptyTitle={
          filteredLeads.length === 0 && leads.length > 0
            ? 'No leads match your filters'
            : 'No leads yet'
        }
        emptyDescription={
          filteredLeads.length === 0 && leads.length > 0
            ? 'Clear or adjust the filter in the top right.'
            : 'Every candidate starts as a Lead. Create the first one with the button above.'
        }
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
      <Dialog
        open={convertTarget !== null}
        onOpenChange={(open) => {
          if (!open) closeConvert();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {convertTarget?.targetBusiness === 'RECRUITMENT'
                ? 'Convert → open requisition'
                : convertTarget?.targetBusiness === 'IMMIGRATION'
                  ? 'Convert → open immigration case'
                  : 'Record payment outside a quote'}
            </DialogTitle>
          </DialogHeader>
          {convertTarget && (
            <div className="space-y-4">
              {convertTarget.targetBusiness === 'CANDIDATE_SERVICES' ? (
                // Stage 6B — explicit warning for the CS exceptional
                // path. The ordinary journey is: create quote → issue →
                // record payment → confirm payment received → activate
                // candidate (all on the Client Workspace). This dialog
                // short-circuits that in one step and is reserved for
                // cases where the client already paid without a quote.
                <div className="space-y-2 rounded-md border border-amber-400/40 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
                  <div className="font-medium">Exceptional path — advanced use only</div>
                  <p>
                    This creates an engagement, an invoice, a payment and a receipt in one step
                    without a client-visible quote. Use only when the client has already paid
                    outside the normal quote flow. The reason you give below is written to the audit
                    log.
                  </p>
                  <p>
                    Prefer the standard flow: open the Client Workspace, create a quote, record the
                    payment against it, then activate the candidate.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Converting <span className="font-medium">{convertTarget.displayName}</span>. A
                  lead can only become a{' '}
                  {convertTarget.targetBusiness === 'RECRUITMENT' ? 'requisition' : 'case'} once the
                  payment is in — record it here and conversion + entity + payment + receipt all
                  happen atomically in one step.
                </p>
              )}

              <div className="space-y-1">
                <Label htmlFor="convertService">Service *</Label>
                <select
                  id="convertService"
                  value={convertServiceId}
                  onChange={(e) => {
                    const next = e.target.value;
                    setConvertServiceId(next);
                    const svc = invoiceableServices.find((s) => s.id === next);
                    const firstPkg = svc?.packages[0];
                    if (firstPkg) {
                      setConvertAmount(firstPkg.price);
                      setConvertCurrency(firstPkg.currencyCode);
                    }
                  }}
                  className="h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                >
                  <option value="">— Pick a service —</option>
                  {invoiceableServices.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="convertAmount">Amount *</Label>
                  <Input
                    id="convertAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={convertAmount}
                    onChange={(e) => setConvertAmount(e.target.value)}
                    placeholder="100.00"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="convertCurrency">Currency *</Label>
                  <Input
                    id="convertCurrency"
                    maxLength={3}
                    value={convertCurrency}
                    onChange={(e) => setConvertCurrency(e.target.value.toUpperCase())}
                    placeholder="EUR"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="convertMethod">Method *</Label>
                  <select
                    id="convertMethod"
                    value={convertMethod}
                    onChange={(e) =>
                      setConvertMethod(e.target.value as 'BANK_TRANSFER' | 'CASH' | 'OTHER')
                    }
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  >
                    <option value="BANK_TRANSFER">Bank transfer</option>
                    <option value="CASH">Cash</option>
                    <option value="OTHER">Other</option>
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    Change if the money came via cash or another route.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="convertReceivedAt">Received at</Label>
                  <Input
                    id="convertReceivedAt"
                    type="date"
                    value={convertReceivedAt}
                    onChange={(e) => setConvertReceivedAt(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="convertReference">Reference</Label>
                <Input
                  id="convertReference"
                  value={convertReference}
                  onChange={(e) => setConvertReference(e.target.value)}
                  placeholder="Bank txn ID, screenshot URL, …"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="convertReason">Reason (audited) *</Label>
                <Input
                  id="convertReason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Bank transfer received 2026-10-17"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && convertFormValid) {
                      e.preventDefault();
                      confirmConvert();
                    }
                  }}
                />
                <p className="text-[11px] text-muted-foreground">
                  At least 3 characters. Written to the audit log.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={closeConvert} disabled={busyId === convertTarget?.id}>
              Cancel
            </Button>
            <Button
              onClick={confirmConvert}
              disabled={!convertFormValid || busyId === convertTarget?.id}
            >
              <UserCheck className="mr-1.5 size-4" /> Convert &amp; record payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Controlled invoice dialog — driven from the row-menu "Generate
          invoice…" item. Rendered once at the table level (not per-row)
          so the dropdown can close cleanly before the dialog takes
          focus. */}
      {invoicingLead?.personId && (
        <GenerateInvoiceDialog
          open
          onOpenChange={(next) => {
            if (!next) setInvoicingLead(null);
          }}
          payerMode="PERSON"
          payerId={invoicingLead.personId}
          payerLabel={invoicingLead.displayName}
          services={invoiceableServices}
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

function leadInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0]?.[0] ?? '?').toUpperCase();
  return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase();
}

/**
 * Flag emoji for a nationality OR country string. First tries ISO
 * country name ("South Africa"), then reverse-matches the demonym
 * ("South African"). Returns an empty string when neither matches.
 */
function flagEmojiFromCountryName(input: string): string {
  const direct = findCountryByName(input);
  const country =
    direct ?? ISO_COUNTRIES.find((c) => c.nationality.toLowerCase() === input.toLowerCase());
  if (!country) return '';
  const A = 0x1f1e6;
  const codePoints = country.code
    .toUpperCase()
    .split('')
    .map((ch) => A + (ch.charCodeAt(0) - 'A'.charCodeAt(0)));
  return String.fromCodePoint(...codePoints);
}
