'use client';

import { format, formatDistanceToNow } from 'date-fns';
import {
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileStack,
  FileText,
  Link2,
  Paperclip,
  Plus,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { type DocumentTypeOption, DocumentTypePicker } from '@/components/document-type-picker';
import { DocumentUploader } from '@/components/document-uploader';
import { FOCUS_RING } from '@/components/ds/segmented';
import { DsEnumPill, DsStatusPill, enumLabel } from '@/components/ds/status-pill';
import { DS_ROW, DS_ROW_LIST, SectionCard } from '@/components/ds/workspace';
import { EmptyState } from '@/components/empty-state';
import { MultiDocumentUploader } from '@/components/multi-document-uploader';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import type { DocumentInstance } from '@/lib/db/schema/documents';
import type { DocumentType } from '@/lib/db/schema/reference';
import { cn } from '@/lib/utils';
import {
  addCaseDocumentRequirementAction,
  attachCaseDocumentAction,
  detachCaseDocumentAction,
  removeCaseDocumentRequirementAction,
  updateCaseDocumentRequirementAction,
} from '@/modules/immigration/actions';
import type { CaseDocumentRequirementRow, CaseDocumentRow } from '@/modules/immigration/service';

// ─── Add requirement dialog ───────────────────────────────────────────────────

function AddRequirementDialog({
  caseId,
  documentTypes,
  existing,
}: {
  caseId: string;
  documentTypes: DocumentType[];
  existing: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const [typeId, setTypeId] = useState('');
  const [localTypes, setLocalTypes] = useState<DocumentTypeOption[]>(() =>
    documentTypes
      .filter((t) => t.isActive && !existing.has(t.id))
      .map((t) => ({ id: t.id, code: t.code, name: t.name, hasExpiry: t.hasExpiry })),
  );
  const [isMandatory, setIsMandatory] = useState<'MANDATORY' | 'OPTIONAL'>('MANDATORY');
  const [notes, setNotes] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const submit = () => {
    startTransition(async () => {
      const r = await addCaseDocumentRequirementAction({
        immigrationCaseId: caseId,
        documentTypeId: typeId,
        isMandatory,
        notes,
      });
      if (r.ok) {
        toast.success('Requirement added');
        setOpen(false);
        setTypeId('');
        setNotes('');
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <Plus className="mr-1 size-3.5" aria-hidden /> Add requirement
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add document requirement</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="type">Document type</Label>
            <DocumentTypePicker
              inputId="type"
              options={localTypes}
              value={typeId}
              onChange={setTypeId}
              onOptionsChanged={(created) => {
                setLocalTypes((prev) => [...prev, created]);
              }}
              placeholder="Select type — or add new…"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mand">Mandatory level</Label>
            <Select
              id="mand"
              value={isMandatory}
              onChange={(e) => setIsMandatory(e.target.value as 'MANDATORY' | 'OPTIONAL')}
            >
              <option value="MANDATORY">Mandatory</option>
              <option value="OPTIONAL">Optional</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rnotes">Notes</Label>
            <Input id="rnotes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !typeId}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Attach existing doc dialog ───────────────────────────────────────────────

function AttachDocDialog({
  caseId,
  requirementId,
  requirementName,
  beneficiaryDocuments,
  alreadyAttachedIds,
}: {
  caseId: string;
  requirementId?: string;
  /** Names the trigger so each row's button is distinguishable. */
  requirementName?: string;
  beneficiaryDocuments: DocumentInstance[];
  alreadyAttachedIds: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const [docId, setDocId] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const available = beneficiaryDocuments.filter((d) => !alreadyAttachedIds.has(d.id));

  const submit = () => {
    startTransition(async () => {
      const r = await attachCaseDocumentAction({
        immigrationCaseId: caseId,
        documentInstanceId: docId,
        caseRequirementId: requirementId,
      });
      if (r.ok) {
        toast.success('Document attached');
        setOpen(false);
        setDocId('');
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            aria-label={
              requirementName ? `Attach existing document for ${requirementName}` : undefined
            }
          >
            <Paperclip className="mr-1 size-3.5" aria-hidden /> Attach existing
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {requirementName
              ? `Attach an existing document for ${requirementName}`
              : 'Attach an existing document'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Pick from documents already uploaded on the beneficiary's profile — e.g. their passport
            reused across cases.
          </p>
          <div className="space-y-1">
            <Label htmlFor="doc">Document</Label>
            <Select id="doc" value={docId} onChange={(e) => setDocId(e.target.value)}>
              <option value="">Select…</option>
              {available.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.originalFilename} (v{d.version}, {enumLabel(d.status).toLowerCase()})
                </option>
              ))}
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !docId}>
            Attach
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main section ─────────────────────────────────────────────────────────────

export function CaseDocumentsSection({
  caseId,
  beneficiaryPersonId,
  requirements,
  attachedDocs,
  documentTypes,
  beneficiaryDocuments,
}: {
  caseId: string;
  beneficiaryPersonId: string;
  requirements: CaseDocumentRequirementRow[];
  attachedDocs: CaseDocumentRow[];
  documentTypes: DocumentType[];
  beneficiaryDocuments: DocumentInstance[];
}) {
  const [, startTransition] = useTransition();
  const router = useRouter();
  const attachedIds = new Set(attachedDocs.map((d) => d.documentInstanceId));
  const existingReqTypeIds = new Set(requirements.map((r) => r.documentTypeId));
  // Beneficiary docs that haven't yet been attached to this case — the
  // primary quick-attach surface (spec §7 stage 2: reuse candidate-side
  // documents instead of forcing a re-upload).
  const reusableDocs = beneficiaryDocuments.filter((d) => !attachedIds.has(d.id));

  const setStatus = (requirementId: string, status: CaseDocumentRequirementRow['status']) => {
    startTransition(async () => {
      const r = await updateCaseDocumentRequirementAction(
        { requirementId, status, notes: '' },
        caseId,
      );
      if (r.ok) {
        toast.success('Status updated');
        router.refresh();
      } else toast.error(r.error.message);
    });
  };

  const removeReq = (requirementId: string) => {
    if (!confirm('Remove this requirement from the case?')) return;
    startTransition(async () => {
      const r = await removeCaseDocumentRequirementAction({ requirementId }, caseId);
      if (r.ok) {
        toast.success('Requirement removed');
        router.refresh();
      } else toast.error(r.error.message);
    });
  };

  const detachDoc = (documentInstanceId: string) => {
    startTransition(async () => {
      const r = await detachCaseDocumentAction({
        immigrationCaseId: caseId,
        documentInstanceId,
      });
      if (r.ok) {
        toast.success('Document detached');
        router.refresh();
      } else toast.error(r.error.message);
    });
  };

  // Both the per-requirement uploader and the bulk uploader route through
  // this so a freshly-uploaded document is auto-linked to the case — the
  // spec's Document Collection stage should feel like one click, not two.
  const attachAfterUpload = (doc: DocumentInstance, requirementId?: string) => {
    startTransition(async () => {
      const r = await attachCaseDocumentAction({
        immigrationCaseId: caseId,
        documentInstanceId: doc.id,
        caseRequirementId: requirementId,
      });
      if (!r.ok) toast.error(r.error.message);
    });
  };

  const attachExisting = (documentInstanceId: string, requirementId?: string) => {
    startTransition(async () => {
      const r = await attachCaseDocumentAction({
        immigrationCaseId: caseId,
        documentInstanceId,
        caseRequirementId: requirementId,
      });
      if (r.ok) {
        toast.success('Attached to case');
        router.refresh();
      } else toast.error(r.error.message);
    });
  };

  const bulkDocumentTypes: DocumentTypeOption[] = documentTypes
    .filter((t) => t.isActive)
    .map((t) => ({ id: t.id, code: t.code, name: t.name, hasExpiry: t.hasExpiry }));

  const ago = (at: Date | string) => {
    const d = new Date(at);
    return (
      <time dateTime={d.toISOString()} className="tabular-nums">
        {formatDistanceToNow(d, { addSuffix: true })} · {format(d, 'd MMM yyyy · HH:mm')}
      </time>
    );
  };

  return (
    <div className="space-y-5">
      <SectionCard
        icon={ClipboardCheck}
        title="Case documents"
        count={requirements.length}
        description="Track which documents this case requires and which have been supplied. Passports and other reusable documents can be attached from the beneficiary's profile."
        action={
          <AddRequirementDialog
            caseId={caseId}
            documentTypes={documentTypes}
            existing={existingReqTypeIds}
          />
        }
        testId="case-requirements"
      >
        {requirements.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title="No requirements yet"
            description="Add the documents this case needs — passport, medical, police clearance, etc."
          />
        ) : (
          <ul className={DS_ROW_LIST} aria-label="Requirements checklist">
            {requirements.map((req) => (
              <li key={req.id} className={DS_ROW} data-testid={`requirement-${req.id}`}>
                <div className="min-w-0 basis-full sm:basis-48 sm:flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                    <span className="[overflow-wrap:anywhere]">{req.documentTypeName}</span>
                    <DsEnumPill status={req.status} />
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    <span className="font-mono">{req.documentTypeCode}</span>
                    {req.isMandatory === 'OPTIONAL' ? ' · Optional' : ' · Mandatory'}
                    {req.hasExpiry ? ' · Expiry tracked' : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={req.status}
                    onChange={(e) =>
                      setStatus(req.id, e.target.value as CaseDocumentRequirementRow['status'])
                    }
                    className={cn('h-8 w-auto px-2 text-xs', FOCUS_RING)}
                    aria-label={`Status for ${req.documentTypeName}`}
                  >
                    <option value="MISSING">Missing</option>
                    <option value="PROVIDED">Provided</option>
                    <option value="ACCEPTED">Accepted</option>
                    <option value="REJECTED">Rejected</option>
                  </Select>
                  <DocumentUploader
                    ownerType="PERSON"
                    ownerId={beneficiaryPersonId}
                    documentTypeId={req.documentTypeId}
                    onUploaded={(doc) => attachAfterUpload(doc, req.id)}
                  />
                  <AttachDocDialog
                    caseId={caseId}
                    requirementId={req.id}
                    requirementName={req.documentTypeName}
                    beneficiaryDocuments={beneficiaryDocuments}
                    alreadyAttachedIds={attachedIds}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeReq(req.id)}
                    aria-label={`Remove requirement ${req.documentTypeName}`}
                    title="Remove requirement"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        icon={FileStack}
        title="Reusable from candidate profile"
        count={reusableDocs.length}
        description={
          <>
            Documents already uploaded on{' '}
            <Link
              href={`/clients/${beneficiaryPersonId}?tab=documents-candidate`}
              className={cn(
                'rounded-sm underline underline-offset-2 hover:text-foreground',
                FOCUS_RING,
              )}
            >
              the candidate’s profile
            </Link>{' '}
            that aren’t attached here yet. One click links them without a re-upload — the same
            passport can serve several cases.
          </>
        }
      >
        {reusableDocs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
            The candidate has no unattached documents. Upload below or from their profile.
          </p>
        ) : (
          <ul className={DS_ROW_LIST}>
            {reusableDocs.slice(0, 12).map((d) => {
              const name = d.displayName ?? d.originalFilename;
              return (
                <li key={d.id} className={DS_ROW}>
                  <div className="flex min-w-0 flex-1 basis-56 items-start gap-3">
                    <FileText
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="text-sm text-foreground [overflow-wrap:anywhere]">
                        {name}
                        <span className="ml-2 text-xs text-muted-foreground">v{d.version}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {enumLabel(d.status)} · uploaded {ago(d.createdAt)}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => attachExisting(d.id)}
                    aria-label={`Attach ${name} to this case`}
                  >
                    <Link2 className="mr-1 size-3.5" aria-hidden /> Attach
                  </Button>
                </li>
              );
            })}
            {reusableDocs.length > 12 && (
              <li className="px-4 py-2.5 text-xs text-muted-foreground">
                Showing 12 of {reusableDocs.length}. See{' '}
                <Link
                  href={`/clients/${beneficiaryPersonId}?tab=documents-candidate`}
                  className={cn(
                    'rounded-sm underline underline-offset-2 hover:text-foreground',
                    FOCUS_RING,
                  )}
                  data-testid="reusable-full-list-link"
                >
                  the candidate’s profile
                </Link>{' '}
                for the full list.
              </li>
            )}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        icon={UploadCloud}
        title="Bulk upload to this case"
        description="Drop several files at once. Each file gets its own document type and display name. Files are stored on the candidate’s profile (so they can be reused) and linked to this case automatically."
      >
        <MultiDocumentUploader
          ownerType="PERSON"
          ownerId={beneficiaryPersonId}
          documentTypes={bulkDocumentTypes}
          onUploaded={(doc) => attachAfterUpload(doc)}
        />
      </SectionCard>

      <SectionCard icon={Paperclip} title="Attached documents" count={attachedDocs.length}>
        {attachedDocs.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No documents attached yet"
            description="Upload against a requirement above, or attach an existing document from the beneficiary's profile."
          />
        ) : (
          <ul className={DS_ROW_LIST}>
            {attachedDocs.map((d) => (
              <li key={d.documentInstanceId} className={DS_ROW}>
                <div className="flex min-w-0 flex-1 basis-56 items-start gap-3">
                  <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground [overflow-wrap:anywhere]">
                      {d.document.originalFilename}
                    </p>
                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {d.documentType.name} · v{d.document.version} · {enumLabel(d.document.status)}{' '}
                      · attached {ago(d.attachedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {d.caseRequirementId && (
                    <DsStatusPill tone="green" className="gap-1">
                      <CheckCircle2 className="size-3" aria-hidden /> Linked
                    </DsStatusPill>
                  )}
                  <Link
                    href={`/api/documents/${d.documentInstanceId}/download`}
                    prefetch={false}
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  >
                    <Download className="size-3.5" aria-hidden />
                    <span className="sr-only">Download {d.document.originalFilename}</span>
                  </Link>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => detachDoc(d.documentInstanceId)}
                    aria-label={`Detach ${d.document.originalFilename} from case`}
                    title="Detach from case (the file stays on the candidate's profile)"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
