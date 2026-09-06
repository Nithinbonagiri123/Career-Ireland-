'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { Ban, Check, Download, MoreHorizontal, X } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table/data-table';
import { PromptDialog } from '@/components/prompt-dialog';
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
import { reviewDocumentAction, voidDocumentAction } from '@/modules/documents/actions';
import type { StaffDocumentRow } from '@/modules/documents/service';

const STATUS_VARIANT: Record<StaffDocumentRow['status'], 'default' | 'secondary' | 'outline'> = {
  UPLOADED: 'secondary',
  UNDER_REVIEW: 'secondary',
  ACCEPTED: 'default',
  REJECTED: 'outline',
  EXPIRED: 'outline',
};

export function DocumentsTable({ documents }: { documents: StaffDocumentRow[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [decideTarget, setDecideTarget] = useState<{
    docId: string;
    decision: 'ACCEPTED' | 'REJECTED';
  } | null>(null);
  const [voidTarget, setVoidTarget] = useState<StaffDocumentRow | null>(null);
  const [, startTransition] = useTransition();

  const confirmVoid = (reason: string) => {
    if (!voidTarget) return;
    const target = voidTarget;
    setBusy(target.id);
    startTransition(async () => {
      const r = await voidDocumentAction({ documentInstanceId: target.id, reason });
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
    // Accept doesn't require a reason. Fire directly.
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

  const columns: ColumnDef<StaffDocumentRow>[] = [
    {
      header: 'Owner',
      accessorKey: 'ownerName',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-sm font-medium">{row.original.ownerName}</span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {row.original.ownerKind}
          </span>
        </div>
      ),
    },
    {
      header: 'Type',
      accessorKey: 'documentTypeName',
      size: 200,
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-sm">{row.original.documentTypeName}</span>
          <span className="text-[10px] text-muted-foreground">v{row.original.version}</span>
        </div>
      ),
    },
    {
      header: 'File',
      accessorKey: 'originalFilename',
      cell: ({ row }) => (
        <span
          className="line-clamp-1 text-xs text-muted-foreground"
          title={row.original.originalFilename}
        >
          {row.original.originalFilename}
        </span>
      ),
    },
    {
      header: 'Size',
      accessorKey: 'fileSizeBytes',
      size: 90,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatBytes(row.original.fileSizeBytes)}
        </span>
      ),
    },
    {
      header: 'Status',
      accessorKey: 'status',
      size: 130,
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.status]} className="rounded-full">
          {row.original.status.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    {
      header: 'Uploaded',
      accessorKey: 'createdAt',
      size: 130,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(row.original.createdAt, { addSuffix: true })}
        </span>
      ),
    },
    {
      header: '',
      id: 'actions',
      size: 130,
      cell: ({ row }) => {
        const doc = row.original;
        const canReview = doc.status === 'UPLOADED' || doc.status === 'UNDER_REVIEW';
        return (
          <div className="flex items-center justify-end gap-1.5">
            <Link
              href={`/api/documents/${doc.id}/download`}
              className={buttonVariants({ variant: 'ghost', size: 'icon' })}
              aria-label="Download"
              prefetch={false}
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
      },
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={documents}
        emptyTitle="No documents yet"
        emptyDescription="Documents uploaded from candidate/employer portals or the internal CRM appear here."
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
        title={`Void "${voidTarget?.originalFilename ?? ''}"?`}
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
