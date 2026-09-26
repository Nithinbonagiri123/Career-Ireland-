'use client';

import { format, formatDistanceToNow } from 'date-fns';
import {
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  Link2,
  Paperclip,
  Plus,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { type DocumentTypeOption, DocumentTypePicker } from '@/components/document-type-picker';
import { DocumentUploader } from '@/components/document-uploader';
import { EmptyState } from '@/components/empty-state';
import { MultiDocumentUploader } from '@/components/multi-document-uploader';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { statusTone } from '@/lib/ui/status-tone';
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
            <Plus className="mr-1 size-3.5" /> Add requirement
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
  beneficiaryDocuments,
  alreadyAttachedIds,
}: {
  caseId: string;
  requirementId?: string;
  beneficiaryDocuments: DocumentInstance[];
  alreadyAttachedIds: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const [docId, setDocId] = useState('');
  const [pending, startTransition] = useTransition();

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
      } else {
        toast.error(r.error.message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="ghost">
            <Paperclip className="mr-1 size-3.5" /> Attach existing
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attach an existing document</DialogTitle>
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
                  {d.originalFilename} (v{d.version}, {d.status.toLowerCase()})
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
      if (r.ok) toast.success('Status updated');
      else toast.error(r.error.message);
    });
  };

  const removeReq = (requirementId: string) => {
    if (!confirm('Remove this requirement from the case?')) return;
    startTransition(async () => {
      const r = await removeCaseDocumentRequirementAction({ requirementId }, caseId);
      if (r.ok) toast.success('Requirement removed');
      else toast.error(r.error.message);
    });
  };

  const detachDoc = (documentInstanceId: string) => {
    startTransition(async () => {
      const r = await detachCaseDocumentAction({
        immigrationCaseId: caseId,
        documentInstanceId,
      });
      if (r.ok) toast.success('Document detached');
      else toast.error(r.error.message);
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
      if (r.ok) toast.success('Attached to case');
      else toast.error(r.error.message);
    });
  };

  const bulkDocumentTypes: DocumentTypeOption[] = documentTypes
    .filter((t) => t.isActive)
    .map((t) => ({ id: t.id, code: t.code, name: t.name, hasExpiry: t.hasExpiry }));

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="size-4" /> Case documents
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Track which documents this case requires and which have been supplied. Passport and
            other reusable docs can be attached from the beneficiary's profile.
          </p>
        </div>
        <AddRequirementDialog
          caseId={caseId}
          documentTypes={documentTypes}
          existing={existingReqTypeIds}
        />
      </CardHeader>
      <CardContent className="space-y-8">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Requirements checklist
            </h3>
            <Badge variant="secondary" className="rounded-full">
              {requirements.length}
            </Badge>
          </div>
          {requirements.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="No requirements yet"
              description="Add the documents this case needs — passport, medical, police clearance, etc."
            />
          ) : (
            <ul className="divide-y rounded-lg glass-panel">
              {requirements.map((req) => (
                <li key={req.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{req.documentTypeName}</p>
                    <p className="text-[10px] font-mono text-muted-foreground">
                      {req.documentTypeCode}
                      {req.hasExpiry ? ' · expiry tracked' : ''}
                      {req.isMandatory === 'OPTIONAL' ? ' · optional' : ''}
                    </p>
                  </div>
                  <Select
                    value={req.status}
                    onChange={(e) =>
                      setStatus(req.id, e.target.value as CaseDocumentRequirementRow['status'])
                    }
                    className="w-auto px-2 text-xs"
                    aria-label="Requirement status"
                  >
                    <option value="MISSING">MISSING</option>
                    <option value="PROVIDED">PROVIDED</option>
                    <option value="ACCEPTED">ACCEPTED</option>
                    <option value="REJECTED">REJECTED</option>
                  </Select>
                  <Badge variant={statusTone(req.status)} className="rounded-full">
                    {req.status}
                  </Badge>
                  <DocumentUploader
                    ownerType="PERSON"
                    ownerId={beneficiaryPersonId}
                    documentTypeId={req.documentTypeId}
                    onUploaded={(doc) => attachAfterUpload(doc, req.id)}
                  />
                  <AttachDocDialog
                    caseId={caseId}
                    requirementId={req.id}
                    beneficiaryDocuments={beneficiaryDocuments}
                    alreadyAttachedIds={attachedIds}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeReq(req.id)}
                    aria-label="Remove requirement"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Reusable from candidate profile
            </h3>
            <Badge variant="secondary" className="rounded-full">
              {reusableDocs.length}
            </Badge>
          </div>
          <p className="mb-3 text-[11px] text-muted-foreground">
            Documents already uploaded on{' '}
            <Link
              href={`/candidates/${beneficiaryPersonId}?tab=documents`}
              className="underline hover:text-foreground"
            >
              the candidate’s profile
            </Link>{' '}
            that aren’t yet attached here. One click links them without a re-upload — the same
            passport can serve multiple cases.
          </p>
          {reusableDocs.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              The candidate has no unattached documents. Upload below or from their profile.
            </p>
          ) : (
            <ul className="divide-y rounded-lg glass-panel">
              {reusableDocs.slice(0, 12).map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {d.displayName ?? d.originalFilename}
                      <span className="ml-2 text-[10px] text-muted-foreground">v{d.version}</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {d.status.toLowerCase()} · uploaded{' '}
                      {formatDistanceToNow(d.createdAt, { addSuffix: true })}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => attachExisting(d.id)}>
                    <Link2 className="mr-1 size-3.5" /> Attach
                  </Button>
                </li>
              ))}
              {reusableDocs.length > 12 && (
                <li className="px-4 py-2 text-[11px] text-muted-foreground">
                  Showing 12 of {reusableDocs.length}. Use{' '}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      /* room for a "show all" modal later; keeping the list capped avoids
                         a runaway tab render when a candidate has hundreds of docs */
                    }}
                  >
                    the candidate’s profile
                  </button>{' '}
                  for the full list.
                </li>
              )}
            </ul>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <UploadCloud className="size-3.5" /> Bulk upload to this case
            </h3>
          </div>
          <p className="mb-3 text-[11px] text-muted-foreground">
            Drop multiple files at once. Each file gets its own document type + display name. Files
            are stored on the candidate’s profile (so they can be reused elsewhere) and auto-linked
            to this case.
          </p>
          <MultiDocumentUploader
            ownerType="PERSON"
            ownerId={beneficiaryPersonId}
            documentTypes={bulkDocumentTypes}
            onUploaded={(doc) => attachAfterUpload(doc)}
          />
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Attached documents
            </h3>
            <Badge variant="secondary" className="rounded-full">
              {attachedDocs.length}
            </Badge>
          </div>
          {attachedDocs.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No documents attached yet"
              description="Upload against a requirement above, or attach an existing document from the beneficiary's profile."
            />
          ) : (
            <ul className="divide-y rounded-lg glass-panel">
              {attachedDocs.map((d) => (
                <li key={d.documentInstanceId} className="flex items-center gap-3 px-4 py-3">
                  <FileText className="size-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.document.originalFilename}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {d.documentType.name} · v{d.document.version} ·{' '}
                      {d.document.status.toLowerCase()} · attached{' '}
                      <time dateTime={d.attachedAt.toISOString()} className="tabular-nums">
                        {formatDistanceToNow(d.attachedAt, { addSuffix: true })} ·{' '}
                        {format(d.attachedAt, 'dd MMM yyyy · HH:mm')}
                      </time>
                    </p>
                  </div>
                  {d.caseRequirementId && (
                    <Badge variant="secondary" className="rounded-full">
                      <CheckCircle2 className="mr-1 size-3" /> Linked
                    </Badge>
                  )}
                  <Link
                    href={`/api/documents/${d.documentInstanceId}/download`}
                    prefetch={false}
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  >
                    <Download className="size-3.5" />
                    <span className="sr-only">Download</span>
                  </Link>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => detachDoc(d.documentInstanceId)}
                    aria-label="Detach document from case"
                    title="Detach from case (the file stays on the candidate's profile)"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
