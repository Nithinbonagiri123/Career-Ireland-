'use client';

import { CheckCircle2, Loader2, UploadCloud, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { registerUploadAction } from '@/modules/documents/actions';

type OwnerType = 'PERSON' | 'EMPLOYER';

/**
 * Two-step upload: (1) POST /api/documents/presign for a signed PUT URL,
 * (2) PUT the file straight to S3. Then (3) register the upload in our DB
 * via a server action.  All three steps must succeed for the file to count.
 */
export function DocumentUploader({
  ownerType,
  ownerId,
  documentTypeId,
  fulfilRequirementId,
  onUploaded,
}: {
  ownerType: OwnerType;
  ownerId: string;
  documentTypeId: string;
  fulfilRequirementId?: string;
  onUploaded?: () => void;
}) {
  const [state, setState] = useState<'idle' | 'uploading' | 'ok' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    if (!file) return;
    setState('uploading');
    setErrorMessage(null);

    try {
      const presignResp = await fetch('/api/documents/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerType,
          ownerId,
          documentTypeId,
          originalFilename: file.name,
          mimeType: file.type,
          fileSizeBytes: file.size,
        }),
      });
      if (!presignResp.ok) {
        const err = await presignResp.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? 'Could not get upload URL');
      }
      const { uploadUrl, key } = await presignResp.json();

      const putResp = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!putResp.ok) throw new Error(`S3 upload failed (HTTP ${putResp.status})`);

      const registerResult = await registerUploadAction({
        ownerType,
        ownerId,
        documentTypeId,
        s3ObjectKey: key,
        originalFilename: file.name,
        mimeType: file.type,
        fileSizeBytes: file.size,
        fulfilRequirementIds: fulfilRequirementId ? [fulfilRequirementId] : undefined,
      });
      if (!registerResult.ok) throw new Error(registerResult.error.message);

      setState('ok');
      toast.success(`${file.name} uploaded`);
      onUploaded?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setErrorMessage(message);
      setState('error');
      toast.error(message);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <label
        className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm hover:bg-accent"
        htmlFor={`file-${documentTypeId}`}
      >
        {state === 'uploading' ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : state === 'ok' ? (
          <CheckCircle2 className="size-3.5 text-emerald-600" />
        ) : state === 'error' ? (
          <XCircle className="size-3.5 text-destructive" />
        ) : (
          <UploadCloud className="size-3.5" />
        )}
        {state === 'uploading'
          ? 'Uploading…'
          : state === 'ok'
            ? 'Uploaded'
            : state === 'error'
              ? 'Retry'
              : 'Upload file'}
      </label>
      <input
        id={`file-${documentTypeId}`}
        type="file"
        className="sr-only"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) handleFile(f);
        }}
        disabled={state === 'uploading'}
      />
      {state === 'error' && errorMessage && (
        <span className="max-w-xs truncate text-xs text-destructive" title={errorMessage}>
          {errorMessage}
        </span>
      )}
      {state === 'ok' && (
        <Button type="button" variant="ghost" size="sm" onClick={() => setState('idle')}>
          Upload another
        </Button>
      )}
    </div>
  );
}
