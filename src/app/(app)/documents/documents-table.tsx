'use client';

import type { ColumnDef } from '@tanstack/react-table';
import {
  Ban,
  Check,
  Download,
  ExternalLink,
  FileText,
  MoreHorizontal,
  Receipt as ReceiptIcon,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table/data-table';
import { PromptDialog } from '@/components/prompt-dialog';
import { Timestamp } from '@/components/timestamp';
import { Badge } from '@/components/ui/badge';
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
import { statusTone } from '@/lib/ui/status-tone';
import { reviewDocumentAction, voidDocumentAction } from '@/modules/documents/actions';
import type { DocumentsHubRow } from '@/modules/documents/hub';

const KIND_TONE: Record<DocumentsHubRow['kind'], 'info' | 'success' | 'neutral'> = {
  UPLOADED: 'neutral',
  INVOICE: 'info',
  RECEIPT: 'success',
};

const KIND_ICON: Record<DocumentsHubRow['kind'], typeof FileText> = {
  UPLOADED: FileText,
  INVOICE: FileText,
  RECEIPT: ReceiptIcon,
};

/**
 * Build the "open the printable" URL for an invoice / receipt. The
 * print routes are scoped to `/candidates/[id]` or `/employers/[id]`
 * depending on payer type — same rule as the Billing tab links.
 */
function printableHref(row: DocumentsHubRow): string | null {
  if (row.kind === 'UPLOADED' || !row.number) return null;
  const scope = row.ownerKind === 'PERSON' ? 'candidates' : 'employers';
  const bucket = row.kind === 'INVOICE' ? 'invoices' : 'receipts';
  return `/${scope}/${row.ownerId}/${bucket}/${row.number}`;
}

export function DocumentsTable({ documents }: { documents: DocumentsHubRow[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [decideTarget, setDecideTarget] = useState<{
    docId: string;
    decision: 'ACCEPTED' | 'REJECTED';
  } | null>(null);
  const [voidTarget, setVoidTarget] = useState<DocumentsHubRow | null>(null);
  const [, startTransition] = useTransition();

  const confirmVoid = (reason: string) => {
    if (!voidTarget?.documentInstanceId) return;
    const target = voidTarget;
    setBusy(target.id);
    startTransition(async () => {
      const r = await voidDocumentAction({
        documentInstanceId: target.documentInstanceId ?? '',
        reason,
      });
      setBusy(null);
      if (r.ok) {
        toast.success('Document voided');
        setVoidTarget(null);
      } else {
        toast.error(r.error.message);
      }
    });
  };

  const accept = (docId: string) => {
    setBusy(docId);
    startTransition(async () => {
      const r = await reviewDocumentAction({
        documentInstanceId: docId,
        decision: 'ACCEPTED',
        reviewNotes: '',
      });
      setBusy(null);
      if (r.ok) toast.success('Document accepted');
      else toast.error(r.error.message);
    });
  };

  const confirmDecide = (notes: string) => {
    if (!decideTarget) return;
    const target = decideTarget;
    setBusy(target.docId);
    startTransition(async () => {
      const r = await reviewDocumentAction({
        documentInstanceId: target.docId,
        decision: target.decision,
        reviewNotes: notes,
      });
      setBusy(null);
      if (r.ok) {
        toast.success(`Document ${target.decision.toLowerCase()}`);
        setDecideTarget(null);
      } else {
        toast.error(r.error.message);
      }
    });
  };

  const columns: ColumnDef<DocumentsHubRow>[] = [
    {
      header: 'Owner',
      accessorKey: 'ownerName',
      cell: ({ row }) => (
        <Link
          href={
            row.original.ownerKind === 'PERSON'
              ? `/candidates/${row.original.ownerId}`
              : `/employers/${row.original.ownerId}`
          }
          className="group flex flex-col rounded-md -mx-2 px-2 py-0.5 hover:bg-muted/60"
        >
          <span className="text-sm font-medium group-hover:underline underline-offset-2">
            {row.original.ownerName}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {row.original.ownerKind}
          </span>
        </Link>
      ),
    },
    {
      header: 'Type',
      accessorKey: 'typeLabel',
      size: 180,
      cell: ({ row }) => {
        const Icon = KIND_ICON[row.original.kind];
        return (
          <div className="flex items-center gap-2">
            <Badge variant={KIND_TONE[row.original.kind]} className="gap-1">
              <Icon className="size-3" />
              {row.original.kind === 'UPLOADED' ? 'FILE' : row.original.kind}
            </Badge>
            <span className="truncate text-xs text-muted-foreground" title={row.original.typeLabel}>
              {row.original.typeLabel}
            </span>
          </div>
        );
      },
    },
    {
      header: 'Reference',
      accessorKey: 'reference',
      cell: ({ row }) => (
        <span
          className="line-clamp-1 font-mono text-xs text-muted-foreground"
          title={row.original.reference}
        >
          {row.original.reference}
          {row.original.version ? (
            <span className="ml-1.5 text-muted-foreground/70">v{row.original.version}</span>
          ) : null}
        </span>
      ),
    },
    {
      header: 'Amount / size',
      accessorKey: 'amount',
      size: 130,
      cell: ({ row }) => {
        if (row.original.kind === 'UPLOADED') {
          return (
            <span className="text-xs text-muted-foreground">
              {formatBytes(row.original.fileSizeBytes ?? 0)}
            </span>
          );
        }
        return (
          <span className="text-xs tabular-nums text-muted-foreground">
            {row.original.amount && row.original.currencyCode
              ? formatCurrency(row.original.amount, row.original.currencyCode)
              : '—'}
          </span>
        );
      },
    },
    {
      header: 'Status',
      accessorKey: 'status',
      size: 120,
      cell: ({ row }) => {
        const status =
          row.original.kind === 'UPLOADED'
            ? row.original.status
            : (row.original.financialStatus ?? 'ISSUED');
        if (!status) return <span className="text-xs text-muted-foreground">—</span>;
        return <Badge variant={statusTone(status)}>{status.replace(/_/g, ' ')}</Badge>;
      },
    },
    {
      header: 'Date',
      accessorKey: 'createdAt',
      size: 150,
      cell: ({ row }) => <Timestamp date={row.original.createdAt} />,
    },
    {
      header: '',
      id: 'actions',
      size: 130,
      cell: ({ row }) => {
        const doc = row.original;
        if (doc.kind === 'UPLOADED') {
          const canReview = doc.status === 'UPLOADED' || doc.status === 'UNDER_REVIEW';
          return (
            <div className="flex items-center justify-end gap-1.5">
              <Link
                href={`/api/documents/${doc.id}/download`}
                className={buttonVariants({ variant: 'ghost', size: 'icon' })}
                aria-label="Download"
                prefetch={false}
                title="Download file"
              >
                <Download className="size-3.5" />
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Actions"
                      disabled={busy === doc.id}
                    />
                  }
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canReview && (
                    <>
                      <DropdownMenuLabel>Review decision</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => accept(doc.id)}>
                        <Check className="mr-2 size-4" /> Accept
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDecideTarget({ docId: doc.id, decision: 'REJECTED' })}
                      >
                        <X className="mr-2 size-4" /> Reject…
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem variant="destructive" onSelect={() => setVoidTarget(doc)}>
                    <Ban className="mr-2 size-4" /> Void document…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        }

        // INVOICE / RECEIPT — open the printable page in a new tab so
        // the operator's flow through the list isn't interrupted.
        const href = printableHref(doc);
        return (
          <div className="flex items-center justify-end">
            {href && (
              <Link
                href={href}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
                target="_blank"
                rel="noreferrer"
              >
                Open
                <ExternalLink className="ml-1 size-3.5" />
              </Link>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={documents}
        emptyTitle="No documents match these filters"
        emptyDescription="Clear filters or widen the date range to see more."
      />
      <PromptDialog
        open={decideTarget !== null}
        onCancel={() => setDecideTarget(null)}
        onConfirm={confirmDecide}
        title="Reject document"
        description="The reason is stored on the document instance and visible to the owner."
        label="Rejection reason (audited)"
        placeholder="e.g. Illegible / wrong document type / expired"
        confirmLabel="Reject"
        confirmVariant="destructive"
        pending={decideTarget ? busy === decideTarget.docId : false}
      />
      <PromptDialog
        open={voidTarget !== null}
        onCancel={() => setVoidTarget(null)}
        onConfirm={confirmVoid}
        title={`Void "${voidTarget?.reference ?? ''}"?`}
        description="Voided documents disappear from lists, exports, and requirement fulfilment. The DB row + S3 object stay for audit."
        label="Reason (audited)"
        placeholder="e.g. Uploaded to wrong candidate / superseded by newer version"
        confirmLabel="Void"
        confirmVariant="destructive"
        pending={busy === voidTarget?.id}
      />
    </>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
