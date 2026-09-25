'use client';

import { format, formatDistanceToNow } from 'date-fns';
import { FileText, RefreshCw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { DocumentTypeOption } from '@/components/document-type-picker';
import { DocumentUploader } from '@/components/document-uploader';
import { EmptyState } from '@/components/empty-state';
import { MultiDocumentUploader } from '@/components/multi-document-uploader';
import { PromptDialog } from '@/components/prompt-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import type { DocumentInstance } from '@/lib/db/schema/documents';
import { statusTone } from '@/lib/ui/status-tone';
import { materialiseRequirementsAction, voidDocumentAction } from '@/modules/documents/actions';
import type { PersonRequirementRow } from '@/modules/documents/service';

export function DocumentsSection({
  personId,
  requirements,
  documents,
  documentTypes,
}: {
  personId: string;
  requirements: PersonRequirementRow[];
  documents: DocumentInstance[];
  documentTypes: DocumentTypeOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [voidTarget, setVoidTarget] = useState<DocumentInstance | null>(null);
  const [voidBusy, setVoidBusy] = useState(false);

  const refresh = () => {
    startTransition(async () => {
      const r = await materialiseRequirementsAction({ personId });
      if (r.ok) {
        toast.success(
          r.data.created > 0
            ? `${r.data.created} new requirement(s) added from occupation/global rules`
            : 'No new requirements — all applicable rules already covered',
        );
      } else {
        toast.error(r.error.message);
      }
    });
  };

  const confirmVoid = (reason: string) => {
    if (!voidTarget) return;
    const target = voidTarget;
    setVoidBusy(true);
    startTransition(async () => {
      const r = await voidDocumentAction({ documentInstanceId: target.id, reason });
      setVoidBusy(false);
      if (r.ok) {
        toast.success('Document deleted');
        setVoidTarget(null);
      } else {
        toast.error(r.error.message);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Required documents
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Refreshes from occupation + global rules — safe to run any time.
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={pending} onClick={refresh}>
          <RefreshCw className={`mr-1.5 size-3.5 ${pending ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {requirements.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No requirements yet"
          description="Click Refresh to derive requirements from this candidate's occupation and global rules."
        />
      ) : (
        <ul className="divide-y rounded-lg glass-panel">
          {requirements.map((req) => (
            <li key={req.id} className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{req.documentTypeName}</p>
                <p className="text-[10px] font-mono text-muted-foreground">
                  {req.documentTypeCode}
                  {req.hasExpiry ? ' · expiry tracked' : ''}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={statusTone(req.status)} className="rounded-full">
                  {req.status}
                </Badge>
                {(req.status === 'MISSING' || req.status === 'REJECTED') && (
                  <DocumentUploader
                    ownerType="PERSON"
                    ownerId={personId}
                    documentTypeId={req.documentTypeId}
                    fulfilRequirementId={req.id}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Attach more documents
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Drop multiple files at once — each picks its own type + display name. Pick{' '}
          <span className="font-medium">+ New type…</span> if the category isn't listed.
        </p>
        <MultiDocumentUploader
          ownerType="PERSON"
          ownerId={personId}
          documentTypes={documentTypes}
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Uploaded documents ({documents.length})
        </h3>
        {documents.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Nothing uploaded yet"
            description="Files uploaded from the CRM or the candidate portal appear here."
          />
        ) : (
          <ul className="divide-y rounded-lg glass-panel">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={d.originalFilename}>
                    {d.displayName ?? d.originalFilename}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {d.displayName ? `${d.originalFilename} · ` : ''}v{d.version} ·{' '}
                    {formatDistanceToNow(d.createdAt, { addSuffix: true })} ·{' '}
                    <time
                      dateTime={d.createdAt.toISOString()}
                      className="tabular-nums text-muted-foreground/80"
                    >
                      {format(d.createdAt, 'dd MMM yyyy · HH:mm')}
                    </time>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="rounded-full text-[10px]">
                    {d.status.replace(/_/g, ' ')}
                  </Badge>
                  <Link
                    href={`/api/documents/${d.id}/download`}
                    prefetch={false}
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  >
                    Download
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${d.displayName ?? d.originalFilename}`}
                    onClick={() => setVoidTarget(d)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <PromptDialog
        open={voidTarget !== null}
        onCancel={() => setVoidTarget(null)}
        onConfirm={confirmVoid}
        title={`Delete ${voidTarget?.displayName ?? voidTarget?.originalFilename ?? ''}?`}
        description="The file is hidden from every list and export, but the row + the underlying S3 object stay for the audit trail. Re-uploading the same document type creates a fresh version."
        label="Reason (audited)"
        placeholder="e.g. Wrong file uploaded"
        confirmLabel="Delete"
        confirmVariant="destructive"
        pending={voidBusy}
      />
    </div>
  );
}
