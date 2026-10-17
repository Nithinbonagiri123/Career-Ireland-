'use client';

import type { ColumnDef } from '@tanstack/react-table';
import {
  Archive,
  CheckCircle2,
  FileText,
  MoreHorizontal,
  Pencil,
  UserCheck,
  UserX,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { GenerateInvoiceDialog } from '@/components/billing/generate-invoice-dialog';
import { DataTable } from '@/components/data-table/data-table';
import { PromptDialog } from '@/components/prompt-dialog';
import { Timestamp } from '@/components/timestamp';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { statusTone } from '@/lib/ui/status-tone';
import { assignEntityAction } from '@/modules/assignments/actions';
import type { InvoiceableService } from '@/modules/billing/read';
import {
  acceptLeadAction,
  archiveLeadAction,
  updateLeadStatusAction,
} from '@/modules/leads/actions';
import type { LeadListRow } from '@/modules/leads/repository';

type Props = {
  leads: LeadListRow[];
  currentUserId: string;
  /** Active PERSON-payable services + their packages. Fetched by the
      server page once and passed in so every row's invoice dialog gets
      the same option list (no extra round-trip per menu-open). */
  invoiceableServices: InvoiceableService[];
};

export function LeadsTable({ leads, currentUserId, invoiceableServices }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [convertTarget, setConvertTarget] = useState<LeadListRow | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<LeadListRow | null>(null);
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
        // For CS/Immigration → deep-link to the candidate profile. For
        // Recruitment (employer-payer) → link to the employer detail page.
        const href = row.original.personId
          ? `/candidates/${row.original.personId}`
          : row.original.employerId
            ? `/employers/${row.original.employerId}`
            : '/leads';
        return (
          <Link
            href={href}
            className="group flex flex-col rounded-md -mx-2 px-2 py-0.5 hover:bg-muted/60"
          >
            <span className="text-sm font-medium group-hover:underline underline-offset-2">
              {row.original.displayName}
            </span>
            <span className="text-xs text-muted-foreground">
              {row.original.personEmail ?? row.original.personPhone ?? '—'}
            </span>
          </Link>
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
            {readyToConvert && (
              // A verified payment landed for this lead — the operator's
              // next action is to convert to a candidate. Prompt sits
              // inline so it's impossible to miss when scanning the list.
              <button
                type="button"
                onClick={() => openConvert(lead)}
                className="inline-flex items-center gap-1 rounded-full border border-status-success/40 bg-status-success-soft px-2 py-0.5 text-[10px] font-medium text-status-success hover:brightness-95"
                title="Payment verified — convert this lead to a candidate"
              >
                <CheckCircle2 className="size-3" aria-hidden />
                Ready to convert
              </button>
            )}
          </div>
        );
      },
    },
    {
      header: 'Assigned',
      accessorKey: 'assignedUserName',
      size: 140,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.assignedUserName ?? 'Unassigned'}
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
      size: 260,
      cell: ({ row }) => {
        const lead = row.original;
        const isBusy = busyId === lead.id;
        const canTransition = lead.status !== 'CONVERTED';
        const isMine = lead.assignedUserId === currentUserId;

        // Context-primary button: the single most likely next action
        // for this row's state. Order matters — first match wins.
        //   1. Payment verified? → Convert to candidate (the whole
        //      point of the flow).
        //   2. Unassigned? → Assign to me (blocks nothing but gets
        //      routine work moving).
        //   3. No verified payment yet → Generate additional invoice
        //      (bulk of "next actions" fall here).
        //   4. Converted / lost / rejected → no primary.
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
                <DropdownMenuItem disabled={!canTransition} onClick={() => setInvoicingLead(lead)}>
                  <FileText className="mr-2 size-4" /> Add another invoice…
                </DropdownMenuItem>
                {/* Convert = Record payment, atomic one-step flow. Opens
                    a dialog that collects service + amount + method, then
                    atomically creates the operational entity (candidate /
                    case / requisition), engagement, payment (auto-verified),
                    receipt, and marks the lead CONVERTED. The old separate
                    'Accept' flow is gone — a lead can no longer bypass
                    payment to become anything. */}
                <DropdownMenuItem disabled={!canTransition} onClick={() => openConvert(lead)}>
                  <UserCheck className="mr-2 size-4" />{' '}
                  {lead.targetBusiness === 'RECRUITMENT'
                    ? 'Convert → open requisition…'
                    : lead.targetBusiness === 'IMMIGRATION'
                      ? 'Convert → open case…'
                      : 'Convert → activate candidate…'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {/* Edit details opens the candidate profile — the underlying
                    person record. Works for a lead even before conversion:
                    fetchPersonDetail loads any person, and the profile page's
                    'Edit details' button is unconditional (see the candidate
                    detail page action bar). */}
                <DropdownMenuItem
                  render={
                    <Link href={`/candidates/${lead.personId}`}>
                      <Pencil className="mr-2 size-4" /> Edit details
                    </Link>
                  }
                />
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
        data={leads}
        emptyTitle="No leads yet"
        emptyDescription="Every candidate starts as a Lead. Create the first one with the button above."
        enableGlobalFilter
        globalFilterPlaceholder="Search leads…"
        enableColumnVisibility
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
                  : 'Convert → activate candidate'}
            </DialogTitle>
          </DialogHeader>
          {convertTarget && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Converting <span className="font-medium">{convertTarget.displayName}</span>. A lead
                can only become a{' '}
                {convertTarget.targetBusiness === 'RECRUITMENT'
                  ? 'requisition'
                  : convertTarget.targetBusiness === 'IMMIGRATION'
                    ? 'case'
                    : 'candidate'}{' '}
                once the payment is in — record it here and conversion + entity + payment + receipt
                all happen atomically in one step.
              </p>

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
    </>
  );
}
