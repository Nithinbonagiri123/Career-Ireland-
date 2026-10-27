'use client';

import { format } from 'date-fns';
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CloudUpload,
  FileScan,
  FileText,
  Loader2,
  MoreHorizontal,
  Plus,
  ScanLine,
  Search,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { type DocumentTypeOption, DocumentTypePicker } from '@/components/document-type-picker';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { DocumentInstance } from '@/lib/db/schema/documents';
import { effectiveMimeType, stageProblem } from '@/lib/upload-validation';
import { cn } from '@/lib/utils';
import { acceptCvSuggestionsAction, buildCvSuggestionsAction } from '@/modules/cv-parse/actions';
import type { CvSuggestions } from '@/modules/cv-parse/suggest';
import { ensureCvTypeAction } from '@/modules/document-types/actions';
import {
  reclassifyDocumentAction,
  registerUploadAction,
  setDocumentExpiryAction,
  voidDocumentAction,
} from '@/modules/documents/actions';

/**
 * Stage 6G Screen 05 — Documents & CV tab. Pixel-matches the approved
 * mockup (05_Documents_CV_APPROVED.png):
 *
 *   Row 0: Header card (title + Scan CV + Upload documents buttons)
 *
 *   Row 1 (3 cols):
 *     [ Upload dropzone + Common document types sidebar ] [ Scan CV card ]
 *            (col-span 2)                                     (col-span 1)
 *
 *   Row 2 (3 cols):
 *     [ Uploaded documents table ] [ Extracted CV Information preview ]
 *            (col-span 2)                 (col-span 1)
 *
 * Reuses the existing server actions — registerUploadAction (same 3-step
 * presign → PUT → register flow as DocumentUploader), buildCvSuggestionsAction
 * (deterministic CV parse), acceptCvSuggestionsAction (bulk-save picked
 * items). No new mutation paths added.
 */

type DocumentTypeLite = { id: string; name: string; code: string; hasExpiry: boolean };

const DEFAULT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx';
const CV_ACCEPT = '.pdf,.doc,.docx';

/** One staged (not yet uploaded) file with its operator-chosen type. */
type StagedFile = { key: string; file: File; typeId: string; expiresOn?: string };

/**
 * Shared presign → S3 PUT → register sequence. Throws on any step so
 * callers can count successes/failures.
 */
async function uploadDocumentFile(
  personId: string,
  file: File,
  documentTypeId: string,
  expiresOn?: string,
) {
  const presignResp = await fetch('/api/documents/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ownerType: 'PERSON',
      ownerId: personId,
      documentTypeId,
      originalFilename: file.name,
      mimeType: effectiveMimeType(file),
      fileSizeBytes: file.size,
    }),
  });
  if (!presignResp.ok) {
    // Wave 2.3 — surface the server's real reason (file type, size,
    // permission) instead of a generic "presign failed".
    const body = await presignResp.json().catch(() => null);
    throw new Error(body?.error?.message ?? 'The server refused this upload.');
  }
  const { uploadUrl, key } = await presignResp.json();
  const putResp = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': effectiveMimeType(file) },
    body: file,
  });
  if (!putResp.ok) throw new Error(`Storage upload failed (${putResp.status}). Try again.`);
  const reg = await registerUploadAction({
    ownerType: 'PERSON',
    ownerId: personId,
    documentTypeId,
    s3ObjectKey: key,
    originalFilename: file.name,
    displayName: file.name.replace(/\.[^.]+$/, ''),
    mimeType: effectiveMimeType(file),
    fileSizeBytes: file.size,
    // Wave 2.4 — optional expiry captured at upload for types that
    // track one (passports, permits).
    expiresOn: expiresOn || undefined,
  });
  if (!reg.ok) throw new Error(reg.error.message);
}

/** Filename-based type guess — only a PRE-SELECTION for the staging
 *  row's picker; the operator confirms or changes it before upload. */
function guessTypeCode(filename: string): string {
  const n = filename.toLowerCase();
  if (/resume|résumé|curriculum|(^|[^a-z])cv(?=[^a-z]|$)|cv\./.test(n)) return 'CV';
  if (/passport|id[-_ ]?card|national[-_ ]?id/.test(n)) return 'PASSPORT_BIOMETRIC';
  if (/qualif|certificat|degree|diploma|transcript/.test(n)) return 'QUALIFICATION';
  if (/reference/.test(n)) return 'REFERENCE_LETTER';
  if (/experience|employment/.test(n)) return 'EMPLOYMENT_LETTER';
  if (/visa|permit|immigration|irp|gnib|stamp/.test(n)) return 'VISA';
  return 'OTHER';
}

const COMMON_TYPES: Array<{ code: string; label: string }> = [
  { code: 'CV', label: 'CV / Resume' },
  { code: 'PASSPORT_BIOMETRIC', label: 'Passport / ID' },
  { code: 'QUALIFICATION', label: 'Qualifications' },
  { code: 'EMPLOYMENT_LETTER', label: 'Work experience letters' },
  { code: 'REFERENCE_LETTER', label: 'Reference letters' },
  { code: 'VISA', label: 'Immigration documents' },
  { code: 'OTHER', label: 'Other supporting documents' },
];

