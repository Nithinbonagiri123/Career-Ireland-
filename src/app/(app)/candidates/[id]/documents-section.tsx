'use client';

import { formatDistanceToNow } from 'date-fns';
import { FileText, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { DocumentUploader } from '@/components/document-uploader';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import type { DocumentInstance } from '@/lib/db/schema/documents';
import { materialiseRequirementsAction } from '@/modules/documents/actions';
import type { PersonRequirementRow } from '@/modules/documents/service';

const STATUS_VARIANT: Record<PersonRequirementRow['status'], 'default' | 'secondary' | 'outline'> =
  {
    MISSING: 'outline',
    PROVIDED: 'secondary',
    ACCEPTED: 'default',
    REJECTED: 'outline',
  };

export function DocumentsSection({
  personId,
  requirements,
  documents,
}: {
  personId: string;
  requirements: PersonRequirementRow[];
  documents: DocumentInstance[];
}) {
  const [pending, startTransition] = useTransition();

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
        <ul className="divide-y rounded-lg border bg-card">
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
                <Badge variant={STATUS_VARIANT[req.status]} className="rounded-full">
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
          Uploaded documents ({documents.length})
        </h3>
        {documents.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Nothing uploaded yet"
            description="Files uploaded from the CRM or the candidate portal appear here."
          />
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{d.originalFilename}</p>
                  <p className="text-[10px] text-muted-foreground">
                    v{d.version} · {formatDistanceToNow(d.createdAt, { addSuffix: true })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
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
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
