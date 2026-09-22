'use client';

import { CheckCircle2, Loader2, Trash2, UploadCloud, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { type DocumentTypeOption, DocumentTypePicker } from '@/components/document-type-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { DocumentInstance } from '@/lib/db/schema/documents';
import { registerUploadAction } from '@/modules/documents/actions';

type OwnerType = 'PERSON' | 'EMPLOYER';

type RowState = 'idle' | 'uploading' | 'ok' | 'error';

type Row = {
  key: string;
  file: File;
  documentTypeId: string;
  displayName: string;
  state: RowState;
  error?: string;
};

const DEFAULT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx';

/**
 * Multi-file document uploader.
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  ⬆ Choose files  (or drop them here)                        │
 *   │  ─────────────────────────────────────────────────────────  │
 *   │  passport.pdf     [Passport ▼]  [Rob's biometric page ]  ✕ │
 *   │  cert.pdf         [+ New… ▼]    [City & Guilds Level 3]  ✕ │
 *   │  bank.pdf         [Bank Stmt ▼] [Bank of Ireland Jan   ]  ✕ │
 *   │                                                             │
 *   │  [ Cancel ]                              [ Upload all (3) ] │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Each row has its own document-type picker (so different files can
 * belong to different categories in one submit) and a free-text display
 * name. The picker's "+ New type…" affordance creates a persistent
 * document_types row so it shows up everywhere else.
 *
 * Uses the same 3-step flow as <DocumentUploader> per file:
 *   1. POST /api/documents/presign  → signed PUT URL
 *   2. PUT the file to S3
 *   3. registerUploadAction — inserts the DB row (with display_name)
 */
export function MultiDocumentUploader({
  ownerType,
  ownerId,
  documentTypes: initialTypes,
  onUploaded,
  accept = DEFAULT_ACCEPT,
}: {
  ownerType: OwnerType;
  ownerId: string;
  documentTypes: DocumentTypeOption[];
  /** Fires per successful upload so the parent can refresh its list. */
  onUploaded?: (doc: DocumentInstance) => void;
  accept?: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [types, setTypes] = useState<DocumentTypeOption[]>(initialTypes);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    setRows((prev) => [
      ...prev,
      ...Array.from(files).map((f) => ({
        key: `${f.name}-${f.size}-${crypto.randomUUID()}`,
        file: f,
        documentTypeId: '',
        // Strip extension for the default display name so staff type less.
        displayName: f.name.replace(/\.[^.]+$/, ''),
        state: 'idle' as RowState,
      })),
    ]);
  };

  const updateRow = (key: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const removeRow = (key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
  };

  const uploadOne = async (row: Row) => {
    if (!row.documentTypeId) {
      updateRow(row.key, { state: 'error', error: 'Pick a type' });
      return;
    }
    updateRow(row.key, { state: 'uploading', error: undefined });
    try {
      const presignResp = await fetch('/api/documents/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerType,
          ownerId,
          documentTypeId: row.documentTypeId,
          originalFilename: row.file.name,
          mimeType: row.file.type,
          fileSizeBytes: row.file.size,
        }),
      });
      if (!presignResp.ok) {
        const err = await presignResp.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? 'Could not get upload URL');
      }
      const { uploadUrl, key } = await presignResp.json();
      const putResp = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': row.file.type },
        body: row.file,
      });
      if (!putResp.ok) throw new Error(`S3 upload failed (HTTP ${putResp.status})`);
      const registerResult = await registerUploadAction({
        ownerType,
        ownerId,
        documentTypeId: row.documentTypeId,
        s3ObjectKey: key,
        originalFilename: row.file.name,
        displayName: row.displayName.trim(),
        mimeType: row.file.type,
        fileSizeBytes: row.file.size,
      });
      if (!registerResult.ok) throw new Error(registerResult.error.message);
      updateRow(row.key, { state: 'ok' });
      onUploaded?.(registerResult.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      updateRow(row.key, { state: 'error', error: message });
    }
  };

  const uploadAll = async () => {
    const pending = rows.filter((r) => r.state !== 'ok');
    if (pending.length === 0) return;
    const missingType = pending.filter((r) => !r.documentTypeId);
    if (missingType.length > 0) {
      toast.error(`${missingType.length} file(s) still need a type`);
    }
    // Sequential is fine here — S3 uploads are I/O bound and we don't want to
    // overwhelm the presign route.
    for (const r of pending) {
      // Re-read from state each iteration so setState during the loop still applies.
      // eslint-disable-next-line no-await-in-loop
      await uploadOne(r);
    }
    const successes = rows.filter((r) => r.state === 'ok').length;
    if (successes > 0) toast.success(`${successes} file(s) uploaded`);
  };

  const pendingCount = useMemo(
    () => rows.filter((r) => r.state === 'idle' || r.state === 'error').length,
    [rows],
  );

  return (
    <div className="space-y-4">
      <label
        htmlFor="mdu-files"
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input bg-muted/30 px-6 py-8 text-center transition-colors hover:bg-muted/50"
      >
        <UploadCloud className="size-6 text-muted-foreground" />
        <span className="text-sm font-medium">Choose files or drop them here</span>
        <span className="text-xs text-muted-foreground">
          You can pick many at once — each file gets its own type + display name below.
        </span>
      </label>
      <input
        id="mdu-files"
        type="file"
        multiple
        className="sr-only"
        accept={accept}
        onChange={(e) => addFiles(e.currentTarget.files)}
      />

      {rows.length > 0 && (
        <div className="space-y-2">
          <ul className="divide-y rounded-lg glass-panel">
            {rows.map((r) => (
              <li
                key={r.key}
                className="grid grid-cols-1 gap-2 px-3 py-3 sm:grid-cols-[1fr_180px_1fr_auto]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.file.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatBytes(r.file.size)}
                    {r.state === 'ok' && ' · Uploaded'}
                    {r.state === 'uploading' && ' · Uploading…'}
                    {r.state === 'error' && ` · ${r.error ?? 'Error'}`}
                  </p>
                </div>
                <div>
                  <DocumentTypePicker
                    options={types}
                    value={r.documentTypeId}
                    onChange={(id) => updateRow(r.key, { documentTypeId: id })}
                    onOptionsChanged={(created) => setTypes((prev) => [...prev, created])}
                    disabled={r.state === 'uploading' || r.state === 'ok'}
                  />
                </div>
                <div>
                  <Input
                    value={r.displayName}
                    onChange={(e) => updateRow(r.key, { displayName: e.target.value })}
                    placeholder="Display name"
                    disabled={r.state === 'uploading' || r.state === 'ok'}
                    className="h-9"
                  />
                </div>
                <div className="flex items-center justify-end gap-1">
                  {r.state === 'ok' && <CheckCircle2 className="size-4 text-status-success" />}
                  {r.state === 'error' && <XCircle className="size-4 text-status-danger" />}
                  {r.state === 'uploading' && (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRow(r.key)}
                    disabled={r.state === 'uploading'}
                    aria-label="Remove"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {pendingCount} file{pendingCount === 1 ? '' : 's'} pending
            </p>
            <Button onClick={uploadAll} disabled={pendingCount === 0}>
              Upload all ({pendingCount})
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
