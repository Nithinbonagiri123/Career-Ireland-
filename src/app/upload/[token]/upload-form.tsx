'use client';

import { CheckCircle2, Loader2, UploadCloud, XCircle } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { registerUploadForTokenAction } from './actions';

type Requirement = {
  id: string;
  documentTypeId: string;
  documentTypeCode: string;
  documentTypeName: string;
  fulfilled: boolean;
};

type RowState = 'idle' | 'uploading' | 'ok' | 'error';

/**
 * Candidate-facing upload widget for the magic-link page. One row per
 * requested requirement; each row is independent so a large PDF that
 * fails to upload doesn't block the smaller items behind it.
 *
 * Two-step flow, same as the internal DocumentUploader:
 *   1. POST /api/upload/[token]/presign  → signed PUT URL
 *   2. PUT the file to S3
 *   3. Server action: registerUploadForTokenAction → row + fulfilment
 */
export function UploadForm({
  token,
  initialRequirements,
}: {
  token: string;
  initialRequirements: Requirement[];
}) {
  const [requirements, setRequirements] = useState(initialRequirements);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [rowError, setRowError] = useState<Record<string, string | null>>({});
  const [, startTransition] = useTransition();

  const allDone = useMemo(() => requirements.every((r) => r.fulfilled), [requirements]);

  const handleFile = async (req: Requirement, file: File) => {
    setRowState((s) => ({ ...s, [req.id]: 'uploading' }));
    setRowError((s) => ({ ...s, [req.id]: null }));

    try {
      const presignResp = await fetch(`/api/upload/${encodeURIComponent(token)}/presign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirementId: req.id,
          originalFilename: file.name,
          mimeType: file.type,
          fileSizeBytes: file.size,
        }),
      });
      if (!presignResp.ok) {
        const err = await presignResp.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? 'Could not start the upload');
      }
      const { uploadUrl, key } = await presignResp.json();

      const putResp = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!putResp.ok) throw new Error(`Upload failed (HTTP ${putResp.status})`);

      const registerResult = await registerUploadForTokenAction({
        token,
        requirementId: req.id,
        s3ObjectKey: key,
        originalFilename: file.name,
        mimeType: file.type,
        fileSizeBytes: file.size,
      });
      if (!registerResult.ok) throw new Error(registerResult.error.message);

      // Optimistically mark this row fulfilled so the UI updates
      // without a full round-trip.
      setRequirements((rs) => rs.map((r) => (r.id === req.id ? { ...r, fulfilled: true } : r)));
      setRowState((s) => ({ ...s, [req.id]: 'ok' }));
      toast.success(`${req.documentTypeName} received`);

      if (registerResult.data.justCompleted) {
        toast.success('All documents received — thank you!');
        // Give the toast a moment then refresh so the page hits the
        // "thank you" state via server-side check.
        startTransition(() => {
          setTimeout(() => window.location.reload(), 1200);
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setRowError((s) => ({ ...s, [req.id]: message }));
      setRowState((s) => ({ ...s, [req.id]: 'error' }));
      toast.error(message);
    }
  };

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <ul className="divide-y divide-slate-200">
        {requirements.map((req) => {
          const state = rowState[req.id] ?? (req.fulfilled ? 'ok' : 'idle');
          const err = rowError[req.id];
          return (
            <li
              key={req.id}
              className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium text-slate-900">{req.documentTypeName}</p>
                <p className="text-xs text-slate-500 font-mono">{req.documentTypeCode}</p>
                {err && (
                  <p className="mt-1 text-xs text-status-danger" role="alert">
                    {err}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                {state === 'ok' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-status-success-soft px-2 py-0.5 text-xs font-medium text-status-success">
                    <CheckCircle2 className="size-3.5" />
                    Received
                  </span>
                )}
                <label
                  htmlFor={`file-${req.id}`}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
                >
                  {state === 'uploading' ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : state === 'error' ? (
                    <XCircle className="size-4 text-status-danger" />
                  ) : (
                    <UploadCloud className="size-4" />
                  )}
                  {state === 'uploading'
                    ? 'Uploading…'
                    : state === 'ok'
                      ? 'Replace file'
                      : state === 'error'
                        ? 'Retry'
                        : 'Choose file'}
                </label>
                <input
                  id={`file-${req.id}`}
                  type="file"
                  className="sr-only"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                  disabled={state === 'uploading'}
                  onChange={(e) => {
                    const f = e.currentTarget.files?.[0];
                    if (f) handleFile(req, f);
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {allDone && (
        <div className="mt-4 rounded-lg border border-status-success/40 bg-status-success-soft px-4 py-3 text-sm text-status-success">
          All documents received. You can close this window.
        </div>
      )}
    </div>
  );
}
