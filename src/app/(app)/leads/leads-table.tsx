'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { Archive, CheckCircle2, FileText, MoreHorizontal, UserCheck, UserX } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table/data-table';
import { DocumentUploader } from '@/components/document-uploader';
import { PromptDialog } from '@/components/prompt-dialog';
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
import { assignEntityAction } from '@/modules/assignments/actions';
import { ensurePaymentProofTypeAction } from '@/modules/document-types/actions';
import {
  archiveLeadAction,
  convertLeadAction,
  updateLeadStatusAction,
} from '@/modules/leads/actions';
import type { LeadListRow } from '@/modules/leads/repository';

const STATUS_VARIANT: Record<LeadListRow['status'], 'default' | 'secondary' | 'outline'> = {
  NEW: 'default',
  CONTACTED: 'secondary',
  AWAITING_PAYMENT: 'secondary',
  CONVERTED: 'outline',
  LOST: 'outline',
  REJECTED: 'outline',
};

type Props = { leads: LeadListRow[]; currentUserId: string };

export function LeadsTable({ leads, currentUserId }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [convertTarget, setConvertTarget] = useState<LeadListRow | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<LeadListRow | null>(null);
  const [reason, setReason] = useState('');
  const [paymentProofTypeId, setPaymentProofTypeId] = useState<string | null>(null);
  const [proofDocId, setProofDocId] = useState<string | null>(null);
  const [proofFilename, setProofFilename] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const confirmArchive = (archiveReason: string) => {
    if (!archiveTarget) return;
    const target = archiveTarget;
    setBusyId(target.id);
    startTransition(async () => {
      const r = await archiveLeadAction({ leadId: target.id, reason: archiveReason });
      setBusyId(null);
      if (r.ok) {
        toast.success(`${target.personName}'s lead archived`);
        setArchiveTarget(null);
      } else {
        toast.error(r.error.message);
      }
    });
  };

  // Ensure the PAYMENT_PROOF document type exists as soon as the dialog opens.
  useEffect(() => {
    if (!convertTarget || paymentProofTypeId) return;
    (async () => {
      const r = await ensurePaymentProofTypeAction();
      if (r.ok) setPaymentProofTypeId(r.data.id);
    })();
  }, [convertTarget, paymentProofTypeId]);

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
    setProofDocId(null);
    setProofFilename(null);
    setConvertTarget(lead);
  };

  const closeConvert = () => {
    setConvertTarget(null);
    setReason('');
    setProofDocId(null);
    setProofFilename(null);
  };

  const confirmConvert = () => {
    if (!convertTarget) return;
    if (reason.trim().length < 3) return;
    const target = convertTarget;
    const method = proofDocId ? 'PAYMENT_VERIFIED' : 'MANUAL_OVERRIDE';
    setBusyId(target.id);
    startTransition(async () => {
      const result = await convertLeadAction({
        leadId: target.id,
        method,
        reason: reason.trim(),
        paymentProofDocumentInstanceId: proofDocId ?? '',
      });
      setBusyId(null);
      if (result.ok) {
        toast.success(`${target.personName} is now an active candidate`);
        closeConvert();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const columns: ColumnDef<LeadListRow>[] = [
    {
      header: 'Person',
      accessorKey: 'personName',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-sm font-medium">{row.original.personName}</span>
          <span className="text-xs text-muted-foreground">
            {row.original.personEmail ?? row.original.personPhone ?? '—'}
          </span>
        </div>
      ),
    },
    {
      header: 'Status',
      accessorKey: 'status',
      size: 150,
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.status]} className="rounded-full">
          {row.original.status.replace(/_/g, ' ')}
        </Badge>
      ),
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
      size: 140,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(row.original.createdAt, { addSuffix: true })}
        </span>
      ),
    },
    {
      header: '',
      id: 'actions',
      size: 50,
      cell: ({ row }) => {
        const lead = row.original;
        const isBusy = busyId === lead.id;
        const canTransition = lead.status !== 'CONVERTED';
        const isMine = lead.assignedUserId === currentUserId;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" aria-label="Actions" disabled={isBusy} />}
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Assignment</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => toggleAssignToMe(lead)}>
                {isMine ? (
                  <>
                    <UserX className="mr-2 size-4" /> Unassign from me
                  </>
                ) : (
                  <>
                    <UserCheck className="mr-2 size-4" /> Assign to me
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Change status</DropdownMenuLabel>
              <DropdownMenuItem
                disabled={!canTransition}
                onClick={() => setStatus(lead, 'CONTACTED')}
              >
                Mark contacted
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canTransition}
                onClick={() => setStatus(lead, 'AWAITING_PAYMENT')}
              >
                Awaiting payment
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!canTransition} onClick={() => openConvert(lead)}>
                <UserCheck className="mr-2 size-4" /> Convert to candidate…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
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
              <DropdownMenuItem
                onClick={() => setArchiveTarget(lead)}
                className="text-destructive focus:text-destructive"
              >
                <Archive className="mr-2 size-4" /> Archive lead…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
      />
      <PromptDialog
        open={archiveTarget !== null}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
        title={`Archive ${archiveTarget?.personName ?? ''}'s lead?`}
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
            <DialogTitle>Convert to candidate</DialogTitle>
          </DialogHeader>
          {convertTarget && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Activating <span className="font-medium">{convertTarget.personName}</span> as a
                candidate. Upload the payment proof to record method{' '}
                <span className="font-mono text-[11px]">PAYMENT_VERIFIED</span> — or skip to record
                a manual override. Both paths are audited.
              </p>

              <div className="space-y-1">
                <Label>Payment proof (optional)</Label>
                {proofDocId ? (
                  <div className="flex items-center gap-2 rounded-md border bg-emerald-500/5 px-3 py-2 text-xs">
                    <CheckCircle2 className="size-3.5 text-emerald-600" />
                    <span className="truncate font-medium">{proofFilename ?? 'Uploaded'}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={() => {
                        setProofDocId(null);
                        setProofFilename(null);
                      }}
                    >
                      Replace
                    </Button>
                  </div>
                ) : paymentProofTypeId ? (
                  <DocumentUploader
                    ownerType="PERSON"
                    ownerId={convertTarget.personId}
                    documentTypeId={paymentProofTypeId}
                    accept=".pdf,.png,.doc,.docx"
                    buttonLabel="Upload payment proof"
                    onUploaded={(doc) => {
                      setProofDocId(doc.id);
                      setProofFilename(doc.originalFilename);
                    }}
                  />
                ) : (
                  <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    <FileText className="size-3.5" /> Preparing uploader…
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  PNG, PDF, or Word only. Max 10 MB. Attaches to the candidate's documents.
                </p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="convertReason">Reason (audited) *</Label>
                <Input
                  id="convertReason"
                  autoFocus
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Bank transfer received 2026-08-27"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && reason.trim().length >= 3) {
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
              disabled={reason.trim().length < 3 || busyId === convertTarget?.id}
            >
              <UserCheck className="mr-1.5 size-4" /> Convert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