export function CandidateDocsTab({
  personId,
  documents,
  documentTypes,
}: {
  personId: string;
  documents: DocumentInstance[];
  documentTypes: DocumentTypeLite[];
}) {
  const router = useRouter();
  const [uploading, startUpload] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');

  // Types created inline via the picker's "+ New type…" merge with the
  // server-provided list so they're selectable without a page refresh.
  const [localTypes, setLocalTypes] = useState<DocumentTypeLite[]>([]);
  const allTypes = useMemo(() => {
    const byId = new Map<string, DocumentTypeLite>();
    for (const t of localTypes) byId.set(t.id, t);
    for (const t of documentTypes) if (!byId.has(t.id)) byId.set(t.id, t);
    return [...byId.values()];
  }, [documentTypes, localTypes]);
  const typeIdByCode = useMemo(() => new Map(allTypes.map((t) => [t.code, t.id])), [allTypes]);

  // Staged files — choosing/dropping files does NOT upload. Each file
  // lands here with a guessed type the operator confirms (or changes,
  // or replaces with a brand-new type) before pressing Upload.
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const hasExpiryById = useMemo(
    () => new Map(allTypes.map((t) => [t.id, t.hasExpiry] as const)),
    [allTypes],
  );

  function stageFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    // Wave 2.3 — validate at staging time (covers drag-and-drop, which
    // bypasses the picker's accept filter) and keep the reasons visible
    // until dismissed instead of a vanishing toast.
    const problems: string[] = [];
    const accepted: File[] = [];
    for (const file of files) {
      const problem = stageProblem(file);
      if (problem) problems.push(problem);
      else accepted.push(file);
    }
    if (problems.length > 0) setUploadErrors((prev) => [...prev, ...problems]);
    if (accepted.length === 0) return;
    setStaged((prev) => [
      ...prev,
      ...accepted.map((file) => ({
        key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        typeId: typeIdByCode.get(guessTypeCode(file.name)) ?? typeIdByCode.get('OTHER') ?? '',
      })),
    ]);
  }

  // Shared CV-scan state — ALL Scan buttons (header, Scan card, Extracted
  // panel) feed the same suggestions so the Extracted CV panel always
  // shows the latest scan, whichever button triggered it. The previous
  // build gave each button its own handler and two of them silently
  // discarded the results.
  const [cvSuggestions, setCvSuggestions] = useState<CvSuggestions | null>(null);
  // Wave 2.3 — persistent, dismissible upload problems (staging
  // rejections + per-file upload failures with the server's reason).
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [scanning, startScan] = useTransition();
  // Every page refresh in this tab goes through ONE tracked transition, so
  // `refreshing` is true exactly while router.refresh() is still in flight.
  // Next 16.4 cancels a server action that starts during a refresh (the
  // scan then silently did nothing); the scan buttons therefore stay
  // disabled until the refresh has committed, and a scan requested during
  // an upload/refresh is queued and runs as soon as it settles.
  const [refreshing, startRefresh] = useTransition();
  const refreshPage = useCallback(() => startRefresh(() => router.refresh()), [router]);
  const [scanQueued, setScanQueued] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const scanBlocked = scanning || refreshing || uploading;
  const runScan = () =>
    startScan(async () => {
      setScanError(null);
      let r: Awaited<ReturnType<typeof buildCvSuggestionsAction>>;
      try {
        r = await buildCvSuggestionsAction({ personId });
      } catch {
        // Network / aborted request — never fail silently.
        const message = 'The CV scan did not complete. Check your connection and scan again.';
        setScanError(message);
        toast.error(message);
        return;
      }
      if (!r.ok) {
        setScanError(r.error.message);
        toast.error(r.error.message);
        return;
      }
      if (!r.data.documentInstanceId) {
        toast.error(
          'No CV on file for this candidate. Upload one in the Scan CV card (or set an existing document’s type to “CV / Résumé” via its ⋯ menu), then scan again.',
        );
        return;
      }
      if (r.data.parseError) {
        // Wave 2.1 — keep the failure visible in the Extracted CV panel
        // itself (persistent), not only in a vanishing toast.
        setCvSuggestions(r.data);
        toast.error(`Could not read ${r.data.filename ?? 'the CV'}.`);
        return;
      }
      setCvSuggestions(r.data);
      setScanError(null);
      const total =
        r.data.skills.catalogHits.length +
        r.data.skills.customCandidates.length +
        r.data.qualifications.catalogHits.length +
        r.data.qualifications.customCandidates.length +
        r.data.employment.candidates.length;
      if (total === 0) {
        toast.info(
          `Scanned ${r.data.filename ?? 'CV'} — nothing new to suggest. Items already on the profile are hidden.`,
        );
      } else {
        toast.success(
          `Scanned ${r.data.filename ?? 'CV'} — ${total} suggestion${total === 1 ? '' : 's'} ready to review.`,
        );
      }
    });

  // Every Scan request is queued and runs only when no scan, upload or
  // refresh is pending — including the auto-scan that follows a CV upload,
  // whose refresh starts in the same tick.
  const scanCv = () => setScanQueued(true);
  // Run the queued scan once the upload / refresh it waited for has settled.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runScan is recreated each render; the trigger is the pending state.
  useEffect(() => {
    if (scanQueued && !scanning && !refreshing && !uploading) {
      setScanQueued(false);
      runScan();
    }
  }, [scanQueued, scanning, refreshing, uploading]);

  function uploadStaged() {
    if (staged.length === 0 || staged.some((s) => !s.typeId)) return;
    const batch = staged;
    startUpload(async () => {
      let ok = 0;
      const failures: string[] = [];
      for (const { file, typeId, expiresOn } of batch) {
        try {
          await uploadDocumentFile(personId, file, typeId, expiresOn);
          ok += 1;
        } catch (err) {
          // Wave 2.3 — name the file and the server's actual reason.
          const reason = err instanceof Error ? err.message : 'Upload failed.';
          failures.push(`${file.name}: ${reason}`);
        }
      }
      setStaged([]);
      if (ok > 0) toast.success(`${ok} file${ok === 1 ? '' : 's'} uploaded`);
      if (failures.length > 0) setUploadErrors((prev) => [...prev, ...failures]);
      refreshPage();
    });
  }

  const visibleDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents
      .filter((d) => !d.voidedAt)
      .filter((d) => {
        if (!q) return true;
        return (
          (d.displayName ?? d.originalFilename).toLowerCase().includes(q) ||
          d.originalFilename.toLowerCase().includes(q)
        );
      })
      .filter((d) => (typeFilter ? d.documentTypeId === typeFilter : true));
  }, [documents, search, typeFilter]);

  const typeNameById = useMemo(
    () => new Map(documentTypes.map((t) => [t.id, t.name])),
    [documentTypes],
  );

  return (
    <div className="space-y-5">
      {/* Row 0 — header card */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-background p-4 shadow-sm ring-1 ring-border/60 sm:p-5">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <span
              aria-hidden
              className="grid size-7 place-items-center rounded-md bg-indigo-100 text-indigo-700"
            >
              <FileText className="size-4" />
            </span>
            Documents &amp; CV
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            Manage candidate documents, upload new files, scan and parse CVs, and review extracted
            information.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <ScanCvButton onScan={scanCv} scanning={scanning || scanQueued} blocked={scanBlocked} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              buttonVariants({ variant: 'default', size: 'sm' }),
              'inline-flex items-center gap-1.5',
            )}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Plus className="size-3.5" aria-hidden />
            )}
            Upload documents
          </button>
        </div>
      </div>

      {/* Row 1 — Dropzone + Common types card (col-span 2) | Scan CV card (col-span 1) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="grid grid-cols-1 overflow-hidden rounded-xl border bg-background shadow-sm ring-1 ring-border/60 sm:grid-cols-[1fr_240px]">
            {/* Dropzone */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  stageFiles(e.dataTransfer.files);
                }
              }}
              className={cn(
                'flex flex-col items-center justify-center gap-2 border-dashed p-10 text-center transition-colors sm:border-r',
                dragOver ? 'bg-sky-50/80' : 'bg-background hover:bg-muted/30',
              )}
              disabled={uploading}
            >
              <span
                aria-hidden
                className="grid size-14 place-items-center rounded-full bg-sky-100 text-sky-700"
              >
                <CloudUpload className="size-7" />
              </span>
              <p className="mt-2 text-sm font-semibold text-foreground">Upload documents</p>
              <p className="text-xs text-muted-foreground">
                Drag and drop files here or{' '}
                <span className="text-sky-700 underline underline-offset-2">click to browse</span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                You can upload multiple files (PDF, DOC, DOCX, JPG, PNG)
              </p>
              <span
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'sm' }),
                  'mt-3 inline-flex items-center gap-1.5',
                )}
              >
                {uploading && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                Choose files
              </span>
            </button>
            {/* Common types sidebar */}
            <div className="border-t bg-muted/20 p-4 sm:border-l sm:border-t-0">
              <h4 className="mb-3 text-xs font-semibold text-foreground">Common document types</h4>
              <ul className="space-y-2 text-xs">
                {COMMON_TYPES.map((t) => (
                  <li key={t.code} className="flex items-center gap-2 text-muted-foreground">
                    <FileText className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
                    {t.label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {/* Hidden file input shared by header button, dropzone and Choose files */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={DEFAULT_ACCEPT}
            className="sr-only"
            onChange={(e) => {
              if (e.currentTarget.files) {
                stageFiles(e.currentTarget.files);
                e.currentTarget.value = '';
              }
            }}
          />

          {/* Wave 2.3 — persistent upload problems (staging rejections
              and per-file failures with the server's reason). Stays
              until dismissed so the operator can actually read it. */}
          {uploadErrors.length > 0 && (
            <div
              className="mt-4 space-y-1 rounded-xl border border-amber-400/40 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-100"
              role="alert"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">Some files could not be uploaded</p>
                <button
                  type="button"
                  onClick={() => setUploadErrors([])}
                  aria-label="Dismiss upload errors"
                  className="rounded p-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/60"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </div>
              <ul className="list-disc space-y-0.5 pl-4">
                {uploadErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Staging panel — files wait here with a type picker per row
              (including "+ New type…") until the operator confirms.
              Nothing is uploaded until "Upload n files" is pressed. */}
          {staged.length > 0 && (
            <div className="mt-4 rounded-xl border bg-background p-4 shadow-sm ring-1 ring-border/60">
              <h4 className="text-xs font-semibold text-foreground">
                Ready to upload ({staged.length}) — confirm the document type for each file
              </h4>
              <ul className="mt-3 space-y-2">
                {staged.map((s) => (
                  <li
                    key={s.key}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2"
                  >
                    <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span
                      className="min-w-0 flex-1 truncate text-xs text-foreground"
                      title={s.file.name}
                    >
                      {s.file.name}
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        {formatBytes(s.file.size)}
                      </span>
                    </span>
                    <div className="w-56 shrink-0">
                      <DocumentTypePicker
                        options={allTypes}
                        value={s.typeId}
                        disabled={uploading}
                        onChange={(id) =>
                          setStaged((prev) =>
                            prev.map((p) => (p.key === s.key ? { ...p, typeId: id } : p)),
                          )
                        }
                        onOptionsChanged={(created: DocumentTypeOption) => {
                          setLocalTypes((prev) => [created, ...prev]);
                          setStaged((prev) =>
                            prev.map((p) => (p.key === s.key ? { ...p, typeId: created.id } : p)),
                          );
                        }}
                      />
                      {/* Wave 2.4 — optional expiry for expiry-tracked types. */}
                      {hasExpiryById.get(s.typeId) && (
                        <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          Expiry date (optional)
                          <input
                            type="date"
                            value={s.expiresOn ?? ''}
                            disabled={uploading}
                            onChange={(e) => {
                              const v = e.currentTarget.value;
                              setStaged((prev) =>
                                prev.map((p) => (p.key === s.key ? { ...p, expiresOn: v } : p)),
                              );
                            }}
                            className="rounded-md border px-2 py-0.5 text-xs"
                          />
                        </label>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${s.file.name}`}
                      disabled={uploading}
                      onClick={() => setStaged((prev) => prev.filter((p) => p.key !== s.key))}
                      className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => setStaged([])}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={uploading || staged.some((s) => !s.typeId)}
                  onClick={uploadStaged}
                >
                  {uploading ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <UploadCloud className="mr-1.5 size-3.5" aria-hidden />
                  )}
                  Upload {staged.length} file{staged.length === 1 ? '' : 's'}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-1">
          <ScanCvCard
            personId={personId}
            cvTypeId={typeIdByCode.get('CV') ?? null}
            onScan={scanCv}
            scanning={scanning || scanQueued}
            blocked={scanBlocked}
            onRefresh={refreshPage}
          />
        </div>
      </div>

      {/* Row 2 — Uploaded documents TABLE | Extracted CV Information */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <section className="rounded-xl border bg-background shadow-sm ring-1 ring-border/60">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <span
                  aria-hidden
                  className="grid size-6 place-items-center rounded-md bg-sky-100 text-sky-700"
                >
                  <FileText className="size-3.5" />
                </span>
                Uploaded documents{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  ({visibleDocs.length})
                </span>
              </h3>
            </header>
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
              <div className="relative flex-1 min-w-[200px]">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search documents…"
                  className="h-9 pl-8"
                />
              </div>
              <Select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-9 w-auto min-w-[140px]"
                aria-label="Filter by type"
              >
                <option value="">All types</option>
                {documentTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
              <Select className="h-9 w-auto min-w-[120px]" aria-label="Filter by time" disabled>
                <option>All time</option>
              </Select>
            </div>
            {visibleDocs.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
                <span
                  aria-hidden
                  className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground"
                >
                  <FileText className="size-4" />
                </span>
                <p className="text-sm font-medium text-foreground">No documents yet</p>
                <p className="text-xs text-muted-foreground">
                  Files uploaded from the CRM or the candidate portal appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="border-b bg-muted/10 text-left text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">Name</th>
                      <th className="px-4 py-2 font-medium">Type</th>
                      <th className="px-4 py-2 font-medium">Uploaded</th>
                      <th className="px-4 py-2 font-medium">Expiry</th>
                      <th className="px-4 py-2 font-medium">Size</th>
                      <th className="px-4 py-2 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleDocs.map((d) => (
                      <tr key={d.id} className="border-b last:border-b-0 hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              aria-hidden
                              className={cn(
                                'grid size-7 shrink-0 place-items-center rounded-md',
                                mimeToTone(d.mimeType),
                              )}
                            >
                              <FileText className="size-3.5" />
                            </span>
                            <span
                              className="truncate font-medium text-foreground"
                              title={d.originalFilename}
                            >
                              {d.displayName ?? d.originalFilename}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {typeNameById.get(d.documentTypeId) ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground tabular-nums">
                          {format(new Date(d.createdAt), 'dd MMM yyyy')}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {d.expiresOn ? (
                            <span
                              className={cn(
                                new Date(d.expiresOn) < new Date()
                                  ? 'font-medium text-destructive'
                                  : 'text-muted-foreground',
                              )}
                            >
                              {format(new Date(d.expiresOn), 'dd MMM yyyy')}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground tabular-nums">
                          {formatBytes(d.fileSizeBytes)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <Link
                              href={`/api/documents/${d.id}/download`}
                              prefetch={false}
                              className={cn(
                                buttonVariants({ variant: 'outline', size: 'sm' }),
                                'h-7 gap-1 px-2',
                              )}
                              aria-label="View"
                            >
                              <FileScan className="size-3" />
                              View
                            </Link>
                            <Link
                              href={`/api/documents/${d.id}/download`}
                              prefetch={false}
                              className={cn(
                                buttonVariants({ variant: 'outline', size: 'sm' }),
                                'h-7 gap-1 px-2',
                              )}
                              aria-label="Download"
                            >
                              <CloudUpload className="size-3 rotate-180" />
                              Download
                            </Link>
                            <DocRowMenu doc={d} documentTypes={allTypes} onRefresh={refreshPage} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="lg:col-span-1">
          <ExtractedCvCard
            personId={personId}
            suggestions={cvSuggestions}
            scanning={scanning || scanQueued}
            blocked={scanBlocked}
            scanError={scanError}
            onScan={scanCv}
            onSaved={() => setCvSuggestions(null)}
            onRefresh={refreshPage}
          />
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────── */

function ScanCvButton({
  onScan,
  scanning,
  blocked,
}: {
  onScan: () => void;
  scanning: boolean;
  blocked: boolean;
}) {
  return (
    <button
      type="button"
      disabled={blocked}
      onClick={onScan}
      className={cn(
        buttonVariants({ variant: 'outline', size: 'sm' }),
        'inline-flex items-center gap-1.5',
      )}
    >
      {scanning ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <ScanLine className="size-3.5" aria-hidden />
      )}
      Scan CV
    </button>
  );
}

function ScanCvCard({
  personId,
  cvTypeId,
  onScan,
  scanning,
  blocked,
  onRefresh,
}: {
  personId: string;
  cvTypeId: string | null;
  onScan: () => void;
  scanning: boolean;
  /** True while a scan, upload or page refresh is still pending. */
  blocked: boolean;
  onRefresh: () => void;
}) {
  const [cvUploading, startCvUpload] = useTransition();
  const [cvDragOver, setCvDragOver] = useState(false);
  const cvInputRef = useRef<HTMLInputElement>(null);

  // Dedicated CV intake — always typed CV/Résumé (never mis-filed as
  // another document type) so the scan below has a fresh CV to read.
  // ensureCvTypeAction lazily creates the CV type if the catalog lacks it.
  // On success the scan fires automatically so suggestions appear in one
  // step instead of two.
  function uploadCv(fileList: FileList | File[]) {
    const file = Array.from(fileList)[0];
    if (!file) return;
    startCvUpload(async () => {
      try {
        let typeId = cvTypeId;
        if (!typeId) {
          const ensured = await ensureCvTypeAction();
          if (!ensured.ok) throw new Error(ensured.error.message);
          typeId = ensured.data.id;
        }
        await uploadDocumentFile(personId, file, typeId);
        toast.success('CV uploaded — scanning…');
        // The parent queues this scan until the refresh has committed.
        onRefresh();
        onScan();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'CV upload failed');
      }
    });
  }

  return (
    <section className="rounded-xl border bg-background shadow-sm ring-1 ring-border/60">
      <header className="border-b bg-muted/20 px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <span
            aria-hidden
            className="grid size-6 place-items-center rounded-md bg-sky-100 text-sky-700"
          >
            <ScanLine className="size-3.5" />
          </span>
          Scan CV &amp; Extract Information
        </h3>
      </header>
      <div className="space-y-3 p-4">
        <p className="text-xs text-muted-foreground">
          Upload a CV and we'll extract key information such as skills, qualifications and work
          history. Review and confirm before saving to the profile.
        </p>
        {/* Dedicated CV dropzone — separate from the general documents
            dropzone so a CV never lands under the wrong document type. */}
        <button
          type="button"
          onClick={() => cvInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setCvDragOver(true);
          }}
          onDragLeave={() => setCvDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setCvDragOver(false);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              uploadCv(e.dataTransfer.files);
            }
          }}
          disabled={cvUploading}
          className={cn(
            'flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-sky-300/80 p-4 text-center transition-colors',
            cvDragOver ? 'bg-sky-50' : 'bg-sky-50/40 hover:bg-sky-50',
          )}
        >
          {cvUploading ? (
            <Loader2 className="size-5 animate-spin text-sky-700" aria-hidden />
          ) : (
            <FileScan className="size-5 text-sky-700" aria-hidden />
          )}
          <span className="text-xs font-medium text-foreground">
            {cvUploading ? 'Uploading CV…' : 'Drop the CV here or click to browse'}
          </span>
          <span className="text-[11px] text-muted-foreground">
            Saved as CV / Résumé automatically (PDF, DOC, DOCX)
          </span>
        </button>
        <input
          ref={cvInputRef}
          type="file"
          accept={CV_ACCEPT}
          className="sr-only"
          onChange={(e) => {
            if (e.currentTarget.files) {
              uploadCv(e.currentTarget.files);
              e.currentTarget.value = '';
            }
          }}
        />
        <button
          type="button"
          onClick={onScan}
          disabled={blocked || cvUploading}
          className={cn(
            buttonVariants({ variant: 'default', size: 'sm' }),
            'inline-flex w-fit items-center gap-1.5',
          )}
        >
          {scanning ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <ScanLine className="size-3.5" aria-hidden />
          )}
          Scan CV
        </button>
        {/* Green helper banner — mirrors the mockup. */}
        <div className="flex items-start gap-2 rounded-lg border border-status-success/30 bg-status-success-soft p-3 text-xs">
          <CheckCircle2 className="size-4 shrink-0 text-status-success" aria-hidden />
          <div>
            <p className="font-medium text-status-success">Automatic extraction saves you time</p>
            <p className="mt-0.5 text-muted-foreground">
              Extracted information can be reviewed and edited before saving to the candidate
              profile.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ExtractedCvCard({
  personId,
  suggestions,
  scanning,
  blocked,
  scanError,
  onScan,
  onSaved,
  onRefresh,
}: {
  personId: string;
  /** Latest scan result, owned by the parent so every Scan button feeds
   *  this panel. null = not scanned yet. */
  suggestions: CvSuggestions | null;
  scanning: boolean;
  /** True while a scan, upload or page refresh is still pending. */
  blocked: boolean;
  /** Last scan failure (network / server), shown persistently. */
  scanError: string | null;
  onScan: () => void;
  onSaved: () => void;
  onRefresh: () => void;
}) {
  const [picked, setPicked] = useState<{
    skillIds: Set<string>;
    customSkills: Set<string>;
    qualificationIds: Set<string>;
    customQualifications: Set<string>;
    employmentKeys: Set<string>;
  }>({
    skillIds: new Set(),
    customSkills: new Set(),
    qualificationIds: new Set(),
    customQualifications: new Set(),
    employmentKeys: new Set(),
  });
  const [tab, setTab] = useState<'skills' | 'qualifications' | 'work' | 'personal'>('skills');
  const [saving, startSave] = useTransition();
  const [saveErrors, setSaveErrors] = useState<string[]>([]);

  const toggle = (bucket: keyof typeof picked, key: string) => {
    setPicked((prev) => {
      const next = { ...prev, [bucket]: new Set(prev[bucket]) };
      if (next[bucket].has(key)) next[bucket].delete(key);
      else next[bucket].add(key);
      return next;
    });
  };

  const save = () =>
    startSave(async () => {
      const employmentPicks = (suggestions?.employment.candidates ?? [])
        .filter((c) => picked.employmentKeys.has(c.key))
        .map((c) => ({
          employerName: c.employerName,
          jobTitle: c.jobTitle,
          location: c.location,
          startDate: c.startDate,
          endDate: c.endDate,
          isCurrent: c.isCurrent,
          description: c.description,
        }));
      const r = await acceptCvSuggestionsAction({
        personId,
        skillIds: Array.from(picked.skillIds),
        customSkills: Array.from(picked.customSkills),
        qualificationIds: Array.from(picked.qualificationIds),
        customQualifications: Array.from(picked.customQualifications),
        employment: employmentPicks,
      });
      if (!r.ok) {
        setSaveErrors([r.error.message]);
        toast.error(r.error.message);
        return;
      }
      // Wave 2.1 — a partial save is not a clean success: keep the
      // per-item failures visible in the panel and leave the preview
      // up so the operator can retry the failed items.
      if (r.data.errors && r.data.errors.length > 0) {
        setSaveErrors(r.data.errors);
        toast.warning(
          `Saved with ${r.data.errors.length} item${r.data.errors.length === 1 ? '' : 's'} skipped — see the notes in the panel.`,
        );
        onRefresh();
        return;
      }
      setSaveErrors([]);
      toast.success('Saved to profile');
      onSaved();
      setPicked({
        skillIds: new Set(),
        customSkills: new Set(),
        qualificationIds: new Set(),
        customQualifications: new Set(),
        employmentKeys: new Set(),
      });
      onRefresh();
    });

  const pickedCount =
    picked.skillIds.size +
    picked.customSkills.size +
    picked.qualificationIds.size +
    picked.customQualifications.size +
    picked.employmentKeys.size;
  const empty = suggestions === null;
  // Wave 2.1 — the "Personal Info" tab was a hard-coded "coming soon"
  // placeholder; honest UI shows only what extraction actually does.
  const tabs: Array<{ key: typeof tab; label: string }> = [
    { key: 'skills', label: 'Skills' },
    { key: 'qualifications', label: 'Qualifications' },
    { key: 'work', label: 'Work Experience' },
  ];

  return (
    <section className="rounded-xl border bg-background shadow-sm ring-1 ring-border/60">
      <header className="flex items-center justify-between gap-2 border-b bg-muted/20 px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <span
            aria-hidden
            className="grid size-6 place-items-center rounded-md bg-indigo-100 text-indigo-700"
          >
            <FileText className="size-3.5" />
          </span>
          Extracted CV Information{' '}
          <span className="text-xs font-normal text-muted-foreground">(Preview)</span>
        </h3>
        {!empty && (
          <Badge
            variant="secondary"
            className="rounded-full border-amber-300 bg-amber-100 text-[10px] text-amber-800"
          >
            Not saved yet
          </Badge>
        )}
      </header>

      {/* Tab strip */}
      <div className="flex gap-4 border-b px-4 pt-3 text-xs">
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'relative -mb-px border-b-2 pb-2 font-medium transition-colors',
                active
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-3 p-4 text-xs">
        {scanError && (
          <div
            className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
            role="alert"
            data-testid="cv-scan-error"
          >
            {scanError}
          </div>
        )}
        {empty ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <span
              aria-hidden
              className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground"
            >
              <FileScan className="size-4" />
            </span>
            <p className="text-xs font-medium text-foreground">Not scanned yet</p>
            <p className="max-w-[26ch] text-[11px] text-muted-foreground">
              Click Scan CV above to extract skills, qualifications and employment history from the
              latest uploaded CV.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={onScan}
              disabled={blocked}
              className="mt-2"
            >
              {scanning ? (
                <Loader2 className="mr-1.5 size-3 animate-spin" aria-hidden />
              ) : (
                <ScanLine className="mr-1.5 size-3" aria-hidden />
              )}
              Scan CV now
            </Button>
          </div>
        ) : suggestions.parseError ? (
          <div
            className="space-y-1.5 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
            role="alert"
          >
            <p className="font-semibold">Could not read {suggestions.filename ?? 'the CV'}</p>
            <p className="leading-relaxed">{suggestions.parseError}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={onScan}
              disabled={blocked}
              className="mt-1"
            >
              {scanning ? (
                <Loader2 className="mr-1.5 size-3 animate-spin" aria-hidden />
              ) : (
                <ScanLine className="mr-1.5 size-3" aria-hidden />
              )}
              Try again
            </Button>
          </div>
        ) : tab === 'skills' ? (
          <div className="space-y-2">
            {suggestions.skills.catalogHits.length === 0 &&
            suggestions.skills.customCandidates.length === 0 ? (
              <p className="italic text-muted-foreground">No skills extracted.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {suggestions.skills.catalogHits.map((h) => {
                  const active = picked.skillIds.has(h.id);
                  return (
                    <button
                      key={`sk-${h.id}`}
                      type="button"
                      onClick={() => toggle('skillIds', h.id)}
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                        active
                          ? 'border-sky-400 bg-sky-100 text-sky-800'
                          : 'border-border bg-background text-foreground hover:bg-muted',
                      )}
                    >
                      {h.name}
                    </button>
                  );
                })}
                {suggestions.skills.customCandidates.map((c) => {
                  const active = picked.customSkills.has(c.phrase);
                  return (
                    <button
                      key={`csk-${c.phrase}`}
                      type="button"
                      onClick={() => toggle('customSkills', c.phrase)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] transition-colors',
                        active
                          ? 'border-sky-400 bg-sky-100 text-sky-800'
                          : 'border-border/70 bg-background text-muted-foreground hover:bg-muted',
                      )}
                    >
                      <Plus className="size-2.5" aria-hidden />
                      {c.phrase}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : tab === 'qualifications' ? (
          <div className="space-y-2">
            {suggestions.qualifications.catalogHits.length === 0 &&
            suggestions.qualifications.customCandidates.length === 0 ? (
              <p className="italic text-muted-foreground">No qualifications extracted.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {suggestions.qualifications.catalogHits.map((h) => {
                  const active = picked.qualificationIds.has(h.id);
                  return (
                    <button
                      key={`q-${h.id}`}
                      type="button"
                      onClick={() => toggle('qualificationIds', h.id)}
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                        active
                          ? 'border-amber-400 bg-amber-100 text-amber-800'
                          : 'border-border bg-background text-foreground hover:bg-muted',
                      )}
                    >
                      {h.name}
                    </button>
                  );
                })}
                {suggestions.qualifications.customCandidates.map((c) => {
                  const active = picked.customQualifications.has(c.phrase);
                  return (
                    <button
                      key={`cq-${c.phrase}`}
                      type="button"
                      onClick={() => toggle('customQualifications', c.phrase)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] transition-colors',
                        active
                          ? 'border-amber-400 bg-amber-100 text-amber-800'
                          : 'border-border/70 bg-background text-muted-foreground hover:bg-muted',
                      )}
                    >
                      <Plus className="size-2.5" aria-hidden />
                      {c.phrase}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : tab === 'work' ? (
          <div className="space-y-2">
            {suggestions.employment.candidates.length === 0 ? (
              <p className="italic text-muted-foreground">No employment history extracted.</p>
            ) : (
              <>
                <p className="text-[11px] text-muted-foreground">
                  Tick the roles to add, then Save to profile.
                </p>
                {suggestions.employment.candidates.map((c) => {
                  const active = picked.employmentKeys.has(c.key);
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => toggle('employmentKeys', c.key)}
                      aria-pressed={active}
                      className={cn(
                        'flex w-full items-start gap-2 rounded-md border p-2 text-left text-[11px] transition-colors',
                        active
                          ? 'border-sky-400 bg-sky-50'
                          : 'border-border bg-background hover:bg-muted/40',
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'mt-0.5 grid size-3.5 shrink-0 place-items-center rounded-sm border',
                          active
                            ? 'border-sky-500 bg-sky-500 text-white'
                            : 'border-border bg-background',
                        )}
                      >
                        {active && <CheckCircle2 className="size-2.5" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium text-foreground">
                          {c.jobTitle ?? 'Role'}
                        </span>
                        {c.employerName && (
                          <span className="block text-muted-foreground">{c.employerName}</span>
                        )}
                        {(c.startDate || c.endDate || c.isCurrent) && (
                          <span className="block text-muted-foreground">
                            {c.startDate?.slice(0, 4) ?? '?'} –{' '}
                            {c.isCurrent ? 'Present' : (c.endDate?.slice(0, 4) ?? '?')}
                          </span>
                        )}
                        {c.description && (
                          <span className="block truncate text-muted-foreground/80">
                            {c.description}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        ) : null}

        {!empty && (
          <>
            {saveErrors.length > 0 && (
              <div
                className="space-y-1 rounded-md border border-amber-400/40 bg-amber-50 p-2.5 text-[11px] text-amber-900 dark:bg-amber-900/30 dark:text-amber-100"
                role="alert"
              >
                <p className="font-semibold">Some items could not be saved:</p>
                <ul className="list-disc pl-4">
                  {saveErrors.slice(0, 6).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex items-center justify-between gap-2 border-t pt-2">
              <p className="text-[11px] text-muted-foreground">
                Nothing is written to the profile until you save your ticked selections.
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={onSaved} disabled={saving}>
                  Discard
                </Button>
                <Button size="sm" onClick={save} disabled={saving || pickedCount === 0}>
                  {saving ? (
                    <Loader2 className="mr-1.5 size-3 animate-spin" aria-hidden />
                  ) : (
                    <CheckCircle2 className="mr-1.5 size-3" aria-hidden />
                  )}
                  Save to profile
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function DocRowMenu({
  doc,
  documentTypes,
  onRefresh,
}: {
  doc: DocumentInstance;
  documentTypes: DocumentTypeLite[];
  /** Parent's tracked refresh, so the scan buttons wait for it. */
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'menu' | 'retype' | 'expiry'>('menu');
  const [expiry, setExpiry] = useState<string>(doc.expiresOn ?? '');
  const [pending, start] = useTransition();

  const close = () => {
    setOpen(false);
    setMode('menu');
  };

  const voidDoc = () => {
    const reason = window.prompt('Reason for deleting this document (audited):');
    if (!reason || reason.trim().length < 3) {
      toast.error('Reason must be at least 3 characters');
      return;
    }
    start(async () => {
      const r = await voidDocumentAction({ documentInstanceId: doc.id, reason: reason.trim() });
      if (r.ok) {
        toast.success('Document deleted');
        close();
        onRefresh();
      } else {
        toast.error(r.error.message);
      }
    });
  };

  // Wave 2.4 — set/clear the document's expiry date. Audited server-side.
  const saveExpiry = (value: string) => {
    start(async () => {
      const r = await setDocumentExpiryAction({ documentInstanceId: doc.id, expiresOn: value });
      if (r.ok) {
        toast.success(value ? 'Expiry date saved' : 'Expiry date cleared');
        close();
        onRefresh();
      } else {
        toast.error(r.error.message);
      }
    });
  };

  // "Change type" — fixes a mis-filed document in place. Audited server-side.
  const retype = (documentTypeId: string) => {
    if (documentTypeId === doc.documentTypeId) {
      close();
      return;
    }
    start(async () => {
      const r = await reclassifyDocumentAction({ documentInstanceId: doc.id, documentTypeId });
      if (r.ok) {
        toast.success('Document type updated');
        close();
        onRefresh();
      } else {
        toast.error(r.error.message);
      }
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-7 items-center justify-center rounded-md border px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="More actions"
      >
        <MoreHorizontal className="size-3.5" aria-hidden />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden
            onClick={close}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md border bg-popover p-1 text-xs shadow-lg ring-1 ring-black/5">
            {mode === 'menu' ? (
              <>
                <button
                  type="button"
                  onClick={() => setMode('retype')}
                  disabled={pending}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-foreground hover:bg-muted"
                >
                  <FileText className="size-3" aria-hidden /> Change type
                </button>
                <button
                  type="button"
                  onClick={() => setMode('expiry')}
                  disabled={pending}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-foreground hover:bg-muted"
                >
                  <CalendarDays className="size-3" aria-hidden /> Set expiry…
                </button>
                <button
                  type="button"
                  onClick={voidDoc}
                  disabled={pending}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="size-3" aria-hidden /> Delete
                </button>
              </>
            ) : mode === 'expiry' ? (
              <div className="space-y-1.5 p-1.5">
                <p className="font-medium text-foreground">Expiry date</p>
                <input
                  type="date"
                  value={expiry}
                  disabled={pending}
                  onChange={(e) => setExpiry(e.currentTarget.value)}
                  className="w-full rounded-md border px-2 py-1"
                />
                <div className="flex items-center justify-end gap-1.5 pt-0.5">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => saveExpiry('')}
                    className="rounded px-2 py-1 text-muted-foreground hover:bg-muted"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => saveExpiry(expiry)}
                    className="rounded bg-primary px-2 py-1 text-primary-foreground"
                  >
                    {pending ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5 p-1.5">
                <p className="font-medium text-foreground">Change document type</p>
                <DocumentTypePicker
                  options={documentTypes}
                  value={doc.documentTypeId}
                  disabled={pending}
                  onChange={retype}
                  onOptionsChanged={(created: DocumentTypeOption) => retype(created.id)}
                />
                {pending && (
                  <p className="flex items-center gap-1.5 text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" aria-hidden /> Saving…
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────── */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mimeToTone(mime: string): string {
  if (mime.includes('pdf')) return 'bg-rose-100 text-rose-700';
  if (mime.includes('image')) return 'bg-emerald-100 text-emerald-700';
  if (mime.includes('word') || mime.includes('doc')) return 'bg-sky-100 text-sky-700';
  return 'bg-slate-100 text-slate-700';
}

/* ChevronDown re-exported to silence unused-import lint when the file is
   first scaffolded with placeholders. */
export const _ChevronDown = ChevronDown;
export const _UploadCloud = UploadCloud;
