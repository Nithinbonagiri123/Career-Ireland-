'use client';

import { formatDistanceToNow } from 'date-fns';
import { CheckCircle2, FileText, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DocumentUploader } from '@/components/document-uploader';
import { Button } from '@/components/ui/button';
import type { DocumentInstance } from '@/lib/db/schema/documents';
import { ensureCvTypeAction } from '@/modules/document-types/actions';
import { listPersonDocumentsByTypeCodeAction } from '@/modules/documents/actions';

/**
 * Reusable CV picker. Lazy-fetches the CV document-type + the person's existing
 * CV documents on mount, then lets the caller pick one or upload a new one.
 * Emits the selected `DocumentInstance | null` via `onChange`.
 */
export function CvPicker({
  personId,
  value,
  onChange,
  allowNone = true,
}: {
  personId: string;
  value: DocumentInstance | null;
  onChange: (doc: DocumentInstance | null) => void;
  allowNone?: boolean;
}) {
  const [cvTypeId, setCvTypeId] = useState<string | null>(null);
  const [existing, setExisting] = useState<DocumentInstance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [typeR, docsR] = await Promise.all([
        ensureCvTypeAction(),
        listPersonDocumentsByTypeCodeAction(personId, 'CV'),
      ]);
      if (cancelled) return;
      if (typeR.ok) setCvTypeId(typeR.data.id);
      if (docsR.ok) setExisting(docsR.data);
      else toast.error(docsR.error.message);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [personId]);

  const handleUploaded = (doc: DocumentInstance) => {
    setExisting((prev) => [doc, ...prev]);
    onChange(doc);
  };

  return (
    <div className="space-y-2">
      {loading ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Loading CVs…
        </div>
      ) : existing.length === 0 ? (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          No CVs on file for this candidate yet. Upload one below.
        </div>
      ) : (
        <ul className="divide-y rounded-md border bg-card">
          {allowNone && (
            <li>
              <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                <input
                  type="radio"
                  name={`cv-${personId}`}
                  checked={value === null}
                  onChange={() => onChange(null)}
                />
                <span className="text-muted-foreground">No CV attached</span>
              </label>
            </li>
          )}
          {existing.map((doc) => (
            <li key={doc.id}>
              <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                <input
                  type="radio"
                  name={`cv-${personId}`}
                  checked={value?.id === doc.id}
                  onChange={() => onChange(doc)}
                />
                <FileText className="size-3.5 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{doc.originalFilename}</span>
                  <span className="ml-2 text-[11px] text-muted-foreground">
                    v{doc.version} · {formatDistanceToNow(doc.createdAt, { addSuffix: true })}
                  </span>
                </span>
                {value?.id === doc.id && <CheckCircle2 className="size-3.5 text-status-success" />}
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        {cvTypeId ? (
          <DocumentUploader
            ownerType="PERSON"
            ownerId={personId}
            documentTypeId={cvTypeId}
            accept=".pdf,.doc,.docx"
            buttonLabel="Upload new CV"
            onUploaded={handleUploaded}
          />
        ) : (
          <Button size="sm" variant="outline" disabled>
            Preparing…
          </Button>
        )}
        <p className="text-[11px] text-muted-foreground">PDF or Word. Max 10 MB.</p>
      </div>
    </div>
  );
}
